import { useState } from "react";
import { Link } from "wouter";
import { Mic, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ForgotPasswordResponse {
  message?: string;
}

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;

    setStatus("loading");
    setMessage("");

    const trimmed = identifier.trim();
    const body = trimmed.includes("@")
      ? { email: trimmed }
      : { username: trimmed };

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data: ForgotPasswordResponse = await response.json();

      if (response.ok) {
        setStatus("success");
        setMessage(
          data.message ||
            "Если аккаунт существует, мы отправили письмо с инструкциями по сбросу пароля."
        );
      } else {
        setStatus("error");
        setMessage(data.message || "Не удалось отправить письмо для сброса пароля");
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Ошибка отправки запроса");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 font-serif text-2xl font-bold text-primary">
            <Mic className="h-6 w-6 text-accent" />
            <span>VoxLibris</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Восстановление доступа к аккаунту
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Забыли пароль?</CardTitle>
            <CardDescription>
              Введите email или имя пользователя, мы отправим ссылку для сброса
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">Email или имя пользователя</Label>
                <Input
                  id="identifier"
                  type="text"
                  placeholder="your.email@example.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={status === "loading"}>
                {status === "loading" ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Отправляем...
                  </span>
                ) : (
                  "Отправить инструкцию"
                )}
              </Button>
            </form>

            {status === "success" && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 flex gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5" />
                <span>{message}</span>
              </div>
            )}

            {status === "error" && (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>{message}</span>
              </div>
            )}

            <div className="mt-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Вспомнили пароль?{" "}
                <Link href="/auth/login" className="text-primary hover:underline font-medium">
                  Войти
                </Link>
              </p>
              <Link href="/" className="block text-sm text-muted-foreground hover:text-primary">
                ← Вернуться на главную
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
