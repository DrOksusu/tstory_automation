'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
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

interface TistoryCookieStatus {
  exists: boolean;
  savedAt?: string;
}

interface PublishProgress {
  status: string;
  message: string;
  step: number;
  totalSteps: number;
}

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<'preview' | 'publish' | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [publishProgress, setPublishProgress] = useState<PublishProgress | null>(null);
  const [formData, setFormData] = useState({
    sourceUrl: '',
    mainKeyword: '',
    regionKeyword: '',
  });
  const [cookieStatus, setCookieStatus] = useState<TistoryCookieStatus | null>(null);
  const [checkingCookies, setCheckingCookies] = useState(true);

  // 로그인하지 않은 경우 로그인 페이지로 리다이렉트
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // 페이지 로드 시 티스토리 쿠키 상태 확인
  useEffect(() => {
    const checkCookieStatus = async () => {
      if (!user?.email) return;

      try {
        const response = await fetch(`/auth/check-login?email=${encodeURIComponent(user.email)}`);
        const data = await response.json();
        setCookieStatus({
          exists: data.loggedIn,
          savedAt: data.savedAt,
        });
      } catch (error) {
        console.error('Failed to check cookie status:', error);
        setCookieStatus({ exists: false });
      } finally {
        setCheckingCookies(false);
      }
    };

    if (user?.email) {
      checkCookieStatus();
    }
  }, [user?.email]);

  const handleClearCookies = async () => {
    if (!user?.email) {
      alert('삭제할 쿠키가 없습니다.');
      return;
    }

    try {
      const response = await fetch(`/auth/cookies?email=${encodeURIComponent(user.email)}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      alert(data.message);
      setCookieStatus({ exists: false });
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

  // 상태를 단계로 변환하는 헬퍼 함수
  const getStepFromStatus = (status: string): { step: number; totalSteps: number } => {
    const steps: Record<string, number> = {
      'pending': 1,
      'generating': 2,
      'publishing': 3,
      'success': 4,
      'failed': 4,
    };
    return { step: steps[status] || 1, totalSteps: 4 };
  };

  const handlePublish = async () => {
    if (!formData.sourceUrl || !formData.mainKeyword || !formData.regionKeyword) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    setLoading(true);
    setLoadingType('publish');
    setPublishProgress({ status: 'pending', message: '발행 준비 중...', step: 1, totalSteps: 4 });

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

        // 진행 상태 업데이트
        const { step, totalSteps } = getStepFromStatus(statusData.status);
        setPublishProgress({
          status: statusData.status,
          message: statusData.message,
          step,
          totalSteps,
        });

        // 완료 확인
        if (statusData.completed) {
          setPublishProgress(null);
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
      setPublishProgress(null);
      setPublishResult({
        success: false,
        error: '작업 시간 초과 (10분). 백엔드 로그를 확인해주세요.',
      });
    } catch (error) {
      let message = '서버 연결에 실패했습니다.';
      if (error instanceof Error) {
        message = error.message;
      }
      setPublishProgress(null);
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
    setPublishProgress({ status: 'pending', message: '발행 준비 중...', step: 1, totalSteps: 3 });

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

        // 진행 상태 업데이트 (미리보기에서 발행은 3단계: 준비 → 발행 → 완료)
        const previewSteps: Record<string, number> = { 'pending': 1, 'publishing': 2, 'success': 3, 'failed': 3 };
        setPublishProgress({
          status: statusData.status,
          message: statusData.message,
          step: previewSteps[statusData.status] || 1,
          totalSteps: 3,
        });

        if (statusData.completed) {
          setPublishProgress(null);
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
      setPublishProgress(null);
      setPublishResult({
        success: false,
        error: '작업 시간 초과 (5분). 백엔드 로그를 확인해주세요.',
      });
    } catch (error) {
      let message = '서버 연결에 실패했습니다.';
      if (error instanceof Error) {
        message = error.message;
      }
      setPublishProgress(null);
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

  // 로딩 중이거나 로그인하지 않은 경우
  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

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

      {/* 티스토리 쿠키 상태 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">티스토리 쿠키 상태</h3>
            <p className="text-sm text-slate-500">
              티스토리 발행에 필요한 쿠키 저장 상태입니다.
            </p>
          </div>
          {cookieStatus?.exists && (
            <button
              onClick={handleClearCookies}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
            >
              쿠키 삭제
            </button>
          )}
        </div>

        {checkingCookies ? (
          <div className="p-3 bg-slate-50 text-slate-500 rounded-lg flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            쿠키 상태 확인 중...
          </div>
        ) : cookieStatus?.exists ? (
          <div className="p-3 rounded-lg bg-green-50 text-green-700 border border-green-200">
            <div className="flex items-center gap-2">
              <span className="text-lg">✅</span>
              <span className="font-medium">티스토리 쿠키 저장됨</span>
              {cookieStatus.savedAt && (
                <span className="text-xs text-green-600 ml-auto">
                  ({new Date(cookieStatus.savedAt).toLocaleString('ko-KR')})
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <span>티스토리 쿠키가 없습니다. 첫 발행 시 로그인이 필요합니다.</span>
            </div>
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

      {/* 발행 진행 상태 모달 */}
      {publishProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-slate-800 text-center mb-6">
              발행 진행 중
            </h3>

            {/* 진행 단계 표시 */}
            <div className="mb-6">
              <div className="flex justify-between mb-2">
                {Array.from({ length: publishProgress.totalSteps }, (_, i) => (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                      i + 1 < publishProgress.step
                        ? 'bg-green-500 text-white'
                        : i + 1 === publishProgress.step
                        ? 'bg-orange-500 text-white animate-pulse'
                        : 'bg-slate-200 text-slate-400'
                    }`}
                  >
                    {i + 1 < publishProgress.step ? '✓' : i + 1}
                  </div>
                ))}
              </div>
              <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500"
                  style={{ width: `${((publishProgress.step - 1) / (publishProgress.totalSteps - 1)) * 100}%` }}
                />
              </div>
            </div>

            {/* 현재 단계 메시지 */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <svg className="animate-spin h-5 w-5 text-orange-500" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-lg font-medium text-slate-700">{publishProgress.message}</span>
              </div>
              <p className="text-sm text-slate-500">
                {publishProgress.totalSteps === 4 ? (
                  <>
                    {publishProgress.step === 1 && '잠시만 기다려주세요...'}
                    {publishProgress.step === 2 && 'AI가 콘텐츠를 분석하고 글을 작성하고 있습니다.'}
                    {publishProgress.step === 3 && '티스토리에 글을 발행하고 있습니다.'}
                  </>
                ) : (
                  <>
                    {publishProgress.step === 1 && '잠시만 기다려주세요...'}
                    {publishProgress.step === 2 && '티스토리에 글을 발행하고 있습니다.'}
                  </>
                )}
              </p>
            </div>

            {/* 단계 설명 */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="space-y-2 text-sm">
                {publishProgress.totalSteps === 4 ? (
                  <>
                    <div className={`flex items-center gap-2 ${publishProgress.step >= 1 ? 'text-slate-700' : 'text-slate-400'}`}>
                      <span className={publishProgress.step > 1 ? 'text-green-500' : ''}>
                        {publishProgress.step > 1 ? '✓' : '○'}
                      </span>
                      1단계: 발행 준비
                    </div>
                    <div className={`flex items-center gap-2 ${publishProgress.step >= 2 ? 'text-slate-700' : 'text-slate-400'}`}>
                      <span className={publishProgress.step > 2 ? 'text-green-500' : ''}>
                        {publishProgress.step > 2 ? '✓' : '○'}
                      </span>
                      2단계: AI 글 생성
                    </div>
                    <div className={`flex items-center gap-2 ${publishProgress.step >= 3 ? 'text-slate-700' : 'text-slate-400'}`}>
                      <span className={publishProgress.step > 3 ? 'text-green-500' : ''}>
                        {publishProgress.step > 3 ? '✓' : '○'}
                      </span>
                      3단계: 티스토리 발행
                    </div>
                    <div className={`flex items-center gap-2 ${publishProgress.step >= 4 ? 'text-slate-700' : 'text-slate-400'}`}>
                      <span>{publishProgress.step >= 4 ? '✓' : '○'}</span>
                      4단계: 완료
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`flex items-center gap-2 ${publishProgress.step >= 1 ? 'text-slate-700' : 'text-slate-400'}`}>
                      <span className={publishProgress.step > 1 ? 'text-green-500' : ''}>
                        {publishProgress.step > 1 ? '✓' : '○'}
                      </span>
                      1단계: 발행 준비
                    </div>
                    <div className={`flex items-center gap-2 ${publishProgress.step >= 2 ? 'text-slate-700' : 'text-slate-400'}`}>
                      <span className={publishProgress.step > 2 ? 'text-green-500' : ''}>
                        {publishProgress.step > 2 ? '✓' : '○'}
                      </span>
                      2단계: 티스토리 발행
                    </div>
                    <div className={`flex items-center gap-2 ${publishProgress.step >= 3 ? 'text-slate-700' : 'text-slate-400'}`}>
                      <span>{publishProgress.step >= 3 ? '✓' : '○'}</span>
                      3단계: 완료
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
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
