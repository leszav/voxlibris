import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { storage } from '../repositories/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../lib/logger.js';
import { resolveTrustedBaseUrl } from '../lib/public-base-url.js';

/**
 * Email Service для VoxLibris
 * Работает с собственным SMTP сервером через настройки из БД
 */

interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content?: Buffer | string;
    path?: string;
  }>;
}

interface SMTPSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  secure: boolean;
  enabled: boolean;
}

class EmailService {
  private transporter: Transporter | null = null;
  private settings: SMTPSettings | null = null;

  /**
   * Инициализация SMTP транспорта из настроек БД
   */
  private async initializeTransporter(): Promise<void> {
    try {
      // Получаем настройки из БД
      const smtpSettings = await storage.getSettingsByCategory('smtp');
      
      if (smtpSettings.length === 0) {
        logger.warn('[EmailService] SMTP settings not configured in database');
        return;
      }

      // Парсим настройки
      const settings: Record<string, string> = {};
      smtpSettings.forEach((s: { key: string; value: string | null }) => {
        settings[s.key] = s.value || '';
      });

      // Проверяем обязательные поля
      if (!settings['smtp.host'] || !settings['smtp.from']) {
        logger.warn('[EmailService] SMTP host or from email not configured');
        return;
      }

      // Проверяем включен ли SMTP
      if (settings['smtp.enabled'] !== 'true') {
        logger.warn('[EmailService] SMTP is disabled in settings');
        return;
      }

      this.settings = {
        host: settings['smtp.host'],
        port: Number.parseInt(settings['smtp.port'] || '587'),
        user: settings['smtp.user'] || '',
        password: settings['smtp.password'] || '',
        from: settings['smtp.from'],
        secure: settings['smtp.secure'] === 'true',
        enabled: settings['smtp.enabled'] === 'true',
      };

      // Создаем транспорт
      this.transporter = nodemailer.createTransport({
        host: this.settings.host,
        port: this.settings.port,
        secure: this.settings.secure, // true для 465, false для других портов
        auth: this.settings.user && this.settings.password ? {
          user: this.settings.user,
          pass: this.settings.password,
        } : undefined,
        // Дополнительные опции для отладки
        logger: process.env.NODE_ENV === 'development',
        debug: process.env.NODE_ENV === 'development',
      });

      logger.info(`[EmailService] SMTP транспорт инициализирован: ${this.settings.host}:${this.settings.port}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, '[EmailService] Error initializing SMTP transport');
      throw error;
    }
  }

  /**
   * Сброс транспорта для применения новых настроек
   */
  resetTransporter(): void {
    this.transporter = null;
    this.settings = null;
    logger.info('[EmailService] Transporter reset');
  }

  /**
   * Проверка доступности SMTP
   */
  async verifyConnection(): Promise<boolean> {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      if (!this.transporter) {
        return false;
      }

      await this.transporter.verify();
      logger.info('[EmailService] SMTP connection verified successfully');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, '[EmailService] SMTP connection verification failed');
      return false;
    }
  }

  /**
   * Отправка email
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      // Инициализируем транспорт если еще не инициализирован
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      if (!this.transporter || !this.settings) {
        logger.error('[EmailService] SMTP not configured or disabled');
        return false;
      }

      // Формируем сообщение
      const mailOptions = {
        from: this.settings.from,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
      };

      // Отправляем
      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`[EmailService] Email sent successfully: ${info.messageId}`);
      logger.info(`[EmailService] Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, '[EmailService] Error sending email');
      return false;
    }
  }

