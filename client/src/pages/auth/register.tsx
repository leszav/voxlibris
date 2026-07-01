import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { RegistrationErrorModal } from '@/components/ui/registration-error-modal';
import { Mic, Eye, EyeOff, Check, X } from 'lucide-react';

export default function Register() {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Display name: allow Cyrillic/Latin letters, digits, spaces, _ and -
  const displayNameRegex = /^[\p{L}\p{N}][\p{L}\p{N}_\- ]{0,48}[\p{L}\p{N}]$/u;
  // Password: allow only A-Za-z0-9 and ASCII special characters
  const passwordAllowedCharsRegex = /^[A-Za-z0-9!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]*$/;
  
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [, setLocation] = useLocation();
  const { register } = useAuth();
  const [inviteToken, setInviteToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    try {
      const params = new URLSearchParams(globalThis.location?.search ?? '');
      const invite = params.get('invite') || undefined;
      const inviteEmail = params.get('email') || '';
      setInviteToken(invite || undefined);
      if (inviteEmail) {
        setEmail(inviteEmail.trim().toLowerCase());
      }
    } catch {
      // Ignore URL parsing errors
    }
  }, []);

  // Функция оценки сложности пароля
  const calculatePasswordStrength = (pwd: string): 'weak' | 'medium' | 'strong' => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++; // mixed case
    if (/\d/.test(pwd)) score++; // digit
    if (/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(pwd)) score++; // special char
    
    if (score >= 4) return 'strong';
    if (score >= 2) return 'medium';
    return 'weak';
  };

  const passwordStrength = password.length > 0 ? calculatePasswordStrength(password) : null;

  const passwordRequirements = {
    length: password.length >= 8,
    hasLetter: /[A-Za-z]/.test(password),
    hasDigit: /\d/.test(password),
    match: password === confirmPassword && password.length > 0,
    validChars: passwordAllowedCharsRegex.test(password),
  };
  const isEmailValid = emailRegex.test(email.trim());
  const normalizedDisplayName = displayName.trim().replace(/\s+/gu, ' ');
  const isDisplayNameValid = displayNameRegex.test(normalizedDisplayName);
  
  const isPasswordValid = passwordRequirements.length && 
                          passwordRequirements.hasLetter && 
                          passwordRequirements.hasDigit && 
                          passwordRequirements.validChars;
  
  const isFormValid = normalizedDisplayName && email && password && confirmPassword && 
    isPasswordValid && passwordRequirements.match && isEmailValid && isDisplayNameValid;

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
      await register(normalizedDisplayName, email.trim().toLowerCase(), password, rememberMe, inviteToken);
      const pendingInvitation = sessionStorage.getItem('pendingInvitation');
      if (pendingInvitation) {
        sessionStorage.removeItem('pendingInvitation');
        try {
          const parsed = JSON.parse(pendingInvitation) as { clubId?: string; token?: string };
          if (parsed.clubId && (!inviteToken || parsed.token === inviteToken)) {
            setLocation(`/clubs/${parsed.clubId}`);
            return;
          }
        } catch {
          // Если сохранённый редирект повреждён, используем обычный маршрут.
        }
      }
      setLocation('/');
    } catch (error) {
      setErrorMessage(parseRegisterError(error));
      setShowErrorModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!passwordAllowedCharsRegex.test(value)) {
      setPasswordError('Недопустимые символы. Используйте латинские буквы, цифры и спецсимволы');
      return;
    }
    setPasswordError('');
    setPassword(value);
  };

  const handleCloseErrorModal = () => {
    setShowErrorModal(false);
    setErrorMessage('');
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
                <Label htmlFor="displayName">Имя</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="Например: Вася Пупкин"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  autoComplete="name"
                />
                {displayName && !isDisplayNameValid && (
                  <p className="text-sm text-red-600">
                    Можно буквы (в т.ч. кириллицу), цифры, пробелы, _ и -. От 2 до 50 символов.
                  </p>
                )}
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
                    onChange={handlePasswordChange}
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
                {passwordError && (
                  <p className="text-sm text-red-600">{passwordError}</p>
                )}
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
                  <div className="flex items-center gap-2">
                    {passwordRequirements.hasLetter ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <X className="h-4 w-4 text-red-500" />
                    )}
                    <span className={passwordRequirements.hasLetter ? "text-green-600" : "text-red-600"}>
                      Содержит буквы
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordRequirements.hasDigit ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <X className="h-4 w-4 text-red-500" />
                    )}
                    <span className={passwordRequirements.hasDigit ? "text-green-600" : "text-red-600"}>
                      Содержит цифры
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordRequirements.validChars ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <X className="h-4 w-4 text-red-500" />
                    )}
                    <span className={passwordRequirements.validChars ? "text-green-600" : "text-red-600"}>
                      Только латинские буквы, цифры и спецсимволы
                    </span>
                  </div>
                  {passwordStrength && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                      <span className="text-muted-foreground">Сложность пароля:</span>
                      <span className={
                        passwordStrength === 'strong' ? 'text-green-600 font-medium' :
                        passwordStrength === 'medium' ? 'text-yellow-600 font-medium' :
                        'text-red-600 font-medium'
                      }>
                        {passwordStrength === 'strong' ? 'Надёжный' :
                         passwordStrength === 'medium' ? 'Средний' : 'Слабый'}
                      </span>
                    </div>
                  )}
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
      
      <RegistrationErrorModal 
        isOpen={showErrorModal}
        onClose={handleCloseErrorModal}
        error={errorMessage}
      />
    </div>
  );
}
