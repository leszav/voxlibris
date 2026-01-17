import dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import bcrypt from 'bcrypt';
import { books, clubs, clubTags, users, bookContent } from '../shared/schema';

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

const BOOKS_DATA = [
  {
    id: 'book-1',
    title: 'Мастер и Маргарита',
    author: 'М. Булгаков',
    coverUrl: '/assets/generated_images/modern_fiction_book_cover_design.png',
    description: 'Роман Михаила Булгакова, сочетающий философскую притчу, фантастическую мистерию и психологический реализм.',
    isbn: '978-5-17-084567-8',
    totalChapters: 32,
    contentType: 'text'
  },
  {
    id: 'book-2',
    title: 'Гордость и предубеждение',
    author: 'Джейн Остин',
    coverUrl: '/assets/generated_images/classic_novel_book_cover_design.png',
    description: 'Классический роман о любви, предрассудках и социальных условностях викторианской Англии.',
    isbn: '978-5-389-14257-4',
    totalChapters: 61,
    contentType: 'text'
  },
  {
    id: 'book-3',
    title: 'Безмолвный пациент',
    author: 'Алекс Михаэлидес',
    coverUrl: '/assets/generated_images/mystery_thriller_book_cover_design.png',
    description: 'Психологический триллер о женщине, которая отказывается говорить после убийства мужа.',
    isbn: '978-5-04-099458-7',
    totalChapters: 15,
    contentType: 'text'
  },
  {
    id: 'book-4',
    title: 'Дюна',
    author: 'Фрэнк Герберт',
    coverUrl: '/assets/generated_images/modern_fiction_book_cover_design.png',
    description: 'Эпическая научно-фантастическая сага о политике, религии, экологии и человеческой эволюции.',
    isbn: '978-5-17-098765-3',
    totalChapters: 48,
    contentType: 'text'
  },
  {
    id: 'book-5',
    title: 'Milk and Honey',
    author: 'Рупи Каур',
    coverUrl: '/assets/generated_images/modern_fiction_book_cover_design.png',
    description: 'Сборник стихов о выживании, исцелении, любви и потере.',
    isbn: '978-1-4494-7425-6',
    totalChapters: 4,
    contentType: 'text'
  }
];

const CLUBS_DATA = [
  {
    id: 'club-1',
    title: 'Полуночная Библиотека',
    description: 'Уютный клуб для ценителей классической литературы. Читаем в атмосфере старой библиотеки.',
    bookId: 'book-1',
    ownerId: 'admin-user-id', // будет заменен на реального админа
    type: 'standard' as const,
    maxMembers: 20,
    isLive: true,
    schedule: JSON.stringify({ 
      days: ['monday', 'wednesday', 'friday'], 
      time: '20:00',
      timezone: 'UTC+3' 
    })
  },
  {
    id: 'club-2', 
    title: 'Кофе и Классика',
    description: 'Читаем великие произведения за чашкой виртуального кофе. Профессиональный чтец ведет.',
    bookId: 'book-2',
    ownerId: 'admin-user-id',
    type: 'reader-led' as const,
    maxMembers: 200,
    schedule: JSON.stringify({ 
      days: ['tuesday', 'thursday'], 
      time: '19:00',
      timezone: 'UTC+3' 
    })
  },
  {
    id: 'club-3',
    title: 'Детективный Понедельник', 
    description: 'Еженедельные встречи для любителей детективов и триллеров.',
    bookId: 'book-3',
    ownerId: 'admin-user-id',
    type: 'standard' as const,
    maxMembers: 15,
    schedule: JSON.stringify({ 
      days: ['monday'], 
      time: '21:00',
      timezone: 'UTC+3' 
    })
  },
  {
    id: 'club-4',
    title: 'Sci-Fi Будущее',
    description: 'Погружаемся в миры научной фантастики и обсуждаем будущее человечества.',
    bookId: 'book-4',
    ownerId: 'admin-user-id', 
    type: 'standard' as const,
    maxMembers: 50,
    schedule: JSON.stringify({ 
      days: ['wednesday', 'saturday'], 
      time: '18:00',
      timezone: 'UTC+3' 
    })
  },
  {
    id: 'club-5',
    title: 'Уголок Поэзии',
    description: 'Премиум клуб для ценителей современной поэзии и лирики.',
    bookId: 'book-5',
    ownerId: 'admin-user-id',
    type: 'premium' as const,
    maxMembers: 10,
    isLive: true,
    schedule: JSON.stringify({ 
      days: ['friday'], 
      time: '20:30',
      timezone: 'UTC+3' 
    })
  }
];

const CLUB_TAGS_DATA = [
  { clubId: 'club-1', tag: 'Классика' },
  { clubId: 'club-1', tag: 'Мистика' },
  
  { clubId: 'club-2', tag: 'Роман' },
  { clubId: 'club-2', tag: 'Классика' },
  { clubId: 'club-2', tag: 'Клуб Чтеца' },
  
  { clubId: 'club-3', tag: 'Триллер' },
  { clubId: 'club-3', tag: 'Детектив' },
  
  { clubId: 'club-4', tag: 'Фантастика' },
  { clubId: 'club-4', tag: 'Эпос' },
  
  { clubId: 'club-5', tag: 'Поэзия' },
  { clubId: 'club-5', tag: 'Современное' }
];

