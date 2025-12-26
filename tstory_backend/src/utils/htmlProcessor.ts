/**
 * HTML 후처리 유틸리티
 * 티스토리 업로드 시 깨지는 코드들을 정리합니다.
 */

export function cleanHtml(html: string): string {
  let cleaned = html;

  // 1. &nbsp; (비분리 공백) 제거 - 일반 공백으로 대체
  cleaned = cleaned.replace(/&nbsp;/g, ' ');

  // 2. U+200B (Zero Width Space) 제거
  cleaned = cleaned.replace(/\u200B/g, '');

  // 3. U+200C (Zero Width Non-Joiner) 제거
  cleaned = cleaned.replace(/\u200C/g, '');

  // 4. U+200D (Zero Width Joiner) 제거
  cleaned = cleaned.replace(/\u200D/g, '');

  // 5. U+FEFF (BOM) 제거
  cleaned = cleaned.replace(/\uFEFF/g, '');

  // 6. 연속된 공백을 하나로 정리
  cleaned = cleaned.replace(/  +/g, ' ');

  // 7. 빈 태그 제거 (내용 없는 span, p 등)
  cleaned = cleaned.replace(/<(span|p|div)[^>]*>\s*<\/\1>/gi, '');

  // 8. 불필요한 style 속성 중 일부 정리 (mso- 시작하는 MS Office 스타일)
  cleaned = cleaned.replace(/\s*mso-[^;:"']+:[^;:"']+;?/gi, '');

  // 9. 빈 style 속성 제거
  cleaned = cleaned.replace(/\s*style\s*=\s*["']\s*["']/gi, '');

  // 10. class 없는 빈 span 태그 제거하고 내용만 유지
  cleaned = cleaned.replace(/<span\s*>([^<]*)<\/span>/gi, '$1');

  // 11. 연속 줄바꿈 정리 (3개 이상을 2개로)
  cleaned = cleaned.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');

  // 12. p 태그 내 불필요한 줄바꿈 제거
  cleaned = cleaned.replace(/<p>\s*<br\s*\/?>\s*/gi, '<p>');
  cleaned = cleaned.replace(/\s*<br\s*\/?>\s*<\/p>/gi, '</p>');

  // 13. 특수 유니코드 공백 문자들 제거
  cleaned = cleaned.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');

  // 14. HTML 엔티티 정규화
  cleaned = cleaned
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // 15. 최종 trim
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * 메타 디스크립션 정리
 */
export function cleanMetaDescription(description: string): string {
  let cleaned = description;

  // HTML 태그 제거
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // 특수 문자 정리
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  cleaned = cleaned.replace(/\u200B/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ');

  // 길이 제한 (150자)
  if (cleaned.length > 150) {
    cleaned = cleaned.substring(0, 147) + '...';
  }

  return cleaned.trim();
}
