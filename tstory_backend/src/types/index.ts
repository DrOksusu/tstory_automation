export interface GenerateBlogRequest {
  sourceUrl: string;      // 참고할 블로그 링크
  mainKeyword: string;    // 메인 키워드
  regionKeyword: string;  // 지역 키워드
  userEmail?: string;     // 사용자 이메일 (쿠키 로드용)
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
  userEmail?: string; // 로그인 유저 이메일
}
