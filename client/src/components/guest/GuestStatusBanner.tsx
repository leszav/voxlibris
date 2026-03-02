import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useGuest } from "@/hooks/use-guest";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Check, Copy, KeyRound, Library, UserPlus } from "lucide-react";

const GUEST_CODE_HINT_SHOWN_KEY = "guest_code_hint_shown_v1";

export function GuestStatusBanner() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { isLoading, guest, book, error, expiresInDays, hasBook, init, restore } = useGuest();
  const [showRestore, setShowRestore] = useState(false);
  const [restoreCode, setRestoreCode] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCodeCopied, setIsCodeCopied] = useState(false);
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (location.includes("guestRestore=1")) {
      setShowRestore(true);
    }
  }, [location]);

  async function handleGuestStart() {
    setActionError(null);
    setIsSubmitting(true);
    try {
      const session = await init();
      if (session.book) {
        setLocation(`/guest/reader/${session.book.bookId}`);
      } else {
        setLocation("/guest/library");
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Не удалось открыть гостевой доступ");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRestore() {
    if (!restoreCode.trim()) return;

    setActionError(null);
    setIsSubmitting(true);
    try {
      const session = await restore(restoreCode.trim().toUpperCase());
      if (session.book) {
        setLocation(`/guest/reader/${session.book.bookId}`);
      } else {
        setLocation("/guest/library");
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Не удалось восстановить доступ");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCodeCopy() {
    if (!guest?.accessCode) {
      return;
    }

    await navigator.clipboard.writeText(guest.accessCode);
    setIsCodeCopied(true);

    if (copyFeedbackTimeoutRef.current) {
      clearTimeout(copyFeedbackTimeoutRef.current);
    }
    copyFeedbackTimeoutRef.current = setTimeout(() => {
      setIsCodeCopied(false);
    }, 1400);
  }

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!guest?.accessCode) {
      return;
    }

    try {
      const shown = globalThis.localStorage.getItem(GUEST_CODE_HINT_SHOWN_KEY) === "1";
      if (shown) {
        return;
      }

      toast({
        title: "Сохраните гостевой код",
        description: "Он нужен для доступа к книге и сохранения прогресса.",
      });
      globalThis.localStorage.setItem(GUEST_CODE_HINT_SHOWN_KEY, "1");
    } catch {
      // ignore localStorage access errors
    }
  }, [guest?.accessCode, toast]);

  if (isAuthenticated) return null;

  return (
    <div className="bg-muted/50 rounded-xl p-3 space-y-3">
      {guest ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-muted-foreground">Гостевой код:</span>
              <code className="bg-background px-2 py-1 rounded text-sm font-mono font-medium">
                {guest.accessCode}
              </code>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => void handleCodeCopy()}
                title={isCodeCopied ? "Код скопирован" : "Скопировать и сохранить код"}
                aria-label={isCodeCopied ? "Код скопирован" : "Скопировать и сохранить код"}
                className={`h-7 w-7 transition-colors ${isCodeCopied ? "text-primary bg-primary/10" : ""}`}
              >
                {isCodeCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              {hasBook && <span className="text-sm text-muted-foreground hidden sm:inline">Книга: загружена</span>}
            </div>
            <div className="flex items-center gap-2 sm:gap-1.5">
            {book && (
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setLocation(`/guest/reader/${book.bookId}`)}
                title="Продолжить чтение"
                aria-label="Продолжить чтение"
                className="rounded-full sm:h-8 sm:w-auto sm:px-2.5 sm:rounded-md"
              >
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Читать</span>
              </Button>
            )}
            {hasBook && (
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setLocation("/guest/library")}
                title="В гостевую библиотеку"
                aria-label="В гостевую библиотеку"
                className="rounded-full sm:h-8 sm:w-auto sm:px-2.5 sm:rounded-md"
              >
                <Library className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Библиотека</span>
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => setShowRestore((prev) => !prev)}
              title={showRestore ? "Скрыть восстановление" : "Восстановление по коду"}
              aria-label={showRestore ? "Скрыть восстановление" : "Восстановление по коду"}
              className="rounded-full sm:h-8 sm:w-auto sm:px-2.5 sm:rounded-md"
            >
              <KeyRound className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Восстановить</span>
            </Button>
            <span className="text-sm text-muted-foreground ml-1">{expiresInDays} дн.</span>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            Сохраните код — он нужен для доступа к книге и сохранения прогресса.
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Читать как гость</p>
            <p className="text-sm text-muted-foreground">
              1 книга (EPUB/FB2, до 1 МБ), доступ 30 дней, сохранение прогресса.
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-1.5">
            <Button
              type="button"
              size="icon"
              className="rounded-full sm:h-8 sm:w-auto sm:px-2.5 sm:rounded-md"
              onClick={handleGuestStart}
              disabled={isLoading || isSubmitting}
              title="Начать как гость"
              aria-label="Начать как гость"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Начать как гость</span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="rounded-full sm:h-8 sm:w-auto sm:px-2.5 sm:rounded-md"
              onClick={() => setShowRestore((prev) => !prev)}
              title="У меня есть код"
              aria-label="У меня есть код"
            >
              <KeyRound className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">У меня есть код</span>
            </Button>
          </div>
        </div>
      )}

      {showRestore && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={restoreCode}
            onChange={(e) => setRestoreCode(e.target.value.toUpperCase())}
            placeholder="Введите 6-символьный код"
            maxLength={6}
            className="max-w-[220px] font-mono uppercase"
            onKeyUp={(e) => e.key === "Enter" && void handleRestore()}
          />
          <Button
            className="rounded-full"
            onClick={handleRestore}
            disabled={isSubmitting || restoreCode.trim().length !== 6}
          >
            Восстановить
          </Button>
        </div>
      )}

      {(actionError || error) && (
        <p className="text-sm text-red-500">{actionError || error}</p>
      )}
    </div>
  );
}
