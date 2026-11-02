'use strict';
// CPU raytracer worker: BVH over boxes, spheres and triangles, with ambient
// occlusion, hard shadows, Phong shading, reflection, alpha and depth of field.
let S = null;

function vecSetting(v, n) {
  if (v === undefined) return null;
  const a = String(v).replace(/[\[\]]/g, ' ').trim().split(/[\s,]+/).map(Number);
  return a.length === n && a.every(isFinite) ? a : null;
}

function buildScene(msg) {
  const { boxes, spheres, cylinders, grids, lines, dots, tris } = msg;
  const nb = boxes.length / 17, ns = spheres.length / 17, nc = cylinders.length / 17, nt = tris.length / 14;
  const ng = grids.length / 17, nl = lines.length / 10, nd = dots.length / 7;
  const cap = nb + ns + nc + nt + ng * 12 + nl + nd;
  const type = new Uint8Array(cap), inv = new Float64Array(cap * 12), tri = new Float64Array(cap * 9 * (nt ? 1 : 0));
  const color = new Float32Array(cap * 4), cls = new Uint8Array(cap);
  const lo = new Float32Array(cap * 3), hi = new Float32Array(cap * 3);
  let n = 0;
  function addAffine(a, o, t) {
    const m00 = a[o], m10 = a[o + 1], m20 = a[o + 2], m01 = a[o + 3], m11 = a[o + 4], m21 = a[o + 5], m02 = a[o + 6], m12 = a[o + 7], m22 = a[o + 8], tx = a[o + 9], ty = a[o + 10], tz = a[o + 11];
    const c00 = m11 * m22 - m12 * m21, c01 = m02 * m21 - m01 * m22, c02 = m01 * m12 - m02 * m11;
    const det = m00 * c00 + m10 * c01 + m20 * c02;
    if (Math.abs(det) < 1e-18) return;
    const id = 1 / det;
    const i00 = c00 * id, i01 = c01 * id, i02 = c02 * id;
    const i10 = (m12 * m20 - m10 * m22) * id, i11 = (m00 * m22 - m02 * m20) * id, i12 = (m02 * m10 - m00 * m12) * id;
    const i20 = (m10 * m21 - m11 * m20) * id, i21 = (m01 * m20 - m00 * m21) * id, i22 = (m00 * m11 - m01 * m10) * id;
    const p = n++, q = p * 12;
    type[p] = t;
    inv[q] = i00; inv[q + 1] = i01; inv[q + 2] = i02; inv[q + 3] = -(i00 * tx + i01 * ty + i02 * tz);
    inv[q + 4] = i10; inv[q + 5] = i11; inv[q + 6] = i12; inv[q + 7] = -(i10 * tx + i11 * ty + i12 * tz);
    inv[q + 8] = i20; inv[q + 9] = i21; inv[q + 10] = i22; inv[q + 11] = -(i20 * tx + i21 * ty + i22 * tz);
    color[p * 4] = a[o + 12]; color[p * 4 + 1] = a[o + 13]; color[p * 4 + 2] = a[o + 14]; color[p * 4 + 3] = a[o + 15];
    cls[p] = a[o + 16];
    let lx = Infinity, ly = Infinity, lz = Infinity, hx = -Infinity, hy = -Infinity, hz = -Infinity;
    for (let i = 0; i < 8; i++) {
      const u = i & 1, v = (i >> 1) & 1, w = (i >> 2) & 1;
      const x = m00 * u + m01 * v + m02 * w + tx, y = m10 * u + m11 * v + m12 * w + ty, z = m20 * u + m21 * v + m22 * w + tz;
      if (x < lx) lx = x; if (y < ly) ly = y; if (z < lz) lz = z;
      if (x > hx) hx = x; if (y > hy) hy = y; if (z > hz) hz = z;
    }
    lo[p * 3] = lx; lo[p * 3 + 1] = ly; lo[p * 3 + 2] = lz;
    hi[p * 3] = hx; hi[p * 3 + 1] = hy; hi[p * 3 + 2] = hz;
  }
  for (let i = 0; i < nb; i++) addAffine(boxes, i * 17, 0);
  for (let i = 0; i < ns; i++) addAffine(spheres, i * 17, 1);
  for (let i = 0; i < nc; i++) addAffine(cylinders, i * 17, 3);

  // Grids, lines and dots have no thickness of their own, so each becomes thin
  // geometry sized to the pixel at its distance, matching the live view.
  const lineCam = msg.camera;
  const worldPerPixel = (x, y, z) => Math.hypot(x - lineCam.pos[0], y - lineCam.pos[1], z - lineCam.pos[2]) * 2 * Math.tan(lineCam.fov * Math.PI / 360) / msg.height;
  const rec = new Float64Array(17);
  function addRod(x0, y0, z0, x1, y1, z1, r, g, b, a, cid) {
    const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0, len = Math.hypot(ux, uy, uz);
    if (len < 1e-9) return;
    const d = 1.5 * worldPerPixel((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    // Two directions at right angles to the rod set its diameter.
    let vx = -uy, vy = ux, vz = 0;
    if (Math.abs(uz) > 0.9 * len) { vx = 0; vy = -uz; vz = uy; }
    const vl = Math.hypot(vx, vy, vz);
    vx *= d / vl; vy *= d / vl; vz *= d / vl;
    let wx = uy * vz - uz * vy, wy = uz * vx - ux * vz, wz = ux * vy - uy * vx;
    wx *= d / (len * d); wy *= d / (len * d); wz *= d / (len * d);
    rec[0] = ux; rec[1] = uy; rec[2] = uz;
    rec[3] = vx; rec[4] = vy; rec[5] = vz;
    rec[6] = wx; rec[7] = wy; rec[8] = wz;
    rec[9] = x0 - 0.5 * (vx + wx); rec[10] = y0 - 0.5 * (vy + wy); rec[11] = z0 - 0.5 * (vz + wz);
    rec[12] = r; rec[13] = g; rec[14] = b; rec[15] = a; rec[16] = cid;
    addAffine(rec, 0, 3);
  }
  const GRID_EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let i = 0; i < ng; i++) {
    const o = i * 17, m = grids;
    const px = c => m[o] * (c & 1) + m[o + 3] * ((c >> 1) & 1) + m[o + 6] * ((c >> 2) & 1) + m[o + 9];
    const py = c => m[o + 1] * (c & 1) + m[o + 4] * ((c >> 1) & 1) + m[o + 7] * ((c >> 2) & 1) + m[o + 10];
    const pz = c => m[o + 2] * (c & 1) + m[o + 5] * ((c >> 1) & 1) + m[o + 8] * ((c >> 2) & 1) + m[o + 11];
    for (const [a, b] of GRID_EDGES) addRod(px(a), py(a), pz(a), px(b), py(b), pz(b), m[o + 12], m[o + 13], m[o + 14], m[o + 15], m[o + 16]);
  }
  for (let i = 0; i < nl; i++) {
    const o = i * 10;
    addRod(lines[o], lines[o + 1], lines[o + 2], lines[o + 3], lines[o + 4], lines[o + 5], lines[o + 6], lines[o + 7], lines[o + 8], lines[o + 9], 0);
  }
  for (let i = 0; i < nd; i++) {
    const o = i * 7, x = dots[o], y = dots[o + 1], z = dots[o + 2];
    const d = 3 * worldPerPixel(x, y, z);
    rec.fill(0);
    rec[0] = d; rec[4] = d; rec[8] = d;
    rec[9] = x - d / 2; rec[10] = y - d / 2; rec[11] = z - d / 2;
    rec[12] = dots[o + 3]; rec[13] = dots[o + 4]; rec[14] = dots[o + 5]; rec[15] = dots[o + 6];
    addAffine(rec, 0, 1);
  }
  for (let i = 0; i < nt; i++) {
    const o = i * 14, p = n++, q = p * 9;
    type[p] = 2;
    for (let k = 0; k < 9; k++) tri[q + k] = tris[o + k];
    color[p * 4] = tris[o + 9]; color[p * 4 + 1] = tris[o + 10]; color[p * 4 + 2] = tris[o + 11]; color[p * 4 + 3] = tris[o + 12];
    cls[p] = tris[o + 13];
    for (let a = 0; a < 3; a++) {
      lo[p * 3 + a] = Math.min(tris[o + a], tris[o + 3 + a], tris[o + 6 + a]);
      hi[p * 3 + a] = Math.max(tris[o + a], tris[o + 3 + a], tris[o + 6 + a]);
    }
  }

  // BVH with median splits on the longest centroid axis.
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  const cen = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) cen[i] = (lo[i] + hi[i]) / 2;
  const maxNodes = Math.max(2, n * 2);
  const nb6 = new Float32Array(maxNodes * 6), left = new Int32Array(maxNodes), count = new Int32Array(maxNodes);
  let nodes = 0;
  function select(a, b, k, axis) {
    while (b - a > 1) {
      const pv = cen[order[(a + b) >> 1] * 3 + axis];
      let i = a, j = b - 1;
      while (i <= j) {
        while (cen[order[i] * 3 + axis] < pv) i++;
        while (cen[order[j] * 3 + axis] > pv) j--;
        if (i <= j) { const t = order[i]; order[i] = order[j]; order[j] = t; i++; j--; }
      }
      if (k <= j) b = j + 1;
      else if (k >= i) a = i;
      else return;
    }
  }
  function node(a, b) {
    const id = nodes++;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    let c0 = Infinity, c1 = Infinity, c2 = Infinity, d0 = -Infinity, d1 = -Infinity, d2 = -Infinity;
    for (let i = a; i < b; i++) {
      const p = order[i] * 3;
      if (lo[p] < x0) x0 = lo[p]; if (lo[p + 1] < y0) y0 = lo[p + 1]; if (lo[p + 2] < z0) z0 = lo[p + 2];
      if (hi[p] > x1) x1 = hi[p]; if (hi[p + 1] > y1) y1 = hi[p + 1]; if (hi[p + 2] > z1) z1 = hi[p + 2];
      if (cen[p] < c0) c0 = cen[p]; if (cen[p + 1] < c1) c1 = cen[p + 1]; if (cen[p + 2] < c2) c2 = cen[p + 2];
      if (cen[p] > d0) d0 = cen[p]; if (cen[p + 1] > d1) d1 = cen[p + 1]; if (cen[p + 2] > d2) d2 = cen[p + 2];
    }
    const o = id * 6;
    nb6[o] = x0; nb6[o + 1] = y0; nb6[o + 2] = z0; nb6[o + 3] = x1; nb6[o + 4] = y1; nb6[o + 5] = z1;
    if (b - a <= 4) { left[id] = a; count[id] = b - a; return id; }
    const e0 = d0 - c0, e1 = d1 - c1, e2 = d2 - c2;
    const axis = e0 >= e1 && e0 >= e2 ? 0 : e1 >= e2 ? 1 : 2;
    const mid = (a + b) >> 1;
    select(a, b, mid, axis);
    node(a, mid);
    left[id] = node(mid, b);
    count[id] = 0;
    return id;
  }
  if (n) node(0, n);

  const rt = msg.raytracer || {};
  const b = msg.bounds;
  const diag = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) || 1;
  const cam = msg.camera;
  const fw = norm(sub(cam.target, cam.pos));
  const right = norm(cross(fw, cam.up));
  const up = cross(right, fw);
  const lightDir = norm([right[0] * 0.45 + up[0] * 0.8 - fw[0] * 0.55, right[1] * 0.45 + up[1] * 0.8 - fw[1] * 0.55, right[2] * 0.45 + up[2] * 0.8 - fw[2] * 0.55]);
  const phongBase = vecSetting(rt.phong, 3) || [0.6, 0.6, 0.2];
  const materials = msg.classes.map(c => {
    const p = c ? c + '::' : '';
    return {
      phong: (c && vecSetting(rt[p + 'phong'], 3)) || phongBase,
      refl: Number(rt[p + 'reflection'] === undefined ? rt.reflection : rt[p + 'reflection']) || 0,
    };
  });
  const tanH = Math.tan(cam.fov * Math.PI / 360);
  const dof = vecSetting(rt.dof, 2);
  const focusDist = Math.hypot(cam.target[0] - cam.pos[0], cam.target[1] - cam.pos[1], cam.target[2] - cam.pos[2]);

  S = {
    type, inv, tri, color, cls, order, nb6, left, count, n,
    materials, lightDir, diag,
    shadows: String(rt.shadows === undefined ? 'true' : rt.shadows).toLowerCase() !== 'false',
    aoSamples: Math.max(0, Math.round(Number(rt['ambient-occlusion-samples'] === undefined ? 1 : rt['ambient-occlusion-samples']) || 0)),
    samples: msg.samples, bg: msg.background, cam, fw, right, up, tanH,
    width: msg.width, height: msg.height,
    dof, focusDist: dof ? focusDist * Math.max(0.05, dof[0] * 4) : 0, lens: dof ? dof[1] * diag * 0.05 : 0,
    stack: new Int32Array(128),
  };
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

