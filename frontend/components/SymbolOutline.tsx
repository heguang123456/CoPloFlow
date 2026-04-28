'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * 符号大纲组件属性
 */
interface SymbolOutlineProps {
  filePath: string | null;
  /** 点击大纲项时触发的回调（可选，用于跳转到对应行） */
  onSymbolClick?: (line: number) => void;
}

/**
 * 符号大纲节点数据结构
 * 与 C++ Sidecar textDocument/outline 返回结构一致
 */
interface OutlineNode {
  name: string;
  kind: string;
  line: number;
  children?: OutlineNode[];
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
  Operator: 'op',
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
  Operator: '#dcdcaa',
};

/**
 * 可折叠的大纲项组件
 */
function OutlineItem({
  node,
  depth,
  activeLine,
  onSymbolClick,
}: {
  node: OutlineNode;
  depth: number;
  activeLine: number | null;
  onSymbolClick?: (line: number) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const [expanded, setExpanded] = useState(true);
  const isActive = activeLine !== null && node.line === activeLine;

  const handleClick = () => {
    onSymbolClick?.(node.line);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  return (
    <li className="outline-node">
      <div
        className={`outline-item ${isActive ? 'outline-item-active' : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={handleClick}
        title={`${node.kind}: ${node.name} (行 ${node.line})`}
      >
        {/* 展开/折叠箭头 */}
        <span
          className={`outline-toggle ${hasChildren ? '' : 'outline-toggle-invisible'}`}
          onClick={handleToggle}
        >
          {hasChildren ? (expanded ? '▾' : '▸') : ''}
        </span>

        {/* 图标 */}
        <span className="outline-icon" style={{ color: KIND_COLORS[node.kind] || 'var(--accent-color)' }}>
          {KIND_ICONS[node.kind] || '•'}
        </span>

        {/* 名称 */}
        <span className="outline-name">{node.name}</span>

        {/* 行号 */}
        <span className="outline-line">:{node.line}</span>
      </div>

      {/* 子节点 */}
      {hasChildren && expanded && (
        <ul className="outline-list">
          {node.children!.map((child, idx) => (
            <OutlineItem
              key={`${child.name}-${child.line}-${idx}`}
              node={child}
              depth={depth + 1}
              activeLine={activeLine}
              onSymbolClick={onSymbolClick}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * 符号大纲面板组件（F-004）
 *
 * 功能：
 * - 显示当前文件的函数、类、结构体等符号列表
 * - 支持点击跳转到对应行
 * - 支持嵌套显示（如类包含成员函数）
 * - 支持展开/折叠
 * - 自动刷新：切换文件时重新加载大纲
 */
export default function SymbolOutline({ filePath, onSymbolClick }: SymbolOutlineProps) {
  const [outlineNodes, setOutlineNodes] = useState<OutlineNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [symbolCount, setSymbolCount] = useState(0);
  const [activeLine, setActiveLine] = useState<number | null>(null);

  /**
   * 从 Sidecar 加载大纲数据
   */
  const loadOutline = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setActiveLine(null);

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{
        success: boolean;
        filepath: string;
        symbolCount: number;
        outlineNodes: OutlineNode[];
      }>('sidecar_document_outline', { filepath: path });

      if (result && result.success) {
        setOutlineNodes(result.outlineNodes || []);
        setSymbolCount(result.symbolCount || 0);
      } else {
        setOutlineNodes([]);
        setError('大纲数据加载失败');
      }
    } catch (err: any) {
      console.error('符号大纲加载失败:', err);
      setOutlineNodes([]);
      setError(err?.toString?.() || 'Sidecar 通信失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 文件切换时自动加载大纲
  useEffect(() => {
    if (filePath) {
      loadOutline(filePath);
    } else {
      setOutlineNodes([]);
      setSymbolCount(0);
      setError(null);
      setActiveLine(null);
    }
  }, [filePath, loadOutline]);

  /**
   * 处理符号点击：高亮当前项 + 通知父组件跳转
   */
  const handleSymbolClick = useCallback((line: number) => {
    setActiveLine(line);
    onSymbolClick?.(line);
  }, [onSymbolClick]);

  return (
    <div className="symbol-outline">
      <div className="symbol-outline-header">
        <span>符号大纲</span>
        {symbolCount > 0 && (
          <span className="outline-count">{symbolCount}</span>
        )}
      </div>
      <div className="symbol-outline-content">
        {!filePath ? (
          <div className="outline-empty">
            <p>尚未打开文件</p>
          </div>
        ) : loading ? (
          <div className="outline-loading">
            <span className="outline-spinner" />
            <span>正在解析符号...</span>
          </div>
        ) : error ? (
          <div className="outline-empty">
            <p>{error}</p>
            <p className="text-hint">请确认文件为支持的源代码格式</p>
          </div>
        ) : outlineNodes.length > 0 ? (
          <ul className="outline-list">
            {outlineNodes.map((node, idx) => (
              <OutlineItem
                key={`${node.name}-${node.line}-${idx}`}
                node={node}
                depth={0}
                activeLine={activeLine}
                onSymbolClick={handleSymbolClick}
              />
            ))}
          </ul>
        ) : (
          <div className="outline-empty">
            <p>未找到符号</p>
            <p className="text-hint">当前文件中没有可识别的代码符号</p>
          </div>
        )}
      </div>
    </div>
  );
}
