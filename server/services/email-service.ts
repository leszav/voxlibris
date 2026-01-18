import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { storage } from '../storage.js';
import fs from 'node:fs/promises';
import path from 'node:path';

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
        console.warn('[EmailService] SMTP settings not configured in database');
        return;
      }

      // Парсим настройки
      const settings: Record<string, string> = {};
      smtpSettings.forEach((s: { key: string; value: string | null }) => {
        settings[s.key] = s.value || '';
      });

      // Проверяем обязательные поля
      if (!settings['smtp.host'] || !settings['smtp.from']) {
        console.warn('[EmailService] SMTP host or from email not configured');
        return;
      }

      // Проверяем включен ли SMTP
      if (settings['smtp.enabled'] !== 'true') {
        console.warn('[EmailService] SMTP is disabled in settings');
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

      console.log(`[EmailService] SMTP транспорт инициализирован: ${this.settings.host}:${this.settings.port}`);
    } catch (error) {
      console.error('[EmailService] Error initializing SMTP transport:', error);
      throw error;
    }
  }

  /**
   * Сброс транспорта для применения новых настроек
   */
  resetTransporter(): void {
    this.transporter = null;
    this.settings = null;
    console.log('[EmailService] Transporter reset');
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
      console.log('[EmailService] SMTP connection verified successfully');
      return true;
    } catch (error) {
      console.error('[EmailService] SMTP connection verification failed:', error);
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
        console.error('[EmailService] SMTP not configured or disabled');
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
      console.log(`[EmailService] Email sent successfully: ${info.messageId}`);
      console.log(`[EmailService] Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      
      return true;
    } catch (error) {
      console.error('[EmailService] Error sending email:', error);
      return false;
    }
  }

  /**
   * Загрузка HTML шаблона
   */
  private async loadTemplate(templateName: string): Promise<string> {
    try {
      const templatePath = path.join(process.cwd(), 'email-templates', `${templateName}.html`);
      return await fs.readFile(templatePath, 'utf-8');
    } catch (error) {
      console.error(`[EmailService] Error loading template ${templateName}:`, error);
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
  }): Promise<boolean> {
    try {
      const template = await this.loadTemplate('club-invitation');
      
      const inviteUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/invite/${params.inviteToken}`;
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
      console.error('[EmailService] Error sending club invitation:', error);
      return false;
    }
  }

  /**
   * Отправка письма с подтверждением регистрации
   */
  async sendRegistrationConfirmation(params: {
    email: string;
    username: string;
    confirmationToken: string;
  }): Promise<boolean> {
    try {
      const template = await this.loadTemplate('registration-confirmation');
      
      const confirmUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/confirm-email/${params.confirmationToken}`;

      const html = this.replaceVariables(template, {
        username: params.username,
        confirmUrl,
      });

      return await this.sendEmail({
        to: params.email,
        subject: 'Подтверждение регистрации на VoxLibris',
        html,
      });
    } catch (error) {
      console.error('[EmailService] Error sending registration confirmation:', error);
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
  }): Promise<boolean> {
    try {
      const template = await this.loadTemplate('invitation-accepted');
      
      const clubUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/clubs`;

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
      console.error('[EmailService] Error sending invitation accepted notification:', error);
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
    } catch (error: any) {
      console.error('[EmailService] Error sending test email:', error);
      return {
        success: false,
        error: error.message || 'Неизвестная ошибка'
      };
    }
  }
}

// Экспортируем singleton
export const emailService = new EmailService();
