/**
 * 符号大纲组件属性
 */
interface SymbolOutlineProps {
  filePath: string | null;
}

/**
 * 符号大纲数据结构
 */
interface OutlineNode {
  name: string;
  kind: string;
  line: number;
  col: number;
  children?: OutlineNode[];
}

/**
 * 符号大纲面板组件（F-004）
 *
 * 功能：
 * - 显示当前文件的函数、类、结构体等符号列表
 * - 支持点击跳转到对应行
 * - 支持嵌套显示（如类包含成员函数）
 *
 * 当前阶段：占位组件，后续阶段通过 C++ Sidecar 获取符号数据
 */
export default function SymbolOutline({ filePath }: SymbolOutlineProps) {
  // 后续阶段：通过 Tauri IPC 调用 textDocument/outline 获取符号数据
  // 当前阶段：显示占位内容
  const outline: OutlineNode[] = [];

  return (
    <div className="symbol-outline">
      <div className="symbol-outline-header">
        <span>符号大纲</span>
      </div>
      <div className="symbol-outline-content">
        {filePath ? (
          outline.length > 0 ? (
            <ul className="outline-list">
              {outline.map((node, idx) => (
                <li key={idx} className="outline-item">
                  <span className="outline-icon">
                    {node.kind === 'Function' ? 'ƒ' :
                     node.kind === 'Class' ? 'C' :
                     node.kind === 'Struct' ? 'S' : '•'}
                  </span>
                  <span className="outline-name">{node.name}</span>
                  <span className="outline-line">:{node.line}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="outline-empty">
              <p>打开文件后显示符号大纲</p>
              <p className="text-hint">当前文件的函数、类、结构体将显示在此</p>
            </div>
          )
        ) : (
          <div className="outline-empty">
            <p>尚未打开文件</p>
          </div>
        )}
      </div>
    </div>
  );
}
