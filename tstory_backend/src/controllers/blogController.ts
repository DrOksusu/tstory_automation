import { Request, Response } from 'express';
import { generateBlogContent } from '../services/aiService';
import { publishToTistory } from '../services/tistoryService';
import { cleanHtml, cleanMetaDescription } from '../utils/htmlProcessor';
import prisma from '../services/prismaClient';
import { GenerateBlogRequest, BlogGenerationResult } from '../types';
import { logApiError, logError } from '../services/errorLogService';

// ==================== 폴링 기반 발행 작업 관리 ====================

interface PreviewResult {
  title: string;
  metaDescription: string;
  content: string;
}

interface GenerateTask {
  id: string;
  status: 'pending' | 'generating' | 'publishing' | 'success' | 'failed';
  message: string;
  step: number;
  totalSteps: number;
  result?: BlogGenerationResult;
  previewResult?: PreviewResult;
  error?: string;
  startedAt: number;
}

// 활성 작업 저장소
const generateTasks = new Map<string, GenerateTask>();

/**
 * 고유 작업 ID 생성
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 발행 작업 시작 (폴링 방식)
 * POST /api/blog/start-generate
 */
export async function startGenerate(
  req: Request<object, object, GenerateBlogRequest>,
  res: Response
): Promise<void> {
  const { sourceUrl, mainKeyword, regionKeyword, customTopic, systemPrompt, userEmail, ownerEmail, aiModel } = req.body;

  if (!sourceUrl || !mainKeyword || !regionKeyword) {
    res.status(400).json({
      success: false,
      error: '필수 입력값이 누락되었습니다. (sourceUrl, mainKeyword, regionKeyword)',
    });
    return;
  }

  const taskId = generateTaskId();

  const task: GenerateTask = {
    id: taskId,
    status: 'pending',
    message: '작업을 시작하는 중...',
    step: 1,
    totalSteps: 12,
    startedAt: Date.now(),
  };

  generateTasks.set(taskId, task);

  // 백그라운드에서 작업 실행
  runGenerateTask(taskId, sourceUrl, mainKeyword, regionKeyword, userEmail, aiModel, ownerEmail, customTopic, systemPrompt).catch((error) => {
    console.error(`Generate task error for ${taskId}:`, error);
    const task = generateTasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.message = error instanceof Error ? error.message : 'Unknown error';
      task.error = task.message;
    }
  });

  res.json({
    success: true,
    taskId,
    message: '발행 작업이 시작되었습니다.',
  });
}

/**
 * 작업 상태 확인
 * GET /api/blog/status/:taskId
 */
export function getGenerateStatus(req: Request, res: Response): void {
  const { taskId } = req.params;
  const task = generateTasks.get(taskId);

  if (!task) {
    res.json({
      success: false,
      status: 'not_found',
      message: '작업을 찾을 수 없습니다.',
      completed: true,
    });
    return;
  }

  const completed = ['success', 'failed'].includes(task.status);
  const elapsedMs = Date.now() - task.startedAt;
  const durationMs = completed ? elapsedMs : undefined;

  res.json({
    success: task.status === 'success',
    status: task.status,
    message: task.message,
    step: task.step,
    totalSteps: task.totalSteps,
    completed,
    result: task.result,
    previewResult: task.previewResult,
    error: task.error,
    elapsedMs,
    durationMs,
  });
}

/**
 * 백그라운드 발행 작업
 */