let hitT = 0, hitP = -1, hitNx = 0, hitNy = 0, hitNz = 0;

// Finds the nearest hit, or with any=true the first hit closer than tmax.
function trace(ox, oy, oz, dx, dy, dz, tmax, any) {
  const { nb6, left, count, order, type, inv, tri, stack } = S;
  const idx = 1 / dx, idy = 1 / dy, idz = 1 / dz, EPS = 1e-6;
  let sp = 0, best = tmax, bestP = -1, bestAxis = 0, bestSign = 0, bx = 0, by = 0, bz = 0;
  if (!S.n) return false;
  stack[sp++] = 0;
  while (sp) {
    const id = stack[--sp], o = id * 6;
    let t0 = (nb6[o] - ox) * idx, t1 = (nb6[o + 3] - ox) * idx;
    let tn = t0 < t1 ? t0 : t1, tf = t0 < t1 ? t1 : t0;
    t0 = (nb6[o + 1] - oy) * idy; t1 = (nb6[o + 4] - oy) * idy;
    let a = t0 < t1 ? t0 : t1, b = t0 < t1 ? t1 : t0;
    if (a > tn) tn = a; if (b < tf) tf = b;
    t0 = (nb6[o + 2] - oz) * idz; t1 = (nb6[o + 5] - oz) * idz;
    a = t0 < t1 ? t0 : t1; b = t0 < t1 ? t1 : t0;
    if (a > tn) tn = a; if (b < tf) tf = b;
    if (!(tn <= tf) || tf < 0 || tn > best) continue;
    const c = count[id];
    if (!c) {
      stack[sp++] = left[id];
      stack[sp++] = id + 1;
      continue;
    }
    for (let i = 0; i < c; i++) {
      const p = order[left[id] + i], ty = type[p];
      let t = -1;
      if (ty === 2) {
        const q = p * 9;
        const e1x = tri[q + 3] - tri[q], e1y = tri[q + 4] - tri[q + 1], e1z = tri[q + 5] - tri[q + 2];
        const e2x = tri[q + 6] - tri[q], e2y = tri[q + 7] - tri[q + 1], e2z = tri[q + 8] - tri[q + 2];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-14) continue;
        const f = 1 / det, sx = ox - tri[q], sy = oy - tri[q + 1], sz = oz - tri[q + 2];
        const u = f * (sx * px + sy * py + sz * pz);
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = f * (dx * qx + dy * qy + dz * qz);
        if (v < 0 || u + v > 1) continue;
        t = f * (e2x * qx + e2y * qy + e2z * qz);
        if (t > EPS && t < best) {
          best = t; bestP = p;
          if (any) return true;
          bx = e1y * e2z - e1z * e2y; by = e1z * e2x - e1x * e2z; bz = e1x * e2y - e1y * e2x;
        }
        continue;
      }
      const q = p * 12;
      const lx = inv[q] * ox + inv[q + 1] * oy + inv[q + 2] * oz + inv[q + 3];
      const ly = inv[q + 4] * ox + inv[q + 5] * oy + inv[q + 6] * oz + inv[q + 7];
      const lz = inv[q + 8] * ox + inv[q + 9] * oy + inv[q + 10] * oz + inv[q + 11];
      const ldx = inv[q] * dx + inv[q + 1] * dy + inv[q + 2] * dz;
      const ldy = inv[q + 4] * dx + inv[q + 5] * dy + inv[q + 6] * dz;
      const ldz = inv[q + 8] * dx + inv[q + 9] * dy + inv[q + 10] * dz;
      if (ty === 0) {
        let near = -Infinity, far = Infinity, axis = 0, sign = 0, farAxis = 0, farSign = 0, miss = false;
        for (let k = 0; k < 3; k++) {
          const l = k === 0 ? lx : k === 1 ? ly : lz, d = k === 0 ? ldx : k === 1 ? ldy : ldz;
          if (Math.abs(d) < 1e-14) { if (l < 0 || l > 1) { miss = true; break; } continue; }
          let ta = -l / d, tb = (1 - l) / d, sa = -1, sb = 1;
          if (ta > tb) { const s = ta; ta = tb; tb = s; sa = 1; sb = -1; }
          if (ta > near) { near = ta; axis = k; sign = sa; }
          if (tb < far) { far = tb; farAxis = k; farSign = sb; }
        }
        if (miss || near > far) continue;
        if (near > EPS) t = near;
        else if (far > EPS) { t = far; axis = farAxis; sign = farSign; }
        else continue;
        if (t < best) {
          best = t; bestP = p;
          if (any) return true;
          bestAxis = axis; bestSign = sign;
        }
      } else if (ty === 3) {
        // Unit cylinder: axis along x from 0 to 1, radius 0.5, centered on y and z.
        const cy = ly - 0.5, cz = lz - 0.5;
        const A = ldy * ldy + ldz * ldz, B = cy * ldy + cz * ldz, C = cy * cy + cz * cz - 0.25;
        let found = Infinity, nx = 0, ny = 0, nz = 0;
        if (A > 1e-18) {
          const disc = B * B - A * C;
          if (disc >= 0) {
            const sq = Math.sqrt(disc);
            for (const side of [(-B - sq) / A, (-B + sq) / A]) {
              const sx = lx + ldx * side;
              if (side > EPS && side < found && sx >= 0 && sx <= 1) {
                found = side; nx = 0; ny = cy + ldy * side; nz = cz + ldz * side;
              }
            }
          }
        }
        if (Math.abs(ldx) > 1e-14) {
          for (const plane of [0, 1]) {
            const cap = (plane - lx) / ldx, ey = cy + ldy * cap, ez = cz + ldz * cap;
            if (cap > EPS && cap < found && ey * ey + ez * ez <= 0.25) {
              found = cap; nx = plane ? 1 : -1; ny = 0; nz = 0;
            }
          }
        }
        if (found < best) {
          best = found; bestP = p;
          if (any) return true;
          bx = nx; by = ny; bz = nz;
        }
      } else {
        const cx = lx - 0.5, cy = ly - 0.5, cz = lz - 0.5;
        const A = ldx * ldx + ldy * ldy + ldz * ldz, B = cx * ldx + cy * ldy + cz * ldz, C = cx * cx + cy * cy + cz * cz - 0.25;
        const disc = B * B - A * C;
        if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        t = (-B - sq) / A;
        if (t <= EPS) t = (-B + sq) / A;
        if (t > EPS && t < best) {
          best = t; bestP = p;
          if (any) return true;
          bx = cx + ldx * t; by = cy + ldy * t; bz = cz + ldz * t;
        }
      }
    }
  }
  if (bestP < 0) return false;
  hitT = best; hitP = bestP;
  const ty = type[bestP];
  if (ty === 2) { hitNx = bx; hitNy = by; hitNz = bz; }
  else {
    let lnx = bx, lny = by, lnz = bz;
    if (ty === 0) { lnx = bestAxis === 0 ? bestSign : 0; lny = bestAxis === 1 ? bestSign : 0; lnz = bestAxis === 2 ? bestSign : 0; }
    const q = bestP * 12;
    hitNx = inv[q] * lnx + inv[q + 4] * lny + inv[q + 8] * lnz;
    hitNy = inv[q + 1] * lnx + inv[q + 5] * lny + inv[q + 9] * lnz;
    hitNz = inv[q + 2] * lnx + inv[q + 6] * lny + inv[q + 10] * lnz;
  }
  const l = Math.hypot(hitNx, hitNy, hitNz) || 1;
  hitNx /= l; hitNy /= l; hitNz /= l;
  if (hitNx * dx + hitNy * dy + hitNz * dz > 0) { hitNx = -hitNx; hitNy = -hitNy; hitNz = -hitNz; }
  return true;
}

