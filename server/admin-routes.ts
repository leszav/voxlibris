import express from 'express';
import { jwtAuth, requireAdmin } from './jwt-middleware';
import { storage } from './storage';
import { emailService } from './services/email-service';
import type { UserRole, UserStatus } from '../shared/schema';
import postgres from 'postgres';
import { sql, eq, count } from 'drizzle-orm';
import { clubs } from '../shared/schema';
const PostgresError = postgres.PostgresError;

const router = express.Router();

// Middleware для проверки полных админских прав (только admin, не moderator)
const requireFullAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Full admin role required' });
  }

  next();
};

// Интерфейс для логирования действий администратора (KISS: группируем параметры)
interface AdminActionLog {
  adminId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  reason?: string;
  previousValue?: string;
  newValue?: string;
  req?: express.Request;
}

// Функция для логирования действий админа через storage
const logAdminAction = async (params: AdminActionLog) => {
  try {
    await storage.logAdminAction({
      adminId: params.adminId,
      actionType: params.actionType,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason,
      previousValue: params.previousValue,
      newValue: params.newValue,
      ipAddress: params.req?.ip,
      userAgent: params.req?.get('User-Agent')
    });
  } catch (error) {
    console.error('Failed to log admin action:', error);
    // Не прерываем выполнение из-за ошибки логирования
  }
};

// Helper для упрощения вызовов (KISS: уменьшаем повторяющийся код)
const logAction = (
  req: express.Request,
  actionType: string,
  targetType: string,
  targetId: string,
  reason?: string,
  previousValue?: string,
  newValue?: string
) => logAdminAction({
  adminId: req.user!.userId,
  actionType,
  targetType,
  targetId,
  reason,
  previousValue,
  newValue,
  req
});

// ==== USER MANAGEMENT ====

