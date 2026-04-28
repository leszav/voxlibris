-- Migration 0040: Expand genres catalog from .tmp/genre/genre.md
-- Safety + idempotency: INSERT ... ON CONFLICT (code) DO UPDATE

INSERT INTO "genres" ("code", "label_ru", "label_en", "group_key", "description", "aliases_json", "sort_order", "is_active")
VALUES
  ('fantasy_urban', 'Городское фэнтези', 'Urban Fantasy', 'fantasy', 'Фэнтези в городском окружении', '["fantasy_urban","urban fantasy","городское фэнтези"]', 45, true),
  ('fantasy_historical', 'Историческое фэнтези', 'Historical Fantasy', 'fantasy', 'Исторический сеттинг с элементами магии', '["fantasy_historical","historical fantasy","историческое фэнтези"]', 46, true),
  ('fantasy_myth', 'Мифологическое фэнтези', 'Mythic Fantasy', 'fantasy', 'Фэнтези, основанное на мифологии', '["fantasy_myth","myth fantasy","mythic fantasy","мифологическое фэнтези"]', 47, true),
  ('sf_social', 'Социальная НФ', 'Social Science Fiction', 'sf', 'Научная фантастика с акцентом на общество и социальные модели', '["sf_social","social science fiction","социальная нф"]', 65, true),
  ('sf_heroic', 'Героическая фантастика', 'Heroic Science Fiction', 'sf', 'Приключенческая фантастика с ярким героем', '["sf_heroic","heroic science fiction","героическая фантастика"]', 66, true),
  ('sf_postapocalyptic', 'Постапокалипсис', 'Post-Apocalyptic', 'sf', 'Истории после глобальной катастрофы', '["sf_postapocalyptic","postapocalyptic","post-apocalyptic","постапокалипсис"]', 67, true),
  ('game_lit', 'Игровая литература', 'GameLit', 'game', 'Литература с выраженной игровой моделью', '["game_lit","gamelit","game lit","игровая литература"]', 171, true),
  ('isekai', 'Исэкай', 'Isekai', 'fantasy', 'Попадание героя в другой мир', '["isekai","исэкай"]', 181, true),
  ('detective_historical', 'Исторический детектив', 'Historical Detective', 'detective', 'Детектив в историческом антураже', '["detective_historical","historical detective","исторический детектив"]', 95, true),
  ('humor', 'Юмор', 'Humor', 'humor', 'Юмористическая литература', '["humor","юмор"]', 145, true),
  ('satire', 'Сатира', 'Satire', 'humor', 'Сатирическая литература', '["satire","сатира"]', 146, true),
  ('biography', 'Биография', 'Biography', 'nonfiction', 'Биографии, мемуары и автобиографическая проза', '["biography","биография","мемуары"]', 155, true),
  ('children', 'Детская литература', 'Children''s Literature', 'children', 'Книги для детей', '["children","детская литература","детские книги"]', 190, true),
  ('ya', 'Подростковая литература', 'Young Adult', 'ya', 'Литература для подростков и молодых взрослых', '["ya","young adult","подростковая литература"]', 191, true),
  ('romance_sf', 'Научно-фантастический роман', 'Science Fiction Romance', 'romance', 'Романтическая проза в научно-фантастическом сеттинге', '["romance_sf","science fiction romance","научно-фантастический роман"]', 121, true)
ON CONFLICT ("code") DO UPDATE
SET
  "label_ru" = EXCLUDED."label_ru",
  "label_en" = EXCLUDED."label_en",
  "group_key" = EXCLUDED."group_key",
  "description" = EXCLUDED."description",
  "aliases_json" = EXCLUDED."aliases_json",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = EXCLUDED."is_active";

SELECT 'Migration 0040 completed: genres catalog expanded' AS result;
