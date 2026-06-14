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

const readerApplicationSchema = z.object({
  firstName: z.string().trim().min(1, 'Имя обязательно').max(80, 'Имя слишком длинное'),
  lastName: z.string().trim().max(80, 'Фамилия слишком длинная').optional().default(''),
  email: z.string().trim().regex(EMAIL_REGEX, 'Некорректный email'),
  experience: z.string().trim().min(20, 'Расскажите об опыте подробнее').max(2000, 'Описание опыта слишком длинное'),
  demo: z.string().trim().min(5, 'Добавьте ссылку или описание демо').max(500, 'Ссылка на демо слишком длинная'),
});

const readerApplicationFieldLabels: Record<string, string> = {
  firstName: 'Имя',
  lastName: 'Фамилия',
  email: 'Email',
  experience: 'Опыт чтения',
  demo: 'Ссылка на демо',
};

function formatReaderApplicationValidationMessage(issues: z.ZodIssue[]): string {
  const details = issues
    .map(issue => {
      const field = issue.path.join('.');
      const label = readerApplicationFieldLabels[field] || field;
      return label ? `${label}: ${issue.message}` : issue.message;
    })
    .join('; ');

  return details ? `Проверьте поля формы: ${details}.` : 'Проверьте заполнение формы.';
}

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

/**
 * POST /api/v1/feedback/reader-application
 * Заявка на статус ПРО-чтеца через существующие настройки обратной связи.
 */
router.post('/reader-application', async (req: express.Request, res: express.Response) => {
  try {
    const validation = readerApplicationSchema.safeParse(req.body);
    if (!validation.success) {
      const validationMessage = formatReaderApplicationValidationMessage(validation.error.issues);
      return res.status(400).json({
        success: false,
        message: validationMessage,
        errors: validation.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const { firstName, lastName, email, experience, demo } = validation.data;
    const feedbackEmailsSetting = await storage.getSetting('feedback.emails');
    if (!feedbackEmailsSetting?.value) {
      logger.error('[ReaderApplication] No feedback emails configured in admin settings');
      return res.status(500).json({
        success: false,
        message: 'Сервис заявок временно недоступен. Попробуйте позже.',
      });
    }

    const recipientEmails = feedbackEmailsSetting.value
      .split(',')
      .map(emailValue => emailValue.trim())
      .filter(Boolean);

    if (recipientEmails.length === 0) {
      logger.error('[ReaderApplication] No valid recipient emails found');
      return res.status(500).json({
        success: false,
        message: 'Сервис заявок временно недоступен. Попробуйте позже.',
      });
    }

    const name = [firstName, lastName].filter(Boolean).join(' ');
    const baseUrl = await getPublicBaseUrl();
    const emailSent = await emailService.sendFeedback({
      name,
      email,
      subject: 'Заявка ПРО-чтеца',
      message: [
        'Новая заявка на статус ПРО-чтеца.',
        '',
        `Имя: ${name}`,
        `Email: ${email}`,
        '',
        'Опыт чтения:',
        experience,
        '',
        'Демо:',
        demo,
      ].join('\n'),
      recipientEmails,
      baseUrl,
    });

    if (!emailSent) {
      logger.error({ senderEmail: email }, '[ReaderApplication] Failed to send reader application email');
      return res.status(500).json({
        success: false,
        message: 'Не удалось отправить заявку. Попробуйте позже.',
      });
    }

    logger.info({ senderEmail: email, senderName: name, ip: req.ip }, '[ReaderApplication] Reader application sent');
    res.json({
      success: true,
      message: 'Заявка отправлена. Команда VoxLibris свяжется с вами после рассмотрения.',
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ip: req.ip,
    }, '[ReaderApplication] Error processing reader application');

    res.status(500).json({
      success: false,
      message: 'Произошла внутренняя ошибка. Попробуйте позже.',
    });
  }
});

export default router;
