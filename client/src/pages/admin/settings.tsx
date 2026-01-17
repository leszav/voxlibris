import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Settings, 
  Shield,
  Server,
  Database,
  Globe,
  AlertTriangle,
  Save,
  RefreshCw
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as React from "react";

type HealthStatus = 'healthy' | 'warning' | 'error';

interface SystemSettings {
  general: {
    platform_name: string;
    platform_description: string;
    max_clubs_per_user: number;
    max_books_per_club: number;
    max_participants_per_club: number;
    maintenance_mode: boolean;
    registration_enabled: boolean;
  };
  security: {
    require_email_verification: boolean;
    max_login_attempts: number;
    session_timeout_hours: number;
    password_min_length: number;
    require_2fa_for_admins: boolean;
    allowed_file_types: string[];
    max_file_size_mb: number;
  };
  notifications: {
    email_notifications: boolean;
    admin_email: string;
    smtp_host: string;
    smtp_port: number;
    smtp_user: string;
    smtp_enabled: boolean;
  };
  moderation: {
    auto_moderation_enabled: boolean;
    require_book_approval: boolean;
    require_club_approval: boolean;
    spam_detection_enabled: boolean;
    profanity_filter_enabled: boolean;
  };
}

interface SystemHealth {
  database: {
    status: HealthStatus;
    connections: number;
    max_connections: number;
    uptime: string;
  };
  server: {
    status: HealthStatus;
    cpu_usage: number;
    memory_usage: number;
    disk_usage: number;
    uptime: string;
  };
  services: {
    auth_service: boolean;
    file_storage: boolean;
    email_service: boolean;
    background_jobs: boolean;
  };
}

async function fetchSystemSettings(): Promise<SystemSettings> {
  const token = localStorage.getItem('accessToken');
  if (!token) throw new Error('No auth token');

  const response = await fetch('/api/v1/admin/settings', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch system settings');
  }

  return response.json();
}

async function updateSystemSettings(settings: Partial<SystemSettings>): Promise<void> {
  const token = localStorage.getItem('accessToken');
  if (!token) throw new Error('No auth token');

  const response = await fetch('/api/v1/admin/settings', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error('Failed to update system settings');
  }
}

async function fetchSystemHealth(): Promise<SystemHealth> {
  const token = localStorage.getItem('accessToken');
  if (!token) throw new Error('No auth token');

  const response = await fetch('/api/v1/admin/system/health', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch system health');
  }

  return response.json();
}

