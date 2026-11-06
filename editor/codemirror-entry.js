// The CodeMirror 6 pieces the page uses, bundled into vendor/codemirror.js as
// the global CM. Rebuild with: npm run build:editor
export { EditorState, Compartment } from '@codemirror/state';
export {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  highlightSpecialChars, drawSelection, rectangularSelection, crosshairCursor, dropCursor,
} from '@codemirror/view';
export {
  StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput,
  indentUnit, foldGutter, foldKeymap,
} from '@codemirror/language';
export { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment } from '@codemirror/commands';
export {
  autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap,
} from '@codemirror/autocomplete';
export { setDiagnostics, lintGutter, lintKeymap } from '@codemirror/lint';
export { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
export { tags } from '@lezer/highlight';
