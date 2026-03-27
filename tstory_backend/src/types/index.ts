export interface GenerateBlogRequest {
  sourceUrl: string;      // 참고할 블로그 링크
  mainKeyword: string;    // 메인 키워드
  regionKeyword: string;  // 지역 키워드
  customTopic?: string;   // 사용자 지정 핵심 주제 (선택)
  systemPrompt?: string;  // 사용자 커스텀 시스템 프롬프트 (선택)
  userEmail?: string;     // 사용자 이메일 (쿠키 로드용)
  ownerEmail?: string;    // 앱 로그인 사용자 (소유자)
  aiModel?: 'gemini' | 'claude';  // AI 모델 선택 (기본값: gemini)
}

export interface GeneratedContent {
  title: string;
  content: string;
  metaDescription: string;
}

export interface TistoryPostResponse {
  tistory: {
    status: string;
    postId: string;
    url: string;
  };
}

export interface BlogGenerationResult {
  success: boolean;
  postId?: number;
  tistoryPostId?: string;
  tistoryUrl?: string;
  title?: string;
  error?: string;
  durationMs?: number;
}

export interface TistoryPublishResult {
  success: boolean;
  postUrl?: string;
  error?: string;
}

export interface LoginSession {
  id: string;
  status: 'pending' | 'in_progress' | 'success' | 'failed' | 'timeout';
  message: string;
  browser: import('puppeteer').Browser | null;
  startedAt: number;
  liveViewUrl?: string; // Browserbase 라이브 뷰 URL
  browserbaseSessionId?: string; // Browserbase 세션 ID
  userEmail?: string; // 로그인 유저 이메일 (카카오 계정)
  ownerEmail?: string; // 앱 로그인 사용자 (소유자)
}
