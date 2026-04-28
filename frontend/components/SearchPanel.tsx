'use client';

import { useState } from 'react';

/**
 * 搜索结果项数据结构
 * 与 C++ Sidecar symbol/search 返回结构一致
 */
interface SearchResultItem {
  name: string;
  kind: string;
  filePath: string;
  line: number;
  col: number;
  qualifiedName: string;
}

/**
 * 搜索面板属性
 */
interface SearchPanelProps {
  query: string;
  results: SearchResultItem[];
  totalCount: number;
  isLoading: boolean;
  onJumpTo: (filePath: string, line: number, col: number) => void;
  onClose: () => void;
}

/**
 * 符号种类到图标的映射
 */
const KIND_ICONS: Record<string, string> = {
  Class: 'C',
  Struct: 'S',
  Function: 'ƒ',
  Method: 'ƒ',
  Variable: 'v',
  Field: 'F',
  Namespace: 'N',
  Enum: 'E',
  EnumMember: 'e',
  Typedef: 'T',
  Macro: '#',
  Constructor: 'ƒ',
  Destructor: 'ƒ',
};

/**
 * 符号种类图标的颜色
 */
const KIND_COLORS: Record<string, string> = {
  Class: '#4ec9b0',
  Struct: '#4ec9b0',
  Function: '#dcdcaa',
  Method: '#dcdcaa',
  Variable: '#9cdcfe',
  Field: '#9cdcfe',
  Namespace: '#c586c0',
  Enum: '#4ec9b0',
  EnumMember: '#9cdcfe',
  Typedef: '#569cd6',
  Macro: '#569cd6',
  Constructor: '#dcdcaa',
  Destructor: '#dcdcaa',
};

/**
 * 从完整路径中提取文件名
 */
function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

/**
 * 从完整路径中提取目录
 */
function getDirName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  parts.pop();
  return parts.slice(-2).join('/');
}

/**
 * 搜索结果面板组件（F-005）
 *
 * 功能：
 * - 显示符号搜索结果列表
 * - 支持点击跳转到定义位置
 * - 显示符号类型图标和颜色区分
 */
export default function SearchPanel({
  query,
  results,
  totalCount,
  isLoading,
  onJumpTo,
  onClose,
}: SearchPanelProps) {
  const [activeIdx, setActiveIdx] = useState(-1);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0 && activeIdx < results.length) {
      e.preventDefault();
      const item = results[activeIdx];
      onJumpTo(item.filePath, item.line, item.col);
    }
  };

  return (
    <div className="search-panel" onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="search-panel-header">
        <span className="search-panel-title">
          {isLoading ? (
            <>搜索中: &quot;{query}&quot;...</>
          ) : (
            <>
              搜索: &quot;{query}&quot;
              {totalCount > 0 && <span className="search-count"> ({totalCount})</span>}
            </>
          )}
        </span>
        <button className="btn-icon search-panel-close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="search-panel-content">
        {isLoading && (
          <div className="search-loading">
            <span className="outline-spinner" />
            <span>正在搜索...</span>
          </div>
        )}

        {!isLoading && totalCount === 0 && (
          <div className="search-empty">
            <p>未找到匹配结果</p>
            <p className="text-hint">尝试使用更短的关键词</p>
          </div>
        )}

        {!isLoading && results.length > 0 && (
          <ul className="search-results">
            {results.map((item, idx) => (
              <li
                key={`${item.name}-${item.filePath}-${item.line}`}
                className={`search-result-item ${idx === activeIdx ? 'search-result-active' : ''}`}
                onClick={() => onJumpTo(item.filePath, item.line, item.col)}
                onMouseEnter={() => setActiveIdx(idx)}
              >
                <span className="search-result-icon" style={{ color: KIND_COLORS[item.kind] || 'var(--accent-color)' }}>
                  {KIND_ICONS[item.kind] || '•'}
                </span>
                <span className="search-result-name">{item.name}</span>
                <span className="search-result-kind">{item.kind}</span>
                <span className="search-result-file">
                  {getFileName(item.filePath)}
                  <span className="search-result-dir"> {getDirName(item.filePath)}</span>
                </span>
                <span className="search-result-line">:{item.line + 1}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
