# 阶段4 测试报告：索引与搜索（F-004 + F-005）

**测试日期**：2026-04-29
**测试阶段**：阶段4 — 符号大纲 + 项目符号索引 + 符号搜索
**测试类型**：编译验证 + 端到端功能测试
**测试范围**：C++ Sidecar、Tauri IPC 命令、前端组件

---

## 1. 测试环境

| 项目 | 配置 |
|------|------|
| 操作系统 | Windows 11 |
| 编译器 | MSVC (Visual Studio 2022 Community) |
| C++ 标准 | C++20 |
| CMake | 3.31.6 |
| Node.js | v24.13.0 |
| Rust | 1.95.0 |
| 前端框架 | Next.js 14.2.35 |

---

## 2. 编译验证

### 2.1 C++ Sidecar

```
命令：cmake --build . --config Release
结果：✅ 编译成功
输出：codelens-sidecar.exe (Release)
警告：2 个（std::transform lambda 签名、未初始化变量，不影响功能）
```

### 2.2 Tauri 后端（Rust）

```
命令：cargo check
结果：✅ Finished dev profile [unoptimized + debuginfo]
耗时：5.71s（增量编译，全量缓存已清理后重建约 1m 40s）
```

### 2.3 前端（Next.js）

```
命令：npx next build
结果：✅ Compiled successfully
输出：3 个静态页面生成成功
  Route (pages)                             Size     First Load JS
  ○ / (335 ms)                            12.3 kB          93 kB
  ├ /_app                                 0 B            80.7 kB
  └ ○ /404                                  180 B          80.9 kB
```

---

## 3. 端到端功能测试

### 3.1 F-004 文档符号大纲

**测试命令**：`textDocument/outline` on `sidecar/src/main.cpp`

| 测试项 | 预期 | 实际 | 结果 |
|--------|------|------|------|
| 返回 success 字段 | true | true | ✅ |
| symbolCount > 0 | 正数 | 65 | ✅ |
| outlineNodes 非空 | 数组 | 65 个节点 | ✅ |
| 节点包含 name 字段 | 字符串 | 如 "signalHandler" | ✅ |
| 节点包含 kind 字段 | 字符串 | 如 "Function", "Struct" | ✅ |
| 节点包含 line 字段 | 数字 | 如 50 | ✅ |
| 节点包含 children | 数组 | 空数组或嵌套数组 | ✅ |
| 函数正确识别 | Function | symbolToJson 等 | ✅ |
| 结构体正确识别 | Struct | OutlineNode | ✅ |
| 变量正确识别 | Variable | g_server 等 | ✅ |

### 3.2 F-005 项目符号索引

**测试命令**：`symbol/index` on `sidecar/src/`

| 测试项 | 预期 | 实际 | 结果 |
|--------|------|------|------|
| 返回 success 字段 | true | true | ✅ |
| indexedFiles > 0 | 正数 | 5 | ✅ |
| totalSymbols > 0 | 正数 | 232 | ✅ |
| indexedFileList 非空 | 文件路径数组 | 5 个 .cpp 文件 | ✅ |
| 索引 third_party 目录 | 大量文件 | 531 文件 6459 符号 | ✅ |

### 3.3 F-005 符号搜索

**测试命令**：先 `symbol/index`，再 `symbol/search` query="Symbol"

| 测试项 | 预期 | 实际 | 结果 |
|--------|------|------|------|
| 前缀匹配 | 包含 "Symbol" 开头 | symbolToJson 等 | ✅ |
| 子串匹配 | 包含含 "Symbol" 的 | symbols 变量等 | ✅ |
| 结果包含 name | 字符串 | symbolToJson | ✅ |
| 结果包含 kind | 字符串 | Function, Variable | ✅ |
| 结果包含 filePath | 文件路径 | main.cpp | ✅ |
| 结果包含 line | 数字 | 如 72 | ✅ |
| 结果包含 qualifiedName | 字符串 | symbol_ns::... | ✅ |
| totalCount 正确 | 与 results 数组长度一致 | 10 | ✅ |
| 短关键词拦截 | < 2 字符返回空 | 返回 totalCount=0 | ✅ |
| 大小写不敏感 | "symbol" 和 "Symbol" 等效 | 均返回结果 | ✅ |
| limit 参数生效 | 限制最大结果数 | 10 条 | ✅ |

---

## 4. 已知限制

| 项目 | 说明 | 影响 | 计划 |
|------|------|------|------|
| 无 SQLite 持久化 | 索引仅存内存，Sidecar 进程重启后丢失 | 每次应用启动需重建索引 | 后续版本集成 SQLite amalgamation |
| 搜索需先索引 | 如果未调用 symbol/index，搜索返回空结果 | 前端需确保先触发索引 | 通过前端生命周期自动触发 |
| 仅支持 C/C++ | Tree-sitter 当前仅配置 C++ parser | 其他语言文件不会被索引 | 后续添加更多语言 parser |

---

## 5. 编译器警告记录

| 文件 | 行号 | 警告 | 严重度 |
|------|------|------|--------|
| symbol.cpp | 824 | C4996: std::transform + C 风格函数指针签名 | 低 |
| symbol.cpp | 389 | C4701: 可能未初始化局部变量 kind | 低 |

---

## 6. 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `sidecar/include/symbol.h` | 修改 | 新增 searchSymbols 方法声明 |
| `sidecar/src/symbol.cpp` | 修改 | 实现 searchSymbols（前缀+子串匹配） |
| `sidecar/src/main.cpp` | 修改 | 新增 symbol/search JSON-RPC 方法 |
| `src-tauri/src/lib.rs` | 修改 | 新增 sidecar_search_symbols 命令 |
| `frontend/components/SymbolOutline.tsx` | 重写 | 完整大纲组件（IPC + 嵌套渲染） |
| `frontend/components/SearchPanel.tsx` | 新增 | 搜索结果面板组件 |
| `frontend/pages/index.tsx` | 修改 | 集成搜索栏 + 搜索面板 + 版本号更新 |
| `frontend/styles/globals.css` | 修改 | 新增搜索相关 CSS 样式 |
| `docs/DESIGN_F004_OUTLINE.md` | 新增 | F-004 设计文档 |
| `docs/DESIGN_F005_INDEX.md` | 新增 | F-005 设计文档 |
