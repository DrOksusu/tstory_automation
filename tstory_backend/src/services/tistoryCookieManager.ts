/**
 * 티스토리 쿠키 관리 모듈 (DB 기반 CRUD)
 */
import { Page } from 'puppeteer';
import prisma from './prismaClient';

/**
 * 저장된 쿠키 로드 (DB에서) - 유저 이메일 + 소유자 기반
 */
export async function loadCookies(page: Page, userEmail?: string, ownerEmail?: string): Promise<boolean> {
  try {
    if (!userEmail) {
      console.log('No user email provided, cannot load cookies');
      return false;
    }

    // ownerEmail이 없으면 userEmail을 기본값으로 사용 (하위 호환)
    const owner = ownerEmail || userEmail;
    console.log(`Loading cookies from database for user: ${userEmail}, owner: ${owner}...`);

    const cookieRecord = await prisma.tistoryCookie.findUnique({
      where: { ownerEmail_userEmail: { ownerEmail: owner, userEmail } },
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
      console.log('No cookies found in database for this user');
    }
  } catch (error) {
    console.error('Failed to load cookies from DB:', error);
  }
  return false;
}

/**
 * 쿠키 저장 (DB에) - 유저 이메일 + 소유자 기반
 */
export async function saveCookies(page: Page, userEmail?: string, ownerEmail?: string): Promise<boolean> {
  try {
    if (!userEmail) {
      console.log('[saveCookies] No user email provided, cannot save cookies');
      return false;
    }

    // ownerEmail이 없으면 userEmail을 기본값으로 사용 (하위 호환)
    const owner = ownerEmail || userEmail;
    console.log(`[saveCookies] Getting cookies for user: ${userEmail}, owner: ${owner}`);
    const cookies = await page.cookies();
    console.log(`[saveCookies] Got ${cookies.length} cookies from browser`);

    if (cookies.length === 0) {
      console.log('[saveCookies] WARNING: No cookies to save!');
      return false;
    }

    // 티스토리 관련 쿠키만 필터링해서 저장
    const tistoryCookies = cookies.filter((cookie) =>
      cookie.domain.includes('tistory.com') || cookie.domain.includes('kakao.com')
    );
    console.log(`[saveCookies] Filtered to ${tistoryCookies.length} tistory/kakao cookies`);

    const cookiesJson = JSON.stringify(tistoryCookies);
    console.log(`[saveCookies] Cookie JSON length: ${cookiesJson.length} bytes`);

    console.log(`[saveCookies] Upserting to database...`);
    const result = await prisma.tistoryCookie.upsert({
      where: { ownerEmail_userEmail: { ownerEmail: owner, userEmail } },
      update: { cookies: cookiesJson },
      create: { ownerEmail: owner, userEmail, cookies: cookiesJson },
    });

    console.log(`[saveCookies] SUCCESS! Saved to DB for user: ${userEmail}, owner: ${owner}, record id: ${result.id}`);
    return true;
  } catch (error) {
    console.error('[saveCookies] FAILED to save cookies to DB:');
    console.error('[saveCookies] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[saveCookies] Error message:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('[saveCookies] Stack:', error.stack);
    }
    return false;
  }
}

/**
 * 저장된 쿠키 존재 여부 확인 (DB) - 유저 이메일 + 소유자 기반
 */
export async function checkCookiesExist(userEmail?: string, ownerEmail?: string): Promise<{ exists: boolean; userEmail?: string; savedAt?: Date }> {
  try {
    if (!userEmail) {
      console.log('No user email provided, checking all cookies...');
      const whereClause = ownerEmail ? { ownerEmail } : {};
      const anyCookie = await prisma.tistoryCookie.findFirst({ where: whereClause });
      if (anyCookie) {
        return {
          exists: true,
          userEmail: anyCookie.userEmail,
          savedAt: anyCookie.updatedAt,
        };
      }
      return { exists: false };
    }

    const owner = ownerEmail || userEmail;
    const savedCookie = await prisma.tistoryCookie.findUnique({
      where: { ownerEmail_userEmail: { ownerEmail: owner, userEmail } },
    });

    if (savedCookie && savedCookie.cookies) {
      const cookies = JSON.parse(savedCookie.cookies);
      if (Array.isArray(cookies) && cookies.length > 0) {
        return {
          exists: true,
          userEmail,
          savedAt: savedCookie.updatedAt,
        };
      }
    }

    return { exists: false, userEmail };
  } catch (error) {
    console.error('Failed to check cookies:', error);
    return { exists: false, userEmail };
  }
}

/**
 * 저장된 계정 목록 조회 - 소유자별 필터링
 */
export async function getAllAccounts(ownerEmail?: string): Promise<Array<{ userEmail: string; savedAt: Date }>> {
  try {
    console.log(`[getAllAccounts] Fetching accounts from DB (owner: ${ownerEmail || 'all'})...`);
    const whereClause = ownerEmail ? { ownerEmail } : {};
    const accounts = await prisma.tistoryCookie.findMany({
      where: whereClause,
      select: {
        userEmail: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    console.log(`[getAllAccounts] Found ${accounts.length} accounts:`, accounts.map(a => a.userEmail));

    return accounts.map((account) => ({
      userEmail: account.userEmail,
      savedAt: account.updatedAt,
    }));
  } catch (error) {
    console.error('[getAllAccounts] Failed to get accounts:', error);
    return [];
  }
}

/**
 * 저장된 쿠키 삭제 - 유저 이메일 + 소유자 기반
 */
export async function clearCookies(userEmail?: string, ownerEmail?: string): Promise<boolean> {
  try {
    if (!userEmail) {
      console.log('No user email provided, cannot clear cookies');
      return false;
    }

    const owner = ownerEmail || userEmail;
    const result = await prisma.tistoryCookie.deleteMany({
      where: { ownerEmail: owner, userEmail },
    });
    if (result.count > 0) {
      console.log(`Cookies cleared for user: ${userEmail}`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
