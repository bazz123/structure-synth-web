'use strict';
// Turns a built model into model.obj and model.mtl inside an uncompressed ZIP.
const TEXT_LIMIT = 5 * 1024 * 1024;

const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}

const BOX_FACES = [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]];
const GRID_EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
const SEGMENTS = 12, RINGS = 8;

// A unit-box sphere: one vertex at each pole, with rings of quads between them.
const SPHERE_VERTS = [[0.5, 1, 0.5]];
for (let r = 1; r < RINGS; r++) {
  const phi = Math.PI * r / RINGS;
  for (let s = 0; s < SEGMENTS; s++) {
    const theta = 2 * Math.PI * s / SEGMENTS;
    SPHERE_VERTS.push([0.5 + 0.5 * Math.sin(phi) * Math.cos(theta), 0.5 + 0.5 * Math.cos(phi), 0.5 + 0.5 * Math.sin(phi) * Math.sin(theta)]);
  }
}
SPHERE_VERTS.push([0.5, 0, 0.5]);
const SPHERE_FACES = [];
{
  const at = (r, s) => 1 + (r - 1) * SEGMENTS + ((s + SEGMENTS) % SEGMENTS);
  const last = SPHERE_VERTS.length - 1;
  for (let s = 0; s < SEGMENTS; s++) {
    SPHERE_FACES.push([0, at(1, s + 1), at(1, s)]);
    SPHERE_FACES.push([last, at(RINGS - 1, s), at(RINGS - 1, s + 1)]);
    for (let r = 1; r < RINGS - 1; r++) SPHERE_FACES.push([at(r, s), at(r, s + 1), at(r + 1, s + 1), at(r + 1, s)]);
  }
}

const fmt = v => String(+v.toFixed(6));
const col = v => String(+v.toFixed(3));

function exportModel(r, sink) {
  const kinds = [
    { key: 'box', data: r.boxes, stride: 17, c: 12 },
    { key: 'sphere', data: r.spheres, stride: 17, c: 12 },
    { key: 'grid', data: r.grids, stride: 17, c: 12 },
    { key: 'tri', data: r.tris, stride: 14, c: 9 },
    { key: 'line', data: r.lines, stride: 10, c: 6 },
    { key: 'dot', data: r.dots, stride: 7, c: 3 },
  ];
  const groups = new Map();
  for (const kind of kinds) {
    const n = kind.data.length / kind.stride;
    for (let i = 0; i < n; i++) {
      const o = i * kind.stride + kind.c;
      const q = v => Math.round(v * 31);
      const name = 'c' + q(kind.data[o]) + '_' + q(kind.data[o + 1]) + '_' + q(kind.data[o + 2]) + '_' + q(kind.data[o + 3]);
      let g = groups.get(name);
      if (!g) {
        g = { rgba: [q(kind.data[o]) / 31, q(kind.data[o + 1]) / 31, q(kind.data[o + 2]) / 31, q(kind.data[o + 3]) / 31], items: [] };
        groups.set(name, g);
      }
      g.items.push(kind, i);
    }
  }

  let mtl = '';
  for (const [name, g] of groups) {
    const [cr, cg, cb, ca] = g.rgba;
    mtl += 'newmtl ' + name + '\nKd ' + col(cr) + ' ' + col(cg) + ' ' + col(cb) + '\nKa 0 0 0\nKs 0.1 0.1 0.1\nNs 40\nd ' + col(ca) + '\n\n';
  }

  sink('# Exported from Structure Synth Web\nmtllib model.mtl\ns off\n');
  let base = 1;
  for (const [name, g] of groups) {
    sink('usemtl ' + name + '\n');
    for (let k = 0; k < g.items.length; k += 2) {
      const kind = g.items[k], i = g.items[k + 1], d = kind.data, o = i * kind.stride;
      const cs = ' ' + col(d[o + kind.c]) + ' ' + col(d[o + kind.c + 1]) + ' ' + col(d[o + kind.c + 2]) + '\n';
      let s = '';
      if (kind.key === 'box' || kind.key === 'sphere' || kind.key === 'grid') {
        const local = kind.key === 'sphere' ? SPHERE_VERTS : null;
        const vcount = local ? local.length : 8;
        for (let v = 0; v < vcount; v++) {
          const u = local ? local[v][0] : v & 1, w = local ? local[v][1] : (v >> 1) & 1, t = local ? local[v][2] : (v >> 2) & 1;
          s += 'v ' + fmt(d[o] * u + d[o + 3] * w + d[o + 6] * t + d[o + 9]) + ' ' + fmt(d[o + 1] * u + d[o + 4] * w + d[o + 7] * t + d[o + 10]) + ' ' + fmt(d[o + 2] * u + d[o + 5] * w + d[o + 8] * t + d[o + 11]) + cs;
        }
        if (kind.key === 'grid') {
          for (const e of GRID_EDGES) s += 'l ' + (base + e[0]) + ' ' + (base + e[1]) + '\n';
        } else {
          // Mirrored transforms turn faces inside out, so their winding flips.
          const det = d[o] * (d[o + 4] * d[o + 8] - d[o + 7] * d[o + 5]) - d[o + 3] * (d[o + 1] * d[o + 8] - d[o + 7] * d[o + 2]) + d[o + 6] * (d[o + 1] * d[o + 5] - d[o + 4] * d[o + 2]);
          const faces = local ? SPHERE_FACES : BOX_FACES;
          for (const f of faces) {
            const ids = f.map(x => base + x);
            if (det < 0) ids.reverse();
            s += 'f ' + ids.join(' ') + '\n';
          }
        }
        base += vcount;
      } else if (kind.key === 'tri') {
        for (let v = 0; v < 3; v++) s += 'v ' + fmt(d[o + v * 3]) + ' ' + fmt(d[o + v * 3 + 1]) + ' ' + fmt(d[o + v * 3 + 2]) + cs;
        s += 'f ' + base + ' ' + (base + 1) + ' ' + (base + 2) + '\n';
        base += 3;
      } else if (kind.key === 'line') {
        s += 'v ' + fmt(d[o]) + ' ' + fmt(d[o + 1]) + ' ' + fmt(d[o + 2]) + cs + 'v ' + fmt(d[o + 3]) + ' ' + fmt(d[o + 4]) + ' ' + fmt(d[o + 5]) + cs;
        s += 'l ' + base + ' ' + (base + 1) + '\n';
        base += 2;
      } else {
        s += 'v ' + fmt(d[o]) + ' ' + fmt(d[o + 1]) + ' ' + fmt(d[o + 2]) + cs + 'p ' + base + '\n';
        base += 1;
      }
      sink(s);
    }
  }
  return mtl;
}