function StatusBadge({ status }: { readonly status: HealthStatus }) {
  switch (status) {
    case 'healthy':
      return (
        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
          Работает
        </Badge>
      );
    case 'warning':
      return (
        <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          Предупреждение
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">
          Ошибка
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function GeneralSettings({ settings, onUpdate }: {
  readonly settings: SystemSettings['general'];
  readonly onUpdate: (updates: Partial<SystemSettings['general']>) => void;
}) {
  const [localSettings, setLocalSettings] = useState(settings || {
    platform_name: '',
    platform_description: '',
    max_clubs_per_user: 5,
    max_books_per_club: 10,
    max_participants_per_club: 50,
    maintenance_mode: false,
    registration_enabled: true,
  });

  const handleSave = () => {
    onUpdate(localSettings);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Общие настройки платформы
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="platform_name">Название платформы</Label>
              <Input
                id="platform_name"
                value={localSettings.platform_name}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, platform_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_clubs">Макс. клубов на пользователя</Label>
              <Input
                id="max_clubs"
                type="number"
                value={localSettings.max_clubs_per_user}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, max_clubs_per_user: Number.parseInt(e.target.value) }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="platform_description">Описание платформы</Label>
            <Textarea
              id="platform_description"
              value={localSettings.platform_description}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, platform_description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_books">Макс. книг в клубе</Label>
              <Input
                id="max_books"
                type="number"
                value={localSettings.max_books_per_club}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, max_books_per_club: Number.parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_participants">Макс. участников в клубе</Label>
              <Input
                id="max_participants"
                type="number"
                value={localSettings.max_participants_per_club}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, max_participants_per_club: Number.parseInt(e.target.value) }))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="maintenance_mode">Режим обслуживания</Label>
              <p className="text-sm text-gray-500">Отключает платформу для пользователей</p>
            </div>
            <Switch
              id="maintenance_mode"
              checked={localSettings.maintenance_mode}
              onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, maintenance_mode: checked }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="registration_enabled">Регистрация открыта</Label>
              <p className="text-sm text-gray-500">Разрешить регистрацию новых пользователей</p>
            </div>
            <Switch
              id="registration_enabled"
              checked={localSettings.registration_enabled}
              onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, registration_enabled: checked }))}
            />
          </div>

          <Button onClick={handleSave} className="w-full">
            <Save className="w-4 h-4 mr-2" />
            Сохранить изменения
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SecuritySettings({ settings, onUpdate }: {
  readonly settings: SystemSettings['security'];
  readonly onUpdate: (updates: Partial<SystemSettings['security']>) => void;
}) {
  const [localSettings, setLocalSettings] = useState(settings || {
    require_email_verification: true,
    max_login_attempts: 5,
    session_timeout_hours: 24,
    password_min_length: 8,
    require_2fa_for_admins: false,
    allowed_file_types: ['.epub', '.fb2', '.pdf'],
    max_file_size_mb: 50,
  });

  const handleSave = () => {
    onUpdate(localSettings);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Настройки безопасности
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_login_attempts">Макс. попыток входа</Label>
              <Input
                id="max_login_attempts"
                type="number"
                value={localSettings.max_login_attempts}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, max_login_attempts: Number.parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session_timeout">Таймаут сессии (часы)</Label>
              <Input
                id="session_timeout"
                type="number"
                value={localSettings.session_timeout_hours}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, session_timeout_hours: Number.parseInt(e.target.value) }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="password_min_length">Мин. длина пароля</Label>
              <Input
                id="password_min_length"
                type="number"
                value={localSettings.password_min_length}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, password_min_length: Number.parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_file_size">Макс. размер файла (МБ)</Label>
              <Input
                id="max_file_size"
                type="number"
                value={localSettings.max_file_size_mb}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, max_file_size_mb: Number.parseInt(e.target.value) }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="allowed_file_types">Разрешенные типы файлов</Label>
            <Input
              id="allowed_file_types"
              value={localSettings.allowed_file_types.join(', ')}
              onChange={(e) => setLocalSettings(prev => ({ 
                ...prev, 
                allowed_file_types: e.target.value.split(',').map(s => s.trim()) 
              }))}
              placeholder=".epub, .fb2, .pdf"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="require_email_verification">Требовать подтверждение email</Label>
              <p className="text-sm text-gray-500">Новые пользователи должны подтвердить email</p>
            </div>
            <Switch
              id="require_email_verification"
              checked={localSettings.require_email_verification}
              onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, require_email_verification: checked }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="require_2fa_for_admins">2FA для администраторов</Label>
              <p className="text-sm text-gray-500">Требовать двухфакторную аутентификацию для админов</p>
            </div>
            <Switch
              id="require_2fa_for_admins"
              checked={localSettings.require_2fa_for_admins}
              onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, require_2fa_for_admins: checked }))}
            />
          </div>

          <Button onClick={handleSave} className="w-full">
            <Save className="w-4 h-4 mr-2" />
            Сохранить настройки безопасности
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SystemMonitoring({ health, isLoading, error }: { 
  readonly health?: SystemHealth;
  readonly isLoading?: boolean;
  readonly error?: Error | null;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <RefreshCw className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-500">Загрузка информации о системе...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 font-semibold">Ошибка загрузки данных мониторинга</p>
            <p className="text-gray-500 mt-2 text-sm">{error.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!health) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <Server className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Нет данных о системе</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            База данных
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Статус</p>
              <StatusBadge status={health.database.status} />
            </div>
            <div>
              <p className="text-sm text-gray-600">Соединения</p>
              <p className="text-lg font-semibold">{health.database.connections}/{health.database.max_connections}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Время работы</p>
              <p className="text-lg font-semibold">{health.database.uptime}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Сервер
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Статус</p>
              <StatusBadge status={health.server.status} />
            </div>
            <div>
              <p className="text-sm text-gray-600">CPU</p>
              <p className="text-lg font-semibold">{health.server.cpu_usage}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Память</p>
              <p className="text-lg font-semibold">{health.server.memory_usage}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Диск</p>
              <p className="text-lg font-semibold">{health.server.disk_usage}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Сервисы
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Аутентификация</span>
              <StatusBadge status={health.services.auth_service ? 'healthy' : 'error'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Файловое хранилище</span>
              <StatusBadge status={health.services.file_storage ? 'healthy' : 'error'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Email сервис</span>
              <StatusBadge status={health.services.email_service ? 'healthy' : 'error'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Фоновые задачи</span>
              <StatusBadge status={health.services.background_jobs ? 'healthy' : 'error'} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// SMTP Settings Component
function SMTPSettings() {
  const [localSettings, setLocalSettings] = useState({
    host: '',
    port: '587',
    user: '',
    password: '',
    from: '',
    secure: false,
    enabled: false,
  });
  const [testEmail, setTestEmail] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const queryClient = useQueryClient();

  // Загрузка текущих настроек
  const { data: smtpData, isLoading } = useQuery({
    queryKey: ['smtp-settings'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/admin/settings/smtp', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch SMTP settings');
      const data = await response.json();
      return data.settings;
    },
  });

  // Обновление локального состояния при загрузке данных
  React.useEffect(() => {
    if (smtpData) {
      setLocalSettings({
        host: smtpData['smtp.host'] || '',
        port: smtpData['smtp.port'] || '587',
        user: smtpData['smtp.user'] || '',
        password: smtpData['smtp.password'] || '',
        from: smtpData['smtp.from'] || '',
        secure: smtpData['smtp.secure'] === 'true',
        enabled: smtpData['smtp.enabled'] === 'true',
      });
    }
  }, [smtpData]);

  // Мутация для сохранения настроек
  const saveMutation = useMutation({
    mutationFn: async (settings: typeof localSettings) => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/admin/settings/smtp', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error('Failed to save SMTP settings');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smtp-settings'] });
      alert('SMTP настройки успешно сохранены');
    },
    onError: (error: Error) => {
      alert(`Ошибка: ${error.message}`);
    },
  });

  // Функция отправки тестового письма
  const handleTestEmail = async () => {
    if (!testEmail) {
      alert('Введите email для теста');
      return;
    }

    setIsTesting(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/admin/settings/smtp/test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ testEmail }),
      });

      const data = await response.json();
      if (data.success) {
        alert(`Тестовое письмо отправлено на ${testEmail}`);
      } else {
        alert(`Ошибка: ${data.message}`);
      }
    } catch (error: any) {
      alert(`Ошибка отправки: ${error.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    saveMutation.mutate(localSettings);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Загрузка настроек SMTP...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Настройки SMTP сервера
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="smtp_enabled">Включить SMTP</Label>
              <p className="text-sm text-gray-500">Активировать отправку email через SMTP</p>
            </div>
            <Switch
              id="smtp_enabled"
              checked={localSettings.enabled}
              onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, enabled: checked }))}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_host">Хост SMTP сервера *</Label>
              <Input
                id="smtp_host"
                placeholder="mail.yourdomain.com"
                value={localSettings.host}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, host: e.target.value }))}
              />
              <p className="text-xs text-gray-500">Например: mail.yourdomain.com или smtp.gmail.com</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp_port">Порт *</Label>
              <Input
                id="smtp_port"
                type="number"
                placeholder="587"
                value={localSettings.port}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, port: e.target.value }))}
              />
              <p className="text-xs text-gray-500">587 (STARTTLS) или 465 (SSL)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_user">Имя пользователя</Label>
              <Input
                id="smtp_user"
                placeholder="noreply@yourdomain.com"
                value={localSettings.user}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, user: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp_password">Пароль</Label>
              <Input
                id="smtp_password"
                type="password"
                placeholder="********"
                value={localSettings.password}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, password: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp_from">От кого (From email) *</Label>
            <Input
              id="smtp_from"
              placeholder="noreply@xlibris.com"
              value={localSettings.from}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, from: e.target.value }))}
            />
            <p className="text-xs text-gray-500">Email адрес отправителя для всех писем</p>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="smtp_secure">Использовать SSL/TLS</Label>
              <p className="text-sm text-gray-500">Шифрованное подключение (порт 465)</p>
            </div>
            <Switch
              id="smtp_secure"
              checked={localSettings.secure}
              onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, secure: checked }))}
            />
          </div>

          <Button 
            onClick={handleSave} 
            className="w-full" 
            disabled={saveMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? 'Сохранение...' : 'Сохранить настройки'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Тестовая отправка
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Отправьте тестовое письмо для проверки правильности настройки SMTP
          </p>
          
          <div className="flex gap-2">
            <Input
              placeholder="test@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              type="email"
            />
            <Button 
              onClick={handleTestEmail} 
              disabled={isTesting || !localSettings.enabled}
            >
              {isTesting ? 'Отправка...' : 'Отправить'}
            </Button>
          </div>

          {!localSettings.enabled && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 text-yellow-800 rounded-lg">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">SMTP отключен. Включите SMTP для отправки тестового письма.</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Настройка DNS записей</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">
            Для правильной доставки писем настройте следующие DNS записи:
          </p>
          
          <div className="space-y-2 bg-gray-50 p-4 rounded-lg font-mono text-xs">
            <div>
              <span className="text-gray-600">MX запись:</span><br/>
              <span className="text-gray-900">@ 10 mail.yourdomain.com</span>
            </div>
            <div>
              <span className="text-gray-600">SPF запись (TXT):</span><br/>
              <span className="text-gray-900">@ "v=spf1 ip4:YOUR_VDS_IP ~all"</span>
            </div>
            <div>
              <span className="text-gray-600">DMARC запись (TXT):</span><br/>
              <span className="text-gray-900">_dmarc "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com"</span>
            </div>
            <div>
              <span className="text-gray-600">DKIM запись (TXT):</span><br/>
              <span className="text-gray-900">default._domainkey [your_dkim_public_key]</span>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Проверьте настройки на <a href="https://www.mail-tester.com/" target="_blank" rel="noopener" className="text-blue-600 underline">mail-tester.com</a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery<SystemSettings>({
    queryKey: ['admin-settings'],
    queryFn: fetchSystemSettings,
  });

  const { data: health, isLoading: healthLoading, error: healthError } = useQuery<SystemHealth>({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
    refetchInterval: 30000, // Обновляем каждые 30 секунд
  });

  const updateSettingsMutation = useMutation({
    mutationFn: updateSystemSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
  });

  const handleUpdateSettings = (updates: Partial<SystemSettings>) => {
    updateSettingsMutation.mutate(updates);
  };

  if (settingsLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Загрузка настроек...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!settings) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">Ошибка загрузки</h3>
            <p className="text-gray-600 mt-2">Не удалось загрузить настройки системы</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Системные настройки</h1>
          <p className="text-gray-600 mt-2">Управление конфигурацией и мониторинг системы</p>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">Общие</TabsTrigger>
            <TabsTrigger value="security">Безопасность</TabsTrigger>
            <TabsTrigger value="smtp">SMTP</TabsTrigger>
            <TabsTrigger value="monitoring">Мониторинг</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <GeneralSettings 
              settings={settings.general} 
              onUpdate={(updates) => handleUpdateSettings({ general: { ...settings.general, ...updates } })}
            />
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <SecuritySettings 
              settings={settings.security} 
              onUpdate={(updates) => handleUpdateSettings({ security: { ...settings.security, ...updates } })}
            />
          </TabsContent>

          <TabsContent value="smtp" className="space-y-6">
            <SMTPSettings />
          </TabsContent>

          <TabsContent value="monitoring" className="space-y-6">
            <SystemMonitoring health={health} isLoading={healthLoading} error={healthError} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}