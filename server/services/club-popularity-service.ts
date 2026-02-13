import { storage } from '../repositories/index.js';
import { logger } from '../lib/logger.js';

/**
 * Сервис расчета популярности клубов
 * Формула популярности учитывает:
 * - Количество участников (memberCount * 10)
 * - Активность клуба (сессии чтения за последний месяц * 5)
 * - "Штраф" за новизну (новые клубы получают меньший score)
 */
export class ClubPopularityService {
  /**
   * Рассчитать popularity score для одного клуба
   * @param clubId ID клуба
   * @returns Рассчитанный score или undefined при ошибке
   */
  async calculateClubPopularity(clubId: string): Promise<number | undefined> {
    try {
      const club = await storage.getClub(clubId);
      if (!club) {
        logger.warn({ clubId }, 'Club not found for popularity calculation');
        return undefined;
      }

      // Только активные клубы участвуют в рейтинге
      if (club.status === 'pending' || club.status === 'archived') {
        return 0;
      }

      // 1. Базовый score на основе количества участников
      const memberScore = club.memberCount * 10;

      // 2. Бонус за активность (в будущем можно добавить подсчет сессий, сообщений и т.д.)
      // Пока оставляем заглушку - можно расширить когда будет необходимость
      const activityScore = 0;

      // 3. Штраф за новизну клуба (первые 30 дней)
      let agePenalty = 0;
      const ageInDays = Math.floor(
        (Date.now() - club.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (ageInDays < 30) {
        // Новые клубы получают штраф: чем новее, тем больше штраф
        // Максимальный штраф: 60 очков (для только что созданного клуба)
        agePenalty = (30 - ageInDays) * 2;
      }

      // 4. Бонус за статус "в эфире"
      const liveBonus = club.isLive ? 50 : 0;

      // 5. Бонус за избранное
      const featuredBonus = club.isFeatured ? 100 : 0;

      // Итоговая формула
      const totalScore = Math.max(
        0,
        memberScore + activityScore + liveBonus + featuredBonus - agePenalty
      );

      logger.debug({
        clubId,
        clubTitle: club.title,
        memberScore,
        activityScore,
        agePenalty,
        liveBonus,
        featuredBonus,
        totalScore,
        ageInDays
      }, 'Club popularity calculated');

      return Math.floor(totalScore);
    } catch (error) {
      logger.error({ clubId, error }, 'Error calculating club popularity');
      return undefined;
    }
  }

  /**
   * Обновить popularity score для всех активных клубов
   * @returns Количество обновленных клубов
   */
  async updateAllClubsPopularity(): Promise<number> {
    try {
      logger.info('Starting club popularity update for all clubs');
      
      // Получаем все клубы (включая pending, но их score будет 0)
      const allClubs = await storage.getClubs();
      
      let updatedCount = 0;
      let errors = 0;

      for (const club of allClubs) {
        try {
          const newScore = await this.calculateClubPopularity(club.id);
          
          if (newScore !== undefined) {
            const success = await storage.updateClubPopularityScore(club.id, newScore);
            if (success) {
              updatedCount++;
            } else {
              errors++;
              logger.warn({ clubId: club.id, clubTitle: club.title }, 'Failed to update club popularity score');
            }
          } else {
            errors++;
          }
        } catch (error) {
          errors++;
          logger.error({ clubId: club.id, error }, 'Error updating club popularity');
        }
      }

      logger.info({
        total: allClubs.length,
        updated: updatedCount,
        errors
      }, 'Club popularity update completed');

      return updatedCount;
    } catch (error) {
      logger.error({ error }, 'Error in updateAllClubsPopularity');
      return 0;
    }
  }

  /**
   * Обновить popularity score для одного конкретного клуба
   * Полезно вызывать после изменений в клубе (новый участник и т.д.)
   * @param clubId ID клуба
   */
  async updateClubPopularity(clubId: string): Promise<boolean> {
    try {
      const newScore = await this.calculateClubPopularity(clubId);
      
      if (newScore !== undefined) {
        const success = await storage.updateClubPopularityScore(clubId, newScore);
        
        if (success) {
          logger.debug({ clubId, newScore }, 'Club popularity updated');
        }
        
        return success;
      }
      
      return false;
    } catch (error) {
      logger.error({ clubId, error }, 'Error updating single club popularity');
      return false;
    }
  }
}

// Экспортируем singleton instance
export const clubPopularityService = new ClubPopularityService();
