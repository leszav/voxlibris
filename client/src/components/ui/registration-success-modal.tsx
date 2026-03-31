import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CheckCircle, Mail } from 'lucide-react';

interface RegistrationSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
}

export function RegistrationSuccessModal({ isOpen, onClose, email }: RegistrationSuccessModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="mx-4 max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <CardTitle className="text-2xl font-bold text-green-700">
            Регистрация успешна!
          </CardTitle>
          <CardDescription className="text-base">
            Добро пожаловать в VoxLibris
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-blue-700">
              <Mail className="h-5 w-5" />
              <span className="font-semibold">Активация аккаунта</span>
            </div>
            <p className="text-sm text-blue-600">
              Мы отправили письмо с подтверждением на адрес:
            </p>
            <p className="break-all rounded border bg-white px-3 py-2 font-mono text-sm">
              {email}
            </p>
            <p className="text-sm text-blue-600">
              Пожалуйста, проверьте почту и перейдите по ссылке для активации аккаунта.
            </p>
          </div>
          
          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              Не получили письмо? Проверьте папку "Спам" или обратитесь в поддержку.
            </p>
          </div>
          
          <Button 
            onClick={onClose} 
            className="w-full"
            size="lg"
          >
            Понятно
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