  /**
   * Загрузка HTML шаблона
   */
  private async loadTemplate(templateName: string): Promise<string> {
    try {
      const fileName = `${templateName}.html`;
      const cwd = process.cwd();
      const serverDir = path.dirname(fileURLToPath(import.meta.url));

      const candidatePaths = [
        path.join(cwd, 'email-templates', fileName),
        path.join(cwd, 'dist', 'email-templates', fileName),
        path.join(cwd, '..', 'email-templates', fileName),
        path.join(serverDir, '..', '..', 'email-templates', fileName),
        path.join(serverDir, '..', '..', '..', 'email-templates', fileName),
      ];

      for (const candidate of candidatePaths) {
        try {
          return await fs.readFile(candidate, 'utf-8');
        } catch {
          // Try next candidate
        }
      }

      throw new Error(`Template not found. Tried paths: ${candidatePaths.join(', ')}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, `[EmailService] Error loading template ${templateName}`);
      throw error;
    }
  }

  /**
   * Замена переменных в шаблоне
   */
  private replaceVariables(template: string, variables: Record<string, string>): string {
    let result = template;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    });
    return result;
  }

  /**
   * Отправка письма с приглашением в клуб
   */
  async sendClubInvitation(params: {
    email: string;
    clubName: string;
    clubDescription: string;
    inviterName: string;
    inviteToken: string;
    expiresAt: Date;
    baseUrl?: string;
  }): Promise<boolean> {
    try {
      const template = await this.loadTemplate('club-invitation');
      
      const baseUrl = await resolveTrustedBaseUrl(params.baseUrl);
      const inviteUrl = `${baseUrl}/invite/${params.inviteToken}`;
      const expiresIn = Math.ceil((params.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      const html = this.replaceVariables(template, {
        clubName: params.clubName,
        clubDescription: params.clubDescription,
        inviterName: params.inviterName,
        inviteUrl,
        expiresIn: String(expiresIn),
      });

      return await this.sendEmail({
        to: params.email,
        subject: `Приглашение в книжный клуб "${params.clubName}"`,
        html,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, '[EmailService] Error sending club invitation');
      return false;
    }
  }

  /**
   * Отправка письма с подтверждением регистрации
   */
  async sendRegistrationConfirmation(params: {
    email: string;
    username: string;
    displayName?: string;
    confirmationToken: string;
    baseUrl?: string;
  }): Promise<boolean> {
    try {
      const template = await this.loadTemplate('registration-confirmation');
      
      const baseUrl = await resolveTrustedBaseUrl(params.baseUrl);
      const confirmUrl = `${baseUrl}/confirm-email/${params.confirmationToken}`;

      const html = this.replaceVariables(template, {
        username: params.displayName || params.username,
        confirmUrl,
      });

      return await this.sendEmail({
        to: params.email,
        subject: 'Подтверждение регистрации на VoxLibris',
        html,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, '[EmailService] Error sending registration confirmation');
      return false;
    }
  }

  /**
   * Отправка письма для сброса пароля
   */
  async sendPasswordReset(params: {
    email: string;
    username: string;
    displayName?: string;
    resetToken: string;
    expiresInMinutes: number;
    baseUrl?: string;
  }): Promise<boolean> {
    try {
      const template = await this.loadTemplate('password-reset');

      const baseUrl = await resolveTrustedBaseUrl(params.baseUrl);
      const resetUrl = `${baseUrl}/auth/reset-password/${params.resetToken}`;

      const html = this.replaceVariables(template, {
        username: params.displayName || params.username,
        resetUrl,
        expiresIn: String(params.expiresInMinutes),
      });

      return await this.sendEmail({
        to: params.email,
        subject: 'Сброс пароля VoxLibris',
        html,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, '[EmailService] Error sending password reset email');
      return false;
    }
  }

  /**
    * Отправка уведомления о принятии приглашения
    */
  async sendInvitationAccepted(params: {
    email: string;
    clubName: string;
    memberName: string;
    baseUrl?: string;
  }): Promise<boolean> {
    try {
      const template = await this.loadTemplate('invitation-accepted');

      const baseUrl = await resolveTrustedBaseUrl(params.baseUrl);
      const clubUrl = `${baseUrl}/clubs`;

      const html = this.replaceVariables(template, {
        clubName: params.clubName,
        memberName: params.memberName,
        clubUrl,
      });

      return await this.sendEmail({
        to: params.email,
        subject: `Новый участник в клубе "${params.clubName}"`,
        html,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, '[EmailService] Error sending invitation accepted notification');
      return false;
    }
  }

  /**
   * Отправка уведомления администраторам о новом клубе на модерации
   */
  async sendClubModerationNotification(params: {
    adminEmails: string[];
    clubId: string;
    clubTitle: string;
    clubDescription?: string;
    clubType: string;
    isPrivate: boolean;
    creatorUsername: string;
    creatorEmail: string;
    createdAt: Date;
    baseUrl?: string;
  }): Promise<boolean> {
    try {
      const template = await this.loadTemplate('club-moderation-notification');
      
      const baseUrl = await resolveTrustedBaseUrl(params.baseUrl);
      const moderationUrl = `${baseUrl}/admin/clubs?status=pending`;
      
      const html = this.replaceVariables(template, {
        clubTitle: params.clubTitle,
        description: params.clubDescription || 'Описание не указано',
        clubType: params.clubType === 'standard' ? 'Обычный' : params.clubType,
        isPrivate: params.isPrivate ? 'Приватный' : 'Публичный',
        creatorUsername: params.creatorUsername,
        creatorEmail: params.creatorEmail,
        createdAt: params.createdAt.toLocaleString('ru-RU', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        moderationUrl,
      });

      // Отправляем всем администраторам
      const results = await Promise.all(
        params.adminEmails.map(email =>
          this.sendEmail({
            to: email,
            subject: `🔔 Новый клуб на модерации: "${params.clubTitle}"`,
            html,
          })
        )
      );

      const allSuccess = results.every(Boolean);
      
      if (allSuccess) {
        logger.info({
          clubId: params.clubId,
          recipientCount: params.adminEmails.length
        }, 'Club moderation notifications sent to admins');
      } else {
        logger.warn({
          clubId: params.clubId,
          successCount: results.filter(Boolean).length,
          totalCount: params.adminEmails.length
        }, 'Some club moderation notifications failed');
      }

      return allSuccess;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, '[EmailService] Error sending club moderation notification');
      return false;
    }
  }

  /**
   * Отправка уведомления владельцу об отклонении клуба с причиной
   */
  async sendClubRejectionNotification(params: {
    email: string;
    username: string;
    displayName?: string;
    clubTitle: string;
    reason: string;
    baseUrl?: string;
  }): Promise<boolean> {
    try {
      const template = await this.loadTemplate('club-rejection-notification');

      const baseUrl = await resolveTrustedBaseUrl(params.baseUrl);
      const catalogUrl = `${baseUrl}/catalog`;

      const html = this.replaceVariables(template, {
        username: params.displayName || params.username,
        clubTitle: params.clubTitle,
        reason: params.reason,
        catalogUrl,
      });

      return await this.sendEmail({
        to: params.email,
        subject: `Ваш клуб "${params.clubTitle}" не прошел модерацию`,
        html,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, '[EmailService] Error sending club rejection notification');
      return false;
    }
  }

  /**
   * Отправка уведомления владельцу о блокировке книги по результатам постмодерации
   */
  async sendBookBlockedNotification(params: {
    email: string;
    username: string;
    displayName?: string;
    bookTitle: string;
    reason: string;
    source: 'personal_books' | 'club_books';
    clubTitle?: string;
    baseUrl?: string;
  }): Promise<boolean> {
    try {
      const template = await this.loadTemplate('book-blocked-notification');
      const baseUrl = await resolveTrustedBaseUrl(params.baseUrl);
      const libraryUrl = `${baseUrl}/library`;

      const escapeHtml = (value: string): string =>
        value
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');

      const escapedReason = escapeHtml(params.reason).replaceAll('\n', '<br>');
      let sourceLabel = 'личной библиотеки';
      if (params.source === 'club_books') {
        const clubSuffix = params.clubTitle ? ` клуба "${escapeHtml(params.clubTitle)}"` : '';
        sourceLabel = `клубной библиотеки${clubSuffix}`;
      }

      const html = this.replaceVariables(template, {
        username: escapeHtml(params.displayName || params.username),
        bookTitle: escapeHtml(params.bookTitle),
        sourceLabel,
        reason: escapedReason,
        libraryUrl,
      });

      return await this.sendEmail({
        to: params.email,
        subject: `Ваша книга "${params.bookTitle}" заблокирована`,
        html,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, '[EmailService] Error sending book blocked notification');
      return false;
    }
  }

  /**
   * Отправка тестового письма
   */
  async sendTestEmail(email: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Инициализируем транспорт
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      if (!this.transporter || !this.settings) {
        return {
          success: false,
          error: 'SMTP не настроен или отключен'
        };
      }

      const html = `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Тестовое письмо — VoxLibris</title>
          <style>
            body, table, td, p, a { margin: 0; padding: 0; }
            table { border-spacing: 0; border-collapse: collapse; }
            body { font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #3D2B1F; background: #F5F2ED; }
            a { color: #8B5A2B; text-decoration: underline; }
            :root { --primary: #5C4033; --accent: #D4A574; --bg: #F7F3ED; --card-bg: #FFFFFF; --text: #3D2B1F; --text-muted: #8B7355; --border: #E8DFD5; }
            .wrapper { width: 100%; max-width: 600px; margin: 0 auto; padding: 40px 20px; }
            .card { background: var(--card-bg); border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(92, 64, 51, 0.08); }
            .header { background: var(--primary); padding: 32px 40px; text-align: center; }
            .header-icon { width: 48px; height: 48px; margin: 0 auto 12px; background: rgba(255,255,255,0.15); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 24px; }
            .header-title { font-family: "Playfair Display", serif; font-size: 24px; font-weight: 600; color: #FFFFFF; margin: 0; }
            .body { padding: 40px; }
            .body h2 { font-family: "Playfair Display", serif; font-size: 20px; font-weight: 600; color: var(--primary); margin: 0 0 16px; }
            .body p { margin: 0 0 16px; color: var(--text); }
            .info { background: var(--bg); border-left: 3px solid var(--accent); padding: 16px 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
            .info-row { padding: 6px 0; }
            .info-label { color: var(--text-muted); font-size: 14px; }
            .info-value { font-weight: 600; }
            .list { margin: 20px 0; padding: 0; list-style: none; }
            .list li { padding: 8px 0 8px 28px; position: relative; }
            .list li::before { content: "✓"; position: absolute; left: 0; color: var(--accent); font-weight: bold; }
            .footer { padding: 24px 40px; text-align: center; border-top: 1px solid var(--border); background: var(--bg); }
            .footer-logo { font-family: "Playfair Display", serif; font-size: 16px; font-weight: 600; color: var(--primary); margin-bottom: 8px; }
            .footer-text { font-size: 13px; color: var(--text-muted); margin: 0; }
            @media (max-width: 640px) { .wrapper { padding: 20px 16px; } .header { padding: 24px 20px; } .body { padding: 24px 20px; } .footer { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="card">
              <div class="header">
                <div class="header-icon">🎉</div>
                <h1 class="header-title">VoxLibris</h1>
              </div>
              <div class="body">
                <h2>SMTP успешно настроен!</h2>
                <p>Поздравляем! Сервер электронной почты работает корректно.</p>
                
                <div class="info">
                  <div class="info-row"><span class="info-label">SMTP Host:</span> <span class="info-value">${this.settings.host}</span></div>
                  <div class="info-row"><span class="info-label">Port:</span> <span class="info-value">${this.settings.port}</span></div>
                  <div class="info-row"><span class="info-label">Secure:</span> <span class="info-value">${this.settings.secure ? 'SSL/TLS' : 'STARTTLS'}</span></div>
                  <div class="info-row"><span class="info-label">From:</span> <span class="info-value">${this.settings.from}</span></div>
                </div>

                <p>Теперь вы можете использовать email для:</p>
                <ul class="list">
                  <li>Приглашений в книжные клубы</li>
                  <li>Подтверждения регистрации</li>
                  <li>Уведомлений пользователей</li>
                </ul>
              </div>
              <div class="footer">
                <div class="footer-logo">VoxLibris</div>
                <p class="footer-text">Платформа для книжных клубов</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      const info = await this.transporter.sendMail({
        from: this.settings.from,
        to: email,
        subject: '✅ Тестовое письмо VoxLibris - SMTP работает!',
        html,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, '[EmailService] Error sending test email');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      };
    }
  }

  /**
   * Отправка обратной связи
   */
  async sendFeedback(params: {
    name: string;
    email: string;
    subject: string;
    message: string;
    recipientEmails: string[];
    baseUrl?: string;
  }): Promise<boolean> {
    try {
      // Инициализируем транспорт если еще не инициализирован
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      if (!this.transporter || !this.settings?.enabled) {
        logger.warn('[EmailService] SMTP not configured or disabled, skipping feedback email');
        return false;
      }

      if (!params.recipientEmails || params.recipientEmails.length === 0) {
        logger.warn('[EmailService] No recipient emails provided for feedback');
        return false;
      }

      const baseUrl = await resolveTrustedBaseUrl(params.baseUrl);
      
      // Загружаем шаблон для обратной связи
      const template = await this.loadTemplate('feedback-notification');
      
      // Заменяем переменные в шаблоне
      const html = this.replaceVariables(template, {
        senderName: params.name,
        senderEmail: params.email,
        subject: params.subject,
        message: params.message,
        baseUrl
      });

      const emailSubject = `[VoxLibris] Обратная связь: ${params.subject}`;

      // Отправляем фидбэк всем получателям
      const results = await Promise.all(
        params.recipientEmails.map(email =>
          this.sendEmail({
            to: email,
            subject: emailSubject,
            html,
          })
        )
      );

      const successCount = results.filter(Boolean).length;
      if (successCount === params.recipientEmails.length) {
        logger.info({
          senderEmail: params.email,
          subject: params.subject,
          recipientCount: params.recipientEmails.length
        }, 'Feedback email sent successfully');
      } else {
        logger.warn({
          successCount,
          totalCount: params.recipientEmails.length,
          senderEmail: params.email
        }, 'Some feedback emails failed to send');
      }

      return successCount > 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ 
        error: errorMessage,
        senderEmail: params.email,
        subject: params.subject
      }, '[EmailService] Error sending feedback email');
      return false;
    }
  }
}

// Экспортируем singleton
export const emailService = new EmailService();