let seedState = 1;
function rand() {
  let x = seedState;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  seedState = x;
  return (x >>> 0) / 4294967296;
}

let outR = 0, outG = 0, outB = 0;

function shade(ox, oy, oz, dx, dy, dz, depth) {
  if (!trace(ox, oy, oz, dx, dy, dz, Infinity, false)) {
    outR = S.bg[0]; outG = S.bg[1]; outB = S.bg[2];
    return;
  }
  const t = hitT, p = hitP, nx = hitNx, ny = hitNy, nz = hitNz;
  const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
  const bias = 1e-4 * S.diag;
  const qx = px + nx * bias, qy = py + ny * bias, qz = pz + nz * bias;
  const cr = S.color[p * 4], cg = S.color[p * 4 + 1], cb = S.color[p * 4 + 2], alpha = S.color[p * 4 + 3];
  const mat = S.materials[S.cls[p]] || S.materials[0];
  const [amb, dif, spe] = mat.phong;

  let vis = 1;
  if (S.aoSamples > 0 && amb > 0) {
    // Cosine-weighted hemisphere samples around the normal.
    let open = 0;
    const ax = Math.abs(nx) > 0.9 ? 0 : 1, ay = ax ? 0 : 1;
    let ux = ny * 0 - nz * ay, uy = nz * ax - nx * 0, uz = nx * ay - ny * ax;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    for (let i = 0; i < S.aoSamples; i++) {
      const r1 = rand(), r2 = rand() * 6.283185307, r = Math.sqrt(r1), a = r * Math.cos(r2), b = r * Math.sin(r2), c = Math.sqrt(1 - r1);
      if (!trace(qx, qy, qz, a * ux + b * vx + c * nx, a * uy + b * vy + c * ny, a * uz + b * vz + c * nz, S.diag * 0.3, true)) open++;
    }
    vis = open / S.aoSamples;
  }

  const L = S.lightDir;
  const ndl = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
  let lit = ndl > 0 ? 1 : 0;
  if (lit && S.shadows && trace(qx, qy, qz, L[0], L[1], L[2], Infinity, true)) lit = 0;
  const dl = Math.hypot(dx, dy, dz);
  let hx = L[0] - dx / dl, hy = L[1] - dy / dl, hz = L[2] - dz / dl;
  const hl = Math.hypot(hx, hy, hz) || 1;
  hx /= hl; hy /= hl; hz /= hl;
  const ndh = Math.max(0, nx * hx + ny * hy + nz * hz);
  const spec = lit && spe > 0 ? spe * Math.pow(ndh, 48) : 0;
  const k = amb * vis + dif * ndl * lit;
  let r = cr * k + spec, g = cg * k + spec, b = cb * k + spec;

  if (mat.refl > 0 && depth < 3) {
    const dn = 2 * (dx * nx + dy * ny + dz * nz);
    shade(qx, qy, qz, dx - dn * nx, dy - dn * ny, dz - dn * nz, depth + 1);
    r += (outR - r) * mat.refl; g += (outG - g) * mat.refl; b += (outB - b) * mat.refl;
  }
  if (alpha < 0.999 && depth < 6) {
    const e = bias / (dl || 1);
    shade(px + dx * e, py + dy * e, pz + dz * e, dx, dy, dz, depth + 1);
    r = r * alpha + outR * (1 - alpha); g = g * alpha + outG * (1 - alpha); b = b * alpha + outB * (1 - alpha);
  }
  outR = r; outG = g; outB = b;
}

