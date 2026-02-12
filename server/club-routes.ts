import express from 'express';
import { jwtAuth, requireActiveUser } from './jwt-middleware.js';
import { storage } from './repositories/index.js';
import type { InsertClub, ClubMemberRole, InsertClubInvitation, Club, UserRole } from '../shared/schema.js';
import { emailService } from './services/email-service.js';
import crypto from 'node:crypto';
import { logger } from './lib/logger.js';

const router = express.Router();

// Helper: проверка доступа к приватному клубу
// Админы и модераторы системы имеют доступ ко всем клубам
async function canAccessPrivateClub(
  club: Club,
  userId: string,
  userRole: UserRole
): Promise<{ allowed: boolean; reason?: string }> {
  // Админы и модераторы системы имеют доступ ко всем клубам
  if (userRole === 'admin' || userRole === 'moderator') {
    return { allowed: true };
  }

  // Публичные клубы доступны всем
  if (!club.isPrivate) {
    return { allowed: true };
  }

  // Для приватных клубов проверяем членство
  const membership = await storage.getUserClubMembership(club.id, userId);
  if (membership) {
    return { allowed: true };
  }

  return { 
    allowed: false, 
    reason: 'Это закрытый клуб. Для доступа необходимо получить приглашение от участника клуба.' 
  };
}

// Helper: robust lookup of invitation by token with small fallbacks
async function findInvitationByToken(token: string) {
  if (!token) return undefined;
  // try direct lookup
  let inv = await storage.getClubInvitation(token);
  if (inv) return inv;

  // try decoded
  try {
    const decoded = decodeURIComponent(token);
    if (decoded && decoded !== token) {
      inv = await storage.getClubInvitation(decoded);
      if (inv) return inv;
    }
  } catch (err) {
    console.warn('Failed to decode invite token:', err);
  }

  // try lowercase
  const lower = token.toLowerCase();
  if (lower !== token) {
    inv = await storage.getClubInvitation(lower);
    if (inv) return inv;
  }

  return undefined;
}

/**
 * POST /api/clubs
 * Создание нового клуба (только для активных пользователей)
 */
router.post('/', jwtAuth, requireActiveUser, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Валидация данных
    const clubData: InsertClub & { ownerId: string } = {
      title: req.body.title,
      description: req.body.description,
      coverImage: req.body.coverImage,
      bookId: req.body.bookId, // необязательное - книга загружается отдельно
      ownerId: req.user.userId,
      type: req.body.type || 'standard',
      maxMembers: req.body.maxMembers || 50,
      isPrivate: req.body.isPrivate || false,
      schedule: req.body.schedule,
      settings: req.body.settings,
    };

    // Проверяем обязательное поле title
    if (!clubData.title) {
      return res.status(400).json({ 
        message: 'Title is required' 
      });
    }

    // Проверяем уникальность названия клуба
    const existingClub = await storage.getClubByTitle(clubData.title);
    if (existingClub) {
      return res.status(409).json({ 
        message: 'Клуб с таким названием уже существует' 
      });
    }

    // Книга загружается отдельно через /api/clubs/:id/books/upload после создания клуба
    // bookId не используется при создании
    clubData.bookId = undefined;

    // Создаем клуб (владелец автоматически добавляется в createClub)
    const club = await storage.createClub(clubData);

    logger.info(`[Clubs] Club "${club.title}" created by user ${req.user.username}`);

    res.status(201).json(club);
  } catch (error) {
    console.error('Error creating club:', error);
    res.status(500).json({ message: 'Failed to create club' });
  }
});

/**
 * GET /api/clubs/catalog
 * Получить все клубы для каталога (публичные и приватные)
 * Не требует аутентификации
 */
router.get('/catalog', async (req, res) => {
  try {
    const clubs = await storage.getAllClubs();
    res.json(clubs);
  } catch (error) {
    console.error('Error getting catalog clubs:', error);
    res.status(500).json({ message: 'Failed to get clubs' });
  }
});

/**
 * GET /api/clubs
 * Получить список клубов пользователя
 */
router.get('/', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const clubs = await storage.getClubsByUser(req.user.userId);
    res.json(clubs);
  } catch (error) {
    console.error('Error getting clubs:', error);
    res.status(500).json({ message: 'Failed to get clubs' });
  }
});

/**
 * GET /api/clubs/:id
 * Получить детали клуба
 */
