import type { AppProps } from 'next/app';
import '@/styles/globals.css';

/**
 * CodeLens 应用入口
 *
 * 全局配置：
 * - 引入全局样式
 * - 后续在此添加全局状态 Provider（如 ThemeContext、ProjectContext）
 */
export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
