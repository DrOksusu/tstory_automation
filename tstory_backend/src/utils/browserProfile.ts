/**
 * 브라우저 프로필 관리 유틸리티
 * userDataDir을 통해 카카오 로그인 세션(쿠키, localStorage 등)을 디스크에 유지하여
 * 2FA 재인증을 방지한다.
 */
import path from 'path';
import fs from 'fs';

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