router.get('/:id', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Проверяем доступ к приватному клубу
    const access = await canAccessPrivateClub(club, req.user.userId, req.user.role as UserRole);
    if (!access.allowed) {
      return res.status(403).json({ 
        message: access.reason,
        code: 'PRIVATE_CLUB_ACCESS_DENIED',
        isPrivate: true
      });
    }

    res.json(club);
  } catch (error) {
    console.error('Error getting club:', error);
    res.status(500).json({ message: 'Failed to get club' });
  }
});

/**
 * PUT /api/clubs/:id
 * Обновить клуб (только владелец)
 */
router.put('/:id', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Проверяем, является ли пользователь владельцем
    const membership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (membership?.role !== 'owner') {
      return res.status(403).json({ message: 'Only club owner can update club' });
    }

    const updates: Partial<InsertClub> = {
      title: req.body.title,
      description: req.body.description,
      coverImage: req.body.coverImage,
      maxMembers: req.body.maxMembers,
      isPrivate: req.body.isPrivate,
      schedule: req.body.schedule,
      settings: req.body.settings,
    };

    logger.info('[Clubs] Update request body settings: %s', req.body.settings?.substring(0, 200));

    // Удаляем undefined значения
    Object.keys(updates).forEach(key => 
      updates[key as keyof typeof updates] === undefined && delete updates[key as keyof typeof updates]
    );

    const updatedClub = await storage.updateClub(club.id, updates);

    if (!updatedClub) {
      return res.status(500).json({ message: 'Ошибка при обновлении клуба' });
    }

    logger.info(`[Clubs] Club "${club.title}" updated by user ${req.user.username}`);
    logger.info('[Clubs] Updated club settings: %s', updatedClub.settings?.substring(0, 200));

    res.json(updatedClub);
  } catch (error) {
    console.error('Error updating club:', error);
    res.status(500).json({ message: 'Failed to update club' });
  }
});

/**
 * DELETE /api/clubs/:id
 * Удалить клуб (только владелец)
 */
router.delete('/:id', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Проверяем, является ли пользователь владельцем
    const membership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (membership?.role !== 'owner') {
      return res.status(403).json({ message: 'Only club owner can delete club' });
    }

    await storage.deleteClub(club.id);

    logger.info(`[Clubs] Club "${club.title}" deleted by user ${req.user.username}`);

    res.json({ success: true, message: 'Club deleted successfully' });
  } catch (error) {
    console.error('Error deleting club:', error);
    res.status(500).json({ message: 'Failed to delete club' });
  }
});

/**
 * GET /api/clubs/:id/members
 * Получить список участников клуба
 */
router.get('/:id/members', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Проверяем доступ к приватному клубу
    const access = await canAccessPrivateClub(club, req.user.userId, req.user.role as UserRole);
    if (!access.allowed) {
      return res.status(403).json({ 
        message: access.reason,
        code: 'PRIVATE_CLUB_ACCESS_DENIED',
        isPrivate: true
      });
    }

    const members = await storage.getClubMembersWithRoles(req.params.id);
    res.json(members);
  } catch (error) {
    console.error('Error getting club members:', error);
    res.status(500).json({ message: 'Failed to get club members' });
  }
});

/**
 * PUT /api/clubs/:id/members/:userId/role
 * Изменить роль участника (только владелец и модераторы)
 */
router.put('/:id/members/:userId/role', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Проверяем права: владелец может менять любые роли, модератор только member
    const requesterMembership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (!requesterMembership) {
      return res.status(403).json({ message: 'You are not a member of this club' });
    }

    if (requesterMembership.role !== 'owner' && requesterMembership.role !== 'moderator') {
      return res.status(403).json({ message: 'Only club owner or moderator can change roles' });
    }

    const newRole: ClubMemberRole = req.body.role;
    if (!['owner', 'moderator', 'member'].includes(newRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // Модератор не может назначать владельцев или модераторов
    if (requesterMembership.role === 'moderator' && newRole !== 'member') {
      return res.status(403).json({ message: 'Moderators can only change role to member' });
    }

    const updatedMember = await storage.updateMemberRole(club.id, req.params.userId, newRole);

    logger.info(`[Clubs] User ${req.params.userId} role changed to ${newRole} in club "${club.title}"`);

    res.json(updatedMember);
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ message: 'Failed to update member role' });
  }
});

/**
 * DELETE /api/clubs/:id/members/:userId
 * Удалить участника из клуба (владелец, модератор или сам участник)
 */
