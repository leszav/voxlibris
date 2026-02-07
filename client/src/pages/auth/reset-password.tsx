import { useState } from "react";
import { Link, useRoute } from "wouter";
import { Mic, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ResetPasswordResponse {
  success?: boolean;
  message?: string;
}

export default function ResetPassword() {
  const [, params] = useRoute("/auth/reset-password/:token");
  const token = params?.token || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const passwordRequirements = {
    length: password.length >= 8,
    match: password === confirmPassword && password.length > 0,
  };

  const isFormValid = token && passwordRequirements.length && passwordRequirements.match;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, password }),
      });

      const data: ResetPasswordResponse = await response.json();

      if (response.ok && data.success) {
        setStatus("success");
        setMessage(data.message || "Пароль успешно обновлен");
      } else {
        setStatus("error");
        setMessage(data.message || "Не удалось сбросить пароль");
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Ошибка при сбросе пароля");
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-muted-foreground">Ссылка для сброса пароля недействительна</p>
            <Link href="/auth/forgot-password">
              <Button className="w-full">Запросить новую ссылку</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6">
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
              <CardTitle className="text-center">Пароль обновлён</CardTitle>
              <CardDescription className="text-center">{message}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/auth/login">
                <Button className="w-full">Войти в аккаунт</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 font-serif text-2xl font-bold text-primary">
            <Mic className="h-6 w-6 text-accent" />
            <span>VoxLibris</span>
          </div>
          <p className="text-sm text-muted-foreground">Создайте новый пароль</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Новый пароль</CardTitle>
            <CardDescription>Введите и подтвердите новый пароль</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Новый пароль</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Минимум 8 символов"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Повторите пароль</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Повторите пароль"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <div className={passwordRequirements.length ? "text-green-600" : "text-red-600"}>
                  • Минимум 8 символов
                </div>
                <div className={passwordRequirements.match ? "text-green-600" : "text-red-600"}>
                  • Пароли совпадают
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={!isFormValid || status === "loading"}>
                {status === "loading" ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Сохраняем...
                  </span>
                ) : (
                  "Сохранить новый пароль"
                )}
              </Button>
            </form>

            {status === "error" && (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>{message || "Ошибка при сбросе пароля"}</span>
              </div>
            )}

            <div className="mt-6 text-center">
              <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-primary">
                ← Вернуться ко входу
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
