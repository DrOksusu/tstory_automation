'use client';

import type { PublishResult } from '@/types/blog';

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

interface ResultModalProps {
  result: PublishResult;
  onClose: () => void;
}

export default function ResultModal({ result, onClose }: ResultModalProps) {
  // 평균 대비 빠름/느림 계산
  const getDurationComparison = () => {
    if (!result.durationMs || !result.avgDurationMs) return null;
    const diff = result.durationMs - result.avgDurationMs;
    const absDiff = Math.abs(diff);
    if (absDiff < 3000) return { label: '평균 수준', className: 'bg-slate-100 text-slate-600' };
    if (diff < 0) return { label: `${formatDuration(absDiff)} 빠름`, className: 'bg-green-100 text-green-700' };
    return { label: `${formatDuration(absDiff)} 느림`, className: 'bg-yellow-100 text-yellow-700' };
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* 모달 컨텐츠 */}
      <div className="relative min-h-full flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
          {result.success ? (
            <>
              {/* 성공 아이콘 */}
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h3 className="text-xl font-bold text-center text-slate-800 mb-2">
                발행 완료!
              </h3>
              <p className="text-center text-slate-600 mb-6">
                블로그 글이 성공적으로 발행되었습니다.
              </p>

              {/* 발행 정보 */}
              <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-3">
                {result.title && (
                  <div>
                    <span className="text-xs font-medium text-slate-500 uppercase">제목</span>
                    <p className="text-slate-800 font-medium">{result.title}</p>
                  </div>
                )}
                {result.postId && (
                  <div>
                    <span className="text-xs font-medium text-slate-500 uppercase">Post ID</span>
                    <p className="text-slate-800">{result.postId}</p>
                  </div>
                )}
                {result.tistoryUrl && (
                  <div>
                    <span className="text-xs font-medium text-slate-500 uppercase">URL</span>
                    <a
                      href={result.tistoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-600 hover:text-orange-700 underline break-all block"
                    >
                      {result.tistoryUrl}
                    </a>
                  </div>
                )}

                {/* 소요시간 섹션 */}
                {result.durationMs && (
                  <div className="border-t border-slate-200 pt-3">
                    <span className="text-xs font-medium text-slate-500 uppercase">소요시간</span>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-slate-800 font-medium">{formatDuration(result.durationMs)}</p>
                      {(() => {
                        const comparison = getDurationComparison();
                        if (!comparison) return null;
                        return (
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${comparison.className}`}>
                            {comparison.label}
                          </span>
                        );
                      })()}
                    </div>
                    {result.avgDurationMs && (
                      <p className="text-xs text-slate-500 mt-1">
                        평균 소요시간: {formatDuration(result.avgDurationMs)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* 버튼 */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-5 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors"
                >
                  닫기
                </button>
                {result.tistoryUrl && (
                  <a
                    href={result.tistoryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium rounded-xl hover:from-orange-600 hover:to-red-600 transition-all text-center"
                  >
                    글 확인하기
                  </a>
                )}
              </div>
            </>
          ) : (
            <>
              {/* 실패 아이콘 */}
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>

              <h3 className="text-xl font-bold text-center text-slate-800 mb-2">
                발행 실패
              </h3>
              <p className="text-center text-slate-600 mb-4">
                블로그 글 발행 중 오류가 발생했습니다.
              </p>

              {/* 에러 메시지 */}
              {result.error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                  <p className="text-red-700 text-sm">{result.error}</p>
                </div>
              )}

              {/* 버튼 */}
              <button
                onClick={onClose}
                className="w-full px-5 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors"
              >
                닫기
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
