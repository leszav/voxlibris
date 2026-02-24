import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { AdminLayout } from "../../components/layout/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import { Loader2, TrendingUp, Users, BookOpen, Clock, ArrowUpDown, Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  FunnelChart,
  Funnel,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { BookAnalyticsModal } from "@/components/admin/BookAnalyticsModal";
import { ActivityHeatmap } from "@/components/admin/ActivityHeatmap";
import { ClubAnalyticsModal } from "@/components/admin/ClubAnalyticsModal";
import { UserAnalyticsModal } from "@/components/admin/UserAnalyticsModal";

interface AnalyticsStats {
  period: string;
  totalEvents: number;
  eventsByType: Array<{ eventType: string; count: number }>;
  topBooks: Array<{ bookId: string; title: string; author: string; events: number }>;
  topUsers: Array<{ userId: string; username: string; events: number }>;
  clubStats: Array<{
    clubId: string;
    clubTitle: string;
    totalEvents: number;
    joinEvents: number;
    leaveEvents: number;
    totalSessions: number;
    activeMembers: number;
    lastActivityAt: string | null;
  }>;
  avgReadingTime: number;
  eventsTrend: Array<{ date: string; count: number }>;
  funnel: Array<{ stage: string; count: number; percentage: number }>;
}

interface HeatmapResponse {
  period: string;
  heatmap: Array<{ day: number; hour: number; count: number }>;
}

interface DeviceStatsResponse {
  period: string;
  totalUserAgentEvents: number;
  deviceType: {
    desktop: number;
    mobile: number;
    tablet: number;
    unknown: number;
  };
  browsers: Array<{ name: string; count: number }>;
  os: Array<{ name: string; count: number }>;
}

interface UserJourneyStatsResponse {
  period: string;
  usersWithFirstRead: number;
  usersWithoutRead: number;
  avgDaysToFirstRead: number;
  distribution: Array<{ daysRange: string; count: number }>;
}

interface BookAnalyticsExportDetails {
  dailyEvents: Array<{
    date: string;
    [key: string]: string | number;
  }>;
}

interface HeatmapCellExportDetails {
  eventsByType: Array<{ eventType: string; count: number }>;
}

interface UserAnalyticsExportDetails {
  totalBooksStarted: number;
  totalBooksCompleted: number;
  totalReadingTime: number;
  avgSessionDuration: number;
  eventsByType: Array<{ eventType: string; count: number }>;
}

type ClubSortKey = 'totalEvents' | 'activeMembers' | 'totalSessions' | 'lastActivityAt';

