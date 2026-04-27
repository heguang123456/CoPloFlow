import Head from 'next/head';
import FileTree from '@/components/FileTree';
import Editor from '@/components/Editor';
import SymbolOutline from '@/components/SymbolOutline';
import { useState } from 'react';

/**
 * CodeLens 主界面
 *
 * 布局：三栏式
 * - 左侧：文件树浏览器（F-006）
 * - 中间：Monaco Editor 代码编辑区（F-001）
 * - 右侧：符号大纲面板（F-004）
 * - 底部：状态栏
 */
export default function Home() {
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [language, setLanguage] = useState<string>('cpp');

  const handleFileSelect = async (filePath: string) => {
    setCurrentFile(filePath);
    // 根据文件扩展名推断语言
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
      h: 'cpp', hpp: 'cpp', hxx: 'cpp',
      c: 'c',
    };
    if (ext && langMap[ext]) {
      setLanguage(langMap[ext]);
    }

    // 通过 Tauri IPC 读取文件内容
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const content = await invoke<string>('open_file', { path: filePath });
      setFileContent(content);
    } catch (err) {
      console.error('无法读取文件:', err);
      setFileContent(`// 无法读取文件: ${filePath}`);
    }
  };

  return (
    <>
      <Head>
        <title>CodeLens 代码阅读器</title>
        <meta name="description" content="轻量、快速、语义感知的代码阅读器" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="app-container">
        {/* 菜单栏 */}
        <header className="menu-bar">
          <span className="menu-item">文件(F)</span>
          <span className="menu-item">编辑(E)</span>
          <span className="menu-item">查看(V)</span>
          <span className="menu-item">转到(G)</span>
          <span className="menu-item">帮助(H)</span>
        </header>

        {/* 主内容区 */}
        <main className="main-content">
          {/* 左侧：文件树 */}
          <aside className="sidebar-left">
            <FileTree onFileSelect={handleFileSelect} />
          </aside>

          {/* 中间：编辑器 */}
          <section className="editor-area">
            <Editor
              filePath={currentFile}
              content={fileContent}
              language={language}
            />
          </section>

          {/* 右侧：符号大纲 */}
          <aside className="sidebar-right">
            <SymbolOutline filePath={currentFile} />
          </aside>
        </main>

        {/* 状态栏 */}
        <footer className="status-bar">
          <span className="status-item">
            {currentFile ? `行 1, 列 1` : '就绪'}
          </span>
          <span className="status-item">{language.toUpperCase()}</span>
          <span className="status-item">UTF-8</span>
          <span className="status-item">LF</span>
          <span className="status-item">CodeLens v0.1.0</span>
        </footer>
      </div>
    </>
  );
}
