// 블로그 미리보기/발행 관련 훅

import { useState } from 'react';
import { safeJsonParse } from '../utils/api';
import type { PreviewData, PublishResult, PublishProgress } from '../types/blog';

export function useBlogPublish(selectedAccount: string | null) {
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

  // 미리보기 요청
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
      const startResponse = await fetch('/api/blog/start-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, userEmail: selectedAccount }),
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
        const statusData = statusResult.data as { status: string; message: string; step?: number; totalSteps?: number; completed?: boolean; success?: boolean; result?: PublishResult; error?: string };

        const fallback = getStepFromStatus(statusData.status);
        setPublishProgress({
          status: statusData.status,
          message: statusData.message,
          step: statusData.step ?? fallback.step,
          totalSteps: statusData.totalSteps ?? fallback.totalSteps,
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
        const statusData = statusResult.data as { status: string; message: string; step?: number; totalSteps?: number; completed?: boolean; success?: boolean; result?: PublishResult; error?: string };

        const previewFallbackSteps: Record<string, number> = { 'pending': 1, 'publishing': 2, 'success': 3, 'failed': 3 };
        setPublishProgress({
          status: statusData.status,
          message: statusData.message,
          step: statusData.step ?? (previewFallbackSteps[statusData.status] || 1),
          totalSteps: statusData.totalSteps ?? 3,
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
    handlePreview,
    handlePublish,
    handlePublishFromPreview,
  };
}
