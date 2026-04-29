/**
 * 通用右键上下文菜单组件（F-006）
 *
 * 功能：
 * - 在指定坐标显示菜单
 * - 点击菜单项执行操作并关闭
 * - 点击菜单外区域关闭
 * - 视口边界修正防止溢出
 */

import { useEffect, useRef, useCallback } from 'react';

export interface MenuItemDef {
  label: string;
  action: string;
  disabled?: boolean;
  separator?: boolean; // 在此项前显示分隔线
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItemDef[];
  onSelect: (action: string) => void;
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onSelect, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  /** 视口边界修正：确保菜单不超出视口 */
  const adjustedPosition = useCallback(() => {
    const menuWidth = 200;
    const menuHeight = items.length * 30 + 16;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let adjX = x;
    let adjY = y;

    if (x + menuWidth > viewportW) adjX = viewportW - menuWidth - 8;
    if (y + menuHeight > viewportH) adjY = viewportH - menuHeight - 8;
    if (adjX < 4) adjX = 4;
    if (adjY < 4) adjY = 4;

    return { left: adjX, top: adjY };
  }, [x, y, items.length]);

  /** 点击菜单外区域关闭 */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // 延迟一帧注册，避免右键点击事件立即触发关闭
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const pos = adjustedPosition();

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item, idx) => (
        <div key={item.action}>
          {item.separator && idx > 0 && <div className="context-menu-separator" />}
          <div
            className={`context-menu-item ${item.disabled ? 'context-menu-disabled' : ''}`}
            onClick={() => {
              if (!item.disabled) {
                onSelect(item.action);
                onClose();
              }
            }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}
