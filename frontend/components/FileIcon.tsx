/**
 * 文件类型图标组件（F-006）
 *
 * 基于文件扩展名显示对应的语言/类型徽标图标。
 * 使用 CSS 类名 + 背景色方案，不引入外部图标库。
 */

interface FileIconProps {
  filename: string;
  isDir?: boolean;
  expanded?: boolean;
}

/** 扩展名 → 徽标文本 + CSS 类名映射 */
const EXT_ICON_MAP: Record<string, { text: string; className: string }> = {
  // C/C++
  'cpp': { text: 'C++', className: 'icon-cpp' },
  'cc':  { text: 'C++', className: 'icon-cpp' },
  'cxx': { text: 'C++', className: 'icon-cpp' },
  'h':   { text: 'H',   className: 'icon-header' },
  'hpp': { text: 'H++', className: 'icon-header' },
  'hxx': { text: 'H++', className: 'icon-header' },
  'c':   { text: 'C',   className: 'icon-c' },
  // Rust
  'rs':  { text: 'Rs',  className: 'icon-rust' },
  // Python
  'py':  { text: 'Py',  className: 'icon-python' },
  // JavaScript / TypeScript
  'js':  { text: 'JS',  className: 'icon-js' },
  'jsx': { text: 'JSX', className: 'icon-js' },
  'ts':  { text: 'TS',  className: 'icon-ts' },
  'tsx': { text: 'TSX', className: 'icon-ts' },
  // Go
  'go':  { text: 'Go',  className: 'icon-go' },
  // Config / Data
  'json': { text: '{}',  className: 'icon-config' },
  'yaml': { text: 'YML', className: 'icon-config' },
  'yml':  { text: 'YML', className: 'icon-config' },
  'toml': { text: 'TOML', className: 'icon-config' },
  'xml':  { text: 'XML', className: 'icon-config' },
  // CMake
  'cmake': { text: 'CM', className: 'icon-cmake' },
  // Document
  'md':  { text: 'MD',  className: 'icon-doc' },
  'txt': { text: 'TXT', className: 'icon-doc' },
  'rst': { text: 'RST', className: 'icon-doc' },
};

/** 特殊文件名匹配（如 CMakeLists.txt） */
const SPECIAL_NAME_MAP: Record<string, { text: string; className: string }> = {
  'cmakelists.txt':     { text: 'CM', className: 'icon-cmake' },
  'makefile':           { text: 'MK', className: 'icon-cmake' },
  'dockerfile':         { text: 'DK', className: 'icon-config' },
  '.gitignore':         { text: 'GI', className: 'icon-config' },
  '.gitattributes':     { text: 'GA', className: 'icon-config' },
  'license':            { text: 'LI', className: 'icon-doc' },
};

function getFileIcon(filename: string): { text: string; className: string } | null {
  const lower = filename.toLowerCase();

  // 先检查特殊文件名
  const special = SPECIAL_NAME_MAP[lower];
  if (special) return special;

  // 再按扩展名查找
  const dotIndex = lower.lastIndexOf('.');
  if (dotIndex > 0) {
    const ext = lower.substring(dotIndex + 1);
    const mapped = EXT_ICON_MAP[ext];
    if (mapped) return mapped;
  }

  return null;
}

export default function FileIcon({ filename, isDir, expanded }: FileIconProps) {
  if (isDir) {
    return (
      <span className="tree-dir-arrow">
        {expanded ? '▾' : '▸'}
      </span>
    );
  }

  const icon = getFileIcon(filename);
  if (!icon) {
    return <span className="tree-file-generic">—</span>;
  }

  return (
    <span className={`tree-file-icon ${icon.className}`}>
      {icon.text}
    </span>
  );
}
