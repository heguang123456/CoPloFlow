import type { AppProps } from 'next/app';
import '@/styles/globals.css';
import ThemeProvider from '@/components/ThemeProvider';

/**
 * React Error Boundary
 *
 * 捕获子组件树中的渲染错误，防止整个应用白屏
 * 显示错误详情并允许用户重试
 */
import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[CodeLens ErrorBoundary] Caught error:', error);
    console.error('[CodeLens ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1e1e1e',
            color: '#d4d4d4',
            fontFamily: 'Consolas, "Courier New", monospace',
            padding: 40,
          }}
        >
          <div
            style={{
              maxWidth: 700,
              width: '100%',
              background: '#252526',
              border: '1px solid #3c3c3c',
              borderRadius: 8,
              padding: 24,
            }}
          >
            <h2
              style={{
                color: '#f44747',
                fontSize: 18,
                marginBottom: 16,
                fontFamily: 'Segoe UI, sans-serif',
              }}
            >
              CodeLens 渲染异常
            </h2>

            <div
              style={{
                background: '#1e1e1e',
                border: '1px solid #3c3c3c',
                borderRadius: 4,
                padding: 12,
                marginBottom: 16,
                fontSize: 13,
                lineHeight: 1.6,
                color: '#ce9178',
                wordBreak: 'break-all',
              }}
            >
              {this.state.error?.message || 'Unknown error'}
            </div>

            {this.state.error?.stack && (
              <details style={{ marginBottom: 16 }}>
                <summary
                  style={{
                    color: '#569CD6',
                    cursor: 'pointer',
                    fontSize: 13,
                    marginBottom: 8,
                  }}
                >
                  堆栈信息 (点击展开)
                </summary>
                <pre
                  style={{
                    background: '#1e1e1e',
                    border: '1px solid #3c3c3c',
                    borderRadius: 4,
                    padding: 12,
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: '#858585',
                    overflowX: 'auto',
                    maxHeight: 300,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                background: '#007acc',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '8px 20px',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'Segoe UI, sans-serif',
              }}
            >
              重试
            </button>

            <p
              style={{
                marginTop: 16,
                fontSize: 12,
                color: '#6a6a6a',
              }}
            >
              请按 F12 打开开发者工具查看 Console 面板获取更多信息。
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * CodeLens 应用入口
 *
 * 全局配置：
 * - 引入全局样式
 * - ErrorBoundary 捕获渲染异常
 * - ThemeProvider 包裹全局主题上下文
 */
export default function App({ Component, pageProps }: AppProps) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Component {...pageProps} />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
