import { Router } from 'express';
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

export default router;
