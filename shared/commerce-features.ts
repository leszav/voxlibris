import type { CommerceFeatureValueType, CommerceScopeType } from './schema.js';

export type CommerceFeatureKey = typeof commerceFeatureRegistrySeed[number]['key'];

export type CommerceFeatureSeedItem = {
  key: string;
  title: string;
  description?: string;
  category: string;
  scopeType: CommerceScopeType;
  valueType: CommerceFeatureValueType;
  defaultBool?: boolean;
  defaultInt?: number;
  defaultText?: string;
  defaultJson?: unknown;
  isPublic?: boolean;
  isActive?: boolean;
};

export const commerceFeatureRegistrySeed = [
  { key: 'personal_library.max_books', title: 'Книги в личной библиотеке', category: 'platform', scopeType: 'platform', valueType: 'integer', defaultInt: 100 },
  { key: 'personal_books.upload.enabled', title: 'Загрузка личных книг', category: 'platform', scopeType: 'platform', valueType: 'boolean', defaultBool: true },
  { key: 'personal_notes.max_count', title: 'Личные заметки', category: 'platform', scopeType: 'platform', valueType: 'integer', defaultInt: 500 },
  { key: 'clubs.joined.max_count', title: 'Участие в клубах', category: 'platform', scopeType: 'platform', valueType: 'integer', defaultInt: 10 },
  { key: 'recommendations.advanced.enabled', title: 'Расширенные рекомендации', category: 'platform', scopeType: 'platform', valueType: 'boolean', defaultBool: false },
  { key: 'calendar.advanced.enabled', title: 'Расширенный календарь', category: 'platform', scopeType: 'platform', valueType: 'boolean', defaultBool: false },
  { key: 'notifications.advanced.enabled', title: 'Расширенные уведомления', category: 'platform', scopeType: 'platform', valueType: 'boolean', defaultBool: false },

  { key: 'clubs.owned.max_count', title: 'Созданные клубы', category: 'clubs', scopeType: 'club', valueType: 'integer', defaultInt: 1 },
  { key: 'club.members.max_count', title: 'Участники клуба', category: 'clubs', scopeType: 'club', valueType: 'integer', defaultInt: 20 },
  { key: 'club.private.enabled', title: 'Приватный клуб', category: 'clubs', scopeType: 'club', valueType: 'boolean', defaultBool: false },
  { key: 'club.moderators.max_count', title: 'Модераторы клуба', category: 'clubs', scopeType: 'club', valueType: 'integer', defaultInt: 1 },
  { key: 'club.books.max_count', title: 'Книги клуба', category: 'clubs', scopeType: 'club', valueType: 'integer', defaultInt: 5 },
  { key: 'club.schedule.enabled', title: 'Расписание клуба', category: 'clubs', scopeType: 'club', valueType: 'boolean', defaultBool: true },
  { key: 'club.discussions.enabled', title: 'Обсуждения клуба', category: 'clubs', scopeType: 'club', valueType: 'boolean', defaultBool: true },
  { key: 'club.analytics.level', title: 'Аналитика клуба', category: 'clubs', scopeType: 'club', valueType: 'string', defaultText: 'basic' },

  { key: 'reader_club_access', title: 'Доступ к клубу чтеца', category: 'reader_clubs', scopeType: 'reader_club', valueType: 'boolean', defaultBool: false },
  { key: 'studio.live.enabled', title: 'Live-эфиры Studio', category: 'studio', scopeType: 'reader_club', valueType: 'boolean', defaultBool: false },
  { key: 'studio.live.max_listener_count', title: 'Слушатели live-эфира', category: 'studio', scopeType: 'reader_club', valueType: 'integer', defaultInt: 0 },
  { key: 'studio.live.max_duration_minutes', title: 'Длительность live-эфира', category: 'studio', scopeType: 'reader_club', valueType: 'integer', defaultInt: 0 },
  { key: 'studio.recordings.enabled', title: 'Записи Studio', category: 'studio', scopeType: 'reader_club', valueType: 'boolean', defaultBool: false },
  { key: 'studio.recordings.max_count', title: 'Количество записей Studio', category: 'studio', scopeType: 'reader_club', valueType: 'integer', defaultInt: 0 },
  { key: 'studio.recordings.storage_mb', title: 'Хранилище записей Studio', category: 'studio', scopeType: 'reader_club', valueType: 'integer', defaultInt: 0 },
  { key: 'studio.recordings.publication.enabled', title: 'Публикация записей Studio', category: 'studio', scopeType: 'reader_club', valueType: 'boolean', defaultBool: false },
  { key: 'studio.analytics.level', title: 'Аналитика Studio', category: 'studio', scopeType: 'reader_club', valueType: 'string', defaultText: 'none' },
] as const satisfies readonly CommerceFeatureSeedItem[];

export const commerceFeatureKeys = commerceFeatureRegistrySeed.map((feature) => feature.key) as CommerceFeatureKey[];
