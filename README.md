# CodeLens 代码阅读器

> 轻量、快速、语义感知的 C++ 代码阅读器

## 技术栈

- **桌面框架**：Tauri 2.0
- **前端**：Next.js + React + Monaco Editor
- **后端核心**：C++20 Sidecar + Tree-sitter C API
- **数据存储**：SQLite
- **通信协议**：JSON-RPC 2.0 over Stdio/IPC

## 项目结构

```
CodeLens/
├── src-tauri/               # Tauri 后端（Rust）
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   └── src/
│       ├── main.rs          # 应用入口
│       ├── lib.rs           # 命令注册与初始化
│       ├── commands.rs      # 命令定义
│       └── sidebar.rs       # 侧边栏管理
│
├── sidecar/                 # C++ Sidecar
│   ├── CMakeLists.txt
│   ├── include/
│   │   ├── json_rpc.h      # JSON-RPC 协议处理
│   │   ├── parser.h        # Tree-sitter 解析接口
│   │   ├── symbol.h        # 符号提取接口
│   │   └── indexer.h       # 符号索引接口
│   └── src/
│       ├── main.cpp         # Sidecar 入口
│       ├── json_rpc.cpp     # JSON-RPC 实现
│       ├── parser.cpp       # 解析服务（占位）
│       ├── symbol.cpp       # 符号服务（占位）
│       └── indexer.cpp      # 索引服务（占位）
│
├── frontend/                # Next.js 前端
│   ├── package.json
│   ├── next.config.js
│   ├── tsconfig.json
│   ├── pages/
│   │   ├── index.tsx        # 主界面
│   │   └── _app.tsx         # 应用入口
│   ├── components/
│   │   ├── Editor.tsx       # Monaco Editor 组件
│   │   ├── FileTree.tsx     # 文件树组件
│   │   └── SymbolOutline.tsx # 符号大纲组件
│   └── styles/
│       └── globals.css      # 全局样式
│
├── data/                    # SQLite 数据库（运行时生成）
├── .gitignore
├── REQUIREMENTS.md          # 需求规格文档
└── README.md
```

## 开发环境

### 前置要求

- Node.js 18+
- Rust (via rustup)
- Visual Studio 2022（含 C++ 桌面开发工作负载）
- CMake 3.24+

### 安装依赖

```bash
# 前端依赖
cd frontend
npm install

# Rust 依赖（自动由 Cargo 管理）
cd ../src-tauri
cargo build
```

### 开发运行

```bash
# 在项目根目录启动开发模式
cd src-tauri
cargo tauri dev
```

### 构建发布

```bash
cd src-tauri
cargo tauri build
```

## 核心功能

| 功能 ID | 功能名称 | 优先级 | 状态 |
|---------|---------|--------|------|
| F-001 | 代码高亮 | P0 | 🏗️ 待开发 |
| F-002 | 符号跳转 | P0 | 🏗️ 待开发 |
| F-003 | 引用查找 | P0 | 🏗️ 待开发 |
| F-004 | 符号大纲 | P1 | 🏗️ 待开发 |
| F-005 | 项目符号索引 | P1 | 🏗️ 待开发 |
| F-006 | 文件树浏览器 | P0 | 🏗️ 待开发 |

## Git 工作流

采用 Git Flow 分支模型：
- `main`：发布分支，仅接受 release/hotfix 合入
- `develop`：开发集成分支
- `feat/*`：功能分支（短生命周期）
- `fix/*`：修复分支
- `release/*`：发布准备分支
- `hotfix/*`：紧急修复分支

## 许可证

MIT License
