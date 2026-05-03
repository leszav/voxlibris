import { Keyboard } from "lucide-react";
import { Button } from "../ui/button";
import { readerShortcuts } from "./useKeyboardShortcuts";

interface KeyboardHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardHelp({ isOpen, onClose }: KeyboardHelpProps) {
  if (!isOpen) return null;

  const shortcuts = [
    { ...readerShortcuts.toggleToc, keys: 'T' },
    { ...readerShortcuts.toggleBookmarks, keys: 'B' },
    { ...readerShortcuts.toggleSettings, keys: 'S' },
    { key: 'space', description: 'Плавная прокрутка вниз', keys: 'Space' },
    { key: 'shift-space', description: 'Плавная прокрутка вверх', keys: 'Shift + Space' },
    { ...readerShortcuts.prevChapter, keys: '←' },
    { ...readerShortcuts.nextChapter, keys: '→' },
    { ...readerShortcuts.fontSizeIncrease, keys: 'Ctrl + +' },
    { ...readerShortcuts.fontSizeDecrease, keys: 'Ctrl + -' },
    { ...readerShortcuts.fullscreen, keys: 'F' },
    { ...readerShortcuts.back, keys: 'Esc' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="max-h-[calc(100dvh-3rem)] w-full max-w-md overflow-y-auto rounded-lg border bg-background shadow-lg">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Keyboard className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Горячие клавиши</h2>
          </div>
          
          <div className="space-y-2 mb-6">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.key} className="flex justify-between items-center py-2 border-b last:border-0">
                <span className="text-sm text-muted-foreground">
                  {shortcut.description}
                </span>
                <kbd className="px-2 py-1 text-xs bg-muted rounded font-mono">
                  {shortcut.keys}
                </kbd>
              </div>
            ))}
          </div>
          
          <div className="flex justify-end">
            <Button onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
