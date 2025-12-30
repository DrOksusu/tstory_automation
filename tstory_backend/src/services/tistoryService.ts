import puppeteer, { Browser, Page } from 'puppeteer';
import Browserbase from '@browserbasehq/sdk';
import { config } from '../config';
import prisma from './prismaClient';

interface TistoryPublishResult {
  success: boolean;
  postUrl?: string;
  error?: string;
}

/**
 * 지정된 시간만큼 대기
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * "이어서 작성하시겠습니까?" 팝업 처리 - 취소 버튼 클릭
 */
async function handleContinueWritingPopup(page: Page): Promise<void> {
  try {
    console.log('Checking for "Continue writing?" popup...');

    // 팝업이 나타날 때까지 잠시 대기
    await delay(1000);

    // 방법 1: 브라우저 네이티브 다이얼로그 처리 (confirm)
    page.once('dialog', async (dialog) => {
      console.log(`Dialog detected: ${dialog.message()}`);
      if (dialog.message().includes('이어서 작성') || dialog.message().includes('저장된 글')) {
        console.log('Dismissing "Continue writing?" dialog...');
        await dialog.dismiss(); // 취소 버튼
      } else {
        await dialog.accept();
      }
    });

    // 방법 2: 커스텀 HTML 모달/팝업 처리
    const cancelButtonSelectors = [
      // 일반적인 취소 버튼 선택자들
      'button:has-text("취소")',
      '.btn-cancel',
      '.cancel-btn',
      '[data-role="cancel"]',
      '.modal button:last-child',
      '.popup button:last-child',
      // 티스토리 특화 선택자
      '.layer_popup .btn_cancel',
      '.modal_popup .btn_cancel',
      '.confirm-popup .cancel',
      '.dialog button.cancel',
    ];

    // 팝업 텍스트 확인 후 취소 버튼 클릭
    const popupExists = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      return bodyText.includes('이어서 작성하시겠습니까') || bodyText.includes('저장된 글이 있습니다');
    });

    if (popupExists) {
      console.log('Found "Continue writing?" popup text, looking for cancel button...');

      // 취소 버튼 찾기 및 클릭
      const clicked = await page.evaluate(() => {
        // 모든 버튼에서 "취소" 텍스트를 가진 버튼 찾기
        const buttons = Array.from(document.querySelectorAll('button, a.btn, input[type="button"]'));
        for (const btn of buttons) {
          const text = (btn as HTMLElement).innerText || (btn as HTMLInputElement).value || '';
          if (text.trim() === '취소') {
            console.log('Found cancel button, clicking...');
            (btn as HTMLElement).click();
            return true;
          }
        }

        // role="button" 요소도 확인
        const roleButtons = Array.from(document.querySelectorAll('[role="button"]'));
        for (const btn of roleButtons) {
          const text = (btn as HTMLElement).innerText || '';
          if (text.trim() === '취소') {
            (btn as HTMLElement).click();
            return true;
          }
        }

        return false;
      });

      if (clicked) {
        console.log('Cancel button clicked successfully');
        await delay(1000);
      } else {
        console.log('Cancel button not found, trying alternative selectors...');

        // 대체 선택자 시도
        for (const selector of cancelButtonSelectors) {
          try {
            const btn = await page.$(selector);
            if (btn) {
              await btn.click();
              console.log(`Clicked cancel button with selector: ${selector}`);
              await delay(1000);
              break;
            }
          } catch {
            continue;
          }
        }
      }
    } else {
      console.log('No "Continue writing?" popup detected');
    }
  } catch (error) {
    console.log('Popup handling completed (may not have appeared):', error);
  }
}

/**
 * 저장된 쿠키 로드 (DB에서)
 */
async function loadCookies(page: Page): Promise<boolean> {
  try {
    const blogName = config.tistory.blogName;
    console.log(`Loading cookies from database for blog: ${blogName}...`);

    const cookieRecord = await prisma.tistoryCookie.findUnique({
      where: { blogName },
    });

    if (cookieRecord) {
      const cookies = JSON.parse(cookieRecord.cookies);
      console.log(`Loading ${cookies.length} cookies from DB...`);

      // 티스토리 관련 쿠키만 필터링
      const tistoryCookies = cookies.filter((cookie: { domain: string }) =>
        cookie.domain.includes('tistory.com')
      );
      console.log(`Found ${tistoryCookies.length} tistory cookies`);

      await page.setCookie(...tistoryCookies);
      console.log('Cookies loaded successfully from DB');
      return true;
    } else {
      console.log('No cookies found in database');
    }
  } catch (error) {
    console.error('Failed to load cookies from DB:', error);
  }
  return false;
}

/**
 * 쿠키 저장 (DB에)
 */
