import { useEffect } from 'react';

/**
 * 自定义错误页面
 *
 * 替代 Next.js 默认的 "Application error: a client-side exception has occurred" 页面
 * 显示真实的错误信息，便于排查问题
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[CodeLens] Unhandled error:', error);
  }, [error]);

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
          CodeLens 运行时错误
        </h2>

        <div
          style={{
            background: '#1e1e1e',
            border: '1px solid #3c3c3c',
            borderRadius: 4,
            padding: 12,
            marginBottom: 16,
            wordBreak: 'break-all',
            fontSize: 13,
            lineHeight: 1.6,
            color: '#ce9178',
          }}
        >
          <div style={{ color: '#858585', marginBottom: 4 }}>Error Message:</div>
          {error?.message || 'Unknown error'}
        </div>

        {error?.stack && (
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
              {error.stack}
            </pre>
          </details>
        )}

        <button
          onClick={reset}
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
          如持续出现此错误，请检查浏览器开发者工具 (F12) 的 Console 面板获取更多信息。
        </p>
      </div>
    </div>
  );
}
