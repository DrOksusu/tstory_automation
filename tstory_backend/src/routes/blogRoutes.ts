import { Router } from 'express';
import {
  generateAndPublish,
  generatePreview,
  getPosts,
  startGenerate,
  getGenerateStatus,
} from '../controllers/blogController';

const router = Router();

// 블로그 글 생성 및 티스토리 발행 (기존 - 동기 방식)
router.post('/generate', generateAndPublish);

// 블로그 글 생성 및 발행 시작 (폴링 방식)
router.post('/start-generate', startGenerate);

// 발행 작업 상태 확인 (폴링)
router.get('/status/:taskId', getGenerateStatus);

// 미리보기 (발행하지 않음)
router.post('/preview', generatePreview);

// 생성된 글 목록 조회
router.get('/posts', getPosts);

export default router;
