# F-004 符号大纲（Document Outline）设计文档

> 阶段4 - 索引与搜索
> 创建日期：2026-04-28

## 1. 功能描述

显示当前打开文件的函数、类、结构体等符号列表，支持嵌套显示和点击跳转。

**功能 ID**：F-004
**优先级**：P1
**性能指标**：生成大纲延迟 < 100ms

## 2. 技术方案

### 2.1 数据流

```
用户切换文件（filePath 变化）
  → 前端 SymbolOutline 组件 useEffect 触发
  → Tauri IPC: sidecar_document_outline(filepath)
  → Sidecar 进程: textDocument/outline JSON-RPC
  → SymbolService.extractSymbols(filepath)
  → 构建嵌套结构（父子关系）
  → 返回 OutlineNode[] JSON
  → 前端渲染符号大纲列表
```

### 2.2 复用策略

- **核心逻辑复用**：`symbol/extract` 方法已在阶段3实现，直接调用 `SymbolService.extractSymbols(filepath)` 获取扁平符号列表
- **新增价值**：新增 `textDocument/outline` 方法，在 Sidecar 侧将扁平符号列表转换为嵌套结构，减少前端计算负担

### 2.3 嵌套结构构建算法

根据符号的行号范围确定父子关系：

```
伪代码:
buildOutlineTree(symbols):
  symbols ← sortBy(startLine)
  stack ← []    // 嵌套深度栈
  rootNodes ← []

  for sym in symbols:
    node ← { name: sym.name, kind: sym.kind, line: sym.startLine, children: [] }

    // 弹出栈中不包含当前节点的父节点
    while stack not empty AND stack.top.endLine < sym.startLine:
      stack.pop()

    if stack is empty:
      rootNodes.append(node)
    else:
      stack.top.children.append(node)

    // 容器类型节点入栈
    if sym.kind in [Class, Struct, Namespace]:
      stack.push(node)

  return rootNodes
```

### 2.4 符号类型与图标映射

| 符号类型 | 图标 | 优先级 |
|----------|------|--------|
| Function / Method | ƒ | 高 |
| Constructor / Destructor | ƒ | 高 |
| Class | C | 高 |
| Struct | S | 中 |
| Namespace | N | 中 |
| Enum / EnumMember | E | 中 |
| Variable / Field | V | 低 |
| TypeAlias | T | 低 |
| Macro | M | 低 |

### 2.5 JSON-RPC 接口

**方法**：`textDocument/outline`

**请求**：
```json
{
  "jsonrpc": "2.0",
  "method": "textDocument/outline",
  "params": {
    "filepath": "file:///path/to/file.cpp"
  },
  "id": 1
}
```

**响应**：
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "filepath": "/path/to/file.cpp",
    "symbolCount": 12,
    "outlineNodes": [
      {
        "name": "MyClass",
        "kind": "Class",
        "line": 5,
        "children": [
          { "name": "myMethod", "kind": "Method", "line": 8, "children": [] },
          { "name": "member_", "kind": "Field", "line": 15, "children": [] }
        ]
      },
      { "name": "freeFunction", "kind": "Function", "line": 25, "children": [] }
    ]
  },
  "id": 1
}
```

### 2.6 前端组件接口

**SymbolOutline Props**：
| 属性 | 类型 | 说明 |
|------|------|------|
| filePath | string \| null | 当前文件路径 |
| onSymbolSelect | (line: number) => void | 符号点击跳转回调 |

**行为**：
- filePath 变化时自动加载大纲
- 空文件路径时显示"尚未打开文件"
- 无符号时显示"未找到符号"
- 点击符号 → 触发 onSymbolSelect → 编辑器跳转到对应行
- 容器类型（Class/Struct/Namespace）显示可折叠箭头

## 3. 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `sidecar/src/main.cpp` | 修改 | 新增 textDocument/outline 方法 |
| `src-tauri/src/lib.rs` | 修改 | 新增 sidecar_document_outline 命令 |
| `frontend/components/SymbolOutline.tsx` | 重写 | 完整实现大纲组件 |
| `frontend/pages/index.tsx` | 修改 | 集成 onSymbolSelect 回调 |
