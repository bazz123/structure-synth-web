'use strict';
// The script editor: CodeMirror 6 with EisenScript colors, completion and
// error marks. Needs vendor/codemirror.js (the global CM) and engine.js.
(function () {

const TRANSFORMS = {
  x: 'Move along x', y: 'Move along y', z: 'Move along z',
  rx: 'Rotate around x, in degrees', ry: 'Rotate around y, in degrees', rz: 'Rotate around z, in degrees',
  s: 'Scale: one value, or x y z', m: 'Apply a 3x3 matrix (9 values)',
  fx: 'Mirror in x', fy: 'Mirror in y', fz: 'Mirror in z',
  hue: 'Add to the hue, in degrees', h: 'Add to the hue, in degrees',
  sat: 'Multiply the saturation', b: 'Multiply the brightness', brightness: 'Multiply the brightness',
  a: 'Multiply the alpha', alpha: 'Multiply the alpha',
  color: 'Set a color, or "random" from the color pool', blend: 'Mix toward a color: blend red 0.3',
};
const SHAPES = {
  box: 'Unit box', sphere: 'Sphere inside the unit box', cylinder: 'Cylinder along x',
  grid: 'Wireframe box', line: 'Line along x', dot: 'Point at the box center',
  mesh: 'Joins this state to the calling rule\'s state', triangle: 'triangle[x,y,z;x,y,z;x,y,z]',
};
const RULE_MODS = { w: 'Weight', weight: 'Weight', md: 'Maximum depth', maxdepth: 'Maximum depth' };
const SET_KEYS = {
  maxdepth: 'Generations before the build stops', maxobjects: 'Objects before the build stops',
  minsize: 'Skip anything smaller', maxsize: 'Skip anything larger', seed: 'Random seed, or initial',
  background: 'Background color', colorpool: 'Where color random picks from',
  recursion: 'depth or breadth', syncrandom: 'true: colors share the shape random stream',
  translation: 'Saved camera: [x y z]', rotation: 'Saved camera: 9 values', pivot: 'Saved camera: [x y z]',
  scale: 'Saved camera zoom', 'perspective-angle': 'Field of view in degrees',
  'raytracer::samples': 'N means N x N samples per pixel', 'raytracer::shadows': 'true or false',
  'raytracer::phong': '[ambient,diffuse,specular]', 'raytracer::reflection': 'Reflection, 0 to 1',
  'raytracer::ambient-occlusion-samples': 'Rays per sample for ambient occlusion',
  'raytracer::dof': '[focal plane,aperture]',
};
const POOLS = { randomhue: 'Random hue', randomrgb: 'Random R, G and B', greyscale: 'Random grey', 'list:': 'list:red,orange,#fff', 'image:': 'Pixels from the picture chosen with Color image' };
const COLOR_NAMES = (globalThis.EisenEngine && EisenEngine.colorNames) || [];

// ---------- Highlighting ----------

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?(\/[+-]?(\d+\.?\d*|\.\d+))?/i;

const eisenScript = CM.StreamLanguage.define({
  name: 'eisenscript',
  startState: () => ({ comment: false, after: null, header: false, braces: [] }),
  copyState: s => ({ comment: s.comment, after: s.after, header: s.header, braces: s.braces.slice() }),
  token(stream, st) {
    if (st.comment) {
      if (stream.skipTo('*/')) { stream.match('*/'); st.comment = false; } else stream.skipToEnd();
      return 'comment';
    }
    if (stream.sol() && st.after !== 'block') st.after = st.after === 'rule' ? 'rule' : null;
    if (stream.eatSpace()) return null;
    if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }
    if (stream.match('/*')) { st.comment = true; return 'comment'; }
    if (stream.match(/^#define\b/)) { st.after = 'define'; return 'meta'; }
    if (stream.match(/^#[0-9a-f]{3,8}\b/i)) return 'color';
    if (stream.match(/^\[[^\]]*\]/)) return 'string';
    if (stream.match('{')) {
      st.braces.push(st.header ? 'rule' : 'transform');
      st.header = false;
      return 'brace';
    }
    if (stream.match('}')) { st.braces.pop(); return 'brace'; }
    if (stream.match(/^[*>]/)) return 'operator';
    if (stream.match(/^\(\s*(float|int)\s*:[^)]*\)/i)) return 'meta';
    if (stream.match(NUMBER)) return 'number';
    const word = stream.match(/^[A-Za-z_][\w:.\-]*/);
    if (!word) { stream.next(); return null; }
    const w = word[0], lower = w.toLowerCase(), base = lower.split('::')[0].replace(/\[.*$/, '');
    if (stream.match(/^\[[^\]]*\]/)) return 'shape';
    if (st.after === 'define') { st.after = null; return 'defName'; }
    if (st.after === 'rule') { st.after = null; st.header = true; return 'ruleDef'; }
    if (st.after === 'set') { st.after = 'setValue'; return 'setKey'; }
    if (st.after === 'setValue') { st.after = null; return 'atom'; }
    if (lower === 'rule') { st.after = 'rule'; return 'keyword'; }
    if (lower === 'set') { st.after = 'set'; return 'keyword'; }
    if (st.header && RULE_MODS[lower]) return 'modifier';
    if (st.braces[st.braces.length - 1] === 'transform') {
      if (TRANSFORMS[lower]) return 'transform';
      return 'atom';
    }
    if (SHAPES[base]) return 'shape';
    return 'variableName';
  },
  tokenTable: {
    ruleDef: CM.tags.definition(CM.tags.variableName),
    defName: CM.tags.definition(CM.tags.constant(CM.tags.name)),
    setKey: CM.tags.propertyName,
    transform: CM.tags.propertyName,
    shape: CM.tags.typeName,
    modifier: CM.tags.modifier,
    color: CM.tags.color,
  },
  languageData: { commentTokens: { line: '//', block: { open: '/*', close: '*/' } } },
});

const highlight = CM.HighlightStyle.define([
  { tag: CM.tags.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [CM.tags.keyword, CM.tags.modifier], color: 'var(--syn-keyword)', fontWeight: '600' },
  { tag: CM.tags.meta, color: 'var(--syn-keyword)' },
  { tag: CM.tags.definition(CM.tags.variableName), color: 'var(--syn-rule)', fontWeight: '600' },
  { tag: CM.tags.definition(CM.tags.constant(CM.tags.name)), color: 'var(--syn-number)', fontWeight: '600' },
  { tag: CM.tags.variableName, color: 'var(--syn-rule)' },
  { tag: CM.tags.propertyName, color: 'var(--syn-transform)' },
  { tag: CM.tags.typeName, color: 'var(--syn-shape)', fontWeight: '600' },
  { tag: [CM.tags.number, CM.tags.string], color: 'var(--syn-number)' },
  { tag: [CM.tags.atom, CM.tags.color], color: 'var(--syn-atom)' },
  { tag: [CM.tags.brace, CM.tags.operator], color: 'var(--muted)' },
]);

// ---------- Completion ----------

const option = (label, type, detail, extra) => Object.assign({ label, type, detail }, extra);

function complete(ctx) {
  const word = ctx.matchBefore(/[\w:.\-#]*/);
  if (!word) return null;
  // Right after `set`, `colorpool` or `color`, suggestions open before any letter is typed.
  let afterKeyword = false;
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, word.from - line.from);
  const text = ctx.state.doc.sliceString(0, word.from);
  const textNoComments = text.replace(/\/\*[\s\S]*?(\*\/|$)/g, '').replace(/\/\/[^\n]*/g, '');
  const open = textNoComments.lastIndexOf('{'), close = textNoComments.lastIndexOf('}');
  const lastRule = textNoComments.lastIndexOf('rule');
  const inTransform = open > close && !/\brule\b[^{}]*$/.test(textNoComments.slice(0, open)) && !(lastRule > close && lastRule < open && !/[{}]/.test(textNoComments.slice(lastRule, open)));

  let options = [];
  if (/^\s*set\s+$/i.test(before)) {
    afterKeyword = true;
    options = Object.keys(SET_KEYS).map(k => option(k, 'property', SET_KEYS[k]));
  } else if (/^\s*set\s+colorpool\s+$/i.test(before)) {
    afterKeyword = true;
    options = Object.keys(POOLS).map(k => option(k, 'enum', POOLS[k]));
  } else if (/^\s*set\s+background\s+$/i.test(before) || /\b(color|blend)\s+$/i.test(before)) {
    afterKeyword = true;
    options = COLOR_NAMES.map(c => option(c, 'constant'));
    if (/\bcolor\s+$/i.test(before)) options.unshift(option('random', 'keyword', 'Pick from the color pool', { boost: 50 }));
  } else if (inTransform) {
    options = Object.keys(TRANSFORMS).map(k => option(k, 'property', TRANSFORMS[k]));
  } else if (/\brule\s+\S+[^{]*$/i.test(before) && !/\{/.test(before.split(/\brule\b/i).pop())) {
    options = Object.keys(RULE_MODS).map(k => option(k, 'keyword', RULE_MODS[k]));
  } else {
    const rules = new Set();
    const doc = ctx.state.doc.toString();
    for (const m of doc.matchAll(/\brule\s+([A-Za-z_][\w]*)/gi)) rules.add(m[1]);
    options = [
      ...[...rules].map(r => option(r, 'function', 'rule', { boost: 20 })),
      ...Object.keys(SHAPES).map(k => option(k, 'type', SHAPES[k], { boost: 10 })),
      option('rule', 'keyword', 'Define a rule', { apply: 'rule ' }),
      option('set', 'keyword', 'Change a setting', { apply: 'set ' }),
      option('#define', 'keyword', 'Name a value', { apply: '#define ' }),
    ];
  }
  if (word.from === word.to && !ctx.explicit && !afterKeyword) return null;
  return { from: word.from, options, validFor: /^[\w:.\-#]*$/ };
}

// ---------- Look ----------

const theme = CM.EditorView.theme({
  '&': { height: '100%', fontSize: '13px', color: 'var(--fg)', backgroundColor: 'var(--panel)' },
  '.cm-scroller': { fontFamily: 'var(--code)', lineHeight: '20px' },
  '.cm-content': { caretColor: 'var(--fg)', padding: '10px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--selection) !important' },
  '.cm-gutters': { backgroundColor: 'var(--panel-2)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--active-line)', color: 'var(--fg)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--selection)', outline: '1px solid var(--line)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--active-line)' },
  '.cm-tooltip': { backgroundColor: 'var(--panel)', color: 'var(--fg)', border: '1px solid var(--line)', borderRadius: '5px' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--code)', fontSize: '12.5px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' },
  '.cm-completionDetail': { color: 'inherit', opacity: 0.7, fontStyle: 'normal', marginLeft: '1em', fontFamily: 'var(--ui)' },
  '.cm-panels': { backgroundColor: 'var(--panel-2)', color: 'var(--fg)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--line)' },
  '.cm-textfield': { backgroundColor: 'var(--panel)', color: 'var(--fg)', border: '1px solid var(--line)', borderRadius: '4px' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--panel)', color: 'var(--fg)', border: '1px solid var(--line)', borderRadius: '4px' },
  '.cm-diagnostic-error': { borderLeftColor: 'var(--bad)' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--bad)', textUnderlineOffset: '3px' },
  '.cm-lint-marker-error': { content: 'none' },
});

// ---------- Editor ----------

globalThis.createEisenEditor = function (parent, { onChange, onRun }) {
  let quiet = false;
  const view = new CM.EditorView({
    parent,
    state: CM.EditorState.create({
      doc: '',
      extensions: [
        CM.keymap.of([{ key: 'Mod-Enter', run: () => { onRun(); return true; } }]),
        CM.lineNumbers(), CM.highlightActiveLineGutter(), CM.highlightSpecialChars(), CM.history(),
        CM.foldGutter(), CM.drawSelection(), CM.dropCursor(), CM.indentOnInput(), CM.bracketMatching(),
        CM.closeBrackets(), CM.autocompletion({ override: [complete], icons: false }), CM.rectangularSelection(),
        CM.crosshairCursor(), CM.highlightActiveLine(), CM.highlightSelectionMatches(), CM.lintGutter(),
        CM.indentUnit.of('  '), CM.EditorState.tabSize.of(2),
        CM.keymap.of([
          ...CM.closeBracketsKeymap, ...CM.defaultKeymap, ...CM.searchKeymap, ...CM.historyKeymap,
          ...CM.foldKeymap, ...CM.completionKeymap, ...CM.lintKeymap, CM.indentWithTab,
        ]),
        eisenScript, CM.syntaxHighlighting(highlight), theme, CM.EditorView.lineWrapping,
        CM.EditorView.contentAttributes.of({ 'aria-label': 'EisenScript', spellcheck: 'false', autocapitalize: 'off' }),
        CM.EditorView.updateListener.of(u => { if (u.docChanged && !quiet) onChange(); }),
      ],
    }),
  });

  return {
    view,
    getText: () => view.state.doc.toString(),
    // Replaces the script without counting as an edit by the viewer.
    setText(text) {
      quiet = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: 0 }, scrollIntoView: true });
      quiet = false;
      view.scrollDOM.scrollTop = 0;
    },
    setError(line, message) {
      const doc = view.state.doc;
      let from = 0, to = doc.length;
      if (line) {
        const l = doc.line(Math.min(Math.max(1, line), doc.lines));
        from = l.from; to = l.to;
        const indent = l.text.match(/^\s*/)[0].length;
        if (indent < l.length) from += indent;
      } else to = Math.min(to, doc.line(1).to);
      view.dispatch(CM.setDiagnostics(view.state, [{ from, to, severity: 'error', message }]));
    },
    clearError() { view.dispatch(CM.setDiagnostics(view.state, [])); },
    // Changes part of the script for a slider. It can be undone, but doesn't
    // count as typing, so it doesn't schedule the usual delayed build.
    replace(from, to, text) {
      quiet = true;
      view.dispatch({ changes: { from, to, insert: text }, userEvent: 'input.slider' });
      quiet = false;
    },
    focus() { view.focus(); },
  };
};
})();
