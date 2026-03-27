// 블로그 미리보기/발행 관련 훅

import { useState, useEffect } from 'react';
import { safeJsonParse } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import type { PreviewData, PublishResult, PublishProgress } from '../types/blog';
// PreviewData는 폴링 결과에서도 사용됨

export interface RecentPost {
  id: number;
  sourceUrl: string;
  mainKeyword: string;
  regionKeyword: string;
  createdAt: string;
}

export function useBlogPublish(selectedAccount: string | null) {
  const { user } = useAuth();
  const ownerEmail = user?.email;
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<'preview' | 'publish' | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [publishProgress, setPublishProgress] = useState<PublishProgress | null>(null);
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);
  const [formData, setFormData] = useState({
    sourceUrl: '',
    mainKeyword: '',
    regionKeyword: '',
    customTopic: '',
    systemPrompt: '',
    aiModel: 'claude' as 'claude' | 'gemini',
  });

  // 마운트 시 최근 글 목록 로드 + 기본값 설정
  useEffect(() => {
    const fetchRecentPosts = async () => {
      try {
        const response = await fetch('/api/blog/posts');
        const data = await response.json();
        if (data.success && Array.isArray(data.posts)) {
          const recent: RecentPost[] = data.posts.slice(0, 10).map((p: RecentPost) => ({
            id: p.id,
            sourceUrl: p.sourceUrl,
            mainKeyword: p.mainKeyword,
            regionKeyword: p.regionKeyword,
            createdAt: p.createdAt,
          }));
          setRecentPosts(recent);
          // 가장 최근 기록으로 기본값 채움
          if (recent.length > 0) {
            const latest = recent[0];
            setFormData((prev) => ({
              ...prev,
              mainKeyword: latest.mainKeyword,
              regionKeyword: latest.regionKeyword,
            }));
          }
        }
      } catch (error) {
        console.error('최근 글 목록 로드 실패:', error);
      }
    };
    fetchRecentPosts();
  }, []);

  // 미리보기 요청 (폴링 방식)
  const handlePreview = async () => {
    if (!formData.sourceUrl || !formData.mainKeyword || !formData.regionKeyword) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    setLoading(true);
    setLoadingType('preview');
    setPublishProgress({ status: 'pending', message: '미리보기 준비 중...', step: 1, totalSteps: 4 });

    try {
      // 평균 소요시간 사전 조회
      const { avgDurationMs, sampleCount } = await fetchAvgDuration('preview');
      const estimatedTotalMs = sampleCount >= 3 ? avgDurationMs : null;

      const startResponse = await fetch('/api/blog/start-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, aiModel: formData.aiModel }),
      });

      const startResult = await safeJsonParse(startResponse);
      if (!startResult.ok || !startResult.data) {
        throw new Error(startResult.error || '미리보기 시작에 실패했습니다.');
      }

      const startData = startResult.data as { taskId?: string };
      const { taskId } = startData;

      if (!taskId) {
        throw new Error('작업 ID를 받지 못했습니다.');
      }

      const maxPollingTime = 300000;
      const pollingInterval = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxPollingTime) {
        await new Promise((resolve) => setTimeout(resolve, pollingInterval));

        const statusResponse = await fetch(`/api/blog/status/${taskId}`);
        const statusResult = await safeJsonParse(statusResponse);
        if (!statusResult.ok || !statusResult.data) {
          console.error('Status polling error:', statusResult.error);
          continue;
        }
        const statusData = statusResult.data as {
          status: string; message: string; step?: number; totalSteps?: number;
          completed?: boolean; success?: boolean; previewResult?: PreviewData;
          error?: string; elapsedMs?: number;
        };

        setPublishProgress({
          status: statusData.status,
          message: statusData.message,
          step: statusData.step ?? 1,
          totalSteps: statusData.totalSteps ?? 4,
          elapsedMs: statusData.elapsedMs,
          estimatedTotalMs,
        });

        if (statusData.completed) {
          setPublishProgress(null);
          if (statusData.success && statusData.previewResult) {
            setPreviewData(statusData.previewResult);
          } else {
            alert(`미리보기 실패: ${statusData.error || statusData.message}`);
          }
          return;
        }
      }

      setPublishProgress(null);
      alert('미리보기 시간 초과 (5분).');
    } catch (error) {
      let message = '서버 연결에 실패했습니다.';
      if (error instanceof Error) {
        message = error.message;
      }
      setPublishProgress(null);
      alert(message);
      console.error(error);
    } finally {
      setLoading(false);
      setLoadingType(null);
    }
  };

  // 발행 상태에 따른 스텝 계산
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

  // 평균 소요시간 가져오기
  const fetchAvgDuration = async (type?: 'preview' | 'publish'): Promise<{ avgDurationMs: number | null; sampleCount: number }> => {
    try {
      const query = type ? `?type=${type}` : '';
      const response = await fetch(`/api/blog/avg-duration${query}`);
      const data = await response.json();
      if (data.success) {
        return { avgDurationMs: data.avgDurationMs, sampleCount: data.sampleCount };
      }
    } catch (error) {
      console.error('Failed to fetch avg duration:', error);
    }
    return { avgDurationMs: null, sampleCount: 0 };
  };

  // 직접 발행 (미리보기 없이)
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
      // 평균 소요시간 사전 조회
      const { avgDurationMs, sampleCount } = await fetchAvgDuration();
      const estimatedTotalMs = sampleCount >= 3 ? avgDurationMs : null;

      const startResponse = await fetch('/api/blog/start-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, aiModel: formData.aiModel, userEmail: selectedAccount, ownerEmail }),
      });

      const startResult = await safeJsonParse(startResponse);
      if (!startResult.ok || !startResult.data) {
        throw new Error(startResult.error || '발행 시작에 실패했습니다.');
      }

      const startData = startResult.data as { taskId?: string };
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
        const statusResult = await safeJsonParse(statusResponse);
        if (!statusResult.ok || !statusResult.data) {
          console.error('Status polling error:', statusResult.error);
          continue;
        }
        const statusData = statusResult.data as { status: string; message: string; step?: number; totalSteps?: number; completed?: boolean; success?: boolean; result?: PublishResult; error?: string; elapsedMs?: number; durationMs?: number };

        const fallback = getStepFromStatus(statusData.status);
        setPublishProgress({
          status: statusData.status,
          message: statusData.message,
          step: statusData.step ?? fallback.step,
          totalSteps: statusData.totalSteps ?? fallback.totalSteps,
          elapsedMs: statusData.elapsedMs,
          estimatedTotalMs,
        });

        if (statusData.completed) {
          setPublishProgress(null);
          if (statusData.success && statusData.result) {
            setPublishResult({
              ...statusData.result,
              durationMs: statusData.result.durationMs ?? statusData.durationMs,
              avgDurationMs: avgDurationMs,
            });
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

  // 미리보기에서 발행
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
      // 평균 소요시간 사전 조회
      const { avgDurationMs, sampleCount } = await fetchAvgDuration();
      const estimatedTotalMs = sampleCount >= 3 ? avgDurationMs : null;

      const startResponse = await fetch('/api/blog/publish-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editedData.title,
          content: editedData.content,
          metaDescription: editedData.metaDescription,
          userEmail: selectedAccount,
          ownerEmail,
        }),
      });

      const startResult = await safeJsonParse(startResponse);
      if (!startResult.ok || !startResult.data) {
        throw new Error(startResult.error || '발행 시작에 실패했습니다.');
      }

      const startData = startResult.data as { taskId?: string };
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
        const statusResult = await safeJsonParse(statusResponse);
        if (!statusResult.ok || !statusResult.data) {
          console.error('Status polling error:', statusResult.error);
          continue;
        }
        const statusData = statusResult.data as { status: string; message: string; step?: number; totalSteps?: number; completed?: boolean; success?: boolean; result?: PublishResult; error?: string; elapsedMs?: number; durationMs?: number };

        const previewFallbackSteps: Record<string, number> = { 'pending': 1, 'publishing': 2, 'success': 3, 'failed': 3 };
        setPublishProgress({
          status: statusData.status,
          message: statusData.message,
          step: statusData.step ?? (previewFallbackSteps[statusData.status] || 1),
          totalSteps: statusData.totalSteps ?? 3,
          elapsedMs: statusData.elapsedMs,
          estimatedTotalMs,
        });

        if (statusData.completed) {
          setPublishProgress(null);
          if (statusData.success && statusData.result) {
            setPublishResult({
              ...statusData.result,
              durationMs: statusData.result.durationMs ?? statusData.durationMs,
              avgDurationMs: avgDurationMs,
            });
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

  return {
    loading,
    loadingType,
    previewData,
    setPreviewData,
    publishResult,
    setPublishResult,
    publishProgress,
    formData,
    setFormData,
    recentPosts,
    handlePreview,
    handlePublish,
    handlePublishFromPreview,
  };
}
