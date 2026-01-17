import { useEffect, useCallback } from "react";

interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Игнорируем если пользователь печатает в инпутах
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
      return;
    }

    for (const shortcut of shortcuts) {
      const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
      const ctrlMatches = !!shortcut.ctrlKey === event.ctrlKey;
      const shiftMatches = !!shortcut.shiftKey === event.shiftKey;
      const altMatches = !!shortcut.altKey === event.altKey;

      if (keyMatches && ctrlMatches && shiftMatches && altMatches) {
        event.preventDefault();
        event.stopPropagation();
        shortcut.action();
        break;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}

export const readerShortcuts = {
  toggleToc: { key: 't', description: 'Оглавление' },
  toggleBookmarks: { key: 'b', description: 'Закладки' },
  toggleSettings: { key: 's', description: 'Настройки' },
  prevChapter: { key: 'ArrowLeft', description: 'Предыдущая глава' },
  nextChapter: { key: 'ArrowRight', description: 'Следующая глава' },
  fontSizeIncrease: { key: '+', ctrlKey: true, description: 'Увеличить шрифт' },
  fontSizeDecrease: { key: '-', ctrlKey: true, description: 'Уменьшить шрифт' },
  fullscreen: { key: 'f', description: 'Полноэкранный режим' },
  back: { key: 'Escape', description: 'Назад' },
};