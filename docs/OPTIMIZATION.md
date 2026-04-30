# CodeLens 优化文档

> 本文档记录 CodeLens 代码阅读器的优化过程，涵盖问题分析、技术方案、实现关键设计、效果评估及后续优化方向。

## 文档信息

| 项目 | 信息 |
|------|------|
| 文档版本 | v1.0 |
| 创建日期 | 2026-04-30 |
| 适用版本 | v0.6.0-rc1 |
| 参考规范 | REQUIREMENTS.md §5 技术优化方案 |

---

## 目录

1. [v0.6.0 优化总览](#1-v060-优化总览)
2. [OPT-001: Monaco Editor CDN 兼容性修复](#2-opt-001-monaco-editor-cdn-兼容性修复)
3. [OPT-002: Monarch Tokenizer 规则修复](#3-opt-002-monarch-tokenizer-规则修复)
4. [OPT-003: Sidecar 进程打包与分发](#4-opt-003-sidecar-进程打包与分发)
5. [OPT-004: Sidecar 子进程窗口隐藏](#5-opt-004-sidecar-子进程窗口隐藏)
6. [OPT-005: 全局快捷键优先级修复](#6-opt-005-全局快捷键优先级修复)
7. [OPT-006: Editor 组件渲染性能优化](#7-opt-006-editor-组件渲染性能优化)
8. [优化效果总结](#8-优化效果总结)
9. [后续优化方向](#9-后续优化方向)

---

## 1. v0.6.0 优化总览

| 优化 ID | 优化名称 | 影响范围 | 严重程度 |
|---------|---------|---------|---------|
| OPT-001 | Monaco Editor CDN 兼容性修复 | 前端 | 致命 |
| OPT-002 | Monarch Tokenizer 规则修复 | 前端 | 致命 |
| OPT-003 | Sidecar 进程打包与分发 | 构建工程 | 致命 |
| OPT-004 | Sidecar 子进程窗口隐藏 | 后端 | 高 |
| OPT-005 | 全局快捷键优先级修复 | 前端 | 中 |
| OPT-006 | Editor 组件渲染性能优化 | 前端 | 中 |

---

## 2. OPT-001: Monaco Editor CDN 兼容性修复

### 问题描述

`@monaco-editor/react` 默认通过 CDN（`cdn.jsdelivr.net`）加载 Monaco Editor 核心文件。Tauri WebView 生产环境中可能无法访问外部 CDN，导致编辑器区域白屏，应用抛出 `Application error: a client-side exception has occurred`。

### 方案设计

将 Monaco Editor 核心文件从 CDN 加载改为本地文件加载。构建前将 `node_modules/monaco-editor/min/vs/` 复制到 `public/monaco/vs/`，运行时从应用本地路径加载。

### 关键设计

1. **构建时复制脚本**（`frontend/scripts/copy-monaco.js`）：
   - 递归复制 `node_modules/monaco-editor/min/vs/`（121 文件，约 15MB）到 `public/monaco/vs/`
   - Next.js `output: 'export'` 模式会将 `public/` 目录原样输出到 `out/`，Tauri 直接服务该目录

2. **运行时路径覆盖**（`Editor.tsx`）：
   ```
   loader.config({ paths: { vs: '${window.location.origin}/monaco/vs' } })
   ```
   在 Monaco 初始化前覆盖 CDN 路径为本地路径

3. **构建流程集成**（`package.json`）：
   - `prebuild` 和 `build` 脚本均前置执行 `node scripts/copy-monaco.js`
   - 确保 `next build` 时 Monaco 文件已在 `public/` 中

4. **错误兜底**：
   - 新增 `pages/_error.tsx` 自定义错误页面，显示真实错误信息和调用栈
   - `_app.tsx` 添加 React Error Boundary，捕获子组件渲染异常并提供重试按钮

### 使用技术

- `@monaco-editor/react` 的 `loader.config()` API
- Node.js `fs.cpSync()` 递归文件复制
- Next.js 静态导出 + Tauri `frontendDist` 配置
- React Class Component Error Boundary

### 预期效果

- Tauri WebView 离线环境下 Monaco Editor 正常加载
- 编辑器初始化时间从 CDN 加载的 1-3s 降低到本地加载的 <100ms

---

## 3. OPT-002: Monarch Tokenizer 规则修复

### 问题描述

自定义语言 `codelens-cpp` 的 Monarch tokenizer 中，`@symbols` 规则引用了 `@operatorKeywords`，但该属性从未在 language 对象中定义（仅有 `operators` 数组）。Monarch 引擎严格校验所有 `@` 引用，找不到定义时直接抛出 `the @ match target 'operatorKeywords' is not defined` 异常，导致整个 tokenizer 注册失败。

### 方案设计

移除不存在的 `@operatorKeywords` case 分支，将符号直接标记为 `operator`。

### 关键设计

**修复前**：
```
[/@symbols/, { cases: { '@operatorKeywords': 'operator.keyword', '@default': 'operator' } }]
```

**修复后**：
```
[/@symbols/, 'operator']
```

**分析**：`@operatorKeywords` 是 Elixir 等 DSL 语言的特性（用于高亮 `and`/`not`/`or` 等作为运算符的关键字），C++ 不存在需要特殊高亮的运算符关键字，所有运算符符号统一标记为 `operator` 即可。

### 使用技术

- Monaco Editor Monarch tokenizer 规范
- `@` 引用机制（Monarch 通过属性名在 language 对象中查找同名数组进行匹配）

### 预期效果

- 自定义语言 `codelens-cpp` 正常注册，语法高亮功能恢复
- 运算符符号统一显示为 `operator` 语义颜色

---

## 4. OPT-003: Sidecar 进程打包与分发

### 问题描述

`tauri.conf.json` 未配置 `bundle.externalBin`，Tauri 打包安装程序时不包含 C++ Sidecar 可执行文件。安装后应用运行在安装目录（如 `F:\CodeLens\`），而 sidecar 仅存在于开发环境的 `sidecar/build/Release/`，导致所有依赖 Sidecar 的功能（代码高亮、符号跳转、引用查找、符号大纲、符号搜索）全部不可用。

### 方案设计

利用 Tauri 2.0 的 `externalBin` 机制，将 Sidecar 可执行文件作为外部二进制资源打包到安装程序中。

### 关键设计

1. **Tauri externalBin 配置**（`tauri.conf.json`）：
   ```json
   "externalBin": ["binaries/codelens-sidecar"]
   ```
   Tauri 自动从 `src-tauri/binaries/` 查找带有 target triple 后缀的可执行文件

2. **命名约定**：
   - 源文件：`src-tauri/binaries/codelens-sidecar-x86_64-pc-windows-msvc.exe`
   - Target triple 通过 `rustc --print cfg` 获取：`x86_64-pc-windows-msvc`
   - Tauri 构建时自动复制到 `target/release/codelens-sidecar.exe`（去掉 triple 后缀）

3. **路径查找策略**（`lib.rs` `find_sidecar_path()`）：
   - 优先级 1：Tauri 标准路径（exe 同级的 `codelens-sidecar.exe`）— 生产环境
   - 优先级 2：开发环境路径（`./sidecar/build/Release/`）— 开发调试
   - 优先级 3：兼容路径（exe 子目录、target 目录）

4. **`.gitignore` 例外规则**：
   ```
   *.exe              # 全局排除
   !src-tauri/binaries/codelens-sidecar-*.exe  # 保留 Sidecar binary
   ```

### 使用技术

- Tauri 2.0 `bundle.externalBin` 配置
- Windows target triple 命名约定
- WiX/NSIS 安装包自动资源打包
- 多路径候选查找策略

### 预期效果

- 安装包自动包含 Sidecar，无需手动复制
- 所有 Sidecar 依赖功能在安装后立即可用

---

## 5. OPT-004: Sidecar 子进程窗口隐藏

### 问题描述

使用符号跳转（F12）或引用查找（Shift+F12）时，会短暂弹出一个黑色终端窗口然后自动关闭。这是因为在 Windows 上通过 `std::process::Command::spawn()` 启动控制台应用程序（如 `codelens-sidecar.exe`）时，默认会为子进程创建一个可见的控制台窗口。

### 方案设计

在 Windows 平台上为子进程设置 `CREATE_NO_WINDOW` 创建标志，阻止控制台窗口的创建。

### 关键设计

**修复前**：
```
Command::new(sidecar_path)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::null())
    .spawn()
```

**修复后**：
```
let mut command = Command::new(sidecar_path);
command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());

#[cfg(target_os = "windows")]
{
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

command.spawn()
```

**分析**：
- `CREATE_NO_WINDOW`（`0x08000000`）是 Windows `CREATE_PROCESS` API 的标志位，指示系统不为新进程创建控制台窗口
- 使用 `#[cfg(target_os = "windows")]` 条件编译，不影响 Linux/macOS 构建
- `main.rs` 中的 `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` 仅隐藏主进程窗口，不影响子进程

### 使用技术

- Rust `std::os::windows::process::CommandExt` trait
- Windows `CREATE_NO_WINDOW` 进程创建标志（`0x08000000`）
- 条件编译 `#[cfg(target_os = "windows")]`

### 预期效果

- 符号跳转、引用查找等 Sidecar 调用不再闪现终端窗口
- 用户体验与 VS Code 等现代编辑器一致，后台静默执行

---

## 6. OPT-005: 全局快捷键优先级修复

### 问题描述

两个快捷键无法正常触发：
1. **Ctrl+K Ctrl+T**（主题切换）：Monaco Editor 内部绑定了 Ctrl+K 作为 chord 前缀（用于 Ctrl+K Ctrl+C 注释等），在 DOM 冒泡阶段消费了 Ctrl+K 事件，window 级 keydown 监听器收不到
2. **Ctrl+O**（打开文件夹）：菜单 label 显示了 Ctrl+O 快捷键提示，但实际未实现键盘事件处理（仅菜单 dropdown 的 click handler 有效）

### 方案设计

将全局快捷键注册从 DOM 冒泡阶段改为捕获阶段（`capture: true`），使事件在到达 Monaco 内部处理器之前被拦截。同时补充 Ctrl+O 的键盘事件处理。

### 关键设计

1. **捕获阶段注册**：
   ```
   window.addEventListener('keydown', handler, true)  // capture: true
   ```
   事件流：捕获阶段（window → document → ... → target）→ 冒泡阶段（target → ... → window）
   在捕获阶段注册的 handler 优先于 Monaco 内部的冒泡阶段 handler 执行

2. **事件拦截**：匹配的快捷键调用 `e.preventDefault()` + `e.stopPropagation()` 阻止事件继续传播

3. **Ctrl+O 实现**：触发 `codelens:open-project` 自定义事件，复用已有的文件树打开项目逻辑

### 使用技术

- DOM 事件捕获阶段（Event Capture Phase）
- `addEventListener` 第三个参数 `capture: true`
- `stopPropagation()` 阻止事件继续传播
- CustomEvent 自定义事件

### 预期效果

- Ctrl+K Ctrl+T 主题切换正常工作，不受 Monaco chord 拦截
- Ctrl+O 打开文件夹功能生效
- 所有全局快捷键优先于 Monaco 内部快捷键执行

---

## 7. OPT-006: Editor 组件渲染性能优化

### 问题描述

用户在使用过程中感知到明显的卡顿感，尤其在光标快速移动时。分析发现：

1. **光标移动触发整棵组件树 re-render**：每次 `onDidChangeCursorPosition` 事件都调用 `setCursorPos()` 更新父组件 state，触发父组件 → 所有子组件（包括 Monaco Editor）的级联 re-render
2. **editorOptions 对象每次渲染重建**：`editorOptions` 作为普通对象定义在组件体内，每次渲染都创建新引用，Monaco Editor 接收到新的 options prop 后会重新处理配置
3. **Editor 组件缺少 memo 化**：父组件 re-render 时，即使 Editor 的 props 未变化也会重新执行渲染函数

### 方案设计

三层优化策略：状态降级（ref 替代 state）、值缓存（useMemo）、组件 memo 化（React.memo）。

### 关键设计

#### 7.1 光标位置：useState → useRef + 直接 DOM 更新

**修复前**：
```
const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
// 每次 cursorPos 变化 → re-render 整棵组件树 → Monaco Editor 重新处理
```

**修复后**：
```
const cursorPosRef = useRef({ line: 1, col: 1 });
const statusBarCursorRef = useRef<HTMLElement>(null);

const handleCursorMove = useCallback((line, col) => {
    cursorPosRef.current = { line, col };
    if (statusBarCursorRef.current) {
        statusBarCursorRef.current.textContent = `行 ${line}, 列 ${col}`;
    }
}, []);
// 零 React re-render，直接 DOM 更新
```

**分析**：状态栏文字更新不需要触发 React 重新渲染，直接操作 DOM 节点的 `textContent` 即可。`cursorPosRef` 在需要读取光标位置时（如引用查找）通过 `.current` 获取最新值。

#### 7.2 editorOptions：useMemo 缓存

**修复前**：
```
const editorOptions = { fontSize: 14, fontFamily: '...', ... };
// 每次渲染创建新对象引用
```

**修复后**：
```
const editorOptions = useMemo(() => ({
    fontSize: 14, fontFamily: '...', ...
}), []);
// 仅创建一次，后续渲染返回同一引用
```

#### 7.3 CodeEditorView：React.memo 包装

**修复前**：
```
export default function CodeEditorView({ ... }: EditorProps) { ... }
```

**修复后**：
```
export default memo(function CodeEditorView({ ... }: EditorProps) { ... });
// props 引用不变时跳过渲染
```

### 使用技术

- React `useRef` — 可变引用，不触发 re-render
- React `useMemo` — 值记忆化，依赖不变时返回缓存值
- React `memo` — 高阶组件，props 浅比较不变时跳过渲染
- DOM API `textContent` — 直接操作 DOM 更新文本，绕过 React 渲染管线

### 预期效果

- 光标移动时零 React re-render，消除级联渲染开销
- Monaco Editor 不因无关 state 变化重新处理配置
- 大文件 + 快速光标移动场景下卡顿感显著降低

---

## 8. 优化效果总结

| 优化项 | 优化前 | 优化后 | 影响范围 |
|--------|--------|--------|---------|
| Monaco 加载 | CDN 依赖，离线白屏 | 本地加载，<100ms | 应用可用性 |
| Monarch tokenizer | 注册异常崩溃 | 正常工作 | 语法高亮 |
| Sidecar 打包 | 安装后功能全失 | 自动打包，开箱即用 | 全部 Sidecar 功能 |
| Sidecar 窗口 | 闪终端窗口 | 后台静默执行 | 用户体验 |
| Ctrl+K Ctrl+T | Monaco 拦截无响应 | 正常切换主题 | 快捷键 |
| Ctrl+O | 仅有 label 无功能 | 正常打开文件夹 | 快捷键 |
| 渲染性能 | 光标移动触发全树 re-render | 零 re-render | 交互流畅度 |

---

## 9. 后续优化方向

### 9.1 Sidecar 常驻进程 + 按需通信（高优先级）

**当前问题**：每次调用 Sidecar 功能（高亮、跳转、引用、大纲）都会 `spawn` 一个新的 Sidecar 进程，请求完成后进程退出。频繁的进程创建/销毁带来显著的延迟开销（Windows 上进程创建约 10-50ms）。

**优化方案**：启动时 spawn 一个常驻 Sidecar 进程，通过长连接（stdin/stdout 管道）复用通信。引入请求 ID 机制支持并发请求。

**预期效果**：功能响应延迟降低 50%+（消除进程创建开销）。

### 9.2 语义高亮结果缓存（高优先级）

**当前问题**：切换回已打开过的文件时，会重新向 Sidecar 请求高亮数据。对于大文件（如 STL 源码），高亮计算耗时可达数百毫秒。

**优化方案**：在前端维护 `Map<filePath, HighlightData>` 缓存。文件内容未变时直接使用缓存结果，通过文件内容 hash 或 mtime 判断是否需要刷新。

**预期效果**：已访问文件的重新打开高亮延迟降至 <5ms。

### 9.3 SQLite 符号索引持久化（中优先级）

**当前问题**：符号索引仅存内存，Sidecar 进程退出后丢失。每次使用符号搜索功能前需要重新构建索引。

**优化方案**：详见 REQUIREMENTS.md §5.2。将索引持久化到 SQLite 数据库，支持增量更新。

**预期效果**：二次启动后符号搜索 <100ms。

### 9.4 多线程并行解析（中优先级）

**当前问题**：大型项目（百万行）索引构建耗时可达数十秒。

**优化方案**：详见 REQUIREMENTS.md §5.3。使用 C++20 `std::jthread` 线程池并行解析。

**预期效果**：8 核 CPU 上索引速度提升 5-6 倍。

### 9.5 编辑器增量高亮更新（低优先级）

**当前问题**：代码高亮采用全量请求模式（每次打开文件完整请求高亮数据），未利用 Tree-sitter 的增量解析能力。

**优化方案**：详见 REQUIREMENTS.md §5.1。捕获 Monaco `onDidChangeModelContent` 事件，发送增量差异到 Sidecar 进行增量解析。

**适用场景**：未来支持代码编辑功能时启用。当前为只读阅读器，优先级较低。

---

*文档结束*

*本文档记录 CodeLens v0.6.0-rc1 的优化过程，后续版本持续更新。*
