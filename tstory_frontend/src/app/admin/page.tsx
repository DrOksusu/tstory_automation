'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { ErrorLog, ErrorStats, Pagination } from '@/types/admin';

export default function AdminPage() {
  const { user, isAdmin, isLoading } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<ErrorStats | null>(null);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // 비관리자 리다이렉트
  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      router.push('/');
    }
  }, [user, isAdmin, isLoading, router]);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/admin/errors/stats?email=${encodeURIComponent(user.email)}`);
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch (err) {
      console.error('통계 조회 실패:', err);
    }
  }, [user]);

  const fetchErrors = useCallback(async (page: number = 1) => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        email: user.email,
        page: String(page),
        limit: '20',
      });
      if (statusFilter) params.set('statusCode', statusFilter);

      const res = await fetch(`/api/admin/errors?${params}`);
      const data = await res.json();
      if (data.success) {
        setErrors(data.errors);
        setPagination(data.pagination);
      }
    } catch (err) {
      console.error('에러 로그 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [user, statusFilter]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchStats();
      fetchErrors(1);
    }
  }, [user, isAdmin, fetchStats, fetchErrors]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-slate-500">로딩 중...</div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-xl font-bold text-red-500 mb-2">접근 권한 없음</p>
          <p className="text-slate-500">관리자만 접근할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  };

  const statusBadge = (code: number) => {
    if (code >= 500) return 'bg-red-100 text-red-700';
    if (code >= 400) return 'bg-yellow-100 text-yellow-700';
    return 'bg-blue-100 text-blue-700';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">에러 로그 대시보드</h2>

      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="전체 에러" value={stats.total} color="slate" />
          <StatCard label="오늘 에러" value={stats.today} color="orange" />
          <StatCard label="최근 7일" value={stats.week} color="blue" />
          <StatCard label="500 에러" value={stats.status500} color="red" />
        </div>
      )}

      {/* 필터 */}
      <div className="flex items-center gap-4 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        >
          <option value="">전체 상태코드</option>
          <option value="400">400</option>
          <option value="401">401</option>
          <option value="403">403</option>
          <option value="404">404</option>
          <option value="500">500</option>
        </select>
        <button
          onClick={() => { fetchStats(); fetchErrors(1); }}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm transition-colors"
        >
          새로고침
        </button>
      </div>

      {/* 에러 목록 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">시간</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">사용자</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">엔드포인트</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">상태</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">에러 메시지</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">로딩 중...</td>
                </tr>
              ) : errors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">에러 로그가 없습니다.</td>
                </tr>
              ) : (
                errors.map((err) => (
                  <tr
                    key={err.id}
                    onClick={() => setSelectedError(selectedError?.id === err.id ? null : err)}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDate(err.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-600">{err.userEmail || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      <span className="text-slate-400 mr-1">{err.method}</span>
                      {err.endpoint}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(err.statusCode)}`}>
                        {err.statusCode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{err.errorMessage}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 선택된 에러 상세 */}
        {selectedError && (
          <div className="border-t border-slate-200 bg-slate-50 p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-slate-700">에러 상세 (#{selectedError.id})</h3>
              <button
                onClick={() => setSelectedError(null)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                닫기
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">에러 메시지</p>
                <p className="text-sm text-slate-700 bg-white p-2 rounded border border-slate-200">{selectedError.errorMessage}</p>
              </div>
              {selectedError.errorStack && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">스택 트레이스</p>
                  <pre className="text-xs text-slate-600 bg-white p-2 rounded border border-slate-200 overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {selectedError.errorStack}
                  </pre>
                </div>
              )}
              {selectedError.requestBody && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">요청 Body</p>
                  <pre className="text-xs text-slate-600 bg-white p-2 rounded border border-slate-200 overflow-x-auto max-h-32 whitespace-pre-wrap">
                    {JSON.stringify(JSON.parse(selectedError.requestBody), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => fetchErrors(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
          >
            이전
          </button>
          <span className="text-sm text-slate-600">
            {pagination.page} / {pagination.totalPages} 페이지 (총 {pagination.total}건)
          </span>
          <button
            onClick={() => fetchErrors(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            className="px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    slate: 'bg-slate-50 border-slate-200 text-slate-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    red: 'bg-red-50 border-red-200 text-red-800',
  };

  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <p className="text-sm opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}
