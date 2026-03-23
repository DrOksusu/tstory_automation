import { Request, Response } from 'express';
import prisma from '../services/prismaClient';

// 예약 등록
export async function createSchedule(req: Request, res: Response) {
  try {
    const { title, content, tag, userEmail, scheduledAt } = req.body;

    if (!title || !content || !userEmail || !scheduledAt) {
      res.status(400).json({ success: false, error: '필수 필드가 누락되었습니다.' });
      return;
    }

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      res.status(400).json({ success: false, error: '예약 시각은 현재 시각 이후여야 합니다.' });
      return;
    }

    const post = await prisma.scheduledPost.create({
      data: {
        title,
        content,
        tag: tag || null,
        userEmail,
        scheduledAt: scheduledDate,
        status: 'scheduled',
      },
    });

    res.json({ success: true, data: post });
  } catch (error) {
    console.error('예약 등록 실패:', error);
    res.status(500).json({ success: false, error: '예약 등록에 실패했습니다.' });
  }
}

// 예약 목록 조회
export async function getSchedules(req: Request, res: Response) {
  try {
    const posts = await prisma.scheduledPost.findMany({
      where: { status: { not: 'cancelled' } },
      orderBy: { scheduledAt: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: posts });
  } catch (error) {
    console.error('예약 목록 조회 실패:', error);
    res.status(500).json({ success: false, error: '예약 목록 조회에 실패했습니다.' });
  }
}

// 예약 시간 변경
export async function updateSchedule(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { scheduledAt } = req.body;

    if (!scheduledAt) {
      res.status(400).json({ success: false, error: '변경할 예약 시각이 필요합니다.' });
      return;
    }

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      res.status(400).json({ success: false, error: '예약 시각은 현재 시각 이후여야 합니다.' });
      return;
    }

    const existing = await prisma.scheduledPost.findUnique({ where: { id: Number(id) } });
    if (!existing || existing.status !== 'scheduled') {
      res.status(400).json({ success: false, error: '변경 가능한 예약이 아닙니다.' });
      return;
    }

    const updated = await prisma.scheduledPost.update({
      where: { id: Number(id) },
      data: { scheduledAt: scheduledDate },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('예약 변경 실패:', error);
    res.status(500).json({ success: false, error: '예약 변경에 실패했습니다.' });
  }
}

// 예약 취소
export async function deleteSchedule(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const existing = await prisma.scheduledPost.findUnique({ where: { id: Number(id) } });
    if (!existing || existing.status !== 'scheduled') {
      res.status(400).json({ success: false, error: '취소 가능한 예약이 아닙니다.' });
      return;
    }

    const updated = await prisma.scheduledPost.update({
      where: { id: Number(id) },
      data: { status: 'cancelled' },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('예약 취소 실패:', error);
    res.status(500).json({ success: false, error: '예약 취소에 실패했습니다.' });
  }
}
