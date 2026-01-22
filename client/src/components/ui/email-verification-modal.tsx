import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Mail, AlertCircle } from 'lucide-react';

interface EmailVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EmailVerificationModal({ isOpen, onClose }: EmailVerificationModalProps) {
  if (!isOpen) return null;

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
            Для доступа к этой функции необходимо подтвердить email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-orange-700">
              <Mail className="h-5 w-5" />
              <span className="font-semibold">Активация аккаунта</span>
            </div>
            <p className="text-sm text-orange-600">
              Ваш аккаунт активирован администратором, но email не подтвержден.
            </p>
            <p className="text-sm text-orange-600">
              Для доступа к загрузке книг и созданию клубов необходимо подтвердить email адрес.
            </p>
          </div>
          
          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              Обратитесь к администратору для решения этой проблемы или проверьте почту на наличие письма с подтверждением.
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