const BOOK_CONTENT_DATA = [
  {
    bookId: 'book-1',
    chapterNumber: 1,
    title: 'Глава 1. Никогда не разговаривайте с неизвестными',
    content: 'В час жаркого весеннего заката на Патриарших прудах появились два гражданина. Первый из них, одетый в летнюю серенькую пару, был маленького роста, упитан, лыс, свою приличную шляпу пирожком нёс в руке, а на хорошо выбритом лице его помещались сверхъестественных размеров очки в чёрной роговой оправе.',
    wordCount: 156
  },
  {
    bookId: 'book-1',
    chapterNumber: 2,
    title: 'Глава 2. Понтий Пилат',
    content: 'В белом плаще с кровавым подбоем, шаркающей кавалерийской походкой, ранним утром четырнадцатого числа весеннего месяца нисана в крытую колоннаду между двумя крыльями дворца ирода Великого вышел прокуратор Иудеи Понтий Пилат.',
    wordCount: 142
  },
  {
    bookId: 'book-2',
    chapterNumber: 1,
    title: 'Глава 1',
    content: 'Общеизвестная истина, что холостой человек, располагающий средствами, должен испытывать потребность в жене. Как бы мало ни были знакомы чувства и намерения такого человека окружающим его при первом появлении в какой-нибудь местности, эта истина так прочно утвердилась в их сознании, что на него немедленно начинают смотреть как на законную собственность одной из соседских дочек.',
    wordCount: 178
  },
  {
    bookId: 'book-3',
    chapterNumber: 1,
    title: 'Пролог',
    content: 'Алисия Беренсон убила своего мужа Габриэля шесть лет назад. С тех пор она не произнесла ни слова. Отказ говорить или объясняться загнал её в частную психиатрическую клинику под названием "Роща". Я психотерапевт. Меня зовут Тео Фабер. И я хочу работать с Алисией.',
    wordCount: 98
  },
  {
    bookId: 'book-4',
    chapterNumber: 1,
    title: 'Книга первая. Дюна',
    content: 'В начале была пустыня Арракиса, и у пустыни было три имени: одно было её именем собственным, другое — именем, которое дали ей люди, пришедшие сюда в поисках мелафа, третьим именем была надежда. Герцог Лето Атрейдес получал эту планету как новое феодальное владение, но знал, что это — ловушка.',
    wordCount: 134
  },
  {
    bookId: 'book-5',
    chapterNumber: 1,
    title: 'the hurting',
    content: 'you were born to be a blessing, not a burden. you were born to be wanted, not to wonder if you deserve to take up space on this earth.',
    wordCount: 28
  }
];

async function seed() {
  try {
    console.log('🌱 Seeding database...');

    // Get or create admin user
    let adminUser = await db.select().from(users).where(eq(users.username, 'svv@8ls.ru')).limit(1);
    
    if (adminUser.length === 0) {
      console.log('👤 Creating admin user...');
      const hashedPassword = await bcrypt.hash('Sv2#2vSvS', 10);
      const newAdminUser = await db.insert(users).values({
        username: 'svv@8ls.ru',
        password: hashedPassword,
        role: 'admin',
        status: 'active'
      }).returning();
      adminUser = newAdminUser;
    } else {
      console.log('👤 Updating existing admin user...');
      const hashedPassword = await bcrypt.hash('Sv2#2vSvS', 10);
      const updatedAdminUser = await db.update(users)
        .set({
          password: hashedPassword,
          role: 'admin',
          status: 'active'
        })
        .where(eq(users.username, 'svv@8ls.ru'))
        .returning();
      adminUser = updatedAdminUser;
    }

    const adminId = adminUser[0].id;

    // Insert books
    console.log('📚 Adding books...');
    await db.insert(books).values(BOOKS_DATA).onConflictDoNothing();

    // Insert clubs with correct admin ID
    console.log('🏛️ Adding clubs...');
    const clubsWithAdmin = CLUBS_DATA.map(club => ({
      ...club,
      ownerId: adminId
    }));
    await db.insert(clubs).values(clubsWithAdmin).onConflictDoNothing();

    // Insert club tags
    console.log('🏷️ Adding club tags...');
    await db.insert(clubTags).values(CLUB_TAGS_DATA).onConflictDoNothing();

    // Insert book content
    console.log('📖 Adding book content...');
    await db.insert(bookContent).values(BOOK_CONTENT_DATA).onConflictDoNothing();

    console.log('✅ Database seeded successfully!');
    console.log(`📊 Added: ${BOOKS_DATA.length} books, ${CLUBS_DATA.length} clubs, ${CLUB_TAGS_DATA.length} tags, ${BOOK_CONTENT_DATA.length} chapters`);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    await client.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
}

export { seed };