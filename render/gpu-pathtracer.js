'use strict';
// Progressive path tracer on WebGPU compute shaders. It traces the same BVH and
// primitives the CPU raytracer builds (raytrace.js packs them), so both
// renderers draw the same scene, and the CPU one stays as the fallback.
(function () {

const TRACE_WGSL = /* wgsl */ `
struct U {
  camPos: vec3f, tanH: f32,
  camFw: vec3f, aspect: f32,
  camRight: vec3f, lens: f32,
  camUp: vec3f, focus: f32,
  lightDir: vec3f, sun: f32,
  bg: vec3f, sky: f32,
  width: u32, height: u32, frame: u32, rowStart: u32,
  bounces: u32, transparent: u32, shadows: u32, nodeCount: u32,
  diag: f32, softness: f32, pad0: f32, pad1: f32,
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> nodes: array<vec4f>;
@group(0) @binding(2) var<storage, read> prims: array<vec4f>;
@group(0) @binding(3) var<storage, read> mats: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> accum: array<vec4f>;

var<private> rng: u32;
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rand() -> f32 { rng = pcg(rng); return f32(rng >> 8u) * (1.0 / 16777216.0); }

// Avoids dividing by an exact zero, which WGSL leaves undefined.
fn safeInv(d: vec3f) -> vec3f {
  let s = select(vec3f(-1.0), vec3f(1.0), d >= vec3f(0.0));
  return 1.0 / select(d, s * 1e-20, abs(d) < vec3f(1e-20));
}

struct Hit { t: f32, prim: i32, n: vec3f };

// Returns the distance to primitive i, or -1, and writes the world normal.
fn hitPrim(i: u32, o: vec3f, d: vec3f, tmax: f32, nOut: ptr<function, vec3f>) -> f32 {
  let b = i * 5u;
  let r0 = prims[b]; let r1 = prims[b + 1u]; let r2 = prims[b + 2u];
  let ty = u32(prims[b + 4u].x + 0.5);
  let eps = 1e-6;
  if (ty == 2u) {
    let e1 = r1.xyz; let e2 = r2.xyz;
    let p = cross(d, e2);
    let det = dot(e1, p);
    if (abs(det) < 1e-14) { return -1.0; }
    let f = 1.0 / det;
    let s = o - r0.xyz;
    let uu = f * dot(s, p);
    if (uu < 0.0 || uu > 1.0) { return -1.0; }
    let q = cross(s, e1);
    let vv = f * dot(d, q);
    if (vv < 0.0 || uu + vv > 1.0) { return -1.0; }
    let t = f * dot(e2, q);
    if (t <= eps || t >= tmax) { return -1.0; }
    *nOut = cross(e1, e2);
    return t;
  }
  let lo = vec3f(dot(r0.xyz, o) + r0.w, dot(r1.xyz, o) + r1.w, dot(r2.xyz, o) + r2.w);
  let ld = vec3f(dot(r0.xyz, d), dot(r1.xyz, d), dot(r2.xyz, d));
  var nl = vec3f(0.0);
  var t = -1.0;
  if (ty == 0u) {
    let inv = safeInv(ld);
    let t0 = -lo * inv; let t1 = (vec3f(1.0) - lo) * inv;
    let tn = min(t0, t1); let tf = max(t0, t1);
    let near = max(max(tn.x, tn.y), tn.z);
    let far = min(min(tf.x, tf.y), tf.z);
    if (near > far) { return -1.0; }
    if (near > eps) {
      t = near;
      if (tn.x == near) { nl = vec3f(-sign(ld.x), 0.0, 0.0); }
      else if (tn.y == near) { nl = vec3f(0.0, -sign(ld.y), 0.0); }
      else { nl = vec3f(0.0, 0.0, -sign(ld.z)); }
    } else if (far > eps) {
      t = far;
      if (tf.x == far) { nl = vec3f(sign(ld.x), 0.0, 0.0); }
      else if (tf.y == far) { nl = vec3f(0.0, sign(ld.y), 0.0); }
      else { nl = vec3f(0.0, 0.0, sign(ld.z)); }
    } else { return -1.0; }
  } else if (ty == 1u) {
    let c = lo - vec3f(0.5);
    let A = dot(ld, ld); let B = dot(c, ld); let C = dot(c, c) - 0.25;
    let disc = B * B - A * C;
    if (disc < 0.0) { return -1.0; }
    let sq = sqrt(disc);
    t = (-B - sq) / A;
    if (t <= eps) { t = (-B + sq) / A; }
    if (t <= eps) { return -1.0; }
    nl = c + ld * t;
  } else {
    // Unit cylinder along x from 0 to 1, radius 0.5, centered on y and z.
    let cy = lo.y - 0.5; let cz = lo.z - 0.5;
    let A = ld.y * ld.y + ld.z * ld.z; let B = cy * ld.y + cz * ld.z; let C = cy * cy + cz * cz - 0.25;
    var best = 1e30;
    if (A > 1e-18) {
      let disc = B * B - A * C;
      if (disc >= 0.0) {
        let sq = sqrt(disc);
        for (var k = 0; k < 2; k++) {
          let side = select((-B + sq) / A, (-B - sq) / A, k == 0);
          let sx = lo.x + ld.x * side;
          if (side > eps && side < best && sx >= 0.0 && sx <= 1.0) {
            best = side; nl = vec3f(0.0, cy + ld.y * side, cz + ld.z * side);
          }
        }
      }
    }
    if (abs(ld.x) > 1e-14) {
      for (var k = 0; k < 2; k++) {
        let plane = f32(k);
        let cap = (plane - lo.x) / ld.x;
        let ey = cy + ld.y * cap; let ez = cz + ld.z * cap;
        if (cap > eps && cap < best && ey * ey + ez * ez <= 0.25) {
          best = cap; nl = vec3f(select(-1.0, 1.0, k == 1), 0.0, 0.0);
        }
      }
    }
    if (best >= 1e30) { return -1.0; }
    t = best;
  }
  if (t >= tmax) { return -1.0; }
  *nOut = r0.xyz * nl.x + r1.xyz * nl.y + r2.xyz * nl.z;
  return t;
}

fn trace(o: vec3f, d: vec3f, tmax: f32, anyHit: bool) -> Hit {
  var h: Hit;
  h.t = tmax; h.prim = -1; h.n = vec3f(0.0, 1.0, 0.0);
  if (u.nodeCount == 0u) { return h; }
  let inv = safeInv(d);
  var stack: array<u32, 64>;
  var sp = 1u;
  stack[0] = 0u;
  var guard = 0u;
  loop {
    if (sp == 0u || guard > 200000u) { break; }
    guard += 1u;
    sp -= 1u;
    let id = stack[sp];
    let a = nodes[id * 2u]; let b = nodes[id * 2u + 1u];
    let t0 = (a.xyz - o) * inv; let t1 = (b.xyz - o) * inv;
    let tn = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
    let tf = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
    if (tn > tf || tf < 0.0 || tn > h.t) { continue; }
    let first = bitcast<u32>(a.w); let count = bitcast<u32>(b.w);
    if (count == 0u) {
      if (sp < 62u) { stack[sp] = first; stack[sp + 1u] = id + 1u; sp += 2u; }
      continue;
    }
    for (var k = 0u; k < count; k++) {
      var n: vec3f;
      let t = hitPrim(first + k, o, d, h.t, &n);
      if (t > 0.0) {
        h.t = t; h.prim = i32(first + k); h.n = n;
        if (anyHit) { return h; }
      }
    }
  }
  return h;
}

fn cosineDir(n: vec3f) -> vec3f {
  let r1 = rand(); let r2 = rand() * 6.2831853;
  let r = sqrt(r1);
  let a = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(n.x) > 0.9);
  let t1 = normalize(cross(a, n)); let t2 = cross(n, t1);
  return normalize(t1 * (r * cos(r2)) + t2 * (r * sin(r2)) + n * sqrt(max(0.0, 1.0 - r1)));
}

// Light units match the CPU raytracer: an open surface gets albedo * ambient
// from the sky, and albedo * diffuse * N.L from the sun.
fn radiance(o0: vec3f, d0: vec3f) -> vec4f {
  var o = o0; var d = d0;
  var tp = vec3f(1.0); var L = vec3f(0.0); var alpha = 0.0;
  let bias = 1e-4 * u.diag;
  var depth = 0u;
  for (var step = 0u; step < 32u; step++) {
    let h = trace(o, d, 1e30, false);
    if (h.prim < 0) {
      if (depth == 0u) { if (u.transparent == 0u) { L += tp * u.bg; } }
      else { L += tp * u.sky; }
      break;
    }
    var n = normalize(h.n);
    if (dot(n, d) > 0.0) { n = -n; }
    let pb = u32(h.prim) * 5u;
    let c = prims[pb + 3u];
    let mat = mats[u32(prims[pb + 4u].y + 0.5)];
    let p = o + d * h.t;
    if (depth == 0u) { alpha = 1.0; }
    // Transparent surfaces let a share of paths through unchanged.
    if (c.a < 0.999 && rand() > c.a) { o = p + d * bias; continue; }
    let q = p + n * bias;
    if (mat.w > 0.0 && rand() < mat.w) {
      d = reflect(d, n); o = q;
      depth += 1u;
      if (depth > u.bounces) { break; }
      continue;
    }
    let ndl = dot(n, u.lightDir);
    if (ndl > 0.0) {
      var ldir = u.lightDir;
      if (u.softness > 0.0) { ldir = normalize(ldir + (vec3f(rand(), rand(), rand()) * 2.0 - 1.0) * u.softness); }
      var lit = true;
      if (u.shadows != 0u) { lit = trace(q, ldir, 1e30, true).prim < 0; }
      if (lit) {
        L += tp * c.rgb * (u.sun * mat.y * ndl);
        if (depth == 0u && mat.z > 0.0) {
          let hv = normalize(u.lightDir - d);
          L += tp * vec3f(u.sun * mat.z * pow(max(dot(n, hv), 0.0), 48.0));
        }
      }
    }
    depth += 1u;
    if (depth > u.bounces) { break; }
    tp *= c.rgb;
    if (depth > 2u) {
      let keep = max(tp.x, max(tp.y, tp.z));
      if (keep <= 0.0 || rand() > keep) { break; }
      tp /= keep;
    }
    d = cosineDir(n);
    o = q;
  }
  return vec4f(L, alpha);
}

@compute @workgroup_size(8, 8)
fn traceMain(@builtin(global_invocation_id) gid: vec3u) {
  let x = gid.x; let y = gid.y + u.rowStart;
  if (x >= u.width || y >= u.height) { return; }
  rng = pcg(x * 1973u + y * 9277u + u.frame * 26699u + 1u);
  rng = pcg(rng ^ (u.frame * 2654435769u));
  let sx = ((f32(x) + rand()) / f32(u.width) * 2.0 - 1.0) * u.tanH * u.aspect;
  let sy = (1.0 - (f32(y) + rand()) / f32(u.height) * 2.0) * u.tanH;
  var dir = u.camFw + u.camRight * sx + u.camUp * sy;
  var o = u.camPos;
  if (u.lens > 0.0) {
    let ang = rand() * 6.2831853; let rad = sqrt(rand()) * u.lens;
    let f = o + dir * u.focus;
    o += u.camRight * (cos(ang) * rad) + u.camUp * (sin(ang) * rad);
    dir = f - o;
  }
  let res = radiance(o, normalize(dir));
  let idx = y * u.width + x;
  if (u.frame == 0u) { accum[idx] = res; } else { accum[idx] = accum[idx] + res; }
}

// Turns the running sums into straight-alpha RGBA8 for PNG export.
@group(0) @binding(5) var<storage, read_write> packed: array<u32>;
@compute @workgroup_size(64)
fn resolveMain(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u.width * u.height) { return; }
  let v = accum[i] / f32(max(u.frame, 1u));
  var rgb = clamp(v.rgb, vec3f(0.0), vec3f(1.0));
  var a = 1.0;
  if (u.transparent != 0u) {
    a = clamp(v.a, 0.0, 1.0);
    rgb = select(vec3f(0.0), clamp(v.rgb / max(v.a, 1e-6), vec3f(0.0), vec3f(1.0)), a > 0.0);
  }
  packed[i] = pack4x8unorm(vec4f(rgb, a));
}
`;

const DISPLAY_WGSL = /* wgsl */ `
struct D { width: u32, height: u32, frames: u32, transparent: u32 };
@group(0) @binding(0) var<uniform> du: D;
@group(0) @binding(1) var<storage, read> acc: array<vec4f>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let x = min(u32(pos.x), du.width - 1u); let y = min(u32(pos.y), du.height - 1u);
  let v = acc[y * du.width + x] / f32(max(du.frames, 1u));
  if (du.transparent != 0u) {
    let a = clamp(v.a, 0.0, 1.0);
    return vec4f(min(clamp(v.rgb, vec3f(0.0), vec3f(1.0)), vec3f(a)), a);
  }
  return vec4f(clamp(v.rgb, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

const UNIFORM_BYTES = 144;

class GpuPathTracer {
  static async create() {
    if (!navigator.gpu) throw new Error('This browser has no WebGPU.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU graphics adapter is available.');
    const cap = Math.min(adapter.limits.maxStorageBufferBindingSize, adapter.limits.maxBufferSize, 2 ** 31);
    const device = await adapter.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: cap, maxBufferSize: cap } });
    return new GpuPathTracer(adapter, device);
  }

  constructor(adapter, device) {
    this.adapter = adapter;
    this.device = device;
    this.lost = false;
    this.onLost = null;
    this.maxBuffer = device.limits.maxStorageBufferBindingSize;
    const info = adapter.info || {};
    this.name = [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') || 'WebGPU';
    device.lost.then(e => {
      this.lost = true;
      if (this.onLost) this.onLost(e.message || 'The graphics device was lost.');
    });
    const traceModule = device.createShaderModule({ code: TRACE_WGSL });
    this.tracePipeline = device.createComputePipeline({ layout: 'auto', compute: { module: traceModule, entryPoint: 'traceMain' } });
    this.resolvePipeline = device.createComputePipeline({ layout: 'auto', compute: { module: traceModule, entryPoint: 'resolveMain' } });
    this.format = navigator.gpu.getPreferredCanvasFormat();
    const displayModule = device.createShaderModule({ code: DISPLAY_WGSL });
    this.displayPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: displayModule, entryPoint: 'vs' },
      fragment: { module: displayModule, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.scene = null;
  }

  // Bytes the scene and a target of this size need on the GPU.
  static estimateBytes(primCount, nodeCount, width, height) {
    return primCount * 80 + nodeCount * 32 + width * height * 20;
  }

  setScene(packed) {
    const d = this.device;
    if (this.scene) ['nodes', 'prims', 'mats'].forEach(k => this.scene[k].destroy());
    const make = arr => {
      if (arr.byteLength > this.maxBuffer) throw new Error('The model is too large for this graphics card.');
      const b = d.createBuffer({ size: Math.max(16, arr.byteLength), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(b, 0, arr);
      return b;
    };
    this.scene = {
      nodes: make(packed.nodes), prims: make(packed.prims), mats: make(packed.materials),
      nodeCount: packed.nodeCount, primCount: packed.primCount,
      diag: packed.diag, shadows: packed.shadows, lightDir: packed.lightDir,
    };
    this.sceneId = (this.sceneId || 0) + 1;
  }

  createTarget(width, height, canvas) {
    const d = this.device;
    const pixels = width * height;
    if (pixels * 16 > this.maxBuffer) throw new Error('That resolution needs more graphics memory than this card allows.');
    const t = {
      width, height, frames: 0,
      accum: d.createBuffer({ size: pixels * 16, usage: GPUBufferUsage.STORAGE }),
      uniforms: d.createBuffer({ size: UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
      displayUniforms: d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
      rows: Math.max(8, Math.min(height, Math.floor(262144 / width) || 8)),
      context: null,
    };
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
      t.context = canvas.getContext('webgpu');
      t.context.configure({ device: d, format: this.format, alphaMode: 'premultiplied' });
    }
    t.destroy = () => { t.accum.destroy(); t.uniforms.destroy(); t.displayUniforms.destroy(); if (t.packed) t.packed.destroy(); };
    return t;
  }

  // One full-image sample per pixel, sent in row bands so no single GPU
  // submission runs long enough to stall the display or trip a watchdog.
  async traceFrame(t, view, cancelled) {
    const d = this.device, s = this.scene;
    if (!s || this.lost) return false;
    if (t.sceneId !== this.sceneId) {
      t.sceneId = this.sceneId;
      t.bind = d.createBindGroup({
        layout: this.tracePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: t.uniforms } }, { binding: 1, resource: { buffer: s.nodes } },
          { binding: 2, resource: { buffer: s.prims } }, { binding: 3, resource: { buffer: s.mats } },
          { binding: 4, resource: { buffer: t.accum } },
        ],
      });
    }
    const u = new ArrayBuffer(UNIFORM_BYTES), f = new Float32Array(u), i = new Uint32Array(u);
    const put = (o, v3, w) => { f[o] = v3[0]; f[o + 1] = v3[1]; f[o + 2] = v3[2]; f[o + 3] = w; };
    put(0, view.pos, view.tanH);
    put(4, view.fw, t.width / t.height);
    put(8, view.right, view.lens);
    put(12, view.up, view.focus);
    put(16, view.lightDir, view.sun);
    put(20, view.bg, view.sky);
    i[24] = t.width; i[25] = t.height; i[26] = t.frames;
    i[28] = view.bounces; i[29] = view.transparent ? 1 : 0; i[30] = view.shadows ? 1 : 0; i[31] = s.nodeCount;
    f[32] = s.diag; f[33] = view.softness;
    for (let row = 0; row < t.height; row += t.rows) {
      if (this.lost || (cancelled && cancelled())) return false;
      i[27] = row;
      d.queue.writeBuffer(t.uniforms, 0, u);
      const enc = d.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(this.tracePipeline);
      pass.setBindGroup(0, t.bind);
      pass.dispatchWorkgroups(Math.ceil(t.width / 8), Math.ceil(Math.min(t.rows, t.height - row) / 8));
      pass.end();
      const started = performance.now();
      d.queue.submit([enc.finish()]);
      await d.queue.onSubmittedWorkDone();
      // Keeps each band near 40 ms on this machine and this scene.
      const ms = performance.now() - started;
      if (ms > 60) t.rows = Math.max(8, Math.floor(t.rows * 0.6 / 8) * 8);
      else if (ms < 20) t.rows = Math.min(4096, t.rows * 2);
    }
    t.frames++;
    return true;
  }

  present(t, transparent) {
    if (!t.context || this.lost) return;
    const d = this.device;
    d.queue.writeBuffer(t.displayUniforms, 0, new Uint32Array([t.width, t.height, t.frames, transparent ? 1 : 0]));
    if (!t.displayBind) {
      t.displayBind = d.createBindGroup({
        layout: this.displayPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: t.displayUniforms } }, { binding: 1, resource: { buffer: t.accum } }],
      });
    }
    const enc = d.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: t.context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
    });
    pass.setPipeline(this.displayPipeline);
    pass.setBindGroup(0, t.displayBind);
    pass.draw(3);
    pass.end();
    d.queue.submit([enc.finish()]);
  }

  // Reads the image back as straight-alpha RGBA bytes.
  async readPixels(t, transparent) {
    const d = this.device, bytes = t.width * t.height * 4;
    if (!t.packed) t.packed = d.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const flags = new Uint32Array(UNIFORM_BYTES / 4);
    flags[24] = t.width; flags[25] = t.height; flags[26] = t.frames; flags[29] = transparent ? 1 : 0;
    // Only width, height, frame count and transparency matter to resolveMain.
    d.queue.writeBuffer(t.uniforms, 0, flags);
    const bind = d.createBindGroup({
      layout: this.resolvePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: t.uniforms } }, { binding: 4, resource: { buffer: t.accum } },
        { binding: 5, resource: { buffer: t.packed } },
      ],
    });
    const read = d.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = d.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.resolvePipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.ceil(t.width * t.height / 64));
    pass.end();
    enc.copyBufferToBuffer(t.packed, 0, read, 0, bytes);
    d.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const out = new Uint8ClampedArray(read.getMappedRange().slice(0));
    read.unmap();
    read.destroy();
    return out;
  }
}

globalThis.GpuPathTracer = GpuPathTracer;
})();