async function saveCookies(page: Page): Promise<void> {
  try {
    const cookies = await page.cookies();
    const blogName = config.tistory.blogName;
    const cookiesJson = JSON.stringify(cookies);

    await prisma.tistoryCookie.upsert({
      where: { blogName },
      update: { cookies: cookiesJson },
      create: { blogName, cookies: cookiesJson },
    });

    console.log(`Cookies saved to DB for blog: ${blogName}`);
  } catch (error) {
    console.error('Failed to save cookies to DB:', error);
  }
}

/**
 * 저장된 쿠키 존재 여부 확인 (DB)
 */
export async function checkCookiesExist(): Promise<{ exists: boolean; blogName: string; savedAt?: Date }> {
  try {
    const blogName = config.tistory.blogName;
    const savedCookie = await prisma.tistoryCookie.findUnique({
      where: { blogName },
    });

    if (savedCookie && savedCookie.cookies) {
      const cookies = JSON.parse(savedCookie.cookies);
      if (Array.isArray(cookies) && cookies.length > 0) {
        return {
          exists: true,
          blogName,
          savedAt: savedCookie.updatedAt,
        };
      }
    }

    return { exists: false, blogName };
  } catch (error) {
    console.error('Failed to check cookies:', error);
    return { exists: false, blogName: config.tistory.blogName };
  }
}

/**
 * 로그인 상태 확인 (더 정확한 체크)
 */
