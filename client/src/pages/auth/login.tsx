import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Mic, Eye, EyeOff, Clock } from 'lucide-react';
import { getAccessToken } from '@/lib/token-store';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPendingDialog, setShowPendingDialog] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setLoginError(null); // Очищаем предыдущую ошибку
    setIsLoading(true);
    try {
      await login(username, password, rememberMe);
      
      // Проверяем статус пользователя после логина
      const userDataString = getAccessToken();
      if (userDataString) {
        try {
          const userData = await fetch('/api/auth/me', {
            headers: {
              'Authorization': `Bearer ${userDataString}`,
            },
          }).then(r => r.json());
          
          if (userData.user?.status === 'pending') {
            setShowPendingDialog(true);
            return;
          }
        } catch (e) {
          console.error('Failed to fetch user data:', e);
        }
      }
      
      toast({
        title: "Добро пожаловать!",
        description: rememberMe 
          ? "Вы успешно вошли в систему. Сессия активна 30 дней." 
          : "Вы успешно вошли в систему",
      });
      setLocation('/');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Неверные данные для входа";
      setLoginError(errorMessage);
      // Показываем тост только если это не ошибка аутентификации (она уже показана на форме)
      if (!errorMessage.includes('Неверный логин') && !errorMessage.includes('Неверный пароль')) {
        toast({
          title: "Ошибка входа",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePendingDialogClose = () => {
    setShowPendingDialog(false);
    setLocation('/');
  };

  return (
    <div className="flex min-h-[100dvh] items-start justify-center bg-background px-4 py-8 sm:items-center sm:py-10">
      <div className="w-full max-w-md space-y-5 sm:space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 font-serif text-2xl font-bold text-primary">
            <Mic className="h-6 w-6 text-accent" />
            <span>VoxLibris</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Войдите в свой аккаунт
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Вход в систему</CardTitle>
            <CardDescription>
              Введите ваши данные для входа в аккаунт
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loginError && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive font-medium">{loginError}</p>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Email</Label>
                <Input
                  id="username"
                  type="email"
                  placeholder="your.email@example.com"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setLoginError(null);
                  }}
                  required
                  autoComplete="username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Введите пароль"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setLoginError(null);
                    }}
                    required
                    autoComplete="current-password"
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
                <div className="text-right">
                  <Link href="/auth/forgot-password" className="text-xs text-muted-foreground hover:text-primary">
                    Забыли пароль?
                  </Link>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                />
                <Label 
                  htmlFor="remember-me" 
                  className="cursor-pointer select-none text-sm font-normal leading-5"
                >
                  Запомнить меня на 30 дней
                </Label>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Входим..." : "Войти"}
              </Button>
            </form>

            <div className="mt-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Нет аккаунта?{' '}
                <Link href="/auth/register" className="text-primary hover:underline font-medium">
                  Зарегистрироваться
                </Link>
              </p>
              <Link href="/" className="block text-sm text-muted-foreground hover:text-primary">
                ← Вернуться на главную
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Диалог ожидания активации */}
      <Dialog open={showPendingDialog} onOpenChange={setShowPendingDialog}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-yellow-100 rounded-full">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
              <DialogTitle>Аккаунт ожидает активации</DialogTitle>
            </div>
            <DialogDescription className="text-base">
              Ваш аккаунт успешно создан и вы вошли в систему, но он ожидает активации администратором.
              <br /><br />
              <strong>Что вы можете делать сейчас:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Просматривать каталог клубов</li>
                <li>Просматривать свою библиотеку</li>
                <li>Читать ранее загруженные книги</li>
              </ul>
              <br />
              <strong>После активации станут доступны:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Загрузка новых книг</li>
                <li>Создание и присоединение к клубам</li>
                <li>Проведение сессий чтения</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handlePendingDialogClose} className="w-full">
              Понятно, продолжить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
