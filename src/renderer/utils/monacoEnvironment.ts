type MonacoModule = typeof import('monaco-editor');

let monacoPromise: Promise<MonacoModule> | null = null;
let monacoReady = false;

export async function ensureMonacoEnvironment(): Promise<MonacoModule> {
  if (monacoPromise) {
    return monacoPromise;
  }

  monacoPromise = (async () => {
    await import('monaco-editor/min/vs/editor/editor.main.css');

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

      monaco.editor.defineTheme('copilot-terminal-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#09090b',
          'editorGutter.background': '#09090b',
          'editorLineNumber.foreground': '#52525b',
          'editorLineNumber.activeForeground': '#e4e4e7',
          'editorCursor.foreground': '#e4e4e7',
          'editor.selectionBackground': '#3f3f46',
          'editor.inactiveSelectionBackground': '#27272a',
          'editorIndentGuide.background1': '#1f1f23',
          'editorIndentGuide.activeBackground1': '#3f3f46',
        },
      });
      monaco.editor.setTheme('copilot-terminal-dark');
      monacoReady = true;
    }

    return monaco;
  })();

  return monacoPromise;
}
