import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type CheckStatus = 'pass' | 'fail' | 'skip';

interface CheckResult {
  name: string;
  status: CheckStatus;
  details?: string;
}

interface HttpCheckOptions {
  expectedStatuses?: number[];
  token?: string;
}

const rootDir = process.cwd();
const baseUrl = process.env.STAGE12_BASE_URL || process.env.VOXLIBRIS_BASE_URL || '';
const ownerToken = process.env.STAGE12_OWNER_TOKEN || '';
const listenerToken = process.env.STAGE12_LISTENER_TOKEN || '';
const clubId = process.env.STAGE12_READER_CLUB_ID || '';
const bookId = process.env.STAGE12_READER_CLUB_BOOK_ID || '';

const results: CheckResult[] = [];

function addResult(name: string, status: CheckStatus, details?: string): void {
  results.push({ name, status, details });
}

function readWorkspaceFile(path: string): string {
  const absolutePath = resolve(rootDir, path);
  if (!existsSync(absolutePath)) {
    throw new Error(`Файл не найден: ${path}`);
  }

  return readFileSync(absolutePath, 'utf8');
}

function assertIncludes(name: string, path: string, expected: string): void {
  try {
    const content = readWorkspaceFile(path);
    if (!content.includes(expected)) {
      addResult(name, 'fail', `${path}: не найден фрагмент ${JSON.stringify(expected)}`);
      return;
    }

    addResult(name, 'pass');
  } catch (error) {
    addResult(name, 'fail', error instanceof Error ? error.message : String(error));
  }
}

function assertNotIncludes(name: string, path: string, forbidden: string): void {
  try {
    const content = readWorkspaceFile(path);
    if (content.includes(forbidden)) {
      addResult(name, 'fail', `${path}: найден запрещённый фрагмент ${JSON.stringify(forbidden)}`);
      return;
    }

    addResult(name, 'pass');
  } catch (error) {
    addResult(name, 'fail', error instanceof Error ? error.message : String(error));
  }
}

function assertRegex(name: string, path: string, pattern: RegExp): void {
  try {
    const content = readWorkspaceFile(path);
    if (!pattern.test(content)) {
      addResult(name, 'fail', `${path}: не найден pattern ${pattern}`);
      return;
    }

    addResult(name, 'pass');
  } catch (error) {
    addResult(name, 'fail', error instanceof Error ? error.message : String(error));
  }
}

async function httpCheck(path: string, name: string, options: HttpCheckOptions = {}): Promise<void> {
  if (!baseUrl) {
    addResult(name, 'skip', 'Не задан STAGE12_BASE_URL');
    return;
  }

  const expectedStatuses = options.expectedStatuses ?? [200];
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  try {
    const response = await fetch(new URL(path, baseUrl), { headers });
    if (!expectedStatuses.includes(response.status)) {
      const text = await response.text().catch(() => '');
      addResult(name, 'fail', `HTTP ${response.status}, ожидалось ${expectedStatuses.join('/')} ${text.slice(0, 300)}`);
      return;
    }

    addResult(name, 'pass', `HTTP ${response.status}`);
  } catch (error) {
    addResult(name, 'fail', error instanceof Error ? error.message : String(error));
  }
}

