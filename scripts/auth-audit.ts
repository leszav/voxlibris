#!/usr/bin/env tsx
/**
 * VoxLibris Authentication System Audit Script
 * 
 * Комплексный аудит системы аутентификации и авторизации.
 * Проверяет консистентность, потенциальные race conditions, 
 * проблемы с cookies и middleware.
 * 
 * Usage: npx tsx scripts/auth-audit.ts
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join, relative } from 'path';

const PROJECT_ROOT = process.cwd();
const CLIENT_SRC = join(PROJECT_ROOT, 'client/src');
const SERVER_SRC = join(PROJECT_ROOT, 'server');

interface AuditIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line?: number;
  category: string;
  message: string;
  code?: string;
  suggestion?: string;
}

interface AuditResult {
  score: number;
  totalChecks: number;
  passed: number;
  failed: number;
  issues: AuditIssue[];
  summary: Record<string, number>;
}

function countLines(text: string): number {
  return text.split('\n').length;
}

function findLineNumber(content: string, searchPattern: string, occurrence: number = 1): number {
  const lines = content.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(searchPattern)) {
      count++;
      if (count === occurrence) {
        return i + 1;
      }
    }
  }
  return -1;
}

function getFileContent(relativePath: string): string | null {
  const fullPath = join(PROJECT_ROOT, relativePath);
  if (!existsSync(fullPath)) {
    console.warn(`File not found: ${relativePath}`);
    return null;
  }
  try {
    return readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function logIssue(issue: AuditIssue): void {
  const icons = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢'
  };
  const icon = icons[issue.severity];
  const fileRef = issue.line ? `${issue.file}:${issue.line}` : issue.file;
  console.log(`${icon} [${issue.category}] ${fileRef}`);
  console.log(`   ${issue.message}`);
  if (issue.code) {
    console.log(`   Code: ${issue.code.trim().substring(0, 80)}...`);
  }
  if (issue.suggestion) {
    console.log(`   Fix: ${issue.suggestion}`);
  }
  console.log('');
}

// ============================================
// CHECK 1: Cookie Parser Global Middleware
// ============================================
function checkCookieParserGlobal(): AuditIssue[] {
  const issues: AuditIssue[] = [];
  
  const indexContent = getFileContent('server/index.ts');
  const authRoutesContent = getFileContent('server/auth-routes.ts');
  
  if (!indexContent || !authRoutesContent) return issues;
  
  // Проверяем есть ли app.use(cookieParser()) в index.ts
  const hasGlobalCookieParser = indexContent.includes("app.use(cookieParser())");
  const hasCookieParserImport = indexContent.includes('cookie-parser') || indexContent.includes('cookieParser');
  
  if (!hasGlobalCookieParser && hasCookieParserImport) {
    issues.push({
      severity: 'critical',
      file: 'server/index.ts',
      line: findLineNumber(indexContent, 'cookie-parser'),
      category: 'COOKIE_PARSER',
      message: 'cookie-parser импортирован в index.ts, но НЕ применен как global middleware',
      code: 'import cookieParser from "cookie-parser"; // но нет app.use(cookieParser())',
      suggestion: 'Добавить app.use(cookieParser()) после создания app, до регистрации роутов'
    });
  }
  
  // Проверяем используется ли req.cookies в middleware без global cookie-parser
  const jwtMiddlewareContent = getFileContent('server/jwt-middleware.ts');
  if (jwtMiddlewareContent && jwtMiddlewareContent.includes('req.cookies')) {
    if (!hasGlobalCookieParser) {
      issues.push({
        severity: 'critical',
        file: 'server/jwt-middleware.ts',
        line: findLineNumber(jwtMiddlewareContent, 'req.cookies'),
        category: 'COOKIE_PARSER',
        message: 'jwt-middleware использует req.cookies, но cookie-parser не применен глобально',
        code: 'if (!token && req.cookies?.accessToken) { token = req.cookies.accessToken; }',
        suggestion: 'Добавить app.use(cookieParser()) в server/index.ts'
      });
    }
  }
  
  return issues;
}

// ============================================
// CHECK 2: HttpOnly Cookie Consistency
// ============================================
function checkHttpOnlyConsistency(): AuditIssue[] {
  const issues: AuditIssue[] = [];
  
  const authRoutesContent = getFileContent('server/auth-routes.ts');
  if (!authRoutesContent) return issues;
  
  // Ищем все установки cookies в auth-routes
  const cookieSettings = authRoutesContent.match(/res\.cookie\(['"](accessToken|refreshToken)['"][^}]+httpOnly:\s*(\w+)/g);
  
  if (cookieSettings) {
    let accessHttpOnly: boolean | null = null;
    let refreshHttpOnly: boolean | null = null;
    
    for (const setting of cookieSettings) {
      const isAccess = setting.includes('accessToken');
      const httpOnly = setting.includes('httpOnly: true') || setting.includes('httpOnly:true');
      
      if (isAccess) {
        accessHttpOnly = httpOnly;
      } else {
        refreshHttpOnly = httpOnly;
      }
    }
    
    // accessToken должен быть httpOnly: false для WebSocket и client-side проверок
    // refreshToken должен быть httpOnly: true для безопасности
    
    if (accessHttpOnly !== false) {
      issues.push({
        severity: 'high',
        file: 'server/auth-routes.ts',
        line: findLineNumber(authRoutesContent, "res.cookie('accessToken'"),
        category: 'HTTPONLY_CONSISTENCY',
        message: 'accessToken cookie должен иметь httpOnly: false для WebSocket и client-side проверок',
        code: "res.cookie('accessToken', ..., { httpOnly: false, ... })",
        suggestion: 'Убедиться что accessToken имеет httpOnly: false'
      });
    }
    
    if (refreshHttpOnly !== true) {
      issues.push({
        severity: 'critical',
        file: 'server/auth-routes.ts',
        line: findLineNumber(authRoutesContent, "res.cookie('refreshToken'"),
        category: 'HTTPONLY_CONSISTENCY',
        message: 'refreshToken cookie должен иметь httpOnly: true для защиты от XSS',
        code: "res.cookie('refreshToken', ..., { httpOnly: true, ... })",
        suggestion: 'Убедиться что refreshToken имеет httpOnly: true'
      });
    }
  }
  
  return issues;
}

// ============================================
// CHECK 3: Logout/Relogin Race Conditions
// ============================================
function checkLogoutReloginLogic(): AuditIssue[] {
  const issues: AuditIssue[] = [];
  
  const useAuthContent = getFileContent('client/src/hooks/use-auth.tsx');
  if (!useAuthContent) return issues;
  
  // Проверяем логику hasExplicitLogoutRef
  const hasLogoutRef = useAuthContent.includes('hasExplicitLogoutRef');
  const hasLogoutSet = (useAuthContent.match(/hasExplicitLogoutRef\.current\s*=\s*true/g) || []).length;
  const hasLogoutReset = (useAuthContent.match(/hasExplicitLogoutRef\.current\s*=\s*false/g) || []).length;
  
  if (hasLogoutRef) {
    if (hasLogoutSet > hasLogoutReset) {
      issues.push({
        severity: 'medium',
        file: 'client/src/hooks/use-auth.tsx',
        category: 'LOGOUT_RELOGIC',
        message: 'hasExplicitLogoutRef устанавливается в true чаще чем сбрасывается в false',
        suggestion: 'Проверить баланс установки/сброса флага explicit logout'
      });
    }
    
    // Проверяем где сбрасывается флаг
    if (useAuthContent.includes('hasExplicitLogoutRef.current = false')) {
      const lines = useAuthContent.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('hasExplicitLogoutRef.current = false')) {
          const context = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
          // Проверяем что это не в logout функции
          if (!context.includes('logout') && !context.includes('function logout')) {
            issues.push({
              severity: 'high',
              file: 'client/src/hooks/use-auth.tsx',
              line: i + 1,
              category: 'LOGOUT_RELOGIC',
              message: 'hasExplicitLogoutRef сбрасывается ВНЕ функции logout - возможен нежелательный re-login',
              code: lines[i],
              suggestion: 'Сброс флага должен происходить только после успешного server-side logout'
            });
          }
        }
      }
    }
  }
  
  // Проверяем await в logout
  const logoutContent = useAuthContent.match(/const logout[^}]+}/s);
  if (logoutContent && logoutContent[0].includes('.catch(')) {
    issues.push({
      severity: 'medium',
      file: 'client/src/hooks/use-auth.tsx',
      line: findLineNumber(useAuthContent, 'void authAPI.logout()'),
      category: 'LOGOUT_RELOGIC',
      message: 'authAPI.logout() вызывается с void, не await - возможна race condition',
      code: 'void authAPI.logout().catch(...)',
      suggestion: 'Использовать await или убедиться что logout завершен перед очисткой state'
    });
  }
  
  return issues;
}

// ============================================
// CHECK 4: Async Middleware Without Next
// ============================================
function checkAsyncMiddlewareNext(): AuditIssue[] {
  const issues: AuditIssue[] = [];
  
  const jwtMiddlewareContent = getFileContent('server/jwt-middleware.ts');
  if (!jwtMiddlewareContent) return issues;
  
  // Проверяем requireActiveUser - классическая проблема с async IIFE
  if (jwtMiddlewareContent.includes('requireActiveUser')) {
    const requireActiveUserMatch = jwtMiddlewareContent.match(/export function requireActiveUser[\s\S]*?^\s*\}/m);
    
    if (requireActiveUserMatch) {
      const funcBody = requireActiveUserMatch[0];
      
      // Ищем паттерн: async IIFE без proper next() handling
      if (funcBody.includes('(async () =>') && !funcBody.match(/await\s+next\(\)/)) {
        issues.push({
          severity: 'high',
          file: 'server/jwt-middleware.ts',
          line: findLineNumber(jwtMiddlewareContent, 'export function requireActiveUser'),
          category: 'ASYNC_MIDDLEWARE',
          message: 'requireActiveUser использует async IIFE без await next() - middleware может не завершиться',
          code: '(async () => { ... next(); })(); // next вызывается асинхронно!',
          suggestion: 'Использовать express-async-wrap или вызывать next() синхронно'
        });
      }
    }
  }
  
  return issues;
}

// ============================================
// CHECK 5: Token Synchronization Race Conditions
// ============================================
function checkTokenSyncRaceConditions(): AuditIssue[] {
  const issues: AuditIssue[] = [];
  
  const queryClientContent = getFileContent('client/src/lib/queryClient.ts');
  const tokenStoreContent = getFileContent('client/src/lib/token-store.ts');
  
  if (!queryClientContent || !tokenStoreContent) return issues;
  
  // Проверяем isRefreshing protection в queryClient
  if (queryClientContent.includes('isRefreshing')) {
    const isRefreshingPattern = queryClientContent.match(/isRefreshing\s*=\s*(true|false)/g);
    if (isRefreshingPattern && isRefreshingPattern.length === 1) {
      issues.push({
        severity: 'medium',
        file: 'client/src/lib/queryClient.ts',
        line: findLineNumber(queryClientContent, 'let isRefreshing'),
        category: 'TOKEN_SYNC',
        message: 'В queryClient есть isRefreshing protection, но нужно проверить консистентность с auth.ts',
        suggestion: 'Убедиться что auth.ts использует тот же механизм защиты от race conditions'
      });
    }
  }
  
  // Проверяем isSyncing в token-store
  if (tokenStoreContent.includes('isSyncing')) {
    issues.push({
      severity: 'low',
      file: 'client/src/lib/token-store.ts',
      line: findLineNumber(tokenStoreContent, 'let isSyncing'),
      category: 'TOKEN_SYNC',
      message: 'token-store.ts имеет isSyncing protection - это хорошо для предотвращения race conditions',
      suggestion: 'Продолжить использовать паттерн защиты от одновременных вызовов'
    });
  }
  
  // Проверяем syncTokenFromCookie вызывается в нужных местах
  const loginContent = queryClientContent.match(/syncTokenFromCookie\(\)/g);
  const registerContent = queryClientContent.match(/syncTokenFromCookie\(\)/g);
  
  if (loginContent && registerContent && loginContent.length !== registerContent.length) {
    issues.push({
      severity: 'medium',
      file: 'client/src/lib/queryClient.ts',
      category: 'TOKEN_SYNC',
      message: 'syncTokenFromCookie вызывается неконсистентно между login и register',
      suggestion: 'Проверить что syncTokenFromCookie вызывается после каждого auth operation'
    });
  }
  
  return issues;
}

// ============================================
// CHECK 6: Refresh Token Timing Issues
// ============================================
function checkRefreshTokenTiming(): AuditIssue[] {
  const issues: AuditIssue[] = [];
  
  const authContent = getFileContent('client/src/lib/auth.ts');
  if (!authContent) return issues;
  
  // Проверяем таймер обновления токена
  const refreshTimerMatch = authContent.match(/refreshTime\s*=\s*Math\.max\([^)]+\)/);
  if (refreshTimerMatch) {
    const timingLine = authContent.split('\n').find(l => l.includes('refreshTime'));
    if (timingLine) {
      const minTimeMatch = timingLine.match(/Math\.max\([^,]+,\s*(\d+)\s*\*\s*1000\)/);
      if (minTimeMatch) {
        const minSeconds = parseInt(minTimeMatch[1]);
        if (minSeconds < 30) {
          issues.push({
            severity: 'low',
            file: 'client/src/lib/auth.ts',
            line: findLineNumber(authContent, 'Math.max'),
            category: 'TOKEN_TIMING',
            message: 'Минимальное время до refresh может быть слишком маленьким',
            code: timingLine,
            suggestion: 'Рекомендуется минимум 30 секунд для предотвращения loop'
          });
        }
      }
    }
  }
  
  // Проверяем expiresIn - 2 минуты до истечения
  if (authContent.includes('expiresIn - 2 * 60 * 1000')) {
    issues.push({
      severity: 'medium',
      file: 'client/src/lib/auth.ts',
      line: findLineNumber(authContent, 'expiresIn - 2'),
      category: 'TOKEN_TIMING',
      message: 'Токен обновляется за 2 минуты до истечения - рекомендуется 5 минут для надежности',
      code: 'const refreshTime = Math.max(expiresIn - 2 * 60 * 1000, 30 * 1000);',
      suggestion: 'Рассмотреть увеличение до 5 минут: expiresIn - 5 * 60 * 1000'
    });
  }
  
  return issues;
}

// ============================================
// CHECK 7: WebSocket Auth Consistency
// ============================================
function checkWebSocketAuthConsistency(): AuditIssue[] {
  const issues: AuditIssue[] = [];
  
  const websocketContent = getFileContent('server/websocket.ts');
  const websocketChatContent = getFileContent('server/websocket-chat.ts');
  const websocketReaderContent = getFileContent('server/websocket-reader.ts');
  
  // Проверяем используется ли тот же extractToken логики
  if (websocketContent && websocketContent.includes('extractUserFromToken')) {
    const extractUserCall = websocketContent.match(/extractUserFromToken\([^)]+\)/g);
    if (extractUserCall && extractUserCall.length > 1) {
      issues.push({
        severity: 'low',
        file: 'server/websocket.ts',
        category: 'WEBSOCKET_AUTH',
        message: 'extractUserFromToken вызывается несколько раз - возможно стоит кэшировать',
        suggestion: 'Рассмотреть кэширование результата extractUserFromToken для оптимизации'
      });
    }
  }
  
  return issues;
}

// ============================================
// CHECK 8: Missing Bulk Delete for Club Discussions
// ============================================
function checkMissingEndpoints(): AuditIssue[] {
  const issues: AuditIssue[] = [];
  
  const discussionsContent = getFileContent('server/club-discussions-routes.ts');
  if (!discussionsContent) return issues;
  
  // Проверяем есть ли bulk delete
  if (!discussionsContent.includes('deleteAll') && !discussionsContent.includes('bulkDelete')) {
    issues.push({
      severity: 'medium',
      file: 'server/club-discussions-routes.ts',
      category: 'MISSING_ENDPOINT',
      message: 'Отсутствует endpoint для bulk-delete обсуждений клуба',
      suggestion: 'Добавить DELETE /api/clubs/:clubId/discussions для очистки всей доски владельцем'
    });
  }
  
  return issues;
}

// ============================================
// CHECK 9: Error Handling Consistency
// ============================================
function checkErrorHandling(): AuditIssue[] {
  const issues: AuditIssue[] = [];
  
  const authRoutesContent = getFileContent('server/auth-routes.ts');
  const authServiceContent = getFileContent('server/auth-service.ts');
  
  if (!authRoutesContent || !authServiceContent) return issues;
  
  // Проверяем консистентность error codes
  const routeErrors = authRoutesContent.match(/code:\s*['"][^'"]+['"]/g);
  const serviceErrors = authServiceContent.match(/throw new Error\(['"][^'"]+['"]\)/g);
  
  if (routeErrors && serviceErrors) {
    const routeCodes = routeErrors.map(e => e.replace(/code:\s*['"]([^'"]+)['"]/, '$1'));
    const serviceErrorCodes = serviceErrors.map(e => e.replace(/throw new Error\(['"]([^'"]+)['"]\)/, '$1'));
    
    // Проверяем ACCOUNT_SUSPENDED handling
    if (!routeErrors.some(e => e.includes('ACCOUNT_SUSPENDED')) && serviceErrors.some(e => e.includes('ACCOUNT_SUSPENDED'))) {
      issues.push({
        severity: 'low',
        file: 'server/auth-routes.ts',
        category: 'ERROR_HANDLING',
        message: 'ACCOUNT_SUSPENDED выбрасывается в service, но может не обрабатываться консистентно в routes',
        suggestion: 'Проверить что все error codes из service обрабатываются в routes'
      });
    }
  }
  
  return issues;
}

// ============================================
// CHECK 10: Environment Variable Validation
// ============================================
function checkEnvValidation(): AuditIssue[] {
  const issues: AuditIssue[] = [];
  
  const authServiceContent = getFileContent('server/auth-service.ts');
  if (!authServiceContent) return issues;
  
  // Проверяем getRequiredEnvVar использование
  if (authServiceContent.includes('getRequiredEnvVar')) {
    const envVars = authServiceContent.match(/getRequiredEnvVar\(['"]([^'"]+)['"]\)/g);
    if (envVars && envVars.length >= 2) {
      issues.push({
        severity: 'low',
        file: 'server/auth-service.ts',
        category: 'ENV_VALIDATION',
        message: 'auth-service проверяет JWT_SECRET и JWT_REFRESH_SECRET при первом вызове',
        suggestion: 'Убедиться что эти переменные установлены в .env и production environment'
      });
    }
  }
  
  return issues;
}

// ============================================
// MAIN AUDIT RUNNER
// ============================================
function runAudit(): AuditResult {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       VoxLibris Authentication System Audit                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const allIssues: AuditIssue[] = [];
  
  // Запускаем все проверки
  console.log('🔍 Running audit checks...\n');
  
  console.log('─── Check 1: Cookie Parser Global Middleware ───');
  const check1 = checkCookieParserGlobal();
  check1.forEach(logIssue);
  allIssues.push(...check1);
  
  console.log('─── Check 2: HttpOnly Cookie Consistency ───');
  const check2 = checkHttpOnlyConsistency();
  check2.forEach(logIssue);
  allIssues.push(...check2);
  
  console.log('─── Check 3: Logout/Re-login Race Conditions ───');
  const check3 = checkLogoutReloginLogic();
  check3.forEach(logIssue);
  allIssues.push(...check3);
  
  console.log('─── Check 4: Async Middleware Without Next ───');
  const check4 = checkAsyncMiddlewareNext();
  check4.forEach(logIssue);
  allIssues.push(...check4);
  
  console.log('─── Check 5: Token Synchronization Race Conditions ───');
  const check5 = checkTokenSyncRaceConditions();
  check5.forEach(logIssue);
  allIssues.push(...check5);
  
  console.log('─── Check 6: Refresh Token Timing Issues ───');
  const check6 = checkRefreshTokenTiming();
  check6.forEach(logIssue);
  allIssues.push(...check6);
  
  console.log('─── Check 7: WebSocket Auth Consistency ───');
  const check7 = checkWebSocketAuthConsistency();
  check7.forEach(logIssue);
  allIssues.push(...check7);
  
  console.log('─── Check 8: Missing Endpoints (Bulk Delete) ───');
  const check8 = checkMissingEndpoints();
  check8.forEach(logIssue);
  allIssues.push(...check8);
  
  console.log('─── Check 9: Error Handling Consistency ───');
  const check9 = checkErrorHandling();
  check9.forEach(logIssue);
  allIssues.push(...check9);
  
  console.log('─── Check 10: Environment Variable Validation ───');
  const check10 = checkEnvValidation();
  check10.forEach(logIssue);
  allIssues.push(...check10);
  
  // Подсчет результатов
  const byCategory: Record<string, number> = {};
  allIssues.forEach(i => {
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
  });
  
  const criticalCount = allIssues.filter(i => i.severity === 'critical').length;
  const highCount = allIssues.filter(i => i.severity === 'high').length;
  const mediumCount = allIssues.filter(i => i.severity === 'medium').length;
  const lowCount = allIssues.filter(i => i.severity === 'low').length;
  
  return {
    score: Math.max(0, 100 - (criticalCount * 25) - (highCount * 10) - (mediumCount * 5) - (lowCount * 1)),
    totalChecks: 10,
    passed: 10 - allIssues.filter(i => i.severity === 'critical' || i.severity === 'high').length,
    failed: allIssues.filter(i => i.severity === 'critical' || i.severity === 'high').length,
    issues: allIssues,
    summary: { critical: criticalCount, high: highCount, medium: mediumCount, low: lowCount, ...byCategory }
  };
}

// ============================================
// PRINT SUMMARY
// ============================================
function printSummary(result: AuditResult): void {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      AUDIT SUMMARY                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const scoreColor = result.score >= 80 ? '🟢' : result.score >= 60 ? '🟡' : '🔴';
  console.log(`${scoreColor} Auth System Score: ${result.score}/100`);
  console.log('');
  console.log(`📊 Issues by Severity:`);
  console.log(`   🔴 Critical: ${result.summary.critical}`);
  console.log(`   🟠 High: ${result.summary.high}`);
  console.log(`   🟡 Medium: ${result.summary.medium}`);
  console.log(`   🟢 Low: ${result.summary.low}`);
  console.log('');
  console.log(`📁 Issues by Category:`);
  Object.entries(result.summary)
    .filter(([k]) => !['critical', 'high', 'medium', 'low'].includes(k))
    .forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count}`);
    });
  console.log('');
  
  if (result.summary.critical > 0 || result.summary.high > 0) {
    console.log('⚠️  HIGH PRIORITY FIXES NEEDED:');
    console.log('');
    result.issues
      .filter(i => i.severity === 'critical' || i.severity === 'high')
      .forEach((issue, idx) => {
        console.log(`${idx + 1}. [${issue.file}${issue.line ? ':' + issue.line : ''}] - ${issue.category}`);
      });
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  
  if (result.score >= 80) {
    console.log('✅ Authentication system is in GOOD condition!');
  } else if (result.score >= 60) {
    console.log('⚠️  Authentication system needs SOME IMPROVEMENTS');
  } else {
    console.log('🚨 Authentication system needs CRITICAL FIXES!');
  }
}

// ============================================
// EXECUTE
// ============================================
const result = runAudit();
printSummary(result);

// Return exit code based on critical issues
process.exit(result.summary.critical > 0 ? 1 : 0);
