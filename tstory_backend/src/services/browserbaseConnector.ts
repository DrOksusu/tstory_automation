/**
 * Browserbase 브라우저 연결 모듈
 * Contexts API를 통해 세션 간 쿠키/localStorage를 유지한다.
 */
import puppeteer, { Browser } from 'puppeteer';
import Browserbase from '@browserbasehq/sdk';
import { config } from '../config';
import prisma from './prismaClient';

/**
 * 계정별 Browserbase Context ID 조회 또는 생성
 * DB에 저장된 contextId가 있으면 반환, 없으면 새로 생성 후 저장
 */
export async function getOrCreateContext(userEmail: string, ownerEmail: string): Promise<string> {
  const apiKey = config.browserbase.apiKey;
  const projectId = config.browserbase.projectId;

  if (!apiKey || !projectId) {
    throw new Error('BROWSERBASE_API_KEY 또는 BROWSERBASE_PROJECT_ID가 설정되지 않았습니다.');
  }

  // DB에서 기존 contextId 조회
  const existing = await prisma.browserbaseContext.findUnique({
    where: {
      ownerEmail_userEmail: { ownerEmail, userEmail },
    },
  });

  if (existing) {
    console.log(`[Context] 기존 contextId 사용: ${existing.contextId} (user: ${userEmail})`);
    return existing.contextId;
  }

  // 새 Context 생성
  const bb = new Browserbase({ apiKey });
  const context = await bb.contexts.create({ projectId });
  const contextId = context.id;

  console.log(`[Context] 새 contextId 생성: ${contextId} (user: ${userEmail})`);

  // DB에 저장
  await prisma.browserbaseContext.create({
    data: {
      ownerEmail,
      userEmail,
      contextId,
    },
  });

  return contextId;
}

/**
 * Browserbase 브라우저 연결
 * contextId가 있으면 세션 간 쿠키/localStorage를 유지한다.
 */
export async function connectToBrowserbase(contextId?: string): Promise<{ browser: Browser; liveViewUrl: string; sessionId: string }> {
  const apiKey = config.browserbase.apiKey;
  const projectId = config.browserbase.projectId;

  if (!apiKey || !projectId) {
    throw new Error('BROWSERBASE_API_KEY 또는 BROWSERBASE_PROJECT_ID가 설정되지 않았습니다.');
  }

  console.log('Connecting to Browserbase...');

  try {
    // Browserbase SDK 초기화
    const bb = new Browserbase({ apiKey });

    // 세션 생성 옵션
    const sessionOptions: Parameters<typeof bb.sessions.create>[0] = {
      projectId,
      keepAlive: true,
      timeout: 600, // 10분 타임아웃
      proxies: [
        {
          type: 'browserbase',
          geolocation: {
            country: 'KR', // 한국 IP 사용
          },
        },
      ],
    };

    // Context가 있으면 세션에 적용 (쿠키/localStorage 유지)
    if (contextId) {
      (sessionOptions as any).browserSettings = {
        context: {
          id: contextId,
          persist: true,
        },
      };
      console.log(`[Context] 세션에 contextId 적용: ${contextId}`);
    }

    const session = await bb.sessions.create(sessionOptions);

    console.log('Browserbase session created:', session.id);
    console.log('Browserbase session object:', JSON.stringify(session, null, 2));

    // 라이브 뷰 URL 가져오기 (SDK 사용)
    const debugInfo = await bb.sessions.debug(session.id);
    console.log('Browserbase debugInfo:', JSON.stringify(debugInfo, null, 2));

    // debuggerFullscreenUrl 또는 다른 URL 속성 확인
    const liveViewUrl = debugInfo.debuggerFullscreenUrl || debugInfo.debuggerUrl || (debugInfo as any).pages?.[0]?.debuggerFullscreenUrl;

    console.log('Live view URL:', liveViewUrl);

    // Puppeteer 연결
    const browser = await puppeteer.connect({
      browserWSEndpoint: session.connectUrl,
    });

    console.log('Connected to Browserbase');

    return { browser, liveViewUrl, sessionId: session.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Browserbase connection failed:', errorMessage);

    throw new Error(`Browserbase 연결 실패: ${errorMessage}`);
  }
}
