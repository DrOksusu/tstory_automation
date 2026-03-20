/**
 * 티스토리 서비스 공통 유틸리티
 */

/**
 * 지정된 시간만큼 대기
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
