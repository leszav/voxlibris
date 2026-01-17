import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function AccountActivationBanner() {
  const { user } = useAuth();

  // Показываем баннер только для пользователей со статусом pending
  if (user?.status !== 'pending') {
    return null;
  }

  return (
    <Alert variant="default" className="mb-6 border-yellow-500 bg-yellow-50">
      <Clock className="h-5 w-5 text-yellow-600" />
      <AlertTitle className="text-yellow-900 font-semibold">
        Требуется активация аккаунта
      </AlertTitle>
      <AlertDescription className="text-yellow-800">
        Ваш аккаунт ожидает активации администратором. 
        Вы можете просматривать контент, но создание клубов и загрузка книг будут доступны после активации.
      </AlertDescription>
    </Alert>
  );
}
