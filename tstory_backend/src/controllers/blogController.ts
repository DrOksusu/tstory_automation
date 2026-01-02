import { Request, Response } from 'express';
import { generateBlogContent } from '../services/geminiService';
import { publishToTistory } from '../services/tistoryService';
import { cleanHtml, cleanMetaDescription } from '../utils/htmlProcessor';
import prisma from '../services/prismaClient';
import { GenerateBlogRequest, BlogGenerationResult } from '../types';

// ==================== 폴링 기반 발행 작업 관리 ====================

interface GenerateTask {
  id: string;
  status: 'pending' | 'generating' | 'publishing' | 'success' | 'failed';
  message: string;
  result?: BlogGenerationResult;
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
  const { sourceUrl, mainKeyword, regionKeyword, userEmail } = req.body;

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
    startedAt: Date.now(),
  };

  generateTasks.set(taskId, task);

  // 백그라운드에서 작업 실행
  runGenerateTask(taskId, sourceUrl, mainKeyword, regionKeyword, userEmail).catch((error) => {
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

  res.json({
    success: task.status === 'success',
    status: task.status,
    message: task.message,
    completed,
    result: task.result,
    error: task.error,
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
  userEmail?: string
): Promise<void> {
  const task = generateTasks.get(taskId);
  if (!task) return;

  try {
    // 1. Gemini로 글 생성
    task.status = 'generating';
    task.message = 'AI가 글을 생성하는 중...';
    console.log(`[${taskId}] Generating blog content with Gemini...`);

    const generatedContent = await generateBlogContent(
      sourceUrl,
      mainKeyword,
      regionKeyword
    );

    // 2. HTML 후처리
    task.message = 'HTML 처리 중...';
    console.log(`[${taskId}] Processing HTML...`);
    const cleanedContent = cleanHtml(generatedContent.content);

    // 3. DB에 저장
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

    // 4. 티스토리에 발행
    task.status = 'publishing';
    task.message = '티스토리에 발행 중... (브라우저 작업 진행 중)';
    console.log(`[${taskId}] Publishing to Tistory... (user: ${userEmail || 'none'})`);

    const tistoryResult = await publishToTistory({
      title: generatedContent.title,
      content: cleanedContent,
      tag: `${mainKeyword},${regionKeyword}`,
      userEmail,
    });

    if (!tistoryResult.success) {
      await prisma.blogPost.update({
        where: { id: blogPost.id },
        data: { status: 'failed' },
      });

      task.status = 'failed';
      task.message = tistoryResult.error || '티스토리 발행 실패';
      task.error = task.message;
      return;
    }

    // 5. DB 업데이트
    await prisma.blogPost.update({
      where: { id: blogPost.id },
      data: {
        tistoryPostId: tistoryResult.postUrl,
        status: 'published',
      },
    });

    task.status = 'success';
    task.message = '발행 완료!';
    task.result = {
      success: true,
      postId: blogPost.id,
      tistoryUrl: tistoryResult.postUrl,
      title: generatedContent.title,
    };

    console.log(`[${taskId}] Blog post published successfully:`, task.result);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${taskId}] Error:`, errorMessage);
    task.status = 'failed';
    task.message = errorMessage;
    task.error = errorMessage;
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
}

/**
 * 편집된 글 발행 시작 (폴링 방식)
 * POST /api/blog/publish-content
 */
export async function startPublishContent(
  req: Request<object, object, PublishContentRequest>,
  res: Response
): Promise<void> {
  const { title, content, metaDescription, userEmail } = req.body;

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
    startedAt: Date.now(),
  };

  generateTasks.set(taskId, task);

  // 백그라운드에서 발행 작업 실행
  runPublishContentTask(taskId, title, content, userEmail).catch((error) => {
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
  userEmail?: string
): Promise<void> {
  const task = generateTasks.get(taskId);
  if (!task) return;

  try {
    // 1. DB에 저장
    task.status = 'publishing';
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

    // 2. 티스토리에 발행
    task.message = '티스토리에 발행 중... (브라우저 작업 진행 중)';
    console.log(`[${taskId}] Publishing edited content to Tistory... (user: ${userEmail || 'none'})`);

    const tistoryResult = await publishToTistory({
      title: title,
      content: content,
      tag: '',
      userEmail,
    });

    if (!tistoryResult.success) {
      await prisma.blogPost.update({
        where: { id: blogPost.id },
        data: { status: 'failed' },
      });

      task.status = 'failed';
      task.message = tistoryResult.error || '티스토리 발행 실패';
      task.error = task.message;
      return;
    }

    // 3. DB 업데이트
    await prisma.blogPost.update({
      where: { id: blogPost.id },
      data: {
        tistoryPostId: tistoryResult.postUrl,
        status: 'published',
      },
    });

    task.status = 'success';
    task.message = '발행 완료!';
    task.result = {
      success: true,
      postId: blogPost.id,
      tistoryUrl: tistoryResult.postUrl,
      title: title,
    };

    console.log(`[${taskId}] Edited content published successfully:`, task.result);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${taskId}] Error:`, errorMessage);
    task.status = 'failed';
    task.message = errorMessage;
    task.error = errorMessage;
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
  const { sourceUrl, mainKeyword, regionKeyword, userEmail } = req.body;

  // 입력값 검증
  if (!sourceUrl || !mainKeyword || !regionKeyword) {
    res.status(400).json({
      success: false,
      error: '필수 입력값이 누락되었습니다. (sourceUrl, mainKeyword, regionKeyword)',
    });
    return;
  }

  try {
    // 1. Gemini로 글 생성
    console.log('Generating blog content with Gemini...');
    const generatedContent = await generateBlogContent(
      sourceUrl,
      mainKeyword,
      regionKeyword
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
    console.log(`Publishing to Tistory... (user: ${userEmail || 'none'})`);
    const tistoryResult = await publishToTistory({
      title: generatedContent.title,
      content: cleanedContent,
      tag: `${mainKeyword},${regionKeyword}`,
      userEmail,
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
  const { sourceUrl, mainKeyword, regionKeyword } = req.body;

  if (!sourceUrl || !mainKeyword || !regionKeyword) {
    res.status(400).json({
      success: false,
      error: '필수 입력값이 누락되었습니다.',
    });
    return;
  }

  try {
    // Gemini로 글 생성
    const generatedContent = await generateBlogContent(
      sourceUrl,
      mainKeyword,
      regionKeyword
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
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
    res.status(500).json({
      success: false,
      error: 'Failed to get posts',
    });
  }
}
