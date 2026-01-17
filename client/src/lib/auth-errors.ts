// Типы ошибок аутентификации
export enum AuthErrorCode {
  NO_TOKEN = 'NO_TOKEN',
  INVALID_TOKEN = 'INVALID_TOKEN',
  INVALID_USER = 'INVALID_USER',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  REFRESH_FAILED = 'REFRESH_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_INACTIVE = 'USER_INACTIVE',
  ACCOUNT_NOT_ACTIVATED = 'ACCOUNT_NOT_ACTIVATED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
  REGISTRATION_FAILED = 'REGISTRATION_FAILED',
  LOGOUT_FAILED = 'LOGOUT_FAILED'
}

// Класс для ошибок аутентификации
export class AuthError extends Error {
  public readonly code: AuthErrorCode;
  public readonly statusCode?: number;
  public readonly originalError?: Error;

  constructor(
    code: AuthErrorCode,
    message: string,
    statusCode?: number,
    originalError?: Error
  ) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
    this.originalError = originalError;
  }

  // Проверка, требует ли ошибка повторного входа
  get requiresReauth(): boolean {
    return [
      AuthErrorCode.NO_TOKEN,
      AuthErrorCode.INVALID_TOKEN,
      AuthErrorCode.INVALID_USER,
      AuthErrorCode.TOKEN_EXPIRED,
      AuthErrorCode.REFRESH_FAILED,
      AuthErrorCode.USER_INACTIVE
    ].includes(this.code);
  }

  // Проверка, является ли ошибка временной
  get isTemporary(): boolean {
    return [
      AuthErrorCode.NETWORK_ERROR,
      AuthErrorCode.SERVER_ERROR
    ].includes(this.code);
  }
}

// Фабрика для создания ошибок аутентификации
export class AuthErrorFactory {
  static fromResponse(response: Response, responseText?: string): AuthError {
    const statusCode = response.status;
    
    switch (statusCode) {
      case 401:
        if (responseText?.includes('NO_TOKEN')) {
          return new AuthError(
            AuthErrorCode.NO_TOKEN,
            'Требуется аутентификация. Пожалуйста, войдите в систему.',
            statusCode
          );
        }
        if (responseText?.includes('INVALID_TOKEN')) {
          return new AuthError(
            AuthErrorCode.INVALID_TOKEN,
            'Сессия истекла. Пожалуйста, войдите в систему заново.',
            statusCode
          );
        }
        if (responseText?.includes('INVALID_USER')) {
          return new AuthError(
            AuthErrorCode.INVALID_USER,
            'Пользователь не найден или заблокирован.',
            statusCode
          );
        }
        return new AuthError(
          AuthErrorCode.INVALID_CREDENTIALS,
          'Неверные данные для входа.',
          statusCode
        );

      case 403:
        if (responseText?.includes('ACCOUNT_NOT_ACTIVATED')) {
          return new AuthError(
            AuthErrorCode.ACCOUNT_NOT_ACTIVATED,
            'Требуется активация аккаунта. Пожалуйста, дождитесь активации администратором.',
            statusCode
          );
        }
        if (responseText?.includes('ACCOUNT_SUSPENDED')) {
          return new AuthError(
            AuthErrorCode.ACCOUNT_SUSPENDED,
            'Ваш аккаунт был заблокирован администратором.',
            statusCode
          );
        }
        if (responseText?.includes('ACCOUNT_DELETED')) {
          return new AuthError(
            AuthErrorCode.ACCOUNT_DELETED,
            'Аккаунт удален.',
            statusCode
          );
        }
        return new AuthError(
          AuthErrorCode.USER_INACTIVE,
          'Доступ запрещен. Обратитесь к администратору.',
          statusCode
        );

      case 404:
        return new AuthError(
          AuthErrorCode.USER_NOT_FOUND,
          'Пользователь не найден.',
          statusCode
        );

      case 409:
        return new AuthError(
          AuthErrorCode.REGISTRATION_FAILED,
          'Пользователь с таким именем уже существует.',
          statusCode
        );

      case 500:
      case 502:
      case 503:
      case 504:
        return new AuthError(
          AuthErrorCode.SERVER_ERROR,
          'Ошибка сервера. Попробуйте позже.',
          statusCode
        );

      default:
        return new AuthError(
          AuthErrorCode.SERVER_ERROR,
          responseText || 'Произошла неизвестная ошибка.',
          statusCode
        );
    }
  }

  static fromNetworkError(error: Error): AuthError {
    return new AuthError(
      AuthErrorCode.NETWORK_ERROR,
      'Ошибка сети. Проверьте подключение к интернету.',
      undefined,
      error
    );
  }

  static tokenExpired(): AuthError {
    return new AuthError(
      AuthErrorCode.TOKEN_EXPIRED,
      'Сессия истекла. Пожалуйста, войдите в систему заново.'
    );
  }

  static refreshFailed(): AuthError {
    return new AuthError(
      AuthErrorCode.REFRESH_FAILED,
      'Не удалось обновить сессию. Пожалуйста, войдите в систему заново.'
    );
  }

  static logoutFailed(): AuthError {
    return new AuthError(
      AuthErrorCode.LOGOUT_FAILED,
      'Не удалось выйти из системы. Попробуйте еще раз.'
    );
  }
}

// Утилиты для обработки ошибок
export class AuthErrorHandler {
  // Получить пользовательское сообщение об ошибке
  static getUserMessage(error: unknown): string {
    if (error instanceof AuthError) {
      return error.message;
    }
    
    if (error instanceof Error) {
      return error.message;
    }
    
    return 'Произошла неизвестная ошибка.';
  }

  // Определить, нужно ли показать уведомление пользователю
  static shouldShowNotification(error: AuthError): boolean {
    // Не показываем уведомления для автоматических проверок токена
    return ![
      AuthErrorCode.NO_TOKEN,
      AuthErrorCode.INVALID_TOKEN
    ].includes(error.code);
  }

  // Определить, нужно ли автоматически перенаправить на страницу входа
  static shouldRedirectToLogin(error: AuthError): boolean {
    return error.requiresReauth && ![
      AuthErrorCode.USER_INACTIVE
    ].includes(error.code);
  }

  // Логирование ошибок для отладки
  static logError(error: AuthError, context?: string): void {
    const logData = {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      context,
      timestamp: new Date().toISOString(),
      originalError: error.originalError?.message
    };
    
    console.error('[Auth Error]', logData);
  }
}