router.delete('/:id/members/:userId', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    const requesterMembership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (!requesterMembership) {
      return res.status(403).json({ message: 'You are not a member of this club' });
    }

    const targetUserId = req.params.userId;

    // Пользователь может удалить себя
    if (targetUserId === req.user.userId) {
      await storage.removeMember(club.id, targetUserId);
      logger.info(`[Clubs] User ${req.user.username} left club "${club.title}"`);
      return res.json({ success: true, message: 'Successfully left the club' });
    }

    // Только владелец и модератор могут удалять других
    if (requesterMembership.role !== 'owner' && requesterMembership.role !== 'moderator') {
      return res.status(403).json({ message: 'Only club owner or moderator can remove members' });
    }

    // Владельца нельзя удалить
    const targetMembership = await storage.getUserClubMembership(club.id, targetUserId);
    if (targetMembership?.role === 'owner') {
      return res.status(403).json({ message: 'Cannot remove club owner' });
    }

    // Модератор не может удалять других модераторов
    if (requesterMembership.role === 'moderator' && targetMembership?.role === 'moderator') {
      return res.status(403).json({ message: 'Moderators cannot remove other moderators' });
    }

    await storage.removeMember(club.id, targetUserId);

    logger.info(`[Clubs] User ${targetUserId} removed from club "${club.title}" by ${req.user.username}`);

    res.json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ message: 'Failed to remove member' });
  }
});

/**
 * POST /api/clubs/:id/invite
 * Пригласить участника в клуб по email
 */
router.post('/:id/invite', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Valid email is required' });
    }

    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Проверяем права: только владелец и модератор могут приглашать
    const membership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'moderator')) {
      return res.status(403).json({ message: 'Only club owner or moderator can invite members' });
    }

    // Проверяем, не заполнен ли клуб
    if (club.memberCount >= club.maxMembers) {
      return res.status(409).json({ message: 'Club is full' });
    }

    // Проверяем, не существует ли уже активное приглашение для этого email
    const existingInvitations = await storage.getClubInvitations(club.id);
    const activeInvitation = existingInvitations.find(
      inv => inv.email === email && inv.status === 'pending' && new Date(inv.expiresAt) > new Date()
    );

    if (activeInvitation) {
      return res.status(409).json({ message: 'Active invitation already exists for this email' });
    }

    // Генерируем уникальный токен приглашения
    const inviteToken = crypto.randomBytes(32).toString('hex');
    
    // Приглашение действительно 7 дней
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Создаем запись в БД
    const invitation: InsertClubInvitation = {
      clubId: club.id,
      email,
      invitedBy: req.user.userId,
      inviteToken,
      expiresAt,
    };

    const createdInvitation = await storage.createClubInvitation(invitation);

    // Отправляем email
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const emailSent = await emailService.sendClubInvitation({
      email,
      clubName: club.title,
      clubDescription: club.description || 'Присоединяйтесь к нашему клубу!',
      inviterName: req.user.username,
      inviteToken,
      expiresAt,
      baseUrl,
    });

    if (!emailSent) {
      console.warn(`[Clubs] Email invitation not sent to ${email} - SMTP may not be configured`);
    }

    logger.info(`[Clubs] Invitation sent to ${email} for club "${club.title}" by ${req.user.username}`);

    res.status(201).json({
      message: emailSent 
        ? 'Invitation sent successfully' 
        : 'Invitation created but email not sent (SMTP not configured)',
      invitation: {
        id: createdInvitation.id,
        email: createdInvitation.email,
        status: createdInvitation.status,
        expiresAt: createdInvitation.expiresAt,
        emailSent,
      }
    });
  } catch (error) {
    console.error('Error inviting member:', error);
    res.status(500).json({ message: 'Failed to send invitation' });
  }
});

/**
 * GET /api/clubs/:id/invitations
 * Получить список приглашений клуба (только для владельца и модератора)
 */
router.get('/:id/invitations', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const club = await storage.getClub(req.params.id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Проверяем права: владелец/модератор клуба или админ/модератор системы
    const userRole = req.user.role as UserRole;
    const isSystemAdmin = userRole === 'admin' || userRole === 'moderator';
    const membership = await storage.getUserClubMembership(club.id, req.user.userId);
    const isClubModerator = membership?.role === 'owner' || membership?.role === 'moderator';
    
    if (!isSystemAdmin && !isClubModerator) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const invitations = await storage.getClubInvitations(club.id);

    // Получаем информацию о пригласивших пользователях
    const invitationsWithInviters = await Promise.all(
      invitations.map(async (inv) => {
        const inviter = await storage.getUser(inv.invitedBy);
        return {
          id: inv.id,
          email: inv.email,
          status: inv.status,
          createdAt: inv.createdAt,
          expiresAt: inv.expiresAt,
          acceptedAt: inv.acceptedAt,
          inviterName: inviter?.username || null,
        };
      })
    );

    res.json({ invitations: invitationsWithInviters });
  } catch (error) {
    console.error('Error getting invitations:', error);
    res.status(500).json({ message: 'Failed to get invitations' });
  }
});

