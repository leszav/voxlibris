import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ClubBook, ClubWithDetails, User } from '../../shared/schema.js';
import {
  serializeAuthUser,
  serializeClub,
  serializeClubMember,
} from '../lib/client-serializers.ts';

describe('Client serializers', () => {
  const fakePasswordHash = ['placeholder', 'hash'].join('-');

  it('removes internal auth fields from user responses', () => {
    const user = {
      id: 'user-1',
      username: 'reader',
      email: 'reader@example.com',
      password: fakePasswordHash,
      role: 'user',
      status: 'active',
      emailConfirmed: true,
      confirmationToken: 'secret-token',
      invitedBy: 'owner-1',
      invitedToClub: 'club-1',
      lastActivityAt: new Date('2026-03-13T10:00:00.000Z'),
      suspensionReason: null,
      suspendedUntil: null,
      failedLoginAttempts: 3,
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
    } as User;

    const serialized = serializeAuthUser(user);

    assert.deepEqual(Object.keys(serialized).sort((left, right) => left.localeCompare(right)), [
      'createdAt',
      'email',
      'emailConfirmed',
      'id',
      'lastActivityAt',
      'role',
      'status',
      'username',
    ]);
    assert.equal(serialized.email, 'reader@example.com');
  });

  it('removes owner password and book crypto fields from club responses', () => {
    const owner = {
      id: 'owner-1',
      username: 'owner',
      email: 'owner@example.com',
      password: fakePasswordHash,
      role: 'admin',
      status: 'active',
      emailConfirmed: true,
      confirmationToken: 'token',
      invitedBy: null,
      invitedToClub: null,
      lastActivityAt: null,
      suspensionReason: null,
      suspendedUntil: null,
      failedLoginAttempts: 0,
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
    } as User;

    const book = {
      id: 'book-1',
      clubId: 'club-1',
      uploadedByUserId: 'owner-1',
      title: 'Safe book',
      author: 'Author',
      description: 'Description',
      publicationYear: 2024,
      genre: 'Novel',
      language: 'ru',
      format: 'EPUB',
      fileHash: 'sensitive-hash',
      fileSizeBytes: 123,
      storagePath: '/secret/path',
      encryptedContentKey: 'encrypted-key',
      coverUrl: null,
      recommendedReadingOrder: 1,
      uploadedAt: new Date('2026-03-01T10:00:00.000Z'),
      isDeleted: false,
      softDeletedAt: null,
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
      updatedAt: new Date('2026-03-01T10:00:00.000Z'),
    } as ClubBook;

    const club = {
      id: 'club-1',
      title: 'Club',
      description: 'Desc',
      coverImage: null,
      bookId: null,
      type: 'standard',
      status: 'active',
      isPrivate: true,
      maxMembers: 10,
      isActive: true,
      isLive: false,
      isFeatured: false,
      popularityScore: 0,
      schedule: null,
      settings: null,
      archivedAt: null,
      archiveReason: null,
      ownerId: 'owner-1',
      createdAt: new Date('2026-03-01T10:00:00.000Z'),
      updatedAt: new Date('2026-03-01T10:00:00.000Z'),
      owner,
      book,
      books: [book],
      tags: ['history'],
      memberCount: 5,
    } as ClubWithDetails;

    const serialized = serializeClub(club, 'owner');

    assert.deepEqual(serialized.owner, {
      id: 'owner-1',
      username: 'owner',
    });
    assert.ok(serialized.book);
    assert.equal((serialized.book as unknown as Record<string, unknown>).fileHash, undefined);
    assert.equal((serialized.book as unknown as Record<string, unknown>).storagePath, undefined);
    assert.equal((serialized.book as unknown as Record<string, unknown>).encryptedContentKey, undefined);
    assert.equal(serialized.viewerMembershipRole, 'owner');
  });

  it('removes member email and status fields from member lists', () => {
    const serialized = serializeClubMember({
      id: 'member-1',
      username: 'member',
      role: 'member',
      joinedAt: new Date('2026-03-05T10:00:00.000Z'),
    });

    assert.deepEqual(Object.keys(serialized).sort((left, right) => left.localeCompare(right)), ['id', 'joinedAt', 'role', 'username']);
  });
});
