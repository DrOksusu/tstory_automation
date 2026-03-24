// 블로그 관련 타입 정의

export interface PreviewData {
  title: string;
  metaDescription: string;
  content: string;
}

export interface PublishResult {
  success: boolean;
  postId?: number;
  tistoryUrl?: string;
  title?: string;
  error?: string;
}

export interface TistoryAccount {
  userEmail: string;
  savedAt: string;
}

export interface PublishProgress {
  status: string;
  message: string;
  step: number;
  totalSteps: number;
  elapsedMs?: number;
  estimatedTotalMs?: number | null;
}

export interface AddAccountStatus {
  message: string;
  liveViewUrl?: string;
  step?: number;
  totalSteps?: number;
}

export interface SavedCredential {
  userEmail: string;
  savedAt: string;
}