interface CsvColumn<T> {
  header: string;
  accessor: (item: T, index: number) => string | number | null | undefined;
}

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState('7d');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedBookTitle, setSelectedBookTitle] = useState<string | undefined>(undefined);
  const [selectedBookAuthor, setSelectedBookAuthor] = useState<string | undefined>(undefined);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [selectedClubTitle, setSelectedClubTitle] = useState<string | undefined>(undefined);
  const [clubModalOpen, setClubModalOpen] = useState(false);
  const [clubSortKey, setClubSortKey] = useState<ClubSortKey>('totalEvents');
  const [clubSortDirection, setClubSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUsername, setSelectedUsername] = useState<string | undefined>(undefined);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [isExportingTopBooks, setIsExportingTopBooks] = useState(false);
  const [isExportingTopUsers, setIsExportingTopUsers] = useState(false);
  const [isExportingHeatmap, setIsExportingHeatmap] = useState(false);

  const { data: stats, isLoading } = useQuery<AnalyticsStats>({
    queryKey: [`/api/v1/analytics/stats`, period],
    queryFn: async () => {
      return apiRequest<AnalyticsStats>(`/api/v1/analytics/stats?period=${period}`);
    },
  });

  const { data: heatmapStats, isLoading: isHeatmapLoading } = useQuery<HeatmapResponse>({
    queryKey: [`/api/v1/analytics/heatmap`, period],
    queryFn: async () => {
      return apiRequest<HeatmapResponse>(`/api/v1/analytics/heatmap?period=${period}`);
    },
  });

  const { data: deviceStats, isLoading: isDeviceStatsLoading } = useQuery<DeviceStatsResponse>({
    queryKey: [`/api/v1/analytics/devices`, period],
    queryFn: async () => {
      return apiRequest<DeviceStatsResponse>(`/api/v1/analytics/devices?period=${period}`);
    },
  });

  const { data: userJourneyStats, isLoading: isUserJourneyLoading } = useQuery<UserJourneyStatsResponse>({
    queryKey: [`/api/v1/analytics/user-journey`, period],
    queryFn: async () => {
      return apiRequest<UserJourneyStatsResponse>(`/api/v1/analytics/user-journey?period=${period}`);
    },
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  // Показываем сообщение если нет данных
  if (!stats || stats.totalEvents === 0) {
    return (
      <AdminLayout>
        <div className="container mx-auto py-8 px-4">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold">Аналитика платформы</h1>
              <p className="text-muted-foreground mt-2">
                Статистика активности пользователей и популярности контента
              </p>
            </div>
            
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Выберите период" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Последние 7 дней</SelectItem>
                <SelectItem value="30d">Последние 30 дней</SelectItem>
                <SelectItem value="90d">Последние 90 дней</SelectItem>
                <SelectItem value="all">За всё время</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <TrendingUp className="h-16 w-16 text-muted-foreground mb-4" />
              <h2 className="text-2xl font-semibold mb-2">Нет данных за выбранный период</h2>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Данные аналитики собираются автоматически при чтении книг в ридере.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 max-w-2xl">
                <h3 className="font-semibold text-blue-900 mb-3">Как начать собирать статистику:</h3>
                <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                  <li>Загрузите книгу в личную библиотеку или клуб</li>
                  <li>Откройте книгу через Reader (кнопка "Читать")</li>
                  <li>Начните чтение - события будут отправляться автоматически каждые 30 секунд</li>
                  <li>Вернитесь на эту страницу через минуту - данные появятся</li>
                </ol>
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <p className="text-xs text-blue-700">
                    <strong>Отслеживаемые события:</strong> открытие книги, начало/завершение главы, 
                    сессии чтения, создание закладок и заметок
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  // Форматируем данные для графиков
  const eventTypeLabels: Record<string, string> = {
    book_open: 'Открытие книги',
    chapter_start: 'Начало главы',
    chapter_complete: 'Завершение главы',
    reading_session: 'Сессия чтения',
    bookmark_create: 'Закладка',
    note_create: 'Заметка',
    book_complete: 'Завершение книги',
    club_join: 'Вступление в клуб',
    club_leave: 'Выход из клуба',
    book_upload: 'Загрузка книги',
  };

  const funnelStageLabels: Record<string, string> = {
    book_open: 'Открыли книгу',
    reading_session: 'Начали читать',
    chapter_complete: 'Завершили главу',
    book_complete: 'Завершили книгу',
  };

  const funnelStageColors: Record<string, string> = {
    book_open: '#3b82f6', // blue-500
    reading_session: '#8b5cf6', // violet-500
    chapter_complete: '#f59e0b', // amber-500
    book_complete: '#10b981', // emerald-500
  };

  const funnelData = (stats?.funnel || []).map((item) => ({
    ...item,
    name: funnelStageLabels[item.stage] || item.stage,
    fill: funnelStageColors[item.stage] || '#8884d8',
  }));

  const deviceTypeLabels: Record<string, string> = {
    desktop: 'Desktop',
    mobile: 'Mobile',
    tablet: 'Tablet',
    unknown: 'Unknown',
  };

  const deviceTypeColors: Record<string, string> = {
    desktop: '#2563eb',
    mobile: '#16a34a',
    tablet: '#f59e0b',
    unknown: '#64748b',
  };

  const deviceTypeData = Object.entries(deviceStats?.deviceType || {}).map(([name, count]) => ({
    name,
    label: deviceTypeLabels[name] || name,
    count: Number(count) || 0,
  }));

  const userJourneyTotalUsers =
    (userJourneyStats?.usersWithFirstRead || 0) + (userJourneyStats?.usersWithoutRead || 0);
  const userJourneyConversionRate =
    userJourneyTotalUsers > 0
      ? Math.round(((userJourneyStats?.usersWithFirstRead || 0) / userJourneyTotalUsers) * 1000) / 10
      : 0;
  const userJourneyDropoffRate = userJourneyTotalUsers > 0 ? Math.max(0, 100 - userJourneyConversionRate) : 0;

  const dayLabelsLong = [
    'Воскресенье',
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота',
  ];

  const toggleClubSort = (key: ClubSortKey) => {
    if (clubSortKey === key) {
      setClubSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setClubSortKey(key);
    setClubSortDirection('desc');
  };

  const sortedClubStats = (() => {
    const items = [...(stats?.clubStats || [])];
    items.sort((a, b) => {
      let left = 0;
      let right = 0;

      if (clubSortKey === 'lastActivityAt') {
        left = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
        right = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      } else if (clubSortKey === 'totalEvents') {
        left = a.totalEvents;
        right = b.totalEvents;
      } else if (clubSortKey === 'activeMembers') {
        left = a.activeMembers;
        right = b.activeMembers;
      } else if (clubSortKey === 'totalSessions') {
        left = a.totalSessions;
        right = b.totalSessions;
      }

      if (left === right) {
        return a.clubTitle.localeCompare(b.clubTitle, 'ru');
      }

      return clubSortDirection === 'asc' ? left - right : right - left;
    });
    return items;
  })();

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}ч ${minutes}м`;
    }
    return `${minutes}м`;
  };

  const escapeCsvValue = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    const escaped = str.replace(/"/g, '""');
    if (/[;"\n\r]/.test(escaped)) {
      return `"${escaped}"`;
    }
    return escaped;
  };

  const downloadCsv = <T,>(filename: string, rows: T[], columns: CsvColumn<T>[]) => {
    const headerLine = columns.map((col) => escapeCsvValue(col.header)).join(';');
    const lines = rows.map((row, index) =>
      columns.map((col) => escapeCsvValue(col.accessor(row, index))).join(';')
    );
    const csv = [headerLine, ...lines].join('\n');

    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getCsvFileName = (baseName: string) => {
    const date = new Date().toISOString().slice(0, 10);
    return `${baseName}-${period}-${date}.csv`;
  };

  const detailedEventTypes = Object.keys(eventTypeLabels);

  const buildEventsMap = (items: Array<{ eventType: string; count: number }>) => {
    const map: Record<string, number> = {};
    for (const item of items) {
      map[item.eventType] = Number(item.count) || 0;
    }
    return map;
  };

  const buildEventsMapFromDailyEvents = (dailyEvents: BookAnalyticsExportDetails['dailyEvents']) => {
    const map: Record<string, number> = {};
    for (const day of dailyEvents) {
      for (const [key, value] of Object.entries(day)) {
        if (key === 'date') continue;
        map[key] = (map[key] || 0) + (Number(value) || 0);
      }
    }
    return map;
  };

  const exportTopBooksCsv = async () => {
    if (!stats.topBooks?.length) return;
    setIsExportingTopBooks(true);
    try {
      const rows = await Promise.all(
        stats.topBooks.map(async (book) => {
          try {
            const details = await apiRequest<BookAnalyticsExportDetails>(
              `/api/v1/analytics/book/${book.bookId}?period=${period}`
            );
            return {
              ...book,
              eventsMap: buildEventsMapFromDailyEvents(details.dailyEvents || []),
            };
          } catch {
            return {
              ...book,
              eventsMap: {} as Record<string, number>,
            };
          }
        })
      );

      downloadCsv(getCsvFileName('analytics-top-books'), rows, [
        { header: 'Ранг', accessor: (_, index) => index + 1 },
        { header: 'ID книги', accessor: (item) => item.bookId },
        { header: 'Название', accessor: (item) => item.title },
        { header: 'Автор', accessor: (item) => item.author || '' },
        { header: 'События (всего)', accessor: (item) => item.events },
        ...detailedEventTypes.map((eventType) => ({
          header: `Событие: ${eventTypeLabels[eventType] || eventType}`,
          accessor: (item: typeof rows[number]) => item.eventsMap[eventType] || 0,
        })),
      ]);
    } finally {
      setIsExportingTopBooks(false);
    }
  };

  const exportTopUsersCsv = async () => {
    if (!stats.topUsers?.length) return;
    setIsExportingTopUsers(true);
    try {
      const rows = await Promise.all(
        stats.topUsers.map(async (user) => {
          try {
            const details = await apiRequest<UserAnalyticsExportDetails>(
              `/api/v1/analytics/user/${user.userId}?period=${period}`
            );
            return {
              ...user,
              totalBooksStarted: details.totalBooksStarted,
              totalBooksCompleted: details.totalBooksCompleted,
              totalReadingTime: details.totalReadingTime,
              avgSessionDuration: details.avgSessionDuration,
              eventsMap: buildEventsMap(details.eventsByType || []),
            };
          } catch {
            return {
              ...user,
              totalBooksStarted: 0,
              totalBooksCompleted: 0,
              totalReadingTime: 0,
              avgSessionDuration: 0,
              eventsMap: {} as Record<string, number>,
            };
          }
        })
      );

      downloadCsv(getCsvFileName('analytics-top-users'), rows, [
        { header: 'Ранг', accessor: (_, index) => index + 1 },
        { header: 'ID пользователя', accessor: (item) => item.userId },
        { header: 'Имя пользователя', accessor: (item) => item.username },
        { header: 'События (всего)', accessor: (item) => item.events },
        { header: 'Книг начато', accessor: (item) => item.totalBooksStarted },
        { header: 'Книг завершено', accessor: (item) => item.totalBooksCompleted },
        { header: 'Время чтения, мин', accessor: (item) => item.totalReadingTime },
        { header: 'Средняя сессия, сек', accessor: (item) => item.avgSessionDuration },
        ...detailedEventTypes.map((eventType) => ({
          header: `Событие: ${eventTypeLabels[eventType] || eventType}`,
          accessor: (item: typeof rows[number]) => item.eventsMap[eventType] || 0,
        })),
      ]);
    } finally {
      setIsExportingTopUsers(false);
    }
  };

  const exportClubStatsCsv = () => {
    downloadCsv(getCsvFileName('analytics-club-stats'), sortedClubStats || [], [
      { header: 'ID клуба', accessor: (item) => item.clubId },
      { header: 'Клуб', accessor: (item) => item.clubTitle },
      { header: 'События', accessor: (item) => item.totalEvents },
      { header: 'Вступления', accessor: (item) => item.joinEvents },
      { header: 'Выходы', accessor: (item) => item.leaveEvents },
      { header: 'Сессии чтения', accessor: (item) => item.totalSessions },
      { header: 'Активные участники', accessor: (item) => item.activeMembers },
      { header: 'Последняя активность', accessor: (item) => item.lastActivityAt || '' },
    ]);
  };

  const exportFunnelCsv = () => {
    downloadCsv(getCsvFileName('analytics-funnel'), funnelData || [], [
      { header: 'Этап (код)', accessor: (item) => item.stage },
      { header: 'Этап', accessor: (item) => item.name },
      { header: 'Количество', accessor: (item) => item.count },
      { header: 'Конверсия от предыдущего, %', accessor: (item) => item.percentage },
    ]);
  };

  const exportHeatmapCsv = async () => {
    if (!heatmapStats?.heatmap?.length) return;
    setIsExportingHeatmap(true);
    try {
      const activeCells = heatmapStats.heatmap.filter((cell) => cell.count > 0);
      const rows = await Promise.all(
        activeCells.map(async (cell) => {
          try {
            const details = await apiRequest<HeatmapCellExportDetails>(
              `/api/v1/analytics/heatmap/details?period=${period}&day=${cell.day}&hour=${cell.hour}`
            );
            return {
              ...cell,
              eventsMap: buildEventsMap(details.eventsByType || []),
            };
          } catch {
            return {
              ...cell,
              eventsMap: {} as Record<string, number>,
            };
          }
        })
      );

      downloadCsv(getCsvFileName('analytics-heatmap'), rows, [
        { header: 'День недели (0-6)', accessor: (item) => item.day },
        { header: 'День недели', accessor: (item) => dayLabelsLong[item.day] || item.day },
        { header: 'Час (0-23)', accessor: (item) => item.hour },
        { header: 'События (всего)', accessor: (item) => item.count },
        ...detailedEventTypes.map((eventType) => ({
          header: `Событие: ${eventTypeLabels[eventType] || eventType}`,
          accessor: (item: typeof rows[number]) => item.eventsMap[eventType] || 0,
        })),
      ]);
    } finally {
      setIsExportingHeatmap(false);
    }
  };

  const exportDevicesCsv = () => {
    if (!deviceStats) return;

    const deviceTotal = Object.values(deviceStats.deviceType || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);
    const browserTotal = (deviceStats.browsers || []).reduce((sum, item) => sum + (Number(item.count) || 0), 0);
    const osTotal = (deviceStats.os || []).reduce((sum, item) => sum + (Number(item.count) || 0), 0);

    const rows = [
      ...Object.entries(deviceStats.deviceType || {}).map(([name, count]) => ({
        section: 'Device Type',
        item: deviceTypeLabels[name] || name,
        count: Number(count) || 0,
        share: deviceTotal > 0 ? Math.round(((Number(count) || 0) / deviceTotal) * 1000) / 10 : 0,
      })),
      ...(deviceStats.browsers || []).map((item) => ({
        section: 'Browser',
        item: item.name,
        count: Number(item.count) || 0,
        share: browserTotal > 0 ? Math.round(((Number(item.count) || 0) / browserTotal) * 1000) / 10 : 0,
      })),
      ...(deviceStats.os || []).map((item) => ({
        section: 'OS',
        item: item.name,
        count: Number(item.count) || 0,
        share: osTotal > 0 ? Math.round(((Number(item.count) || 0) / osTotal) * 1000) / 10 : 0,
      })),
    ];

    downloadCsv(getCsvFileName('analytics-devices'), rows, [
      { header: 'Секция', accessor: (item) => item.section },
      { header: 'Элемент', accessor: (item) => item.item },
      { header: 'Количество', accessor: (item) => item.count },
      { header: 'Доля, %', accessor: (item) => item.share },
    ]);
  };

  const exportEventsTrendCsv = () => {
    downloadCsv(getCsvFileName('analytics-events-trend'), stats.eventsTrend || [], [
      { header: 'Дата', accessor: (item) => item.date },
      { header: 'События', accessor: (item) => item.count },
    ]);
  };

  const exportEventsByTypeCsv = () => {
    const rows = (stats.eventsByType || []).map((item) => ({
      eventType: item.eventType,
      label: eventTypeLabels[item.eventType] || item.eventType,
      count: Number(item.count) || 0,
      share: stats.totalEvents > 0 ? Math.round(((Number(item.count) || 0) / stats.totalEvents) * 1000) / 10 : 0,
    }));

    downloadCsv(getCsvFileName('analytics-events-by-type'), rows, [
      { header: 'Тип события (код)', accessor: (item) => item.eventType },
      { header: 'Тип события', accessor: (item) => item.label },
      { header: 'Количество', accessor: (item) => item.count },
      { header: 'Доля, %', accessor: (item) => item.share },
    ]);
  };

  const exportUserJourneyCsv = () => {
    if (!userJourneyStats) return;

    const rows = [
      { section: 'Summary', metric: 'Users with first read', value: userJourneyStats.usersWithFirstRead },
      { section: 'Summary', metric: 'Users without read', value: userJourneyStats.usersWithoutRead },
      { section: 'Summary', metric: 'Avg days to first read', value: userJourneyStats.avgDaysToFirstRead },
      ...(userJourneyStats.distribution || []).map((item) => ({
        section: 'Distribution',
        metric: item.daysRange,
        value: item.count,
      })),
    ];

    downloadCsv(getCsvFileName('analytics-user-journey'), rows, [
      { header: 'Секция', accessor: (item) => item.section },
      { header: 'Метрика', accessor: (item) => item.metric },
      { header: 'Значение', accessor: (item) => item.value },
    ]);
  };

  return (
    <AdminLayout>
        <div className="container mx-auto py-8 px-4">
          <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Аналитика платформы</h1>
            <p className="text-muted-foreground mt-2">
              Статистика активности пользователей и популярности контента
            </p>
          </div>
          
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Выберите период" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Последние 7 дней</SelectItem>
              <SelectItem value="30d">Последние 30 дней</SelectItem>
              <SelectItem value="90d">Последние 90 дней</SelectItem>
              <SelectItem value="all">За всё время</SelectItem>
            </SelectContent>
          </Select>
        </div>

          {/* Основные метрики */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Всего событий</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalEvents.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                События пользователей
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Активных пользователей</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.topUsers.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Пользователи с активностью
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Популярных книг</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.topBooks.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Книги с активностью
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Среднее время чтения</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats ? formatTime(stats.avgReadingTime) : '-'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                За сессию
              </p>
            </CardContent>
          </Card>
          </div>

          {/* Воронка конверсии чтения */}
          <Card className="mb-8">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Воронка чтения</CardTitle>
                <CardDescription>
                  Конверсия по уникальным парам читатель+книга за выбранный период
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={exportFunnelCsv}
                disabled={!funnelData.length}
              >
                <Download className="h-4 w-4" />
                Скачать CSV
              </Button>
            </CardHeader>
            <CardContent>
              {funnelData.length === 0 || funnelData.every((s) => s.count === 0) ? (
                <div className="text-sm text-muted-foreground">
                  Недостаточно данных для построения воронки за выбранный период.
                </div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <FunnelChart>
                        <Tooltip
                          formatter={(value?: number, _name?: string, props?: { payload?: { percentage?: number } }) => {
                            const count = typeof value === 'number' ? value : 0;
                            const percentage = props?.payload?.percentage ?? 0;
                            return [`${count.toLocaleString()} • ${percentage}%`, 'Конверсия'];
                          }}
                        />
                        <Funnel dataKey="count" data={funnelData} isAnimationActive />
                      </FunnelChart>
                    </ResponsiveContainer>
                  </div>
  
                  <div className="space-y-3">
                    {funnelData.map((stage, idx) => (
                      <div
                        key={stage.stage}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: stage.fill }}
                          />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{stage.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {idx === 0 ? 'База' : `${stage.percentage}% от предыдущего шага`}
                            </div>
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div className="font-semibold tabular-nums">
                            {stage.count.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Heatmap активности */}
          <Card className="mb-8">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Heatmap активности</CardTitle>
                <CardDescription>
                  Распределение событий по дням недели и часам
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => void exportHeatmapCsv()}
                disabled={!heatmapStats?.heatmap?.some((cell) => cell.count > 0) || isExportingHeatmap}
              >
                {isExportingHeatmap ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isExportingHeatmap ? 'Формируем CSV...' : 'Скачать CSV'}
              </Button>
            </CardHeader>
            <CardContent>
              {isHeatmapLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ActivityHeatmap data={heatmapStats?.heatmap || []} period={period} />
              )}
            </CardContent>
          </Card>

          {/* Статистика устройств и платформ */}
          <Card className="mb-8">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Устройства и платформы</CardTitle>
                <CardDescription>
                  Распределение событий по типам устройств, браузерам и операционным системам
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={exportDevicesCsv}
                disabled={!deviceStats || deviceStats.totalUserAgentEvents === 0}
              >
                <Download className="h-4 w-4" />
                Скачать CSV
              </Button>
            </CardHeader>
            <CardContent>
              {isDeviceStatsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !deviceStats || deviceStats.totalUserAgentEvents === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Нет данных по устройствам за выбранный период.
                </div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="h-[280px]">
                    <div className="text-sm font-medium mb-2">Тип устройства</div>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip formatter={(value?: number) => [value || 0, 'События']} />
                        <Pie
                          data={deviceTypeData}
                          dataKey="count"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={({ name, percent }) =>
                            percent && percent > 0 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
                          }
                        >
                          {deviceTypeData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={deviceTypeColors[entry.name] || '#94a3b8'}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="h-[280px]">
                    <div className="text-sm font-medium mb-2">Браузеры (топ)</div>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={(deviceStats.browsers || []).slice(0, 8)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis />
                        <Tooltip formatter={(value?: number) => [value || 0, 'События']} />
                        <Bar dataKey="count" fill="#0284c7" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="h-[280px]">
                    <div className="text-sm font-medium mb-2">Операционные системы (топ)</div>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={(deviceStats.os || []).slice(0, 8)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis />
                        <Tooltip formatter={(value?: number) => [value || 0, 'События']} />
                        <Bar dataKey="count" fill="#16a34a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* User Journey */}
          <Card className="mb-8">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>User Journey: Time to First Read</CardTitle>
                <CardDescription>
                  Время от регистрации до первого чтения и доля активированных пользователей
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={exportUserJourneyCsv}
                disabled={!userJourneyStats}
              >
                <Download className="h-4 w-4" />
                Скачать CSV
              </Button>
            </CardHeader>
            <CardContent>
              {isUserJourneyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !userJourneyStats ? (
                <div className="text-sm text-muted-foreground">
                  Нет данных по user journey за выбранный период.
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground">Начали читать</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums">
                        {userJourneyStats.usersWithFirstRead.toLocaleString()}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {userJourneyConversionRate}% от зарегистрированных
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground">Не начали читать</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums">
                        {userJourneyStats.usersWithoutRead.toLocaleString()}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {userJourneyDropoffRate.toFixed(1)}% от зарегистрированных
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground">Среднее до первого чтения</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums">
                        {userJourneyStats.avgDaysToFirstRead.toFixed(1)} дн.
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Только по пользователям с первым чтением
                      </div>
                    </div>
                  </div>

                  {userJourneyStats.distribution.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      Недостаточно данных для распределения по интервалам.
                    </div>
                  ) : (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={userJourneyStats.distribution}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="daysRange" tick={{ fontSize: 12 }} />
                          <YAxis />
                          <Tooltip
                            formatter={(value?: number) => [value || 0, 'Пользователи']}
                            labelFormatter={(value) => `${value} дней`}
                          />
                          <Bar dataKey="count" fill="#0ea5e9" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

        {/* График активности по дням */}
        <Card className="mb-8">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Динамика активности</CardTitle>
              <CardDescription>Количество событий по дням</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={exportEventsTrendCsv}
              disabled={!stats?.eventsTrend?.length}
            >
              <Download className="h-4 w-4" />
              Скачать CSV
            </Button>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stats?.eventsTrend || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString('ru-RU')}
                  formatter={(value?: number) => [value || 0, 'События']}
                />
                <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* События по типам */}
        <Card className="mb-8">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Распределение событий по типам</CardTitle>
              <CardDescription>Какие действия совершают пользователи</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={exportEventsByTypeCsv}
              disabled={!stats?.eventsByType?.length}
            >
              <Download className="h-4 w-4" />
              Скачать CSV
            </Button>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats?.eventsByType || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="eventType" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => eventTypeLabels[value] || value}
                />
                <YAxis />
                <Tooltip 
                  formatter={(value?: number) => [value || 0, 'События']}
                  labelFormatter={(value) => eventTypeLabels[value] || value}
                />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Топ книг */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Топ-10 популярных книг</CardTitle>
                <CardDescription>По количеству событий (кликните для деталей)</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => void exportTopBooksCsv()}
                disabled={!stats?.topBooks?.length || isExportingTopBooks}
              >
                {isExportingTopBooks ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isExportingTopBooks ? 'Формируем CSV...' : 'Скачать CSV'}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats?.topBooks.map((book, index) => (
                  <button 
                    key={book.bookId} 
                    className="flex items-center p-2 rounded-lg hover:bg-muted/50 transition-colors text-left w-full"
                    onClick={() => {
                      setSelectedBookId(book.bookId);
                      setSelectedBookTitle(book.title);
                      setSelectedBookAuthor(book.author);
                      setBookModalOpen(true);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate text-primary">{book.title}</div>
                      {book.author && (
                        <div className="text-sm text-muted-foreground truncate">{book.author}</div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        #{index + 1} • {book.events} событий
                      </div>
                    </div>
                  </button>
                ))}
                {(!stats?.topBooks || stats.topBooks.length === 0) && (
                  <div className="text-center text-muted-foreground py-8">
                    Нет данных за выбранный период
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Топ пользователей */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Топ-10 активных пользователей</CardTitle>
                <CardDescription>По количеству событий</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => void exportTopUsersCsv()}
                disabled={!stats?.topUsers?.length || isExportingTopUsers}
              >
                {isExportingTopUsers ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isExportingTopUsers ? 'Формируем CSV...' : 'Скачать CSV'}
              </Button>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                  {stats?.topUsers.map((user, index) => (
                  <button
                    key={user.userId}
                    className="flex items-center p-2 rounded-lg hover:bg-muted/50 transition-colors text-left w-full"
                    onClick={() => {
                      setSelectedUserId(user.userId);
                      setSelectedUsername(user.username);
                      setUserModalOpen(true);
                    }}
                  >
                    <div className="font-bold text-muted-foreground mr-4 w-6">
                      #{index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-primary">{user.username}</div>
                    </div>
                    <div className="text-sm font-medium ml-4">
                      {user.events} событий
                    </div>
                  </button>
                ))}
                {(!stats?.topUsers || stats.topUsers.length === 0) && (
                  <div className="text-center text-muted-foreground py-8">
                    Нет данных за выбранный период
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Клубная аналитика */}
        <Card className="mt-8">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Клубная аналитика</CardTitle>
              <CardDescription>
                События по клубам (вступления, выходы, сессии чтения). Кликните по строке для детализации.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={exportClubStatsCsv}
              disabled={!sortedClubStats.length}
            >
              <Download className="h-4 w-4" />
              Скачать CSV
            </Button>
          </CardHeader>
          <CardContent>
            {sortedClubStats.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Нет клубной активности за выбранный период
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Клуб</TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleClubSort('totalEvents')}
                      >
                        События
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead>Вступления</TableHead>
                    <TableHead>Выходы</TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleClubSort('totalSessions')}
                      >
                        Сессии
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleClubSort('activeMembers')}
                      >
                        Активные участники
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleClubSort('lastActivityAt')}
                      >
                        Последняя активность
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedClubStats.map((club) => (
                    <TableRow
                      key={club.clubId}
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedClubId(club.clubId);
                        setSelectedClubTitle(club.clubTitle);
                        setClubModalOpen(true);
                      }}
                    >
                      <TableCell className="font-medium text-primary">{club.clubTitle}</TableCell>
                      <TableCell className="tabular-nums">{club.totalEvents.toLocaleString()}</TableCell>
                      <TableCell className="tabular-nums">{club.joinEvents.toLocaleString()}</TableCell>
                      <TableCell className="tabular-nums">{club.leaveEvents.toLocaleString()}</TableCell>
                      <TableCell className="tabular-nums">{club.totalSessions.toLocaleString()}</TableCell>
                      <TableCell className="tabular-nums">{club.activeMembers.toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {club.lastActivityAt
                          ? new Date(club.lastActivityAt).toLocaleString('ru-RU')
                          : 'Нет активности'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Яндекс.Метрика */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Яндекс.Метрика</CardTitle>
            <CardDescription>
              Полная веб-аналитика с Вебвизором и картой кликов
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Счетчик Яндекс.Метрики установлен на всех страницах сайта. 
              Для просмотра подробной статистики перейдите в личный кабинет Метрики.
            </p>
            <a 
              href="https://metrika.yandex.ru/dashboard?id=106167747" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              Открыть Яндекс.Метрику
            </a>
          </CardContent>
        </Card>
      </div>

      {/* Модалка детализации книги */}
      <BookAnalyticsModal
        bookId={selectedBookId}
        bookTitle={selectedBookTitle}
        bookAuthor={selectedBookAuthor}
        open={bookModalOpen}
        onOpenChange={setBookModalOpen}
      />

      <ClubAnalyticsModal
        clubId={selectedClubId}
        clubTitle={selectedClubTitle}
        period={period}
        open={clubModalOpen}
        onOpenChange={setClubModalOpen}
      />

      <UserAnalyticsModal
        userId={selectedUserId}
        username={selectedUsername}
        period={period}
        open={userModalOpen}
        onOpenChange={setUserModalOpen}
      />
    </AdminLayout>
  );
}