/**
 * GET /api/invitations/:token
 * Получить информацию о приглашении по токену
 */
router.get('/invitations/:token', async (req, res) => {
  try {
    const invitation = await findInvitationByToken(req.params.token);
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    // Проверяем срок действия
    if (new Date(invitation.expiresAt) < new Date()) {
      await storage.updateInvitationStatus(req.params.token, 'expired');
      return res.status(410).json({ message: 'Invitation has expired' });
    }

    // Получаем информацию о клубе
    const club = await storage.getClub(invitation.clubId);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Получаем информацию о пригласившем пользователе
    const inviter = await storage.getUser(invitation.invitedBy);

    res.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        inviterName: inviter?.username || null,
      },
      club: {
        id: club.id,
        title: club.title,
        description: club.description,
        isPrivate: club.isPrivate,
        memberCount: club.memberCount,
        maxMembers: club.maxMembers,
      },
    });
  } catch (error) {
    console.error('Error getting invitation:', error);
    res.status(500).json({ message: 'Failed to get invitation' });
  }
});

/**
 * POST /api/invitations/:token/accept
 * Принять приглашение в клуб
 */
router.post('/invitations/:token/accept', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const invitation = await findInvitationByToken(req.params.token);
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    // Проверяем статус приглашения
    if (invitation.status !== 'pending') {
      return res.status(409).json({ 
        message: `Invitation already ${invitation.status}` 
      });
    }

    // Проверяем срок действия
    if (new Date(invitation.expiresAt) < new Date()) {
      await storage.updateInvitationStatus(req.params.token, 'expired');
      return res.status(410).json({ message: 'Invitation has expired' });
    }

    const club = await storage.getClub(invitation.clubId);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Проверяем, не заполнен ли клуб
    if (club.memberCount >= club.maxMembers) {
      return res.status(409).json({ message: 'Club is full' });
    }

    // Проверяем, не является ли пользователь уже участником
    const existingMembership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (existingMembership) {
      // Обновляем статус приглашения
      await storage.updateInvitationStatus(req.params.token, 'accepted', new Date());
      return res.status(409).json({ message: 'You are already a member of this club' });
    }

    // Добавляем пользователя в клуб
    const membership = await storage.joinClub(club.id, req.user.userId, 'member');

    // Обновляем статус приглашения
    await storage.updateInvitationStatus(req.params.token, 'accepted', new Date());

    // Отправляем уведомление владельцу клуба
    const inviter = await storage.getUser(invitation.invitedBy);
    if (inviter) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      await emailService.sendInvitationAccepted({
        email: inviter.username, // assuming username is email
        clubName: club.title,
        memberName: req.user.username,
        baseUrl,
      });
    }

    logger.info(`[Clubs] User ${req.user.username} accepted invitation to club "${club.title}"`);

    res.json({
      message: 'Successfully joined the club',
      club: {
        id: club.id,
        title: club.title,
        description: club.description,
      },
      membership,
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ message: 'Failed to accept invitation' });
  }
});

/**
 * POST /api/invitations/:token/decline
 * Отклонить приглашение в клуб
 */
router.post('/invitations/:token/decline', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const invitation = await storage.getClubInvitation(req.params.token);
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    // Проверяем статус приглашения
    if (invitation.status !== 'pending') {
      return res.status(409).json({ 
        message: `Invitation already ${invitation.status}` 
      });
    }

    // Вместо установки статуса 'declined' удаляем приглашение —
    // система ожидает, что приглашение либо создано, либо удалено.
    const deleted = await storage.deleteClubInvitation(invitation.id);
    const tokenPreview = req.params.token.substring(0, 8) + '...';
    if (!deleted) {
      console.warn(`[Clubs] Failed to delete declined invitation token ${tokenPreview}`);
      return res.status(500).json({ message: 'Failed to decline invitation' });
    }

    logger.info(`[Clubs] User declined and deleted invitation token ${tokenPreview}`);

    res.json({ message: 'Invitation declined and removed' });
  } catch (error) {
    console.error('Error declining invitation:', error);
    res.status(500).json({ message: 'Failed to decline invitation' });
  }
});

