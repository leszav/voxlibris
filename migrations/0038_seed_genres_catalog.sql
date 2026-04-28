-- Migration 0038: Seed initial genres catalog
-- Safety + idempotency: INSERT ... ON CONFLICT (code) DO UPDATE

INSERT INTO "genres" ("code", "label_ru", "label_en", "group_key", "description", "aliases_json", "sort_order", "is_active")
VALUES
  ('fantasy', 'Фэнтези', 'Fantasy', 'fantasy', 'Базовый жанр фэнтези', '["fantasy","фэнтези"]', 10, true),
  ('fantasy_heroic', 'Героическое фэнтези', 'Heroic Fantasy', 'fantasy', 'Фэнтези с акцентом на героический сюжет', '["fantasy_heroic","героическое фэнтези"]', 20, true),
  ('fantasy_dark', 'Тёмное фэнтези', 'Dark Fantasy', 'fantasy', 'Фэнтези с мрачной атмосферой', '["fantasy_dark","dark fantasy","темное фэнтези","тёмное фэнтези"]', 30, true),
  ('fantasy_fight', 'Боевое фэнтези', 'Action Fantasy', 'fantasy', 'Фэнтези с боевым фокусом', '["fantasy_fight","боевое фэнтези"]', 40, true),
  ('sf', 'Научная фантастика', 'Science Fiction', 'sf', 'Общий жанр научной фантастики', '["sf","science fiction","sci-fi","научная фантастика"]', 50, true),
  ('sf_hard', 'Жёсткая НФ', 'Hard Sci-Fi', 'sf', 'Научная фантастика с упором на реалистичную науку', '["sf_hard","hard sci-fi","жесткая нф","жёсткая нф"]', 60, true),
  ('sf_military', 'Военная НФ', 'Military Sci-Fi', 'sf', 'Военная научная фантастика', '["sf_military","военная нф","боевая фантастика"]', 70, true),
  ('sf_cyberpunk', 'Киберпанк', 'Cyberpunk', 'sf', 'Жанр научной фантастики о цифровом будущем', '["sf_cyberpunk","cyberpunk","киберпанк"]', 80, true),
  ('detective', 'Детектив', 'Detective', 'detective', 'Детективный жанр', '["detective","детектив"]', 90, true),
  ('thriller', 'Триллер', 'Thriller', 'thriller', 'Напряженный остросюжетный жанр', '["thriller","триллер"]', 100, true),
  ('romance', 'Романтика', 'Romance', 'romance', 'Любовные романы и романтическая проза', '["romance","романтика","любовный роман"]', 110, true),
  ('romance_fantasy', 'Романтическое фэнтези', 'Fantasy Romance', 'romance', 'Сочетание романтики и фэнтези', '["romance_fantasy","романтическое фэнтези","фэнтези-роман"]', 120, true),
  ('adventure', 'Приключения', 'Adventure', 'adventure', 'Приключенческая литература', '["adventure","приключения"]', 130, true),
  ('horror', 'Ужасы', 'Horror', 'horror', 'Хоррор и страшные истории', '["horror","ужасы"]', 140, true),
  ('historical', 'Исторический роман', 'Historical', 'historical', 'Историческая проза', '["historical","исторический роман","историческая проза"]', 150, true),
  ('nonfiction', 'Нон-фикшн', 'Non-fiction', 'nonfiction', 'Документальная и научно-популярная литература', '["nonfiction","non-fiction","нон-фикшн","non fiction"]', 160, true),
  ('lit_rpg', 'ЛитРПГ', 'LitRPG', 'game', 'Литература с игровой механикой', '["lit_rpg","litrpg","литрпг","лит рпг"]', 170, true),
  ('popadanec', 'Попаданец', 'Portal Fantasy', 'fantasy', 'Сюжеты о переносе героя в иные миры/эпохи', '["popadanec","попаданец","исекай","isekai"]', 180, true)
ON CONFLICT ("code") DO UPDATE
SET
  "label_ru" = EXCLUDED."label_ru",
  "label_en" = EXCLUDED."label_en",
  "group_key" = EXCLUDED."group_key",
  "description" = EXCLUDED."description",
  "aliases_json" = EXCLUDED."aliases_json",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = EXCLUDED."is_active";

SELECT 'Migration 0038 completed: genres catalog seeded/updated' AS result;

