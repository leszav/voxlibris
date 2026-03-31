import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

interface RegistrationErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  error: string;
}

export function RegistrationErrorModal({ isOpen, onClose, error }: RegistrationErrorModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="mx-4 max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <AlertCircle className="h-16 w-16 text-red-500" />
          </div>
          <CardTitle className="text-2xl font-bold text-red-700">
            Ошибка регистрации
          </CardTitle>
          <CardDescription className="text-base">
            Не удалось создать аккаунт
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700">
              {error}
            </p>
          </div>
          
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Проверьте правильность введенных данных и попробуйте снова.
            </p>
          </div>
          
          <Button 
            onClick={onClose} 
            className="w-full"
            size="lg"
            variant="destructive"
          >
            Попробовать снова
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
