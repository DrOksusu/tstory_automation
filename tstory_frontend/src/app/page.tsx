'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import BlogForm from '@/components/BlogForm';
import PreviewModal from '@/components/PreviewModal';
import ResultModal from '@/components/ResultModal';
import { useTistoryAccounts, getCookieFreshness } from '@/hooks/useTistoryAccounts';
import type { CookieFreshness } from '@/hooks/useTistoryAccounts';
import { useBlogPublish } from '@/hooks/useBlogPublish';
import type { PreviewData } from '@/types/blog';

// 쿠키 신선도별 뱃지 설정
const FRESHNESS_BADGE: Record<CookieFreshness, { label: string; className: string }> = {
  fresh:   { label: '로그인 유효',   className: 'bg-green-100 text-green-700' },
  warning: { label: '만료 가능',     className: 'bg-yellow-100 text-yellow-700' },
  expired: { label: '재로그인 필요', className: 'bg-red-100 text-red-700' },
};

// 밀리초를 "X분 Y초" 형식으로 변환
function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) {
    return `${min}분 ${sec}초`;
  }
  return `${sec}초`;
}

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const {
    accounts,
    selectedAccount,
    setSelectedAccount,
    loadingAccounts,
    addingAccount,
    addAccountStatus,
    showAddAccountModal,
    setShowAddAccountModal,
    newAccountEmail,
    setNewAccountEmail,
    newAccountPassword,
    setNewAccountPassword,
    handleAddAccountAuto,
    handleAddAccountManual,
    handleDeleteAccount,
    setAddAccountStatus,
    fetchAccounts,
    savedCredentials,
    saveCredentialChecked,
    setSaveCredentialChecked,
    fetchCredentials,
    handleSelectCredential,
  } = useTistoryAccounts();

  const {
    loading,
    loadingType,
    previewData,
    setPreviewData,
    publishResult,
    setPublishResult,
    publishProgress,
    formData,
    setFormData,
    handlePreview,
    handlePublish,
    handlePublishFromPreview,
  } = useBlogPublish(selectedAccount);

  // 선택 계정의 쿠키 만료 여부 확인 후 발행 진행
  const confirmIfExpired = (): boolean => {
    const account = accounts.find((a) => a.userEmail === selectedAccount);
    if (!account) return true;
    const freshness = getCookieFreshness(account.savedAt);
    if (freshness === 'expired') {
      return confirm('쿠키가 만료되었을 수 있습니다. 계속 진행하시겠습니까?');
    }
    return true;
  };

  const handlePublishWithCheck = () => {
    if (!confirmIfExpired()) return;
    handlePublish();
  };

  const handlePublishFromPreviewWithCheck = (editedData: PreviewData) => {
    if (!confirmIfExpired()) return;
    handlePublishFromPreview(editedData);
  };

  // 로그인하지 않은 경우 로그인 페이지로 리다이렉트
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // 초기 계정 목록 + 자격증명 목록 로드 (user가 변경될 때만)
  useEffect(() => {
    if (user) {
      fetchAccounts();
      fetchCredentials();
    }
  }, [user, fetchAccounts, fetchCredentials]);

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
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800">{account.userEmail}</p>
                        {(() => {
                          const freshness = getCookieFreshness(account.savedAt);
                          const badge = FRESHNESS_BADGE[freshness];
                          return (
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${badge.className}`}>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </div>
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
        onPublish={handlePublishWithCheck}
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
              {/* 저장된 자격증명 드롭다운 */}
              {savedCredentials.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">저장된 계정 선택</label>
                  <select
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        setNewAccountEmail('');
                        setNewAccountPassword('');
                      } else {
                        handleSelectCredential(value);
                      }
                    }}
                    value={savedCredentials.some((c) => c.userEmail === newAccountEmail) ? newAccountEmail : ''}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white text-slate-800"
                    disabled={addingAccount}
                  >
                    <option value="">+ 새 계정 입력</option>
                    {savedCredentials.map((cred) => (
                      <option key={cred.userEmail} value={cred.userEmail}>
                        {cred.userEmail}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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

              {/* 자격증명 저장 체크박스 */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveCredentialChecked}
                  onChange={(e) => setSaveCredentialChecked(e.target.checked)}
                  className="w-4 h-4 text-orange-500 border-slate-300 rounded focus:ring-orange-500"
                  disabled={addingAccount}
                />
                <span className="text-sm text-slate-600">자격증명 저장 (다음에 드롭다운으로 선택 가능)</span>
              </label>

              <p className="text-xs text-slate-500 text-center">
                2단계 인증을 사용 중이라면 수동 로그인을 이용하세요.
              </p>

              {addAccountStatus && (
                <div className={`p-4 rounded-lg ${
                  addAccountStatus.message.includes('완료')
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : addAccountStatus.liveViewUrl
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                }`}>
                  {/* 프로그레스 바 (step/totalSteps가 있을 때만) */}
                  {addAccountStatus.step != null && addAccountStatus.totalSteps != null && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="relative flex-1 h-2.5 bg-black/10 rounded-full overflow-hidden">
                          <div
                            className="absolute left-0 top-0 h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500"
                            style={{ width: `${Math.round((addAccountStatus.step / addAccountStatus.totalSteps) * 100)}%` }}
                          />
                        </div>
                        <span className="ml-3 text-xs font-bold opacity-70 min-w-[3rem] text-right">
                          {Math.round((addAccountStatus.step / addAccountStatus.totalSteps) * 100)}%
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {/* 진행 중일 때 스피너 */}
                    {addingAccount && (
                      <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    <p className="text-sm font-medium">{addAccountStatus.message}</p>
                  </div>
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
          onPublish={handlePublishFromPreviewWithCheck}
          userEmail={selectedAccount || undefined}
        />
      )}

      {/* 발행 진행 상태 모달 */}
      {publishProgress && (() => {
        // 2FA 메시지 파싱: "2FA_REQUIRED|liveViewUrl|remainingSeconds"
        const is2FA = publishProgress.message.startsWith('2FA_REQUIRED|');
        let twoFAUrl = '';
        let twoFARemaining = 0;
        if (is2FA) {
          const parts = publishProgress.message.split('|');
          twoFAUrl = parts[1] || '';
          twoFARemaining = parseInt(parts[2] || '0', 10);
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
            <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
              <h3 className="text-xl font-bold text-slate-800 text-center mb-6">
                {is2FA ? '2FA 인증 필요' : loadingType === 'preview' ? 'AI 글 생성 중' : '발행 진행 중'}
              </h3>
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="relative flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`absolute left-0 top-0 h-full transition-all duration-500 ${
                        is2FA
                          ? 'bg-gradient-to-r from-yellow-400 to-amber-500'
                          : 'bg-gradient-to-r from-orange-500 to-red-500'
                      }`}
                      style={{
                        width: (() => {
                          if (is2FA) return `${Math.round((twoFARemaining / 120) * 100)}%`;
                          // 시간 기반 프로그레스 (estimatedTotalMs가 있을 때)
                          if (publishProgress.estimatedTotalMs && publishProgress.elapsedMs != null) {
                            const timePercent = Math.min(95, Math.round((publishProgress.elapsedMs / publishProgress.estimatedTotalMs) * 100));
                            return `${timePercent}%`;
                          }
                          // 기존 step 기반 프로그레스
                          return `${Math.round((publishProgress.step / publishProgress.totalSteps) * 100)}%`;
                        })(),
                      }}
                    />
                  </div>
                  <span className="ml-3 text-sm font-bold text-slate-600 min-w-[3rem] text-right">
                    {(() => {
                      if (is2FA) return `${twoFARemaining}초`;
                      if (publishProgress.estimatedTotalMs && publishProgress.elapsedMs != null) {
                        return `${Math.min(95, Math.round((publishProgress.elapsedMs / publishProgress.estimatedTotalMs) * 100))}%`;
                      }
                      return `${Math.round((publishProgress.step / publishProgress.totalSteps) * 100)}%`;
                    })()}
                  </span>
                </div>
              </div>
              <div className="text-center">
                {is2FA ? (
                  <>
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <svg className="h-6 w-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="text-lg font-bold text-amber-600">2FA 인증이 필요합니다!</span>
                    </div>
                    <p className="text-sm text-slate-600 mb-4">
                      {twoFARemaining}초 내에 인증을 완료해주세요.
                      <br />
                      인증 완료 시 자동으로 발행이 계속됩니다.
                    </p>
                    {twoFAUrl && (
                      <a
                        href={twoFAUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        인증하기 (라이브 뷰)
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-orange-500" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span className="text-lg font-medium text-slate-700">{publishProgress.message}</span>
                    </div>
                    {/* 경과시간 / 예상시간 표시 */}
                    <div className="mt-4 space-y-1 text-sm text-slate-500">
                      {publishProgress.elapsedMs != null && (
                        <p>경과: {formatDuration(publishProgress.elapsedMs)}</p>
                      )}
                      {publishProgress.estimatedTotalMs != null && publishProgress.elapsedMs != null ? (
                        <p>
                          예상 남은 시간: ~{formatDuration(Math.max(0, publishProgress.estimatedTotalMs - publishProgress.elapsedMs))}
                        </p>
                      ) : publishProgress.elapsedMs != null ? (
                        <p className="text-slate-400">예상 시간 수집 중...</p>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
