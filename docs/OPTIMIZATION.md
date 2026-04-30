# CodeLens 优化文档

> 本文档记录 CodeLens 代码阅读器的优化过程，涵盖问题分析、技术方案、实现关键设计、效果评估及后续优化方向。

## 文档信息

| 项目 | 信息 |
|------|------|
| 文档版本 | v2.0 |
| 创建日期 | 2026-04-30 |
| 最后更新 | 2026-04-30 |
| 适用版本 | v0.7.0 |
| 参考规范 | REQUIREMENTS.md §5 技术优化方案 |

---

## 目录

1. [v0.7.0 优化总览](#1-v070-优化总览)
2. [OPT-007: Sidecar 常驻进程 + 管道复用](#2-opt-007-sidecar-常驻进程--管道复用)
3. [OPT-008: 语义高亮结果缓存](#3-opt-008-语义高亮结果缓存)
4. [OPT-009: 跨文件引用查找修复](#4-opt-009-跨文件引用查找修复)
5. [OPT-010: Ctrl+O 已打开文件夹时无法切换项目](#5-opt-010-ctrlo-已打开文件夹时无法切换项目)
6. [v0.7.0 优化效果总结](#6-v070-优化效果总结)
7. [v0.6.0 历史优化记录](#7-v060-历史优化记录)
8. [后续优化方向](#8-后续优化方向)

---

## 1. v0.7.0 优化总览

| 优化 ID | 优化名称 | 影响范围 | 优先级 |
|---------|---------|---------|--------|
| OPT-007 | Sidecar 常驻进程 + 管道复用 | 后端 | 高 |
| OPT-008 | 语义高亮结果缓存 | 前端 | 高 |
| OPT-009 | 跨文件引用查找修复 | 全栈 | 高 |
| OPT-010 | Ctrl+O 已打开文件夹时无法切换项目 | 前端 | 中 |

---

## 2. OPT-007: Sidecar 常驻进程 + 管道复用

### 问题描述

v0.6.0 中，每次调用 Sidecar 功能（高亮、跳转、引用、大纲、搜索）都会通过 `Command::new().spawn()` 创建一个新的 Sidecar 进程，请求完成后进程退出。这导致三个严重问题：

1. **性能开销**：Windows 上进程创建/销毁约 10-50ms，高频操作（如连续点击不同文件）时延迟叠加明显
2. **索引丢失**：每次新进程的 `file_cache_` 和 `symbol_table_` 均为空，跨文件引用查找和符号搜索需要先重建索引，但索引结果随进程退出丢失
3. **终端闪现**：虽然 OPT-004 已加 `CREATE_NO_WINDOW`，但高频进程创建/销毁仍有轻微视觉干扰

### 方案设计

将 `send_sidecar_request` 从"每次 spawn 新进程"改为"维护全局常驻 Sidecar 进程"。首次请求时懒启动进程，后续请求复用 stdin/stdout 管道，进程崩溃时自动重启。

### 关键设计

#### 2.1 全局进程管理结构

```
SidecarProcess {
    child: Child,                                    // 子进程句柄
    stdin: ChildStdin,                               // stdin 写入管道
    stdout: BufReader<ChildStdout>,                  // stdout 缓冲读取管道
    next_id: u64,                                    // 自增请求 ID
}
```

- `ChildStdin` 和 `ChildStdout` 在 `spawn()` 时通过 `.take()` 从 `Child` 中取出，生命周期独立于 `Child`
- `stdout` 使用 `BufReader` 包装，减少系统调用次数
- `next_id` 自增，每次请求分配唯一 ID

#### 2.2 全局单例 + Mutex 保护

```
static SIDECAR: Mutex<Option<SidecarProcess>> = Mutex::new(None);
```

- 使用 `std::sync::Mutex`（非 tokio Mutex），因为 Tauri command 是同步的
- `Option<SidecarProcess>` 支持延迟初始化
- Mutex 保证同一时刻只有一个线程可以与 Sidecar 通信

#### 2.3 懒启动 + 自动重启

```
fn ensure_sidecar() -> Result<(), String> {
    match guard.as_mut() {
        Some(proc) => {
            if !proc.is_alive() {
                *guard = Some(SidecarProcess::spawn()?);
            }
        }
        None => {
            *guard = Some(SidecarProcess::spawn()?);
        }
    }
}
```

- **懒启动**：首次调用 `send_sidecar_request` 时才 spawn 进程
- **自动重启**：通过 `child.try_wait()` 检测进程是否意外退出，如果退出则重新 spawn
- **优雅关闭**：`Drop` trait 中先发送 `shutdown` 请求再 `kill`，确保 Sidecar 正常释放资源

#### 2.4 自动项目索引

`FileTree.loadProject()` 成功后，自动后台调用 `sidecar_index_project`。由于 Sidecar 常驻，索引结果在进程生命周期内保持，后续的跨文件引用查找和符号搜索可直接使用。

```
// 后台触发（不阻塞 UI）
invoke('sidecar_index_project', { projectPath: dirPath })
    .then(result => console.log('索引完成:', result))
    .catch(err => console.warn('索引失败:', err));
```

#### 2.5 命令函数简化

**优化前**：每个命令函数都需要调用 `find_sidecar_path()` + `send_sidecar_request(path, method, params)`

**优化后**：`send_sidecar_request(method, params)` 内部自动管理进程，命令函数仅需一行：

```
fn sidecar_highlight(filepath: String) -> Result<Value, String> {
    Ok(send_sidecar_request("textDocument/highlight", json!({"filepath": filepath}))?)
}
```

### 使用技术

- Rust `std::sync::Mutex` — 全局可变状态的线程安全访问
- Rust `std::process::Child` — 子进程生命周期管理
- Rust `BufReader<ChildStdout>` — 缓冲管道读取
- JSON-RPC 2.0 Content-Length 协议 — 管道消息帧格式
- `Drop` trait — 资源清理和优雅关闭

### 预期效果

- Sidecar 功能响应延迟降低 50%+（消除 10-50ms 进程创建开销）
- 项目索引在 Sidecar 进程生命周期内持久，跨文件引用查找和符号搜索无需重复构建索引
- 进程意外崩溃时自动重启，提升可靠性

---

## 3. OPT-008: 语义高亮结果缓存

### 问题描述

切换回已打开过的文件时，会重新向 Sidecar 请求高亮数据。对于大文件（如 STL 源码），Tree-sitter 解析 + 高亮计算耗时可达数百毫秒，导致明显的切换延迟。作为只读代码阅读器，文件内容不会变化，重复请求是完全冗余的。

### 方案设计

在前端维护模块级 `Map<string, Decoration[]>` 缓存。缓存 key 为 `filePath + contentLength + contentPrefix`，命中时直接使用缓存结果，无需请求 Sidecar。

### 关键设计

#### 3.1 缓存数据结构

```
// 模块级缓存（跨组件实例共享，但不跨页面刷新）
const highlightCache = new Map<string, IModelDeltaDecoration[]>();

function getCacheKey(filePath: string, content: string): string {
    return `${filePath}|${content.length}|${content.substring(0, 256)}`;
}
```

- **Key 设计**：`filePath` + `content.length` + 前 256 字符。对于只读阅读器，这三个字段的组合足以唯一标识文件内容
- **Value**：Monaco `IModelDeltaDecoration[]` 数组，可直接传给 `editor.deltaDecorations()`
- **生命周期**：模块级变量，随 SPA 页面生命周期存在，刷新页面后清空

#### 3.2 缓存命中逻辑

```
applySemanticHighlight(editor, monaco, content, filePath) {
    const cacheKey = getCacheKey(filePath, content);

    // 缓存命中 → 直接应用
    const cached = highlightCache.get(cacheKey);
    if (cached) {
        decorationsRef.current = editor.deltaDecorations([], cached);
        return;
    }

    // 缓存未命中 → 请求 Sidecar → 写入缓存
    const result = await invoke('sidecar_highlight', { filepath });
    const decorations = highlightRangesToDecorations(result.ranges, monaco);
    decorationsRef.current = editor.deltaDecorations([], decorations);
    highlightCache.set(cacheKey, decorations);
}
```

#### 3.3 缓存淘汰策略

```
if (highlightCache.size > 200) {
    const keys = Array.from(highlightCache.keys());
    for (let i = 0; i < 100 && i < keys.length; i++) {
        highlightCache.delete(keys[i]);
    }
}
```

- 简单的 FIFO 淘汰：超过 200 个条目时删除最旧的一半
- 每个 Decoration 数组约 1-10KB，200 个文件约 200KB-2MB 内存占用，可接受

### 使用技术

- ES6 `Map` — 高效键值缓存
- Monaco `IModelDeltaDecoration[]` — 可复用的装饰器对象
- 模块级变量 — 跨组件实例共享的缓存

### 预期效果

- 已访问文件的重新打开高亮延迟从数百毫秒降至 <5ms（纯内存读取 + DOM 操作）
- 减少 Sidecar 通信次数，降低 CPU 和 I/O 开销
- 内存占用可控（200 个文件约 200KB-2MB）

---

## 4. OPT-009: 跨文件引用查找修复

### 问题描述

查找引用功能（Shift+F12）对单个文件可以进行高亮显示，但无法对多个文件同时存在的引用进行定位。用户只能看到当前文件中的引用，看不到其他文件中的引用位置。

### 根因分析

v0.6.0 的 Sidecar 架构为"临时进程模式"：

1. 每次功能调用都 spawn 新的 Sidecar 进程
2. 跨文件引用查找依赖 `SymbolService::findReferences()`，它遍历 `file_cache_` 中所有已缓存的文件
3. `file_cache_` 的填充需要先调用 `symbol/index` 构建项目索引
4. 但旧进程在请求完成后退出，新进程的 `file_cache_` 为空
5. 前端也没有自动触发 `symbol/index`

结果：`findReferences()` 遍历空缓存，只返回当前文件中通过光标位置匹配到的结果（如果有 `filepath` 参数的话），或完全无结果。

### 方案设计

OPT-007（Sidecar 常驻进程）解决了核心问题。配合以下两个改动实现完整的跨文件引用查找：

1. **Sidecar 常驻进程**（OPT-007）：索引结果在进程生命周期内保持
2. **自动项目索引**：`FileTree.loadProject()` 成功后自动后台触发 `sidecar_index_project`

### 关键设计

#### 4.1 索引触发时机

```
FileTree.loadProject(dirPath) {
    // 1. 加载文件树 UI
    setTreeData(nodes);

    // 2. 后台触发项目索引（不阻塞 UI）
    invoke('sidecar_index_project', { projectPath: dirPath })
        .then(result => console.log(`索引完成: ${result.fileCount} 文件, ${result.symbolCount} 符号`))
        .catch(err => console.warn('索引失败（不影响文件浏览）:', err));
}
```

- 索引在项目打开后自动触发，用户无需手动操作
- 索引为异步后台任务，不阻塞文件树的加载和交互
- 索引失败不影响文件浏览等基本功能

#### 4.2 跨文件引用查找流程

```
用户按 Shift+F12
  → Monaco provideReferences → invoke('sidecar_find_references', { symbolName })
  → Rust send_sidecar_request("textDocument/references", { symbolName })
  → Sidecar findReferences() 遍历 file_cache_（已包含项目所有文件的语法树）
  → 返回所有文件中的引用位置列表
  → ReferencesPanel 按文件分组显示
```

### 使用技术

- Sidecar 常驻进程（OPT-007）— 索引持久化
- Tree-sitter 语法树缓存 — 跨文件 AST 遍历
- 异步后台索引 — 不阻塞 UI

### 预期效果

- 跨文件引用查找正常工作，显示所有文件中的引用位置
- 符号搜索（Ctrl+Shift+F）也因索引持久化而立即可用
- 项目打开后 1-3 秒内索引构建完成，后续请求零延迟

---

## 5. OPT-010: Ctrl+O 已打开文件夹时无法切换项目

### 问题描述

用户使用 Ctrl+O 快捷键时，如果已经打开了文件夹，无法弹出文件夹选择对话框切换到另一个项目。按钮点击方式也存在同样的问题。

### 根因分析

`index.tsx` 中 Ctrl+O 和菜单的"打开文件夹"操作都是通过 `document.dispatchEvent(new CustomEvent('codelens:open-project'))` 实现。但 `FileTree.tsx` 中**没有监听这个自定义事件**——`handleOpenProject` 仅被按钮的 `onClick` 直接调用。

### 方案设计

在 `FileTree` 组件中添加 `useEffect` 监听 `codelens:open-project` 事件，触发时调用 `handleOpenProject`。同时在 `loadProject` 中重置展开状态和搜索状态。

### 关键设计

#### 5.1 事件监听注册

```
useEffect(() => {
    const handler = () => handleOpenProject();
    document.addEventListener('codelens:open-project', handler);
    return () => document.removeEventListener('codelens:open-project', handler);
}, []);
```

- `handleOpenProject` 函数内部会调用 Tauri `open` 对话框，选择后调用 `loadProject`
- 组件卸载时清理事件监听

#### 5.2 项目切换时状态重置

```
loadProject(dirPath) {
    setExpandedKeys(new Set());  // 收起所有展开的目录
    setSearchTerm('');           // 清空搜索关键词
    setTreeData(nodes);          // 加载新项目的文件树
}
```

- 切换项目时清空之前的展开状态和搜索过滤，避免旧项目状态残留

### 使用技术

- DOM CustomEvent — 跨组件通信
- `useEffect` + cleanup — 事件监听生命周期管理

### 预期效果

- Ctrl+O 快捷键在任何时候都可以打开文件夹选择对话框
- 切换项目时文件树、搜索状态、展开状态正确重置

---

## 6. v0.7.0 优化效果总结

| 优化项 | 优化前 | 优化后 | 影响范围 |
|--------|--------|--------|---------|
| Sidecar 通信 | 每次 spawn 新进程（10-50ms 开销） | 常驻进程复用管道（<1ms） | 全部 Sidecar 功能 |
| 项目索引 | 进程退出后丢失，无法跨文件查找 | 进程生命周期内持久 | 引用查找 + 符号搜索 |
| 高亮加载 | 每次重新请求 Sidecar（100-500ms） | 缓存命中 <5ms | 文件切换 |
| Ctrl+O 切换项目 | 已打开项目时无法触发 | 正常工作 | 用户体验 |
| 跨文件引用 | 只返回当前文件结果 | 返回项目中所有文件结果 | 代码导航 |

---

## 7. v0.6.0 历史优化记录

> 以下为 v0.6.0-rc1 的优化内容，已合并至发布版本。

| 优化 ID | 优化名称 | 严重程度 | 状态 |
|---------|---------|---------|------|
| OPT-001 | Monaco Editor CDN 兼容性修复 | 致命 | 已完成 |
| OPT-002 | Monarch Tokenizer 规则修复 | 致命 | 已完成 |
| OPT-003 | Sidecar 进程打包与分发 | 致命 | 已完成 |
| OPT-004 | Sidecar 子进程窗口隐藏 | 高 | 已完成 |
| OPT-005 | 全局快捷键优先级修复 | 中 | 已完成 |
| OPT-006 | Editor 组件渲染性能优化 | 中 | 已完成 |

详细内容参见 v1.0 版本文档（git history）。

---

## 8. 后续优化方向

### 8.1 SQLite 符号索引持久化（中优先级）

**当前状态**：常驻进程内 `file_cache_` 在进程重启后丢失。应用重启后需要重新构建索引。

**优化方案**：详见 REQUIREMENTS.md §5.2。将索引持久化到 SQLite 数据库，支持增量更新。

**预期效果**：二次启动后符号搜索 <100ms，无需等待索引重建。

### 8.2 多线程并行解析（中优先级）

**当前状态**：大型项目（百万行）索引构建耗时可达数十秒。

**优化方案**：详见 REQUIREMENTS.md §5.3。使用 C++20 `std::jthread` 线程池并行解析。

**预期效果**：8 核 CPU 上索引速度提升 5-6 倍。

### 8.3 编辑器增量高亮更新（低优先级）

**当前状态**：代码高亮采用全量请求模式（每次打开文件完整请求高亮数据），未利用 Tree-sitter 的增量解析能力。

**优化方案**：详见 REQUIREMENTS.md §5.1。捕获 Monaco `onDidChangeModelContent` 事件，发送增量差异到 Sidecar 进行增量解析。

**适用场景**：未来支持代码编辑功能时启用。当前为只读阅读器，优先级较低。

### 8.4 高亮缓存持久化到 IndexedDB（低优先级）

**当前状态**：高亮缓存（OPT-008）为模块级 Map，页面刷新后丢失。

**优化方案**：将缓存 key/value 序列化存储到浏览器的 IndexedDB 中，页面加载时恢复。

**预期效果**：页面刷新后已访问文件的高亮立即可用。

---

*文档结束*

*本文档记录 CodeLens v0.7.0 的优化过程，后续版本持续更新。*
