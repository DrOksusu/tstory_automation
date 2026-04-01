/**
 * 쿠키 주기적 갱신 서비스
 * 만료 전에 티스토리에 방문하여 세션 쿠키를 갱신한다.
 * 2FA 불필요 — 유효한 쿠키로 페이지 접근만 하면 서버가 새 쿠키를 발급한다.
 */
import puppeteer, { Browser } from 'puppeteer';
import { config } from '../config';
import prisma from './prismaClient';
import { loadCookies, saveCookies } from './tistoryCookieManager';
import { delay } from './tistoryUtils';
import { connectToBrowserbase, getOrCreateContext } from './browserbaseConnector';
import { getUserDataDir, closeExistingBrowser, registerBrowser, unregisterBrowser } from '../utils/browserProfile';
import { getCredential } from './credentialService';
import { testLogin } from './tistoryAuth';
import { logError } from './errorLogService';
import { createLogger } from './processLogService';

let isRefreshing = false;

/**
 * 모든 계정의 쿠키를 갱신한다.
 */
export async function refreshAllCookies(): Promise<void> {
  const logger = createLogger('cookie');

  if (isRefreshing) {
    logger.info('[쿠키갱신] 이미 갱신 작업이 진행 중입니다. 건너뜁니다.');
    return;
  }

  isRefreshing = true;

  try {
    // DB에서 모든 쿠키 계정 조회
    const accounts = await prisma.tistoryCookie.findMany({
      select: {
        ownerEmail: true,
        userEmail: true,
        updatedAt: true,
      },
    });

    if (accounts.length === 0) {
      logger.info('[쿠키갱신] 갱신할 계정이 없습니다.');
      return;
    }

    logger.info(`[쿠키갱신] ${accounts.length}개 계정 쿠키 갱신 시작`);

    for (const account of accounts) {
      try {
        await refreshSingleAccount(account.userEmail, account.ownerEmail);
        logger.info(`[쿠키갱신] 성공: ${account.userEmail}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`[쿠키갱신] 실패: ${account.userEmail} - ${msg}`);
        await logError({
          endpoint: '/scheduler/cookie-refresh',
          method: 'CRON',
          statusCode: 500,
          errorMessage: `쿠키 갱신 실패: ${account.userEmail} - ${msg}`,
          errorStack: error instanceof Error ? error.stack : undefined,
          userEmail: account.userEmail,
        });
      }

      // 계정 간 간격 (브라우저 리소스 보호)
      await delay(2000);
    }

    logger.info('[쿠키갱신] 전체 갱신 완료');
  } catch (error) {
    logger.error(`[쿠키갱신] 갱신 중 오류: ${error}`);
  } finally {
    isRefreshing = false;
  }
}

/**
 * 단일 계정의 쿠키를 갱신한다.
 * 티스토리 관리 페이지에 접속하여 세션 쿠키를 갱신 후 DB에 저장한다.
 */
async function refreshSingleAccount(userEmail: string, ownerEmail: string): Promise<void> {
  const logger = createLogger('cookie', undefined, userEmail);
  let browser: Browser | null = null;
  const useBrowserbase = config.browserbase.enabled && process.env.NODE_ENV === 'production';

  try {
    if (useBrowserbase) {
      // Context를 통해 세션 간 쿠키/localStorage 유지
      const contextId = await getOrCreateContext(userEmail, ownerEmail);
      const { browser: connectedBrowser } = await connectToBrowserbase(contextId);
      browser = connectedBrowser;
    } else {
      const isHeadless = process.env.HEADLESS === 'true' || process.env.NODE_ENV === 'production';
      const profileDir = getUserDataDir(userEmail);
      await closeExistingBrowser(profileDir);

      browser = await puppeteer.launch({
        headless: isHeadless,
        userDataDir: profileDir,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--window-size=1920,1080',
          '--disable-blink-features=AutomationControlled',
        ],
        defaultViewport: isHeadless ? { width: 1920, height: 1080 } : null,
        ignoreDefaultArgs: ['--enable-automation'],
        timeout: 30000,
      });

      registerBrowser(profileDir, browser);
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 저장된 쿠키 로드
    const loaded = await loadCookies(page, userEmail, ownerEmail);
    if (!loaded) {
      logger.info(`[쿠키갱신] ${userEmail}: 저장된 쿠키 없음, 건너뜀`);
      return;
    }

    // 티스토리 관리 페이지 접속 (세션 갱신 트리거)
    const manageUrl = `https://${config.tistory.blogName}.tistory.com/manage`;
    await page.goto(manageUrl, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    const currentUrl = page.url();
    logger.info(`[쿠키갱신] ${userEmail}: 이동 후 URL = ${currentUrl}`);

    // 로그인 페이지로 리다이렉트됐으면 쿠키가 이미 만료된 것
    const isLoginPage = currentUrl.includes('login') || currentUrl.includes('auth') || currentUrl.includes('kakao');
    if (isLoginPage) {
      logger.warn(`[쿠키갱신] ${userEmail}: 세션 만료됨, 자동 재로그인 시도`);

      // 저장된 자격증명 조회
      const credential = await getCredential(userEmail, ownerEmail);
      if (!credential) {
        throw new Error('세션 만료 + 저장된 자격증명 없음 (수동 재로그인 필요)');
      }

      // 기존 브라우저 닫고 testLogin으로 자동 재로그인
      await browser.close();
      browser = null;

      const result = await testLogin(credential, ownerEmail);
      if (!result.success) {
        throw new Error(`자동 재로그인 실패: ${result.message}`);
      }

      // 재로그인 후 실제 세션 유효성 검증
      let verifyBrowser: Browser | null = null;
      try {
        if (useBrowserbase) {
          const contextId = await getOrCreateContext(userEmail, ownerEmail);
          const { browser: bb } = await connectToBrowserbase(contextId);
          verifyBrowser = bb;
        } else {
          verifyBrowser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
          });
        }

        const verifyPage = await verifyBrowser.newPage();
        await loadCookies(verifyPage, userEmail, ownerEmail);
        const verifyUrl = `https://${config.tistory.blogName}.tistory.com/manage/newpost`;
        await verifyPage.goto(verifyUrl, { waitUntil: 'networkidle2', timeout: 15000 });

        const actualUrl = verifyPage.url();
        if (actualUrl.includes('login') || actualUrl.includes('auth') || actualUrl.includes('kakao')) {
          throw new Error('재로그인 후에도 세션 무효 (2FA 미완료 가능성)');
        }

        logger.info(`[쿠키갱신] ${userEmail}: 자동 재로그인 성공 (검증 완료)`);
      } finally {
        if (verifyBrowser) {
          await verifyBrowser.close().catch(() => {});
        }
      }
      return;
    }

    // 관리 페이지 접근 성공 → 갱신된 쿠키 저장
    const saved = await saveCookies(page, userEmail, ownerEmail);
    if (saved) {
      logger.info(`[쿠키갱신] ${userEmail}: 쿠키 갱신 저장 완료`);
    }
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // 이미 닫혀있을 수 있음
      }

      if (!useBrowserbase) {
        const profileDir = getUserDataDir(userEmail);
        unregisterBrowser(profileDir);
      }
    }
  }
}
