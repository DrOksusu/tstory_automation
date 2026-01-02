'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface LoginStatus {
  message: string;
  success: boolean;
  liveViewUrl?: string;
}

export default function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const router = useRouter();
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginStatus, setLoginStatus] = useState<LoginStatus | null>(null);
  const loginSessionIdRef = useRef<string | null>(null);

  // 이미 로그인되어 있으면 메인 페이지로 리다이렉트
  useEffect(() => {
    if (!isLoading && user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // 페이지 종료 시 로그인 세션 취소
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (loginSessionIdRef.current) {
        navigator.sendBeacon(`/auth/login-session/${loginSessionIdRef.current}?_method=DELETE`);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // 자동 로그인 (이메일/비밀번호)
  const handleAutoLogin = async () => {
    if (!credentials.email || !credentials.password) {
      setLoginStatus({
        success: false,
        message: '이메일과 비밀번호를 모두 입력해주세요.',
      });
      return;
    }

    setLoginLoading(true);
    setLoginStatus({ success: false, message: '로그인 중...' });

    try {
      const response = await fetch('/auth/test-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setLoginStatus({
          success: true,
          message: '로그인 성공! 메인 페이지로 이동합니다...',
        });
        // 로그인 상태 저장 후 리다이렉트
        login(credentials.email);
        setTimeout(() => router.push('/'), 1000);
      } else {
        setLoginStatus({
          success: false,
          message: data.message || '로그인에 실패했습니다.',
        });
      }
    } catch (error) {
      setLoginStatus({
        success: false,
        message: '서버 연결에 실패했습니다.',
      });
      console.error(error);
    } finally {
      setLoginLoading(false);
    }
  };

  // 수동 로그인 (2FA 지원)
  const handleManualLogin = async () => {
    if (!credentials.email) {
      setLoginStatus({
        success: false,
        message: '이메일을 먼저 입력해주세요.',
      });
      return;
    }

    setLoginLoading(true);
    setLoginStatus(null);

    try {
      const startResponse = await fetch('/auth/start-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: credentials.email }),
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        throw new Error(errorData.message || '로그인 시작에 실패했습니다.');
      }

      const startData = await startResponse.json();
      const { sessionId, liveViewUrl } = startData;

      if (!sessionId) {
        throw new Error('세션 ID를 받지 못했습니다.');
      }

      loginSessionIdRef.current = sessionId;

      if (liveViewUrl) {
        setLoginStatus({
          success: false,
          message: '라이브 뷰에서 카카오 로그인을 완료해주세요.',
          liveViewUrl,
        });
        window.open(liveViewUrl, 'browserbase-login', 'width=1300,height=800');
      } else {
        setLoginStatus({
          success: false,
          message: '브라우저 창에서 카카오 로그인을 완료해주세요...',
        });
      }

      // 폴링으로 로그인 상태 확인
      const maxPollingTime = 150000;
      const pollingInterval = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxPollingTime) {
        await new Promise((resolve) => setTimeout(resolve, pollingInterval));

        try {
          const statusResponse = await fetch(`/auth/login-status/${sessionId}`);
          const statusData = await statusResponse.json();

          setLoginStatus({
            success: false,
            message: statusData.message,
            liveViewUrl: statusData.liveViewUrl || liveViewUrl,
          });

          if (statusData.completed) {
            loginSessionIdRef.current = null;
            if (statusData.success) {
              setLoginStatus({
                success: true,
                message: '로그인 성공! 메인 페이지로 이동합니다...',
              });
              login(credentials.email);
              setTimeout(() => router.push('/'), 1000);
            } else {
              setLoginStatus({
                success: false,
                message: statusData.message,
              });
            }
            return;
          }

          if (statusData.status === 'failed' || statusData.status === 'timeout') {
            loginSessionIdRef.current = null;
            setLoginStatus({
              success: false,
              message: statusData.message,
            });
            return;
          }
        } catch (pollError) {
          console.error('Polling error:', pollError);
        }
      }

      setLoginStatus({
        success: false,
        message: '로그인 시간 초과. 다시 시도해주세요.',
      });
    } catch (error) {
      setLoginStatus({
        success: false,
        message: error instanceof Error ? error.message : '서버 연결에 실패했습니다.',
      });
      console.error(error);
    } finally {
      setLoginLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">T</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800">로그인</h2>
            <p className="text-slate-500 mt-2">카카오 계정으로 로그인하세요</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                카카오 이메일
              </label>
              <input
                type="email"
                value={credentials.email}
                onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                placeholder="example@kakao.com"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                disabled={loginLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                비밀번호
              </label>
              <input
                type="password"
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                placeholder="비밀번호 입력"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                disabled={loginLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && credentials.email && credentials.password) {
                    handleAutoLogin();
                  }
                }}
              />
            </div>

            <button
              onClick={handleAutoLogin}
              disabled={loginLoading || !credentials.email || !credentials.password}
              className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-300 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loginLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  로그인 중...
                </>
              ) : (
                '로그인'
              )}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">또는</span>
              </div>
            </div>

            <button
              onClick={handleManualLogin}
              disabled={loginLoading || !credentials.email}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 text-slate-700 disabled:text-slate-400 rounded-lg font-medium transition-colors"
            >
              수동 로그인 (2단계 인증)
            </button>

            <p className="text-xs text-slate-500 text-center">
              2단계 인증(2FA)을 사용 중이라면 수동 로그인을 이용하세요.
            </p>
          </div>

          {loginStatus && (
            <div className={`mt-6 p-4 rounded-lg ${
              loginStatus.success
                ? 'bg-green-50 text-green-700 border border-green-200'
                : loginStatus.liveViewUrl
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
            }`}>
              <div className="flex items-center gap-2">
                {loginStatus.success ? '✅' : loginStatus.liveViewUrl ? '🌐' : '⏳'}
                <span>{loginStatus.message}</span>
              </div>
              {loginStatus.liveViewUrl && !loginStatus.success && (
                <div className="mt-3">
                  <a
                    href={loginStatus.liveViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    라이브 뷰 열기
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
