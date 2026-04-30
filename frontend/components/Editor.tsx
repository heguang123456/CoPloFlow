import { useEffect, useRef, useCallback, useMemo, memo } from 'react';
import Editor, { OnMount, loader } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { useTheme } from './ThemeProvider';

// 配置 Monaco 使用本地文件而非 CDN（Tauri WebView 兼容）
// @ts-ignore
loader.config({
  paths: {
    vs: `${typeof window !== 'undefined' ? window.location.origin : ''}/monaco/vs`,
  },
});

// 扩展 Window 类型声明
declare global {
  interface Window {
    __CODELENS_CURRENT_FILE__?: string;
    __MONACO_EDITOR__?: any;
  }
}

/**
 * Monaco Editor 组件属性
 */
interface EditorProps {
  filePath: string | null;
  content: string;
  language: string;
  onCursorMove?: (line: number, col: number) => void;
  onGoToDefinition?: (targetFilePath: string, line: number, col: number) => void;
  onFindReferences?: (symbolName: string, line: number, col: number) => void;
}

/**
 * Tree-sitter 高亮区间
 */
interface HighlightRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  scope: string;
}

/**
 * scope → Monaco token 类型映射
 */
const SCOPE_TO_TOKEN: Record<string, string[]> = {
  'keyword.control': ['keyword', 'control'],
  'keyword.declaration.type': ['keyword', 'declaration'],
  'keyword.modifier': ['keyword', 'modifier'],
  'keyword.type': ['keyword', 'type'],
  'keyword.preprocessor': ['keyword', 'preprocessor'],
  'string': ['string'],
  'string.escape': ['string', 'escape'],
  'constant.numeric': ['number'],
  'constant.language': ['constant', 'language'],
  'comment': ['comment'],
  'variable.name': ['variable', 'name'],
  'entity.name.function': ['entity', 'name', 'function'],
  'entity.name.type': ['type', 'identifier'],
  'type': ['type', 'identifier'],
};

/**
 * 语义高亮缓存（OPT-008）
 *
 * key: filePath + content 长度 + 前 256 字符（简单 hash）
 * value: Monaco decorations 数组
 *
 * 适用于只读阅读器场景。如果用户未来编辑文件内容，
 * 需要配合 content hash 或 mtime 做失效判断。
 */
const highlightCache = new Map<string, MonacoEditor.IModelDeltaDecoration[]>();

/** 生成缓存 key：filePath + 内容长度 + 前 256 字符 */
function getCacheKey(filePath: string, content: string): string {
  const prefix = content.substring(0, 256);
  return `${filePath}|${content.length}|${prefix}`;
}

/**
 * CodeLens 自定义语义高亮语言定义
 */
