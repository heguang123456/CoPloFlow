import Head from 'next/head';
import FileTree from '@/components/FileTree';
import Editor from '@/components/Editor';
import SymbolOutline from '@/components/SymbolOutline';
import ReferencesPanel from '@/components/ReferencesPanel';
import SearchPanel from '@/components/SearchPanel';
import { useTheme } from '@/components/ThemeProvider';
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
 * 布局：三栏式（可拖拽分割面板）
 * - 左侧：文件树浏览器（F-006 增强）
 * - 中间：Monaco Editor 代码编辑区（F-001 + F-002 + F-003）
 * - 右侧：符号大纲面板（F-004）+ 搜索面板（F-005）
 * - 底部：状态栏（增强）
 *
 * 阶段5新增：
 * - 可拖拽分割面板
 * - 菜单栏下拉功能
 * - 主题切换（Ctrl+K Ctrl+T）
 * - 状态栏增强
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

/** 下拉菜单项定义 */
interface DropdownItem {
  label: string;
  action: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
}

const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_LEFT_WIDTH = 240;
const DEFAULT_RIGHT_WIDTH = 200;

export default function Home() {
  const { theme, toggleTheme } = useTheme();

  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [language, setLanguage] = useState<string>('cpp');

  // 光标位置用 ref 而非 state，避免每次光标移动触发整个组件 re-render
  const cursorPosRef = useRef<CursorPosition>({ line: 1, col: 1 });
  const statusBarCursorRef = useRef<HTMLElement | null>(null);

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

  // 可拖拽分割面板状态
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [dragTarget, setDragTarget] = useState<'left' | 'right' | null>(null);

  // 下拉菜单状态
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Ctrl+K Ctrl+T 主题切换快捷键
  const pendingCtrlKRef = useRef(false);
  const ctrlKTimerRef = useRef<NodeJS.Timeout | null>(null);

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
    cursorPosRef.current = { line, col };
    // 直接更新状态栏 DOM，避免 React re-render
    if (statusBarCursorRef.current) {
      statusBarCursorRef.current.textContent = `行 ${line}, 列 ${col}`;
    }
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
    setShowRefs(false);
  }, [handleGoToDefinition]);

  // 跳转到搜索结果位置
  const handleJumpToSearchResult = useCallback(async (filePath: string, line: number, col: number) => {
    await handleGoToDefinition(filePath, line, col);
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

      const model = (window as any).__MONACO_EDITOR__?.getModel();
      let symbolName = '';

      if (model) {
        const word = model.getWordAtPosition({
          lineNumber: cursorPosRef.current.line,
          column: cursorPosRef.current.col,
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
  }, [currentFile]);

  // 搜索输入处理（防抖 200ms）
  const handleSearchInput = useCallback((value: string) => {
    setSearchInput(value);

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

  // 拖拽分割条 — 鼠标移动
  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!dragTarget) return;

    if (dragTarget === 'left') {
      const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, e.clientX));
      setLeftWidth(newWidth);
    } else if (dragTarget === 'right') {
      const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, window.innerWidth - e.clientX));
      setRightWidth(newWidth);
    }
  }, [dragTarget]);

  // 拖拽分割条 — 鼠标释放
  const handleDragEnd = useCallback(() => {
    if (dragTarget) {
      setDragTarget(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }, [dragTarget]);

  // 拖拽事件监听
  useEffect(() => {
    if (dragTarget) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [dragTarget, handleDragMove, handleDragEnd]);

  // 拖拽开始
  const handleResizeStart = useCallback((target: 'left' | 'right') => {
    setDragTarget(target);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // 双击分割条恢复默认宽度
  const handleResizeDoubleClick = useCallback((target: 'left' | 'right') => {
    if (target === 'left') setLeftWidth(DEFAULT_LEFT_WIDTH);
    else setRightWidth(DEFAULT_RIGHT_WIDTH);
  }, []);

  // 下拉菜单项处理
  const handleMenuAction = useCallback((action: string) => {
    setActiveMenu(null);
    switch (action) {
      case 'open-folder': {
        // 委托给 FileTree 的 handleOpenProject（通过自定义事件）
        document.dispatchEvent(new CustomEvent('codelens:open-project'));
        break;
      }
      case 'toggle-theme':
        toggleTheme();
        break;
      case 'find-references':
        triggerFindReferences();
        break;
      case 'focus-search': {
        const input = document.querySelector('.search-input') as HTMLInputElement;
        if (input) { input.focus(); input.select(); }
        break;
      }
    }
  }, [toggleTheme, triggerFindReferences]);

  // 全局快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+O 打开文件夹
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'o') {
        e.preventDefault();
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('codelens:open-project'));
        setActiveMenu(null);
        return;
      }

      // Ctrl+K Ctrl+T 主题切换
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        pendingCtrlKRef.current = true;
        if (ctrlKTimerRef.current) clearTimeout(ctrlKTimerRef.current);
        ctrlKTimerRef.current = setTimeout(() => { pendingCtrlKRef.current = false; }, 300);
        return;
      }
      if (pendingCtrlKRef.current && e.key === 't') {
        e.preventDefault();
        e.stopPropagation();
        toggleTheme();
        pendingCtrlKRef.current = false;
        return;
      }

      // Ctrl+Shift+F 搜索
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        e.stopPropagation();
        const input = document.querySelector('.search-input') as HTMLInputElement;
        if (input) { input.focus(); input.select(); }
      }

      // ESC 关闭菜单
      if (e.key === 'Escape') {
        setActiveMenu(null);
      }
    };

    // 点击菜单外关闭下拉菜单
    const handleClickOutside = (e: MouseEvent) => {
      if (activeMenu && !(e.target as Element).closest('.menu-dropdown')) {
        setActiveMenu(null);
      }
    };

    // 使用 capture: true 在捕获阶段拦截，优先于 Monaco 内部快捷键处理
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeMenu, toggleTheme]);

  /** 下拉菜单项配置 */
  const menuConfig: Record<string, DropdownItem[]> = {
    file: [
      { label: '打开文件夹', action: 'open-folder', shortcut: 'Ctrl+O' },
    ],
    edit: [],
    view: [
      { label: '切换主题', action: 'toggle-theme', shortcut: 'Ctrl+K Ctrl+T' },
    ],
    goto: [
      { label: '查找引用', action: 'find-references', shortcut: 'Shift+F12' },
      { label: '搜索符号', action: 'focus-search', shortcut: 'Ctrl+Shift+F' },
    ],
    help: [
      { label: '关于 CodeLens', action: 'about' },
    ],
  };

  /** 渲染菜单栏下拉菜单 */
  const renderDropdown = (menuKey: string, items: DropdownItem[]) => {
    if (items.length === 0) return null;

    return (
      <div className="menu-dropdown">
        {items.map((item) => (
          <div key={item.action}>
            {item.separator && <div className="menu-dropdown-separator" />}
            <div
              className={`menu-dropdown-item ${item.disabled ? 'menu-dropdown-disabled' : ''}`}
              onClick={() => handleMenuAction(item.action)}
            >
              <span>{item.label}</span>
              {item.shortcut && <span className="menu-dropdown-shortcut">{item.shortcut}</span>}
            </div>
          </div>
        ))}
      </div>
    );
  };

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
          <nav className="menu-bar-items">
            {[
              { key: 'file', label: '文件(F)' },
              { key: 'edit', label: '编辑(E)' },
              { key: 'view', label: '查看(V)' },
              { key: 'goto', label: '转到(G)' },
              { key: 'help', label: '帮助(H)' },
            ].map(({ key, label }) => {
              const items = menuConfig[key] || [];
              const hasDropdown = items.length > 0;
              return (
                <div
                  key={key}
                  className="menu-item-wrapper"
                  onClick={() => hasDropdown && setActiveMenu(activeMenu === key ? null : key)}
                >
                  <span className={`menu-item ${activeMenu === key ? 'menu-item-active' : ''}`}>
                    {label}
                  </span>
                  {activeMenu === key && hasDropdown && renderDropdown(key, items)}
                </div>
              );
            })}
          </nav>

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
                &times;
              </button>
            )}
          </div>
        </header>

        {/* 主内容区 */}
        <main className="main-content" style={{ position: 'relative' }}>
          {/* 左侧：文件树 */}
          <aside className="sidebar-left" style={{ width: leftWidth, minWidth: leftWidth }}>
            <FileTree onFileSelect={handleFileSelect} />
          </aside>

          {/* 左侧分割条 */}
          <div
            className={`resize-handle ${dragTarget === 'left' ? 'resize-handle-active' : ''}`}
            onMouseDown={() => handleResizeStart('left')}
            onDoubleClick={() => handleResizeDoubleClick('left')}
          />

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

          {/* 右侧分割条 */}
          <div
            className={`resize-handle ${dragTarget === 'right' ? 'resize-handle-active' : ''}`}
            onMouseDown={() => handleResizeStart('right')}
            onDoubleClick={() => handleResizeDoubleClick('right')}
          />

          {/* 右侧：符号大纲 */}
          <aside className="sidebar-right" style={{ width: rightWidth, minWidth: rightWidth }}>
            <SymbolOutline
              filePath={currentFile}
              onSymbolClick={(line) => {
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
          <span className="status-item" ref={statusBarCursorRef}>
            {currentFile
              ? `行 ${cursorPosRef.current.line}, 列 ${cursorPosRef.current.col}`
              : '就绪'}
          </span>
          <span className="status-item">{language.toUpperCase()}</span>
          <span className="status-item">UTF-8</span>
          <span className="status-item">LF</span>
          <span
            className="status-item status-theme-toggle"
            onClick={toggleTheme}
            title={`切换主题 (Ctrl+K Ctrl+T) — 当前: ${theme === 'dark' ? '深色' : '浅色'}`}
          >
            {theme === 'dark' ? '🌙' : '☀️'}
          </span>
          <span
            className="status-item"
            style={{ cursor: 'pointer' }}
            onClick={triggerFindReferences}
            title="Shift+F12 查找引用"
          >
            CodeLens v0.5.0
          </span>
        </footer>
      </div>
    </>
  );
}
