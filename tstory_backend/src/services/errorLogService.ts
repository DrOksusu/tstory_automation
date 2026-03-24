import prisma from './prismaClient';

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
    // DB 저장 실패 시 콘솔에만 출력 (무한 루프 방지)
    console.error('ErrorLog DB 저장 실패:', dbError);
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
