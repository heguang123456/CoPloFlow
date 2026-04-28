import Head from 'next/head';
import FileTree from '@/components/FileTree';
import Editor from '@/components/Editor';
import SymbolOutline from '@/components/SymbolOutline';
import ReferencesPanel from '@/components/ReferencesPanel';
import SearchPanel from '@/components/SearchPanel';
import { useState, useCallback, useEffect, useRef } from 'react';

// 扩展 Window 类型声明
declare global {
  interface Window {
    __CODELENS_CURRENT_FILE__?: string;
    __MONACO_EDITOR__?: any;
  }
}

/**
 * CodeLens 主界面
 *
 * 布局：三栏式
 * - 左侧：文件树浏览器（F-006）
 * - 中间：Monaco Editor 代码编辑区（F-001 + F-002 + F-003）
 * - 右侧：符号大纲面板（F-004）+ 搜索面板（F-005）
 * - 底部：状态栏
 *
 * 阶段3新增：
 * - 符号跳转：F12 / Ctrl+Click 跳转到定义
 * - 引用查找：Shift+F12 查找所有引用
 * - 引用结果面板
 *
 * 阶段4新增：
 * - 项目符号搜索：Ctrl+Shift+F 全局搜索
 * - 搜索结果面板 + 点击跳转
 */

interface CursorPosition {
  line: number;
  col: number;
}

interface SearchResultItem {
  name: string;
  kind: string;
  filePath: string;
  line: number;
  col: number;
  qualifiedName: string;
}

