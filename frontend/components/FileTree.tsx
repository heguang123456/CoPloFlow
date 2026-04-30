import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import FileIcon from './FileIcon';
import ContextMenu, { MenuItemDef } from './ContextMenu';

/**
 * 文件树组件属性
 */
interface FileTreeProps {
  onFileSelect: (filePath: string) => void;
  excludePatterns?: string[];
}

/**
 * 文件节点数据结构
 */
interface FileNode {
  key: string;
  title: string;
  isDir: boolean;
  path: string;
  children?: FileNode[];
  loaded?: boolean;
}

/**
 * 文件树浏览器组件（F-006）
 *
 * 功能：
 * - 显示项目文件目录结构
 * - 搜索过滤（300ms 防抖）
 * - 右键上下文菜单（复制路径、刷新等）
 * - 文件类型图标（基于扩展名）
 * - 目录优先 + 字母序排序
 * - 符号链接由后端过滤
 * - 排除指定目录（如 .git、node_modules）
 */
export default function FileTree({ onFileSelect, excludePatterns }: FileTreeProps) {
  const defaultExclude = excludePatterns ?? ['.git', 'node_modules', '.codelens', 'build', 'out', 'target', '.next', 'dist'];

  const [treeData, setTreeData] = useState<FileNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [projectPath, setProjectPath] = useState<string | null>(null);

  // 搜索状态
  const [searchTerm, setSearchTerm] = useState('');
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: FileNode;
  } | null>(null);

  /** 排序：目录优先 → 隐藏文件排末尾 → 字母序 */
  const sortNodes = useCallback((nodes: FileNode[]): FileNode[] => {
    return [...nodes].sort((a, b) => {
      // 目录优先
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      // 隐藏文件排末尾
      const aHidden = a.title.startsWith('.');
      const bHidden = b.title.startsWith('.');
      if (aHidden !== bHidden) return aHidden ? 1 : -1;
      // 字母序（不区分大小写）
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });
  }, []);

  /** 过滤树节点：匹配文件名或包含匹配子节点的目录 */
  const filterTree = useCallback((nodes: FileNode[], term: string): FileNode[] => {
    if (!term || term.length < 2) return nodes;

    const lower = term.toLowerCase();
    const result: FileNode[] = [];

    for (const node of nodes) {
      if (node.title.toLowerCase().includes(lower)) {
        result.push(node);
      } else if (node.isDir && node.children && node.children.length > 0) {
        const filteredChildren = filterTree(node.children, term);
        if (filteredChildren.length > 0) {
          result.push({ ...node, children: filteredChildren });
        }
      }
    }
    return result;
  }, []);

  const loadProject = async (dirPath: string) => {
    setProjectPath(dirPath);
    setExpandedKeys(new Set());
    setSearchTerm('');
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const entries = await invoke<Array<{ name: string; isDir: boolean; path: string }>>(
        'read_directory',
        { path: dirPath }
      );
      const filtered = entries.filter(
        (e) => !defaultExclude.includes(e.name) && !e.name.startsWith('.')
      );
      const nodes: FileNode[] = filtered.map((e) => ({
        key: e.path,
        title: e.name,
        isDir: e.isDir,
        path: e.path,
        loaded: !e.isDir,
        children: e.isDir ? [] : undefined,
      }));
      setTreeData(sortNodes(nodes));

      // 后台触发项目符号索引（常驻 Sidecar，索引结果在进程生命周期内保持）
      // 这使得跨文件引用查找、符号搜索等功能可用
      invoke('sidecar_index_project', { projectPath: dirPath })
        .then((result: any) => {
          if (result?.success) {
            console.log(`[CodeLens] 项目索引完成: ${result.fileCount || 0} 文件, ${result.symbolCount || 0} 符号`);
          }
        })
        .catch((err: any) => {
          console.warn('[CodeLens] 项目索引失败（不影响文件浏览）:', err);
        });
    } catch (err) {
      console.error('加载项目失败:', err);
    }
  };

  const toggleExpand = async (node: FileNode) => {
    const newExpanded = new Set(expandedKeys);
    if (newExpanded.has(node.key)) {
      newExpanded.delete(node.key);
    } else {
      newExpanded.add(node.key);
      // 懒加载子目录
      if (!node.loaded && node.isDir) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const entries = await invoke<Array<{ name: string; isDir: boolean; path: string }>>(
            'read_directory',
            { path: node.path }
          );
          const filtered = entries.filter(
            (e) => !defaultExclude.includes(e.name) && !e.name.startsWith('.')
          );
          const children: FileNode[] = filtered.map((e) => ({
            key: e.path,
            title: e.name,
            isDir: e.isDir,
            path: e.path,
            loaded: !e.isDir,
            children: e.isDir ? [] : undefined,
          }));
          node.children = sortNodes(children);
          node.loaded = true;
          // 更新 treeData 中的节点
          setTreeData((prev) => updateNodeInTree(prev, node.key, node));
        } catch (err) {
          console.error('加载目录失败:', err);
        }
      }
    }
    setExpandedKeys(newExpanded);
  };

  /** 递归更新树中的节点 */
  const updateNodeInTree = (nodes: FileNode[], key: string, updated: FileNode): FileNode[] => {
    return nodes.map((n) => {
      if (n.key === key) return updated;
      if (n.children) {
        return { ...n, children: updateNodeInTree(n.children, key, updated) };
      }
      return n;
    });
  };

  // 监听来自父组件的 "打开项目" 事件（Ctrl+O 或菜单触发）
  useEffect(() => {
    const handleOpenProjectEvent = () => {
      handleOpenProject();
    };
    document.addEventListener('codelens:open-project', handleOpenProjectEvent);
    return () => {
      document.removeEventListener('codelens:open-project', handleOpenProjectEvent);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenProject = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择项目目录',
      });
      if (selected) {
        const dirPath = typeof selected === 'string' ? selected : (Array.isArray(selected) ? selected[0] : null);
        if (dirPath) {
          await loadProject(dirPath);
        }
      }
    } catch (err) {
      console.error('打开目录对话框失败:', err);
    }
  };

  /** 搜索输入处理（300ms 防抖） */
  const handleSearchInput = useCallback((value: string) => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      setSearchTerm(value);
    }, 300);
  }, []);

  /** 清空搜索 */
  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
  }, []);

  /** 右键菜单 */
  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  /** 右键菜单项点击 */
  const handleContextAction = useCallback((action: string) => {
    if (!contextMenu) return;
    const node = contextMenu.node;

    switch (action) {
      case 'open':
        if (!node.isDir) onFileSelect(node.path);
        break;
      case 'copy-path':
        navigator.clipboard.writeText(node.path).catch(() => {});
        break;
      case 'copy-relpath':
        if (projectPath) {
          const rel = node.path.replace(projectPath, '').replace(/^[\\/]/, '');
          navigator.clipboard.writeText(rel).catch(() => {});
        }
        break;
      case 'refresh':
        if (node.isDir) {
          node.loaded = false;
          node.children = [];
          setTreeData((prev) => updateNodeInTree(prev, node.key, { ...node }));
          // 重新展开
          toggleExpand({ ...node, loaded: false, children: [] });
        }
        break;
    }
  }, [contextMenu, projectPath, onFileSelect, toggleExpand]);

  /** 构建右键菜单项 */
  const buildMenuItems = useCallback((node: FileNode): MenuItemDef[] => {
    const items: MenuItemDef[] = [];
    if (!node.isDir) {
      items.push({ label: '打开文件', action: 'open' });
      items.push({ label: '复制文件路径', action: 'copy-path', separator: true });
    } else {
      items.push({ label: '复制目录路径', action: 'copy-path' });
    }
    if (projectPath) {
      items.push({ label: '复制相对路径', action: 'copy-relpath', separator: true });
    }
    if (node.isDir) {
      items.push({ label: '刷新', action: 'refresh', separator: true });
    }
    return items;
  }, [projectPath]);

  /** 计算过滤后的树数据 */
  const displayTreeData = useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return treeData;
    return filterTree(treeData, searchTerm);
  }, [treeData, searchTerm, filterTree]);

  const renderNode = (node: FileNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedKeys.has(node.key);

    return (
      <div key={node.key}>
        <div
          className={`tree-node ${node.isDir ? 'tree-node-dir' : 'tree-node-file'} ${isExpanded ? 'tree-node-expanded' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => node.isDir ? toggleExpand(node) : onFileSelect(node.path)}
          onContextMenu={(e) => handleContextMenu(e, node)}
        >
          <FileIcon
            filename={node.title}
            isDir={node.isDir}
            expanded={isExpanded}
          />
          <span className="tree-title">{node.title}</span>
        </div>
        {node.isDir && isExpanded && node.children && node.children.length > 0 && (
          <div className="tree-children">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span>资源管理器</span>
        <div className="file-tree-header-actions">
          {projectPath && (
            <button
              className="btn-icon file-tree-search-toggle"
              onClick={() => searchInputRef.current?.focus()}
              title="搜索文件"
            >
              &#128269;
            </button>
          )}
          <button className="btn-icon" onClick={handleOpenProject} title="打开项目">
            &#128194;
          </button>
        </div>
      </div>

      {/* 内嵌搜索框 */}
      {projectPath && (
        <div className="file-tree-search">
          <input
            ref={searchInputRef}
            className="file-tree-search-input"
            type="text"
            placeholder="搜索文件..."
            onChange={(e) => handleSearchInput(e.target.value)}
          />
          {searchTerm && (
            <button className="btn-icon file-tree-search-clear" onClick={handleClearSearch}>
              &times;
            </button>
          )}
        </div>
      )}

      <div className="file-tree-content">
        {treeData.length > 0 ? (
          displayTreeData.length > 0 ? (
            displayTreeData.map((node) => renderNode(node))
          ) : (
            <div className="file-tree-empty">
              <p>无匹配文件</p>
            </div>
          )
        ) : (
          <div className="file-tree-empty">
            <p>尚未打开项目</p>
            <button className="btn-primary" onClick={handleOpenProject}>
              打开文件夹
            </button>
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildMenuItems(contextMenu.node)}
          onSelect={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
