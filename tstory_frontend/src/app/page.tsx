'use client';

import { useState, useEffect, useRef } from 'react';
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

interface TistoryAccount {
  userEmail: string;
  savedAt: string;
}

interface PublishProgress {
  status: string;
  message: string;
  step: number;
  totalSteps: number;
}

interface AddAccountStatus {
  message: string;
  liveViewUrl?: string;
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

  // 계정 관리 상태
  const [accounts, setAccounts] = useState<TistoryAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [addingAccount, setAddingAccount] = useState(false);
  const [addAccountStatus, setAddAccountStatus] = useState<AddAccountStatus | null>(null);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newAccountEmail, setNewAccountEmail] = useState('');
  const [newAccountPassword, setNewAccountPassword] = useState('');
  const loginSessionIdRef = useRef<string | null>(null);

  // 로그인하지 않은 경우 로그인 페이지로 리다이렉트
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // 계정 목록 로드
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const response = await fetch('/auth/accounts');
        const data = await response.json();
        if (data.success) {
          setAccounts(data.accounts);
          // 첫 번째 계정 자동 선택
          if (data.accounts.length > 0 && !selectedAccount) {
            setSelectedAccount(data.accounts[0].userEmail);
          }
        }
      } catch (error) {
        console.error('Failed to fetch accounts:', error);
      } finally {
        setLoadingAccounts(false);
      }
    };

    if (user) {
      fetchAccounts();
    }
  }, [user, selectedAccount]);

  // 계정 추가 (자동 로그인)
  const handleAddAccountAuto = async () => {
    if (!newAccountEmail || !newAccountPassword) {
      setAddAccountStatus({ message: '이메일과 비밀번호를 입력해주세요.' });
      return;
    }

    setAddingAccount(true);
    setAddAccountStatus({ message: '로그인 중...' });

    try {
      const response = await fetch('/auth/test-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newAccountEmail,
          password: newAccountPassword,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAddAccountStatus({ message: '계정 추가 완료!' });
        // 계정 목록 새로고침
        const accountsResponse = await fetch('/auth/accounts');
        const accountsData = await accountsResponse.json();
        if (accountsData.success) {
          setAccounts(accountsData.accounts);
          setSelectedAccount(newAccountEmail);
        }
        // 모달 닫기
        setTimeout(() => {
          setShowAddAccountModal(false);
          setAddAccountStatus(null);
          setNewAccountEmail('');
          setNewAccountPassword('');
        }, 1000);
      } else {
        setAddAccountStatus({ message: data.message || '로그인 실패. 2FA 사용 시 수동 로그인을 이용하세요.' });
      }
    } catch (error) {
      setAddAccountStatus({ message: '서버 연결에 실패했습니다.' });
      console.error(error);
    } finally {
      setAddingAccount(false);
    }
  };

  // 계정 추가 (수동 로그인 - 2FA 지원)
  const handleAddAccountManual = async () => {
    if (!newAccountEmail) {
      setAddAccountStatus({ message: '이메일을 입력해주세요.' });
      return;
    }

    setAddingAccount(true);
    setAddAccountStatus({ message: '브라우저 창 열기 중...' });

    try {
      const response = await fetch('/auth/start-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newAccountEmail }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '로그인 시작 실패');
      }

      const data = await response.json();
      const { sessionId, liveViewUrl } = data;

      if (!sessionId) {
        throw new Error('세션 ID를 받지 못했습니다.');
      }

      loginSessionIdRef.current = sessionId;

      if (liveViewUrl) {
        setAddAccountStatus({
          message: '라이브 뷰에서 카카오 로그인을 완료해주세요.',
          liveViewUrl,
        });
        window.open(liveViewUrl, 'browserbase-login', 'width=1300,height=800');
      } else {
        setAddAccountStatus({ message: '브라우저에서 로그인을 완료해주세요.' });
      }

      // 폴링
      const maxPollingTime = 150000;
      const pollingInterval = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxPollingTime) {
        await new Promise((resolve) => setTimeout(resolve, pollingInterval));

        try {
          const statusResponse = await fetch(`/auth/login-status/${sessionId}`);
          const statusData = await statusResponse.json();

          setAddAccountStatus({
            message: statusData.message,
            liveViewUrl: statusData.liveViewUrl || liveViewUrl,
          });

          if (statusData.completed) {
            loginSessionIdRef.current = null;
            if (statusData.success) {
              setAddAccountStatus({ message: '계정 추가 완료!' });
              // 계정 목록 새로고침
              const accountsResponse = await fetch('/auth/accounts');
              const accountsData = await accountsResponse.json();
              if (accountsData.success) {
                setAccounts(accountsData.accounts);
                setSelectedAccount(newAccountEmail);
              }
              setTimeout(() => {
                setShowAddAccountModal(false);
                setAddAccountStatus(null);
                setNewAccountEmail('');
                setNewAccountPassword('');
              }, 1000);
            } else {
              setAddAccountStatus({ message: statusData.message });
            }
            return;
          }

          if (statusData.status === 'failed' || statusData.status === 'timeout') {
            loginSessionIdRef.current = null;
            setAddAccountStatus({ message: statusData.message });
            return;
          }
        } catch (pollError) {
          console.error('Polling error:', pollError);
        }
      }

      setAddAccountStatus({ message: '시간 초과. 다시 시도해주세요.' });
    } catch (error) {
      setAddAccountStatus({ message: error instanceof Error ? error.message : '오류 발생' });
      console.error(error);
    } finally {
      setAddingAccount(false);
    }
  };

  // 계정 삭제
  const handleDeleteAccount = async (email: string) => {
    if (!confirm(`${email} 계정을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch(`/auth/cookies?email=${encodeURIComponent(email)}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        setAccounts(accounts.filter((a) => a.userEmail !== email));
        if (selectedAccount === email) {
          setSelectedAccount(accounts.length > 1 ? accounts.find((a) => a.userEmail !== email)?.userEmail || null : null);
        }
      }
    } catch (error) {
      alert('계정 삭제에 실패했습니다.');
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
      const timeoutId = setTimeout(() => controller.abort(), 180000);

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
        message = error.name === 'AbortError' ? '요청 시간이 초과되었습니다.' : error.message;
      }
      alert(message);
      console.error(error);
    } finally {
      setLoading(false);
      setLoadingType(null);
    }
  };

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
    if (!selectedAccount) {
      alert('발행할 티스토리 계정을 선택해주세요.');
      return;
    }

    if (!formData.sourceUrl || !formData.mainKeyword || !formData.regionKeyword) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    setLoading(true);
    setLoadingType('publish');
    setPublishProgress({ status: 'pending', message: '발행 준비 중...', step: 1, totalSteps: 4 });

    try {
      const startResponse = await fetch('/api/blog/start-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, userEmail: selectedAccount }),
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

      const maxPollingTime = 600000;
      const pollingInterval = 3000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxPollingTime) {
        await new Promise((resolve) => setTimeout(resolve, pollingInterval));

        const statusResponse = await fetch(`/api/blog/status/${taskId}`);
        const statusData = await statusResponse.json();

        const { step, totalSteps } = getStepFromStatus(statusData.status);
        setPublishProgress({
          status: statusData.status,
          message: statusData.message,
          step,
          totalSteps,
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

      setPublishProgress(null);
      setPublishResult({
        success: false,
        error: '작업 시간 초과 (10분).',
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
    if (!selectedAccount) {
      alert('발행할 티스토리 계정을 선택해주세요.');
      return;
    }

    setPreviewData(null);
    setLoading(true);
    setLoadingType('publish');
    setPublishProgress({ status: 'pending', message: '발행 준비 중...', step: 1, totalSteps: 3 });

    try {
      const startResponse = await fetch('/api/blog/publish-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editedData.title,
          content: editedData.content,
          metaDescription: editedData.metaDescription,
          userEmail: selectedAccount,
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

      const maxPollingTime = 300000;
      const pollingInterval = 3000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxPollingTime) {
        await new Promise((resolve) => setTimeout(resolve, pollingInterval));

        const statusResponse = await fetch(`/api/blog/status/${taskId}`);
        const statusData = await statusResponse.json();

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

      setPublishProgress(null);
      setPublishResult({
        success: false,
        error: '작업 시간 초과 (5분).',
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

      {/* 티스토리 계정 관리 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">티스토리 계정 관리</h3>
            <p className="text-sm text-slate-500">
              발행할 계정을 선택하세요. 여러 계정을 등록할 수 있습니다.
            </p>
          </div>
          <button
            onClick={() => setShowAddAccountModal(true)}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            계정 추가
          </button>
        </div>

        {loadingAccounts ? (
          <div className="p-4 bg-slate-50 rounded-lg flex items-center gap-2 text-slate-500">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            계정 목록 불러오는 중...
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <span>등록된 티스토리 계정이 없습니다. 계정을 추가해주세요.</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.map((account) => (
              <div
                key={account.userEmail}
                className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  selectedAccount === account.userEmail
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
                onClick={() => setSelectedAccount(account.userEmail)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedAccount === account.userEmail
                          ? 'border-orange-500 bg-orange-500'
                          : 'border-slate-300'
                      }`}
                    >
                      {selectedAccount === account.userEmail && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{account.userEmail}</p>
                      <p className="text-xs text-slate-500">
                        쿠키 저장: {new Date(account.savedAt).toLocaleString('ko-KR')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAccount(account.userEmail);
                    }}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="계정 삭제"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
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
              <h4 className="font-medium text-slate-800">계정 등록</h4>
              <p className="text-sm text-slate-500">티스토리 계정을 추가하고 선택하세요.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-orange-600 font-bold">2</span>
            </div>
            <div>
              <h4 className="font-medium text-slate-800">URL & 키워드 입력</h4>
              <p className="text-sm text-slate-500">참고 URL과 키워드를 입력하세요.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-orange-600 font-bold">3</span>
            </div>
            <div>
              <h4 className="font-medium text-slate-800">미리보기 & 발행</h4>
              <p className="text-sm text-slate-500">미리보기로 확인 후 발행하세요.</p>
            </div>
          </div>
        </div>
      </div>

      {/* 계정 추가 모달 */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !addingAccount && setShowAddAccountModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-slate-800 mb-4">티스토리 계정 추가</h3>
            <p className="text-sm text-slate-500 mb-4">
              카카오 계정으로 로그인하여 티스토리 쿠키를 저장합니다.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">카카오 이메일</label>
                <input
                  type="email"
                  value={newAccountEmail}
                  onChange={(e) => setNewAccountEmail(e.target.value)}
                  placeholder="example@kakao.com"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  disabled={addingAccount}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">비밀번호 (자동 로그인용)</label>
                <input
                  type="password"
                  value={newAccountPassword}
                  onChange={(e) => setNewAccountPassword(e.target.value)}
                  placeholder="비밀번호 입력"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  disabled={addingAccount}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleAddAccountAuto}
                  disabled={addingAccount || !newAccountEmail || !newAccountPassword}
                  className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-300 text-white rounded-lg font-medium transition-colors"
                >
                  {addingAccount ? '로그인 중...' : '자동 로그인'}
                </button>
                <button
                  onClick={handleAddAccountManual}
                  disabled={addingAccount || !newAccountEmail}
                  className="flex-1 py-2 bg-slate-500 hover:bg-slate-600 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
                >
                  수동 로그인 (2FA)
                </button>
              </div>

              <p className="text-xs text-slate-500 text-center">
                2단계 인증을 사용 중이라면 수동 로그인을 이용하세요.
              </p>

              {addAccountStatus && (
                <div className={`p-3 rounded-lg ${
                  addAccountStatus.message.includes('완료')
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : addAccountStatus.liveViewUrl
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                }`}>
                  <p>{addAccountStatus.message}</p>
                  {addAccountStatus.liveViewUrl && (
                    <a
                      href={addAccountStatus.liveViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-2 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg"
                    >
                      라이브 뷰 열기
                    </a>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setShowAddAccountModal(false);
                setAddAccountStatus(null);
                setNewAccountEmail('');
                setNewAccountPassword('');
              }}
              disabled={addingAccount}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

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
            <h3 className="text-xl font-bold text-slate-800 text-center mb-6">발행 진행 중</h3>
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
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <svg className="animate-spin h-5 w-5 text-orange-500" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-lg font-medium text-slate-700">{publishProgress.message}</span>
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