/**
 * DELETE /api/clubs/:clubId/invitations/:invitationId
 * Отозвать приглашение (только владелец и модератор)
 */
router.delete('/:clubId/invitations/:invitationId', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { clubId, invitationId } = req.params;

    const club = await storage.getClub(clubId);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Проверяем права
    const membership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'moderator')) {
      return res.status(403).json({ message: 'Only club owner or moderator can revoke invitations' });
    }

    const success = await storage.deleteClubInvitation(invitationId);
    if (!success) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    logger.info(`[Clubs] Invitation ${invitationId} revoked by ${req.user.username}`);

    res.json({ message: 'Invitation revoked successfully' });
  } catch (error) {
    console.error('Error revoking invitation:', error);
    res.status(500).json({ message: 'Failed to revoke invitation' });
  }
});

/**
 * POST /api/clubs/:clubId/invitations/by-email
 * Удалить все приглашения для указанного email (для очистки приглашений)
 */
router.post('/:clubId/invitations/by-email', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { clubId } = req.params;
    const { email } = req.body;

    logger.info(`[Clubs] Remove invitations request: clubId=${clubId}, email=${email}`);

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: 'Email is required' });
    }

    const club = await storage.getClub(clubId);
    logger.info({ found: Boolean(club) }, '[Clubs] Club found');
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    const membership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'moderator')) {
      return res.status(403).json({ message: 'Only club owner or moderator can remove invitations' });
    }

    const deletedCount = await storage.deleteClubInvitationsByEmail(clubId, email.toLowerCase());

    logger.info(`[Clubs] Invitations for ${email} removed by ${req.user.username}: ${deletedCount} invitations deleted`);

    res.json({ 
      message: `Invitations removed successfully`,
      deletedCount 
    });
  } catch (error) {
    console.error('Error removing invitations by email:', error);
    res.status(500).json({ message: 'Failed to remove invitations' });
  }
});

/**
 * DELETE /api/clubs/:clubId/invitations
 * Удалить все приглашения клуба (только владелец)
 */
router.delete('/:clubId/invitations', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { clubId } = req.params;
    logger.info(`[Clubs] Clear all invitations request: clubId=${clubId}`);

    const club = await storage.getClub(clubId);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    const membership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (membership?.role !== 'owner') {
      return res.status(403).json({ message: 'Only club owner can clear all invitations' });
    }

    const invitations = await storage.getClubInvitations(clubId);
    let deletedCount = 0;
    
    for (const inv of invitations) {
      await storage.deleteClubInvitation(inv.id);
      deletedCount++;
    }

    logger.info(`[Clubs] All invitations cleared by ${req.user.username}: ${deletedCount} invitations deleted`);

    res.json({ 
      message: `All invitations cleared successfully`,
      deletedCount 
    });
  } catch (error) {
    console.error('Error clearing all invitations:', error);
    res.status(500).json({ message: 'Failed to clear invitations' });
  }
});

/**
 * DELETE /api/clubs/:clubId/invitations/:invitationId
 * Отозвать приглашение (только владелец и модератор)
 */
router.post('/:clubId/invitations/by-email', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { clubId } = req.params;
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: 'Email is required' });
    }

    const club = await storage.getClub(clubId);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    const membership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'moderator')) {
      return res.status(403).json({ message: 'Only club owner or moderator can remove invitations' });
    }

    const deletedCount = await storage.deleteClubInvitationsByEmail(clubId, email.toLowerCase());

    logger.info(`[Clubs] Invitations for ${email} removed by ${req.user.username}: ${deletedCount} invitations deleted`);

    res.json({ 
      message: `Invitations removed successfully`,
      deletedCount 
    });
  } catch (error) {
    console.error('Error removing invitations by email:', error);
    res.status(500).json({ message: 'Failed to remove invitations' });
  }
});

/**
 * POST /api/clubs/:clubId/invitations/:invitationId/resend
 * Пересоздать приглашение для ранее приглашенного участника
 */
