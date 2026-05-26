// Генерация технического username на основе displayName.
// Должно быть:
// - стабильно и предсказуемо по формату
// - безопасно для URL / упоминаний
// - уникализируется суффиксом при коллизиях

const CYRILLIC_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function translitRuToLat(input: string): string {
  const lower = input.toLowerCase();
  let out = '';
  for (const ch of lower) {
    if (CYRILLIC_MAP[ch]) {
      out += CYRILLIC_MAP[ch];
      continue;
    }
    out += ch;
  }
  return out;
}

function normalizeBase(value: string): string {
  // 1) trim
  // 2) translit
  // 3) пробелы/дефисы -> underscore
  // 4) выкидываем всё кроме [a-z0-9_]
  // 5) схлопываем подряд идущие _
  // 6) обрезаем
  const translit = translitRuToLat(value.trim());
  const underscored = translit.replace(/[\s-]+/gu, '_');
  const cleaned = underscored.replace(/[^a-z0-9_]/gu, '');
  const collapsed = cleaned.replace(/_+/gu, '_').replace(/^_+|_+$/gu, '');
  return collapsed;
}

function randomSuffix(length = 4): string {
  // lowercase base36; для уникальности достаточно, т.к. при коллизиях добавим новый суффикс.
  return Math.random().toString(36).slice(2, 2 + length);
}

export function generateUsernameFromDisplayName(displayName: string): string {
  const base = normalizeBase(displayName);
  const safeBase = base.length >= 3 ? base.slice(0, 24) : 'user';
  return `${safeBase}_${randomSuffix(4)}`;
}
