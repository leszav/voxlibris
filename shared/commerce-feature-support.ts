export type CommerceFeatureSupportStatus = 'implemented' | 'entitlement_only';

export type CommerceFeatureSupportItem = {
  status: CommerceFeatureSupportStatus;
  enforcement: 'server_limit' | 'server_access' | 'not_enforced';
  note: string;
};

export const commerceFeatureSupport: Record<string, CommerceFeatureSupportItem> = {
  'personal_library.max_books': { status: 'implemented', enforcement: 'server_limit', note: 'Проверяется при загрузке книг в личную библиотеку.' },
  'personal_books.upload.enabled': { status: 'implemented', enforcement: 'server_access', note: 'Проверяется при загрузке личных книг.' },
  'clubs.joined.max_count': { status: 'implemented', enforcement: 'server_limit', note: 'Проверяется при вступлении в обычные клубы.' },
  'clubs.owned.max_count': { status: 'implemented', enforcement: 'server_limit', note: 'Проверяется при создании обычных клубов.' },
  'club.members.max_count': { status: 'implemented', enforcement: 'server_limit', note: 'Проверяется при вступлении/принятии приглашения в обычный клуб.' },
  'club.private.enabled': { status: 'implemented', enforcement: 'server_access', note: 'Проверяется при создании приватного обычного клуба.' },
  'club.books.max_count': { status: 'implemented', enforcement: 'server_limit', note: 'Проверяется при загрузке книг в клубную библиотеку.' },
  'reader_club_access': { status: 'implemented', enforcement: 'server_access', note: 'Выдаётся и проверяется для платного доступа к клубам чтецов.' },

  'personal_notes.max_count': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но серверная проверка лимита заметок пока не подключена.' },
  'recommendations.advanced.enabled': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но расширенные рекомендации пока не проверяют entitlement.' },
  'calendar.advanced.enabled': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но календарь пока не проверяет entitlement.' },
  'notifications.advanced.enabled': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но уведомления пока не проверяют entitlement.' },
  'club.moderators.max_count': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но лимит модераторов пока не проверяется.' },
  'club.schedule.enabled': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но расписание клуба пока не проверяет entitlement.' },
  'club.discussions.enabled': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но обсуждения пока не проверяют entitlement.' },
  'club.analytics.level': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но аналитика клуба пока не читает уровень из entitlement.' },
  'studio.live.enabled': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но Studio live пока сохраняет текущий owner-based flow.' },
  'studio.live.max_listener_count': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но лимит слушателей Studio пока не проверяется.' },
  'studio.live.max_duration_minutes': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но лимит длительности Studio пока не проверяется.' },
  'studio.recordings.enabled': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но записи Studio пока не проверяют entitlement.' },
  'studio.recordings.max_count': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но лимит записей Studio пока не проверяется.' },
  'studio.recordings.storage_mb': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но лимит хранилища Studio пока не проверяется.' },
  'studio.recordings.publication.enabled': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но публикация записей пока не проверяет entitlement.' },
  'studio.analytics.level': { status: 'entitlement_only', enforcement: 'not_enforced', note: 'Ключ есть в реестре, но аналитика Studio пока не читает уровень из entitlement.' },
};

export function getCommerceFeatureSupport(featureKey: string): CommerceFeatureSupportItem {
  return commerceFeatureSupport[featureKey] ?? {
    status: 'entitlement_only',
    enforcement: 'not_enforced',
    note: 'Кастомный ключ: будет храниться и выдаваться как entitlement, но для влияния на продукт нужна разработка серверной проверки.',
  };
}
