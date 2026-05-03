import { AlertCircle, CheckCircle, Loader2, Mail, Mic, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ConfirmEmailResponse {
  success: boolean;
  message: string;
  code?: string;
}

export default function ConfirmEmail() {
  const [, params] = useRoute("/confirm-email/:token");
  const token = params?.token || "";

  const [status, setStatus] = useState<"loading" | "success" | "error" | "idle">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const confirmEmail = async () => {
      if (!token) {
        setStatus("error");
        setMessage("Токен подтверждения отсутствует");
        return;
      }

      try {
        const response = await fetch("/api/auth/confirm-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });

        const data: ConfirmEmailResponse = await response.json();

        if (response.ok && data.success) {
          setStatus("success");
          setMessage(data.message || "Email успешно подтверждён");
        } else {
          setStatus("error");
          setMessage(data.message || "Не удалось подтвердить email");
        }
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Произошла ошибка при подтверждении");
      }
    };

    confirmEmail();
  }, [token]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[100dvh] items-start justify-center bg-background px-4 py-8 sm:items-center sm:py-10">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Подтверждение email...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex min-h-[100dvh] items-start justify-center bg-background px-4 py-8 sm:items-center sm:py-10">
        <div className="w-full max-w-md space-y-5 sm:space-y-6">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 font-serif text-2xl font-bold text-primary">
              <Mic className="h-6 w-6 text-accent" />
              <span>VoxLibris</span>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-center mb-4">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <CardTitle className="text-center">Email подтверждён!</CardTitle>
              <CardDescription className="text-center">{message}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-700 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Ваш аккаунт успешно активирован
                </p>
              </div>

              <Link href="/auth/login">
                <Button className="w-full">Войти в аккаунт</Button>
              </Link>
            </CardContent>
          </Card>

          <div className="text-center">
            <Link href="/" className="text-sm text-muted-foreground hover:text-primary">
              ← Вернуться на главную
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-start justify-center bg-background px-4 py-8 sm:items-center sm:py-10">
      <div className="w-full max-w-md space-y-5 sm:space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 font-serif text-2xl font-bold text-primary">
            <Mic className="h-6 w-6 text-accent" />
            <span>VoxLibris</span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-center mb-4">
              <XCircle className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle className="text-center">Ошибка подтверждения</CardTitle>
            <CardDescription className="text-center">{message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <p className="text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Возможно, ссылка устарела или уже была использована
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/" className="flex-1">
                <Button className="w-full" variant="outline">
                  На главную
                </Button>
              </Link>
              <Link href="/auth/register" className="flex-1">
                <Button className="w-full">Регистрация</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-primary">
            ← Вернуться на главную
          </Link>
        </div>
      </div>
    </div>
  );
}
