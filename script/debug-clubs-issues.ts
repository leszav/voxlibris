/**
 * Скрипт для отладки проблем с клубами
 * 
 * Проблемы для проверки:
 * 1. Клуб не виден в каталоге (нужен endpoint для всех клубов, не только клубов пользователя)
 * 2. Кнопка "Загрузить книгу" не отображается владельцу (проверка роли isOwner)
 * 3. Кнопка "Загрузить книгу" исчезает в библиотеке после перезагрузки
 */

import postgres from 'postgres';
import 'dotenv/config';

const sql = postgres(process.env.DATABASE_URL!, {
  max: 1
});

async function debugClubsIssues() {
  console.log('🔍 Диагностика проблем с клубами\n');

  // ПРОБЛЕМА 1: Каталог клубов
  console.log('=== ПРОБЛЕМА 1: Клубы в каталоге ===');
  const allClubs = await sql`
    SELECT id, title, owner_id, is_private, is_active, status, created_at
    FROM clubs
    ORDER BY created_at DESC
  `;
  console.log(`📊 Всего клубов в БД: ${allClubs.length}`);
  
  if (allClubs.length === 0) {
    console.log('❌ Клубы отсутствуют в БД!\n');
    await sql.end();
    return;
  }

  allClubs.forEach((club, index) => {
    console.log(`\n${index + 1}. "${club.title}" (ID: ${club.id.substring(0, 8)}...)`);
    console.log(`   Владелец: ${club.owner_id.substring(0, 8)}...`);
    console.log(`   Приватный: ${club.is_private ? '🔒 Да' : '🌐 Нет'}`);
    console.log(`   Активный: ${club.is_active ? '✅' : '❌'}`);
    console.log(`   Статус: ${club.status}`);
  });

  const testClubId = allClubs[0].id;
  const testOwnerId = allClubs[0].owner_id;

  // Проверяем, есть ли endpoint для получения ВСЕХ клубов (не только пользователя)
  console.log('\n💡 ГИПОТЕЗА 1: В каталоге используется useClubs(), который возвращает только клубы пользователя.');
  console.log('   РЕШЕНИЕ: Нужен отдельный endpoint GET /api/clubs/catalog для всех клубов.\n');

  // ПРОБЛЕМА 2: Роль владельца и кнопка загрузки
  console.log('=== ПРОБЛЕМА 2: Определение роли владельца ===');
  
  const members = await sql`
    SELECT 
      cm.id as membership_id,
      cm.user_id,
      cm.role,
      cm.joined_at,
      u.id as user_table_id,
      u.username
    FROM club_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.club_id = ${testClubId}
    ORDER BY cm.joined_at
  `;

  console.log(`📊 Участников в тестовом клубе "${allClubs[0].title}": ${members.length}`);
  
  if (members.length === 0) {
    console.log('❌ Нет участников! Владелец не был автоматически добавлен.\n');
  } else {
    members.forEach((member, index) => {
      console.log(`\n${index + 1}. ${member.username}`);
      console.log(`   User ID: ${member.user_id.substring(0, 8)}...`);
      console.log(`   Membership ID: ${member.membership_id.substring(0, 8)}...)`);
      console.log(`   Роль: ${member.role === 'owner' ? '👑 ВЛАДЕЛЕЦ' : member.role}`);
      console.log(`   Присоединился: ${member.joined_at}`);
    });

    const owner = members.find(m => m.role === 'owner');
    if (owner) {
      console.log(`\n💡 ГИПОТЕЗА 2: В club-details.tsx проверка isOwner:`);
      console.log(`   currentUserMember = members.find(m => m.id === user?.userId)`);
      console.log(`   Проблема: m.id может быть membership_id (${owner.membership_id.substring(0, 8)}...)`);
      console.log(`   А user?.userId это user_id (${owner.user_id.substring(0, 8)}...)`);
      console.log(`   РЕШЕНИЕ: Проверить, что возвращает API getClubMembersWithRoles\n`);
    }
  }

  // Проверяем структуру, которую возвращает getClubMembersWithRoles
  console.log('=== Проверка storage.getClubMembersWithRoles ===');
  const apiMembers = await sql`
    SELECT 
      u.id,
      u.username,
      u.status,
      u.email_confirmed as "emailConfirmed",
      u.created_at as "createdAt",
      cm.role,
      cm.joined_at as "joinedAt"
    FROM club_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.club_id = ${testClubId}
    ORDER BY 
      CASE cm.role
        WHEN 'owner' THEN 1
        WHEN 'moderator' THEN 2
        ELSE 3
      END,
      cm.joined_at ASC
  `;

  console.log('📊 Структура данных из API:');
  if (apiMembers.length > 0) {
    const firstMember = apiMembers[0];
    console.log('   Поля в объекте:');
    Object.keys(firstMember).forEach(key => {
      console.log(`   - ${key}: ${typeof firstMember[key as keyof typeof firstMember]}`);
    });
    console.log(`\n   ⚠️  ВАЖНО: Поле 'id' = user.id (${firstMember.id.substring(0, 8)}...)`);
    console.log(`   Правильное сравнение: member.id === user?.userId ✅`);
  }

  // ПРОБЛЕМА 3: Кнопка загрузки в библиотеке
  console.log('\n=== ПРОБЛЕМА 3: Кнопка "Загрузить книгу" в библиотеке ===');
  
  const testUser = await sql`
    SELECT id, username, status, email_confirmed
    FROM users
    WHERE id = ${testOwnerId}
  `;

  if (testUser.length > 0) {
    const user = testUser[0];
    console.log(`\n📊 Тестовый пользователь: ${user.username}`);
    console.log(`   User ID: ${user.id.substring(0, 8)}...`);
    console.log(`   Статус: ${user.status === 'active' ? '✅ ACTIVE' : `❌ ${user.status}`}`);
    console.log(`   Email подтвержден: ${user.email_confirmed ? '✅' : '❌'}`);

    console.log(`\n💡 ГИПОТЕЗА 3: В library.tsx кнопка зависит от isActiveUser`);
    console.log(`   const isActiveUser = user?.status === 'active'`);
    console.log(`   Возможная проблема: состояние user теряется при перезагрузке.`);
    console.log(`   РЕШЕНИЕ: Проверить useAuth хук и персистентность данных.\n`);
  }

  // Проверяем, что возвращает API /api/clubs
  console.log('=== ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: API Endpoints ===');
  console.log(`\n📍 GET /api/clubs - возвращает клубы ПОЛЬЗОВАТЕЛЯ (где он участник)`);
  console.log(`   Используется в: catalog.tsx, my-clubs.tsx`);
  console.log(`   Проблема: В каталоге должны быть ВСЕ клубы`);
  console.log(`\n📍 Нужен: GET /api/clubs/catalog - все публичные и приватные клубы`);
  console.log(`   Приватные: помечать как "Закрытый" + "Отправить запрос"`);
  console.log(`   Публичные: "Вступить"`);

  await sql.end();
  console.log('\n✅ Диагностика завершена\n');
}

debugClubsIssues().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
