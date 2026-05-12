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