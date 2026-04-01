// API 기본 URL (프로덕션에서는 백엔드 직접 호출, 로컬에서는 프록시 사용)
export const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || '';
