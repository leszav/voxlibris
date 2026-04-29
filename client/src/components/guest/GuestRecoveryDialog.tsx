import * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface GuestRecoveryDialogProps {
  open: boolean;
  onClose: () => void;
  onRestore: (code: string) => Promise<void>;
}

export function GuestRecoveryDialog({
  open,
  onClose,
  onRestore
}: GuestRecoveryDialogProps) {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setIsLoading(true);
    setError("");

    try {
      await onRestore(code.trim().toUpperCase());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неверный код");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative max-h-[calc(100dvh-3rem)] w-full max-w-sm overflow-y-auto rounded-2xl bg-background p-6">
        <h2 className="text-xl font-serif font-bold mb-4">Восстановить доступ</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              placeholder="Введите код (например ABC123)"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="text-center font-mono text-lg tracking-widest"
            />
          </div>
          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Отмена
            </Button>
            <Button type="submit" disabled={isLoading || code.length < 6} className="flex-1">
              {isLoading ? "..." : "Восстановить"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
