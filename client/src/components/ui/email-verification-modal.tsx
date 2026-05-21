import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Mail, AlertCircle, CheckCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

interface EmailVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EmailVerificationModal({ isOpen, onClose }: EmailVerificationModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isResending, setIsResending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  if (!isOpen) return null;

  const handleResendEmail = async () => {
    if (!user?.id) return;

    setIsResending(true);
    try {
      await apiRequest('/api/auth/resend-confirmation', {
        method: 'POST',
        body: JSON.stringify({ userId: user.id }),
      });

      setEmailSent(true);
      toast({
        title: 'Письмо отправлено',
        description: 'Проверьте почту и перейдите по ссылке для подтверждения',
      });
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: error instanceof Error ? error.message : 'Не удалось отправить письмо',
        variant: 'destructive',
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <AlertCircle className="h-16 w-16 text-orange-500" />
          </div>
          <CardTitle className="text-2xl font-bold text-orange-700">
            Требуется подтверждение email
          </CardTitle>
          <CardDescription className="text-base">
            Для доступа к функциям платформы необходимо подтвердить email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-orange-700">
              <Mail className="h-5 w-5" />
              <span className="font-semibold">Активация аккаунта</span>
            </div>
            <p className="text-sm text-orange-600">
              Ваш аккаунт зарегистрирован, но email не подтвержден.
            </p>
            <p className="text-sm text-orange-600">
              Без подтверждения email недоступны:
            </p>
            <ul className="text-sm text-orange-600 list-disc list-inside space-y-1">
              <li>Создание и вступление в клубы</li>
              <li>Загрузка книг</li>
              <li>Создание сессий чтения</li>
              <li>Личные сообщения</li>
            </ul>
          </div>

          {emailSent ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-5 w-5" />
                <span className="font-semibold">Письмо отправлено!</span>
              </div>
              <p className="text-sm text-green-600">
                Проверьте почту (включая папку "Спам") и перейдите по ссылке для подтверждения.
              </p>
            </div>
          ) : (
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Проверьте почту на наличие письма с подтверждением.
              </p>
              <p className="text-xs text-muted-foreground">
                Не получили письмо? Проверьте папку "Спам" или запросите повторную отправку.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            {!emailSent && (
              <Button
                onClick={handleResendEmail}
                disabled={isResending}
                variant="outline"
                className="flex-1"
              >
                {isResending ? 'Отправка...' : 'Отправить повторно'}
              </Button>
            )}
            <Button onClick={onClose} className="flex-1">
              Понятно
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
