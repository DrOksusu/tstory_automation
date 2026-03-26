import prisma from './prismaClient';
import fs from 'fs';
import path from 'path';

// 파일 폴백 로그 경로 (Docker: /app/logs/, 로컬: {프로젝트}/logs/)
const LOG_DIR = path.resolve(process.cwd(), 'logs');
const FALLBACK_LOG_PATH = path.join(LOG_DIR, 'error-fallback.log');

// DB 저장 실패 시 파일에 기록 (JSON Lines 형식)
function logToFile(params: Record<string, unknown>, dbSaveError: string): void {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    const entry = {
      timestamp: new Date().toISOString(),
      ...params,
      dbSaveError,
    };
    fs.appendFileSync(FALLBACK_LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (fileError) {
    // 파일 쓰기도 실패하면 콘솔이 마지막 보루
    console.error('파일 폴백 로깅도 실패:', fileError);
  }
}

// 파일 폴백 로그 읽기 (최근 N줄)
export function readFallbackLogs(limit = 100): Record<string, unknown>[] {
  try {
    if (!fs.existsSync(FALLBACK_LOG_PATH)) return [];
    const content = fs.readFileSync(FALLBACK_LOG_PATH, 'utf-8').trim();
    if (!content) return [];
    const lines = content.split('\n');
    const recent = lines.slice(-limit);
    return recent
      .map(line => {
        try { return JSON.parse(line); }
        catch { return null; }
      })
      .filter(Boolean)
      .reverse() as Record<string, unknown>[];
  } catch {
    return [];
  }
}

// 민감 필드를 마스킹한 requestBody 반환
function sanitizeRequestBody(body: Record<string, unknown> | undefined): string | null {
  if (!body || Object.keys(body).length === 0) return null;

  const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'encryptedPassword'];
  const sanitized = { ...body };

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = '***MASKED***';
    }
  }

  return JSON.stringify(sanitized);
}

// 에러를 DB에 저장
export async function logError(params: {
  endpoint: string;
  method: string;
  statusCode: number;
  errorMessage: string;
  errorStack?: string;
  userEmail?: string;
  requestBody?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.errorLog.create({
      data: {
        endpoint: params.endpoint,
        method: params.method,
        statusCode: params.statusCode,
        errorMessage: params.errorMessage,
        errorStack: params.errorStack || null,
        userEmail: params.userEmail || null,
        requestBody: sanitizeRequestBody(params.requestBody),
      },
    });
  } catch (dbError) {
    // DB 저장 실패 시 콘솔 출력 + 파일 폴백
    console.error('ErrorLog DB 저장 실패:', dbError);
    const dbErrorMsg = dbError instanceof Error ? dbError.message : String(dbError);
    logToFile({
      endpoint: params.endpoint,
      method: params.method,
      statusCode: params.statusCode,
      errorMessage: params.errorMessage,
      userEmail: params.userEmail || null,
      requestBody: sanitizeRequestBody(params.requestBody),
    }, dbErrorMsg);
  }
}

// 라우트 catch 블록에서 사용하는 편의 함수
export async function logApiError(
  req: { originalUrl?: string; url: string; method: string; query: Record<string, unknown>; body?: unknown },
  statusCode: number,
  error: unknown
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  await logError({
    endpoint: req.originalUrl || req.url,
    method: req.method,
    statusCode,
    errorMessage,
    errorStack,
    userEmail: (req.query.ownerEmail as string) || ((req.body as Record<string, unknown>)?.ownerEmail as string) || (req.query.email as string),
    requestBody: req.body as Record<string, unknown> | undefined,
  });
}
