-- Gamification seed data
-- Применять после 0044_add_gamification.sql

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'achievement_building_blocks'
  ) THEN
    INSERT INTO "achievement_building_blocks" ("code", "label_ru", "value_type", "supported_operators")
    VALUES
      ('tenure_days', 'Дней с момента регистрации', 'number', '["=", ">", "<", ">=", "<="]'::jsonb),
      ('completed_books', 'Количество завершенных книг', 'number', '["=", ">", "<", ">=", "<="]'::jsonb),
      ('current_streak_days', 'Дней подряд без пропуска', 'number', '["=", ">", "<", ">=", "<="]'::jsonb),
      ('sent_dm_count', 'Количество отправленных личных сообщений', 'number', '["=", ">", "<", ">=", "<="]'::jsonb),
      ('following_count', 'Количество исходящих подписок', 'number', '["=", ">", "<", ">=", "<="]'::jsonb),
      ('followers_count', 'Количество подписчиков', 'number', '["=", ">", "<", ">=", "<="]'::jsonb),
      ('club_sessions_joined', 'Количество посещенных клубных встреч', 'number', '["=", ">", "<", ">=", "<="]'::jsonb),
      ('notes_created_count', 'Количество созданных заметок', 'number', '["=", ">", "<", ">=", "<="]'::jsonb),
      ('profile_completed', 'Профиль заполнен полностью', 'boolean', '["="]'::jsonb),
      ('favorite_genre', 'Выбран любимый жанр', 'string', '["=", "!=", "IN", "NOT IN"]'::jsonb)
    ON CONFLICT ("code") DO UPDATE
    SET
      "label_ru" = EXCLUDED."label_ru",
      "value_type" = EXCLUDED."value_type",
      "supported_operators" = EXCLUDED."supported_operators",
      "updated_at" = now();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'achievements'
  ) THEN
    INSERT INTO "achievements" (
      "code",
      "title_ru",
      "description_ru",
      "icon_type",
      "badge_image_url",
      "reward_payload",
      "conditions_payload",
      "status",
      "sort_order"
    )
    VALUES
      (
        'reader_warmup',
        'Уверенный старт',
        'Выдается читателю за первые заметные шаги: завершенную книгу, недельный ритм и полностью заполненный профиль.',
        'star',
        NULL,
        '{
          "kind": "star",
          "titleRu": "3 звезды за уверенный старт",
          "descriptionRu": "Награда за первую завершенную книгу, недельную активность и оформленный профиль.",
          "value": 3,
          "badgeImageUrl": null
        }'::jsonb,
        '{
          "logic": "AND",
          "items": [
            { "blockCode": "completed_books", "operator": ">=", "valueType": "number", "value": 1 },
            { "blockCode": "current_streak_days", "operator": ">=", "valueType": "number", "value": 7 },
            { "blockCode": "profile_completed", "operator": "=", "valueType": "boolean", "value": true }
          ]
        }'::jsonb,
        'draft',
        10
      ),
      (
        'first_badge_shelf',
        'Первая полка',
        'Бейдж за аккуратно оформленный профиль и первую читательскую заметку.',
        'badge',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22160%22%20height%3D%22160%22%20viewBox%3D%220%200%20160%20160%22%20fill%3D%22none%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%2220%22%20y1%3D%2220%22%20x2%3D%22140%22%20y2%3D%22140%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%230ea5e9%22%20/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%231d4ed8%22%20/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle%20cx%3D%2280%22%20cy%3D%2280%22%20r%3D%2264%22%20fill%3D%22url(%23g)%22%20/%3E%3Ccircle%20cx%3D%2280%22%20cy%3D%2280%22%20r%3D%2252%22%20fill%3D%22rgba(255%2C255%2C255%2C0.16)%22%20/%3E%3Cpath%20d%3D%22M80%2044L89%2067H114L94%2081L102%20106L80%2091L58%20106L66%2081L46%2067H71L80%2044Z%22%20fill%3D%22white%22%20/%3E%3Ctext%20x%3D%2280%22%20y%3D%22132%22%20text-anchor%3D%22middle%22%20font-size%3D%2214%22%20font-family%3D%22Arial%2C%20sans-serif%22%20fill%3D%22white%22%3E%D0%9E%D0%BA%D0%B5%D0%B0%D0%BD%3C/text%3E%3C/svg%3E',
        '{
          "kind": "badge",
          "titleRu": "Бейдж «Первая полка»",
          "descriptionRu": "Награда за заполненный профиль и первую заметку в библиотеке.",
          "value": null,
          "badgeImageUrl": "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22160%22%20height%3D%22160%22%20viewBox%3D%220%200%20160%20160%22%20fill%3D%22none%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%2220%22%20y1%3D%2220%22%20x2%3D%22140%22%20y2%3D%22140%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%230ea5e9%22%20/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%231d4ed8%22%20/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle%20cx%3D%2280%22%20cy%3D%2280%22%20r%3D%2264%22%20fill%3D%22url(%23g)%22%20/%3E%3Ccircle%20cx%3D%2280%22%20cy%3D%2280%22%20r%3D%2252%22%20fill%3D%22rgba(255%2C255%2C255%2C0.16)%22%20/%3E%3Cpath%20d%3D%22M80%2044L89%2067H114L94%2081L102%20106L80%2091L58%20106L66%2081L46%2067H71L80%2044Z%22%20fill%3D%22white%22%20/%3E%3Ctext%20x%3D%2280%22%20y%3D%22132%22%20text-anchor%3D%22middle%22%20font-size%3D%2214%22%20font-family%3D%22Arial%2C%20sans-serif%22%20fill%3D%22white%22%3E%D0%9E%D0%BA%D0%B5%D0%B0%D0%BD%3C/text%3E%3C/svg%3E"
        }'::jsonb,
        '{
          "logic": "AND",
          "items": [
            { "blockCode": "profile_completed", "operator": "=", "valueType": "boolean", "value": true },
            { "blockCode": "notes_created_count", "operator": ">=", "valueType": "number", "value": 1 }
          ]
        }'::jsonb,
        'draft',
        20
      ),
      (
        'genre_explorer',
        'Верность жанру',
        'Награда для читателя, который уже завершил несколько книг и явно определился со своим любимым жанром.',
        'star',
        NULL,
        '{
          "kind": "star",
          "titleRu": "2 звезды за верность жанру",
          "descriptionRu": "Награда за две завершенные книги и выбранный любимый жанр.",
          "value": 2,
          "badgeImageUrl": null
        }'::jsonb,
        '{
          "logic": "AND",
          "items": [
            { "blockCode": "completed_books", "operator": ">=", "valueType": "number", "value": 2 },
            { "blockCode": "favorite_genre", "operator": "=", "valueType": "string", "value": "Фантастика" }
          ]
        }'::jsonb,
        'draft',
        30
      ),
      (
        'club_voice',
        'Голос книжного клуба',
        'Титул для участника, который регулярно приходит в клубные встречи и поддерживает общение с другими читателями.',
        'title',
        NULL,
        '{
          "kind": "title",
          "titleRu": "Титул «Голос книжного клуба»",
          "descriptionRu": "Показывает, что читатель стабильно участвует в жизни клубного сообщества.",
          "value": "Голос книжного клуба",
          "badgeImageUrl": null
        }'::jsonb,
        '{
          "logic": "AND",
          "items": [
            { "blockCode": "club_sessions_joined", "operator": ">=", "valueType": "number", "value": 3 },
            { "blockCode": "sent_dm_count", "operator": ">=", "valueType": "number", "value": 5 }
          ]
        }'::jsonb,
        'draft',
        40
      )
    ON CONFLICT ("code") DO UPDATE
    SET
      "title_ru" = EXCLUDED."title_ru",
      "description_ru" = EXCLUDED."description_ru",
      "icon_type" = EXCLUDED."icon_type",
      "badge_image_url" = EXCLUDED."badge_image_url",
      "reward_payload" = EXCLUDED."reward_payload",
      "conditions_payload" = EXCLUDED."conditions_payload",
      "status" = EXCLUDED."status",
      "sort_order" = EXCLUDED."sort_order",
      "updated_at" = now();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'achievement_reward_assets'
  ) THEN
    -- Удаляем старые reward_assets для идемпотентности
    DELETE FROM "achievement_reward_assets"
    WHERE "name_ru" IN (
      'Звездный читатель',
      'Мастер жанра',
      'Социальная бабочка',
      'Заметный критик',
      'Первопроходец',
      'Одна звезда',
      'Две звезды',
      'Три звезды',
      'Четыре звезды',
      'Пять звезд',
      'Начинающий читатель',
      'Преданный книголюб',
      'Мудрец библиотеки',
      'Чемпион чтения',
      'Легенда библиотеки'
    );

    -- Вставляем свежие данные
    INSERT INTO "achievement_reward_assets" (
      "asset_type",
      "name_ru",
      "image_url",
      "description_ru",
      "group_key",
      "tags",
      "sort_order",
      "is_active"
    )
    VALUES
      -- Badges (5)
      (
        'badge',
        'Звездный читатель',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Ccircle%20cx%3D%22128%22%20cy%3D%22128%22%20r%3D%22120%22%20fill%3D%22%23FFD700%22/%3E%3Cpath%20d%3D%22M128%2040L158%20120L242%20120L180%20170L210%20250L128%20200L46%20250L76%20170L14%20120L98%20120Z%22%20fill%3D%22%23FFA500%22/%3E%3C/svg%3E',
        'Награда за стабильное и увлеченное чтение',
        'badges',
        '["читатель","звезда"]',
        10,
        true
      ),
      (
        'badge',
        'Мастер жанра',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Ccircle%20cx%3D%22128%22%20cy%3D%22128%22%20r%3D%22120%22%20fill%3D%22%235B21B6%22/%3E%3Cpath%20d%3D%22M80%20100L100%2070L120%20100L150%20100L127%20120L140%20150L100%20130L60%20150L73%20120L50%20100Z%22%20fill%3D%22%23E9D5FF%22/%3E%3C/svg%3E',
        'Награда за глубокое изучение одного жанра',
        'badges',
        '["жанр","мастерство"]',
        20,
        true
      ),
      (
        'badge',
        'Социальная бабочка',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Ccircle%20cx%3D%22128%22%20cy%3D%22128%22%20r%3D%22120%22%20fill%3D%22%23EC4899%22/%3E%3Cpath%20d%3D%22M128%2050C90%2050%2060%2080%2060%20120C60%20160%2090%20190%20128%20190C166%20190%20196%20160%20196%20120C196%2080%20166%2050%20128%2050M100%20120C95%20110%2090%20120%2090%20130C90%20140%2095%20145%20100%20140M156%20120C161%20110%20166%20120%20166%20130C166%20140%20161%20145%20156%20140Z%22%20fill%3D%22%23FCE7F3%22/%3E%3C/svg%3E',
        'Награда за активное взаимодействие с сообществом',
        'badges',
        '["социальность","сообщество"]',
        30,
        true
      ),
      (
        'badge',
        'Заметный критик',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Ccircle%20cx%3D%22128%22%20cy%3D%22128%22%20r%3D%22120%22%20fill%3D%22%231E40AF%22/%3E%3Cpath%20d%3D%22M128%2045C180%2045%20211%2076%20211%20128C211%20180%20180%20211%20128%20211C76%20211%2045%20180%2045%20128C45%2076%2076%2045%20128%2045M96%20130L112%20115L128%20130L144%20115L160%20130L144%20150L160%20170L144%20155L128%20170L112%20155L96%20170L112%20150Z%22%20fill%3D%22%23BFDBFE%22/%3E%3C/svg%3E',
        'Награда за конструктивные заметки и рецензии',
        'badges',
        '["заметки","критика"]',
        40,
        true
      ),
      (
        'badge',
        'Первопроходец',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Ccircle%20cx%3D%22128%22%20cy%3D%22128%22%20r%3D%22120%22%20fill%3D%22%2306B6D4%22/%3E%3Cpath%20d%3D%22M128%2050L160%20100L210%20110L170%20150L180%20200L128%20170L76%20200L86%20150L46%20110L96%20100Z%22%20fill%3D%22%23CFFAFE%22/%3E%3C/svg%3E',
        'Награда за первые шаги в приложении',
        'badges',
        '["новичок","начало"]',
        50,
        true
      ),
      -- Stars (5)
      (
        'star',
        'Одна звезда',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Cpath%20d%3D%22M128%2030L158%20110L242%20110L180%20160L210%20240L128%20190L46%20240L76%20160L14%20110L98%20110Z%22%20fill%3D%22%23FCD34D%22/%3E%3C/svg%3E',
        'Одна звезда достижений',
        'stars',
        '["награда","звезда"]',
        10,
        true
      ),
      (
        'star',
        'Две звезды',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20512%20256%22%3E%3Cpath%20d%3D%22M64%2030L94%20110L178%20110L116%20160L146%20240L64%20190L24%20240L54%20160L-8%20110L76%20110Z%22%20fill%3D%22%23FCD34D%22/%3E%3Cpath%20d%3D%22M320%2030L350%20110L434%20110L372%20160L402%20240L320%20190L280%20240L310%20160L248%20110L332%20110Z%22%20fill%3D%22%23FCD34D%22/%3E%3C/svg%3E',
        'Две звезды достижений',
        'stars',
        '["награда","две"]',
        20,
        true
      ),
      (
        'star',
        'Три звезды',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20768%20256%22%3E%3Cpath%20d%3D%22M64%2030L94%20110L178%20110L116%20160L146%20240L64%20190L24%20240L54%20160L-8%20110L76%20110Z%22%20fill%3D%22%23FCD34D%22/%3E%3Cpath%20d%3D%22M320%2030L350%20110L434%20110L372%20160L402%20240L320%20190L280%20240L310%20160L248%20110L332%20110Z%22%20fill%3D%22%23FCD34D%22/%3E%3Cpath%20d%3D%22M576%2030L606%20110L690%20110L628%20160L658%20240L576%20190L536%20240L566%20160L504%20110L588%20110Z%22%20fill%3D%22%23FCD34D%22/%3E%3C/svg%3E',
        'Три звезды достижений',
        'stars',
        '["награда","три"]',
        30,
        true
      ),
      (
        'star',
        'Четыре звезды',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%201024%20256%22%3E%3Cpath%20d%3D%22M64%2030L94%20110L178%20110L116%20160L146%20240L64%20190L24%20240L54%20160L-8%20110L76%20110Z%22%20fill%3D%22%23FCD34D%22/%3E%3Cpath%20d%3D%22M320%2030L350%20110L434%20110L372%20160L402%20240L320%20190L280%20240L310%20160L248%20110L332%20110Z%22%20fill%3D%22%23FCD34D%22/%3E%3Cpath%20d%3D%22M576%2030L606%20110L690%20110L628%20160L658%20240L576%20190L536%20240L566%20160L504%20110L588%20110Z%22%20fill%3D%22%23FCD34D%22/%3E%3Cpath%20d%3D%22M832%2030L862%20110L946%20110L884%20160L914%20240L832%20190L792%20240L822%20160L760%20110L844%20110Z%22%20fill%3D%22%23FCD34D%22/%3E%3C/svg%3E',
        'Четыре звезды достижений',
        'stars',
        '["награда","четыре"]',
        40,
        true
      ),
      (
        'star',
        'Пять звезд',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%201280%20256%22%3E%3Cpath%20d%3D%22M64%2030L94%20110L178%20110L116%20160L146%20240L64%20190L24%20240L54%20160L-8%20110L76%20110Z%22%20fill%3D%22%23FCD34D%22/%3E%3Cpath%20d%3D%22M320%2030L350%20110L434%20110L372%20160L402%20240L320%20190L280%20240L310%20160L248%20110L332%20110Z%22%20fill%3D%22%23FCD34D%22/%3E%3Cpath%20d%3D%22M576%2030L606%20110L690%20110L628%20160L658%20240L576%20190L536%20240L566%20160L504%20110L588%20110Z%22%20fill%3D%22%23FCD34D%22/%3E%3Cpath%20d%3D%22M832%2030L862%20110L946%20110L884%20160L914%20240L832%20190L792%20240L822%20160L760%20110L844%20110Z%22%20fill%3D%22%23FCD34D%22/%3E%3Cpath%20d%3D%22M1088%2030L1118%20110L1202%20110L1140%20160L1170%20240L1088%20190L1048%20240L1078%20160L1016%20110L1100%20110Z%22%20fill%3D%22%23FCD34D%22/%3E%3C/svg%3E',
        'Пять звезд достижений',
        'stars',
        '["награда","пять"]',
        50,
        true
      ),
      -- Titles (5)
      (
        'title',
        'Начинающий читатель',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Crect%20x%3D%2220%22%20y%3D%2250%22%20width%3D%22216%22%20height%3D%22156%22%20fill%3D%22%238B5CF6%22%20rx%3D%2210%22/%3E%3Ctext%20x%3D%22128%22%20y%3D%22140%22%20text-anchor%3D%22middle%22%20font-size%3D%2232%22%20font-weight%3D%22bold%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%3E%D0%9D%D0%BE%D0%B2%D0%B8%D1%87%D0%BE%D0%BA%3C/text%3E%3C/svg%3E',
        'Титул для читателей, только начинающих свой путь',
        'titles',
        '["титул","новичок"]',
        10,
        true
      ),
      (
        'title',
        'Преданный книголюб',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Crect%20x%3D%2220%22%20y%3D%2250%22%20width%3D%22216%22%20height%3D%22156%22%20fill%3D%22%23DC2626%22%20rx%3D%2210%22/%3E%3Ctext%20x%3D%22128%22%20y%3D%22140%22%20text-anchor%3D%22middle%22%20font-size%3D%2224%22%20font-weight%3D%22bold%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%3E%D0%9A%D0%BD%D0%B8%D0%B3%D0%BE%D0%BB%D1%8E%D0%B1%3C/text%3E%3C/svg%3E',
        'Титул для увлеченных читателей',
        'titles',
        '["титул","книги"]',
        20,
        true
      ),
      (
        'title',
        'Мудрец библиотеки',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Crect%20x%3D%2220%22%20y%3D%2250%22%20width%3D%22216%22%20height%3D%22156%22%20fill%3D%22%239333EA%22%20rx%3D%2210%22/%3E%3Ctext%20x%3D%22128%22%20y%3D%22140%22%20text-anchor%3D%22middle%22%20font-size%3D%2224%22%20font-weight%3D%22bold%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%3E%D0%9C%D1%83%D0%B4%D1%80%D0%B5%D1%86%3C/text%3E%3C/svg%3E',
        'Титул для опытных и активных членов сообщества',
        'titles',
        '["титул","опыт"]',
        30,
        true
      ),
      (
        'title',
        'Чемпион чтения',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Crect%20x%3D%2220%22%20y%3D%2250%22%20width%3D%22216%22%20height%3D%22156%22%20fill%3D%22%23EA580C%22%20rx%3D%2210%22/%3E%3Ctext%20x%3D%22128%22%20y%3D%22140%22%20text-anchor%3D%22middle%22%20font-size%3D%2220%22%20font-weight%3D%22bold%22%20fill%3D%22white%22%20font-family%3D%22Arial%22%3E%D0%A7%D0%B5%D0%BC%D0%BF%D0%B8%D0%BE%D0%BD%3C/text%3E%3C/svg%3E',
        'Титул для лидеров чтения и участия',
        'titles',
        '["титул","лидер"]',
        40,
        true
      ),
      (
        'title',
        'Легенда библиотеки',
        'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Crect%20x%3D%2220%22%20y%3D%2250%22%20width%3D%22216%22%20height%3D%22156%22%20fill%3D%22%231F2937%22%20rx%3D%2210%22/%3E%3Ctext%20x%3D%22128%22%20y%3D%22140%22%20text-anchor%3D%22middle%22%20font-size%3D%2220%22%20font-weight%3D%22bold%22%20fill%3D%22%23FCD34D%22%20font-family%3D%22Arial%22%3E%D0%9B%D0%B5%D0%B3%D0%B5%D0%BD%D0%B4%D0%B0%3C/text%3E%3C/svg%3E',
        'Титул для наиболее выдающихся и легендарных читателей',
        'titles',
        '["титул","легенда"]',
        50,
        true
      );
  END IF;
END $$;