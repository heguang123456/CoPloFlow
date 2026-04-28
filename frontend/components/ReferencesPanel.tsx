/**
 * 引用查找结果面板组件（F-003）
 *
 * 功能：
 * - 显示符号的所有引用位置列表
 * - 支持点击跳转到引用位置
 * - 区分定义和引用（定义显示特殊标记）
 * - 显示引用所在行的上下文代码
 */

interface ReferenceItem {
  filePath: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  contextLine: string;
  isDefinition: boolean;
}

interface ReferencesPanelProps {
  symbolName: string;
  references: ReferenceItem[];
  isLoading: boolean;
  onJumpTo: (filePath: string, line: number, col: number) => void;
  onClose: () => void;
}

export default function ReferencesPanel({
  symbolName,
  references,
  isLoading,
  onJumpTo,
  onClose,
}: ReferencesPanelProps) {
  // 按文件分组引用
  const groupedRefs = references.reduce<Record<string, ReferenceItem[]>>((acc, ref) => {
    const key = ref.filePath;
    if (!acc[key]) acc[key] = [];
    acc[key].push(ref);
    return acc;
  }, {});

  return (
    <div className="references-panel" style={{
      position: 'absolute',
      right: 300,
      top: 40,
      width: 420,
      maxHeight: 500,
      background: '#252526',
      border: '1px solid #3e3e42',
      borderRadius: 6,
      zIndex: 1000,
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* 面板标题 */}
      <div style={{
        padding: '8px 12px',
        background: '#1e1e1e',
        borderBottom: '1px solid #3e3e42',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: '#ccc', fontSize: 13, fontWeight: 600 }}>
          {isLoading ? '搜索中...' : `引用: '${symbolName}' (${references.length})`}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#858585',
            cursor: 'pointer',
            fontSize: 16,
            padding: '0 4px',
            lineHeight: 1,
          }}
          title="关闭 (Escape)"
        >
          ✕
        </button>
      </div>

      {/* 引用列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
        {isLoading ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#858585' }}>
            正在搜索引用...
          </div>
        ) : references.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#858585' }}>
            未找到引用
          </div>
        ) : (
          Object.entries(groupedRefs).map(([filePath, refs]) => (
            <div key={filePath}>
              {/* 文件路径标题 */}
              <div style={{
                padding: '4px 12px',
                background: '#2a2d2e',
                color: '#858585',
                fontSize: 11,
                fontFamily: 'Consolas, monospace',
              }}>
                {filePath.split(/[\\/]/).slice(-2).join('/')}
              </div>

              {/* 引用条目 */}
              {refs.map((ref, idx) => (
                <div
                  key={`${ref.filePath}:${ref.startLine}:${idx}`}
                  onClick={() => onJumpTo(ref.filePath, ref.startLine, ref.startCol)}
                  style={{
                    padding: '4px 12px 4px 24px',
                    cursor: 'pointer',
                    borderLeft: ref.isDefinition ? '3px solid #569CD6' : '3px solid transparent',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'baseline',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = '#2a2d2e';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  }}
                  title={`跳转到 ${filePath}:${ref.startLine + 1}:${ref.startCol + 1}`}
                >
                  {/* 行号 */}
                  <span style={{
                    color: ref.isDefinition ? '#569CD6' : '#6A9955',
                    fontSize: 11,
                    fontFamily: 'Consolas, monospace',
                    minWidth: 30,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}>
                    {ref.startLine + 1}
                  </span>

                  {/* 标记 */}
                  {ref.isDefinition && (
                    <span style={{
                      color: '#569CD6',
                      fontSize: 10,
                      fontWeight: 'bold',
                      flexShrink: 0,
                    }}>
                      DEF
                    </span>
                  )}

                  {/* 代码行 */}
                  <code style={{
                    color: '#d4d4d4',
                    fontSize: 12,
                    fontFamily: 'Consolas, monospace',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {ref.contextLine.trim()}
                  </code>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
