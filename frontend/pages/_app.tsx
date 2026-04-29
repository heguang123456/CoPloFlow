import type { AppProps } from 'next/app';
import '@/styles/globals.css';
import ThemeProvider from '@/components/ThemeProvider';

/**
 * CodeLens 应用入口
 *
 * 全局配置：
 * - 引入全局样式
 * - ThemeProvider 包裹全局主题上下文
 */
export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <Component {...pageProps} />
    </ThemeProvider>
  );
}
