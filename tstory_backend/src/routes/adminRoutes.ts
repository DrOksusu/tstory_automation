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

export default router;
