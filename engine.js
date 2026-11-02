'use strict';
// EisenScript parser and rule engine. Runs in a Web Worker in the page, and
// under any plain JS shell for tests. Written from the language's documented
// behavior: unit box at [0,1]^3, rotations and scales pivot on the box center.
(function (root) {

const PRIMS = new Set(['box', 'sphere', 'dot', 'grid', 'line', 'mesh', 'triangle', 'cylinder', 'template']);
const HARD_MAX_OBJECTS = 1000000, HARD_MAX_PENDING = 5000000, HARD_MAX_STEPS = 40000000;

const NAMES = 'aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32';
const NAMED = {};
NAMES.split(' ').forEach(p => { const [k, v] = p.split(':'); NAMED[k] = v; });

class ScriptError extends Error {
  constructor(message, line) { super(message); this.line = line; }
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseColor(text, line) {
  let s = String(text).toLowerCase();
  if (s[0] !== '#') {
    if (!NAMED[s]) throw new ScriptError('"' + text + '" is not a color. Use a color name or a hex value such as #0af.', line);
    s = '#' + NAMED[s];
  }
  let h = s.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  else if (h.length === 8) h = h.slice(2);
  if (!/^[0-9a-f]{6}$/.test(h)) throw new ScriptError('"' + text + '" is not a valid hex color.', line);
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

function rgb2hsv(c) {
  const [r, g, b] = c, max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [h * 60, max > 0 ? d / max : 0, max];
}

function hsv2rgb(h, s, v) {
  h = ((h % 360) + 360) % 360 / 60;
  const i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  switch (i) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

// Column-major 4x4 matrices.
function identity() { return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
function mul(a, b) {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return o;
}
function translate(x, y, z) { const m = identity(); m[12] = x; m[13] = y; m[14] = z; return m; }
function aboutPivot(px, py, pz, m) { return mul(mul(translate(px, py, pz), m), translate(-px, -py, -pz)); }
function linear(a, b, c, d, e, f, g, h, i) { // rows
  return new Float64Array([a, d, g, 0, b, e, h, 0, c, f, i, 0, 0, 0, 0, 1]);
}
function rotation(axis, deg) {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  if (axis === 'x') return aboutPivot(0, 0.5, 0.5, linear(1, 0, 0, 0, c, -s, 0, s, c));
  if (axis === 'y') return aboutPivot(0.5, 0, 0.5, linear(c, 0, s, 0, 1, 0, -s, 0, c));
  return aboutPivot(0.5, 0.5, 0, linear(c, -s, 0, s, c, 0, 0, 0, 1));
}

// ---------- Preprocessor ----------

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function preprocess(src, seed) {
  let text = src.replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
  const defines = [];
  const lines = text.split('\n').map(line => {
    const m = line.match(/^\s*#define\s+(\S+)\s*(.*)$/);
    if (m) {
      defines.push({ re: new RegExp('(?<![\\w#.])' + escapeRe(m[1]) + '(?![\\w.])', 'g'), value: m[2].replace(/\(\s*(float|int)\s*:[^)]*\)/, '').trim(), len: m[1].length });
      return '';
    }
    return /^\s*#/.test(line) ? '' : line;
  });
  defines.sort((a, b) => b.len - a.len);
  const pick = rng(seed ^ 0x51ED270B);
  return lines.map(line => {
    for (let pass = 0; pass < 4 && line; pass++) {
      const before = line;
      for (const d of defines) line = line.replace(d.re, d.value);
      if (line === before) break;
    }
    return line.replace(/random\[\s*([^,\]]+)\s*,\s*([^\]]+)\]/g, (m, a, b) => {
      const lo = parseNumber(a.trim()), hi = parseNumber(b.trim());
      return lo === null || hi === null ? m : String(lo + pick() * (hi - lo));
    });
  }).join('\n');
}

// ---------- Tokenizer and parser ----------

const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?(\/[+-]?(\d+\.?\d*|\.\d+))?$/i;

function parseNumber(t) {
  if (!NUM_RE.test(t)) return null;
  const i = t.indexOf('/');
  if (i < 0) return parseFloat(t);
  return parseFloat(t.slice(0, i)) / parseFloat(t.slice(i + 1));
}

function tokenize(text) {
  const re = /\s+|[{}*>]|\[[^\]]*\]|[^\s{}*>\[\]]+(?:\[[^\]]*\])?|./g;
  const out = [];
  let line = 1, m;
  while ((m = re.exec(text)) !== null) {
    const t = m[0];
    if (/^\s+$/.test(t)) { line += (t.match(/\n/g) || []).length; continue; }
    out.push({ t, line });
    line += (t.match(/\n/g) || []).length;
  }
  return out;
}

function parse(src, seed) {
  const toks = tokenize(preprocess(src, seed));
  let p = 0;
  const peek = (o = 0) => (toks[p + o] ? toks[p + o].t : null);
  const lastLine = () => (toks.length ? toks[Math.min(p, toks.length - 1)].line : 1);
  const next = () => toks[p++];

  const rules = Object.create(null), sets = [], refs = [];
  let nextId = 0;

  function num(what) {
    const tok = next();
    const v = tok ? parseNumber(tok.t) : null;
    if (v === null) throw new ScriptError(what + ' needs a number' + (tok ? ', but found "' + tok.t + '".' : '.'), tok ? tok.line : lastLine());
    return v;
  }
  const isNum = o => peek(o) !== null && parseNumber(peek(o)) !== null;

  function transform() {
    const open = next();
    const t = { M: null, ops: [] };
    const addM = m => { t.M = t.M ? mul(t.M, m) : m; };
    for (;;) {
      const tok = next();
      if (!tok) throw new ScriptError('A { on this line is never closed.', open.line);
      const k = tok.t;
      if (k === '}') break;
      switch (k.toLowerCase()) {
        case 'x': addM(translate(num('x'), 0, 0)); break;
        case 'y': addM(translate(0, num('y'), 0)); break;
        case 'z': addM(translate(0, 0, num('z'))); break;
        case 'rx': addM(rotation('x', num('rx'))); break;
        case 'ry': addM(rotation('y', num('ry'))); break;
        case 'rz': addM(rotation('z', num('rz'))); break;
        case 's': {
          const a = num('s');
          let b = a, c = a;
          if (isNum(0)) { b = num('s'); c = num('s'); }
          addM(aboutPivot(0.5, 0.5, 0.5, linear(a, 0, 0, 0, b, 0, 0, 0, c)));
          break;
        }
        case 'm': {
          const v = [];
          for (let i = 0; i < 9; i++) v.push(num('m'));
          addM(aboutPivot(0.5, 0.5, 0.5, linear.apply(null, v)));
          break;
        }
        case 'fx': addM(aboutPivot(0.5, 0.5, 0.5, linear(-1, 0, 0, 0, 1, 0, 0, 0, 1))); break;
        case 'fy': addM(aboutPivot(0.5, 0.5, 0.5, linear(1, 0, 0, 0, -1, 0, 0, 0, 1))); break;
        case 'fz': addM(aboutPivot(0.5, 0.5, 0.5, linear(1, 0, 0, 0, 1, 0, 0, 0, -1))); break;
        case 'h': case 'hue': t.ops.push({ k: 'h', v: num('hue') }); break;
        case 'sat': t.ops.push({ k: 's', v: num('sat') }); break;
        case 'b': case 'brightness': t.ops.push({ k: 'b', v: num('brightness') }); break;
        case 'a': case 'alpha': t.ops.push({ k: 'a', v: num('alpha') }); break;
        case 'color': {
          const c = next();
          if (!c) throw new ScriptError('color needs a value.', tok.line);
          if (c.t.toLowerCase() === 'random') t.ops.push({ k: 'r' });
          else t.ops.push({ k: 'c', v: rgb2hsv(parseColor(c.t, c.line)) });
          break;
        }
        case 'blend': {
          const c = next();
          if (!c) throw new ScriptError('blend needs a color and a strength.', tok.line);
          const rgb = parseColor(c.t, c.line);
          t.ops.push({ k: 'x', v: rgb, w: num('blend') });
          break;
        }
        default:
          throw new ScriptError('"' + k + '" is not a transform. Use x, y, z, rx, ry, rz, s, m, fx, fy, fz, hue, sat, b, a, color or blend.', tok.line);
      }
    }
    return t;
  }

  function setStatement() {
    const kw = next();
    const key = next();
    const val = next();
    if (!key || !val) throw new ScriptError('set needs a name and a value.', kw.line);
    return { key: key.t.toLowerCase(), value: val.t, line: key.line };
  }

  function action() {
    const loops = [];
    for (;;) {
      if (peek() === '{') {
        loops.push({ n: 1, t: transform() });
      } else if (isNum(0) && peek(1) === '*') {
        const n = Math.max(0, Math.round(num('Loop count')));
        next();
        if (peek() !== '{') throw new ScriptError('A loop needs a { transform } after the *.', toks[p - 1].line);
        loops.push({ n, t: transform() });
      } else break;
    }
    const tok = next();
    if (!tok) throw new ScriptError('The script ends where a rule name was expected.', lastLine());
    if (/^[{}*>\[\]]/.test(tok.t) || parseNumber(tok.t) !== null) {
      throw new ScriptError('Expected a rule name, but found "' + tok.t + '".', tok.line);
    }
    const tri = tok.t.match(/^triangle\[(.*)\]$/is);
    if (tri) {
      const pts = tri[1].split(';').map(s => s.split(',').map(x => parseNumber(x.trim())));
      if (pts.length !== 3 || pts.some(q => q.length !== 3 || q.some(v => v === null))) {
        throw new ScriptError('triangle needs three points, such as triangle[0,0,0;1,0,0;0,1,0].', tok.line);
      }
      return { loops, prim: 'triangle', pts, cls: '' };
    }
    const parts = tok.t.split('::');
    const name = parts[0], cls = (parts[1] || '').toLowerCase();
    if (PRIMS.has(name.toLowerCase())) return { loops, prim: name.toLowerCase(), cls };
    refs.push({ name, line: tok.line });
    return { loops, rule: name };
  }

  const start = [];
  while (p < toks.length) {
    const t = peek();
    const lower = t.toLowerCase();
    if (lower === 'set') {
      sets.push(setStatement());
    } else if (lower === 'rule') {
      const kw = next();
      const nameTok = next();
      if (!nameTok || /^[{}*>]/.test(nameTok.t)) throw new ScriptError('rule needs a name.', kw.line);
      const r = { id: nextId++, name: nameTok.t, weight: 1, md: 0, ret: null, body: [], line: nameTok.line };
      if (PRIMS.has(r.name.toLowerCase())) throw new ScriptError('"' + r.name + '" is a built-in shape, so a rule can\'t use that name.', nameTok.line);
      while (peek() !== '{') {
        const h = next();
        if (!h) throw new ScriptError('Rule "' + r.name + '" has no { body }.', nameTok.line);
        const hk = h.t.toLowerCase();
        if (hk === 'w' || hk === 'weight') r.weight = num('weight');
        else if (hk === 'md' || hk === 'maxdepth') r.md = Math.round(num('maxdepth'));
        else if (h.t === '>') {
          const target = next();
          if (!target) throw new ScriptError('> needs a rule name after it.', h.line);
          r.ret = target.t;
          if (!PRIMS.has(target.t.split('::')[0].toLowerCase())) refs.push({ name: target.t, line: target.line });
        } else throw new ScriptError('"' + h.t + '" can\'t follow a rule name. Use w, md or > there.', h.line);
      }
      const open = next();
      for (;;) {
        if (p >= toks.length) throw new ScriptError('Rule "' + r.name + '" is never closed. Add a } at the end.', open.line);
        if (peek() === '}') { next(); break; }
        if (peek().toLowerCase() === 'set') { r.body.push({ set: setStatement() }); continue; }
        if (peek().toLowerCase() === 'rule') throw new ScriptError('A rule can\'t contain another rule. Close the first one with }.', toks[p].line);
        r.body.push(action());
      }
      (rules[r.name] = rules[r.name] || []).push(r);
    } else {
      start.push(action());
    }
  }
  for (const r of refs) {
    if (!rules[r.name]) throw new ScriptError('Rule "' + r.name + '" is used here but never defined.', r.line);
  }
  return { rules, start, sets };
}

// ---------- Builder ----------

class Buf {
  constructor(stride) { this.stride = stride; this.a = new Float32Array(stride * 256); this.n = 0; }
  slot() {
    if ((this.n + 1) * this.stride > this.a.length) {
      const g = new Float32Array(this.a.length * 2);
      g.set(this.a);
      this.a = g;
    }
    return this.n++ * this.stride;
  }
  done() { return this.a.slice(0, this.n * this.stride); }
}

function build(src, opts) {
  const options = opts || {};
  const t0 = Date.now();
  let seed = options.seed === undefined ? 1 : options.seed | 0;
  const ast = parse(src, seed);
  const warnings = [];
  const warn = w => { if (warnings.indexOf(w) < 0) warnings.push(w); };

  const settings = { maxdepth: 1000, maxobjects: HARD_MAX_OBJECTS, minsize: 0, maxsize: 1e9, background: [0, 0, 0], camera: {}, raytracer: {}, recursion: 'breadth' };
  let sync = false, pool = { kind: 'randomhue' }, seedFromScript = false, usesImagePool = false;

  function applySet(s) {
    const v = s.value, k = s.key;
    const n = parseNumber(v);
    const needNum = () => { if (n === null) throw new ScriptError('set ' + k + ' needs a number, but found "' + v + '".', s.line); return n; };
    const vec = count => {
      const a = v.replace(/[\[\]]/g, ' ').trim().split(/[\s,]+/).map(parseNumber);
      if (a.length !== count || a.some(x => x === null)) throw new ScriptError('set ' + k + ' needs ' + count + ' numbers in brackets.', s.line);
      return a;
    };
    if (k === 'maxdepth' || k === 'md') settings.maxdepth = needNum();
    else if (k === 'maxobjects' || k === 'mo') settings.maxobjects = Math.min(needNum(), HARD_MAX_OBJECTS);
    else if (k === 'minsize') settings.minsize = needNum();
    else if (k === 'maxsize') settings.maxsize = needNum();
    else if (k === 'background') settings.background = parseColor(v, s.line);
    else if (k === 'seed') { if (v.toLowerCase() !== 'initial') { seed = needNum() | 0; seedFromScript = true; } }
    else if (k === 'syncrandom') sync = v.toLowerCase() === 'true';
    else if (k === 'recursion') settings.recursion = v.toLowerCase();
    else if (k === 'colorpool') {
      const lc = v.toLowerCase();
      if (lc === 'randomhue' || lc === 'randomrgb' || lc === 'greyscale') pool = { kind: lc };
      else if (lc.startsWith('list:')) {
        const colors = v.slice(5).split(',').filter(Boolean).map(c => rgb2hsv(parseColor(c, s.line)));
        if (!colors.length) throw new ScriptError('colorpool list: needs at least one color.', s.line);
        pool = { kind: 'list', colors };
      } else if (lc.startsWith('image:')) {
        usesImagePool = true;
        if (options.colorImage) pool = { kind: 'image', image: options.colorImage };
        else warn('This script takes its colors from "' + v.slice(6) + '". Click Color image to choose a picture. Random hues are used until then.');
      } else throw new ScriptError('colorpool must be randomhue, randomrgb, greyscale or list:a,b,c.', s.line);
    }
    else if (k === 'translation') settings.camera.translation = vec(3);
    else if (k === 'rotation') settings.camera.rotation = vec(9);
    else if (k === 'pivot') settings.camera.pivot = vec(3);
    else if (k === 'scale') settings.camera.scale = needNum();
    else if (k === 'perspective-angle') settings.camera.fov = needNum();
    else if (k.startsWith('raytracer::')) settings.raytracer[k.slice(11)] = v;
    else warn('"set ' + k + '" isn\'t supported and was ignored.');
  }
  ast.sets.forEach(applySet);

  // Each state carries its own seed, so `set seed initial` makes branches
  // repeat exactly, whatever order the other branches are processed in.
  let geoA = seed >>> 0;
  const geo = () => {
    geoA = (geoA + 0x6D2B79F5) | 0;
    let t = Math.imul(geoA ^ (geoA >>> 15), 1 | geoA);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const colorStream = rng(seed ^ 0x9E3779B9);
  const col = () => (sync ? geo() : colorStream());
  let entryM = null;
  const sizeOk = m => {
    if (settings.minsize <= 0 && settings.maxsize >= 1e9) return true;
    const dim = Math.hypot(m[0] + m[4] + m[8], m[1] + m[5] + m[9], m[2] + m[6] + m[10]);
    return dim >= settings.minsize && dim <= settings.maxsize;
  };

  const classes = [''];
  const classId = c => {
    let i = classes.indexOf(c);
    if (i < 0) { i = classes.length; classes.push(c); }
    return i;
  };

  const boxes = new Buf(17), spheres = new Buf(17), cylinders = new Buf(17), grids = new Buf(17), tris = new Buf(14), lines = new Buf(10), dots = new Buf(7);
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const grow = (x, y, z) => {
    if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (z < bb[2]) bb[2] = z;
    if (x > bb[3]) bb[3] = x; if (y > bb[4]) bb[4] = y; if (z > bb[5]) bb[5] = z;
  };

  let objects = 0, steps = 0, maxGen = 0;
  let hitDepth = false, hitObjects = false, hitPending = false, hitSteps = false;

  function emit(a, st) {
    if (objects >= settings.maxobjects) { hitObjects = true; return; }
    const m = st.m;
    if (!sizeOk(m)) return;
    const [r, g, b] = hsv2rgb(st.h, st.s, st.v);
    const kind = a.prim;
    if (kind === 'template') { warn('Template primitives aren\'t supported and were skipped.'); return; }
    // A mesh joins the square of the calling rule's state to this state's square.
    if (kind === 'mesh' && !st.p) return;
    objects++;
    const cid = a.cls ? classId(a.cls) : 0;
    if (kind === 'mesh') {
      const corner = (q, u, v) => [q[0] * u + q[4] * v + q[12], q[1] * u + q[5] * v + q[13], q[2] * u + q[6] * v + q[14]];
      const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let i = 0; i < 4; i++) {
        const [u0, v0] = square[i], [u1, v1] = square[(i + 1) % 4];
        const a0 = corner(st.p, u0, v0), a1 = corner(st.p, u1, v1), b0 = corner(m, u0, v0), b1 = corner(m, u1, v1);
        for (const tri of [[a0, a1, b1], [a0, b1, b0]]) {
          const o = tris.slot(), d = tris.a;
          for (let k = 0; k < 3; k++) {
            d[o + k * 3] = tri[k][0]; d[o + k * 3 + 1] = tri[k][1]; d[o + k * 3 + 2] = tri[k][2];
            grow(tri[k][0], tri[k][1], tri[k][2]);
          }
          d[o + 9] = r; d[o + 10] = g; d[o + 11] = b; d[o + 12] = st.a; d[o + 13] = cid;
        }
      }
    } else if (kind === 'box' || kind === 'sphere' || kind === 'cylinder' || kind === 'grid') {
      const buf = kind === 'box' ? boxes : kind === 'sphere' ? spheres : kind === 'cylinder' ? cylinders : grids;
      const o = buf.slot(), d = buf.a;
      d[o] = m[0]; d[o + 1] = m[1]; d[o + 2] = m[2];
      d[o + 3] = m[4]; d[o + 4] = m[5]; d[o + 5] = m[6];
      d[o + 6] = m[8]; d[o + 7] = m[9]; d[o + 8] = m[10];
      d[o + 9] = m[12]; d[o + 10] = m[13]; d[o + 11] = m[14];
      d[o + 12] = r; d[o + 13] = g; d[o + 14] = b; d[o + 15] = st.a; d[o + 16] = cid;
      for (let i = 0; i < 8; i++) {
        const ux = i & 1, uy = (i >> 1) & 1, uz = (i >> 2) & 1;
        grow(m[0] * ux + m[4] * uy + m[8] * uz + m[12], m[1] * ux + m[5] * uy + m[9] * uz + m[13], m[2] * ux + m[6] * uy + m[10] * uz + m[14]);
      }
    } else if (kind === 'triangle') {
      if (!a.pts) { warn('A triangle without points was skipped.'); objects--; return; }
      const o = tris.slot(), d = tris.a;
      for (let i = 0; i < 3; i++) {
        const q = a.pts[i];
        const x = m[0] * q[0] + m[4] * q[1] + m[8] * q[2] + m[12];
        const y = m[1] * q[0] + m[5] * q[1] + m[9] * q[2] + m[13];
        const z = m[2] * q[0] + m[6] * q[1] + m[10] * q[2] + m[14];
        d[o + i * 3] = x; d[o + i * 3 + 1] = y; d[o + i * 3 + 2] = z;
        grow(x, y, z);
      }
      d[o + 9] = r; d[o + 10] = g; d[o + 11] = b; d[o + 12] = st.a; d[o + 13] = cid;
    } else if (kind === 'line') {
      const o = lines.slot(), d = lines.a;
      const cx = 0.5 * (m[4] + m[8]), cy = 0.5 * (m[5] + m[9]), cz = 0.5 * (m[6] + m[10]);
      const x1 = cx + m[12], y1 = cy + m[13], z1 = cz + m[14];
      const x2 = x1 + m[0], y2 = y1 + m[1], z2 = z1 + m[2];
      d[o] = x1; d[o + 1] = y1; d[o + 2] = z1; d[o + 3] = x2; d[o + 4] = y2; d[o + 5] = z2;
      d[o + 6] = r; d[o + 7] = g; d[o + 8] = b; d[o + 9] = st.a;
      grow(x1, y1, z1); grow(x2, y2, z2);
    } else if (kind === 'dot') {
      const o = dots.slot(), d = dots.a;
      const x = 0.5 * (m[0] + m[4] + m[8]) + m[12], y = 0.5 * (m[1] + m[5] + m[9]) + m[13], z = 0.5 * (m[2] + m[6] + m[10]) + m[14];
      d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = r; d[o + 4] = g; d[o + 5] = b; d[o + 6] = st.a;
      grow(x, y, z);
    }
  }

  function poolColor() {
    if (pool.kind === 'randomhue') return [col() * 360, 1, 1];
    if (pool.kind === 'randomrgb') return rgb2hsv([col(), col(), col()]);
    if (pool.kind === 'greyscale') return [0, 0, col()];
    if (pool.kind === 'image') {
      const { width, height, data } = pool.image;
      const o = (Math.floor(col() * height) * width + Math.floor(col() * width)) * 4;
      return rgb2hsv([data[o] / 255, data[o + 1] / 255, data[o + 2] / 255]);
    }
    return pool.colors[Math.floor(col() * pool.colors.length)];
  }

  function applyT(st, t) {
    const o = { m: t.M ? mul(st.m, t.M) : st.m, h: st.h, s: st.s, v: st.v, a: st.a, d: st.d, g: st.g, p: st.p };
    for (const op of t.ops) {
      switch (op.k) {
        case 'h': o.h = (((o.h + op.v) % 360) + 360) % 360; break;
        case 's': o.s = Math.min(1, Math.max(0, o.s * op.v)); break;
        case 'b': o.v = Math.min(1, Math.max(0, o.v * op.v)); break;
        case 'a': o.a = Math.min(1, Math.max(0, o.a * op.v)); break;
        case 'c': o.h = op.v[0]; o.s = op.v[1]; o.v = op.v[2]; break;
        case 'r': { const c = poolColor(); o.h = c[0]; o.s = c[1]; o.v = c[2]; break; }
        case 'x': {
          const c = hsv2rgb(o.h, o.s, o.v), w = Math.min(1, Math.max(0, op.w));
          const m = rgb2hsv([c[0] + (op.v[0] - c[0]) * w, c[1] + (op.v[1] - c[1]) * w, c[2] + (op.v[2] - c[2]) * w]);
          o.h = m[0]; o.s = m[1]; o.v = m[2];
          break;
        }
      }
    }
    return o;
  }

  const depthFirst = settings.recursion === 'depth';
  let cur = [], nxt = [];

  function schedule(name, st) {
    if (st.g >= settings.maxdepth) { hitDepth = true; return; }
    if (cur.length + nxt.length >= HARD_MAX_PENDING) { hitPending = true; return; }
    const item = { name, st: { m: st.m, h: st.h, s: st.s, v: st.v, a: st.a, d: st.d, g: st.g + 1, p: entryM, q: Math.floor(geo() * 4294967296) } };
    (depthFirst ? cur : nxt).push(item);
  }

  function runAction(a, i, st) {
    if (hitObjects || hitPending) return;
    if (i === a.loops.length) {
      if (a.prim) emit(a, st);
      else schedule(a.rule, st);
      return;
    }
    const loop = a.loops[i];
    let s2 = st;
    for (let k = 0; k < loop.n; k++) {
      s2 = applyT(s2, loop.t);
      runAction(a, i + 1, s2);
    }
  }

  function applyRule(name, st) {
    if (!sizeOk(st.m)) return;
    geoA = st.q;
    entryM = st.m;
    const group = ast.rules[name];
    let r = group[0];
    if (group.length > 1) {
      let total = 0;
      for (const g of group) total += g.weight;
      let x = geo() * total;
      for (const g of group) { x -= g.weight; r = g; if (x < 0) break; }
    }
    let state = st;
    if (r.md > 0) {
      const left = st.d && st.d[r.id] !== undefined ? st.d[r.id] : r.md;
      const d = Object.assign({}, st.d);
      if (left <= 0) {
        delete d[r.id];
        if (!r.ret) return;
        const target = r.ret.split('::');
        const retSt = Object.assign({}, st, { d });
        if (PRIMS.has(target[0].toLowerCase())) emit({ prim: target[0].toLowerCase(), cls: (target[1] || '').toLowerCase() }, retSt);
        else schedule(r.ret, retSt);
        return;
      }
      d[r.id] = left - 1;
      state = Object.assign({}, st, { d });
    }
    for (const a of r.body) {
      if (a.set) {
        applySet(a.set);
        if (a.set.key === 'seed') geoA = seed >>> 0;
        continue;
      }
      runAction(a, 0, state);
    }
  }

  const initial = { m: identity(), h: 0, s: 1, v: 1, a: 1, d: null, g: 0, p: null };
  for (const a of ast.start) runAction(a, 0, initial);
  if (!depthFirst) { cur = nxt; nxt = []; }

  const progress = options.onProgress;
  outer: while (cur.length) {
    if (depthFirst) {
      while (cur.length) {
        if (hitObjects) break outer;
        if (++steps > HARD_MAX_STEPS) { hitSteps = true; break outer; }
        const item = cur.pop();
        if (item.st.g > maxGen) maxGen = item.st.g;
        applyRule(item.name, item.st);
        if (progress && (steps & 0x3FFFF) === 0) progress(objects);
      }
    } else {
      for (let i = 0; i < cur.length; i++) {
        if (hitObjects) break outer;
        if (++steps > HARD_MAX_STEPS) { hitSteps = true; break outer; }
        const item = cur[i];
        cur[i] = null;
        if (item.st.g > maxGen) maxGen = item.st.g;
        applyRule(item.name, item.st);
        if (progress && (steps & 0x3FFFF) === 0) progress(objects);
      }
      cur = nxt;
      nxt = [];
    }
  }

  if (hitObjects) {
    warn(settings.maxobjects < HARD_MAX_OBJECTS
      ? 'Stopped at ' + settings.maxobjects.toLocaleString('en-US') + ' objects, the maxobjects limit set in this script.'
      : 'Stopped at 1,000,000 objects, the limit on this page. Lower the recursion depth to see the whole structure.');
  }
  if (hitPending || hitSteps) warn('Stopped early because this script keeps branching without limit. Add md to the rule that repeats.');

  return {
    boxes: boxes.done(), spheres: spheres.done(), cylinders: cylinders.done(), grids: grids.done(), tris: tris.done(), lines: lines.done(), dots: dots.done(),
    bounds: objects ? bb : [0, 0, 0, 1, 1, 1],
    settings, classes, seed, seedFromScript, usesImagePool, warnings,
    stats: { objects, generations: maxGen, steps, ms: Date.now() - t0, hitDepth },
  };
}

const api = { parse, build, ScriptError };
root.EisenEngine = api;

if (typeof importScripts === 'function' && typeof self !== 'undefined' && typeof document === 'undefined') {
  self.onmessage = e => {
    const { id, src, seed, colorImage } = e.data;
    try {
      const r = build(src, { seed, colorImage, onProgress: n => self.postMessage({ id, progress: n }) });
      self.postMessage({ id, ok: true, result: r }, [r.boxes.buffer, r.spheres.buffer, r.cylinders.buffer, r.grids.buffer, r.tris.buffer, r.lines.buffer, r.dots.buffer]);
    } catch (err) {
      self.postMessage({ id, ok: false, message: err.message, line: err.line || null });
    }
  };
}
})(typeof globalThis !== 'undefined' ? globalThis : this);
