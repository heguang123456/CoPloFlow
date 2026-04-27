import { useState } from 'react';

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
 * - 支持展开/折叠目录
 * - 点击文件触发 onFileSelect 回调
 * - 排除指定目录（如 .git、node_modules）
 */
export default function FileTree({ onFileSelect, excludePatterns }: FileTreeProps) {
  const defaultExclude = excludePatterns ?? ['.git', 'node_modules', '.codelens', 'build', 'out', 'target'];
  const [treeData, setTreeData] = useState<FileNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [projectPath, setProjectPath] = useState<string | null>(null);

  const loadProject = async (dirPath: string) => {
    setProjectPath(dirPath);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const entries = await invoke<Array<{ name: string; isDir: boolean; path: string }>>(
        'read_directory',
        { path: dirPath }
      );
      const filtered = entries.filter(
        (e) => !defaultExclude.includes(e.name)
      );
      const nodes: FileNode[] = filtered.map((e) => ({
        key: e.path,
        title: e.name,
        isDir: e.isDir,
        path: e.path,
        loaded: !e.isDir,
      }));
      setTreeData(nodes);
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
          node.children = filtered.map((e) => ({
            key: e.path,
            title: e.name,
            isDir: e.isDir,
            path: e.path,
            loaded: !e.isDir,
          }));
          node.loaded = true;
        } catch (err) {
          console.error('加载目录失败:', err);
        }
      }
    }
    setExpandedKeys(newExpanded);
  };

  const handleOpenProject = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择项目目录',
      });
      if (selected) {
        // open() returns string | string[] | null for directory dialog
        const dirPath = typeof selected === 'string' ? selected : (Array.isArray(selected) ? selected[0] : null);
        if (dirPath) {
          await loadProject(dirPath);
        }
      }
    } catch (err) {
      console.error('打开目录对话框失败:', err);
    }
  };

  const renderNode = (node: FileNode, depth: number = 0): React.ReactNode => (
    <div key={node.key}>
      <div
        className={`tree-node ${node.isDir ? 'tree-node-dir' : 'tree-node-file'}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => node.isDir ? toggleExpand(node) : onFileSelect(node.path)}
      >
        <span className="tree-icon">
          {node.isDir ? (expandedKeys.has(node.key) ? '📂' : '📁') : '📄'}
        </span>
        <span className="tree-title">{node.title}</span>
      </div>
      {node.isDir && expandedKeys.has(node.key) && node.children && (
        <div className="tree-children">
          {node.children.map((child) => renderNode(child, depth + 1))}
        </div>
      )}
    </div>
  );

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span>资源管理器</span>
        <button className="btn-icon" onClick={handleOpenProject} title="打开项目">
          📂
        </button>
      </div>
      <div className="file-tree-content">
        {treeData.length > 0 ? (
          treeData.map((node) => renderNode(node))
        ) : (
          <div className="file-tree-empty">
            <p>尚未打开项目</p>
            <button className="btn-primary" onClick={handleOpenProject}>
              打开文件夹
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
