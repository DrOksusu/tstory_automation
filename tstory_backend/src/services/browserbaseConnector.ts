/**
 * Browserbase 브라우저 연결 모듈
 */
import puppeteer, { Browser } from 'puppeteer';
import Browserbase from '@browserbasehq/sdk';
import { config } from '../config';

/**
 * Browserbase 브라우저 연결
 */
export async function connectToBrowserbase(): Promise<{ browser: Browser; liveViewUrl: string; sessionId: string }> {
  const apiKey = config.browserbase.apiKey;
  const projectId = config.browserbase.projectId;

  if (!apiKey || !projectId) {
    throw new Error('BROWSERBASE_API_KEY 또는 BROWSERBASE_PROJECT_ID가 설정되지 않았습니다.');
  }

  console.log('Connecting to Browserbase...');

  try {
    // Browserbase SDK 초기화
    const bb = new Browserbase({ apiKey });

    // 세션 생성 (한국 주거용 IP로 Kakao 차단 우회, keepAlive로 만료 방지)
    const session = await bb.sessions.create({
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
    });

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
