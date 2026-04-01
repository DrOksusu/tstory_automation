/**
 * 티스토리 글 발행 모듈
 */
import puppeteer, { Browser } from 'puppeteer';
import { config } from '../config';
import { TistoryPublishResult } from '../types';
import { loadCookies, saveCookies } from './tistoryCookieManager';
import { isLoggedIn, loginToTistory } from './tistoryAuth';
import { connectToBrowserbase, getOrCreateContext } from './browserbaseConnector';
import { delay } from './tistoryUtils';
import { getUserDataDir, closeExistingBrowser, registerBrowser, unregisterBrowser } from '../utils/browserProfile';
import { getCredential } from './credentialService';
import { createLogger } from './processLogService';

/**
 * 티스토리에 글 발행 (Puppeteer)
 */
export async function publishToTistory(params: {
  title: string;
  content: string;
  tag?: string;
  userEmail?: string;
  ownerEmail?: string;
  blogName?: string;
  onProgress?: (message: string) => void;
}): Promise<TistoryPublishResult> {
  const { title, content, tag, userEmail, ownerEmail, blogName, onProgress } = params;
  const targetBlog = blogName || config.tistory.blogName;
  const logger = createLogger('publish', undefined, userEmail);

  // 진행 상태 리포터
  const report = (msg: string) => {
    logger.info(msg);
    onProgress?.(msg);
  };

  let browser: Browser | null = null;
  let useBrowserbase = false;
  let liveViewUrl: string | undefined;

  try {
    report('브라우저를 실행하는 중...');

    // Browserbase 사용 여부 확인 (프로덕션에서 API 키가 있으면 사용)
    useBrowserbase = config.browserbase.enabled && process.env.NODE_ENV === 'production';

    if (useBrowserbase) {
      logger.info('Connecting to Browserbase for publishing...');
      // Context를 통해 세션 간 쿠키/localStorage 유지
      const contextId = (userEmail && ownerEmail)
        ? await getOrCreateContext(userEmail, ownerEmail)
        : undefined;
      const result = await connectToBrowserbase(contextId);
      browser = result.browser;
      liveViewUrl = result.liveViewUrl;
      logger.info('Connected to Browserbase');
    } else {
      // 로컬 Puppeteer 사용
      const isHeadless = process.env.HEADLESS === 'true' || process.env.NODE_ENV === 'production';
      logger.info(`Puppeteer launch starting... (headless: ${isHeadless})`);

      // 동일 프로필로 실행 중인 브라우저가 있으면 먼저 종료
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
        timeout: 60000,
      });

      logger.info('Browser launched successfully');
      registerBrowser(profileDir, browser);
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
    report('로그인 상태 확인 중...');
    const cookiesLoaded = await loadCookies(page, userEmail, ownerEmail);
    logger.info(`Cookies loaded: ${cookiesLoaded} (user: ${userEmail || 'none'}, owner: ${ownerEmail || 'none'})`);

    // 로그인 상태 확인
    const loggedIn = await isLoggedIn(page, targetBlog);

    if (!loggedIn) {
      logger.info('Not logged in or session expired');

      // 저장된 자격증명으로 자동 재로그인 시도 (Browserbase 포함)
      report('자동 재로그인 시도 중...');
      let credentials: { email: string; password: string } | null = null;

      if (userEmail) {
        credentials = await getCredential(userEmail, ownerEmail);
        if (credentials) {
          logger.info(`Saved credentials found for ${userEmail}, attempting auto re-login...`);
        }
      }

      if (!credentials) {
        // 저장된 자격증명이 없으면 config에서 기본 계정 사용
        if (config.kakao.email && config.kakao.password) {
          credentials = { email: config.kakao.email, password: config.kakao.password };
          logger.info('Using default credentials from config...');
        }
      }

      if (!credentials) {
        throw new Error('로그인이 만료되었고 저장된 자격증명이 없습니다. 프론트엔드에서 다시 로그인해주세요.');
      }

      // 2FA 대기 시 프론트엔드에 라이브 뷰 URL 포함하여 진행 상태 전달
      const loginProgress = (msg: string) => {
        if (msg.startsWith('2FA_REQUIRED|')) {
          const remainingSec = msg.split('|')[1];
          const fullMsg = liveViewUrl
            ? `2FA_REQUIRED|${liveViewUrl}|${remainingSec}`
            : `2FA_REQUIRED||${remainingSec}`;
          report(fullMsg);
        }
      };

      const loginSuccess = await loginToTistory(page, credentials, ownerEmail, loginProgress);
      if (!loginSuccess) {
        throw new Error('자동 재로그인에 실패했습니다. 2FA가 필요하면 프론트엔드에서 수동 로그인해주세요.');
      }

      // 재로그인 성공 시 쿠키 갱신 저장
      await saveCookies(page, userEmail, ownerEmail);
      report('자동 재로그인 성공!');
    }

    // 글쓰기 페이지로 이동
    report('글쓰기 페이지로 이동 중...');

    // "이어서 작성하시겠습니까?" 다이얼로그 핸들러 등록 (페이지 이동 전에 설정해야 함)
    page.on('dialog', async (dialog) => {
      logger.info(`Dialog appeared: ${dialog.type()} - ${dialog.message()}`);
      // 이어서 작성 관련 다이얼로그는 취소 (dismiss)
      if (dialog.message().includes('이어서') || dialog.message().includes('저장된 글')) {
        logger.info('Dismissing "Continue writing?" dialog...');
        await dialog.dismiss();
      } else {
        // 다른 다이얼로그는 확인
        await dialog.accept();
      }
    });

    // 글쓰기 페이지로 이동 시도
    const writeUrl = `https://${targetBlog}.tistory.com/manage/newpost`;
    logger.info(`Navigating to: ${writeUrl}`);
    await page.goto(writeUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await delay(3000);

    // 글쓰기 페이지 접근 확인
    let currentUrl = page.url();
    logger.info(`Current URL after navigation: ${currentUrl}`);

    // 글쓰기 페이지가 아니면 처리
    if (!currentUrl.includes('newpost') && !currentUrl.includes('manage')) {
      logger.info('========================================');
      logger.info('글쓰기 페이지에 접근할 수 없습니다.');
      logger.info(`Current URL: ${currentUrl}`);
      logger.info('========================================');

      // 로그인 페이지로 리다이렉트되었거나 블로그 홈으로 갔으면 세션 만료
      const isLoginPage = currentUrl.includes('login') || currentUrl.includes('auth') || currentUrl.includes('kakao');
      const isBlogHome = currentUrl === `https://${targetBlog}.tistory.com/` ||
                         currentUrl === `https://${targetBlog}.tistory.com`;

      if (isLoginPage || isBlogHome) {
        // Browserbase 환경에서는 에러 반환
        if (config.browserbase.enabled) {
          logger.info('Session expired - user needs to re-login');
          throw new Error('로그인이 만료되었습니다. 프론트엔드에서 "카카오 로그인" 버튼을 클릭하여 다시 로그인해주세요.');
        }
      }

      // 로컬 환경에서만 대기 (Browserbase에서는 즉시 에러)
      if (!config.browserbase.enabled) {
        logger.info('로컬 환경: 사용자가 직접 글쓰기 페이지로 이동할 때까지 대기...');
        const waitStart = Date.now();
        const waitMax = 180000;

        while ((Date.now() - waitStart) < waitMax) {
          await delay(2000);
          currentUrl = page.url();
          logger.info(`Waiting for write page... Current: ${currentUrl}`);

          if (currentUrl.includes('newpost') || currentUrl.includes('manage/post') || currentUrl.includes('/write')) {
            logger.info('글쓰기 페이지 도달!');
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
    report('에디터 로드 대기 중...');
    await delay(5000); // 페이지 초기 로딩 대기 (5초로 증가)

    // 디버깅용 스크린샷 저장
    await page.screenshot({ path: 'tistory-editor-debug.png', fullPage: true });
    logger.info('Debug screenshot saved: tistory-editor-debug.png');

    // 현재 URL 확인
    logger.info(`Current page URL: ${page.url()}`);

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
        logger.info(`Editor found with selector: ${selector}`);
        editorFound = true;
        break;
      } catch {
        continue;
      }
    }

    if (!editorFound) {
      // 선택자를 찾지 못해도 계속 진행 (에디터가 다른 방식으로 로드될 수 있음)
      logger.info('Editor selector not found, continuing anyway...');
      await delay(2000);
    }

    // 제목 입력
    report('제목을 입력하는 중...');
    logger.info('========== STEP 1: 제목 입력 ==========');
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
          logger.info(`Title entered with selector: ${selector}`);
          titleEntered = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!titleEntered) {
      logger.info('Title input not found, trying to find any input...');
      const firstInput = await page.$('input[type="text"]');
      if (firstInput) {
        await firstInput.click();
        await firstInput.type(title, { delay: 30 });
      }
    }

    // 제목 입력 후 스크린샷
    await page.screenshot({ path: 'step1-title.png', fullPage: true });
    logger.info('Screenshot saved: step1-title.png');
    await delay(2000);

    // 에디터 모드 확인 및 HTML 모드로 전환
    logger.info('Switching to HTML mode...');

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
        logger.info('Switched to HTML mode');
      }
    } catch (e) {
      logger.info('HTML mode switch failed, continuing with default mode');
    }

    // 본문 입력
    report('본문을 입력하는 중...');
    logger.info('========== STEP 2: 본문 입력 ==========');
    logger.info(`Content length: ${content.length} characters`);
    logger.info(`Content preview (first 500 chars): ${content.substring(0, 500)}`);

    // 에디터 DOM 구조 상세 분석
    logger.info('=== 에디터 DOM 구조 분석 ===');
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
    logger.info(domAnalysis);
    logger.info('=== DOM 분석 끝 ===');

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
    logger.info(`Plain text length: ${plainText.length}`);
    logger.info(`Plain text preview (first 300 chars): ${plainText.substring(0, 300)}`);

    // 방법 1: ProseMirror 에디터에 HTML 직접 주입
    logger.info('--- 방법 1: ProseMirror HTML 주입 ---');
    try {
      const proseMirror = await page.$('.ProseMirror');
      if (proseMirror) {
        logger.info('ProseMirror 요소 발견');

        const box = await proseMirror.boundingBox();
        if (box && box.height > 50) {
          logger.info(`ProseMirror HTML 주입 시작 (${content.length}자)...`);
          const injected = await page.evaluate((htmlContent: string) => {
            const pm = document.querySelector('.ProseMirror');
            if (pm) {
              pm.innerHTML = htmlContent;
              pm.dispatchEvent(new Event('input', { bubbles: true }));
              return pm.textContent?.length || 0;
            }
            return 0;
          }, content);

          logger.info(`ProseMirror 주입 완료, 텍스트 길이: ${injected}자`);
          if (injected > 50) {
            contentEntered = true;
          }
        } else {
          logger.info('ProseMirror boundingBox가 유효하지 않음');
        }
      } else {
        logger.info('ProseMirror 요소 없음');
      }
    } catch (e) {
      logger.info(`방법 1 실패: ${e}`);
    }

    // 방법 2: iframe 내부 에디터에 HTML 직접 주입 (타이핑 대신 evaluate 사용)
    if (!contentEntered) {
      logger.info('--- 방법 2: iframe 에디터에 HTML 직접 주입 ---');
      try {
        const iframes = await page.$$('iframe');
        logger.info(`iframe 개수: ${iframes.length}`);

        for (let i = 0; i < iframes.length; i++) {
          const frame = await iframes[i].contentFrame();
          if (frame) {
            const editorInFrame = await frame.$('[contenteditable="true"], body');
            if (editorInFrame) {
              const box = await editorInFrame.boundingBox();
              if (box && box.height > 100) {
                logger.info(`iframe ${i}에서 에디터 발견 (크기: ${box.width}x${box.height})`);

                // HTML을 evaluate로 즉시 주입 (타이핑 대신)
                logger.info(`HTML 직접 주입 시작 (${content.length}자)...`);
                const injected = await frame.evaluate((htmlContent: string) => {
                  const body = document.body;
                  if (body) {
                    body.innerHTML = htmlContent;
                    // 입력 이벤트 발생시켜 에디터가 변경을 인식하도록 함
                    body.dispatchEvent(new Event('input', { bubbles: true }));
                    body.dispatchEvent(new Event('change', { bubbles: true }));
                    return body.textContent?.length || 0;
                  }
                  return 0;
                }, content);

                logger.info(`HTML 주입 완료, 텍스트 길이: ${injected}자`);

                if (injected > 50) {
                  logger.info('iframe HTML 주입 성공!');
                  contentEntered = true;
                  break;
                }
              }
            }
          }
        }
      } catch (e) {
        logger.info(`방법 2 실패: ${e}`);
      }
    }

    // 방법 3: textarea 직접 입력
    if (!contentEntered) {
      logger.info('--- 방법 3: textarea 직접 입력 ---');
      try {
        const textareas = await page.$$('textarea');
        logger.info(`textarea 개수: ${textareas.length}`);

        for (let i = 0; i < textareas.length; i++) {
          const ta = textareas[i];
          const box = await ta.boundingBox();
          if (box && box.height > 100) {
            logger.info(`textarea ${i} 발견 (크기: ${box.width}x${box.height})`);
            await ta.click();
            await delay(300);
            await ta.type(plainText.substring(0, 500), { delay: 0 });

            const taValue = await ta.evaluate((el: HTMLTextAreaElement) => el.value);
            if (taValue && taValue.length > 50) {
              logger.info('textarea 입력 성공!');
              contentEntered = true;
              break;
            }
          }
        }
      } catch (e) {
        logger.info(`방법 3 실패: ${e}`);
      }
    }

    // 방법 4: 모든 contenteditable 요소 시도
    if (!contentEntered) {
      logger.info('--- 방법 4: 모든 contenteditable 요소 시도 ---');
      try {
        const editables = await page.$$('[contenteditable="true"]');
        logger.info(`contenteditable 요소: ${editables.length}개`);

        for (let i = 0; i < editables.length; i++) {
          const el = editables[i];
          const box = await el.boundingBox();

          if (box && box.height > 100 && box.width > 200) {
            logger.info(`요소 ${i} 시도 (크기: ${box.width}x${box.height})`);

            await page.mouse.click(box.x + 10, box.y + 10);
            await delay(300);

            await page.keyboard.type('contenteditable 테스트 ', { delay: 50 });
            await delay(300);

            const elContent = await el.evaluate((node: Element) => node.textContent || '');
            logger.info(`요소 ${i} 내용: ${elContent.substring(0, 100)}`);

            if (elContent.includes('contenteditable 테스트')) {
              logger.info(`요소 ${i} 입력 성공!`);
              await page.keyboard.type(plainText.substring(0, 500), { delay: 0 });
              contentEntered = true;
              break;
            }
          }
        }
      } catch (e) {
        logger.info(`방법 4 실패: ${e}`);
      }
    }

    // ========== 본문 입력 결과 확인 ==========
    logger.info('========== 본문 입력 결과 ==========');
    await page.screenshot({ path: 'step2-content-final.png', fullPage: true });
    logger.info('Screenshot saved: step2-content-final.png');

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

    logger.info(finalCheck);

    if (contentEntered) {
      logger.info('본문 입력 성공!');
    } else {
      logger.warn('본문 입력 실패 - 브라우저를 확인하세요');
    }

    // 태그 입력 (옵션)
    if (tag) {
      logger.info('========== STEP 3: 태그 입력 ==========');
      try {
        const tagSelector = 'input[name="tag"], #tagText, .tag-input';
        const tagInput = await page.$(tagSelector);
        if (tagInput) {
          await page.click(tagSelector);
          await page.type(tagSelector, tag, { delay: 30 });
          logger.info('Tags entered');
        }
      } catch {
        logger.info('Tag input not found, skipping...');
      }
    }

    // 발행 전 최종 스크린샷
    await page.screenshot({ path: 'step3-before-publish.png', fullPage: true });
    logger.info('Screenshot saved: step3-before-publish.png');

    // 발행 버튼 클릭
    report('발행 버튼 클릭 중...');
    logger.info('========== STEP 4: 발행 버튼 클릭 ==========');
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
        logger.info('Found publish button via XPath');
        await publishBtn.click();
        published = true;
      }
    }

    if (!published) {
      throw new Error('Could not find publish button');
    }

    // 발행 설정 레이어 대기
    logger.info('Waiting for publish layer...');
    await delay(2000);

    // 디버깅용 스크린샷
    await page.screenshot({ path: 'tistory-publish-layer.png', fullPage: true });
    logger.info('Publish layer screenshot saved');

    // 발행 설정 레이어에서 "공개 발행" 버튼 클릭
    let finalPublished = false;

    // 먼저 모든 버튼에서 "공개 발행" 텍스트를 가진 버튼 찾기
    const allButtons = await page.$$('button');
    for (const btn of allButtons) {
      try {
        const text = await btn.evaluate((el: Element) => el.textContent?.trim());
        logger.info(`Button found: "${text}"`);
        if (text && text.includes('공개 발행')) {
          logger.info('Clicking 공개 발행 button!');
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
            logger.info(`Found button with text: ${text}`);
            // "공개 발행" 버튼 우선 클릭
            if (text && text.includes('공개')) {
              logger.info('Clicking 공개 발행 button');
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
            logger.info('Found 공개 발행 button via text search');
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
    report('발행 완료 확인 중...');
    await delay(3000);

    // 발행된 글 URL 확인
    const publishedUrl = page.url();
    logger.info(`Post published! URL: ${publishedUrl}`);

    await saveCookies(page, userEmail, ownerEmail);

    return {
      success: true,
      postUrl: publishedUrl,
    };

  } catch (error) {
    logger.error(`Error publishing to Tistory: ${error}`);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      success: false,
      error: errorMessage,
    };
  } finally {
    if (browser) {
      const profileDir = getUserDataDir(userEmail);
      if (useBrowserbase) {
        browser.disconnect();
      } else {
        await browser.close();
        unregisterBrowser(profileDir);
      }
    }
  }
}
