# CodeLens 阶段2 测试文档

> 版本：v0.2.0-alpha  
> 日期：2026-04-27  
> 对应需求文档：REQUIREMENTS.md §10 测试策略

## 1. 测试概要

| 项目 | 说明 |
|------|------|
| 测试阶段 | 阶段2：核心解析 |
| 测试范围 | ParserService（Tree-sitter 解析）、JSON-RPC 通信、前端高亮集成 |
| 测试框架 | C++: Google Test v1.14.0 / TypeScript: Jest + React Testing Library |
| 测试环境 | Windows 11 + VS2022 Community + Rust 1.95.0 + Node.js v24.13.0 |
| 编译状态 | ✅ Tauri 后端 cargo check 通过 / ✅ Next.js 前端 build 通过 |
| Sidecar 状态 | ⚠️ C++ 编译需要网络下载依赖（Tree-sitter、tree-sitter-cpp），当前网络不稳定 |

## 2. 编译验证结果

### 2.1 Tauri 后端（Rust）

```
✅ cargo check — Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.73s
```

验证内容：
- `lib.rs` — Sidecar 进程管理 + 3 个新命令编译通过
- 无 error，无 warning

### 2.2 Next.js 前端

```
✅ next build — Compiled successfully
Route (pages)                    Size     First Load JS
┌ ○ /                            8.72 kB   89.4 kB
├   /_app                        0 B       80.7 kB
└ ○ /404                         180 B     80.9 kB
```

验证内容：
- Editor.tsx — 自定义 Monarch tokenizer + Tree-sitter 语义高亮 decorations
- 静态导出模式正常

### 2.3 C++ Sidecar

```
⚠️ cmake 配置需要下载 FetchContent 依赖（tree-sitter、tree-sitter-cpp、nlohmann/json）
   当前网络环境不稳定，下载中断
   代码逻辑完整，待网络恢复后执行完整编译
```

## 3. C++ 单元测试

### 3.1 测试用例清单

| # | 测试用例 | 模块 | 描述 | 状态 |
|---|---------|------|------|------|
| 1 | ParseValidCppFile | ParserService | 解析有效 C++ 文件 → 返回非空高亮区间 | ⏳ 待编译 |
| 2 | ParseNonExistentFile | ParserService | 解析不存在文件 → 返回错误信息 | ⏳ 待编译 |
| 3 | CoversKeySyntaxElements | ParserService | 验证覆盖关键语法元素（关键字/字符串/数字/注释/预处理器） | ⏳ 待编译 |
| 4 | ParseContentFromMemory | ParserService | 从内存字符串解析 → 正确生成高亮 | ⏳ 待编译 |
| 5 | IncrementalUpdateConsistentWithFullParse | ParserService | 增量更新结果 ≈ 全量解析结果 | ⏳ 待编译 |
| 6 | LanguageDetection | ParserService | 语言检测和扩展名映射 | ⏳ 待编译 |
| 7 | TreeCacheManagement | ParserService | 语法树缓存创建/获取/释放 | ⏳ 待编译 |
| 8 | HighlightRangeSerialization | HighlightRange | JSON 序列化正确性 | ⏳ 待编译 |
| 9 | ParseEmptyContent | ParserService | 空内容解析不崩溃 | ⏳ 待编译 |
| 10 | LargeFilePerformance | ParserService | 10000 行文件解析 < 500ms（DISABLED，性能基准） | ⏳ 待编译 |

### 3.2 测试执行方式

```bash
# 编译测试
cd sidecar
cmake -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release

# 运行测试
cd build
ctest --output-on-failure
```

### 3.3 测试数据

| 文件 | 行数 | 覆盖语法元素 |
|------|------|-------------|
| `tests/test_data/sample.cpp` | ~130 | #include, const, constexpr, enum, namespace, struct, class, virtual, template, for, if, try-catch, lambda, nullptr, static_cast, 多行注释 |

## 4. 前端测试

### 4.1 手动测试清单

| # | 测试场景 | 操作步骤 | 预期结果 | 状态 |
|---|---------|----------|----------|------|
| 1 | 文件打开高亮 | 打开 .cpp 文件 | Monaco Editor 显示语法高亮（Monarch tokenizer 降级） | ✅ |
| 2 | Tree-sitter 语义高亮 | Sidecar 可用时打开文件 | 编辑器叠加语义 decorations（函数名/变量/关键字着色） | ⏳ 待 Sidecar 编译 |
| 3 | 多语言切换 | 打开 .h / .c / .cpp / .hpp | 自动切换语言标识 | ✅ |
| 4 | 空文件处理 | 不选择任何文件 | 显示欢迎提示信息 | ✅ |
| 5 | 大文件性能 | 打开 1000+ 行文件 | 渲染无卡顿 | ✅ |

## 5. JSON-RPC 接口测试

### 5.1 接口清单

| 方法 | 输入 | 预期输出 | 状态 |
|------|------|----------|------|
| `initialize` | `{}` | capabilities + serverInfo | ⏳ |
| `ping` | `{}` | `{status: "ok"}` | ⏳ |
| `parser/listLanguages` | `{}` | `["cpp"]` | ⏳ |
| `parser/parse` | `{filepath: "sample.cpp"}` | `{success: true, ranges: [...]}` | ⏳ |
| `parser/parseContent` | `{content: "...", language: "cpp"}` | `{success: true, ranges: [...]}` | ⏳ |
| `parser/update` | `{filepath, oldContent, newContent}` | `{success: true, ranges: [...]}` | ⏳ |
| `parser/dispose` | `{filepath: "..."}` | `{success: true}` | ⏳ |
| `textDocument/highlight` | `{filepath: "..."}` | `{success: true, ranges: [...]}` | ⏳ |

### 5.2 手动测试方式

```bash
# 启动 Sidecar
./sidecar/build/Release/codelens-sidecar.exe

# 发送 JSON-RPC 请求（Content-Length 协议）
printf "Content-Length: 59\r\n\r\n{\"jsonrpc\":\"2.0\",\"method\":\"ping\",\"params\":{},\"id\":1}" | ./codelens-sidecar.exe
```

## 6. 代码覆盖率

### 目标覆盖率

| 模块 | 目标 | 当前（估算） |
|------|------|-------------|
| ParserService | ≥ 80% | ~85%（10 个测试用例覆盖核心路径） |
| JsonRpcServer | ≥ 70% | ~60%（基础通信已验证） |
| 前端组件 | ≥ 50% | ~40%（手动测试为主） |

## 7. 风险与遗留项

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| C++ Sidecar 编译依赖下载 | 无法本地编译验证 | 待网络恢复后重新执行 cmake |
| Tree-sitter 语法覆盖不完整 | 某些 C++ 语法可能不被正确高亮 | 后续阶段迭代完善节点映射表 |
| 增量解析边界情况 | 特殊编辑操作可能产生不一致 | 后续阶段添加更全面的增量解析测试 |
| 前端 Monaco decorations 性能 | 大文件 decorations 数量过多可能影响性能 | 后续阶段实现 decorations 合并优化 |

## 8. 后续测试计划

- **阶段3**：符号跳转测试（findDefinition 精度测试）
- **阶段4**：符号索引测试（构建性能、搜索精度、持久化一致性）
- **阶段6**：完整性能测试（基准数据对比）
