import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertCircle, Plus } from "lucide-react";
import { useClubs } from "@/hooks/use-clubs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PersonalUploadWizard } from "./personal-upload-wizard";
import { ClubUploadWizard } from "./club-upload-wizard";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface VoxLibrisUploadProps {
  readonly onSuccess?: () => void;
  // Контекст загрузки: 'personal' для личной библиотеки, 'club' для клубной
  readonly defaultContext?: 'personal' | 'club';
  readonly clubId?: string;
  // Кастомизация кнопки
  readonly buttonText?: string;
  readonly buttonVariant?: 'default' | 'outline' | 'ghost';
}

export function VoxLibrisUpload({ 
  onSuccess, 
  defaultContext = 'personal', 
  clubId,
  buttonText,
  buttonVariant = 'default'
}: VoxLibrisUploadProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Используем контекст напрямую, без промежуточного выбора
  const scenario = defaultContext;
  const [selectedClubId, setSelectedClubId] = useState<string>(clubId || '');

  const { user } = useAuth();
  const { data: clubs = [] } = useClubs();

  // Проверка авторизации (проверка статуса происходит на бэкенде)
  const isAuthenticated = !!user;

  const handleClose = () => {
    setIsOpen(false);
    // Reset club selection after closing
    setTimeout(() => {
      setSelectedClubId(clubId || '');
    }, 300);
  };

  const handleSuccess = () => {
    handleClose();
    onSuccess?.();
  };

  // Отображение сообщения для неавторизованных пользователей
  const renderUnauthorizedMessage = () => {
    return (
      <div className="space-y-4">
        <Alert variant="default" className="border-yellow-200 bg-yellow-50">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <p className="font-semibold mb-2">Требуется авторизация</p>
            <p>Для загрузки книг необходимо войти в систему.</p>
          </AlertDescription>
        </Alert>
        <div className="flex justify-end">
          <Button onClick={handleClose}>Закрыть</Button>
        </div>
      </div>
    );
  };

  // Экран выбора сценария больше не нужен - контекст определяется автоматически

  const renderClubSelection = () => {
    // Если clubId задан явно, сразу переходим к мастеру
    if (clubId) {
      return <ClubUploadWizard clubId={clubId} onSuccess={handleSuccess} onCancel={handleClose} />;
    }

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Выберите клуб</h3>
          <p className="text-sm text-muted-foreground">
            В какой клуб вы хотите добавить книгу?
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Ваши клубы</Label>
            <Select value={selectedClubId} onValueChange={setSelectedClubId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите клуб..." />
              </SelectTrigger>
              <SelectContent>
                {clubs.map((club) => (
                  <SelectItem key={club.id} value={club.id}>
                    {club.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-4">
            <Button
              disabled={!selectedClubId}
              onClick={() => { }} // State is already set, just re-render will show wizard
            >
              Продолжить
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={buttonVariant}>
          <Plus className="w-4 h-4 mr-2" />
          {buttonText || 'Загрузить книгу'}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {scenario === 'personal' ? 'Загрузка книги в личную библиотеку' : 'Загрузка книги для клуба'}
          </DialogTitle>
          <DialogDescription>
            {scenario === 'personal' 
              ? 'Книга будет доступна только вам для индивидуального чтения'
              : 'Книга будет доступна всем участникам клуба'}
          </DialogDescription>
        </DialogHeader>

        {(() => {
          // Неавторизованный пользователь
          if (!isAuthenticated) {
            return renderUnauthorizedMessage();
          }
          
          // Личная загрузка
          if (scenario === 'personal') {
            return (
              <PersonalUploadWizard
                onSuccess={handleSuccess}
                onCancel={handleClose}
              />
            );
          }
          
          // Клубная загрузка
          if (scenario === 'club') {
            // Выбор клуба
            if (!selectedClubId) {
              return renderClubSelection();
            }
            
            // Загрузка в конкретный клуб
            return (
              <ClubUploadWizard
                clubId={selectedClubId}
                onSuccess={handleSuccess}
                onCancel={() => {
                  if (clubId) handleClose();
                  else setSelectedClubId('');
                }}
              />
            );
          }
          
          return null;
        })()}
      </DialogContent>
    </Dialog>
  );
}