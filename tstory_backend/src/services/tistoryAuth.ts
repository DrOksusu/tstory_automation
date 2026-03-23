/**
 * 티스토리 인증 관련 모듈 (로그인, 세션 관리)
 */
import puppeteer, { Browser, Page } from 'puppeteer';
import { config } from '../config';
import { loadCookies, saveCookies, getAllAccounts } from './tistoryCookieManager';
import { connectToBrowserbase } from './browserbaseConnector';
import { delay } from './tistoryUtils';
import { LoginSession } from '../types';
import { getUserDataDir } from '../utils/browserProfile';

// 활성 로그인 세션 저장소
const loginSessions = new Map<string, LoginSession>();

/**
 * 고유 세션 ID 생성
 */
function generateSessionId(): string {
  return `login_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 로그인 상태 확인 (더 정확한 체크)
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    // 글쓰기 페이지로 직접 이동 시도 (더 정확한 체크)
    const writeUrl = `https://${config.tistory.blogName}.tistory.com/manage/newpost`;
    console.log(`isLoggedIn check - navigating to: ${writeUrl}`);

    await page.goto(writeUrl, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    const url = page.url();
    console.log(`isLoggedIn check - Current URL: ${url}`);

    // 로그인 페이지로 리디렉션되면 로그인 안됨
    const isLoginPage = url.includes('login') || url.includes('auth') || url.includes('kakao');
    if (isLoginPage) {
      console.log('Not logged in - redirected to login page');
      return false;
    }

    // 글쓰기 페이지나 관리 페이지에 있으면 로그인됨
    const isWritePage = url.includes('newpost') || url.includes('manage/post') || url.includes('/write');
    const isManagePage = url.includes('/manage');

    if (isWritePage || isManagePage) {
      console.log('Logged in successfully - on manage/write page');
      return true;
    }

    // 블로그 홈으로 리다이렉트되면 쿠키는 있지만 세션이 만료됨
    if (url === `https://${config.tistory.blogName}.tistory.com/` ||
        url === `https://${config.tistory.blogName}.tistory.com`) {
      console.log('Cookie exists but session expired - redirected to blog home');
      return false;
    }

    console.log('Login status unclear, assuming not logged in');
    return false;
  } catch (error) {
    console.error('isLoggedIn check failed:', error);
    return false;
  }
}

/**
 * 카카오 계정으로 티스토리 로그인
 */
