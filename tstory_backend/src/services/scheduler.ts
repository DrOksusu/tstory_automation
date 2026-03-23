import cron from 'node-cron';
import prisma from './prismaClient';
import { publishToTistory } from '../services/tistoryPublisher';

let isProcessing = false;

// 예약된 글 처리 (1건씩 순차)
async function processScheduledPosts() {
  if (isProcessing) {
    return;
  }
  isProcessing = true;

  try {
    // 발행 시각이 된 예약 건 조회
    const pendingPosts = await prisma.scheduledPost.findMany({
      where: {
        status: 'scheduled',
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    for (const post of pendingPosts) {
      // 중복 실행 방지: publishing으로 즉시 변경
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: 'publishing' },
      });

      console.log(`[스케줄러] 예약 발행 시작: "${post.title}" (ID: ${post.id})`);

      try {
        const result = await publishToTistory({
          title: post.title,
          content: post.content,
          tag: post.tag || undefined,
          userEmail: post.userEmail,
          onProgress: (msg) => console.log(`[스케줄러] ${msg}`),
        });

        if (result.success) {
          // BlogPost 레코드 생성
          const blogPost = await prisma.blogPost.create({
            data: {
              sourceUrl: '',
              mainKeyword: '',
              regionKeyword: '',
              title: post.title,
              content: post.content,
              tistoryPostId: result.postUrl || null,
              status: 'published',
            },
          });

          await prisma.scheduledPost.update({
            where: { id: post.id },
            data: {
              status: 'published',
              tistoryUrl: result.postUrl || null,
              blogPostId: blogPost.id,
            },
          });

          console.log(`[스케줄러] 발행 완료: "${post.title}" → ${result.postUrl}`);
        } else {
          await prisma.scheduledPost.update({
            where: { id: post.id },
            data: {
              status: 'failed',
              errorMessage: result.error || '알 수 없는 오류',
            },
          });

          console.error(`[스케줄러] 발행 실패: "${post.title}" - ${result.error}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
        await prisma.scheduledPost.update({
          where: { id: post.id },
          data: {
            status: 'failed',
            errorMessage: errorMsg,
          },
        });

        console.error(`[스케줄러] 발행 중 예외: "${post.title}" - ${errorMsg}`);
      }
    }
  } catch (error) {
    console.error('[스케줄러] 예약 처리 중 오류:', error);
  } finally {
    isProcessing = false;
  }
}

// 스케줄러 시작 (1분 간격)
export function startScheduler() {
  console.log('[스케줄러] 예약 발행 스케줄러 시작 (1분 간격)');
  cron.schedule('* * * * *', processScheduledPosts);
}
