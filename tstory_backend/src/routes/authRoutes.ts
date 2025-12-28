import { Router, Request, Response } from 'express';
import { testLogin, clearCookies, manualLogin, startManualLogin, getLoginStatus, cancelLogin } from '../services/tistoryService';
import { config } from '../config';

const router = Router();

/**
 * 로그인 테스트 (브라우저 창이 열림)
 * GET /auth/test-login
 */
router.get('/test-login', async (req: Request, res: Response) => {
  try {
    console.log('Starting login test...');
    const result = await testLogin();

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        info: '쿠키가 저장되었습니다. 이후 발행 시 자동 로그인됩니다.',
      });
    } else {
      res.status(401).json({
        success: false,
        message: result.message,
        hint: '.env 파일의 KAKAO_EMAIL, KAKAO_PASSWORD를 확인하세요.',
      });
    }
  } catch (error) {
    console.error('Login test error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * 수동 로그인 (2FA 지원)
 * GET /auth/manual-login
 * 브라우저가 열리면 직접 로그인 (2단계 인증 포함)
 */
router.get('/manual-login', async (req: Request, res: Response) => {
  try {
    console.log('Starting manual login...');
    console.log('브라우저가 열립니다. 직접 로그인을 완료해주세요.');

    const result = await manualLogin();

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        info: '쿠키가 저장되었습니다. 이후 발행 시 자동 로그인됩니다.',
      });
    } else {
      res.status(401).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error('Manual login error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * 수동 로그인 시작 (폴링 방식 + Browserless 라이브 뷰)
 * POST /auth/start-login
 * 브라우저가 열리고 즉시 세션 ID와 라이브 뷰 URL 반환
 */
router.post('/start-login', async (req: Request, res: Response) => {
  try {
    console.log('Starting manual login (polling mode)...');
    const { sessionId, liveViewUrl } = await startManualLogin();

    res.json({
      success: true,
      sessionId,
      liveViewUrl, // Browserless.io 라이브 뷰 URL (있는 경우)
      message: liveViewUrl
        ? '라이브 뷰 URL에서 로그인을 완료해주세요.'
        : '로그인 세션이 시작되었습니다. 브라우저에서 로그인을 완료해주세요.',
    });
  } catch (error) {
    console.error('Start login error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * 로그인 상태 확인 (폴링)
 * GET /auth/login-status/:sessionId
 */
router.get('/login-status/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const status = getLoginStatus(sessionId);

  res.json({
    success: status.status === 'success',
    status: status.status,
    message: status.message,
    liveViewUrl: status.liveViewUrl, // Browserless.io 라이브 뷰 URL
    completed: ['success', 'failed', 'timeout', 'not_found'].includes(status.status),
  });
});

/**
 * 로그인 세션 취소
 * DELETE /auth/login-session/:sessionId
 */
router.delete('/login-session/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const cancelled = await cancelLogin(sessionId);

  res.json({
    success: cancelled,
    message: cancelled ? '로그인 세션이 취소되었습니다.' : '세션을 찾을 수 없습니다.',
  });
});

/**
 * 로그인 세션 취소 (sendBeacon용 - POST 지원)
 * GET /auth/login-session/:sessionId?_method=DELETE
 */
router.get('/login-session/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { _method } = req.query;

  if (_method === 'DELETE') {
    const cancelled = await cancelLogin(sessionId);
    res.json({
      success: cancelled,
      message: cancelled ? '로그인 세션이 취소되었습니다.' : '세션을 찾을 수 없습니다.',
    });
  } else {
    res.status(400).json({ success: false, message: 'Invalid request' });
  }
});

/**
 * 저장된 쿠키(세션) 삭제
 * DELETE /auth/cookies
 */
router.delete('/cookies', async (req: Request, res: Response) => {
  const cleared = await clearCookies();

  if (cleared) {
    res.json({
      success: true,
      message: '쿠키가 삭제되었습니다. 다음 발행 시 다시 로그인됩니다.',
    });
  } else {
    res.json({
      success: true,
      message: '삭제할 쿠키가 없습니다.',
    });
  }
});

/**
 * 현재 설정 상태 확인
 * GET /auth/status
 */
router.get('/status', (req: Request, res: Response) => {
  const hasKakaoEmail = !!config.kakao.email && config.kakao.email !== 'your-kakao-email@example.com';
  const hasKakaoPassword = !!config.kakao.password && config.kakao.password !== 'your-kakao-password';
  const hasBlogName = !!config.tistory.blogName && config.tistory.blogName !== 'your-blog-name';
  const hasGeminiKey = !!config.gemini.apiKey && config.gemini.apiKey !== 'your-gemini-api-key';

  res.json({
    kakaoEmail: hasKakaoEmail ? 'configured' : 'missing',
    kakaoPassword: hasKakaoPassword ? 'configured' : 'missing',
    blogName: hasBlogName ? config.tistory.blogName : 'missing',
    geminiApiKey: hasGeminiKey ? 'configured' : 'missing',
    testLoginUrl: `http://localhost:${config.port}/auth/test-login`,
  });
});

export default router;
