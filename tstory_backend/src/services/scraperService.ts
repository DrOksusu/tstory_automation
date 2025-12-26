import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

/**
 * 네이버 블로그 URL을 모바일 버전으로 변환
 */
function convertToMobileNaverBlog(url: string): string {
  const match = url.match(/blog\.naver\.com\/([^/]+)\/(\d+)/);
  if (match) {
    const blogId = match[1];
    const logNo = match[2];
    // 모바일 버전은 iframe 없이 직접 콘텐츠 접근 가능
    return `https://m.blog.naver.com/${blogId}/${logNo}`;
  }
  return url.replace('blog.naver.com', 'm.blog.naver.com');
}

/**
 * Puppeteer를 사용하여 네이버 블로그 스크래핑 (JavaScript 렌더링 필요)
 */
async function scrapeNaverBlogWithPuppeteer(url: string): Promise<string> {
  let browser = null;
  try {
    // 모바일 버전 사용 (iframe 없이 직접 콘텐츠 접근 가능)
    const mobileUrl = convertToMobileNaverBlog(url);
    console.log(`Launching Puppeteer for Naver blog scraping... (${mobileUrl})`);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
      ],
      timeout: 60000,
    });

    const page = await browser.newPage();

    // 모바일 User-Agent 사용
    await page.setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    );
    await page.setViewport({ width: 390, height: 844, isMobile: true });

    // 네이버 블로그 모바일 페이지로 이동
    await page.goto(mobileUrl, {
      waitUntil: 'domcontentloaded', // 더 빠른 로딩
      timeout: 60000,
    });

    // 콘텐츠 로딩 대기
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 모바일 버전 콘텐츠 추출
    let content = await page.evaluate(() => {
      // 모바일 네이버 블로그 본문 선택자
      const selectors = [
        '.se-main-container',
        '.post_ct',
        '.post-view',
        '#postViewArea',
        '.se_component_wrap',
        'article',
        '.content',
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent && el.textContent.trim().length > 100) {
          return el.textContent;
        }
      }

      // fallback: body 전체
      return document.body.textContent || '';
    });

    // 텍스트 정리
    content = content.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();

    console.log(`Puppeteer scraped content length: ${content.length} characters`);

    return content;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function scrapeWebContent(url: string): Promise<string> {
  try {
    // 네이버 블로그는 Puppeteer 사용 (JavaScript 렌더링 필요)
    if (url.includes('blog.naver.com')) {
      console.log('Detected Naver blog, using Puppeteer...');
      const content = await scrapeNaverBlogWithPuppeteer(url);

      if (content.length < 100) {
        throw new Error('Could not extract meaningful content from Naver blog');
      }

      // 최대 길이 제한
      if (content.length > 10000) {
        return content.substring(0, 10000) + '...';
      }
      return content;
    }

    // 일반 웹페이지는 axios + cheerio 사용
    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      timeout: 15000,
      responseType: 'arraybuffer',
    });

    // UTF-8로 디코딩
    const html = Buffer.from(response.data).toString('utf-8');
    const $ = cheerio.load(html);

    // 불필요한 요소 제거
    $('script, style, nav, header, footer, aside, .ad, .advertisement').remove();

    let content = '';

    // 일반 블로그/웹페이지
    const mainContent = $('article, main, .content, .post-content, .entry-content, #content');
    if (mainContent.length > 0) {
      content = mainContent.text();
    }

    // fallback: body 전체
    if (!content) {
      content = $('body').text();
    }

    // 텍스트 정리
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();

    // 최대 길이 제한 (Gemini 토큰 제한 고려)
    if (content.length > 10000) {
      content = content.substring(0, 10000) + '...';
    }

    console.log(`Scraped content length: ${content.length} characters`);

    return content;
  } catch (error) {
    console.error('Error scraping URL:', url, error);
    throw new Error(`Failed to scrape content from ${url}`);
  }
}
