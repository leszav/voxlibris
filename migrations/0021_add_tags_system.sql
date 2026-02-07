-- Migration 0021: Add tags system for clubs and books
-- Универсальная система тегов для клубов и книг (личных и клубных)

-- ВАЖНО: Удаляем старую таблицу club_tags из миграции 0003
-- Старая структура: (id, club_id, tag) - простой текст
-- Новая структура: (id, club_id, tag_id) - связь с таблицей tags
DROP TABLE IF EXISTS club_tags CASCADE;

-- Справочник тегов (жанры из .tmp/tags.md)
CREATE TABLE IF NOT EXISTS tags (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR NOT NULL UNIQUE, -- fantasy, sf_heroic, lit_rpg и т.д.
  name_ru TEXT NOT NULL, -- фэнтези, героическая фантастика, литРПГ
  name_en TEXT NOT NULL, -- fantasy, heroic fantasy, LitRPG
  description TEXT, -- описание жанра
  category VARCHAR, -- fantasy, sf, detective, romance и т.д.
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Индекс для быстрого поиска по slug
CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);

-- Связь клубов с тегами (many-to-many)
CREATE TABLE IF NOT EXISTS club_tags (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id VARCHAR NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  tag_id VARCHAR NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(club_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_club_tags_club_id ON club_tags(club_id);
CREATE INDEX IF NOT EXISTS idx_club_tags_tag_id ON club_tags(tag_id);

-- Связь личных книг с тегами (many-to-many)
CREATE TABLE IF NOT EXISTS personal_book_tags (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id VARCHAR NOT NULL REFERENCES personal_books(id) ON DELETE CASCADE,
  tag_id VARCHAR NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(book_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_personal_book_tags_book_id ON personal_book_tags(book_id);
CREATE INDEX IF NOT EXISTS idx_personal_book_tags_tag_id ON personal_book_tags(tag_id);

-- Связь книг клубов с тегами (many-to-many)
CREATE TABLE IF NOT EXISTS club_book_tags (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id VARCHAR NOT NULL REFERENCES club_books(id) ON DELETE CASCADE,
  tag_id VARCHAR NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(book_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_club_book_tags_book_id ON club_book_tags(book_id);
CREATE INDEX IF NOT EXISTS idx_club_book_tags_tag_id ON club_book_tags(tag_id);

-- Заполняем базовые теги из справочника .tmp/tags.md
INSERT INTO tags (slug, name_ru, name_en, category, description) VALUES
  -- Fantasy
  ('fantasy', 'фэнтези', 'fantasy', 'fantasy', 'Базовый жанр фэнтези'),
  ('fantasy_heroic', 'героическое фэнтези', 'heroic fantasy', 'fantasy', 'С акцентом на подвиги героя'),
  ('fantasy_fight', 'боевое фэнтези', 'combat fantasy', 'fantasy', 'Боевые сцены и сражения'),
  ('fantasy_dark', 'тёмное фэнтези', 'dark fantasy', 'fantasy', 'Мрачная атмосфера'),
  ('fantasy_urban', 'городское фэнтези', 'urban fantasy', 'fantasy', 'Магия в современном городе'),
  ('fantasy_historical', 'историческое фэнтези', 'historical fantasy', 'fantasy', 'Средневековье + магия'),
  ('fantasy_myth', 'мифологическое фэнтези', 'mythological fantasy', 'fantasy', 'Основано на реальных мифах'),
  
  -- Science Fiction
  ('sf', 'научная фантастика', 'science fiction', 'sf', 'Общее обозначение НФ'),
  ('sf_hard', 'жёсткая НФ', 'hard SF', 'sf', 'Упор на реалистичную науку'),
  ('sf_social', 'социальная НФ', 'social SF', 'sf', 'Социальные аспекты будущего'),
  ('sf_heroic', 'героическая фантастика', 'heroic SF', 'sf', 'Приключения в космосе/будущем'),
  ('cyberpunk', 'киберпанк', 'cyberpunk', 'sf', 'Высокие технологии, низкий уровень жизни'),
  ('sf_postapocalyptic', 'постапокалипсис', 'post-apocalyptic', 'sf', 'После глобальной катастрофы'),
  ('sf_military', 'военная НФ', 'military SF', 'sf', 'Военные действия в будущем'),
  
  -- Gaming & LitRPG
  ('lit_rpg', 'литРПГ', 'LitRPG', 'gaming', 'Литература с элементами РПГ'),
  ('game_lit', 'игровая литература', 'game literature', 'gaming', 'Игровая литература'),
  ('isekai', 'исэкай', 'isekai', 'gaming', 'Попаданцы в другой мир'),
  ('popadanec', 'попаданец', 'popadanets', 'gaming', 'Русскоязычный аналог isekai'),
  
  -- Other genres
  ('adventure', 'приключения', 'adventure', 'adventure', 'Приключенческая литература'),
  ('detective', 'детектив', 'detective', 'detective', 'Детективная литература'),
  ('detective_historical', 'исторический детектив', 'historical detective', 'detective', 'Детектив в историческом сеттинге'),
  ('thriller', 'триллер', 'thriller', 'thriller', 'Напряжённый сюжет'),
  ('horror', 'ужасы', 'horror', 'horror', 'Литература ужасов'),
  ('romance', 'любовный роман', 'romance', 'romance', 'Романтика'),
  ('romance_fantasy', 'романтическое фэнтези', 'romance fantasy', 'romance', 'Фэнтези-роман'),
  ('romance_sf', 'научно-фантастический роман', 'romance SF', 'romance', 'НФ-роман'),
  ('humor', 'юмор', 'humor', 'humor', 'Юмористическая литература'),
  ('satire', 'сатира', 'satire', 'humor', 'Сатирическая литература'),
  ('historical', 'исторический роман', 'historical fiction', 'historical', 'Исторический роман'),
  ('biography', 'биография', 'biography', 'nonfiction', 'Биография/мемуары'),
  ('nonfiction', 'нон-фикшн', 'non-fiction', 'nonfiction', 'Документальная литература'),
  ('children', 'детская литература', 'children literature', 'children', 'Детская литература'),
  ('ya', 'подростковая литература', 'young adult', 'children', 'Подростковая литература')
ON CONFLICT (slug) DO NOTHING;

-- Verification
SELECT 'Migration 0021 completed: Tags system created with ' || COUNT(*) || ' genres' as result
FROM tags;