export async function loginToTistory(page: Page, credentials?: { email: string; password: string }): Promise<boolean> {
  // 인자로 받은 credentials가 없으면 config에서 가져옴
  const email = credentials?.email || config.kakao.email;
  const password = credentials?.password || config.kakao.password;
  try {
    console.log('Navigating to Tistory login page...');

    // 티스토리 로그인 페이지로 이동
    await page.goto('https://www.tistory.com/auth/login', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    await delay(2000);

    // 카카오 로그인 버튼 찾기 (여러 선택자 시도)
    console.log('Looking for Kakao login button...');
    const kakaoButtonSelectors = [
      '.btn_login.link_kakao_id',
      'a[href*="kakao"]',
      'button[class*="kakao"]',
      '[class*="kakao"]',
      'a.link_kakao_id',
    ];

    let kakaoButtonClicked = false;
    for (const selector of kakaoButtonSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          console.log(`Found Kakao button: ${selector}`);
          await btn.click();
          kakaoButtonClicked = true;
          break;
        }
      } catch {
        continue;
      }
    }

    // XPath로 시도
    if (!kakaoButtonClicked) {
      console.log('Trying XPath for Kakao button...');
      const [kakaoBtn] = await page.$$('xpath/.//a[contains(text(), "카카오") or contains(@class, "kakao")]');
      if (kakaoBtn) {
        await kakaoBtn.click();
        kakaoButtonClicked = true;
      }
    }

    if (!kakaoButtonClicked) {
      await page.screenshot({ path: 'tistory-login-error.png', fullPage: true });
      throw new Error('Could not find Kakao login button');
    }

    // 카카오 로그인 페이지 대기
    console.log('Waiting for Kakao login page...');
    await delay(3000);
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {
      console.log('Navigation timeout, continuing...');
    });

    await delay(2000);

    // 이메일 입력
    console.log('Entering Kakao credentials...');
    const emailSelectors = ['input[name="loginId"]', 'input[id="loginId--1"]', 'input[type="email"]', 'input[placeholder*="이메일"]'];

    let emailEntered = false;
    for (const selector of emailSelectors) {
      try {
        const input = await page.$(selector);
        if (input) {
          await input.click();
          await input.type(email, { delay: 50 });
          emailEntered = true;
          console.log(`Email entered using: ${selector}`);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!emailEntered) {
      await page.screenshot({ path: 'kakao-email-error.png', fullPage: true });
      throw new Error('Could not find email input');
    }

    // 비밀번호 입력
    const passwordSelectors = ['input[name="password"]', 'input[id="password--2"]', 'input[type="password"]'];

    for (const selector of passwordSelectors) {
      try {
        const input = await page.$(selector);
        if (input) {
          await input.click();
          await input.type(password, { delay: 50 });
          console.log(`Password entered using: ${selector}`);
          break;
        }
      } catch {
        continue;
      }
    }

    // 로그인 버튼 클릭
    console.log('Clicking login submit button...');
    await delay(500);
    const submitSelectors = ['button[type="submit"]', 'button.submit', 'input[type="submit"]', 'button[class*="login"]'];

    for (const selector of submitSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          await btn.click();
          console.log(`Submit clicked using: ${selector}`);
          break;
        }
      } catch {
        continue;
      }
    }

    // 로그인 완료 대기
    console.log('Waiting for login to complete...');
    await delay(3000);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
      console.log('Navigation timeout after login, continuing...');
    });

    await delay(2000);

    // 로그인 성공 확인
    const currentUrl = page.url();
    console.log(`Current URL after login: ${currentUrl}`);

    if (currentUrl.includes('tistory.com') && !currentUrl.includes('login')) {
      console.log('Login successful!');
      await saveCookies(page, email);
      return true;
    }

    // 카카오 OAuth "계속하기" 버튼 처리
    if (currentUrl.includes('kauth.kakao.com') || currentUrl.includes('accounts.kakao.com')) {
      console.log('Kakao OAuth consent screen detected, clicking continue button...');

      // "계속하기" 노란 버튼 클릭 (여러 선택자 시도)
      const continueSelectors = [
        'button.confirm', // 카카오 계속하기 버튼
        'button[type="submit"]',
        'a.confirm',
        'button:not(.cancel)', // cancel이 아닌 버튼
      ];

      for (const selector of continueSelectors) {
        try {
          const btn = await page.$(selector);
          if (btn) {
            console.log(`Clicking continue button: ${selector}`);
            await btn.click();
            await delay(2000);
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
            break;
          }
        } catch {
          continue;
        }
      }
    }

    const finalUrl = page.url();
    console.log(`Final URL: ${finalUrl}`);

    if (finalUrl.includes('tistory.com') && !finalUrl.includes('login')) {
      await saveCookies(page, email);
      return true;
    }

    await page.screenshot({ path: 'tistory-login-final-error.png', fullPage: true });
    console.log('Login may have failed, check screenshot');
    return false;
  } catch (error) {
    console.error('Login failed:', error);
    await page.screenshot({ path: 'tistory-login-exception.png', fullPage: true }).catch(() => {});
    return false;
  }
}

/**
 * 로그인 테스트 - 유저 이메일 기반
 */
