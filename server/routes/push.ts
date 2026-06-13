import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pushService, type PushNotificationType } from '../services/push-service.js';
import { logger } from '../lib/logger.js';

const router = Router();

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    auth: z.string().min(1),
    p256dh: z.string().min(1),
  }),
  deviceName: z.string().max(120).optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().optional(),
});

const settingsSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  sessionStarted: z.boolean().optional(),
  sessionReminder: z.boolean().optional(),
  clubDiscussion: z.boolean().optional(),
  mentionInChat: z.boolean().optional(),
  dmReceived: z.boolean().optional(),
  newFollower: z.boolean().optional(),
  streakReminder: z.boolean().optional(),
  achievementUnlocked: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.number().int().min(0).max(23).optional(),
  quietHoursEnd: z.number().int().min(0).max(23).optional(),
});

function getUserId(req: Request): string | null {
  return req.user?.id || req.user?.userId || null;
}

router.get('/vapid-key', (_req: Request, res: Response) => {
  const publicKey = pushService.getPublicKey();
  res.json({ publicKey, configured: pushService.isConfigured() });
});

router.post('/subscribe', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid push subscription payload' });
  }

  try {
    await pushService.saveSubscription(userId, parsed.data, req.get('user-agent'));
    return res.status(201).json({ success: true });
  } catch (error) {
    logger.error({ error }, '[push] subscribe error');
    return res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

router.delete('/subscribe', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = unsubscribeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid unsubscribe payload' });
  }

  try {
    await pushService.unsubscribe(userId, parsed.data.endpoint);
    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, '[push] unsubscribe error');
    return res.status(500).json({ error: 'Failed to unsubscribe from push notifications' });
  }
});

router.get('/settings', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const settings = await pushService.getSettings(userId);
    return res.json({ settings });
  } catch (error) {
    logger.error({ error }, '[push] get settings error');
    return res.status(500).json({ error: 'Failed to load push settings' });
  }
});

router.patch('/settings', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid push settings payload' });
  }

  try {
    const settings = await pushService.updateSettings(userId, parsed.data);
    return res.json({ settings });
  } catch (error) {
    logger.error({ error }, '[push] update settings error');
    return res.status(500).json({ error: 'Failed to update push settings' });
  }
});

router.post('/test', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await pushService.sendToUser(userId, {
      type: 'test' as PushNotificationType,
      title: 'VoxLibris',
      body: 'Тестовое push-уведомление работает',
      url: '/dashboard',
      tag: 'push-test',
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    logger.error({ error }, '[push] test send error');
    return res.status(500).json({ error: 'Failed to send test push' });
  }
});

export default router;