class ZipWriter {
  constructor() { this.parts = []; this.offset = 0; this.entries = []; this.encoder = new TextEncoder(); }
  file(name, write) {
    // Sizes and the checksum come first in the file header, so the body is
    // gathered before the header is added.
    const body = [];
    let size = 0, crc = 0xFFFFFFFF;
    write(text => {
      const bytes = this.encoder.encode(text);
      for (let i = 0; i < bytes.length; i++) crc = CRC[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
      size += bytes.length;
      body.push(bytes);
    });
    crc = (crc ^ 0xFFFFFFFF) >>> 0;
    const nameBytes = this.encoder.encode(name);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034B50, true);
    head.setUint16(4, 20, true);
    head.setUint16(10, 0, true);
    head.setUint16(12, 0x21, true);
    head.setUint32(14, crc, true);
    head.setUint32(18, size, true);
    head.setUint32(22, size, true);
    head.setUint16(26, nameBytes.length, true);
    this.entries.push({ nameBytes, crc, size, offset: this.offset });
    this.parts.push(head.buffer, nameBytes, ...body);
    this.offset += 30 + nameBytes.length + size;
  }
  finish() {
    const start = this.offset;
    let dirSize = 0;
    for (const e of this.entries) {
      const dir = new DataView(new ArrayBuffer(46));
      dir.setUint32(0, 0x02014B50, true);
      dir.setUint16(4, 20, true);
      dir.setUint16(6, 20, true);
      dir.setUint16(14, 0x21, true);
      dir.setUint32(16, e.crc, true);
      dir.setUint32(20, e.size, true);
      dir.setUint32(24, e.size, true);
      dir.setUint16(28, e.nameBytes.length, true);
      dir.setUint32(42, e.offset, true);
      this.parts.push(dir.buffer, e.nameBytes);
      dirSize += 46 + e.nameBytes.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054B50, true);
    end.setUint16(8, this.entries.length, true);
    end.setUint16(10, this.entries.length, true);
    end.setUint32(12, dirSize, true);
    end.setUint32(16, start, true);
    this.parts.push(end.buffer);
    return new Blob(this.parts, { type: 'application/zip' });
  }
}

self.onmessage = e => {
  try {
    const zip = new ZipWriter();
    let mtl = '', objText = '', textSize = 0;
    zip.file('model.obj', add => {
      let pending = '';
      const sink = s => {
        pending += s;
        if (textSize <= TEXT_LIMIT) { objText += s; textSize += s.length; }
        if (pending.length > 1 << 20) { add(pending); pending = ''; }
      };
      mtl = exportModel(e.data, sink);
      if (pending) add(pending);
    });
    zip.file('model.mtl', add => add(mtl));
    self.postMessage({ ok: true, blob: zip.finish(), objText: textSize <= TEXT_LIMIT ? objText : null });
  } catch (err) {
    self.postMessage({ ok: false, message: err.message });
  }
};
