import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { authFetch } from "@/lib/queryClient";

const USERNAME_REGEX = /^[A-Za-z0-9_-]{3,32}$/;

export function UsernameFixBanner() {
  const { user, refetchUser } = useAuth();
  const [newUsername, setNewUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Показываем только если username содержит @ (выглядит как email)
  const needsFix = user && user.username.includes("@");
  if (!needsFix) return null;

  const isValid = USERNAME_REGEX.test(newUsername.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/auth/username", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername.trim() }),
      });
      const data = await res.json() as { message?: string };
      if (!res.ok) {
        setError((data as { message?: string }).message ?? "Ошибка");
        return;
      }
      await refetchUser();
    } catch {
      setError("Сетевая ошибка, попробуйте ещё раз");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open modal>
      <DialogContent
        className="sm:max-w-md"
        // Запрещаем закрытие через Esc/клик вне диалога
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Обновите имя пользователя</DialogTitle>
          <DialogDescription>
            Ваше текущее имя (<strong>{user.username}</strong>) содержит символ «@» и выглядит как
            email-адрес. Пожалуйста, выберите новое имя пользователя. Оно будет отображаться в чате,
            лентах активности и профиле.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-username">Новое имя пользователя</Label>
            <Input
              id="new-username"
              type="text"
              placeholder="Например: ivan_petrov"
              value={newUsername}
              onChange={(e) => {
                setNewUsername(e.target.value);
                setError(null);
              }}
              autoFocus
            />
            {newUsername && !isValid && (
              <p className="text-sm text-destructive">
                Только буквы A–Z, a–z, цифры, _ и -. От 3 до 32 символов.
              </p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!isValid || isLoading} className="w-full">
              {isLoading ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
