import { Router, Request, Response } from 'express';
import prisma from '../services/prismaClient';
import {
  generateAndPublish,
  generatePreview,
  getPosts,
  startGenerate,
  getGenerateStatus,
  startPublishContent,
  startPreview,
  getAvgDuration,
  getBlogNames,
} from '../controllers/blogController';
import {
  createSchedule,
  getSchedules,
  updateSchedule,
  deleteSchedule,
} from '../controllers/scheduleController';

const router = Router();

// 블로그 글 생성 및 티스토리 발행 (기존 - 동기 방식)
router.post('/generate', generateAndPublish);

// 블로그 글 생성 및 발행 시작 (폴링 방식)
router.post('/start-generate', startGenerate);

// 발행 작업 상태 확인 (폴링)
router.get('/status/:taskId', getGenerateStatus);

// 미리보기 (발행하지 않음) - 동기 방식 (레거시)
router.post('/preview', generatePreview);

// 미리보기 시작 (폴링 방식)
router.post('/start-preview', startPreview);

// 편집된 글 직접 발행 (폴링 방식)
router.post('/publish-content', startPublishContent);

// 생성된 글 목록 조회
router.get('/posts', getPosts);

// 사용된 블로그 이름 목록 조회 (최근 사용 순)
router.get('/blog-names', getBlogNames);

// 발행 평균 소요시간 조회
router.get('/avg-duration', getAvgDuration);

// 예약 발행 CRUD
router.post('/schedule', createSchedule);
router.get('/schedule', getSchedules);
router.patch('/schedule/:id', updateSchedule);
router.delete('/schedule/:id', deleteSchedule);

// 프롬프트 템플릿 CRUD
router.get('/prompts', async (_req: Request, res: Response) => {
  try {
    const prompts = await prisma.promptTemplate.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ success: true, prompts });
  } catch (error) {
    console.error('Get prompts failed:', error);
    res.status(500).json({ success: false, error: '프롬프트 목록 조회 실패' });
  }
});

router.post('/prompts', async (req: Request, res: Response) => {
  try {
    const { name, content } = req.body;
    if (!name || !content) {
      res.status(400).json({ success: false, error: '이름과 내용은 필수입니다.' });
      return;
    }
    const prompt = await prisma.promptTemplate.create({
      data: { name, content },
    });
    res.json({ success: true, prompt });
  } catch (error) {
    console.error('Create prompt failed:', error);
    res.status(500).json({ success: false, error: '프롬프트 생성 실패' });
  }
});

router.put('/prompts/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { name, content } = req.body;
    const prompt = await prisma.promptTemplate.update({
      where: { id },
      data: { ...(name && { name }), ...(content && { content }) },
    });
    res.json({ success: true, prompt });
  } catch (error) {
    console.error('Update prompt failed:', error);
    res.status(500).json({ success: false, error: '프롬프트 수정 실패' });
  }
});

router.delete('/prompts/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.promptTemplate.update({
      where: { id },
      data: { isActive: false },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete prompt failed:', error);
    res.status(500).json({ success: false, error: '프롬프트 삭제 실패' });
  }
});

export default router;
