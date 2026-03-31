import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnalytics } from "@/hooks/use-analytics";
import { useAuth } from "@/hooks/use-auth";
import { getMobileAnalyticsContext, isStandaloneMode, markHomescreenOpenTracked } from "@/lib/mobile-analytics";
import { reachYandexGoal } from "@/lib/yandexMetrika";

const PWA_INSTALL_DISMISS_KEY = "pwa-install-prompt-dismissed-at";
const PWA_INSTALL_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface PwaInstallPromptProps {
  hidden?: boolean;
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/crios|fxios|edgios/.test(userAgent);

  return isIos && isSafari;
}

function isPromptDismissedRecently(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const rawDismissedAt = window.localStorage.getItem(PWA_INSTALL_DISMISS_KEY);
  if (!rawDismissedAt) {
    return false;
  }

  const dismissedAt = Number(rawDismissedAt);
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < PWA_INSTALL_DISMISS_TTL_MS;
}

function rememberPromptDismissal(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PWA_INSTALL_DISMISS_KEY, String(Date.now()));
}

export function PwaInstallPrompt({ hidden = false }: Readonly<PwaInstallPromptProps>) {
  const { isAuthenticated } = useAuth();
  const analytics = useAnalytics();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(() => isPromptDismissedRecently());
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneMode());

  const iosManualInstall = useMemo(() => isIosSafari() && !isInstalled, [isInstalled]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      const analyticsContext = getMobileAnalyticsContext({ source: "install_prompt" });
      if (analyticsContext) {
        reachYandexGoal("pwa_install", analyticsContext);
        if (isAuthenticated) {
          analytics.trackPwaInstall(analyticsContext);
        }
      }

      setIsInstalled(true);
      setDeferredPrompt(null);
      setIsDismissed(true);
      rememberPromptDismissal();
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [analytics, isAuthenticated]);

  useEffect(() => {
    if (!isInstalled || !markHomescreenOpenTracked()) {
      return;
    }

    const analyticsContext = getMobileAnalyticsContext({ source: "homescreen" });
    if (!analyticsContext) {
      return;
    }

    reachYandexGoal("pwa_homescreen_open", analyticsContext);
    if (isAuthenticated) {
      analytics.trackPwaHomescreenOpen(analyticsContext);
    }
  }, [analytics, isAuthenticated, isInstalled]);

  const dismissPrompt = useCallback(() => {
    setIsDismissed(true);
    rememberPromptDismissal();
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt) {
      return;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (choice.outcome === "accepted") {
      setIsInstalled(true);
    }

    dismissPrompt();
  }, [deferredPrompt, dismissPrompt]);

  const shouldShow = !hidden && !isDismissed && !isInstalled && (Boolean(deferredPrompt) || iosManualInstall);

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 px-3 md:hidden" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.25rem)" }}>
      <div className="mx-auto max-w-md rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary">
            {iosManualInstall ? <Share2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Установить VoxLibris</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {iosManualInstall
                ? 'В Safari нажмите "Поделиться", затем "На экран Домой".'
                : "Добавьте приложение на главный экран для быстрого входа в чтение."}
            </p>

            <div className="mt-3 flex gap-2">
              {!iosManualInstall && (
                <Button size="sm" onClick={() => void handleInstallClick()}>
                  Установить
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={dismissPrompt}>
                {iosManualInstall ? "Понятно" : "Позже"}
              </Button>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={dismissPrompt}
            className="h-8 w-8 shrink-0"
            aria-label="Скрыть подсказку установки"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
