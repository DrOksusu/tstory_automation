/**
 * 쿠키 파일을 Base64로 인코딩하는 스크립트
 * 사용법: node scripts/encode-cookies.js
 *
 * 결과를 Railway 환경변수 TISTORY_COOKIES에 설정하세요.
 */

const fs = require('fs');
const path = require('path');

const cookiesPath = path.join(__dirname, '..', 'cookies', 'tistory-cookies.json');

if (!fs.existsSync(cookiesPath)) {
  console.error('쿠키 파일이 없습니다:', cookiesPath);
  console.error('먼저 로컬에서 카카오 로그인을 완료하세요.');
  process.exit(1);
}

const cookiesJson = fs.readFileSync(cookiesPath, 'utf-8');
const base64 = Buffer.from(cookiesJson).toString('base64');

console.log('='.repeat(60));
console.log('TISTORY_COOKIES 환경변수 값 (아래 전체를 복사하세요):');
console.log('='.repeat(60));
console.log(base64);
console.log('='.repeat(60));
console.log(`\n길이: ${base64.length}자`);
console.log('\nRailway 환경변수에 TISTORY_COOKIES 이름으로 설정하세요.');