function registerCodelensLanguage(monaco: any) {
  monaco.languages.register({ id: 'codelens-cpp' });

  monaco.languages.setMonarchTokensProvider('codelens-cpp', {
    defaultToken: '',
    tokenPostfix: '.cpp',

    keywords: [
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
      'continue', 'return', 'goto', 'try', 'catch', 'throw', 'using',
      'namespace', 'class', 'struct', 'enum', 'union', 'template',
      'typedef', 'typename', 'virtual', 'override', 'final',
      'public', 'private', 'protected', 'const', 'static', 'extern',
      'inline', 'constexpr', 'volatile', 'mutable', 'explicit',
      'new', 'delete', 'this', 'operator', 'sizeof', 'auto',
      'void', 'bool', 'char', 'int', 'float', 'double', 'long',
      'short', 'unsigned', 'signed', 'true', 'false', 'nullptr',
      'noexcept', 'static_assert', 'thread_local', 'alignas', 'alignof',
      'decltype', 'static_cast', 'dynamic_cast', 'reinterpret_cast', 'const_cast',
    ],

    typeKeywords: [
      'class', 'struct', 'enum', 'union', 'interface', 'namespace',
      'template', 'typename', 'typedef', 'concept', 'requires',
    ],

    operators: [
      '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=',
      '&&', '||', '++', '--', '+', '-', '*', '/', '&', '|', '^', '%',
      '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '&=', '|=', '^=',
      '%=', '<<=', '>>=', '>>>=', '->', '.', '..', '->*', '.*',
    ],

    symbols: /[=><!~?:&|+\-*\/\^%]+/,

    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    tokenizer: {
      root: [
        [/^\s*#\s*(include|define|undef|ifdef|ifndef|if|else|elif|endif|pragma)\b/, 'keyword.preprocessor'],
        [/"/, 'string', '@string_double'],
        [/'/, 'string', '@string_char'],
        [/\d*\.\d+([eE][\-+]?\d+)?[fFdDmM]?/, 'number.float'],
        [/0[xX][0-9a-fA-F]+[uUlL]*/, 'number.hex'],
        [/\d+[uUlL]*/, 'number'],
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@typeKeywords': 'keyword.type',
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        }],
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/@symbols/, 'operator'],
      ],
      string_double: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, 'string', '@pop'],
      ],
      string_char: [
        [/[^\\']+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/'/, 'string', '@pop'],
      ],
      comment: [
        [/[^\/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[\/*]/, 'comment'],
      ],
    },
  });

  // 注册定义 Provider（F12 / Ctrl+Click）
  monaco.languages.registerDefinitionProvider('codelens-cpp', {
    provideDefinition: async (model: any, position: any) => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<any>('sidecar_goto_definition', {
          filepath: window.__CODELENS_CURRENT_FILE__ || '',
          line: position.lineNumber - 1,  // Monaco 1-based → 0-based
          col: position.column - 1,
        });

        if (result && result.success) {
          if (result.single && result.definition) {
            const def = result.definition;
            const filePath = def.uri.replace('file:///', '').replace(/\//g, '\\');
            return [{
              uri: monaco.Uri.file(filePath),
              range: new monaco.Range(
                def.range.start.line + 1,
                def.range.start.character + 1,
                def.range.end.line + 1,
                def.range.end.character + 1,
              ),
            }];
          } else if (result.candidates && result.candidates.length > 0) {
            // 多定义候选
            return result.candidates.map((c: any) => ({
              uri: monaco.Uri.file(c.uri.replace('file:///', '').replace(/\//g, '\\')),
              range: new monaco.Range(
                c.range.start.line + 1,
                c.range.start.character + 1,
                c.range.end.line + 1,
                c.range.end.character + 1,
              ),
            }));
          }
        }
      } catch (err) {
        console.log('[CodeLens] Definition provider error:', err);
      }
      return null;
    },
  });

  // 注册引用 Provider（Shift+F12）
  monaco.languages.registerReferenceProvider('codelens-cpp', {
    provideReferences: async (model: any, position: any) => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const word = model.getWordAtPosition(position);
        const symbolName = word?.word || '';

        if (!symbolName) return [];

        const result = await invoke<any>('sidecar_find_references', {
          symbolName: symbolName,
        });

        if (result && result.success && Array.isArray(result.references)) {
          return result.references.map((ref: any) => ({
            uri: monaco.Uri.file(ref.filePath),
            range: new monaco.Range(
              ref.startLine + 1,
              ref.startCol + 1,
              ref.endLine + 1,
              ref.endCol + 1,
            ),
          }));
        }
      } catch (err) {
        console.log('[CodeLens] Reference provider error:', err);
      }
      return [];
    },
  });
}

/**
 * 将 Tree-sitter 高亮区间转换为 Monaco Decorations
 */
function highlightRangesToDecorations(
  ranges: HighlightRange[],
  monaco: any
): MonacoEditor.IModelDeltaDecoration[] {
  const classMap: Record<string, string> = {
    'keyword.control': 'codelens-keyword',
    'keyword.declaration.type': 'codelens-keyword-type',
    'keyword.modifier': 'codelens-keyword',
    'keyword.type': 'codelens-keyword-type',
    'keyword.preprocessor': 'codelens-preprocessor',
    'string': 'codelens-string',
    'string.escape': 'codelens-string',
    'constant.numeric': 'codelens-number',
    'constant.language': 'codelens-constant',
    'comment': 'codelens-comment',
    'entity.name.function': 'codelens-function',
    'variable.name': 'codelens-variable',
  };

  return ranges.map((range) => {
    const cssClass = classMap[range.scope] || '';
    if (!cssClass) return null;

    return {
      range: new monaco.Range(
        range.startLine + 1,
        range.startCol + 1,
        range.endLine + 1,
        range.endCol + 1
      ),
      options: {
        inlineClassName: cssClass,
      },
    };
  }).filter(Boolean) as MonacoEditor.IModelDeltaDecoration[];
}

/**
 * Monaco Editor 组件（F-001 + F-002 + F-003）
 *
 * 阶段2：Tree-sitter 语义高亮
 * 阶段3：符号跳转（F12/Ctrl+Click）+ 引用查找（Shift+F12）
 */
export default memo(function CodeEditorView({
  filePath,
  content,
  language,
  onCursorMove,
  onGoToDefinition,
  onFindReferences,
}: EditorProps) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const highlightEnabledRef = useRef(false);
  const { theme } = useTheme();

  // 将当前文件路径存到 window 上，供 Provider 使用
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__CODELENS_CURRENT_FILE__ = filePath || '';
    }
  }, [filePath]);

  const applySemanticHighlight = useCallback(async (
    editor: any,
    monaco: any,
    fileContent: string,
    filePathStr: string
  ) => {
    if (!fileContent || !filePathStr) return;

    const cacheKey = getCacheKey(filePathStr, fileContent);

    // OPT-008: 检查缓存命中
    const cached = highlightCache.get(cacheKey);
    if (cached) {
      if (decorationsRef.current.length > 0) {
        editor.deltaDecorations(decorationsRef.current, []);
      }
      decorationsRef.current = editor.deltaDecorations([], cached);
      highlightEnabledRef.current = true;
      return;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<any>('sidecar_highlight', {
        filepath: filePathStr,
      });

      if (result && result.success && Array.isArray(result.ranges) && result.ranges.length > 0) {
        const decorations = highlightRangesToDecorations(result.ranges, monaco);
        if (decorations.length > 0) {
          if (decorationsRef.current.length > 0) {
            editor.deltaDecorations(decorationsRef.current, []);
          }
          decorationsRef.current = editor.deltaDecorations([], decorations);
          highlightEnabledRef.current = true;

          // OPT-008: 写入缓存
          highlightCache.set(cacheKey, decorations);

          // 缓存大小限制：超过 200 个文件时清理最旧的一半
          if (highlightCache.size > 200) {
            const keys = Array.from(highlightCache.keys());
            for (let i = 0; i < 100 && i < keys.length; i++) {
              highlightCache.delete(keys[i]);
            }
          }
        }
      }
    } catch (err) {
      console.log('[CodeLens] Sidecar 不可用，使用内置高亮:', err);
      highlightEnabledRef.current = false;
    }
  }, []);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // 注册自定义语言、主题和 Provider
    registerCodelensLanguage(monaco);

    // 定义自定义暗色主题
    monaco.editor.defineTheme('codelens-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: '569CD6' },
        { token: 'keyword.preprocessor', foreground: 'C586C0' },
        { token: 'keyword.type', foreground: '4EC9B0' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'string.escape', foreground: 'D7BA7D' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'number.float', foreground: 'B5CEA8' },
        { token: 'number.hex', foreground: 'B5CEA8' },
        { token: 'constant.language', foreground: '569CD6' },
        { token: 'type', foreground: '4EC9B0' },
        { token: 'identifier', foreground: '9CDCFE' },
        { token: 'operator', foreground: 'D4D4D4' },
      ],
      colors: {
        'editor.background': '#1e1e1e',
        'editor.foreground': '#d4d4d4',
        'editor.lineHighlightBackground': '#2a2d2e',
        'editor.selectionBackground': '#264f78',
        'editorLineNumber.foreground': '#858585',
        'editorLineNumber.activeForeground': '#c6c6c6',
      },
    });
    monaco.editor.setTheme('codelens-dark');

    // 定义自定义浅色主题
    monaco.editor.defineTheme('codelens-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '008000', fontStyle: 'italic' },
        { token: 'keyword', foreground: '0000FF' },
        { token: 'keyword.preprocessor', foreground: 'AF00DB' },
        { token: 'keyword.type', foreground: '267F99' },
        { token: 'string', foreground: 'A31515' },
        { token: 'string.escape', foreground: '0070C9' },
        { token: 'number', foreground: '098658' },
        { token: 'number.float', foreground: '098658' },
        { token: 'number.hex', foreground: '098658' },
        { token: 'constant.language', foreground: '0000FF' },
        { token: 'type', foreground: '267F99' },
        { token: 'identifier', foreground: '001080' },
        { token: 'operator', foreground: '000000' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#1e1e1e',
        'editor.lineHighlightBackground': '#f0f0f0',
        'editor.selectionBackground': '#add6ff',
        'editorLineNumber.foreground': '#b4b4b4',
        'editorLineNumber.activeForeground': '#1e1e1e',
      },
    });

    // 注入语义高亮 CSS 类样式
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      .codelens-keyword { color: #569CD6 !important; }
      .codelens-keyword-type { color: #4EC9B0 !important; }
      .codelens-preprocessor { color: #C586C0 !important; }
      .codelens-string { color: #CE9178 !important; }
      .codelens-number { color: #B5CEA8 !important; }
      .codelens-constant { color: #4FC1FF !important; }
      .codelens-comment { color: #6A9955 !important; font-style: italic !important; }
      .codelens-function { color: #DCDCAA !important; }
      .codelens-variable { color: #9CDCFE !important; }
    `;
    document.head.appendChild(styleSheet);

    // 光标移动事件
    editor.onDidChangeCursorPosition((e: any) => {
      if (onCursorMove) {
        onCursorMove(e.position.lineNumber, e.position.column);
      }
    });

    // Ctrl+Click 跳转定义（Monaco 内置的 definition provider 已处理）
    // F12 跳转定义（Monaco 内置的 goToDefinition action 已处理）
    // Shift+F12 查找引用（Monaco 内置的 goToReferences action 已处理）
  }, [onCursorMove]);

  // 监听主题变化，动态切换 Monaco 主题
  useEffect(() => {
    if (monacoRef.current) {
      const monacoTheme = theme === 'dark' ? 'codelens-dark' : 'codelens-light';
      monacoRef.current.editor.setTheme(monacoTheme);
    }
  }, [theme]);

  // 当文件内容或路径变化时，请求语义高亮
  useEffect(() => {
    if (editorRef.current && monacoRef.current && filePath && content) {
      const editor = editorRef.current;
      const model = editor.getModel();
      const timer = setTimeout(() => {
        applySemanticHighlight(editor, monacoRef.current, content, filePath);
      }, 100);
      return () => clearTimeout(timer);
    }

    if (editorRef.current && decorationsRef.current.length > 0) {
      editorRef.current.deltaDecorations(decorationsRef.current, []);
      decorationsRef.current = [];
    }
  }, [filePath, content, applySemanticHighlight]);

  const editorOptions = useMemo(() => ({
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    readOnly: true,
    lineNumbers: 'on' as const,
    renderLineHighlight: 'all' as const,
    cursorBlinking: 'smooth' as const,
    smoothScrolling: true,
    automaticLayout: true,
    language: 'codelens-cpp',
    'semanticHighlighting.enabled': false as any,
    // 启用代码导航功能
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    parameterHints: { enabled: false },
  }), []);

  return (
    <div className="editor-container">
      {filePath && (
        <div className="editor-tab">
          <span className="tab-icon">📄</span>
          <span className="tab-title">
            {filePath.split(/[\\/]/).pop()}
          </span>
          {highlightEnabledRef.current && (
            <span className="tab-badge" style={{ fontSize: 10, color: '#4EC9B0', marginLeft: 4 }}>
              TS
            </span>
          )}
        </div>
      )}
      <div className="monaco-editor">
        <Editor
          height="100%"
          language="codelens-cpp"
          value={content || '// 欢迎使用 CodeLens 代码阅读器\n// 请从左侧文件树打开一个文件开始\n\n// 快捷键：\n// F12          - 跳转到定义\n// Shift+F12    - 查找所有引用\n// Ctrl+Click   - 跳转到定义\n'}
          options={editorOptions}
          onMount={handleEditorMount}
          loading={<div style={{ padding: 20, color: '#858585' }}>加载编辑器...</div>}
          theme="vs-dark"
        />
      </div>
    </div>
  );
});