router.post('/:clubId/invitations/:invitationId/resend', jwtAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { clubId, invitationId } = req.params;

    const club = await storage.getClub(clubId);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    // Проверяем права
    const membership = await storage.getUserClubMembership(club.id, req.user.userId);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'moderator')) {
      return res.status(403).json({ message: 'Only club owner or moderator can resend invitations' });
    }

    // Получаем существующее приглашение
    const existingInvitations = await storage.getClubInvitations(clubId);
    const oldInvitation = existingInvitations.find(inv => inv.id === invitationId);
    
    if (!oldInvitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    // Проверяем, не существует ли уже активное приглашение для этого email
    const activeInvitation = existingInvitations.find(
      inv => inv.email === oldInvitation.email && 
      inv.status === 'pending' && 
      inv.id !== invitationId &&
      new Date(inv.expiresAt) > new Date()
    );

    if (activeInvitation) {
      return res.status(409).json({ message: 'Active invitation already exists for this email' });
    }

    // Удаляем старое приглашение
    await storage.deleteClubInvitation(invitationId);

    // Генерируем новый токен приглашения
    const inviteToken = crypto.randomBytes(32).toString('hex');
    
    // Новое приглашение действительно 7 дней
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Создаем новое приглашение
    const newInvitation: InsertClubInvitation = {
      clubId: club.id,
      email: oldInvitation.email,
      invitedBy: req.user.userId,
      inviteToken,
      expiresAt,
    };

    const createdInvitation = await storage.createClubInvitation(newInvitation);

    // Отправляем email
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const emailSent = await emailService.sendClubInvitation({
      email: oldInvitation.email,
      clubName: club.title,
      clubDescription: club.description || 'Присоединяйтесь к нашему клубу!',
      inviterName: req.user.username,
      inviteToken,
      expiresAt,
      baseUrl,
    });

    if (!emailSent) {
      console.warn(`[Clubs] Email invitation not sent to ${oldInvitation.email} - SMTP may not be configured`);
    }

    logger.info(`[Clubs] Invitation resent to ${oldInvitation.email} for club "${club.title}" by ${req.user.username}`);

    res.status(201).json({
      message: emailSent 
        ? 'Invitation resent successfully' 
        : 'Invitation recreated but email not sent (SMTP not configured)',
      invitation: {
        id: createdInvitation.id,
        email: createdInvitation.email,
        status: createdInvitation.status,
        expiresAt: createdInvitation.expiresAt,
        emailSent,
      }
    });
  } catch (error) {
    console.error('Error resending invitation:', error);
    res.status(500).json({ message: 'Failed to resend invitation' });
  }
});

/**
 * POST /api/clubs/:clubId/transfer-ownership
 * Передача прав владельца другому участнику
 */
router.post('/:clubId/transfer-ownership', jwtAuth, async (req, res) => {
  try {
    const { clubId } = req.params;
    const { newOwnerId } = req.body;
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!newOwnerId) {
      return res.status(400).json({ message: 'New owner ID is required' });
    }

    // Проверяем права текущего пользователя
    const isAdmin = req.user?.role === 'admin';
    
    if (!isAdmin) {
      // Если не админ, проверяем что пользователь - владелец клуба
      const [currentMember] = await storage.getClubMembersWithRoles(clubId)
        .then(members => members.filter(m => m.id === currentUserId));

      if (!currentMember || currentMember.role !== 'owner') {
        return res.status(403).json({ message: 'Only club owner or admin can transfer ownership' });
      }
    }

    // Проверяем что новый владелец - участник клуба
    const [newOwnerMember] = await storage.getClubMembersWithRoles(clubId)
      .then(members => members.filter(m => m.id === newOwnerId));

    if (!newOwnerMember) {
      return res.status(404).json({ message: 'New owner must be a club member' });
    }

    if (newOwnerMember.id === currentUserId && !isAdmin) {
      return res.status(400).json({ message: 'Cannot transfer ownership to yourself' });
    }

    // Выполняем передачу прав
    // 1. Старый владелец становится обычным участником
    const oldOwners = await storage.getClubMembersWithRoles(clubId)
      .then(members => members.filter(m => m.role === 'owner'));
    
    for (const oldOwner of oldOwners) {
      await storage.updateMemberRole(clubId, oldOwner.id, 'member');
    }

    // 2. Новый участник становится владельцем
    await storage.updateMemberRole(clubId, newOwnerId, 'owner');

    const club = await storage.getClub(clubId);
    
    logger.info(
      { clubId, oldOwnerId: currentUserId, newOwnerId, adminAction: isAdmin },
      '[Clubs] Ownership transferred'
    );

    res.json({
      message: 'Ownership transferred successfully',
      club,
      newOwnerId
    });
  } catch (error) {
    console.error('Error transferring ownership:', error);
    res.status(500).json({ message: 'Failed to transfer ownership' });
  }
});

export default router;