async function isLoggedIn(page: Page): Promise<boolean> {
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
async function loginToTistory(page: Page): Promise<boolean> {
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
          await input.type(config.kakao.email, { delay: 50 });
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
          await input.type(config.kakao.password, { delay: 50 });
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
      await saveCookies(page);
      return true;
    }

    // 추가 인증이 필요한 경우 (동의 화면 등)
    if (currentUrl.includes('accounts.kakao.com')) {
      console.log('Additional authentication required...');
      // 동의 버튼이 있으면 클릭
      const agreeButton = await page.$('button[type="submit"], button.submit');
      if (agreeButton) {
        await agreeButton.click();
        await delay(2000);
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      }
    }

    const finalUrl = page.url();
    console.log(`Final URL: ${finalUrl}`);

    if (finalUrl.includes('tistory.com') && !finalUrl.includes('login')) {
      await saveCookies(page);
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
 * 티스토리에 글 발행 (Puppeteer)
 */
export async function publishToTistory(params: {
  title: string;
  content: string;
  tag?: string;
}): Promise<TistoryPublishResult> {
  const { title, content, tag } = params;

  let browser: Browser | null = null;
  let useBrowserbase = false;

  try {
    console.log('Launching browser...');

    // Browserbase 사용 여부 확인 (프로덕션에서 API 키가 있으면 사용)
    useBrowserbase = config.browserbase.enabled && process.env.NODE_ENV === 'production';

    if (useBrowserbase) {
      console.log('Connecting to Browserbase for publishing...');
      const { browser: connectedBrowser } = await connectToBrowserbase();
      browser = connectedBrowser;
      console.log('Connected to Browserbase');
    } else {
      // 로컬 Puppeteer 사용
      const isHeadless = process.env.HEADLESS === 'true' || process.env.NODE_ENV === 'production';
      console.log(`Puppeteer launch starting... (headless: ${isHeadless})`);

      browser = await puppeteer.launch({
        headless: isHeadless,
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
        timeout: 60000,
      });

      console.log('Browser launched successfully');
    }

    if (!browser) {
      throw new Error('브라우저를 시작할 수 없습니다.');
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // User-Agent 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 쿠키 로드 시도
    const cookiesLoaded = await loadCookies(page);
    console.log(`Cookies loaded: ${cookiesLoaded}`);

    // 로그인 상태 확인
    const loggedIn = await isLoggedIn(page);

    if (!loggedIn) {
      console.log('Not logged in or session expired');

      // Browserbase 환경에서는 자동 로그인 불가 (2FA 필요)
      if (config.browserbase.enabled) {
        // 저장된 쿠키 삭제 (만료된 쿠키)
        await prisma.tistoryCookie.deleteMany({
          where: { blogName: config.tistory.blogName }
        });
        console.log('Expired cookies deleted from DB');

        throw new Error('로그인이 만료되었습니다. 프론트엔드에서 "카카오 로그인" 버튼을 클릭하여 다시 로그인해주세요.');
      }

      // 로컬 환경에서는 자동 로그인 시도
      console.log('Attempting auto-login...');
      const loginSuccess = await loginToTistory(page);
      if (!loginSuccess) {
        throw new Error('자동 로그인에 실패했습니다. 수동으로 로그인해주세요.');
      }
    }

    // 글쓰기 페이지로 이동
    console.log('Navigating to write page...');

    // "이어서 작성하시겠습니까?" 다이얼로그 핸들러 등록 (페이지 이동 전에 설정해야 함)
    page.on('dialog', async (dialog) => {
      console.log(`Dialog appeared: ${dialog.type()} - ${dialog.message()}`);
      // 이어서 작성 관련 다이얼로그는 취소 (dismiss)
      if (dialog.message().includes('이어서') || dialog.message().includes('저장된 글')) {
        console.log('Dismissing "Continue writing?" dialog...');
        await dialog.dismiss();
      } else {
        // 다른 다이얼로그는 확인
        await dialog.accept();
      }
    });

    // 글쓰기 페이지로 이동 시도
    const writeUrl = `https://${config.tistory.blogName}.tistory.com/manage/newpost`;
    console.log('Navigating to:', writeUrl);
    await page.goto(writeUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await delay(3000);

    // 글쓰기 페이지 접근 확인
    let currentUrl = page.url();
    console.log('Current URL after navigation:', currentUrl);

    // 글쓰기 페이지가 아니면 처리
    if (!currentUrl.includes('newpost') && !currentUrl.includes('manage')) {
      console.log('========================================');
      console.log('글쓰기 페이지에 접근할 수 없습니다.');
      console.log(`Current URL: ${currentUrl}`);
      console.log('========================================');

      // 로그인 페이지로 리다이렉트되었거나 블로그 홈으로 갔으면 세션 만료
      const isLoginPage = currentUrl.includes('login') || currentUrl.includes('auth') || currentUrl.includes('kakao');
      const isBlogHome = currentUrl === `https://${config.tistory.blogName}.tistory.com/` ||
                         currentUrl === `https://${config.tistory.blogName}.tistory.com`;

      if (isLoginPage || isBlogHome) {
        // Browserbase 환경에서는 만료된 쿠키 삭제 후 에러 반환
        if (config.browserbase.enabled) {
          await prisma.tistoryCookie.deleteMany({
            where: { blogName: config.tistory.blogName }
          });
          console.log('Expired cookies deleted from DB');
          throw new Error('로그인이 만료되었습니다. 프론트엔드에서 "카카오 로그인" 버튼을 클릭하여 다시 로그인해주세요.');
        }
      }

      // 로컬 환경에서만 대기 (Browserbase에서는 즉시 에러)
      if (!config.browserbase.enabled) {
        console.log('로컬 환경: 사용자가 직접 글쓰기 페이지로 이동할 때까지 대기...');
        const waitStart = Date.now();
        const waitMax = 180000;

        while ((Date.now() - waitStart) < waitMax) {
          await delay(2000);
          currentUrl = page.url();
          console.log(`Waiting for write page... Current: ${currentUrl}`);

          if (currentUrl.includes('newpost') || currentUrl.includes('manage/post') || currentUrl.includes('/write')) {
            console.log('글쓰기 페이지 도달!');
            await delay(2000);
            break;
          }
        }
      }

      // 여전히 글쓰기 페이지가 아니면 에러
      if (!currentUrl.includes('newpost') && !currentUrl.includes('manage/post') && !currentUrl.includes('/write')) {
        throw new Error('글쓰기 페이지로 이동하지 못했습니다. 로그인 상태를 확인해주세요.');
      }
    }

    // 페이지 로드 대기 (새 에디터 UI 대응)
    console.log('Waiting for editor to load...');
    await delay(5000); // 페이지 초기 로딩 대기 (5초로 증가)

    // 디버깅용 스크린샷 저장
    await page.screenshot({ path: 'tistory-editor-debug.png', fullPage: true });
    console.log('Debug screenshot saved: tistory-editor-debug.png');

    // 현재 URL 확인
    console.log('Current page URL:', page.url());

    // 여러 에디터 선택자 시도
    const editorSelectors = [
      '.editor-wrapper',
      '#editor-root',
      '.mce-content-body',
      '.wrap_editor',
      '#editorContainer',
      '.article-editor',
      '[class*="editor"]',
      '#content',
      '.tistory-editor',
    ];

    let editorFound = false;
    for (const selector of editorSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        console.log(`Editor found with selector: ${selector}`);
        editorFound = true;
        break;
      } catch {
        continue;
      }
    }

    if (!editorFound) {
      // 선택자를 찾지 못해도 계속 진행 (에디터가 다른 방식으로 로드될 수 있음)
      console.log('Editor selector not found, continuing anyway...');
      await delay(2000);
    }

    // 제목 입력
    console.log('========== STEP 1: 제목 입력 ==========');
    const titleSelectors = [
      'input[name="title"]',
      '#post-title-inp',
      '.title-input',
      'input[placeholder*="제목"]',
      '.tit_post input',
      '#title',
    ];

    let titleEntered = false;
    for (const selector of titleSelectors) {
      try {
        const titleInput = await page.$(selector);
        if (titleInput) {
          await page.click(selector);
          await page.type(selector, title, { delay: 30 });
          console.log(`Title entered with selector: ${selector}`);
          titleEntered = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!titleEntered) {
      console.log('Title input not found, trying to find any input...');
      const firstInput = await page.$('input[type="text"]');
      if (firstInput) {
        await firstInput.click();
        await firstInput.type(title, { delay: 30 });
      }
    }

    // 제목 입력 후 스크린샷
    await page.screenshot({ path: 'step1-title.png', fullPage: true });
    console.log('Screenshot saved: step1-title.png');
    await delay(2000);

    // 에디터 모드 확인 및 HTML 모드로 전환
    console.log('Switching to HTML mode...');

    // "기본모드" 드롭다운 클릭해서 HTML 모드 선택
    try {
      // 먼저 모드 선택 버튼 찾기
      const modeBtn = await page.$('.editor-mode-selector, [class*="mode"], button:has-text("기본모드")');
      if (modeBtn) {
        await modeBtn.click();
        await delay(500);
      }

      // HTML 모드 버튼 찾기
      const htmlModeButton = await page.$('button[data-mode="html"], .btn_html, [data-editor-mode="html"], button:has-text("HTML")');
      if (htmlModeButton) {
        await htmlModeButton.click();
        await delay(1000);
        console.log('Switched to HTML mode');
      }
    } catch (e) {
      console.log('HTML mode switch failed, continuing with default mode');
    }

    // 본문 입력
    console.log('========== STEP 2: 본문 입력 ==========');
    console.log('Content length:', content.length, 'characters');
    console.log('Content preview (first 500 chars):', content.substring(0, 500));

    // 에디터 DOM 구조 상세 분석
    console.log('\n=== 에디터 DOM 구조 분석 ===');
    const domAnalysis = await page.evaluate(() => {
      const results: string[] = [];

      // 1. 모든 contenteditable 요소
      const editables = document.querySelectorAll('[contenteditable="true"]');
      results.push(`\n[contenteditable="true"] 요소: ${editables.length}개`);
      editables.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        const tagName = el.tagName;
        const className = el.className;
        const id = el.id;
        results.push(`  ${i}: <${tagName}> id="${id}" class="${className}" size=${Math.round(rect.width)}x${Math.round(rect.height)} visible=${rect.height > 0}`);
      });

      // 2. ProseMirror 관련
      const proseMirror = document.querySelector('.ProseMirror');
      if (proseMirror) {
        const rect = proseMirror.getBoundingClientRect();
        results.push(`\n.ProseMirror 발견: size=${Math.round(rect.width)}x${Math.round(rect.height)}`);
        results.push(`  innerHTML 길이: ${proseMirror.innerHTML.length}`);
        results.push(`  textContent 길이: ${proseMirror.textContent?.length || 0}`);
        results.push(`  contenteditable: ${proseMirror.getAttribute('contenteditable')}`);
      } else {
        results.push('\n.ProseMirror 없음');
      }

      // 3. iframe 확인 (에디터가 iframe 안에 있을 수 있음)
      const iframes = document.querySelectorAll('iframe');
      results.push(`\niframe 개수: ${iframes.length}`);
      iframes.forEach((iframe, i) => {
        results.push(`  ${i}: id="${iframe.id}" class="${iframe.className}" src="${iframe.src?.substring(0, 50)}..."`);
      });

      // 4. textarea 확인
      const textareas = document.querySelectorAll('textarea');
      results.push(`\ntextarea 개수: ${textareas.length}`);
      textareas.forEach((ta, i) => {
        const rect = ta.getBoundingClientRect();
        results.push(`  ${i}: id="${ta.id}" name="${ta.name}" class="${ta.className}" size=${Math.round(rect.width)}x${Math.round(rect.height)}`);
      });

      // 5. 에디터 관련 클래스 검색
      const editorKeywords = ['editor', 'content', 'write', 'body', 'article'];
      results.push('\n에디터 관련 요소 검색:');
      editorKeywords.forEach(keyword => {
        const els = document.querySelectorAll(`[class*="${keyword}"]`);
        if (els.length > 0 && els.length < 10) {
          results.push(`  "${keyword}" 포함: ${els.length}개`);
          els.forEach((el, i) => {
            if (i < 3) {
              const rect = el.getBoundingClientRect();
              results.push(`    - <${el.tagName}> class="${el.className.substring(0, 50)}" size=${Math.round(rect.width)}x${Math.round(rect.height)}`);
            }
          });
        }
      });

      return results.join('\n');
    });
    console.log(domAnalysis);
    console.log('=== DOM 분석 끝 ===\n');

    let contentEntered = false;

    // HTML을 일반 텍스트로 변환하는 함수
    const htmlToPlainText = (html: string): string => {
      return html
        // 제목 태그 처리
        .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n$1\n\n')
        .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n$1\n\n')
        .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n$1\n\n')
        .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n$1\n\n')
        .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n$1\n\n')
        .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n$1\n\n')
        // 단락 처리
        .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
        // 줄바꿈 처리
        .replace(/<br\s*\/?>/gi, '\n')
        // 리스트 처리
        .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
        .replace(/<ul[^>]*>/gi, '\n')
        .replace(/<\/ul>/gi, '\n')
        .replace(/<ol[^>]*>/gi, '\n')
        .replace(/<\/ol>/gi, '\n')
        // div 처리
        .replace(/<div[^>]*>(.*?)<\/div>/gi, '$1\n')
        // 나머지 태그 제거
        .replace(/<[^>]*>/g, '')
        // HTML 엔티티 변환
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // 연속 줄바꿈 정리
        .replace(/\n{4,}/g, '\n\n\n')
        .trim();
    };

    const plainText = htmlToPlainText(content);
    console.log('Plain text length:', plainText.length);
    console.log('Plain text preview (first 300 chars):', plainText.substring(0, 300));

    // 방법 1: ProseMirror 에디터에 직접 텍스트 입력
    console.log('\n--- 방법 1: ProseMirror 직접 타이핑 ---');
    try {
      const proseMirror = await page.$('.ProseMirror');
      if (proseMirror) {
        console.log('ProseMirror 요소 발견');

        // 바운딩 박스 확인
        const box = await proseMirror.boundingBox();
        console.log('ProseMirror boundingBox:', box);

        if (box && box.height > 50) {
          // 에디터 중앙 클릭
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          console.log('에디터 클릭 완료');
          await delay(500);

          // 포커스 확인
          const hasFocus = await page.evaluate(() => {
            const pm = document.querySelector('.ProseMirror');
            return pm === document.activeElement || pm?.contains(document.activeElement);
          });
          console.log('포커스 상태:', hasFocus);

          // 테스트 텍스트 먼저 입력해보기
          console.log('테스트 텍스트 입력 시도...');
          await page.keyboard.type('테스트 본문입니다. ', { delay: 50 });
          await delay(500);

          // 입력 확인
          const testContent = await page.evaluate(() => {
            const pm = document.querySelector('.ProseMirror');
            return pm?.textContent || '';
          });
          console.log('테스트 입력 후 내용:', testContent);

          if (testContent.includes('테스트')) {
            console.log('테스트 입력 성공! 본문 전체 입력 시작...');

            // 나머지 본문 입력 (청크 단위)
            const chunkSize = 200;
            const chunks: string[] = [];
            for (let i = 0; i < plainText.length; i += chunkSize) {
              chunks.push(plainText.substring(i, i + chunkSize));
            }

            console.log(`총 ${chunks.length}개 청크 입력 예정`);

            for (let i = 0; i < Math.min(chunks.length, 5); i++) { // 처음 5개 청크만 테스트
              await page.keyboard.type(chunks[i], { delay: 0 });
              console.log(`청크 ${i + 1}/${chunks.length} 입력 완료`);
              await delay(50);
            }

            contentEntered = true;
          } else {
            console.log('테스트 입력 실패 - 다른 방법 시도');
          }
        } else {
          console.log('ProseMirror boundingBox가 유효하지 않음');
        }
      } else {
        console.log('ProseMirror 요소 없음');
      }
    } catch (e) {
      console.log('방법 1 실패:', e);
    }

    // 방법 2: iframe 내부 에디터 확인 (티스토리 기본 에디터)
    if (!contentEntered) {
      console.log('\n--- 방법 2: iframe 내부 에디터 확인 ---');
      try {
        const iframes = await page.$$('iframe');
        console.log(`iframe 개수: ${iframes.length}`);

        for (let i = 0; i < iframes.length; i++) {
          const frame = await iframes[i].contentFrame();
          if (frame) {
            const editorInFrame = await frame.$('[contenteditable="true"], body');
            if (editorInFrame) {
              const box = await editorInFrame.boundingBox();
              // 에디터 영역인지 확인 (충분히 큰 영역)
              if (box && box.height > 100) {
                console.log(`iframe ${i}에서 에디터 발견 (크기: ${box.width}x${box.height})`);
                await editorInFrame.click();
                await delay(500);

                // 전체 본문 입력 (청크 단위)
                console.log(`전체 본문 입력 시작 (${plainText.length}자)...`);

                const chunkSize = 300;
                const chunks: string[] = [];
                for (let j = 0; j < plainText.length; j += chunkSize) {
                  chunks.push(plainText.substring(j, j + chunkSize));
                }

                console.log(`총 ${chunks.length}개 청크로 분할`);

                for (let j = 0; j < chunks.length; j++) {
                  await page.keyboard.type(chunks[j], { delay: 0 });
                  if ((j + 1) % 5 === 0 || j === chunks.length - 1) {
                    console.log(`청크 ${j + 1}/${chunks.length} 입력 완료`);
                  }
                  await delay(50); // 청크 사이 짧은 대기
                }

                // 입력 확인
                const iframeContent = await frame.evaluate(() => {
                  const body = document.body;
                  return body?.textContent?.length || 0;
                });

                console.log(`iframe 에디터 내용 길이: ${iframeContent}자`);

                if (iframeContent > 100) {
                  console.log('iframe 본문 입력 성공!');
                  contentEntered = true;
                  break;
                }
              }
            }
          }
        }
      } catch (e) {
        console.log('방법 2 실패:', e);
      }
    }

    // 방법 3: textarea 직접 입력
    if (!contentEntered) {
      console.log('\n--- 방법 3: textarea 직접 입력 ---');
      try {
        const textareas = await page.$$('textarea');
        console.log(`textarea 개수: ${textareas.length}`);

        for (let i = 0; i < textareas.length; i++) {
          const ta = textareas[i];
          const box = await ta.boundingBox();
          if (box && box.height > 100) {
            console.log(`textarea ${i} 발견 (크기: ${box.width}x${box.height})`);
            await ta.click();
            await delay(300);
            await ta.type(plainText.substring(0, 500), { delay: 0 });

            const taValue = await ta.evaluate((el: HTMLTextAreaElement) => el.value);
            if (taValue && taValue.length > 50) {
              console.log('textarea 입력 성공!');
              contentEntered = true;
              break;
            }
          }
        }
      } catch (e) {
        console.log('방법 3 실패:', e);
      }
    }

    // 방법 4: 모든 contenteditable 요소 시도
    if (!contentEntered) {
      console.log('\n--- 방법 4: 모든 contenteditable 요소 시도 ---');
      try {
        const editables = await page.$$('[contenteditable="true"]');
        console.log(`contenteditable 요소: ${editables.length}개`);

        for (let i = 0; i < editables.length; i++) {
          const el = editables[i];
          const box = await el.boundingBox();

          if (box && box.height > 100 && box.width > 200) {
            console.log(`요소 ${i} 시도 (크기: ${box.width}x${box.height})`);

            await page.mouse.click(box.x + 10, box.y + 10);
            await delay(300);

            await page.keyboard.type('contenteditable 테스트 ', { delay: 50 });
            await delay(300);

            const elContent = await el.evaluate((node: Element) => node.textContent || '');
            console.log(`요소 ${i} 내용:`, elContent.substring(0, 100));

            if (elContent.includes('contenteditable 테스트')) {
              console.log(`요소 ${i} 입력 성공!`);
              await page.keyboard.type(plainText.substring(0, 500), { delay: 0 });
              contentEntered = true;
              break;
            }
          }
        }
      } catch (e) {
        console.log('방법 4 실패:', e);
      }
    }

    // ========== 본문 입력 결과 확인 ==========
    console.log('\n========== 본문 입력 결과 ==========');
    await page.screenshot({ path: 'step2-content-final.png', fullPage: true });
    console.log('Screenshot saved: step2-content-final.png');

    // 최종 에디터 상태 확인
    const finalCheck = await page.evaluate(() => {
      const results: string[] = [];

      // ProseMirror 확인
      const pm = document.querySelector('.ProseMirror');
      if (pm) {
        results.push(`ProseMirror textContent 길이: ${pm.textContent?.length || 0}`);
        results.push(`ProseMirror 내용 미리보기: ${pm.textContent?.substring(0, 200)}`);
      }

      // 모든 contenteditable 확인
      const editables = document.querySelectorAll('[contenteditable="true"]');
      editables.forEach((el, i) => {
        const text = el.textContent || '';
        if (text.length > 10) {
          results.push(`contenteditable[${i}] 내용 길이: ${text.length}`);
        }
      });

      // textarea 확인
      const textareas = document.querySelectorAll('textarea');
      textareas.forEach((ta, i) => {
        const val = (ta as HTMLTextAreaElement).value;
        if (val.length > 10) {
          results.push(`textarea[${i}] 내용 길이: ${val.length}`);
        }
      });

      return results.join('\n');
    });

    console.log(finalCheck);

    if (contentEntered) {
      console.log('\n✓ 본문 입력 성공!');
    } else {
      console.log('\n✗ 본문 입력 실패 - 브라우저를 확인하세요');
    }

    // 태그 입력 (옵션)
    if (tag) {
      console.log('========== STEP 3: 태그 입력 ==========');
      try {
        const tagSelector = 'input[name="tag"], #tagText, .tag-input';
        const tagInput = await page.$(tagSelector);
        if (tagInput) {
          await page.click(tagSelector);
          await page.type(tagSelector, tag, { delay: 30 });
          console.log('Tags entered');
        }
      } catch {
        console.log('Tag input not found, skipping...');
      }
    }

    // 발행 전 최종 스크린샷
    await page.screenshot({ path: 'step3-before-publish.png', fullPage: true });
    console.log('Screenshot saved: step3-before-publish.png');

    // 발행 버튼 클릭
    console.log('========== STEP 4: 발행 버튼 클릭 ==========');
    await delay(1000);

    // 발행 버튼 찾기
    const publishSelectors = [
      'button.btn_publish',
      '#publish-btn',
      'button[data-action="publish"]',
      '.btn_save',
      '.publish-btn',
      '#publish-layer-btn',
      'button.btn-primary',
    ];

    let published = false;

    for (const selector of publishSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          await btn.click();
          published = true;
          break;
        }
      } catch {
        continue;
      }
    }

    // XPath로 발행 버튼 찾기
    if (!published) {
      const [publishBtn] = await page.$$('xpath/.//button[contains(text(), "발행") or contains(text(), "저장") or contains(text(), "공개") or contains(text(), "완료")]');
      if (publishBtn) {
        console.log('Found publish button via XPath');
        await publishBtn.click();
        published = true;
      }
    }

    if (!published) {
      throw new Error('Could not find publish button');
    }

    // 발행 설정 레이어 대기
    console.log('Waiting for publish layer...');
    await delay(2000);

    // 디버깅용 스크린샷
    await page.screenshot({ path: 'tistory-publish-layer.png', fullPage: true });
    console.log('Publish layer screenshot saved');

    // 발행 설정 레이어에서 "공개 발행" 버튼 클릭
    let finalPublished = false;

    // 먼저 모든 버튼에서 "공개 발행" 텍스트를 가진 버튼 찾기
    const allButtons = await page.$$('button');
    for (const btn of allButtons) {
      try {
        const text = await btn.evaluate((el: Element) => el.textContent?.trim());
        console.log(`Button found: "${text}"`);
        if (text && text.includes('공개 발행')) {
          console.log('Clicking 공개 발행 button!');
          await btn.click();
          finalPublished = true;
          break;
        }
      } catch {
        continue;
      }
    }

    // XPath로 최종 발행 버튼 찾기 ("공개 발행" 버튼)
    if (!finalPublished) {
      const publishBtns = await page.$$('xpath/.//button[contains(text(), "공개 발행") or contains(text(), "공개발행") or contains(text(), "발행")]');
      for (const btn of publishBtns) {
        try {
          const isVisible = await btn.isVisible();
          if (isVisible) {
            const text = await btn.evaluate((el: Element) => el.textContent);
            console.log(`Found button with text: ${text}`);
            // "공개 발행" 버튼 우선 클릭
            if (text && text.includes('공개')) {
              console.log('Clicking 공개 발행 button');
              await btn.click();
              finalPublished = true;
              break;
            }
          }
        } catch {
          continue;
        }
      }
    }

    // 여전히 발행 안 됐으면 모든 발행 버튼 클릭 시도
    if (!finalPublished) {
      const allBtns = await page.$$('button');
      for (const btn of allBtns) {
        try {
          const text = await btn.evaluate((el: Element) => el.textContent);
          if (text && (text.includes('공개 발행') || text.includes('공개발행'))) {
            console.log('Found 공개 발행 button via text search');
            await btn.click();
            finalPublished = true;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    // 발행 완료 대기
    await delay(3000);

    // 발행된 글 URL 확인
    const publishedUrl = page.url();
    console.log('Post published! URL:', publishedUrl);

    await saveCookies(page);

    return {
      success: true,
      postUrl: publishedUrl,
    };

  } catch (error) {
    console.error('Error publishing to Tistory:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      success: false,
      error: errorMessage,
    };
  } finally {
    if (browser) {
      if (useBrowserbase) {
        browser.disconnect();
      } else {
        await browser.close();
      }
    }
  }
}

/**
 * 로그인 테스트
 */
export async function testLogin(): Promise<{ success: boolean; message: string }> {
  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: false, // 로그인 테스트는 화면을 보여줌
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    await loadCookies(page);

    const loggedIn = await isLoggedIn(page);

    if (loggedIn) {
      return { success: true, message: 'Already logged in (cookies valid)' };
    }

    const loginSuccess = await loginToTistory(page);

    if (loginSuccess) {
      return { success: true, message: 'Login successful' };
    } else {
      return { success: false, message: 'Login failed' };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: errorMessage };
  } finally {
    if (browser) {
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

// ==================== 폴링 기반 수동 로그인 (Browserbase 지원) ====================

interface LoginSession {
  id: string;
  status: 'pending' | 'in_progress' | 'success' | 'failed' | 'timeout';
  message: string;
  browser: Browser | null;
  startedAt: number;
  liveViewUrl?: string; // Browserbase 라이브 뷰 URL
  browserbaseSessionId?: string; // Browserbase 세션 ID
}

// 활성 로그인 세션 저장소
const loginSessions = new Map<string, LoginSession>();

/**
 * 고유 세션 ID 생성
 */
function generateSessionId(): string {
  return `login_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Browserbase 브라우저 연결
 */
async function connectToBrowserbase(): Promise<{ browser: Browser; liveViewUrl: string; sessionId: string }> {
  const apiKey = config.browserbase.apiKey;
  const projectId = config.browserbase.projectId;

  if (!apiKey || !projectId) {
    throw new Error('BROWSERBASE_API_KEY 또는 BROWSERBASE_PROJECT_ID가 설정되지 않았습니다.');
  }

  console.log('Connecting to Browserbase...');

  try {
    // Browserbase SDK 초기화
    const bb = new Browserbase({ apiKey });

    // 세션 생성
    const session = await bb.sessions.create({
      projectId,
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

/**
 * 수동 로그인 시작 (폴링 방식) - 즉시 세션 ID와 라이브 뷰 URL 반환
 */
export async function startManualLogin(): Promise<{ sessionId: string; liveViewUrl?: string }> {
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

  // 기존 쿠키 삭제 (새 로그인을 위해 깨끗하게 시작)
  const blogName = config.tistory.blogName;
  console.log(`Deleting existing cookies for blog: ${blogName}...`);
  try {
    await prisma.tistoryCookie.deleteMany({
      where: { blogName }
    });
    console.log('Existing cookies deleted');
  } catch (e) {
    console.log('No existing cookies to delete or error:', e);
  }

  const sessionId = generateSessionId();

  const session: LoginSession = {
    id: sessionId,
    status: 'pending',
    message: '브라우저를 시작하는 중...',
    browser: null,
    startedAt: Date.now(),
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

    // 로그인 완료 대기 (최대 2분)
    let loginDetected = false;
    const maxWaitTime = 120000; // 2분
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

        const isLoggedIn = currentUrl.includes('tistory.com') &&
          !currentUrl.includes('login') &&
          !currentUrl.includes('auth') &&
          !currentUrl.includes('kakao') &&
          !currentUrl.includes('error');

        if (isLoggedIn) {
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
      console.log(`[${sessionId}] Saving cookies...`);
      await saveCookies(page);

      // 블로그 페이지로 이동해서 추가 쿠키 획득
      try {
        await page.goto(`https://${config.tistory.blogName}.tistory.com`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        await delay(2000);
        await saveCookies(page);
      } catch (e) {
        console.log(`[${sessionId}] Blog page navigation skipped`);
      }

      session.status = 'success';
      session.message = '로그인 성공! 쿠키가 저장되었습니다.';
    } else {
      session.status = 'timeout';
      session.message = '로그인 시간 초과 (2분). 다시 시도해주세요.';
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

    console.log(`[${sessionId}] Opening Tistory login page...`);
    session.message = '티스토리 로그인 페이지로 이동 중...';

    await page.goto('https://www.tistory.com/auth/login', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    session.message = '라이브 뷰에서 카카오 로그인을 완료해주세요...';
    console.log(`[${sessionId}] Waiting for user to complete login in live view...`);

    // 로그인 완료 대기 (최대 2분)
    let loginDetected = false;
    const maxWaitTime = 120000; // 2분
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

        const isLoggedIn = currentUrl.includes('tistory.com') &&
          !currentUrl.includes('login') &&
          !currentUrl.includes('auth') &&
          !currentUrl.includes('kakao') &&
          !currentUrl.includes('error');

        if (isLoggedIn) {
          loginDetected = true;
          console.log(`[${sessionId}] Login detected!`);
          break;
        }
      } catch (e) {
        console.log(`[${sessionId}] Page check error:`, e);
      }
    }

    if (loginDetected) {
      session.message = '쿠키 저장 중...';
      console.log(`[${sessionId}] Saving cookies...`);
      await saveCookies(page);

      // 블로그 페이지로 이동해서 추가 쿠키 획득
      try {
        await page.goto(`https://${config.tistory.blogName}.tistory.com`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        await delay(2000);
        await saveCookies(page);
      } catch (e) {
        console.log(`[${sessionId}] Blog page navigation skipped`);
      }

      session.status = 'success';
      session.message = '로그인 성공! 쿠키가 저장되었습니다.';
    } else {
      session.status = 'timeout';
      session.message = '로그인 시간 초과 (2분). 다시 시도해주세요.';
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

/**
 * 저장된 쿠키 삭제
 */
export async function clearCookies(): Promise<boolean> {
  try {
    const blogName = config.tistory.blogName;
    const result = await prisma.tistoryCookie.deleteMany({
      where: { blogName },
    });
    if (result.count > 0) {
      console.log(`Cookies cleared for blog: ${blogName}`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