export async function testLogin(credentials?: { email: string; password: string }): Promise<{ success: boolean; message: string; userEmail?: string }> {
  let browser: Browser | null = null;
  let useBrowserbase = false;

  try {
    if (!credentials?.email) {
      return { success: false, message: '이메일이 필요합니다.' };
    }

    console.log(`[testLogin] Starting login for: ${credentials.email}`);

    // Browserbase 사용 여부 확인
    useBrowserbase = config.browserbase.enabled;

    if (useBrowserbase) {
      console.log('[testLogin] Connecting to Browserbase for auto login...');
      const { browser: connectedBrowser } = await connectToBrowserbase();
      browser = connectedBrowser;
    } else {
      // 로컬 Puppeteer - headless 모드로 실행 (자동 로그인은 화면 불필요)
      console.log('[testLogin] Launching local Puppeteer (headless)...');
      browser = await puppeteer.launch({
        headless: true,
        userDataDir: getUserDataDir(credentials.email),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    await loadCookies(page, credentials.email);

    const loggedIn = await isLoggedIn(page);
    console.log(`[testLogin] Already logged in: ${loggedIn}`);

    if (loggedIn) {
      // 이미 로그인된 경우에도 쿠키 갱신
      const cookiesSaved = await saveCookies(page, credentials.email);
      console.log(`[testLogin] Cookies refreshed: ${cookiesSaved}`);
      return { success: true, message: '이미 로그인되어 있습니다 (쿠키 유효)', userEmail: credentials.email };
    }

    console.log('[testLogin] Attempting login...');
    const loginSuccess = await loginToTistory(page, credentials);
    console.log(`[testLogin] Login result: ${loginSuccess}`);

    if (loginSuccess) {
      // 로그인 성공 시 쿠키 저장
      const cookiesSaved = await saveCookies(page, credentials.email);
      console.log(`[testLogin] Cookies saved after login: ${cookiesSaved}`);

      if (!cookiesSaved) {
        return { success: false, message: '로그인은 성공했으나 쿠키 저장에 실패했습니다.' };
      }

      return { success: true, message: '로그인 성공!', userEmail: credentials.email };
    } else {
      return { success: false, message: '로그인 실패. 이메일/비밀번호를 확인하거나 2FA 사용 시 수동 로그인을 이용하세요.' };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[testLogin] Error: ${errorMessage}`);
    return { success: false, message: errorMessage };
  } finally {
    if (browser) {
      console.log('[testLogin] Closing browser...');
      await browser.close();
    }
  }
}

/**
 * 수동 로그인 (2FA 지원) - 브라우저가 열리면 직접 로그인 완료
 */
export async function manualLogin(): Promise<{ success: boolean; message: string }> {
  let browser: Browser | null = null;

  try {
    console.log('Opening browser for manual login...');
    console.log('Please complete the login (including 2FA) in the browser window.');
    console.log('The browser will close automatically after login is detected.');

    browser = await puppeteer.launch({
      headless: false,
      userDataDir: getUserDataDir(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--start-maximized',
        '--disable-popup-blocking',
        '--disable-blink-features=AutomationControlled',
      ],
      defaultViewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
    });

    // 자동화 감지 방지
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // User-Agent 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 티스토리 로그인 페이지로 이동
    console.log('Opening Tistory login page...');
    await page.goto('https://www.tistory.com/auth/login', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    console.log('Waiting for login to complete...');
    console.log('(Please login manually in the browser window - use Kakao login)');

    // 로그인 완료 대기 (최대 2분)
    let loginDetected = false;
    const maxWaitTime = 120000; // 2분
    const startTime = Date.now();

    while (!loginDetected && (Date.now() - startTime) < maxWaitTime) {
      await delay(3000);
      const currentUrl = page.url();
      console.log(`Current URL: ${currentUrl}`);

      // 에러 페이지 제외하고, 티스토리 관리 페이지나 메인 페이지로 이동하면 로그인 성공
      const isLoggedIn = currentUrl.includes('tistory.com') &&
        !currentUrl.includes('login') &&
        !currentUrl.includes('auth') &&
        !currentUrl.includes('kakao') &&
        !currentUrl.includes('error');

      if (isLoggedIn) {
        loginDetected = true;
        console.log('Login detected!');
        break;
      }
    }

    if (loginDetected) {
      // 현재 페이지에서 쿠키 저장
      console.log('Saving cookies from current page...');
      await saveCookies(page);

      // 블로그 페이지로 이동해서 추가 쿠키 획득
      console.log('Navigating to blog page...');
      try {
        await page.goto(`https://${config.tistory.blogName}.tistory.com`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        await delay(2000);
        await saveCookies(page);
        console.log('Cookies saved from blog page');
      } catch (e) {
        console.log('Blog page navigation skipped');
      }

      return { success: true, message: '로그인 성공! 쿠키가 저장되었습니다.' };
    } else {
      return { success: false, message: '로그인 시간 초과 (2분). 다시 시도해주세요.' };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: errorMessage };
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
}

/**
 * 수동 로그인 시작 (폴링 방식) - 즉시 세션 ID와 라이브 뷰 URL 반환
 * userEmail: 수동 로그인 시 쿠키를 저장할 유저 이메일 (옵션)
 */
export async function startManualLogin(userEmail?: string): Promise<{ sessionId: string; liveViewUrl?: string }> {
  // 기존 세션들 모두 취소
  console.log(`Cancelling ${loginSessions.size} existing login sessions...`);
  for (const [existingSessionId, existingSession] of loginSessions.entries()) {
    if (existingSession.browser) {
      try {
        existingSession.browser.disconnect();
      } catch (e) {
        console.log(`Failed to disconnect session ${existingSessionId}:`, e);
      }
    }
    loginSessions.delete(existingSessionId);
  }

  const sessionId = generateSessionId();

  const session: LoginSession = {
    id: sessionId,
    status: 'pending',
    message: '브라우저를 시작하는 중...',
    browser: null,
    startedAt: Date.now(),
    userEmail,
  };

  loginSessions.set(sessionId, session);

  // Browserbase 사용 여부 확인
  const useBrowserbase = config.browserbase.enabled;

  console.log(`[${sessionId}] Browserbase config:`, {
    enabled: config.browserbase.enabled,
    hasApiKey: !!config.browserbase.apiKey,
    hasProjectId: !!config.browserbase.projectId,
    apiKeyPrefix: config.browserbase.apiKey?.substring(0, 10) + '...',
  });

  if (useBrowserbase) {
    console.log(`[${sessionId}] Using Browserbase for login...`);

    // 백그라운드에서 Browserbase 로그인 프로세스 실행
    runBrowserbaseLoginProcess(sessionId).catch((error) => {
      console.error(`Login process error for session ${sessionId}:`, error);
      const session = loginSessions.get(sessionId);
      if (session) {
        session.status = 'failed';
        session.message = error instanceof Error ? error.message : 'Unknown error';
      }
    });

    // 라이브 뷰 URL이 설정될 때까지 잠시 대기
    await delay(3000);
    const updatedSession = loginSessions.get(sessionId);

    return {
      sessionId,
      liveViewUrl: updatedSession?.liveViewUrl,
    };
  } else {
    // 로컬 Puppeteer 사용 (로컬에서만 로그인 가능)
    console.log(`[${sessionId}] Using local Puppeteer for login...`);

    runLoginProcess(sessionId).catch((error) => {
      console.error(`Login process error for session ${sessionId}:`, error);
      const session = loginSessions.get(sessionId);
      if (session) {
        session.status = 'failed';
        session.message = error instanceof Error ? error.message : 'Unknown error';
      }
    });

    return { sessionId };
  }
}

/**
 * 로그인 상태 확인
 */
export function getLoginStatus(sessionId: string): {
  status: 'pending' | 'in_progress' | 'success' | 'failed' | 'timeout' | 'not_found';
  message: string;
  liveViewUrl?: string;
} {
  const session = loginSessions.get(sessionId);

  if (!session) {
    return { status: 'not_found', message: '세션을 찾을 수 없습니다.' };
  }

  return {
    status: session.status,
    message: session.message,
    liveViewUrl: session.liveViewUrl,
  };
}

/**
 * 로그인 세션 취소
 */
export async function cancelLogin(sessionId: string): Promise<boolean> {
  const session = loginSessions.get(sessionId);

  if (!session) {
    return false;
  }

  if (session.browser) {
    try {
      await session.browser.close();
    } catch (e) {
      console.error('Error closing browser:', e);
    }
  }

  loginSessions.delete(sessionId);
  return true;
}

/**
 * 백그라운드 로그인 프로세스
 */
async function runLoginProcess(sessionId: string): Promise<void> {
  const session = loginSessions.get(sessionId);
  if (!session) return;

  let browser: Browser | null = null;

  try {
    console.log(`[${sessionId}] Opening browser for manual login...`);
    session.status = 'in_progress';
    session.message = '브라우저를 여는 중...';

    browser = await puppeteer.launch({
      headless: false,
      userDataDir: getUserDataDir(session.userEmail),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--start-maximized',
        '--disable-popup-blocking',
        '--disable-blink-features=AutomationControlled',
      ],
      defaultViewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
    });

    session.browser = browser;

    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log(`[${sessionId}] Opening Tistory login page...`);
    session.message = '티스토리 로그인 페이지로 이동 중...';

    await page.goto('https://www.tistory.com/auth/login', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    session.message = '카카오 로그인을 완료해주세요...';
    console.log(`[${sessionId}] Waiting for login to complete...`);

    // 로그인 완료 대기 (최대 3분)
    let loginDetected = false;
    const maxWaitTime = 180000; // 3분 (2FA 고려)
    const startTime = Date.now();

    while (!loginDetected && (Date.now() - startTime) < maxWaitTime) {
      // 세션이 취소되었는지 확인
      if (!loginSessions.has(sessionId)) {
        console.log(`[${sessionId}] Session cancelled`);
        return;
      }

      await delay(2000);

      try {
        const currentUrl = page.url();
        console.log(`[${sessionId}] Current URL: ${currentUrl}`);

        // 로그인 성공 조건 확인 (더 유연하게)
        const isTistoryMainPage = currentUrl === 'https://www.tistory.com/' ||
                                   currentUrl === 'https://www.tistory.com';
        const isBlogPage = currentUrl.includes('.tistory.com') &&
                           !currentUrl.includes('auth/login') &&
                           !currentUrl.includes('accounts.kakao.com');
        const isManagePage = currentUrl.includes('/manage');

        const isOnKakaoLogin = currentUrl.includes('accounts.kakao.com');
        const isOnTistoryLogin = currentUrl.includes('tistory.com/auth/login');

        // 로그인 페이지가 아니고 티스토리 페이지에 있으면 로그인 성공
        if ((isTistoryMainPage || isBlogPage || isManagePage) && !isOnKakaoLogin && !isOnTistoryLogin) {
          loginDetected = true;
          console.log(`[${sessionId}] Login detected!`);
          break;
        }
      } catch (e) {
        // 페이지가 닫혔을 수 있음
        console.log(`[${sessionId}] Page check error:`, e);
      }
    }

    if (loginDetected) {
      session.message = '쿠키 저장 중...';
      console.log(`[${sessionId}] Saving cookies for user: ${session.userEmail}...`);

      if (session.userEmail) {
        const saved = await saveCookies(page, session.userEmail);
        console.log(`[${sessionId}] First cookie save result: ${saved}`);

        // 블로그 페이지로 이동해서 추가 쿠키 획득
        try {
          await page.goto(`https://${config.tistory.blogName}.tistory.com`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          await delay(2000);
          const saved2 = await saveCookies(page, session.userEmail);
          console.log(`[${sessionId}] Second cookie save result: ${saved2}`);
        } catch (e) {
          console.log(`[${sessionId}] Blog page navigation skipped:`, e);
        }

        // 저장 확인
        const accounts = await getAllAccounts();
        console.log(`[${sessionId}] Accounts after save:`, accounts.map(a => a.userEmail));

        if (accounts.some(a => a.userEmail === session.userEmail)) {
          session.status = 'success';
          session.message = '로그인 성공! 쿠키가 저장되었습니다.';
        } else {
          session.status = 'failed';
          session.message = '쿠키 저장에 실패했습니다. 다시 시도해주세요.';
          console.error(`[${sessionId}] Cookie save verification failed!`);
        }
      } else {
        session.status = 'failed';
        session.message = '이메일 정보가 없어 쿠키를 저장할 수 없습니다.';
        console.error(`[${sessionId}] No userEmail in session!`);
      }
    } else {
      session.status = 'timeout';
      session.message = '로그인 시간 초과 (3분). 다시 시도해주세요.';
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${sessionId}] Login error:`, errorMessage);
    session.status = 'failed';
    session.message = errorMessage;
  } finally {
    if (browser) {
      console.log(`[${sessionId}] Closing browser...`);
      try {
        await browser.close();
      } catch (e) {
        console.error(`[${sessionId}] Error closing browser:`, e);
      }
    }
    session.browser = null;

    // 10분 후 세션 정리
    setTimeout(() => {
      loginSessions.delete(sessionId);
    }, 600000);
  }
}

/**
 * Browserbase 기반 로그인 프로세스
 */
async function runBrowserbaseLoginProcess(sessionId: string): Promise<void> {
  const session = loginSessions.get(sessionId);
  if (!session) return;

  let browser: Browser | null = null;

  try {
    console.log(`[${sessionId}] Connecting to Browserbase...`);
    session.status = 'in_progress';
    session.message = 'Browserbase에 연결 중...';

    // Browserbase 연결
    const { browser: connectedBrowser, liveViewUrl, sessionId: bbSessionId } = await connectToBrowserbase();
    browser = connectedBrowser;
    session.browser = browser;
    session.liveViewUrl = liveViewUrl;
    session.browserbaseSessionId = bbSessionId;

    console.log(`[${sessionId}] Live view URL: ${liveViewUrl}`);

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    // User-Agent 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setViewport({ width: 1280, height: 720 });

    // 쿠키/세션 정리를 위해 먼저 티스토리 메인 방문
    console.log(`[${sessionId}] Visiting Tistory main page first...`);
    await page.goto('https://www.tistory.com/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await delay(2000);

    console.log(`[${sessionId}] Opening Tistory login page...`);
    session.message = '티스토리 로그인 페이지로 이동 중...';

    await page.goto('https://www.tistory.com/auth/login', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    session.message = '라이브 뷰에서 카카오 로그인을 완료해주세요...';
    console.log(`[${sessionId}] Waiting for user to complete login in live view...`);

    // 로그인 완료 대기 (최대 3분)
    let loginDetected = false;
    const maxWaitTime = 180000; // 3분 (2FA 고려)
    const startTime = Date.now();

    while (!loginDetected && (Date.now() - startTime) < maxWaitTime) {
      // 세션이 취소되었는지 확인
      if (!loginSessions.has(sessionId)) {
        console.log(`[${sessionId}] Session cancelled`);
        return;
      }

      await delay(3000);

      try {
        const currentUrl = page.url();
        console.log(`[${sessionId}] Current URL: ${currentUrl}`);

        // 로그인 성공 조건 확인 (더 유연하게)
        // 1. 티스토리 메인 페이지
        // 2. 블로그 관리 페이지
        // 3. 블로그 홈
        const isTistoryMainPage = currentUrl === 'https://www.tistory.com/' ||
                                   currentUrl === 'https://www.tistory.com';
        const isBlogPage = currentUrl.includes('.tistory.com') &&
                           !currentUrl.includes('auth/login') &&
                           !currentUrl.includes('accounts.kakao.com');
        const isManagePage = currentUrl.includes('/manage');

        // Kakao 로그인 페이지가 아니고 Tistory 관련 페이지인지 확인
        const isOnKakaoLogin = currentUrl.includes('accounts.kakao.com');
        const isOnTistoryLogin = currentUrl.includes('tistory.com/auth/login');

        console.log(`[${sessionId}] Check - isTistoryMain: ${isTistoryMainPage}, isBlog: ${isBlogPage}, isManage: ${isManagePage}, isKakao: ${isOnKakaoLogin}, isTistoryLogin: ${isOnTistoryLogin}`);

        // 로그인 페이지가 아니고 티스토리 페이지에 있으면 로그인 성공
        if ((isTistoryMainPage || isBlogPage || isManagePage) && !isOnKakaoLogin && !isOnTistoryLogin) {
          // 추가 확인: 페이지에서 로그인 상태 체크
          const hasLoggedInIndicator = await page.evaluate(() => {
            // 로그인된 상태의 표시자 확인
            const logoutBtn = document.querySelector('a[href*="logout"], button[class*="logout"], .btn_logout');
            const profileArea = document.querySelector('.profile, .user-info, .thumb_info, [class*="profile"]');
            const manageBtn = document.querySelector('a[href*="manage"], .link_manage');
            return !!(logoutBtn || profileArea || manageBtn);
          }).catch(() => false);

          console.log(`[${sessionId}] Has logged in indicator: ${hasLoggedInIndicator}`);

          if (hasLoggedInIndicator || isManagePage) {
            loginDetected = true;
            console.log(`[${sessionId}] Login detected!`);
            break;
          }

          // 티스토리 메인이나 블로그 페이지에 있으면 일단 성공으로 처리
          if (isTistoryMainPage || isBlogPage) {
            // 한번 더 대기 후 최종 확인
            await delay(2000);
            const finalUrl = page.url();
            if (!finalUrl.includes('accounts.kakao.com') && !finalUrl.includes('auth/login')) {
              loginDetected = true;
              console.log(`[${sessionId}] Login detected (on Tistory page)!`);
              break;
            }
          }
        }
      } catch (e) {
        console.log(`[${sessionId}] Page check error:`, e);
      }
    }

    if (loginDetected) {
      session.message = '쿠키 저장 중...';
      console.log(`[${sessionId}] Saving cookies for user: ${session.userEmail}...`);

      if (session.userEmail) {
        const saved = await saveCookies(page, session.userEmail);
        console.log(`[${sessionId}] First cookie save result: ${saved}`);

        // 블로그 페이지로 이동해서 추가 쿠키 획득
        try {
          await page.goto(`https://${config.tistory.blogName}.tistory.com`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          await delay(2000);
          const saved2 = await saveCookies(page, session.userEmail);
          console.log(`[${sessionId}] Second cookie save result: ${saved2}`);
        } catch (e) {
          console.log(`[${sessionId}] Blog page navigation skipped:`, e);
        }

        // 저장 확인
        const accounts = await getAllAccounts();
        console.log(`[${sessionId}] Accounts after save:`, accounts.map(a => a.userEmail));

        if (accounts.some(a => a.userEmail === session.userEmail)) {
          session.status = 'success';
          session.message = '로그인 성공! 쿠키가 저장되었습니다.';
        } else {
          session.status = 'failed';
          session.message = '쿠키 저장에 실패했습니다. 다시 시도해주세요.';
          console.error(`[${sessionId}] Cookie save verification failed!`);
        }
      } else {
        session.status = 'failed';
        session.message = '이메일 정보가 없어 쿠키를 저장할 수 없습니다.';
        console.error(`[${sessionId}] No userEmail in session!`);
      }
    } else {
      session.status = 'timeout';
      session.message = '로그인 시간 초과 (3분). 다시 시도해주세요.';
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${sessionId}] Login error:`, errorMessage);
    session.status = 'failed';
    session.message = errorMessage;
  } finally {
    if (browser) {
      console.log(`[${sessionId}] Disconnecting from Browserbase...`);
      try {
        browser.disconnect();
      } catch (e) {
        console.error(`[${sessionId}] Error disconnecting browser:`, e);
      }
    }
    session.browser = null;

    // 10분 후 세션 정리
    setTimeout(() => {
      loginSessions.delete(sessionId);
    }, 600000);
  }
}
