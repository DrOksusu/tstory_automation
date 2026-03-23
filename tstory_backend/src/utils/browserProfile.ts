/**
 * 브라우저 프로필 관리 유틸리티
 * userDataDir을 통해 카카오 로그인 세션(쿠키, localStorage 등)을 디스크에 유지하여
 * 2FA 재인증을 방지한다.
 * 동일 프로필로 중복 실행을 방지하는 락 메커니즘 포함.
 */
import path from 'path';
import fs from 'fs';
import { Browser } from 'puppeteer';

// 프로필별 활성 브라우저 인스턴스 추적
const activeBrowsers = new Map<string, Browser>();

/**
 * 사용자별 브라우저 프로필 디렉토리 경로를 반환한다.
 * 이메일이 없으면 'default' 프로필을 사용한다.
 */
export function getUserDataDir(userEmail?: string): string {
  const profileName = userEmail
    ? userEmail.replace(/[^a-zA-Z0-9]/g, '_')
    : 'default';
  const baseDir = path.resolve(process.cwd(), 'browser-profiles');
  const profileDir = path.join(baseDir, profileName);

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  return profileDir;
}

/**
 * 해당 프로필에 활성 브라우저가 있으면 종료한 뒤 새 브라우저를 등록한다.
 * Puppeteer launch 전에 호출하여 "browser is already running" 오류를 방지.
 */
export async function closeExistingBrowser(profileDir: string): Promise<void> {
  const existing = activeBrowsers.get(profileDir);
  if (!existing) return;

  console.log(`[browserProfile] 기존 브라우저 종료: ${profileDir}`);
  try {
    await existing.close();
  } catch (error) {
    console.warn('[browserProfile] 기존 브라우저 종료 실패 (이미 종료됨):', error);
  }
  activeBrowsers.delete(profileDir);
}

/**
 * 새로 실행한 브라우저를 프로필에 등록한다.
 */
export function registerBrowser(profileDir: string, browser: Browser): void {
  activeBrowsers.set(profileDir, browser);
}

/**
 * 브라우저 종료 시 등록 해제한다.
 */
export function unregisterBrowser(profileDir: string): void {
  activeBrowsers.delete(profileDir);
}
