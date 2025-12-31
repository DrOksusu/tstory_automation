import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
  },

  // 카카오 계정 (티스토리 로그인용)
  kakao: {
    email: process.env.KAKAO_EMAIL || '',
    password: process.env.KAKAO_PASSWORD || '',
  },

  tistory: {
    blogName: process.env.TISTORY_BLOG_NAME || '',
  },

  // Browserless.io (클라우드 브라우저) - 비활성화
  browserless: {
    apiKey: process.env.BROWSERLESS_API_KEY || '',
    enabled: false, // Browserbase로 대체
  },

  // Browserbase (클라우드 브라우저 - 라이브 뷰 지원)
  browserbase: {
    apiKey: process.env.BROWSERBASE_API_KEY || '',
    projectId: process.env.BROWSERBASE_PROJECT_ID || '',
    enabled: !!process.env.BROWSERBASE_API_KEY && !!process.env.BROWSERBASE_PROJECT_ID,
  },

  // AWS S3 (이미지 업로드용)
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_REGION || 'ap-northeast-2',
    s3Bucket: process.env.AWS_S3_BUCKET || 'tstory-pictures',
  },
};
