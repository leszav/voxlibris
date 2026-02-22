import express from 'express';
import { z } from 'zod';
import { emailService } from '../services/email-service.js';
import { storage } from '../repositories/index.js';
import { logger } from '../lib/logger.js';
import { getPublicBaseUrl } from '../lib/public-base-url.js';

const router = express.Router();

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validation schema for feedback
const feedbackSchema = z.object({
  name: z.string().min(1, 'Имя обязательно').max(100, 'Имя слишком длинное'),
  email: z.string().regex(EMAIL_REGEX, 'Некорректный email'),
  subject: z.enum([
    'general', // Общий вопрос
    'technical', // Техническая проблема
    'feature', // Предложение функции
    'bug', // Сообщение об ошибке
    'partnership', // Партнерство
    'other' // Другое
  ]).refine((val) => val !== undefined, { message: 'Выберите тему сообщения' }),
  message: z.string().min(10, 'Сообщение слишком короткое').max(2000, 'Сообщение слишком длинное'),
  // Поле для будущей капчи
  captcha: z.string().optional()
});

// Маппинг тем на русский язык
const subjectLabels: Record<string, string> = {
  general: 'Общий вопрос',
  technical: 'Техническая проблема',
  feature: 'Предложение функции',
  bug: 'Сообщение об ошибке',
  partnership: 'Партнерство',
  other: 'Другое'
};

/**
 * POST /api/v1/feedback
 * Отправка обратной связи
 */
router.post('/', async (req: express.Request, res: express.Response) => {
  try {
    // Валидация входных данных
    const validation = feedbackSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации данных',
        errors: validation.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { name, email, subject, message } = validation.data;

    // Получаем настройки feedback emails из админки
    const feedbackEmailsSetting = await storage.getSetting('feedback.emails');
    if (!feedbackEmailsSetting?.value) {
      logger.error('[Feedback] No feedback emails configured in admin settings');
      return res.status(500).json({
        success: false,
        message: 'Сервис обратной связи временно недоступен. Попробуйте позже.'
      });
    }

    // Парсим список email адресов
    const recipientEmails = feedbackEmailsSetting.value
      .split(',')
      .map(email => email.trim())
      .filter(Boolean);

    if (recipientEmails.length === 0) {
      logger.error('[Feedback] No valid recipient emails found');
      return res.status(500).json({
        success: false,
        message: 'Сервис обратной связи временно недоступен. Попробуйте позже.'
      });
    }

    // Получаем базовый URL
    const baseUrl = await getPublicBaseUrl();

    // Отправляем email через EmailService
    const emailSent = await emailService.sendFeedback({
      name,
      email,
      subject: subjectLabels[subject] || subject,
      message,
      recipientEmails,
      baseUrl
    });

    if (!emailSent) {
      logger.error({
        senderEmail: email,
        subject,
        recipientCount: recipientEmails.length
      }, '[Feedback] Failed to send feedback email');
      return res.status(500).json({
        success: false,
        message: 'Не удалось отправить сообщение. Попробуйте позже.'
      });
    }

    // Логируем успешную отправку
    logger.info({
      senderEmail: email,
      senderName: name,
      subject,
      recipientCount: recipientEmails.length,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    }, '[Feedback] Feedback sent successfully');

    res.json({
      success: true,
      message: 'Ваше сообщение успешно отправлено. Мы свяжемся с вами в ближайшее время.'
    });

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body,
      ip: req.ip
    }, '[Feedback] Error processing feedback request');

    res.status(500).json({
      success: false,
      message: 'Произошла внутренняя ошибка. Попробуйте позже.'
    });
  }
});

export default router;
