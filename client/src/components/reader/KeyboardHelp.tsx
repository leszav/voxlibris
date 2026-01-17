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
    { ...readerShortcuts.prevChapter, keys: '←' },
    { ...readerShortcuts.nextChapter, keys: '→' },
    { ...readerShortcuts.fontSizeIncrease, keys: 'Ctrl + +' },
    { ...readerShortcuts.fontSizeDecrease, keys: 'Ctrl + -' },
    { ...readerShortcuts.fullscreen, keys: 'F' },
    { ...readerShortcuts.back, keys: 'Esc' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border rounded-lg shadow-lg max-w-md w-full mx-4">
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