async function runGenerateTask(
  taskId: string,
  sourceUrl: string,
  mainKeyword: string,
  regionKeyword: string,
  userEmail?: string,
  aiModel?: 'gemini' | 'claude',
  ownerEmail?: string,
  customTopic?: string,
  systemPrompt?: string
): Promise<void> {
  const task = generateTasks.get(taskId);
  if (!task) return;

  try {
    // 1. 작업 시작
    task.step = 1;
    task.totalSteps = 12;

    // 2. AI로 글 생성
    task.status = 'generating';
    const modelName = aiModel || 'claude';
    task.step = 2;
    task.message = `AI(${modelName})가 글을 생성하는 중...`;
    console.log(`[${taskId}] Generating blog content with ${modelName}...`);

    const generatedContent = await generateBlogContent(
      sourceUrl,
      mainKeyword,
      regionKeyword,
      modelName,
      customTopic,
      systemPrompt
    );

    // 3. HTML 후처리
    task.step = 3;
    task.message = 'HTML 처리 중...';
    console.log(`[${taskId}] Processing HTML...`);
    const cleanedContent = cleanHtml(generatedContent.content);

    // 4. DB에 저장
    task.step = 4;
    task.message = '데이터베이스 저장 중...';
    console.log(`[${taskId}] Saving to database...`);
    const blogPost = await prisma.blogPost.create({
      data: {
        sourceUrl,
        mainKeyword,
        regionKeyword,
        title: generatedContent.title,
        content: cleanedContent,
        status: 'created',
      },
    });

    // 5~12. 티스토리에 발행 (onProgress 8회 호출)
    task.status = 'publishing';
    task.message = '티스토리에 발행 중... (브라우저 작업 진행 중)';
    console.log(`[${taskId}] Publishing to Tistory... (user: ${userEmail || 'none'}, owner: ${ownerEmail || 'none'})`);

    let publishStep = 4;
    const tistoryResult = await publishToTistory({
      title: generatedContent.title,
      content: cleanedContent,
      tag: `${mainKeyword},${regionKeyword}`,
      userEmail,
      ownerEmail,
      onProgress: (msg) => { publishStep++; task.step = publishStep; task.message = msg; },
    });

    if (!tistoryResult.success) {
      await prisma.blogPost.update({
        where: { id: blogPost.id },
        data: { status: 'failed' },
      });

      const failMessage = tistoryResult.error || '티스토리 발행 실패';
      task.status = 'failed';
      task.message = failMessage;
      task.error = failMessage;

      await logError({
        endpoint: '/api/blog/start-generate (tistory-publish)',
        method: 'POST',
        statusCode: 500,
        errorMessage: failMessage,
        requestBody: { sourceUrl, mainKeyword, regionKeyword, userEmail },
      });
      return;
    }

    // 5. DB 업데이트 (durationMs 포함)
    const durationMs = Date.now() - task.startedAt;
    await prisma.blogPost.update({
      where: { id: blogPost.id },
      data: {
        tistoryPostId: tistoryResult.postUrl,
        status: 'published',
        durationMs,
      },
    });

    task.status = 'success';
    task.message = '발행 완료!';
    task.result = {
      success: true,
      postId: blogPost.id,
      tistoryUrl: tistoryResult.postUrl,
      title: generatedContent.title,
      durationMs,
    };

    console.log(`[${taskId}] Blog post published successfully (${durationMs}ms):`, task.result);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`[${taskId}] Error:`, errorMessage);
    task.status = 'failed';
    task.message = errorMessage;
    task.error = errorMessage;

    await logError({
      endpoint: '/api/blog/start-generate (background)',
      method: 'POST',
      statusCode: 500,
      errorMessage,
      errorStack,
      requestBody: { sourceUrl, mainKeyword, regionKeyword, aiModel },
    });
  } finally {
    // 30분 후 작업 정리
    setTimeout(() => {
      generateTasks.delete(taskId);
    }, 1800000);
  }
}

// ==================== 편집된 글 직접 발행 ====================

interface PublishContentRequest {
  title: string;
  content: string;
  metaDescription?: string;
  userEmail?: string;
  ownerEmail?: string;
}

/**
 * 편집된 글 발행 시작 (폴링 방식)
 * POST /api/blog/publish-content
 */
export async function startPublishContent(
  req: Request<object, object, PublishContentRequest>,
  res: Response
): Promise<void> {
  const { title, content, metaDescription, userEmail, ownerEmail } = req.body;

  if (!title || !content) {
    res.status(400).json({
      success: false,
      error: '제목과 본문이 필요합니다.',
    });
    return;
  }

  const taskId = generateTaskId();

  const task: GenerateTask = {
    id: taskId,
    status: 'pending',
    message: '발행 작업을 시작하는 중...',
    step: 1,
    totalSteps: 10,
    startedAt: Date.now(),
  };

  generateTasks.set(taskId, task);

  // 백그라운드에서 발행 작업 실행
  runPublishContentTask(taskId, title, content, userEmail, ownerEmail).catch((error) => {
    console.error(`Publish content task error for ${taskId}:`, error);
    const task = generateTasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.message = error instanceof Error ? error.message : 'Unknown error';
      task.error = task.message;
    }
  });

  res.json({
    success: true,
    taskId,
    message: '발행 작업이 시작되었습니다.',
  });
}

