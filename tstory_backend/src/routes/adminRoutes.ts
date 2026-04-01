import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../services/prismaClient';
import { config } from '../config';
import { readFallbackLogs } from '../services/errorLogService';

const router = Router();

// 관리자 여부 확인 미들웨어
function adminGuard(req: Request, res: Response, next: NextFunction): void {
  const email = req.query.email as string | undefined;
  if (!email || !config.admin.emails.includes(email)) {
    res.status(403).json({ success: false, error: '관리자 권한이 필요합니다.' });
    return;
  }
  next();
}

/**
 * 관리자 여부 확인
 * GET /api/admin/check?email=...
 */
router.get('/check', (req: Request, res: Response) => {
  const email = req.query.email as string | undefined;
  const isAdmin = !!email && config.admin.emails.includes(email);
  res.json({ success: true, isAdmin });
});

/**
 * 에러 로그 목록 (페이지네이션)
 * GET /api/admin/errors?email=...&page=1&limit=20&statusCode=500
 */
router.get('/errors', adminGuard, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const statusCode = req.query.statusCode ? parseInt(req.query.statusCode as string) : undefined;

    const where = statusCode ? { statusCode } : {};

    const [errors, total] = await Promise.all([
      prisma.errorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.errorLog.count({ where }),
    ]);

    res.json({
      success: true,
      errors,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get error logs failed:', error);
    res.status(500).json({ success: false, error: '에러 로그 조회 실패' });
  }
});

/**
 * 에러 통계
 * GET /api/admin/errors/stats?email=...
 */
router.get('/errors/stats', adminGuard, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [total, today, week, status500] = await Promise.all([
      prisma.errorLog.count(),
      prisma.errorLog.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.errorLog.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.errorLog.count({ where: { statusCode: 500 } }),
    ]);

    res.json({
      success: true,
      stats: { total, today, week, status500 },
    });
  } catch (error) {
    console.error('Get error stats failed:', error);
    res.status(500).json({ success: false, error: '에러 통계 조회 실패' });
  }
});

/**
 * 파일 폴백 에러 로그 (DB 저장 실패 시 기록된 로그)
 * GET /api/admin/errors/fallback?email=...&limit=100
 */
router.get('/errors/fallback', adminGuard, (req: Request, res: Response) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 100));
  const logs = readFallbackLogs(limit);
  res.json({ success: true, logs, count: logs.length });
});

/**
 * 프로세스 로그 목록 (페이지네이션 + 필터)
 * GET /api/admin/process-logs?email=...&page=1&limit=30&source=auth&level=error
 */
router.get('/process-logs', adminGuard, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 30));
    const source = req.query.source as string | undefined;
    const level = req.query.level as string | undefined;

    const where: Record<string, unknown> = {};
    if (source) where.source = source;
    if (level) where.level = level;

    const [logs, total] = await Promise.all([
      prisma.processLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.processLog.count({ where }),
    ]);

    res.json({
      success: true,
      logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get process logs failed:', error);
    res.status(500).json({ success: false, error: '프로세스 로그 조회 실패' });
  }
});

/**
 * 세션별 프로세스 로그 그룹 (최근 세션 목록)
 * GET /api/admin/process-logs/sessions?email=...&limit=20&source=auth
 */
router.get('/process-logs/sessions', adminGuard, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const source = req.query.source as string | undefined;

    const whereClause = source ? `WHERE source = '${source}'` : '';

    // 세션별 그룹: 최근 세션, 로그 수, 에러 수, 시작/종료 시간
    const sessions = await prisma.$queryRawUnsafe<Array<{
      sessionId: string;
      source: string;
      userEmail: string | null;
      logCount: bigint;
      errorCount: bigint;
      startedAt: Date;
      endedAt: Date;
      lastMessage: string;
    }>>(`
      SELECT
        sessionId,
        MAX(source) as source,
        MAX(userEmail) as userEmail,
        COUNT(*) as logCount,
        SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errorCount,
        MIN(createdAt) as startedAt,
        MAX(createdAt) as endedAt,
        (SELECT message FROM ProcessLog p2 WHERE p2.sessionId = ProcessLog.sessionId ORDER BY createdAt DESC LIMIT 1) as lastMessage
      FROM ProcessLog
      ${whereClause}
      GROUP BY sessionId
      ORDER BY MAX(createdAt) DESC
      LIMIT ${limit}
    `);

    // bigint → number 변환
    const serialized = sessions.map(s => ({
      ...s,
      logCount: Number(s.logCount),
      errorCount: Number(s.errorCount),
    }));

    res.json({ success: true, sessions: serialized });
  } catch (error) {
    console.error('Get process log sessions failed:', error);
    res.status(500).json({ success: false, error: '프로세스 로그 세션 조회 실패' });
  }
});

/**
 * 특정 세션의 전체 로그 (시간순)
 * GET /api/admin/process-logs/session/:sessionId?email=...
 */
router.get('/process-logs/session/:sessionId', adminGuard, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const logs = await prisma.processLog.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, logs, sessionId });
  } catch (error) {
    console.error('Get session logs failed:', error);
    res.status(500).json({ success: false, error: '세션 로그 조회 실패' });
  }
});

export default router;