function renderTile(x0, y0, w, h) {
  const { width, height, cam, fw, right, up, tanH, samples, lens, focusDist } = S;
  const out = new Uint8ClampedArray(w * h * 4);
  const aspect = width / height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      seedState = (((x0 + x) * 73856093) ^ ((y0 + y) * 19349663) ^ 0x2F6E2B1) | 1;
      for (let i = 0; i < 4; i++) rand();
      let r = 0, g = 0, b = 0;
      for (let s = 0; s < samples; s++) {
        const jx = samples > 1 ? rand() : 0.5, jy = samples > 1 ? rand() : 0.5;
        const u = ((x0 + x + jx) / width * 2 - 1) * tanH * aspect;
        const v = (1 - (y0 + y + jy) / height * 2) * tanH;
        let dx = fw[0] + right[0] * u + up[0] * v, dy = fw[1] + right[1] * u + up[1] * v, dz = fw[2] + right[2] * u + up[2] * v;
        let ox = cam.pos[0], oy = cam.pos[1], oz = cam.pos[2];
        if (lens > 0) {
          const ang = rand() * 6.283185307, rad = Math.sqrt(rand()) * lens;
          const lx = Math.cos(ang) * rad, ly = Math.sin(ang) * rad;
          const fx = ox + dx * focusDist, fy = oy + dy * focusDist, fz = oz + dz * focusDist;
          ox += right[0] * lx + up[0] * ly; oy += right[1] * lx + up[1] * ly; oz += right[2] * lx + up[2] * ly;
          dx = fx - ox; dy = fy - oy; dz = fz - oz;
        }
        const l = Math.hypot(dx, dy, dz);
        shade(ox, oy, oz, dx / l, dy / l, dz / l, 0);
        r += outR; g += outG; b += outB;
      }
      const o = (y * w + x) * 4;
      out[o] = r / samples * 255; out[o + 1] = g / samples * 255; out[o + 2] = b / samples * 255; out[o + 3] = 255;
    }
  }
  return out;
}

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'scene') { buildScene(m); self.postMessage({ type: 'ready' }); return; }
  if (m.type === 'tile') {
    const px = renderTile(m.x, m.y, m.w, m.h);
    self.postMessage({ type: 'tile', x: m.x, y: m.y, w: m.w, h: m.h, px }, [px.buffer]);
  }
};
