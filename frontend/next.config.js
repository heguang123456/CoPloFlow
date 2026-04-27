/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tauri 需要静态导出
  output: 'export',
  // 禁用图片优化（静态导出不支持）
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
