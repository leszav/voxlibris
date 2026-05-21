import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePrivacySettings, useUpdatePrivacySettings } from '@/hooks/use-social';
import type { PrivacySettings } from '@/api/social';

const PRIVACY_SETTINGS_SKELETON_ROWS = [
  'privacy-skeleton-1',
  'privacy-skeleton-2',
  'privacy-skeleton-3',
  'privacy-skeleton-4',
  'privacy-skeleton-5',
] as const;

/**
 * Панель настроек приватности пользователя.
 * Отображает переключатели и селекты для управления видимостью профиля.
 */
export function PrivacySettingsPanel() {
  const { data: settings, isLoading } = usePrivacySettings();
  const update = useUpdatePrivacySettings();

  function patch(updates: Partial<Omit<PrivacySettings, 'userId' | 'updatedAt'>>) {
    update.mutate(updates);
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {PRIVACY_SETTINGS_SKELETON_ROWS.map((rowId) => (
          <Skeleton key={rowId} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="space-y-6">
      {/* Видимость профиля */}
      <div className="space-y-1.5">
        <Label>Видимость профиля</Label>
        <Select
          value={settings.profileVisibility}
          onValueChange={(v: PrivacySettings['profileVisibility']) =>
            patch({ profileVisibility: v })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Публичный</SelectItem>
            <SelectItem value="followers">Только подписчики</SelectItem>
            <SelectItem value="private">Приватный</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Личные сообщения */}
      <div className="space-y-1.5">
        <Label>Личные сообщения от</Label>
        <Select
          value={settings.allowDmFrom}
          onValueChange={(v: PrivacySettings['allowDmFrom']) =>
            patch({ allowDmFrom: v })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="everyone">Всех</SelectItem>
            <SelectItem value="followers">Подписчиков</SelectItem>
            <SelectItem value="nobody">Никого</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Булевые переключатели */}
      <div className="space-y-4">
        <SwitchRow
          id="reading-stats"
          label="Статистика чтения"
          description="Разрешить другим видеть прочитанные книги и время чтения"
          checked={settings.readingStatsVisible}
          onCheckedChange={(v) => patch({ readingStatsVisible: v })}
        />
        <SwitchRow
          id="clubs-visible"
          label="Клубы"
          description="Показывать список клубов на странице профиля"
          checked={settings.clubsVisible}
          onCheckedChange={(v) => patch({ clubsVisible: v })}
        />
        <SwitchRow
          id="reading-history"
          label="История чтения"
          description="Разрешить видеть историю прослушанных книг"
          checked={settings.readingHistoryVisible}
          onCheckedChange={(v) => patch({ readingHistoryVisible: v })}
        />
      </div>
    </div>
  );
}

interface SwitchRowProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}

function SwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: Readonly<SwitchRowProps>) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