/**
 * 편집된 글 백그라운드 발행 작업
 */
async function runPublishContentTask(
  taskId: string,
  title: string,
  content: string,
  userEmail?: string,
  ownerEmail?: string
): Promise<void> {
  const task = generateTasks.get(taskId);
  if (!task) return;

  try {
    // 1. 발행 준비
    task.step = 1;
    task.totalSteps = 10;

    // 2. DB에 저장
    task.status = 'publishing';
    task.step = 2;
    task.message = '데이터베이스 저장 중...';
    console.log(`[${taskId}] Saving edited content to database...`);

    const blogPost = await prisma.blogPost.create({
      data: {
        sourceUrl: 'manual-edit',
        mainKeyword: '',
        regionKeyword: '',
        title: title,
        content: content,
        status: 'created',
      },
    });

    // 3~10. 티스토리에 발행 (onProgress 8회 호출)
    task.message = '티스토리에 발행 중... (브라우저 작업 진행 중)';
    console.log(`[${taskId}] Publishing edited content to Tistory... (user: ${userEmail || 'none'}, owner: ${ownerEmail || 'none'})`);

    let publishStep = 2;
    const tistoryResult = await publishToTistory({
      title: title,
      content: content,
      tag: '',
      userEmail,
      ownerEmail,
      onProgress: (msg) => { publishStep++; task.step = publishStep; task.message = msg; },
    });

    if (!tistoryResult.success) {
      await prisma.blogPost.update({
        where: { id: blogPost.id },
        data: { status: 'failed' },
      });

      const failMessage = tistoryResult.error || '티스토리 발행 실패';
      task.status = 'failed';
      task.message = failMessage;
      task.error = failMessage;

      await logError({
        endpoint: '/api/blog/publish-content (tistory-publish)',
        method: 'POST',
        statusCode: 500,
        errorMessage: failMessage,
        requestBody: { title, userEmail },
      });
      return;
    }

    // 3. DB 업데이트 (durationMs 포함)
    const durationMs = Date.now() - task.startedAt;
    await prisma.blogPost.update({
      where: { id: blogPost.id },
      data: {
        tistoryPostId: tistoryResult.postUrl,
        status: 'published',
        durationMs,
      },
    });

    task.status = 'success';
    task.message = '발행 완료!';
    task.result = {
      success: true,
      postId: blogPost.id,
      tistoryUrl: tistoryResult.postUrl,
      title: title,
      durationMs,
    };

    console.log(`[${taskId}] Edited content published successfully (${durationMs}ms):`, task.result);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`[${taskId}] Error:`, errorMessage);
    task.status = 'failed';
    task.message = errorMessage;
    task.error = errorMessage;

    await logError({
      endpoint: '/api/blog/publish-content (background)',
      method: 'POST',
      statusCode: 500,
      errorMessage,
      errorStack,
      requestBody: { title },
    });
  } finally {
    // 30분 후 작업 정리
    setTimeout(() => {
      generateTasks.delete(taskId);
    }, 1800000);
  }
}

/**
 * 블로그 글 생성 및 발행
 * POST /api/blog/generate
 */