export default function Home() {
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [language, setLanguage] = useState<string>('cpp');
  const [cursorPos, setCursorPos] = useState<CursorPosition>({ line: 1, col: 1 });

  // 引用查找状态
  const [showRefs, setShowRefs] = useState(false);
  const [refsSymbolName, setRefsSymbolName] = useState('');
  const [refsList, setRefsList] = useState<any[]>([]);
  const [refsLoading, setRefsLoading] = useState(false);

  // 符号搜索状态（F-005）
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchTotalCount, setSearchTotalCount] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleFileSelect = async (filePath: string) => {
    setCurrentFile(filePath);
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
      h: 'cpp', hpp: 'cpp', hxx: 'cpp',
      c: 'c',
    };
    if (ext && langMap[ext]) {
      setLanguage(langMap[ext]);
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const content = await invoke<string>('open_file', { path: filePath });
      setFileContent(content);
    } catch (err) {
      console.error('无法读取文件:', err);
      setFileContent(`// 无法读取文件: ${filePath}`);
    }
  };

  const handleCursorMove = useCallback((line: number, col: number) => {
    setCursorPos({ line, col });
  }, []);

  // 跳转到定义：打开目标文件并定位到指定行
  const handleGoToDefinition = useCallback(async (targetFilePath: string, line: number, col: number) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const content = await invoke<string>('open_file', { path: targetFilePath });
      setCurrentFile(targetFilePath);
      setFileContent(content);

      // 更新语言
      const ext = targetFilePath.split('.').pop()?.toLowerCase();
      const langMap: Record<string, string> = {
        cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
        h: 'cpp', hpp: 'cpp', hxx: 'cpp',
        c: 'c',
      };
      if (ext && langMap[ext]) {
        setLanguage(langMap[ext]);
      }

      // 跳转到目标行
      setTimeout(() => {
        const editor = (window as any).__MONACO_EDITOR__;
        if (editor) {
          editor.revealLineInCenter(line + 1);
          editor.setPosition({ lineNumber: line + 1, column: 1 });
          editor.focus();
        }
      }, 100);
    } catch (err) {
      console.error('无法跳转到文件:', err);
    }
  }, []);

  // 跳转到引用位置（从引用面板点击）
  const handleJumpToRef = useCallback(async (filePath: string, line: number, _col: number) => {
    await handleGoToDefinition(filePath, line, _col);
    // 跳转后关闭引用面板
    setShowRefs(false);
  }, [handleGoToDefinition]);

  // 跳转到搜索结果位置
  const handleJumpToSearchResult = useCallback(async (filePath: string, line: number, col: number) => {
    await handleGoToDefinition(filePath, line, col);
    // 跳转后关闭搜索面板
    setShowSearch(false);
    setSearchInput('');
    setSearchQuery('');
  }, [handleGoToDefinition]);

  // 触发引用查找
  const triggerFindReferences = useCallback(async () => {
    if (!currentFile) return;

    setRefsLoading(true);
    setShowRefs(true);

    try {
      const { invoke } = await import('@tauri-apps/api/core');

      // 先获取光标处的符号名
      const model = (window as any).__MONACO_EDITOR__?.getModel();
      let symbolName = '';

      if (model) {
        const word = model.getWordAtPosition({
          lineNumber: cursorPos.line,
          column: cursorPos.col,
        });
        symbolName = word?.word || '';
      }

      if (!symbolName) return;

      setRefsSymbolName(symbolName);

      const result = await invoke<any>('sidecar_find_references', {
        symbolName: symbolName,
      });

      if (result && result.success && Array.isArray(result.references)) {
        setRefsList(result.references);
      } else {
        setRefsList([]);
      }
    } catch (err) {
      console.error('引用查找失败:', err);
      setRefsList([]);
    } finally {
      setRefsLoading(false);
    }
  }, [currentFile, cursorPos]);

  // 搜索输入处理（防抖 200ms）
  const handleSearchInput = useCallback((value: string) => {
    setSearchInput(value);

    // 清除上一个定时器
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    if (value.length < 2) {
      setSearchQuery('');
      setSearchResults([]);
      setSearchTotalCount(0);
      setShowSearch(false);
      return;
    }

    // 防抖 200ms
    searchTimerRef.current = setTimeout(async () => {
      setShowSearch(true);
      setSearchLoading(true);
      setSearchQuery(value);

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<{
          success: boolean;
          query: string;
          totalCount: number;
          results: SearchResultItem[];
        }>('sidecar_search_symbols', { query: value, limit: 50 });

        if (result && result.success) {
          setSearchResults(result.results || []);
          setSearchTotalCount(result.totalCount || 0);
        } else {
          setSearchResults([]);
          setSearchTotalCount(0);
        }
      } catch (err) {
        console.error('符号搜索失败:', err);
        setSearchResults([]);
        setSearchTotalCount(0);
      } finally {
        setSearchLoading(false);
      }
    }, 200);
  }, []);

  // Ctrl+Shift+F 快捷键触发搜索
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        // 聚焦搜索输入框
        const input = document.querySelector('.search-input') as HTMLInputElement;
        if (input) {
          input.focus();
          input.select();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <Head>
        <title>CodeLens 代码阅读器</title>
        <meta name="description" content="轻量、快速、语义感知的代码阅读器" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="app-container">
        {/* 菜单栏 + 搜索栏 */}
        <header className="menu-bar">
          <span className="menu-item">文件(F)</span>
          <span className="menu-item">编辑(E)</span>
          <span className="menu-item">查看(V)</span>
          <span
            className="menu-item"
            style={{ cursor: 'pointer' }}
            onClick={triggerFindReferences}
            title="查找引用 (Shift+F12)"
          >
            转到(G)
          </span>
          <span className="menu-item">帮助(H)</span>

          {/* 搜索栏（F-005） */}
          <div className="search-bar">
            <span className="search-bar-icon">&#128269;</span>
            <input
              className="search-input"
              type="text"
              placeholder="搜索符号... (Ctrl+Shift+F)"
              value={searchInput}
              onChange={(e) => handleSearchInput(e.target.value)}
              onFocus={() => {
                if (searchInput.length >= 2 && searchResults.length > 0) {
                  setShowSearch(true);
                }
              }}
            />
            {searchInput && (
              <button
                className="btn-icon search-bar-clear"
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                  setSearchResults([]);
                  setSearchTotalCount(0);
                  setShowSearch(false);
                }}
              >
                ×
              </button>
            )}
          </div>
        </header>

        {/* 主内容区 */}
        <main className="main-content" style={{ position: 'relative' }}>
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
              onCursorMove={handleCursorMove}
              onGoToDefinition={handleGoToDefinition}
              onFindReferences={() => triggerFindReferences()}
            />

            {/* 引用面板（浮动） */}
            {showRefs && (
              <ReferencesPanel
                symbolName={refsSymbolName}
                references={refsList}
                isLoading={refsLoading}
                onJumpTo={handleJumpToRef}
                onClose={() => setShowRefs(false)}
              />
            )}

            {/* 搜索结果面板（浮动，F-005） */}
            {showSearch && (
              <SearchPanel
                query={searchQuery}
                results={searchResults}
                totalCount={searchTotalCount}
                isLoading={searchLoading}
                onJumpTo={handleJumpToSearchResult}
                onClose={() => {
                  setShowSearch(false);
                  setSearchInput('');
                  setSearchQuery('');
                }}
              />
            )}
          </section>

          {/* 右侧：符号大纲 */}
          <aside className="sidebar-right">
            <SymbolOutline
              filePath={currentFile}
              onSymbolClick={(line) => {
                // 跳转到编辑器对应行：通过 Monaco Editor API 实现行滚动
                const editor = (window as any).__MONACO_EDITOR__;
                if (editor) {
                  editor.revealLineInCenter(line + 1);
                  editor.setPosition({ lineNumber: line + 1, column: 1 });
                  editor.focus();
                }
              }}
            />
          </aside>
        </main>

        {/* 状态栏 */}
        <footer className="status-bar">
          <span className="status-item">
            {currentFile
              ? `行 ${cursorPos.line}, 列 ${cursorPos.col}`
              : '就绪'}
          </span>
          <span className="status-item">{language.toUpperCase()}</span>
          <span className="status-item">UTF-8</span>
          <span className="status-item">LF</span>
          <span
            className="status-item"
            style={{ cursor: 'pointer' }}
            onClick={triggerFindReferences}
            title="Shift+F12 查找引用"
          >
            CodeLens v0.4.0
          </span>
        </footer>
      </div>
    </>
  );
}
