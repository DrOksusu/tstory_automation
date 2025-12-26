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
};