export async function generateAndPublish(
  req: Request<object, object, GenerateBlogRequest>,
  res: Response
): Promise<void> {
  const { sourceUrl, mainKeyword, regionKeyword, customTopic, systemPrompt, userEmail, ownerEmail, aiModel } = req.body;

  // 입력값 검증
  if (!sourceUrl || !mainKeyword || !regionKeyword) {
    res.status(400).json({
      success: false,
      error: '필수 입력값이 누락되었습니다. (sourceUrl, mainKeyword, regionKeyword)',
    });
    return;
  }

  try {
    // 1. AI로 글 생성
    const modelName = aiModel || 'claude';
    console.log(`Generating blog content with ${modelName}...`);
    const generatedContent = await generateBlogContent(
      sourceUrl,
      mainKeyword,
      regionKeyword,
      modelName,
      customTopic,
      systemPrompt
    );

    // 2. HTML 후처리
    console.log('Processing HTML...');
    const cleanedContent = cleanHtml(generatedContent.content);
    const cleanedMetaDesc = cleanMetaDescription(generatedContent.metaDescription);

    // 3. DB에 저장
    console.log('Saving to database...');
    const blogPost = await prisma.blogPost.create({
      data: {
        sourceUrl,
        mainKeyword,
        regionKeyword,
        title: generatedContent.title,
        content: cleanedContent,
        status: 'created',
      },
    });

    // 4. 티스토리에 발행 (Puppeteer)
    console.log(`Publishing to Tistory... (user: ${userEmail || 'none'}, owner: ${ownerEmail || 'none'})`);
    const tistoryResult = await publishToTistory({
      title: generatedContent.title,
      content: cleanedContent,
      tag: `${mainKeyword},${regionKeyword}`,
      userEmail,
      ownerEmail,
    });

    if (!tistoryResult.success) {
      // 발행 실패 시 DB 상태 업데이트
      await prisma.blogPost.update({
        where: { id: blogPost.id },
        data: { status: 'failed' },
      });

      res.status(500).json({
        success: false,
        postId: blogPost.id,
        error: tistoryResult.error || 'Tistory publish failed',
        title: generatedContent.title,
      });
      return;
    }

    // 5. DB 업데이트 (발행 완료)
    await prisma.blogPost.update({
      where: { id: blogPost.id },
      data: {
        tistoryPostId: tistoryResult.postUrl,
        status: 'published',
      },
    });

    const result: BlogGenerationResult = {
      success: true,
      postId: blogPost.id,
      tistoryUrl: tistoryResult.postUrl,
      title: generatedContent.title,
    };

    console.log('Blog post published successfully:', result);
    res.json(result);
  } catch (error) {
    console.error('Error in generateAndPublish:', error);
    await logApiError(req, 500, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * 글 생성만 (발행하지 않음) - 미리보기용
 * POST /api/blog/preview
 */
export async function generatePreview(
  req: Request<object, object, GenerateBlogRequest>,
  res: Response
): Promise<void> {
  const { sourceUrl, mainKeyword, regionKeyword, customTopic, systemPrompt, aiModel } = req.body;

  if (!sourceUrl || !mainKeyword || !regionKeyword) {
    res.status(400).json({
      success: false,
      error: '필수 입력값이 누락되었습니다.',
    });
    return;
  }

  try {
    // AI로 글 생성
    const modelName = aiModel || 'claude';
    const generatedContent = await generateBlogContent(
      sourceUrl,
      mainKeyword,
      regionKeyword,
      modelName,
      customTopic,
      systemPrompt
    );

    // HTML 후처리
    const cleanedContent = cleanHtml(generatedContent.content);
    const cleanedMetaDesc = cleanMetaDescription(generatedContent.metaDescription);

    res.json({
      success: true,
      title: generatedContent.title,
      metaDescription: cleanedMetaDesc,
      content: cleanedContent,
    });
  } catch (error) {
    console.error('Error in generatePreview:', error);
    await logApiError(req, 500, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * 미리보기 작업 시작 (폴링 방식)
 * POST /api/blog/start-preview
 */
export async function startPreview(
  req: Request<object, object, GenerateBlogRequest>,
  res: Response
): Promise<void> {
  const { sourceUrl, mainKeyword, regionKeyword, customTopic, systemPrompt, aiModel } = req.body;

  if (!sourceUrl || !mainKeyword || !regionKeyword) {
    res.status(400).json({
      success: false,
      error: '필수 입력값이 누락되었습니다. (sourceUrl, mainKeyword, regionKeyword)',
    });
    return;
  }

  const taskId = generateTaskId();

  const task: GenerateTask = {
    id: taskId,
    status: 'pending',
    message: '미리보기 작업을 시작하는 중...',
    step: 1,
    totalSteps: 4,
    startedAt: Date.now(),
  };

  generateTasks.set(taskId, task);

  // 백그라운드에서 미리보기 작업 실행
  runPreviewTask(taskId, sourceUrl, mainKeyword, regionKeyword, aiModel, customTopic, systemPrompt).catch((error) => {
    console.error(`Preview task error for ${taskId}:`, error);
    const t = generateTasks.get(taskId);
    if (t) {
      t.status = 'failed';
      t.message = error instanceof Error ? error.message : 'Unknown error';
      t.error = t.message;
    }
  });

  res.json({
    success: true,
    taskId,
    message: '미리보기 작업이 시작되었습니다.',
  });
}

/**
 * 백그라운드 미리보기 작업
 */
async function runPreviewTask(
  taskId: string,
  sourceUrl: string,
  mainKeyword: string,
  regionKeyword: string,
  aiModel?: 'gemini' | 'claude',
  customTopic?: string,
  systemPrompt?: string
): Promise<void> {
  const task = generateTasks.get(taskId);
  if (!task) return;

  try {
    // step 1/4: 참고 URL 스크래핑
    task.step = 1;
    task.status = 'generating';
    task.message = '참고 URL 스크래핑 중...';
    console.log(`[${taskId}] Preview: scraping source URL...`);

    // step 2/4: AI 글 생성
    task.step = 2;
    const modelName = aiModel || 'claude';
    task.message = `AI(${modelName})가 글을 생성하는 중...`;
    console.log(`[${taskId}] Preview: generating content with ${modelName}...`);

    const generatedContent = await generateBlogContent(
      sourceUrl,
      mainKeyword,
      regionKeyword,
      modelName,
      customTopic,
      systemPrompt
    );

    // step 3/4: HTML 후처리
    task.step = 3;
    task.message = 'HTML 후처리 중...';
    console.log(`[${taskId}] Preview: processing HTML...`);

    const cleanedContent = cleanHtml(generatedContent.content);
    const cleanedMetaDesc = cleanMetaDescription(generatedContent.metaDescription);

    // step 4/4: 완료
    const durationMs = Date.now() - task.startedAt;
    task.step = 4;
    task.status = 'success';
    task.message = 'AI 글 생성 완료!';
    task.previewResult = {
      title: generatedContent.title,
      metaDescription: cleanedMetaDesc,
      content: cleanedContent,
    };

    console.log(`[${taskId}] Preview completed (${durationMs}ms)`);

    // previewDurationMs DB 기록 (최근 글 또는 새 레코드)
    try {
      await prisma.blogPost.create({
        data: {
          sourceUrl,
          mainKeyword,
          regionKeyword,
          title: generatedContent.title,
          content: cleanedContent,
          status: 'created',
          previewDurationMs: durationMs,
        },
      });
    } catch (dbError) {
      console.error(`[${taskId}] Failed to save preview duration:`, dbError);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`[${taskId}] Preview error:`, errorMessage);
    task.status = 'failed';
    task.message = errorMessage;
    task.error = errorMessage;

    await logError({
      endpoint: '/api/blog/start-preview (background)',
      method: 'POST',
      statusCode: 500,
      errorMessage,
      errorStack,
      requestBody: { sourceUrl, mainKeyword, regionKeyword, aiModel },
    });
  } finally {
    // 30분 후 작업 정리
    setTimeout(() => {
      generateTasks.delete(taskId);
    }, 1800000);
  }
}

/**
 * 생성된 글 목록 조회
 * GET /api/blog/posts
 */
export async function getPosts(req: Request, res: Response): Promise<void> {
  try {
    const posts = await prisma.blogPost.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({
      success: true,
      posts,
    });
  } catch (error) {
    console.error('Error getting posts:', error);
    await logApiError(req, 500, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get posts',
    });
  }
}

/**
 * 발행 평균 소요시간 조회
 * GET /api/blog/avg-duration
 */
export async function getAvgDuration(req: Request, res: Response): Promise<void> {
  try {
    const type = req.query.type as string | undefined;
    const isPreview = type === 'preview';

    const posts = await prisma.blogPost.findMany({
      where: isPreview
        ? { previewDurationMs: { not: null } }
        : { status: 'published', durationMs: { not: null } },
      select: isPreview ? { previewDurationMs: true } : { durationMs: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const durations = posts
      .map((p) => isPreview ? (p as { previewDurationMs: number | null }).previewDurationMs : (p as { durationMs: number | null }).durationMs)
      .filter((d): d is number => d !== null);

    const count = durations.length;
    const avgDurationMs = count > 0
      ? Math.round(durations.reduce((sum, d) => sum + d, 0) / count)
      : null;

    res.json({
      success: true,
      avgDurationMs,
      sampleCount: count,
    });
  } catch (error) {
    console.error('Error getting avg duration:', error);
    await logApiError(req, 500, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get avg duration',
    });
  }
}
