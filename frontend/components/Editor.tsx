import { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';

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
 * Monaco Editor 组件（F-001）
 *
 * 功能：
 * - 封装 Monaco Editor 实例
 * - 管理编辑器生命周期
 * - 光标事件处理
 * - 高亮渲染（后续阶段通过 C++ Sidecar 获取高亮数据）
 *
 * 当前阶段：基础编辑器展示，高亮使用 Monaco 内置能力
 * 使用 @monaco-editor/react 包装器，避免 Next.js CSS 兼容问题
 */
export default function CodeEditorView({ filePath, content, language, onCursorMove }: EditorProps) {
  const editorRef = useRef<any>(null);

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;

    // 定义自定义暗色主题
    monaco.editor.defineTheme('codelens-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: '569CD6' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'type', foreground: '4EC9B0' },
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

    // 光标移动事件
    editor.onDidChangeCursorPosition((e: any) => {
      if (onCursorMove) {
        onCursorMove(e.position.lineNumber, e.position.column);
      }
    });
  };

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
  };

  return (
    <div className="editor-container">
      {filePath && (
        <div className="editor-tab">
          <span className="tab-icon">📄</span>
          <span className="tab-title">
            {filePath.split(/[\\/]/).pop()}
          </span>
        </div>
      )}
      <div className="monaco-editor">
        <Editor
          height="100%"
          language={language || 'cpp'}
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