async function runStaticChecks(): Promise<void> {
  assertIncludes(
    'reader-led клубы остаются отдельной страницей',
    'client/src/pages/reader-club-details.tsx',
    'club.type !== "reader-led"',
  );
  assertIncludes(
    'страница клуба чтецов содержит слушательский live-плеер',
    'client/src/pages/reader-club-details.tsx',
    'useClubLiveListening',
  );
  assertIncludes(
    'страница клуба чтецов содержит owner-only приглашения',
    'client/src/pages/reader-club-details.tsx',
    'InviteMemberModal',
  );
  assertIncludes(
    'страница клуба чтецов содержит owner-only пост-аналитику',
    'client/src/pages/reader-club-details.tsx',
    'reader-analytics',
  );
  assertNotIncludes(
    'страница клуба чтецов не показывает вкладку библиотеки',
    'client/src/pages/reader-club-details.tsx',
    'Библиотека',
  );
  assertIncludes(
    'сервер запрещает запуск Studio слушателем reader-led клуба',
    'server/routes/reading-sessions.ts',
    'Only the reader club owner can start Studio',
  );
  assertIncludes(
    'серверный streaming status требует активное членство клуба',
    'server/lib/studio-streaming-service.ts',
    'Only active club members can access this stream',
  );
  assertIncludes(
    'reader-led analytics закрыта для не-владельца',
    'server/club-routes.ts',
    'Only the reader club owner can view analytics',
  );
  assertIncludes(
    'инвайт добавляет приглашённого как member/listener-сценарий',
    'server/routes.ts',
    'listenerAccess',
  );
  assertIncludes(
    'регистрация по invite автоматически добавляет в клуб',
    'server/auth-routes.ts',
    'joinClubByInvite',
  );
  assertNotIncludes(
    '/readers не должен быть закрыт ComingSoonOverlay',
    'client/src/pages/readers.tsx',
    'ComingSoonOverlay',
  );
  assertNotIncludes(
    '/become-reader не должен быть закрыт ComingSoonOverlay',
    'client/src/pages/become-reader.tsx',
    'ComingSoonOverlay',
  );
  assertRegex(
    'миграция 0051 содержит оба landing feature flag',
    'migrations/0051_add_landing_reader_clubs_feature_flag.sql',
    /landing\.readerClubs\.enabled[\s\S]*landing\.topReaders\.enabled|landing\.topReaders\.enabled[\s\S]*landing\.readerClubs\.enabled/,
  );
}

async function runHttpChecks(): Promise<void> {
  await httpCheck('/api/clubs/landing-reader-clubs/status', 'HTTP: статус landing reader-led блока');
  await httpCheck('/api/readers/landing-top/status', 'HTTP: статус landing top readers блока');
  await httpCheck('/api/readers/top?limit=1', 'HTTP: топ чтецов доступен');

  if (!clubId) {
    addResult('HTTP: reader-led analytics owner/listener access', 'skip', 'Не задан STAGE12_READER_CLUB_ID');
    return;
  }

  await httpCheck(`/api/clubs/${clubId}/reader-analytics`, 'HTTP: владелец видит пост-аналитику', {
    token: ownerToken,
    expectedStatuses: ownerToken ? [200] : [401],
  });
  await httpCheck(`/api/clubs/${clubId}/reader-analytics`, 'HTTP: слушатель не видит приватную пост-аналитику', {
    token: listenerToken,
    expectedStatuses: listenerToken ? [403] : [401],
  });

  if (!bookId || !listenerToken) {
    addResult('HTTP: прямой доступ слушателя к тексту книги', 'skip', 'Нужны STAGE12_READER_CLUB_BOOK_ID и STAGE12_LISTENER_TOKEN');
    return;
  }

  await httpCheck(`/api/books/${bookId}/content`, 'HTTP: слушатель не получает текст книги прямым API', {
    token: listenerToken,
    expectedStatuses: [401, 403, 404],
  });
}

function printSummary(): void {
  const icon: Record<CheckStatus, string> = {
    pass: '✓',
    fail: '✗',
    skip: '○',
  };

  console.log('\nStage 12 reader-led clubs smoke checks\n');
  for (const result of results) {
    console.log(`${icon[result.status]} ${result.name}${result.details ? ` — ${result.details}` : ''}`);
  }

  const failed = results.filter((result) => result.status === 'fail').length;
  const skipped = results.filter((result) => result.status === 'skip').length;
  const passed = results.filter((result) => result.status === 'pass').length;

  console.log(`\nИтог: ${passed} passed, ${failed} failed, ${skipped} skipped`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

await runStaticChecks();
await runHttpChecks();
printSummary();
