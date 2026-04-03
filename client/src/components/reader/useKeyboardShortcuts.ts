import { useEffect, useCallback, type RefObject } from "react";

interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  action: () => void;
  description: string;
  /** Если true, действие выполняется только когда скролл в начале страницы */
  requireAtTop?: boolean;
  /** Если true, действие выполняется только когда скролл в конце страницы */
  requireAtBottom?: boolean;
  /** Ссылка на контейнер скролла для проверки позиции */
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

function isAtTop(container: HTMLElement | null | undefined, threshold = 20): boolean {
  if (!container) return false;
  return container.scrollTop <= threshold;
}

function isAtBottom(container: HTMLElement | null | undefined, threshold = 20): boolean {
  if (!container) return false;
  return container.scrollTop + container.clientHeight >= container.scrollHeight - threshold;
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
        // Проверка позиции скролла
        if (shortcut.requireAtTop && !isAtTop(shortcut.scrollContainerRef?.current)) {
          continue;
        }
        if (shortcut.requireAtBottom && !isAtBottom(shortcut.scrollContainerRef?.current)) {
          continue;
        }

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