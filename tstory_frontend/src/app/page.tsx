'use client';

import { useState, useEffect, useRef } from 'react';
import BlogForm from '@/components/BlogForm';
import PreviewModal from '@/components/PreviewModal';
import ResultModal from '@/components/ResultModal';

interface PreviewData {
  title: string;
  metaDescription: string;
  content: string;
}

interface PublishResult {
  success: boolean;
  postId?: number;
  tistoryUrl?: string;
  title?: string;
  error?: string;
}

interface LoginStatus {
  message: string;
  success: boolean;
  liveViewUrl?: string;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<'preview' | 'publish' | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [formData, setFormData] = useState({
    sourceUrl: '',
    mainKeyword: '',
    regionKeyword: '',
  });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginStatus, setLoginStatus] = useState<LoginStatus | null>(null);
  const loginSessionIdRef = useRef<string | null>(null);

  // 페이지 종료 시 로그인 세션 취소
  useEffect(() => {
    const cancelLoginSession = async () => {
      if (loginSessionIdRef.current) {
        try {
          await fetch(`/auth/login-session/${loginSessionIdRef.current}`, {
            method: 'DELETE',
          });
          console.log('Login session cancelled on page close');
        } catch (e) {
          console.error('Failed to cancel login session:', e);
        }
      }
    };

    const handleBeforeUnload = () => {
      if (loginSessionIdRef.current) {
        // sendBeacon을 사용하여 페이지 종료 시에도 요청 전송
        navigator.sendBeacon(`/auth/login-session/${loginSessionIdRef.current}?_method=DELETE`);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cancelLoginSession();
    };
  }, []);

  const handleManualLogin = async () => {
    setLoginLoading(true);
    setLoginStatus(null);

    try {
      // 1. 로그인 세션 시작
      const startResponse = await fetch('/auth/start-login', {
        method: 'POST',
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        throw new Error(errorData.error || '로그인 시작에 실패했습니다.');
      }

      const startData = await startResponse.json();
      const { sessionId, liveViewUrl } = startData;

      if (!sessionId) {
        throw new Error('세션 ID를 받지 못했습니다.');
      }

      // 세션 ID 저장 (페이지 종료 시 취소용)
      loginSessionIdRef.current = sessionId;

      // 라이브 뷰 URL이 있으면 (Browserbase 사용 중) 새 창으로 열기
      if (liveViewUrl) {
        setLoginStatus({
          success: false,
          message: '라이브 뷰에서 카카오 로그인을 완료해주세요.',
          liveViewUrl,
        });
        // 새 창으로 라이브 뷰 열기
        window.open(liveViewUrl, 'browserbase-login', 'width=1300,height=800');
      } else {
        setLoginStatus({
          success: false,
          message: '로컬 브라우저에서 카카오 로그인을 완료해주세요...',
        });
      }

      // 2. 폴링으로 로그인 상태 확인 (최대 2분 30초)
      const maxPollingTime = 150000;
      const pollingInterval = 2000;
      const startTime = Date.now();
      let errorCount = 0;

      while (Date.now() - startTime < maxPollingTime) {
        await new Promise((resolve) => setTimeout(resolve, pollingInterval));

        try {
          const statusResponse = await fetch(`/auth/login-status/${sessionId}`);
          const statusData = await statusResponse.json();

          // 에러 카운트 리셋
          errorCount = 0;

          // 라이브 뷰 URL 업데이트 (첫 폴링에서 받을 수도 있음)
          const currentLiveViewUrl = statusData.liveViewUrl || liveViewUrl;

          // 진행 상태 업데이트
          setLoginStatus({
            success: false,
            message: statusData.message,
            liveViewUrl: currentLiveViewUrl,
          });

          // 완료 확인 (성공, 실패, 타임아웃, not_found 모두 포함)
          if (statusData.completed) {
            loginSessionIdRef.current = null; // 세션 ID 클리어
            setLoginStatus({
              success: statusData.success,
              message: statusData.message,
            });
            return;
          }

          // 실패 상태면 즉시 중단
          if (statusData.status === 'failed' || statusData.status === 'timeout') {
            loginSessionIdRef.current = null; // 세션 ID 클리어
            setLoginStatus({
              success: false,
              message: statusData.message,
            });
            return;
          }
        } catch (pollError) {
          errorCount++;
          console.error('Polling error:', pollError);

          // 연속 3번 에러 시 중단
          if (errorCount >= 3) {
            setLoginStatus({
              success: false,
              message: '서버 연결 오류. 다시 시도해주세요.',
            });
            return;
          }
        }
      }

      // 타임아웃
      setLoginStatus({
        success: false,
        message: '폴링 시간 초과. 다시 시도해주세요.',
      });
    } catch (error) {
      let message = '서버 연결에 실패했습니다.';
      if (error instanceof Error) {
        message = error.message;
      }
      setLoginStatus({
        success: false,
        message,
      });
      console.error(error);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleClearCookies = async () => {
    try {
      const response = await fetch('/auth/cookies', {
        method: 'DELETE',
      });

      const data = await response.json();
      alert(data.message);
    } catch (error) {
      alert('쿠키 삭제에 실패했습니다.');
      console.error(error);
    }
  };

  const handlePreview = async () => {
    if (!formData.sourceUrl || !formData.mainKeyword || !formData.regionKeyword) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    setLoading(true);
    setLoadingType('preview');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3분 타임아웃

      const response = await fetch('/api/blog/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`서버 오류: ${text || response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setPreviewData(data);
      } else {
        alert(`미리보기 실패: ${data.error}`);
      }
    } catch (error) {
      let message = '서버 연결에 실패했습니다.';
      if (error instanceof Error) {
        message = error.name === 'AbortError' ? '요청 시간이 초과되었습니다. 다시 시도해주세요.' : error.message;
      }
      alert(message);
      console.error(error);
    } finally {
      setLoading(false);
      setLoadingType(null);
    }
  };

  const handlePublish = async () => {
    if (!formData.sourceUrl || !formData.mainKeyword || !formData.regionKeyword) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    setLoading(true);
    setLoadingType('publish');

    try {
      // 1. 발행 작업 시작
      const startResponse = await fetch('/api/blog/start-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        throw new Error(errorData.error || '발행 시작에 실패했습니다.');
      }

      const startData = await startResponse.json();
      const { taskId } = startData;

      if (!taskId) {
        throw new Error('작업 ID를 받지 못했습니다.');
      }

      // 2. 폴링으로 작업 상태 확인 (최대 10분)
      const maxPollingTime = 600000;
      const pollingInterval = 3000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxPollingTime) {
        await new Promise((resolve) => setTimeout(resolve, pollingInterval));

        const statusResponse = await fetch(`/api/blog/status/${taskId}`);
        const statusData = await statusResponse.json();

        console.log('Task status:', statusData.status, statusData.message);

        // 완료 확인
        if (statusData.completed) {
          if (statusData.success && statusData.result) {
            setPublishResult(statusData.result);
          } else {
            setPublishResult({
              success: false,
              error: statusData.error || statusData.message,
            });
          }
          return;
        }
      }

      // 타임아웃
      setPublishResult({
        success: false,
        error: '작업 시간 초과 (10분). 백엔드 로그를 확인해주세요.',
      });
    } catch (error) {
      let message = '서버 연결에 실패했습니다.';
      if (error instanceof Error) {
        message = error.message;
      }
      setPublishResult({
        success: false,
        error: message,
      });
      console.error(error);
    } finally {
      setLoading(false);
      setLoadingType(null);
    }
  };

  const handlePublishFromPreview = async (editedData: PreviewData) => {
    setPreviewData(null);
    setLoading(true);
    setLoadingType('publish');

    try {
      // 편집된 글을 직접 발행
      const startResponse = await fetch('/api/blog/publish-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editedData.title,
          content: editedData.content,
          metaDescription: editedData.metaDescription,
        }),
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        throw new Error(errorData.error || '발행 시작에 실패했습니다.');
      }

      const startData = await startResponse.json();
      const { taskId } = startData;

      if (!taskId) {
        throw new Error('작업 ID를 받지 못했습니다.');
      }

      // 폴링으로 작업 상태 확인 (최대 5분)
      const maxPollingTime = 300000;
      const pollingInterval = 3000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxPollingTime) {
        await new Promise((resolve) => setTimeout(resolve, pollingInterval));

        const statusResponse = await fetch(`/api/blog/status/${taskId}`);
        const statusData = await statusResponse.json();

        console.log('Publish status:', statusData.status, statusData.message);

        if (statusData.completed) {
          if (statusData.success && statusData.result) {
            setPublishResult(statusData.result);
          } else {
            setPublishResult({
              success: false,
              error: statusData.error || statusData.message,
            });
          }
          return;
        }
      }

      // 타임아웃
      setPublishResult({
        success: false,
        error: '작업 시간 초과 (5분). 백엔드 로그를 확인해주세요.',
      });
    } catch (error) {
      let message = '서버 연결에 실패했습니다.';
      if (error instanceof Error) {
        message = error.message;
      }
      setPublishResult({
        success: false,
        error: message,
      });
      console.error(error);
    } finally {
      setLoading(false);
      setLoadingType(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* 안내 섹션 */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-6 text-white shadow-lg">
        <h2 className="text-2xl font-bold mb-2">AI 블로그 글 자동 생성</h2>
        <p className="text-orange-100">
          참고 URL과 키워드를 입력하면 Gemini AI가 SEO 최적화된 블로그 글을 작성하고
          티스토리에 자동으로 발행합니다.
        </p>
      </div>

      {/* 티스토리 로그인 관리 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">티스토리 로그인</h3>
            <p className="text-sm text-slate-500">
              발행 전 수동 로그인으로 쿠키를 저장하세요. (2단계 인증 지원)
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleManualLogin}
              disabled={loginLoading}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-300 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {loginLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  로그인 중...
                </>
              ) : (
                '카카오 로그인'
              )}
            </button>
            <button
              onClick={handleClearCookies}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
            >
              쿠키 삭제
            </button>
          </div>
        </div>

        {loginStatus && (
          <div className={`p-3 rounded-lg ${loginStatus.success ? 'bg-green-50 text-green-700' : loginStatus.liveViewUrl ? 'bg-blue-50 text-blue-700' : 'bg-yellow-50 text-yellow-700'}`}>
            <div className="flex items-center gap-2">
              {loginStatus.success ? '✅' : loginStatus.liveViewUrl ? '🌐' : '⏳'} {loginStatus.message}
            </div>
            {loginStatus.liveViewUrl && !loginStatus.success && (
              <div className="mt-2 pt-2 border-t border-blue-200">
                <p className="text-sm mb-2">팝업이 차단되었다면 아래 버튼을 클릭하세요:</p>
                <a
                  href={loginStatus.liveViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  라이브 뷰 열기
                </a>
              </div>
            )}
          </div>
        )}

        {loginLoading && !loginStatus?.liveViewUrl && (
          <div className="p-3 bg-blue-50 text-blue-700 rounded-lg">
            로컬 브라우저 창에서 카카오 로그인을 완료해주세요.
          </div>
        )}
      </div>

      {/* 메인 폼 */}
      <BlogForm
        formData={formData}
        setFormData={setFormData}
        onPreview={handlePreview}
        onPublish={handlePublish}
        loading={loading}
        loadingType={loadingType}
      />

      {/* 사용 가이드 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">사용 가이드</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-orange-600 font-bold">1</span>
            </div>
            <div>
              <h4 className="font-medium text-slate-800">참고 URL 입력</h4>
              <p className="text-sm text-slate-500">네이버 블로그 등 참고할 콘텐츠 URL을 입력하세요.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-orange-600 font-bold">2</span>
            </div>
            <div>
              <h4 className="font-medium text-slate-800">키워드 설정</h4>
              <p className="text-sm text-slate-500">메인 키워드와 지역 키워드를 입력하세요.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-orange-600 font-bold">3</span>
            </div>
            <div>
              <h4 className="font-medium text-slate-800">미리보기 & 발행</h4>
              <p className="text-sm text-slate-500">미리보기로 확인 후 티스토리에 발행하세요.</p>
            </div>
          </div>
        </div>
      </div>

      {/* 미리보기 모달 */}
      {previewData && (
        <PreviewModal
          data={previewData}
          onClose={() => setPreviewData(null)}
          onPublish={handlePublishFromPreview}
        />
      )}

      {/* 결과 모달 */}
      {publishResult && (
        <ResultModal
          result={publishResult}
          onClose={() => setPublishResult(null)}
        />
      )}
    </div>
  );
}
