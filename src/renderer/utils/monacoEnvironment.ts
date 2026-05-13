import type { AppLanguage } from '../../shared/i18n';

type MonacoModule = typeof import('monaco-editor');
type MonacoGlobal = typeof globalThis & {
  _VSCODE_NLS_LANGUAGE?: string;
  _VSCODE_NLS_MESSAGES?: Array<string | null>;
};

let monacoPromise: Promise<MonacoModule> | null = null;
let monacoReady = false;

export async function ensureMonacoEnvironment(language: AppLanguage = 'zh-CN'): Promise<MonacoModule> {
  if (monacoPromise) {
    return monacoPromise;
  }

  monacoPromise = (async () => {
    await import('monaco-editor/min/vs/editor/editor.main.css');
    await configureMonacoNls(language);

    const [
      monaco,
      editorWorker,
      jsonWorker,
      cssWorker,
      htmlWorker,
      tsWorker,
    ] = await Promise.all([
      import('monaco-editor'),
      import('monaco-editor/esm/vs/editor/editor.worker?worker'),
      import('monaco-editor/esm/vs/language/json/json.worker?worker'),
      import('monaco-editor/esm/vs/language/css/css.worker?worker'),
      import('monaco-editor/esm/vs/language/html/html.worker?worker'),
      import('monaco-editor/esm/vs/language/typescript/ts.worker?worker'),
    ]);

    if (!monacoReady) {
      (self as typeof globalThis & {
        MonacoEnvironment?: {
          getWorker: (_moduleId: string, label: string) => Worker;
        };
      }).MonacoEnvironment = {
        getWorker: (_moduleId, label) => {
          switch (label) {
            case 'json':
              return new jsonWorker.default();
            case 'css':
            case 'scss':
            case 'less':
              return new cssWorker.default();
            case 'html':
            case 'handlebars':
            case 'razor':
              return new htmlWorker.default();
            case 'typescript':
            case 'javascript':
              return new tsWorker.default();
            default:
              return new editorWorker.default();
          }
        },
      };

      monaco.editor.defineTheme('synapse-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '71717A' },
          { token: 'string', foreground: 'A7F3D0' },
          { token: 'number', foreground: 'FDE68A' },
          { token: 'regexp', foreground: 'FDA4AF' },
          { token: 'keyword', foreground: '93C5FD' },
          { token: 'keyword.operator', foreground: 'C4B5FD' },
          { token: 'delimiter', foreground: 'A1A1AA' },
          { token: 'delimiter.bracket', foreground: 'D4D4D8' },
          { token: 'type', foreground: 'F9A8D4' },
          { token: 'type.identifier', foreground: 'F9A8D4' },
          { token: 'class', foreground: 'F5D0FE' },
          { token: 'class.identifier', foreground: 'F5D0FE' },
          { token: 'interface', foreground: 'BFDBFE' },
          { token: 'enum', foreground: 'F0ABFC' },
          { token: 'function', foreground: 'FCA5A5' },
          { token: 'function.identifier', foreground: 'FCA5A5' },
          { token: 'method', foreground: 'FDBA74' },
          { token: 'variable', foreground: 'E4E4E7' },
          { token: 'variable.parameter', foreground: 'C4B5FD' },
          { token: 'variable.predefined', foreground: '7DD3FC' },
          { token: 'constant', foreground: 'FCD34D' },
          { token: 'constant.language', foreground: 'FCD34D' },
          { token: 'tag', foreground: '7DD3FC' },
          { token: 'attribute.name', foreground: 'FDBA74' },
          { token: 'attribute.value', foreground: 'A7F3D0' },
        ],
        colors: {
          'editor.background': '#00000000',
          'editorGutter.background': '#00000000',
          'editor.foreground': '#e4e4e7',
          'editorLineNumber.dimmedForeground': '#3f3f46',
          'editorLineNumber.foreground': '#52525b',
          'editorLineNumber.activeForeground': '#e4e4e7',
          'editorCursor.foreground': '#e4e4e7',
          'editor.selectionBackground': '#3f3f46',
          'editor.inactiveSelectionBackground': '#27272a',
          'editor.selectionHighlightBackground': '#3f3f4633',
          'editor.wordHighlightBackground': '#52525b33',
          'editor.wordHighlightStrongBackground': '#71717a40',
          'editor.findMatchBackground': '#1d4ed8aa',
          'editor.findMatchHighlightBackground': '#1e40af55',
          'editor.findRangeHighlightBackground': '#27272a',
          'editor.hoverHighlightBackground': '#18181b',
          'editor.lineHighlightBackground': '#18181b',
          'editor.lineHighlightBorder': '#00000000',
          'editorWhitespace.foreground': '#27272a',
          'editorBracketMatch.background': '#3f3f461a',
          'editorBracketMatch.border': '#71717a',
          'editorIndentGuide.background1': '#1f1f23',
          'editorIndentGuide.activeBackground1': '#3f3f46',
          'editorBracketHighlight.foreground1': '#93c5fd',
          'editorBracketHighlight.foreground2': '#c4b5fd',
          'editorBracketHighlight.foreground3': '#f9a8d4',
          'editorBracketHighlight.unexpectedBracket.foreground': '#f87171',
          'editorInfo.foreground': '#38bdf8',
          'editorWarning.foreground': '#f59e0b',
          'editorError.foreground': '#f87171',
          'editorHint.foreground': '#22c55e',
          'editorOverviewRuler.border': '#00000000',
          'minimap.background': '#00000000',
          'editorHoverWidget.background': '#111114',
          'editorHoverWidget.border': '#27272a',
          'editorSuggestWidget.background': '#111114',
          'editorSuggestWidget.border': '#27272a',
          'editorSuggestWidget.selectedBackground': '#27272a',
          'editorWidget.background': '#111114',
          'editorWidget.border': '#27272a',
          'scrollbarSlider.background': '#3f3f4640',
          'scrollbarSlider.hoverBackground': '#52525b66',
          'scrollbarSlider.activeBackground': '#71717a80',
          'diffEditor.insertedTextBackground': '#14532d55',
          'diffEditor.removedTextBackground': '#7f1d1d55',
          'diffEditor.insertedLineBackground': '#052e163d',
          'diffEditor.removedLineBackground': '#450a0a3d',
        },
      });
      monaco.editor.setTheme('synapse-dark');
      monacoReady = true;
    }

    return monaco;
  })();

  return monacoPromise;
}

export async function configureMonacoNls(language: AppLanguage): Promise<void> {
  const monacoGlobal = globalThis as MonacoGlobal;

  if (language === 'zh-CN') {
    await import('monaco-editor/esm/nls.messages.zh-cn.js');
    return;
  }

  delete monacoGlobal._VSCODE_NLS_MESSAGES;
  monacoGlobal._VSCODE_NLS_LANGUAGE = 'en';
}
