import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { RegistrationSuccessModal } from '@/components/ui/registration-success-modal';
import { RegistrationErrorModal } from '@/components/ui/registration-error-modal';
import { Mic, Eye, EyeOff, Check, X } from 'lucide-react';

export default function Register() {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [, setLocation] = useLocation();
  const { register } = useAuth();
  const [inviteToken, setInviteToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    try {
      const params = new URLSearchParams(globalThis.location?.search ?? '');
      const invite = params.get('invite') || undefined;
      setInviteToken(invite || undefined);
    } catch {
      // Ignore URL parsing errors
    }
  }, []);

  const passwordRequirements = {
    length: password.length >= 8,
    match: password === confirmPassword && password.length > 0,
  };
  const isEmailValid = emailRegex.test(email.trim());

  const isFormValid = username && email && password && confirmPassword && 
    passwordRequirements.length && passwordRequirements.match && isEmailValid;

  const parseRegisterError = (error: unknown): string => {
    if (!(error instanceof Error)) {
      return "Не удалось создать аккаунт";
    }

    try {
      const errorData = JSON.parse(error.message);
      if (errorData.errors && Array.isArray(errorData.errors)) {
        const passwordError = errorData.errors.find((err: { path?: string[] }) =>
          err.path?.includes('password')
        );
        if (passwordError) {
          return "Ошибка валидации данных. Пароль должен содержать только латинские буквы, цифры и спецсимволы.";
        }
        return errorData.message || "Ошибка валидации данных";
      }
      return errorData.message || error.message;
    } catch {
      return error.message;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setIsLoading(true);
    try {
      await register(username.trim(), email.trim().toLowerCase(), password, rememberMe, inviteToken);
      setShowSuccessModal(true);
    } catch (error) {
      setErrorMessage(parseRegisterError(error));
      setShowErrorModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    setLocation('/');
  };

  const handleCloseErrorModal = () => {
    setShowErrorModal(false);
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 font-serif text-2xl font-bold text-primary">
            <Mic className="h-6 w-6 text-accent" />
            <span>VoxLibris</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Создайте аккаунт для участия в книжных клубах
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Регистрация</CardTitle>
            <CardDescription>
              Заполните форму для создания нового аккаунта
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Имя пользователя</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Ваше имя в системе"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                {email && !isEmailValid && (
                  <p className="text-sm text-red-600">Укажите корректный email</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Создайте пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
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
                <Label htmlFor="confirmPassword">Подтвердите пароль</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Повторите пароль"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
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

              {/* Password Requirements */}
              {password && (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    {passwordRequirements.length ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <X className="h-4 w-4 text-red-500" />
                    )}
                    <span className={passwordRequirements.length ? "text-green-600" : "text-red-600"}>
                      Минимум 8 символов
                    </span>
                  </div>
                  {confirmPassword && (
                    <div className="flex items-center gap-2">
                      {passwordRequirements.match ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <X className="h-4 w-4 text-red-500" />
                      )}
                      <span className={passwordRequirements.match ? "text-green-600" : "text-red-600"}>
                        Пароли совпадают
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center space-x-2">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                />
                <Label 
                  htmlFor="remember-me" 
                  className="text-sm font-normal cursor-pointer select-none"
                >
                  Запомнить меня на 30 дней
                </Label>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading || !isFormValid}
              >
                {isLoading ? "Создаем аккаунт..." : "Создать аккаунт"}
              </Button>
            </form>

            <div className="mt-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Уже есть аккаунт?{' '}
                <Link href="/auth/login" className="text-primary hover:underline font-medium">
                  Войти
                </Link>
              </p>
              <Link href="/" className="text-sm text-muted-foreground hover:text-primary">
                ← Вернуться на главную
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <RegistrationSuccessModal 
        isOpen={showSuccessModal}
        onClose={handleCloseSuccessModal}
        email={email}
      />
      
      <RegistrationErrorModal 
        isOpen={showErrorModal}
        onClose={handleCloseErrorModal}
        error={errorMessage}
      />
    </div>
  );
}