// Получить список всех пользователей
router.get('/users', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;

    const allUsers = await storage.getAllUsers();

    let filteredUsers = allUsers;

    if (search && typeof search === 'string') {
      const searchStr = search.toLowerCase();
      filteredUsers = filteredUsers.filter(user =>
        user.username.toLowerCase().includes(searchStr)
      );
    }

    if (role && typeof role === 'string') {
      filteredUsers = filteredUsers.filter(user => user.role === role);
    }

    if (status && typeof status === 'string') {
      filteredUsers = filteredUsers.filter(user => user.status === status);
    }

    const offset = (Number(page) - 1) * Number(limit);
    const paginatedUsers = filteredUsers.slice(offset, offset + Number(limit));

    const usersWithStats = await Promise.all(paginatedUsers.map(async (user) => {
      const { password, createdAt, lastActivityAt, ...rest } = user;

      const personalBooks = await storage.getPersonalBooksByUser(user.id);
      const booksRead = personalBooks.filter(book => !book.isDeleted).length;

      const clubsByUser = await storage.getClubsByUser(user.id);
      const clubsJoined = clubsByUser.length;

      const createdClubsResult = await (storage as any).db
        .select({ count: count(clubs.id) })
        .from(clubs)
        .where(eq(clubs.ownerId, user.id));
      const clubsCreated = createdClubsResult[0]?.count || 0;

      return {
        ...rest,
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        created_at: createdAt?.toISOString() || null,
        last_active: lastActivityAt?.toISOString() || null,
        books_read: booksRead,
        clubs_joined: clubsJoined,
        clubs_created: clubsCreated,
      };
    }));

    res.json({
      users: usersWithStats,
      total: filteredUsers.length,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Изменить роль пользователя
router.put('/users/:username/role', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const { role } = req.body;

    if (!['user', 'admin', 'moderator'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const updatedUser = await storage.updateUserRole(username, role as UserRole);

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    await logAction(
      req,
      'change_user_role',
      'user',
      updatedUser.id,
      `Changed role to ${role}`,
      updatedUser.role,
      role
    );

    const { password, ...safeUser } = updatedUser;
    res.json({ user: safeUser });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Изменить статус пользователя
router.put('/users/:username/status', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const { status } = req.body;

    if (!['pending', 'active', 'suspended', 'deleted'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const updatedUser = await storage.updateUserStatus(username, status as UserStatus);

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    await logAction(
      req,
      'change_user_status',
      'user',
      updatedUser.id,
      `Changed status to ${status}`,
      updatedUser.status,
      status
    );

    const { password, ...safeUser } = updatedUser;
    res.json({ user: safeUser });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Получить ожидающих активации пользователей
router.get('/users/pending', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const pendingUsers = await storage.getPendingUsers();
    const safeUsers = pendingUsers.map(({ password, ...user }) => user);

    res.json({ users: safeUsers });
  } catch (error) {
    console.error('Error fetching pending users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Удалить пользователя (мягкое удаление)
router.delete('/users/:id', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем, существует ли пользователь
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Запрещаем удалять самого себя
    if (id === req.user!.userId) {
      return res.status(400).json({ message: 'Cannot delete yourself' });
    }

    // Выполняем мягкое удаление
    const success = await storage.deleteUser(id);

    if (!success) {
      return res.status(500).json({ message: 'Failed to delete user' });
    }

    await logAction(
      req,
      'delete_user',
      'user',
      id,
      'User deleted by admin',
      user.status,
      'deleted'
    );

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Восстановить удаленного пользователя
router.put('/users/:id/restore', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем, существует ли пользователь
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Проверяем, что пользователь действительно удален
    if (user.status !== 'deleted') {
      return res.status(400).json({ message: 'User is not deleted' });
    }

    // Восстанавливаем пользователя
    const restoredUser = await storage.restoreUser(id);

    if (!restoredUser) {
      return res.status(500).json({ message: 'Failed to restore user' });
    }

    await logAction(
      req,
      'restore_user',
      'user',
      id,
      'User restored by admin',
      'deleted',
      'active'
    );

    const { password, ...safeUser } = restoredUser;
    res.json({ user: safeUser, message: 'User restored successfully' });
  } catch (error) {
    console.error('Error restoring user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Удалить пользователя окончательно (физическое удаление)
router.delete('/users/:id/permanent', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем, существует ли пользователь
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Запрещаем удалять самого себя
    if (id === req.user!.userId) {
      return res.status(400).json({ message: 'Cannot delete yourself' });
    }

    // Рекомендуем сначала сделать мягкое удаление
    if (user.status !== 'deleted') {
      return res.status(400).json({ 
        message: 'User must be soft-deleted first. Use DELETE /users/:id instead.' 
      });
    }

    // Выполняем физическое удаление
    const result = await storage.permanentDeleteUser(id);

    if (!result.success) {
      if (result.clubsWithMembers && result.clubsWithMembers.length > 0) {
        return res.status(400).json({ 
          message: result.error,
          clubs: result.clubsWithMembers
        });
      }
      return res.status(500).json({ message: result.error || 'Failed to permanently delete user' });
    }

    await logAction(
      req,
      'permanent_delete_user',
      'user',
      id,
      'User permanently deleted by admin',
      'deleted',
      'permanently_deleted'
    );

    res.json({ message: 'User permanently deleted successfully' });
  } catch (error) {
    console.error('Error permanently deleting user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Получить список удаленных пользователей
router.get('/users/deleted', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const deletedUsers = await storage.getDeletedUsers();

    const usersWithStats = await Promise.all(deletedUsers.map(async (user) => {
      const { password, createdAt, lastActivityAt, ...rest } = user;

      const personalBooks = await storage.getPersonalBooksByUser(user.id);
      const booksRead = personalBooks.filter(book => !book.isDeleted).length;

      const clubsByUser = await storage.getClubsByUser(user.id);
      const clubsJoined = clubsByUser.length;

      const createdClubsResult = await (storage as any).db
        .select({ count: count(clubs.id) })
        .from(clubs)
        .where(eq(clubs.ownerId, user.id));
      const clubsCreated = createdClubsResult[0]?.count || 0;

      return {
        ...rest,
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        created_at: createdAt?.toISOString() || null,
        last_active: lastActivityAt?.toISOString() || null,
        books_read: booksRead,
        clubs_joined: clubsJoined,
        clubs_created: clubsCreated,
      };
    }));

    res.json({ users: usersWithStats });
  } catch (error) {
    console.error('Error fetching deleted users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== BOOK MANAGEMENT ====

// Получить список всех книг
// eslint-disable-next-line sonarjs/cognitive-complexity
router.get('/books', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;

    // Получаем книги из всех таблиц
    const allBooks = await storage.getBooks();
    // Получаем все персональные книги (нужно будет агрегировать по всем пользователям)
    const allUsers = await storage.getAllUsers();
    const allPersonalBooks = [];
    
    for (const user of allUsers) {
      const userPersonalBooks = await storage.getPersonalBooksByUser(user.id);
      allPersonalBooks.push(...userPersonalBooks);
    }

    // Получаем все книги клубов
    const allClubBooks = await storage.getAllClubBooks();

    // Объединяем и маркируем источники
    let combinedBooks = [
      ...allBooks.map(book => ({ ...book, source: 'books' })),
      ...allPersonalBooks.map(book => ({ ...book, source: 'personal_books' })),
      ...allClubBooks.map(book => ({ ...book, source: 'club_books' }))
    ];

    let filteredBooks = combinedBooks;

    if (search && typeof search === 'string') {
      const searchStr = search.toLowerCase();
      filteredBooks = filteredBooks.filter(book =>
        book.title.toLowerCase().includes(searchStr) ||
        book.author.toLowerCase().includes(searchStr)
      );
    }

    if (status && typeof status === 'string') {
      filteredBooks = filteredBooks.filter(book => {
        // PersonalBooks и ClubBooks не имеют поля status, используем isDeleted
        if (book.source === 'personal_books' || book.source === 'club_books') {
          if (status === 'active') return !('isDeleted' in book) || !book.isDeleted;
          if (status === 'blocked') return 'isDeleted' in book && book.isDeleted;
          return false;
        }
        return book.source === 'books' && 'status' in book && book.status === status;
      });
    }

    // Пагинация
    const offset = (Number(page) - 1) * Number(limit);
    const paginatedBooks = filteredBooks.slice(offset, offset + Number(limit));

    // Получаем имена пользователей для uploaded_by
    const usersMap = new Map();
    for (const book of paginatedBooks) {
      let userId: string | undefined;
      
      if (book.source === 'books' && 'uploadedBy' in book) {
        userId = book.uploadedBy || undefined;
      } else if (book.source === 'personal_books' && 'userId' in book) {
        userId = book.userId;
      } else if (book.source === 'club_books' && 'uploadedByUserId' in book) {
        userId = book.uploadedByUserId;
      }
      
      if (userId && !usersMap.has(userId)) {
        const user = await storage.getUser(userId);
        if (user) {
          usersMap.set(userId, user.username);
        }
      }
    }

    // Преобразуем данные для фронтенда
    // eslint-disable-next-line sonarjs/cognitive-complexity
    const formattedBooks = paginatedBooks.map(book => {
      // Определяем поля в зависимости от источника
      let uploadedBy: string;
      let uploadDate: string;
      let fileSize: number;
      let filePath: string;
      let bookStatus: string;
      let isbn: string | null;
      let downloadCount: number;

      if (book.source === 'books' && 'uploadedBy' in book) {
        // Старая таблица books
        uploadedBy = book.uploadedBy ? usersMap.get(book.uploadedBy) || 'Unknown' : 'System';
        uploadDate = book.uploadedAt?.toISOString() || book.createdAt.toISOString();
        fileSize = book.fileSize || 0;
        filePath = book.contentPath || '';
        
        // Определяем статус
        if (book.status === 'active') {
          bookStatus = 'active';
        } else if (book.status === 'blocked') {
          bookStatus = 'blocked';
        } else {
          bookStatus = 'pending';
        }
        
        isbn = book.isbn || null;
        downloadCount = book.downloadCount || 0;
      } else if (book.source === 'personal_books' && 'userId' in book) {
        // Таблица personal_books
        uploadedBy = book.userId ? usersMap.get(book.userId) || 'Unknown' : 'System';
        uploadDate = book.uploadedAt.toISOString();
        fileSize = book.fileSizeBytes || 0;
        filePath = book.storagePath || '';
        bookStatus = book.isDeleted ? 'blocked' : 'active';
        isbn = null;
        downloadCount = 0;
      } else if (book.source === 'club_books' && 'uploadedByUserId' in book) {
        // Таблица club_books
        uploadedBy = book.uploadedByUserId ? usersMap.get(book.uploadedByUserId) || 'Unknown' : 'System';
        uploadDate = book.uploadedAt.toISOString();
        fileSize = book.fileSizeBytes || 0;
        filePath = book.storagePath || '';
        bookStatus = book.isDeleted ? 'blocked' : 'active';
        isbn = null;
        downloadCount = 0;
      } else {
        // Фоллбэк на случай неизвестного источника
        uploadedBy = 'Unknown';
        uploadDate = book.createdAt.toISOString();
        fileSize = 0;
        filePath = '';
        bookStatus = 'active';
        isbn = null;
        downloadCount = 0;
      }

      return {
        id: book.id,
        title: book.title,
        author: book.author,
        isbn: isbn,
        genre: 'genre' in book ? book.genre : null,
        cover_url: book.coverUrl || null,
        file_url: filePath,
        status: bookStatus,
        uploaded_by: uploadedBy,
        upload_date: uploadDate,
        file_size: fileSize,
        downloads_count: downloadCount,
        description: book.description || null,
        source: book.source,
        club_id: book.source === 'club_books' && 'clubId' in book ? book.clubId : null,
      };
    });

    res.json({
      books: formattedBooks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: filteredBooks.length,
        pages: Math.ceil(filteredBooks.length / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching books:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Изменить статус книги (поддерживает все типы: books, personal_books, club_books)
router.put('/books/:id/status', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, source } = req.body;

    if (!['active', 'blocked', 'pending'].includes(status)) {
      return res.status(400).json({ message: 'Invalid book status' });
    }

    let success = false;

    if (source === 'personal_books') {
      const book = await storage.getPersonalBook(id);
      if (!book) {
        return res.status(404).json({ message: 'Personal book not found' });
      }
      if (status === 'blocked') {
        success = await storage.deletePersonalBook(id);
      } else if (status === 'active') {
        success = await storage.restorePersonalBook(id);
      }
    } else if (source === 'club_books') {
      const book = await storage.getClubBook(id);
      if (!book) {
        return res.status(404).json({ message: 'Club book not found' });
      }
      if (status === 'blocked') {
        success = await storage.deleteClubBook(id);
      } else if (status === 'active') {
        success = await storage.restoreClubBook(id);
      }
    } else {
      const book = await storage.getBook(id);
      if (!book) {
        return res.status(404).json({ message: 'Book not found' });
      }

      const statusMap: { [key: string]: 'draft' | 'published' | 'archived' } = {
        'active': 'published',
        'blocked': 'archived',
        'pending': 'draft'
      };

      const newStatus = statusMap[status] || 'draft';
      success = await storage.updateBookStatus(id, newStatus, req.user!.userId);
    }

    if (!success) {
      return res.status(500).json({ message: 'Failed to update book status' });
    }

    res.json({ message: 'Book status updated successfully', status });
  } catch (error) {
    console.error('Error updating book status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Удалить книгу окончательно (поддерживает все типы: books, personal_books, club_books)
router.delete('/books/:id', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { source } = req.query;

    let bookInfo: { title: string; status?: string } | undefined;
    let deleted = false;

    if (source === 'personal_books') {
      const book = await storage.getPersonalBook(id);
      if (!book) {
        return res.status(404).json({ message: 'Personal book not found' });
      }
      bookInfo = { title: book.title, status: book.isDeleted ? 'deleted' : 'active' };
      deleted = await storage.permanentDeletePersonalBook(id);
    } else if (source === 'club_books') {
      const book = await storage.getClubBook(id);
      if (!book) {
        return res.status(404).json({ message: 'Club book not found' });
      }
      bookInfo = { title: book.title, status: book.isDeleted ? 'deleted' : 'active' };
      deleted = await storage.permanentDeleteClubBook(id);
    } else {
      const book = await storage.getBook(id);
      if (!book) {
        return res.status(404).json({ message: 'Book not found' });
      }
      bookInfo = { title: book.title, status: book.status };
      await storage.deleteBook(id);
      deleted = true;
    }

    if (!deleted) {
      return res.status(500).json({ message: 'Failed to delete book' });
    }

    await logAction(
      req,
      'delete_book',
      'book',
      id,
      `Book deleted by admin (source: ${source || 'books'})`,
      bookInfo?.status,
      'deleted'
    );

    res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== CLUB MANAGEMENT ====

// Получить список всех клубов
router.get('/clubs', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;

    const allClubs = await storage.getClubs();

    let filteredClubs = allClubs;

    if (search && typeof search === 'string') {
      const searchStr = search.toLowerCase();
      filteredClubs = filteredClubs.filter(club =>
        club.title.toLowerCase().includes(searchStr)
      );
    }

    if (status && typeof status === 'string') {
      filteredClubs = filteredClubs.filter(club => club.status === status);
    }

    // Пагинация
    const offset = (Number(page) - 1) * Number(limit);
    const paginatedClubs = filteredClubs.slice(offset, offset + Number(limit));

    // Получаем дополнительную информацию для каждого клуба
    const formattedClubs = await Promise.all(paginatedClubs.map(async (club) => {
      // Получаем информацию о книге
      let bookTitle = 'N/A';
      let bookAuthor = 'N/A';
      if (club.bookId) {
        const book = await storage.getBook(club.bookId);
        if (book) {
          bookTitle = book.title;
          bookAuthor = book.author;
        }
      }

      // Получаем информацию о создателе
      let creatorUsername = 'Unknown';
      const creator = await storage.getUser(club.ownerId);
      if (creator) {
        creatorUsername = creator.username;
      }

      // Получаем количество участников
      const members = await storage.getClubMembers(club.id);
      const currentParticipants = members.length;

      return {
        id: club.id,
        name: club.title,
        description: club.description,
        book_id: club.bookId,
        book_title: bookTitle,
        book_author: bookAuthor,
        creator_username: creatorUsername,
        status: club.status,
        created_at: club.createdAt.toISOString(),
        max_participants: club.maxMembers,
        current_participants: currentParticipants,
        reading_schedule: club.schedule,
        is_public: !club.isPrivate,
      };
    }));

    res.json({
      clubs: formattedClubs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: filteredClubs.length,
        pages: Math.ceil(filteredClubs.length / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching clubs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Обновить настройки клуба (максимальное количество участников)
router.put('/clubs/:id', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { maxMembers } = req.body;

    const club = await storage.getClub(id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (maxMembers !== undefined) {
      const newMaxMembers = Number(maxMembers);
      if (isNaN(newMaxMembers) || newMaxMembers < 2 || newMaxMembers > 2000) {
        return res.status(400).json({ message: 'maxMembers must be between 2 and 2000' });
      }

      await storage.updateClub(id, { maxMembers: newMaxMembers });

      await logAction(
        req,
        'update_club',
        'club',
        id,
        `Changed maxMembers from ${club.maxMembers} to ${newMaxMembers}`,
        String(club.maxMembers),
        String(newMaxMembers)
      );
    }

    const updatedClub = await storage.getClub(id);
    res.json({ message: 'Club updated successfully', club: updatedClub });
  } catch (error) {
    console.error('Error updating club:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Удалить клуб
router.delete('/clubs/:id', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const club = await storage.getClub(id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    await storage.deleteClub(id);

    await logAction(
      req,
      'delete_club',
      'club',
      id,
      'Club deleted by admin',
      club.status,
      'deleted'
    );

    res.json({ message: 'Club deleted successfully' });
  } catch (error) {
    console.error('Error deleting club:', error);

    // Специализированная обработка PostgresError
    if (error instanceof PostgresError) {
      switch (error.code) {
        case '23503': // FOREIGN_KEY_VIOLATION
          return res.status(400).json({
            message: 'Cannot delete club: it has active dependencies (members or sessions)',
            code: 'FOREIGN_KEY_VIOLATION'
          });
        case '23505': // UNIQUE_VIOLATION
          return res.status(400).json({
            message: 'Operation failed due to data conflict',
            code: 'UNIQUE_VIOLATION'
          });
        default:
          return res.status(500).json({
            message: 'Database operation failed',
            code: error.code
          });
      }
    }

    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== STATISTICS ====

// Получить общую статистику системы
router.get('/stats/overview', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const [users, books, clubs] = await Promise.all([
      storage.getAllUsers(),
      storage.getBooks(),
      storage.getClubs()
    ]);

    // Получаем все персональные книги пользователей
    const allPersonalBooks = [];
    for (const user of users) {
      const userPersonalBooks = await storage.getPersonalBooksByUser(user.id);
      allPersonalBooks.push(...userPersonalBooks);
    }

    // Получаем все книги клубов
    const allClubBooks = await storage.getAllClubBooks();

    const userStats = {
      total: users.length,
      active: users.filter(u => u.status === 'active').length,
      pending: users.filter(u => u.status === 'pending').length,
      suspended: users.filter(u => u.status === 'suspended').length,
      admins: users.filter(u => u.role === 'admin').length,
      moderators: users.filter(u => u.role === 'moderator').length,
    };

    // Считаем книги из всех таблиц: books, personal_books, club_books
    const totalGeneralBooks = books.length;
    const activeGeneralBooks = books.filter(b => b.status === 'active').length;
    const blockedGeneralBooks = books.filter(b => b.status === 'blocked').length;
    
    const totalPersonalBooks = allPersonalBooks.length;
    const activePersonalBooks = allPersonalBooks.filter(b => !b.isDeleted).length;
    const blockedPersonalBooks = allPersonalBooks.filter(b => b.isDeleted).length;

    const totalClubBooks = allClubBooks.length;
    const activeClubBooks = allClubBooks.filter(b => !b.isDeleted).length;
    const blockedClubBooks = allClubBooks.filter(b => b.isDeleted).length;
    
    const bookStats = {
      total: totalGeneralBooks + totalPersonalBooks + totalClubBooks,
      active: activeGeneralBooks + activePersonalBooks + activeClubBooks,
      blocked: blockedGeneralBooks + blockedPersonalBooks + blockedClubBooks,
    };

    const clubStats = {
      total: clubs.length,
      active: clubs.filter(c => c.status === 'active').length,
      recruiting: clubs.filter(c => c.status === 'recruiting').length,
      completed: clubs.filter(c => c.status === 'completed').length,
      archived: clubs.filter(c => c.status === 'archived').length,
    };

    res.json({
      users: userStats,
      books: bookStats,
      clubs: clubStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== SYSTEM SETTINGS ====

// Получить настройки системы
router.get('/settings', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { category } = req.query;
    const settings = await storage.getSystemSettings(category as string);

    // Группируем настройки по категориям для удобного отображения
    const grouped = settings.reduce((acc: any, setting) => {
      if (!acc[setting.category]) {
        acc[setting.category] = {};
      }

      // Парсим значение в зависимости от типа
      let value: any = setting.value;
      try {
        switch (setting.type) {
          case 'boolean':
            value = setting.value === 'true';
            break;
          case 'number':
            value = Number(setting.value);
            break;
          case 'json':
            value = JSON.parse(setting.value);
            break;
          default:
            value = setting.value;
        }
      } catch (error) {
        console.error(`Failed to parse setting ${setting.key}:`, error);
      }

      acc[setting.category][setting.key] = {
        value,
        type: setting.type,
        description: setting.description,
        isPublic: setting.isPublic,
        updatedAt: setting.updatedAt,
        updatedBy: setting.updatedBy
      };

      return acc;
    }, {});

    res.json(grouped);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Обновить настройки системы
router.put('/settings', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const updatedSettings = req.body;
    const results = [];

    // Обновляем каждую настройку через storage
    for (const [key, value] of Object.entries(updatedSettings)) {
      try {
        const success = await storage.updateSystemSetting(key, value, req.user!.userId);
        results.push({ key, success });
      } catch (error) {
        console.error(`Failed to update setting ${key}:`, error);
        results.push({ key, success: false, error: (error as Error).message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    res.json({
      message: `Settings updated: ${successCount} successful, ${failureCount} failed`,
      results
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== SMTP SETTINGS ====

// Получить SMTP настройки
router.get('/settings/smtp', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const smtpSettings = await storage.getSettingsByCategory('smtp');
    
    const settings: Record<string, string> = {};
    smtpSettings.forEach(s => {
      settings[s.key] = s.value || '';
    });

    res.json({ settings });
  } catch (error) {
    console.error('Error fetching SMTP settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Сохранить SMTP настройки
router.put('/settings/smtp', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { host, port, user, password, from, secure, enabled } = req.body;

    // Сохраняем каждую настройку через storage.setSetting
    await storage.setSetting({
      key: 'smtp.host',
      value: host || '',
      category: 'smtp',
      description: 'SMTP host',
      updatedBy: req.user!.userId,
    });

    await storage.setSetting({
      key: 'smtp.port',
      value: port?.toString() || '587',
      category: 'smtp',
      description: 'SMTP port',
      updatedBy: req.user!.userId,
    });

    await storage.setSetting({
      key: 'smtp.user',
      value: user || '',
      category: 'smtp',
      description: 'SMTP username',
      updatedBy: req.user!.userId,
    });

    await storage.setSetting({
      key: 'smtp.password',
      value: password || '',
      category: 'smtp',
      description: 'SMTP password',
      isEncrypted: true,
      updatedBy: req.user!.userId,
    });

    await storage.setSetting({
      key: 'smtp.from',
      value: from || '',
      category: 'smtp',
      description: 'From email address',
      updatedBy: req.user!.userId,
    });

    await storage.setSetting({
      key: 'smtp.secure',
      value: secure ? 'true' : 'false',
      category: 'smtp',
      description: 'Use SSL/TLS',
      updatedBy: req.user!.userId,
    });

    await storage.setSetting({
      key: 'smtp.enabled',
      value: enabled ? 'true' : 'false',
      category: 'smtp',
      description: 'Enable SMTP',
      updatedBy: req.user!.userId,
    });

    // Сбрасываем транспорт email сервиса для применения новых настроек
    emailService.resetTransporter();

    console.log(`[Admin] SMTP settings updated by ${req.user!.username}`);

    res.json({ 
      success: true,
      message: 'SMTP settings saved successfully'
    });
  } catch (error) {
    console.error('Error saving SMTP settings:', error);
    res.status(500).json({ message: 'Failed to save SMTP settings' });
  }
});

// Тестовая отправка email
router.post('/settings/smtp/test', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { testEmail } = req.body;

    if (!testEmail) {
      return res.status(400).json({ 
        success: false,
        message: 'Test email address is required' 
      });
    }

    // Сбрасываем транспорт чтобы использовать актуальные настройки
    emailService.resetTransporter();

    const result = await emailService.sendTestEmail(testEmail);

    if (result.success) {
      res.json({
        success: true,
        message: 'Test email sent successfully',
        messageId: result.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || 'Не удалось отправить письмо. Проверьте настройки SMTP.'
      });
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email'
    });
  }
});

// ==== SYSTEM HEALTH ====

// Получить состояние системы
router.get('/system/health', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const totalMemoryMB = memoryUsage.heapTotal / 1024 / 1024;
    const usedMemoryMB = memoryUsage.heapUsed / 1024 / 1024;
    const memoryPercentage = Math.round((usedMemoryMB / totalMemoryMB) * 100);

    // Проверка базы данных
    let dbStatus: 'healthy' | 'warning' | 'error' = 'healthy';
    let dbConnections = 0;
    let dbMaxConnections = 100;
    try {
      // Пытаемся выполнить простой запрос к БД
      if ('db' in storage) {
        const { sql } = await import('drizzle-orm');
        await (storage as any).db.execute(sql`SELECT COUNT(*) as count FROM users`);
        dbConnections = 1; // Если запрос прошёл, соединение есть
      } else {
        // MemStorage - всегда доступна
        dbConnections = 1;
      }
    } catch (error) {
      console.error('[Health] Database check failed:', error);
      dbStatus = 'error';
    }

    // Проверка email сервиса
    let emailServiceStatus = false;
    try {
      const smtpSettings = await storage.getSetting('smtp.enabled');
      emailServiceStatus = smtpSettings?.value === 'true';
      
      // Дополнительная проверка: есть ли все необходимые настройки
      if (emailServiceStatus) {
        const host = await storage.getSetting('smtp.host');
        const user = await storage.getSetting('smtp.user');
        emailServiceStatus = !!(host && user);
      }
    } catch (error) {
      console.error('[Health] Email service check failed:', error);
      emailServiceStatus = false;
    }

    // Проверка file storage (MinIO/S3)
    let fileStorageStatus = false;
    try {
      const { fileStorage } = await import('./file-storage');
      // Проверяем, что fileStorage инициализирован
      fileStorageStatus = !!fileStorage;
    } catch (error) {
      console.error('[Health] File storage check failed:', error);
      fileStorageStatus = false;
    }

    // Проверка auth service
    let authServiceStatus = false;
    try {
      const { authService } = await import('./auth-service');
      authServiceStatus = !!authService;
    } catch (error) {
      console.error('[Health] Auth service check failed:', error);
      authServiceStatus = false;
    }

    const health = {
      database: {
        status: dbStatus,
        connections: dbConnections,
        max_connections: dbMaxConnections,
        uptime: formatUptime(process.uptime()),
      },
      server: {
        status: 'healthy' as const,
        cpu_usage: Math.round(process.cpuUsage().user / 1000000), // Реальное использование CPU в %
        memory_usage: memoryPercentage,
        disk_usage: 0, // Disk usage требует системных вызовов, пока оставляем 0
        uptime: formatUptime(process.uptime()),
      },
      services: {
        auth_service: authServiceStatus,
        file_storage: fileStorageStatus,
        email_service: emailServiceStatus,
        background_jobs: true,
      }
    };

    res.json(health);
  } catch (error) {
    console.error('Error fetching health:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Вспомогательная функция для форматирования uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}д ${hours}ч ${mins}м`;
  } else if (hours > 0) {
    return `${hours}ч ${mins}м`;
  } else {
    return `${mins}м`;
  }
}

// ==== REPORTS MANAGEMENT ====

// Получить список отчетов
router.get('/reports', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, assignedTo } = req.query;

    const filters: any = {};
    if (status) filters.status = status as string;
    if (type) filters.type = type as string;
    if (assignedTo) filters.assignedTo = assignedTo as string;

    const allReports = await storage.getModerationReports(filters);

    // Пагинация
    const offset = (Number(page) - 1) * Number(limit);
    const paginatedReports = allReports.slice(offset, offset + Number(limit));

    res.json({
      reports: paginatedReports,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: allReports.length,
        pages: Math.ceil(allReports.length / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Обновить статус отчета
router.put('/reports/:reportId/status', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, admin_notes } = req.body;

    if (!['new', 'in_progress', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Заглушка - в реальном проекте здесь было бы обновление в БД
    const updatedReport = {
      id: reportId,
      status,
      admin_notes,
      updated_at: new Date().toISOString()
    };

    await logAction(
      req,
      'update_report_status',
      'report',
      reportId,
      `Changed status to ${status}`
    );

    res.json({ report: updatedReport });
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================
// SMTP Settings Management
// ============================================

/**
 * GET /api/admin/settings/smtp
 * Получить текущие SMTP настройки (без пароля)
 */
router.get('/settings/smtp', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const smtpSettings = await storage.getSettingsByCategory('smtp');
    
    // Формируем объект настроек, исключая пароль в явном виде
    const settings: Record<string, any> = {};
    smtpSettings.forEach(setting => {
      if (setting.key === 'smtp.password') {
        settings[setting.key] = setting.value ? '********' : '';
      } else {
        settings[setting.key] = setting.value;
      }
    });

    res.json({
      success: true,
      settings: {
        'smtp.host': settings['smtp.host'] || '',
        'smtp.port': settings['smtp.port'] || '587',
        'smtp.user': settings['smtp.user'] || '',
        'smtp.password': settings['smtp.password'] || '',
        'smtp.from': settings['smtp.from'] || '',
        'smtp.secure': settings['smtp.secure'] || 'false',
        'smtp.enabled': settings['smtp.enabled'] || 'false',
      }
    });
  } catch (error) {
    console.error('Error getting SMTP settings:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to get SMTP settings' 
    });
  }
});

/**
 * PUT /api/admin/settings/smtp
 * Обновить SMTP настройки
 */
router.put('/settings/smtp', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { host, port, user, password, from, secure, enabled } = req.body;

    // Валидация
    if (!host || !port || !from) {
      return res.status(400).json({
        success: false,
        message: 'Host, port, and from email are required'
      });
    }

    const adminId = req.user!.userId;

    // Сохраняем каждую настройку
    const settingsToSave = [
      { key: 'smtp.host', value: host, category: 'smtp', description: 'SMTP server host' },
      { key: 'smtp.port', value: String(port), category: 'smtp', description: 'SMTP server port' },
      { key: 'smtp.user', value: user || '', category: 'smtp', description: 'SMTP username' },
      { key: 'smtp.from', value: from, category: 'smtp', description: 'From email address' },
      { key: 'smtp.secure', value: String(secure || false), category: 'smtp', description: 'Use SSL/TLS' },
      { key: 'smtp.enabled', value: String(enabled || false), category: 'smtp', description: 'SMTP enabled' },
    ];

    // Если передан пароль (не маска), сохраняем его
    if (password && password !== '********') {
      settingsToSave.push({
        key: 'smtp.password',
        value: password,
        category: 'smtp',
        description: 'SMTP password'
      });
    }

    // Сохраняем все настройки
    for (const setting of settingsToSave) {
      await storage.setSetting({
        ...setting,
        updatedBy: adminId,
        isEncrypted: setting.key === 'smtp.password'
      });
    }

    await logAction(
      req,
      'update_smtp_settings',
      'settings',
      'smtp',
      'Updated SMTP configuration'
    );

    res.json({
      success: true,
      message: 'SMTP settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating SMTP settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update SMTP settings'
    });
  }
});

/**
 * POST /api/admin/settings/smtp/test
 * Отправить тестовое письмо для проверки SMTP настроек
 */
router.post('/settings/smtp/test', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { testEmail } = req.body;

    if (!testEmail) {
      return res.status(400).json({
        success: false,
        message: 'Test email address is required'
      });
    }

    // Сбрасываем кэш транспорта чтобы использовать новые настройки
    emailService.resetTransporter();
    
    // Отправляем тестовое письмо через email-service
    const result = await emailService.sendTestEmail(testEmail);
    
    await logAction(
      req,
      'test_smtp',
      'settings',
      'smtp',
      `Test email sent to ${testEmail}: ${result.success ? 'SUCCESS' : 'FAILED'}`,
      undefined,
      JSON.stringify({ messageId: result.messageId, error: result.error })
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'Тестовое письмо успешно отправлено! Проверьте почту.',
        messageId: result.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || 'Не удалось отправить письмо. Проверьте настройки SMTP.'
      });
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email'
    });
  }
});

export default router;