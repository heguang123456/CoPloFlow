# 阶段5：UI 完善（F-006 文件树浏览器 + 界面布局 + 主题切换）

> 功能实现文档
> 创建日期：2026-04-29
> 基于：REQUIREMENTS.md v1.2 §2.6 / §4.3.2 / §6.1-6.4 / §11.2

---

## 目录

1. [阶段概述](#1-阶段概述)
2. [交付物清单](#2-交付物清单)
3. [功能实现 — F-006 文件树浏览器增强](#3-功能实现--f-006-文件树浏览器增强)
4. [功能实现 — 界面布局完善](#4-功能实现--界面布局完善)
5. [功能实现 — 主题切换](#5-功能实现--主题切换)
6. [依赖安装与前提条件](#6-依赖安装与前提条件)
7. [涉及文件清单](#7-涉及文件清单)
8. [实现顺序](#8-实现顺序)
9. [测试流程](#9-测试流程)
10. [Git 工作流节点](#10-git-工作流节点)
11. [阶段完成 Review](#11-阶段完成-review)
12. [异常处理链路](#12-异常处理链路)

---

## 1. 阶段概述

### 1.1 阶段定位

阶段5 是 CodeLens 项目的 **UI 完善阶段**，聚焦三大任务：

| 任务 | 功能 ID | 优先级 | 当前状态 |
|------|---------|--------|----------|
| 文件树浏览器增强 | F-006 | P0 | 基础版本已存在，需增强 |
| 界面布局完善 | UI-001 | P0 | 三栏布局已实现，需精细化 |
| 主题切换 | UI-002 | P1 | 深色主题已实现，需添加浅色主题 |

### 1.2 阶段目标

遵循 REQUIREMENTS.md §11.2 阶段5 实现目标：

- 实现完整的文件树浏览器（搜索过滤、右键菜单、文件类型图标、排序规则）
- 完善界面布局（可拖拽分割面板、菜单栏功能化、状态栏信息增强）
- 实现深色/浅色双主题切换（Ctrl+K Ctrl+T 快捷键）

### 1.3 项目进度说明

截至阶段4完成，项目进度已超过 50%（6 个功能中已完成 4 个：F-001 ~ F-005）。本阶段作为 UI 完善阶段，涉及的代码变更集中在前端层，不涉及 C++ Sidecar 和 Tauri IPC 后端的新增接口，技术风险较低。

**注意**：由于项目进度已过半，本阶段必须严格执行代码规范、依赖隔离和文档同步，避免与已完成的 F-001 ~ F-005 功能产生冲突。

---

## 2. 交付物清单

| 编号 | 交付物 | 类型 | 说明 |
|------|--------|------|------|
| D-01 | 增强版 FileTree.tsx | 前端组件 | 搜索过滤 + 右键菜单 + 文件图标 + 目录内排序 |
| D-02 | ContextMenu.tsx | 前端组件 | 通用右键上下文菜单组件 |
| D-03 | FileIcon.tsx | 前端组件 | 基于文件扩展名的图标映射 |
| D-04 | ThemeProvider.tsx | 前端组件 | 主题上下文管理（深色/浅色切换） |
| D-05 | globals.css 更新 | 样式文件 | 浅色主题 CSS 变量 + 布局样式优化 |
| D-06 | index.tsx 更新 | 前端页面 | 集成主题切换 + 菜单栏功能化 + 可拖拽分割面板 |
| D-07 | index.tsx 更新（状态栏） | 前端页面 | 状态栏信息增强 + 主题切换按钮 |
| D-08 | README.md 更新 | 文档 | 标记 F-006 为已完成 + 阶段5详情 |
| D-09 | CHANGELOG.md 更新 | 文档 | 新增 v0.5.0 版本记录 |
| D-10 | DESIGN_PHASE5.md | 设计文档 | 本文档 |

---

## 3. 功能实现 — F-006 文件树浏览器增强

### 3.1 现状分析

当前 `frontend/components/FileTree.tsx`（158 行）已实现基础功能：

| 已实现 | 缺失 |
|--------|------|
| 项目目录选择（tauri-plugin-dialog） | 搜索过滤 |
| 目录懒加载（read_directory IPC） | 右键上下文菜单 |
| 排除模式（.git、node_modules 等） | 文件类型图标（当前使用 emoji） |
| 递归渲染文件节点 | 目录内文件排序（当前依赖后端排序，前端无二次排序） |
| 展开/折叠交互 | 符号链接处理 |

### 3.2 搜索过滤功能

**需求来源**：REQUIREMENTS.md §4.3.2 FileTreeView — `searchTerm` 状态 + 客户端过滤

**设计思路**：在前端侧对已加载的树节点执行实时过滤，不向后端发送请求。

**数据结构扩展**：

| 字段 | 类型 | 说明 |
|------|------|------|
| searchTerm | `string` | 搜索关键词，实时过滤匹配的文件名 |
| filteredTreeData | `FileNode[]` | 过滤后的树数据，为 null 时显示完整树 |

**过滤逻辑伪代码**：

```
filterTree(nodes: FileNode[], term: string): FileNode[]:
  if term.length < 2:
    return null  // 不触发过滤

  result ← []
  for node in nodes:
    if node.title.toLowerCase().includes(term.toLowerCase()):
      result.append(node)
    else if node.isDir and node.children:
      filtered_children ← filterTree(node.children, term)
      if filtered_children.length > 0:
        // 父目录匹配子节点时，展开该目录并保留匹配子节点
        result.append({ ...node, children: filtered_children, expanded: true })

  return result
```

**搜索输入位置**：文件树面板顶部，文件树标题行下方，内嵌搜索框。

**防抖策略**：300ms debounce，避免频繁过滤导致卡顿。

### 3.3 右键上下文菜单

**需求来源**：REQUIREMENTS.md §4.3.2 — `onContextMenu` 回调

**菜单项设计**：

| 菜单项 | 条件 | 行为 |
|--------|------|------|
| 打开文件 | 节点为文件 | 触发 `onFileSelect` |
| 复制文件路径 | 所有节点 | 将绝对路径复制到剪贴板 |
| 复制相对路径 | 所有节点 | 将相对于项目根目录的路径复制到剪贴板 |
| 在终端中打开 | 节点为目录 | 打开系统终端并 cd 到该目录（预留，阶段5仅添加菜单项） |
| 刷新 | 节点为目录 | 重新加载该目录内容 |

**ContextMenu 组件设计**：

| 属性（Props） | 类型 | 说明 |
|---------------|------|------|
| x | `number` | 菜单显示的 X 坐标（像素） |
| y | `number` | 菜单显示的 Y 坐标（像素） |
| items | `MenuItem[]` | 菜单项列表 |
| onClose | `() => void` | 关闭菜单回调 |
| onSelect | `(action: string) => void` | 菜单项选择回调 |

**交互流程**：

```
用户右键点击节点
  → 阻止默认浏览器右键菜单（preventDefault）
  → 计算菜单位置（视口边界修正，防止溢出）
  → 显示 ContextMenu 组件
  → 用户点击菜单项 → 执行对应操作 → 关闭菜单
  → 用户点击菜单外区域 → 关闭菜单
```

### 3.4 文件类型图标

**需求来源**：当前使用 emoji（📁 📂 📄），需替换为语义化图标以提升专业度。

**图标映射表**：

| 扩展名 | 图标字符 | CSS 类名 | 说明 |
|--------|----------|----------|------|
| .cpp, .cc, .cxx | `C++` | `icon-cpp` | C++ 源文件 |
| .h, .hpp, .hxx | `H` | `icon-header` | C/C++ 头文件 |
| .c | `C` | `icon-c` | C 源文件 |
| .rs | `Rust` | `icon-rust` | Rust 源文件 |
| .py | `Py` | `icon-python` | Python 文件 |
| .js, .jsx, .ts, .tsx | `JS/TS` | `icon-js` | JavaScript/TypeScript |
| .md, .txt, .rst | `Doc` | `icon-doc` | 文档文件 |
| .json, .yaml, .yml, .toml | `{}` | `icon-config` | 配置文件 |
| .cmake, CMakeLists.txt | `CMake` | `icon-cmake` | CMake 文件 |
| 目录（展开） | `▾` | — | 展开的目录 |
| 目录（折叠） | `▸` | — | 折叠的目录 |
| 其他 | `—` | — | 通用文件 |

**实现方式**：使用 CSS 类名 + 背景色圆角徽标方案，不引入外部图标库（避免增加依赖体积）。

### 3.5 目录内文件排序

**当前行为**：后端 `read_directory` 已实现 dirs-first + 字母序排序（`src-tauri/src/lib.rs` L58-96）。

**增强需求**：前端侧在渲染时对目录内子节点进行二次排序，确保一致性。

**排序规则**（优先级从高到低）：

1. 目录优先于文件
2. 同类型按字母序排列（不区分大小写）
3. 以 `.` 开头的隐藏文件排在末尾

### 3.6 符号链接处理

**需求来源**：REQUIREMENTS.md §2.6 — "符号链接：可选择跟随或忽略"

**设计方案**：默认忽略符号链接，不显示在文件树中。后端 `read_directory` 在返回条目时标记 `isSymlink` 字段（需新增），前端过滤掉符号链接节点。

**后端改动**：`src-tauri/src/lib.rs` — `read_directory` 函数增加 `fs::symlink_metadata` 判断：

```
伪代码:
read_directory(path):
  entries ← fs::read_dir(path)
  result ← []
  for entry in entries:
    metadata ← fs::symlink_metadata(entry.path)  // 使用 symlink_metadata 区分符号链接
    is_symlink ← metadata.file_type().is_symlink()
    if is_symlink:
      continue  // 跳过符号链接
    is_dir ← metadata.is_dir()
    result.append({ name, isDir: is_dir, path })
  // dirs-first + 字母序排序
  result.sort(by: is_dir DESC, name ASC)
  return result
```

### 3.7 性能指标

| 指标 | 目标值 | 测试条件 |
|------|--------|----------|
| 加载 1000 个文件的项目 | < 500ms | 冷启动，无缓存 |
| 目录展开响应 | < 100ms | 单层目录 |
| 搜索过滤响应 | < 50ms | 已加载节点范围内 |

---

## 4. 功能实现 — 界面布局完善

### 4.1 现状分析

当前 `frontend/pages/index.tsx`（398 行）已实现三栏布局：

```
┌──────────────────────────────────────────────────────────┐
│  菜单栏（纯占位，无功能）          [搜索栏]              │
├──────────┬───────────────────────────────────┬────────────┤
│  文件树  │        Monaco Editor              │  符号大纲  │
│  (240px) │        (flex: 1)                  │  (200px)   │
├──────────┴───────────────────────────────────┴────────────┤
│  状态栏                                                  │
└──────────────────────────────────────────────────────────┘
```

**现有问题**：
1. 侧边栏宽度固定，无拖拽调整
2. 菜单栏各项无功能绑定
3. 状态栏信息较少，缺少主题切换入口

### 4.2 可拖拽分割面板

**设计方案**：在左侧边栏与编辑器之间、编辑器与右侧边栏之间添加可拖拽分割条。

**数据结构**：

| 状态 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| leftSidebarWidth | `number` | 240 | 左侧边栏宽度（px） |
| rightSidebarWidth | `number` | 200 | 右侧边栏宽度（px） |
| isDragging | `boolean` | false | 是否正在拖拽分割条 |
| dragTarget | `'left' \| 'right' \| null` | null | 当前拖拽目标 |

**拖拽流程伪代码**：

```
handleDragStart(target: 'left' | 'right'):
  isDragging ← true
  dragTarget ← target
  document.body.style.cursor ← 'col-resize'
  document.body.style.userSelect ← 'none'

handleDragMove(mouseX):
  if dragTarget == 'left':
    newWidth ← clamp(mouseX, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH)
    leftSidebarWidth ← newWidth
  else if dragTarget == 'right':
    newWidth ← clamp(window.innerWidth - mouseX, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH)
    rightSidebarWidth ← newWidth

handleDragEnd():
  isDragging ← false
  dragTarget ← null
  document.body.style.cursor ← ''
  document.body.style.userSelect ← ''

// 常量
MIN_SIDEBAR_WIDTH ← 160
MAX_SIDEBAR_WIDTH ← 480
```

**交互细节**：
- 分割条宽度 4px，鼠标悬停时高亮
- 拖拽期间禁止文本选择（user-select: none）
- 双击分割条恢复默认宽度

### 4.3 菜单栏功能化

**需求来源**：REQUIREMENTS.md §6.1 — 菜单栏包含 文件(F) 编辑(E) 查看(V) 转到(G) 帮助(H)

**设计方案**：阶段5 仅实现点击弹出下拉菜单，菜单项绑定已实现的功能，不实现新增功能。

| 菜单 | 菜单项 | 行为 | 绑定状态 |
|------|--------|------|----------|
| 文件(F) | 打开文件夹 | 触发 `handleOpenProject` | 已有 |
| 文件(F) | 保存文件 | 预留（当前为只读阅读器） | 占位 |
| 编辑(E) | 撤销 | Monaco Editor 内置 | 占位 |
| 编辑(E) | 重做 | Monaco Editor 内置 | 占位 |
| 查看(V) | 切换侧边栏 | 显示/隐藏左/右侧边栏 | 新增 |
| 查看(V) | 切换主题 | 切换深色/浅色主题 | 新增 |
| 转到(G) | 转到定义 | 触发 F12 跳转 | 已有 |
| 转到(G) | 查找引用 | 触发 Shift+F12 | 已有 |
| 转到(G) | 搜索符号 | 聚焦搜索栏 | 已有 |
| 帮助(H) | 关于 | 显示版本信息对话框 | 新增 |

**下拉菜单组件设计**：

| 属性（Props） | 类型 | 说明 |
|---------------|------|------|
| trigger | `ReactNode` | 触发元素（菜单名） |
| items | `DropdownItem[]` | 下拉菜单项列表 |
| onClose | `() => void` | 关闭菜单回调 |

**交互**：点击菜单名展开 → 点击菜单项执行操作并关闭 → 点击菜单外关闭 → ESC 关闭。

### 4.4 状态栏增强

**需求来源**：REQUIREMENTS.md §6.1

**增强内容**：

| 状态项 | 位置 | 说明 |
|--------|------|------|
| 光标位置 | 左侧第1项 | 已有（行 X, 列 Y） |
| 语言标识 | 左侧第2项 | 已有 |
| 编码 | 左侧第3项 | 已有（UTF-8） |
| 换行符 | 左侧第4项 | 已有（LF） |
| 主题切换 | 右侧 | 新增：点击切换深色/浅色主题 |
| Git 分支 | 右侧 | 新增：显示当前分支名 |
| 版本号 | 最右侧 | 已有（升级为 v0.5.0） |

---

## 5. 功能实现 — 主题切换

### 5.1 现状分析

当前 `frontend/styles/globals.css` 已在 `:root` 中定义完整的深色主题 CSS 变量：

```css
:root {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-active: #2d2d30;
  /* ... */
}
```

Monaco Editor 在 `frontend/components/Editor.tsx` 中硬编码使用 `vs-dark` 主题。

### 5.2 主题变量定义

**浅色主题 CSS 变量**（新增 `[data-theme="light"]` 选择器）：

| CSS 变量 | 深色值（当前） | 浅色值（新增） | 说明 |
|----------|---------------|---------------|------|
| `--bg-primary` | `#1e1e1e` | `#ffffff` | 主背景 |
| `--bg-secondary` | `#252526` | `#f3f3f3` | 侧边栏背景 |
| `--bg-active` | `#2d2d30` | `#e8e8e8` | 活动选项卡 |
| `--bg-hover` | `#2a2d2e` | `#e8e8e8` | 悬停背景 |
| `--text-primary` | `#d4d4d4` | `#333333` | 主文本 |
| `--text-secondary` | `#858585` | `#616161` | 次要文本 |
| `--text-muted` | `#6a6a6a` | `#999999` | 弱文本 |
| `--border-color` | `#3c3c3c` | `#e0e0e0` | 边框色 |
| `--accent-color` | `#007acc` | `#005a9e` | 强调色 |
| `--accent-hover` | `#1a8ad4` | `#0078d4` | 强调色悬停 |
| `--scrollbar-bg` | `#1e1e1e` | `#f3f3f3` | 滚动条背景 |
| `--scrollbar-thumb` | `#424242` | `#c1c1c1` | 滚动条滑块 |
| `--statusbar-bg` | `#007acc` | `#007acc` | 状态栏背景（两主题相同） |
| `--tab-active-bg` | `#1e1e1e` | `#ffffff` | 活动标签页 |
| `--tab-inactive-bg` | `#2d2d30` | `#ececec` | 非活动标签页 |

### 5.3 ThemeProvider 设计

**数据结构**：

| 状态 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| theme | `'dark' \| 'light'` | `'dark'` | 当前主题 |
| toggleTheme | `() => void` | — | 切换主题函数 |

**实现方案**：使用 React Context 管理主题状态，在 `document.documentElement` 上设置 `data-theme` 属性。

**伪代码**：

```
ThemeContext:
  theme: 'dark' | 'light'
  toggleTheme: () => void

ThemeProvider(children):
  theme ← useState(loadThemeFromStorage())  // localStorage 持久化

  useEffect:
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('codelens-theme', theme)
    // 同步 Monaco Editor 主题
    if window.__MONACO_EDITOR__:
      window.__MONACO_EDITOR__.updateOptions({ theme: theme === 'dark' ? 'vs-dark' : 'vs' })

  toggleTheme():
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>
    {children}
  </ThemeContext.Provider>
```

### 5.4 主题切换快捷键

**需求来源**：REQUIREMENTS.md §6.3 — `Ctrl+K Ctrl+T` 切换主题

**实现方式**：

```
useEffect:
  pendingKeys ← []

  handleKeyDown(e):
    if e.key == 'k' and (e.ctrlKey or e.metaKey):
      e.preventDefault()
      pendingKeys.append('Ctrl+K')
      return
    if pendingKeys.contains('Ctrl+K') and e.key == 't':
      e.preventDefault()
      toggleTheme()
      pendingKeys.clear()
      return
    // 200ms 超时清除
    setTimeout(() => pendingKeys.clear(), 200)
```

### 5.5 主题切换动画

**需求来源**：REQUIREMENTS.md §6.4 — 主题切换 300ms 渐变过渡

**实现方式**：在全局样式中为 CSS 变量引用的属性添加 `transition`：

```css
body, .sidebar-left, .sidebar-right, .menu-bar, .status-bar {
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}
```

---

## 6. 依赖安装与前提条件

### 6.1 本阶段依赖

| 依赖 | 类型 | 是否新增 | 说明 |
|------|------|----------|------|
| React | 已有 | 否 | 核心框架 |
| @tauri-apps/api | 已有 | 否 | IPC 通信 |
| @tauri-apps/plugin-dialog | 已有 | 否 | 文件选择对话框 |
| Monaco Editor | 已有 | 否 | 代码编辑器 |

**本阶段无需安装任何新的 npm 依赖**。所有功能通过原生 React + CSS 实现，不引入第三方 UI 组件库或图标库，确保项目依赖体积不增加。

### 6.2 开发环境前提

| 前提条件 | 版本要求 | 验证命令 |
|----------|----------|----------|
| Node.js | v24.x | `node --version` |
| Rust | 1.95.0+ | `rustc --version` |
| Tauri CLI | 2.0+ | 已通过 `npm install` 安装 |
| Git | 2.x | `git --version` |

### 6.3 注意事项

1. **Rust 工具链激活**：若命令行未识别 `cargo` 命令，需先执行：
   ```
   $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
   ```

2. **Tauri 构建缓存**：若 `cargo check` 引用旧路径，需清理：
   ```bash
   rm -rf src-tauri/target/debug/build
   rm -rf src-tauri/target/debug/.fingerprint
   ```

3. **前端构建缓存**：修改 CSS 变量后，需清理 Next.js 缓存：
   ```bash
   rm -rf frontend/.next
   ```

4. **Monaco Editor 主题**：Monaco 内置 `vs-dark` 和 `vs` 两种主题，分别对应深色和浅色，无需额外安装主题包。

### 6.4 npm 镜像源

如遇 `npm install` 下载缓慢，使用国内镜像源：

```bash
npm config set registry https://registry.npmmirror.com
```

---

## 7. 涉及文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/components/FileTree.tsx` | **重写** | 增加搜索过滤、右键菜单、文件图标、排序 |
| `frontend/components/ContextMenu.tsx` | **新增** | 通用右键上下文菜单组件 |
| `frontend/components/FileIcon.tsx` | **新增** | 基于扩展名的文件图标组件 |
| `frontend/components/ThemeProvider.tsx` | **新增** | 主题上下文管理 |
| `frontend/pages/_app.tsx` | **修改** | 包裹 ThemeProvider |
| `frontend/pages/index.tsx` | **修改** | 集成拖拽分割面板、菜单栏功能化、状态栏增强 |
| `frontend/styles/globals.css` | **修改** | 添加浅色主题变量、分割条样式、菜单样式、图标样式 |
| `src-tauri/src/lib.rs` | **修改** | `read_directory` 增加符号链接过滤 |
| `frontend/components/Editor.tsx` | **修改** | 集成 ThemeProvider，动态切换 Monaco 主题 |
| `README.md` | **修改** | 标记 F-006 已完成 + 阶段5详情 |
| `CHANGELOG.md` | **修改** | 新增 v0.5.0 版本记录 |

---

## 8. 实现顺序

### 步骤 1：创建功能分支

```bash
git checkout develop
git pull origin develop
git checkout -b feat/f006-file-tree
```

### 步骤 2：FileIcon 组件

创建 `frontend/components/FileIcon.tsx`，实现文件扩展名到图标的映射。

### 步骤 3：ContextMenu 组件

创建 `frontend/components/ContextMenu.tsx`，实现通用右键菜单。

### 步骤 4：重写 FileTree.tsx

重写 `frontend/components/FileTree.tsx`，集成搜索过滤、右键菜单、FileIcon、排序。

### 步骤 5：后端符号链接过滤

修改 `src-tauri/src/lib.rs` — `read_directory` 函数增加 `symlink_metadata` 判断，过滤符号链接。

### 步骤 6：ThemeProvider 组件

创建 `frontend/components/ThemeProvider.tsx`，实现主题上下文管理。

### 步骤 7：浅色主题 CSS 变量

在 `frontend/styles/globals.css` 中添加 `[data-theme="light"]` 选择器及浅色主题变量。

### 步骤 8：修改 _app.tsx

在 `frontend/pages/_app.tsx` 中包裹 ThemeProvider。

### 步骤 9：修改 Editor.tsx

在 `frontend/components/Editor.tsx` 中集成 ThemeProvider，实现 Monaco Editor 主题动态切换。

### 步骤 10：修改 index.tsx（布局 + 菜单 + 状态栏）

在 `frontend/pages/index.tsx` 中实现：
- 可拖拽分割面板
- 菜单栏下拉功能
- 状态栏增强（主题切换按钮 + 分支名 + 版本号升级）

### 步骤 11：CSS 样式补充

在 `frontend/styles/globals.css` 中添加：
- 分割条样式（`.resize-handle`）
- 下拉菜单样式（`.dropdown-menu`）
- 文件图标徽标样式
- 主题切换过渡动画

### 步骤 12：编译验证

```bash
# 前端编译
cd frontend && npm run build

# Rust 编译
cd src-tauri && cargo check
```

### 步骤 13：功能测试

按第 9 节测试流程逐项验证。

---

## 9. 测试流程

### 9.1 测试范围

| 模块 | 测试项 | 验证方法 | 预期结果 |
|------|--------|----------|----------|
| FileTree - 搜索 | 输入 2+ 字符过滤 | 在搜索框输入文件名片段 | 匹配文件高亮，不匹配的目录自动展开显示匹配子节点 |
| FileTree - 搜索 | 清空搜索恢复 | 删除搜索框内容 | 文件树恢复为完整显示 |
| FileTree - 搜索 | 防抖验证 | 快速连续输入 | 不会每次输入都触发过滤，300ms 后才更新 |
| FileTree - 右键菜单 | 右键点击文件节点 | 右键点击文件 | 弹出上下文菜单，包含"复制路径"等选项 |
| FileTree - 右键菜单 | 点击菜单外关闭 | 菜单打开后点击其他区域 | 菜单关闭 |
| FileTree - 文件图标 | 查看不同类型文件 | 打开包含多种文件的项目 | .cpp 显示 C++ 徽标，.h 显示 H 徽标，目录显示箭头 |
| FileTree - 排序 | 查看目录内排列顺序 | 展开一个含文件和子目录的目录 | 目录在前，文件在后，均按字母序 |
| FileTree - 符号链接 | 项目含符号链接 | 打开含符号链接的目录 | 符号链接不显示 |
| FileTree - 性能 | 加载 1000+ 文件的项目 | 打开大型项目，观察加载时间 | 加载时间 < 500ms |
| 布局 - 拖拽 | 拖动左侧分割条 | 鼠标拖动左侧分割条 | 左侧边栏宽度随拖动变化，编辑器自适应 |
| 布局 - 拖拽 | 拖动右侧分割条 | 鼠标拖动右侧分割条 | 右侧边栏宽度随拖动变化 |
| 布局 - 双击 | 双击分割条 | 双击分割条 | 恢复默认宽度（左 240px，右 200px） |
| 布局 - 边界 | 拖拽超出范围 | 将分割条拖到极端位置 | 宽度被限制在 160px ~ 480px 范围内 |
| 菜单栏 | 点击菜单项 | 点击 "查看(V)" → "切换主题" | 主题切换，菜单关闭 |
| 菜单栏 | ESC 关闭 | 打开菜单后按 ESC | 菜单关闭 |
| 主题切换 | 点击状态栏按钮 | 点击状态栏主题切换按钮 | 深色 ↔ 浅色切换 |
| 主题切换 | 快捷键 | 按 Ctrl+K Ctrl+T | 主题切换 |
| 主题切换 | 持久化 | 切换主题后刷新页面 | 主题保持切换后的状态 |
| 主题切换 | Monaco 同步 | 切换主题 | Monaco Editor 背景色和语法高亮同步切换 |
| 主题切换 | 过渡动画 | 快速切换主题 | 有 300ms 渐变过渡，无闪烁 |
| 状态栏 | 信息显示 | 打开文件并移动光标 | 显示"行 X, 列 Y"、语言、UTF-8、LF、版本号 |

### 9.2 回归测试

阶段5 变更集中在 UI 层，但需确保不破坏已实现的核心功能：

| 回归项 | 验证方法 | 预期结果 |
|--------|----------|----------|
| F-001 代码高亮 | 打开 .cpp 文件 | 语法高亮正常显示 |
| F-002 符号跳转 | Ctrl+Click 函数调用 | 跳转到定义位置 |
| F-003 引用查找 | Shift+F12 | 引用面板正常显示 |
| F-004 符号大纲 | 打开文件后查看右侧面板 | 大纲列表正常显示 |
| F-005 符号搜索 | Ctrl+Shift+F 输入关键词 | 搜索结果正常显示 |
| 文件打开 | 点击文件树中的文件 | Monaco Editor 加载文件内容 |

### 9.3 测试记录模板

测试完成后，记录以下信息：

```
## 阶段5 测试报告

### 测试环境
- 操作系统：Windows 11
- Node.js：v24.13.0
- Rust：1.95.0
- 测试日期：YYYY-MM-DD

### 功能测试结果
| 测试项 | 结果 | 备注 |
|--------|------|------|
| ... | PASS/FAIL | ... |

### 回归测试结果
| 回归项 | 结果 | 备注 |
|--------|------|------|
| ... | PASS/FAIL | ... |

### 发现的问题
（如有）
```

---

## 10. Git 工作流节点

### 10.1 分支策略

遵循 REQUIREMENTS.md §9.1 Git Flow 分支模型：

```
main     ──●────────────────────────────────●──  (v0.4.0)
           \                                /
develop  ────●───●───●───●───●───●───●───●──●──  (v0.4.0)
                           \
feat/f006-file-tree ────────●───●───●───●────  (阶段5 开发)
```

### 10.2 工作流步骤

#### 10.2.1 阶段开始

```bash
git checkout develop
git pull origin develop
git checkout -b feat/f006-file-tree
```

#### 10.2.2 开发过程中的原子提交

遵循 REQUIREMENTS.md §8.3.1 Conventional Commits 规范：

| 提交 | 消息 | 说明 |
|------|------|------|
| 1 | `feat(f006): 添加 FileIcon 文件类型图标组件` | 新增 FileIcon.tsx |
| 2 | `feat(f006): 添加 ContextMenu 右键菜单组件` | 新增 ContextMenu.tsx |
| 3 | `feat(f006): 重写 FileTree 组件，支持搜索过滤和右键菜单` | 重写 FileTree.tsx |
| 4 | `fix(tauri): read_directory 过滤符号链接` | 修改 lib.rs |
| 5 | `feat(ui): 添加 ThemeProvider 主题切换组件` | 新增 ThemeProvider.tsx + 浅色主题 CSS |
| 6 | `feat(ui): 实现可拖拽分割面板和菜单栏功能化` | 修改 index.tsx |
| 7 | `style(ui): 添加分割条、菜单、图标、过渡动画样式` | 修改 globals.css |

#### 10.2.3 阶段结束 — 合并与标签

```bash
# 1. 确保所有功能已提交且编译通过
cd frontend && npm run build
cd src-tauri && cargo check

# 2. 切回 develop 并合并功能分支
git checkout develop
git merge --no-ff feat/f006-file-tree -m "merge: 阶段5 - UI完善 (F-006文件树增强 + 主题切换)"

# 3. 更新文档
#    - README.md：标记 F-006 ✅，添加阶段5详情
#    - CHANGELOG.md：新增 v0.5.0 版本记录
git add README.md CHANGELOG.md
git commit -m "docs(readme,changelog): 更新阶段5完成文档"

# 4. 合并到 main
git checkout main
git merge --no-ff develop -m "merge: release v0.5.0 - 阶段5 UI完善"

# 5. 打版本标签
git tag -a v0.5.0-beta -m "阶段5完成：F-006文件树浏览器增强 + 界面布局完善 + 主题切换"

# 6. 推送所有分支和标签
git push origin main
git push origin develop
git push origin v0.5.0-beta
```

#### 10.2.4 清理功能分支

```bash
git branch -d feat/f006-file-tree
git push origin --delete feat/f006-file-tree
```

### 10.3 版本号规则

遵循 REQUIREMENTS.md §8.3.4 语义化版本：

| 版本 | 标签 | 说明 |
|------|------|------|
| v0.5.0-beta | `v0.5.0-beta` | 阶段5完成，里程碑 M3（所有 P0 功能完成） |

> **注意**：REQUIREMENTS.md §11.2 中阶段5标签标注为 `v0.3.0-beta`，但项目已演进至 v0.4.0，此处修正为 `v0.5.0-beta`。

---

## 11. 阶段完成 Review

### 11.1 Review 时机

项目当前进度超过 50%（阶段1~4 已完成，6 个功能中已完成 5 个）。阶段5 完成后，项目将达到 **里程碑 M3（所有 P0 功能完成）**。在此关键节点，必须进行全面 Review 以防止代码、依赖和文档冲突。

### 11.2 Review 清单

#### 11.2.1 代码冲突检查

| 检查项 | 检查方法 | 预期 |
|--------|----------|------|
| Git 合并冲突 | `git diff develop...feat/f006-file-tree` | 无冲突 |
| CSS 类名冲突 | 全局搜索新增 CSS 类名 | 不与已有类名重复 |
| 组件 Props 变更 | 检查 FileTree、Editor 的 Props 是否变更 | 如有变更，确认所有调用方已更新 |
| Tauri IPC 兼容性 | 检查 `read_directory` 返回值变更 | 新增 `isSymlink` 过滤对前端透明，无破坏性变更 |

#### 11.2.2 依赖冲突检查

| 检查项 | 检查方法 | 预期 |
|--------|----------|------|
| package.json 新增依赖 | `git diff HEAD -- frontend/package.json` | 无新增 npm 依赖 |
| package-lock.json 变更 | `git diff HEAD -- frontend/package-lock.json` | 无变更 |
| CMakeLists.txt 变更 | `git diff HEAD -- sidecar/CMakeLists.txt` | 无变更（本阶段无 C++ 依赖变更） |
| Cargo.toml 变更 | `git diff HEAD -- src-tauri/Cargo.toml` | 无新增 Rust 依赖 |

#### 11.2.3 文档一致性检查

| 检查项 | 检查方法 | 预期 |
|--------|----------|------|
| README.md 功能状态 | 检查功能列表 | F-001~F-006 全部标记为已完成 |
| CHANGELOG.md 版本记录 | 检查最新版本 | v0.5.0 条目完整 |
| 版本号一致性 | 检查 index.tsx 状态栏 | 显示 v0.5.0 |
| package.json 版本 | 检查 frontend/package.json | version 字段更新（如适用） |
| tauri.conf.json 版本 | 检查 src-tauri/tauri.conf.json | version 字段更新为 0.5.0 |

#### 11.2.4 功能回归验证

运行第 9 节中全部测试用例，确保：
- 6 个已实现功能（F-001 ~ F-006）全部正常
- 无新增 Bug
- 无性能退化

### 11.3 Review 产出

Review 完成后，记录结果到 MEMORY.md 和 CHANGELOG.md：

```
## 阶段5 Review 记录

日期：YYYY-MM-DD
检查项总数：X 项
通过：Y 项
问题：Z 项（已修复 W 项，遗留 N 项）
结论：通过 / 不通过（需修复后重新 Review）
```

---

## 12. 异常处理链路

### 12.1 异常处理原则

**链路**：发现 → 诊断 → 解决

所有异常处理遵循以下流程：

```
异常发生
  → 捕获异常（发现）
  → 记录日志（console.error / 状态栏提示）
  → 定位根因（诊断）
  → 执行修复（解决）
  → 验证修复（回归测试）
```

### 12.2 依赖下载异常

**场景**：GitHub、npm、crates.io 等外部资源下载缓慢或失败。

**发现**：
- `npm install` 超时
- `cargo build` 网络超时
- CMake FetchContent 下载超时

**诊断**：
- 检查网络连接
- 确认镜像源配置是否生效

**解决**：

| 资源 | 国内镜像源 | 配置方式 |
|------|-----------|----------|
| npm | registry.npmmirror.com | `npm config set registry https://registry.npmmirror.com` |
| crates.io | rsproxy.cn | `set RUSTUP_DIST_SERVER=https://rsproxy.cn` + `set RUSTUP_UPDATE_ROOT=https://rsproxy.cn/rustup` |
| GitHub | ghfast.top | `git config --global url.https://ghfast.top/https://github.com/.insteadOf`（已配置） |
| CMake FetchContent | 优先手动下载 | 将源码放入 `sidecar/third_party/` |

### 12.3 文件树加载异常

**场景**：读取目录失败、权限不足、路径无效。

**发现**：
- Tauri IPC 调用 `read_directory` 抛出异常
- 前端 `loadProject` / `toggleExpand` 的 catch 块捕获

**诊断**：
- 检查目录是否存在（路径有效性）
- 检查文件系统权限

**解决**：

| 异常 | 用户提示 | 处理方式 |
|------|----------|----------|
| 目录不存在 | "目录不存在或已被删除" | 清空文件树，提示重新选择 |
| 权限不足 | "无权限访问该目录" | 跳过该目录，显示警告图标 |
| 目录读取超时 | "加载超时，请重试" | 提供重试按钮 |
| 符号链接循环 | 不显示（静默处理） | 后端过滤，不传递给前端 |

### 12.4 主题切换异常

**场景**：Monaco Editor 主题切换失败、localStorage 读取异常。

**发现**：
- 切换主题后 Monaco Editor 未同步
- 刷新页面后主题未保持

**诊断**：
- 检查 `window.__MONACO_EDITOR__` 是否存在
- 检查 `localStorage.getItem('codelens-theme')` 返回值

**解决**：

| 异常 | 处理方式 |
|------|----------|
| Monaco 实例不存在 | 在 Editor 组件挂载时重新应用当前主题 |
| localStorage 不可用 | try-catch 包裹，降级为默认深色主题 |
| 主题切换后样式闪烁 | 确保 `data-theme` 属性在 DOM 更新前设置 |

### 12.5 Git 操作异常

**场景**：推送失败、合并冲突、SSH 连接中断。

**发现**：
- `git push` 失败
- `git merge` 报告冲突
- SSH 超时

**诊断**：
- 检查 SSH 密钥配置
- 检查远程分支状态
- 查看冲突文件列表

**解决**：

| 异常 | 解决方式 |
|------|----------|
| SSH 推送超时 | 使用 HTTPS + PAT 作为备用推送方式 |
| 合并冲突 | 在功能分支上 `rebase` 解决冲突，不直接在 develop 上处理 |
| 推送被拒绝 | 先 `pull --rebase`，再 `push --force-with-lease`（仅功能分支） |
| 标签推送失败 | 单独 `git push origin <tag-name>` |

### 12.6 异常排查工具

| 工具 | 用途 | 命令示例 |
|------|------|----------|
| `git status` | 检查工作区状态 | `git status` |
| `git diff` | 检查变更内容 | `git diff develop...HEAD` |
| `cargo check` | 验证 Rust 编译 | `cargo check` |
| `npm run build` | 验证前端编译 | `npm run build` |
| 浏览器 DevTools | 检查前端运行时错误 | F12 → Console |
| `git log --oneline` | 查看提交历史 | `git log --oneline -10` |
| `git reflog` | 恢复误操作 | `git reflog` |

---

## 附录 A：设计文档与需求文档对照表

| 需求文档章节 | 对应本章节 | 状态 |
|-------------|-----------|------|
| §2.6 F-006 文件树浏览器 | §3 功能实现 | 已覆盖 |
| §4.3.2 FileTreeView 组件设计 | §3.1~3.7 | 已覆盖并扩展 |
| §6.1 界面布局 | §4 功能实现 | 已覆盖 |
| §6.2 主题设计 | §5.2 CSS 变量定义 | 已覆盖 |
| §6.3 快捷键设计 | §5.4 主题切换快捷键 | 已覆盖 |
| §6.4 动画与过渡 | §5.5 主题切换动画 | 已覆盖 |
| §8 代码规范 | §10 Git 工作流 | 已覆盖 |
| §9 Git 工作流 | §10 Git 工作流节点 | 已覆盖 |
| §10 测试策略 | §9 测试流程 | 已覆盖 |
| §11.2 阶段5 排期 | §1~2 阶段概述 + 交付物 | 已覆盖 |
| §12 风险评估 | §11 Review | 已覆盖 |

---

## 附录 B：与已有功能的冲突防范

| 已有功能 | 潜在冲突点 | 防范措施 |
|----------|-----------|----------|
| F-001 代码高亮 | 主题切换后 Monaco 高亮颜色不匹配 | Monaco 使用内置主题 vs/vs-dark，不依赖 CSS 变量 |
| F-002 符号跳转 | FileTree 组件 Props 变更导致 onFileSelect 不兼容 | FileTree Props 不变，仅内部实现重写 |
| F-003 引用查找 | 菜单栏改动影响"转到"菜单事件绑定 | 保留现有 onClick 逻辑，迁移到下拉菜单 |
| F-004 符号大纲 | 右侧分割条拖动影响大纲面板宽度 | 使用 inline style 动态设置宽度，CSS 变量不参与 |
| F-005 符号搜索 | 搜索面板位置被布局变更影响 | 搜索面板使用 `position: absolute`，相对于编辑器区域定位 |

---

**文档结束**

*本文档是 CodeLens 代码阅读器阶段5（UI 完善）的功能实现文档，基于 REQUIREMENTS.md v1.2 编写。*
