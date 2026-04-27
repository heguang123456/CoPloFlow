import { useEffect, useRef, useCallback } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';

/**
 * Monaco Editor 组件属性
 */
interface EditorProps {
  filePath: string | null;
  content: string;
  language: string;
  onCursorMove?: (line: number, col: number) => void;
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
 * CodeLens 自定义语义高亮语言定义
 */
function registerCodelensLanguage(monaco: any) {
  // 注册 codelens-cpp 语言（基于 cpp，但使用我们自己的 tokenizer）
  monaco.languages.register({ id: 'codelens-cpp' });

  // 默认使用 cpp 的内置 tokenizer 作为基础
  // 当 Tree-sitter 高亮数据到达后，通过 decorations 叠加语义层
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
        // 预处理器指令
        [/^\s*#\s*(include|define|undef|ifdef|ifndef|if|else|elif|endif|pragma)\b/, 'keyword.preprocessor'],

        // 字符串字面量
        [/"/, 'string', '@string_double'],
        [/'/, 'string', '@string_char'],

        // 数字
        [/\d*\.\d+([eE][\-+]?\d+)?[fFdDmM]?/, 'number.float'],
        [/0[xX][0-9a-fA-F]+[uUlL]*/, 'number.hex'],
        [/\d+[uUlL]*/, 'number'],

        // 标识符和关键字
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@typeKeywords': 'keyword.type',
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        }],

        // 注释
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],

        // 运算符
        [/@symbols/, {
          cases: {
            '@operatorKeywords': 'operator.keyword',
            '@default': 'operator',
          },
        }],
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
}

/**
 * 将 Tree-sitter 高亮区间转换为 Monaco Decorations
 */
function highlightRangesToDecorations(
  ranges: HighlightRange[],
  monaco: any
): MonacoEditor.IModelDeltaDecoration[] {
  // scope → Monaco 主题色 class 映射
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
        range.startLine + 1,  // Monaco 是 1-based
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
 * Monaco Editor 组件（F-001）
 *
 * 阶段2新增：
 * - 注册 codelens-cpp 自定义语言
 * - 通过 Tauri IPC 调用 Sidecar 获取 Tree-sitter 语义高亮数据
 * - 将语义高亮区间叠加为 Monaco Decorations
 * - 降级策略：Sidecar 不可用时使用 Monarch tokenizer
 */
export default function CodeEditorView({ filePath, content, language, onCursorMove }: EditorProps) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const highlightEnabledRef = useRef(false);

  const applySemanticHighlight = useCallback(async (
    editor: any,
    monaco: any,
    fileContent: string,
    filePathStr: string
  ) => {
    if (!fileContent || !filePathStr) return;

    try {
      const { invoke } = await import('@tauri-apps/api/core');

      // 尝试通过 Sidecar 获取语义高亮
      const result = await invoke<any>('sidecar_highlight', {
        filepath: filePathStr,
      });

      if (result && result.success && Array.isArray(result.ranges) && result.ranges.length > 0) {
        const decorations = highlightRangesToDecorations(result.ranges, monaco);
        if (decorations.length > 0) {
          // 清除旧 decorations
          if (decorationsRef.current.length > 0) {
            editor.deltaDecorations(decorationsRef.current, []);
          }
          // 应用新 decorations
          decorationsRef.current = editor.deltaDecorations([], decorations);
          highlightEnabledRef.current = true;
        }
      }
    } catch (err) {
      // Sidecar 不可用，降级为 Monarch tokenizer（已在 handleEditorMount 中注册）
      console.log('[CodeLens] Sidecar 不可用，使用内置高亮:', err);
      highlightEnabledRef.current = false;
    }
  }, []);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // 注册自定义语言和主题
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

    // 注入语义高亮的 CSS 类样式
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
  }, [onCursorMove]);

  // 当文件内容或路径变化时，请求语义高亮
  useEffect(() => {
    if (editorRef.current && monacoRef.current && filePath && content) {
      // 使用 codelens-cpp 语言来同时启用 Monarch tokenizer + 语义 decorations
      const editor = editorRef.current;
      const model = editor.getModel();

      // 延迟请求高亮，等 Monaco 渲染完成
      const timer = setTimeout(() => {
        applySemanticHighlight(editor, monacoRef.current, content, filePath);
      }, 100);

      return () => clearTimeout(timer);
    }

    // 清除旧 decorations
    if (editorRef.current && decorationsRef.current.length > 0) {
      editorRef.current.deltaDecorations(decorationsRef.current, []);
      decorationsRef.current = [];
    }
  }, [filePath, content, applySemanticHighlight]);

  const editorOptions = {
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
    // 使用自定义语言（基于 cpp 的 Monarch tokenizer）
    language: 'codelens-cpp',
    // 禁用 Monaco 内置的语义 token（使用我们自己的 decorations 叠加）
    'semanticHighlighting.enabled': false as any,
  };

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
          value={content || '// 欢迎使用 CodeLens 代码阅读器\n// 请从左侧文件树打开一个文件开始\n'}
          options={editorOptions}
          onMount={handleEditorMount}
          loading={<div style={{ padding: 20, color: '#858585' }}>加载编辑器...</div>}
          theme="vs-dark"
        />
      </div>
    </div>
  );
}
