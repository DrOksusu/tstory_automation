import prisma from './prismaClient';
import { randomBytes } from 'crypto';

export type LogSource = 'auth' | 'publish' | 'cookie';
export type LogLevel = 'info' | 'warn' | 'error';

export interface ProcessLogger {
  info: (message: string, metadata?: Record<string, unknown>) => void;
  warn: (message: string, metadata?: Record<string, unknown>) => void;
  error: (message: string, metadata?: Record<string, unknown>) => void;
  sessionId: string;
}

// 세션 ID 생성 (짧고 읽기 쉬운 형태)
export function generateSessionId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(3).toString('hex');
  return `${prefix}-${timestamp}-${random}`;
}

// DB에 로그 저장 (fire-and-forget)
function saveLog(
  sessionId: string,
  source: LogSource,
  level: LogLevel,
  message: string,
  userEmail?: string,
  metadata?: Record<string, unknown>
): void {
  prisma.processLog.create({
    data: {
      sessionId,
      source,
      level,
      message,
      userEmail: userEmail || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  }).catch((err) => {
    console.error('[ProcessLog] DB 저장 실패:', err);
  });
}

// 로거 생성 함수
export function createLogger(
  source: LogSource,
  sessionId?: string,
  userEmail?: string
): ProcessLogger {
  const sid = sessionId || generateSessionId(source);

  return {
    sessionId: sid,
    info(message: string, metadata?: Record<string, unknown>) {
      console.log(message);
      saveLog(sid, source, 'info', message, userEmail, metadata);
    },
    warn(message: string, metadata?: Record<string, unknown>) {
      console.warn(message);
      saveLog(sid, source, 'warn', message, userEmail, metadata);
    },
    error(message: string, metadata?: Record<string, unknown>) {
      console.error(message);
      saveLog(sid, source, 'error', message, userEmail, metadata);
    },
  };
}
