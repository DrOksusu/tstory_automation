'use client';

import { useState, useEffect } from 'react';

interface ScheduledPost {
  id: number;
  title: string;
  userEmail: string;
  scheduledAt: string;
  status: string;
  errorMessage: string | null;
  tistoryUrl: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  scheduled: { label: '대기', color: 'bg-yellow-100 text-yellow-700' },
  publishing: { label: '발행중', color: 'bg-orange-100 text-orange-700' },
  published: { label: '완료', color: 'bg-green-100 text-green-700' },
  failed: { label: '실패', color: 'bg-red-100 text-red-700' },
  cancelled: { label: '취소', color: 'bg-slate-100 text-slate-500' },
};

export default function SchedulePage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

  const fetchSchedules = async () => {
    try {
      const res = await fetch(`${API_URL}/api/blog/schedule`);
      const data = await res.json();
      if (data.success) {
        setPosts(data.data);
      }
    } catch (error) {
      console.error('예약 목록 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const handleCancel = async (id: number) => {
    if (!confirm('이 예약을 취소하시겠습니까?')) return;

    try {
      const res = await fetch(`${API_URL}/api/blog/schedule/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchSchedules();
      } else {
        alert(`취소 실패: ${data.error}`);
      }
    } catch (error) {
      alert('예약 취소 중 오류가 발생했습니다.');
    }
  };

  const handleUpdateTime = async (id: number) => {
    if (!editDate) return;

    try {
      const res = await fetch(`${API_URL}/api/blog/schedule/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: new Date(editDate).toISOString() }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingId(null);
        setEditDate('');
        fetchSchedules();
      } else {
        alert(`변경 실패: ${data.error}`);
      }
    } catch (error) {
      alert('시간 변경 중 오류가 발생했습니다.');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">예약 관리</h2>
        <button
          onClick={() => { setLoading(true); fetchSchedules(); }}
          className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
        >
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg">예약된 글이 없습니다.</p>
          <p className="text-sm mt-1">미리보기에서 "예약 발행" 버튼으로 예약할 수 있습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const statusInfo = STATUS_CONFIG[post.status] || { label: post.status, color: 'bg-slate-100 text-slate-500' };

            return (
              <div key={post.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <h3 className="text-base font-semibold text-slate-800 truncate">{post.title}</h3>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      <span>예약: {formatDate(post.scheduledAt)}</span>
                      <span>계정: {post.userEmail}</span>
                    </div>
                    {post.status === 'failed' && post.errorMessage && (
                      <p className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">
                        {post.errorMessage}
                      </p>
                    )}
                    {editingId === post.id && (
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="datetime-local"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          min={new Date().toISOString().slice(0, 16)}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
                        />
                        <button
                          onClick={() => handleUpdateTime(post.id)}
                          className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditDate(''); }}
                          className="px-3 py-1.5 text-slate-500 text-sm hover:bg-slate-100 rounded-lg"
                        >
                          취소
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {post.status === 'scheduled' && (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(post.id);
                            setEditDate(new Date(post.scheduledAt).toISOString().slice(0, 16));
                          }}
                          className="px-3 py-1.5 text-sm border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50"
                        >
                          시간변경
                        </button>
                        <button
                          onClick={() => handleCancel(post.id)}
                          className="px-3 py-1.5 text-sm border border-red-200 text-red-500 rounded-lg hover:bg-red-50"
                        >
                          취소
                        </button>
                      </>
                    )}
                    {post.status === 'published' && post.tistoryUrl && (
                      <a
                        href={post.tistoryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-sm bg-green-50 text-green-600 rounded-lg hover:bg-green-100"
                      >
                        티스토리에서 보기
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
