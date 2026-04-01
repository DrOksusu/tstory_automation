'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { ErrorLog, ErrorStats, Pagination, ProcessLog, ProcessLogSession } from '@/types/admin';

type TabType = 'errors' | 'process';

export default function AdminPage() {
  const { user, isAdmin, isLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('errors');

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      router.push('/');
    }
  }, [user, isAdmin, isLoading, router]);

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">관리자 대시보드</h2>

      {/* 탭 */}
      <div className="flex border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('errors')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'errors'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          에러 로그
        </button>
        <button
          onClick={() => setActiveTab('process')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'process'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          프로세스 로그
        </button>
      </div>

      {activeTab === 'errors' && <ErrorLogTab email={user.email} />}
      {activeTab === 'process' && <ProcessLogTab email={user.email} />}
    </div>
  );
}

// ==================== 에러 로그 탭 ====================
function ErrorLogTab({ email }: { email: string }) {
  const [stats, setStats] = useState<ErrorStats | null>(null);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/errors/stats?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch (err) {
      console.error('통계 조회 실패:', err);
    }
  }, [email]);

  const fetchErrors = useCallback(async (page: number = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ email, page: String(page), limit: '20' });
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
  }, [email, statusFilter]);

  useEffect(() => {
    fetchStats();
    fetchErrors(1);
  }, [fetchStats, fetchErrors]);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

  const statusBadge = (code: number) => {
    if (code >= 500) return 'bg-red-100 text-red-700';
    if (code >= 400) return 'bg-yellow-100 text-yellow-700';
    return 'bg-blue-100 text-blue-700';
  };

  return (
    <>
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="전체 에러" value={stats.total} color="slate" />
          <StatCard label="오늘 에러" value={stats.today} color="orange" />
          <StatCard label="최근 7일" value={stats.week} color="blue" />
          <StatCard label="500 에러" value={stats.status500} color="red" />
        </div>
      )}

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
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">로딩 중...</td></tr>
              ) : errors.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">에러 로그가 없습니다.</td></tr>
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
                      <span className="text-slate-400 mr-1">{err.method}</span>{err.endpoint}
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

        {selectedError && (
          <div className="border-t border-slate-200 bg-slate-50 p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-slate-700">에러 상세 (#{selectedError.id})</h3>
              <button onClick={() => setSelectedError(null)} className="text-slate-400 hover:text-slate-600 text-sm">닫기</button>
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

      {pagination.totalPages > 1 && (
        <PaginationControls pagination={pagination} onPageChange={fetchErrors} />
      )}
    </>
  );
}

// ==================== 프로세스 로그 탭 ====================
function ProcessLogTab({ email }: { email: string }) {
  const [sessions, setSessions] = useState<ProcessLogSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionLogs, setSessionLogs] = useState<ProcessLog[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ email, limit: '30' });
      if (sourceFilter) params.set('source', sourceFilter);
      const res = await fetch(`/api/admin/process-logs/sessions?${params}`);
      const data = await res.json();
      if (data.success) setSessions(data.sessions);
    } catch (err) {
      console.error('세션 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [email, sourceFilter]);

  const fetchSessionLogs = useCallback(async (sessionId: string) => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/admin/process-logs/session/${sessionId}?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data.success) {
        setSessionLogs(data.logs);
        setSelectedSessionId(sessionId);
      }
    } catch (err) {
      console.error('세션 로그 조회 실패:', err);
    } finally {
      setLogsLoading(false);
    }
  }, [email]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

  const sourceLabel: Record<string, { text: string; color: string }> = {
    auth: { text: '로그인', color: 'bg-blue-100 text-blue-700' },
    publish: { text: '발행', color: 'bg-green-100 text-green-700' },
    cookie: { text: '쿠키', color: 'bg-purple-100 text-purple-700' },
  };

  const levelColor: Record<string, string> = {
    info: 'text-slate-600',
    warn: 'text-amber-600',
    error: 'text-red-600 font-medium',
  };

  return (
    <>
      {/* 필터 */}
      <div className="flex items-center gap-4 mb-4">
        <select
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value); setSelectedSessionId(null); }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        >
          <option value="">전체 소스</option>
          <option value="auth">로그인</option>
          <option value="publish">발행</option>
          <option value="cookie">쿠키 갱신</option>
        </select>
        <button
          onClick={() => { fetchSessions(); setSelectedSessionId(null); }}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm transition-colors"
        >
          새로고침
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 세션 목록 (왼쪽) */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <h3 className="font-medium text-slate-700 text-sm">최근 세션</h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="text-center py-8 text-slate-400 text-sm">로딩 중...</div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">프로세스 로그가 없습니다.</div>
              ) : (
                sessions.map((s) => {
                  const src = sourceLabel[s.source] || { text: s.source, color: 'bg-slate-100 text-slate-700' };
                  return (
                    <button
                      key={s.sessionId}
                      onClick={() => fetchSessionLogs(s.sessionId)}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                        selectedSessionId === s.sessionId ? 'bg-orange-50 border-l-2 border-orange-400' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${src.color}`}>{src.text}</span>
                        {s.errorCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                            {s.errorCount}
                          </span>
                        )}
                        <span className="text-xs text-slate-400 ml-auto">{s.logCount}건</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{s.userEmail || '-'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{formatDate(s.startedAt)}</p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{s.lastMessage}</p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 세션 상세 로그 (오른쪽) */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-medium text-slate-700 text-sm">
                {selectedSessionId ? `세션 로그 (${sessionLogs.length}건)` : '세션을 선택하세요'}
              </h3>
              {selectedSessionId && (
                <span className="text-xs text-slate-400 font-mono">{selectedSessionId}</span>
              )}
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {!selectedSessionId ? (
                <div className="text-center py-16 text-slate-400 text-sm">
                  왼쪽 세션 목록에서 세션을 클릭하면 상세 로그가 표시됩니다.
                </div>
              ) : logsLoading ? (
                <div className="text-center py-8 text-slate-400 text-sm">로딩 중...</div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {sessionLogs.map((log) => (
                    <div key={log.id} className="px-4 py-2 hover:bg-slate-50">
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-slate-400 whitespace-nowrap mt-0.5 min-w-[60px]">
                          {new Date(log.createdAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })}
                        </span>
                        <LevelBadge level={log.level} />
                        <p className={`text-sm break-all ${levelColor[log.level] || 'text-slate-600'}`}>
                          {log.message}
                        </p>
                      </div>
                      {log.metadata && (
                        <pre className="text-xs text-slate-400 mt-1 ml-[76px] bg-slate-50 p-1 rounded overflow-x-auto">
                          {JSON.stringify(JSON.parse(log.metadata), null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ==================== 공통 컴포넌트 ====================
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

function LevelBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    info: 'bg-slate-100 text-slate-500',
    warn: 'bg-amber-100 text-amber-600',
    error: 'bg-red-100 text-red-600',
  };

  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium min-w-[36px] text-center ${styles[level] || styles.info}`}>
      {level.toUpperCase()}
    </span>
  );
}

function PaginationControls({ pagination, onPageChange }: { pagination: Pagination; onPageChange: (page: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <button
        onClick={() => onPageChange(pagination.page - 1)}
        disabled={pagination.page <= 1}
        className="px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
      >
        이전
      </button>
      <span className="text-sm text-slate-600">
        {pagination.page} / {pagination.totalPages} 페이지 (총 {pagination.total}건)
      </span>
      <button
        onClick={() => onPageChange(pagination.page + 1)}
        disabled={pagination.page >= pagination.totalPages}
        className="px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
      >
        다음
      </button>
    </div>
  );
}
