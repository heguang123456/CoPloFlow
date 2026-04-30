/**
 * copy-monaco.js
 *
 * 将 monaco-editor 的运行时文件从 node_modules 复制到 public/monaco/vs/
 * 确保 Tauri 生产构建可以本地加载 Monaco（无需 CDN）
 *
 * 用法：node scripts/copy-monaco.js
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../node_modules/monaco-editor/min/vs');
const dstDir = path.resolve(__dirname, '../public/monaco/vs');

function copyRecursiveSync(src, dst) {
  fs.mkdirSync(dst, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);

    if (entry.isDirectory()) {
      copyRecursiveSync(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

if (!fs.existsSync(srcDir)) {
  console.error('[copy-monaco] Source directory not found:', srcDir);
  process.exit(1);
}

// 清理旧文件后重新复制
if (fs.existsSync(dstDir)) {
  fs.rmSync(dstDir, { recursive: true });
}

copyRecursiveSync(srcDir, dstDir);

// 统计文件数和大小
function countFiles(dir) {
  let count = 0;
  let size = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countFiles(fullPath);
      count += sub.count;
      size += sub.size;
    } else {
      count++;
      size += fs.statSync(fullPath).size;
    }
  }
  return { count, size };
}

const stats = countFiles(dstDir);
console.log(
  `[copy-monaco] Copied ${stats.count} files (${(stats.size / 1024 / 1024).toFixed(1)} MB) to public/monaco/vs/`
);
