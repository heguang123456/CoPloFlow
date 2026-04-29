'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

/**
 * 主题上下文（F-006 UI-002）
 *
 * 提供深色/浅色主题切换能力：
 * - data-theme 属性驱动 CSS 变量切换
 * - localStorage 持久化用户偏好
 * - 与 Monaco Editor 主题联动
 */

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

/** 从 localStorage 加载用户主题偏好 */
function loadThemeFromStorage(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = localStorage.getItem('codelens-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage 不可用，降级为默认
  }
  return 'dark';
}

/** 同步 Monaco Editor 主题 */
function syncMonacoTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  try {
    const editor = (window as any).__MONACO_EDITOR__;
    if (editor) {
      editor.updateOptions({ theme: theme === 'dark' ? 'codelens-dark' : 'codelens-light' });
    }
  } catch {
    // Monaco 实例不存在，忽略
  }
}

interface ThemeProviderProps {
  children: ReactNode;
}

export default function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  // 初始化主题（客户端）
  useEffect(() => {
    const stored = loadThemeFromStorage();
    setThemeState(stored);
    document.documentElement.setAttribute('data-theme', stored);
    syncMonacoTheme(stored);
    setMounted(true);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
    try {
      localStorage.setItem('codelens-theme', t);
    } catch {
      // localStorage 不可用
    }
    syncMonacoTheme(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  // SSR 时渲染子组件不闪烁
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
