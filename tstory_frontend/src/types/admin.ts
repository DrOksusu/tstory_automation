export interface ErrorLog {
  id: number;
  endpoint: string;
  method: string;
  statusCode: number;
  errorMessage: string;
  errorStack: string | null;
  userEmail: string | null;
  requestBody: string | null;
  createdAt: string;
}

export interface ErrorStats {
  total: number;
  today: number;
  week: number;
  status500: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ProcessLog {
  id: number;
  sessionId: string;
  source: string;
  level: string;
  message: string;
  userEmail: string | null;
  metadata: string | null;
  createdAt: string;
}

export interface ProcessLogSession {
  sessionId: string;
  source: string;
  userEmail: string | null;
  logCount: number;
  errorCount: number;
  startedAt: string;
  endedAt: string;
  lastMessage: string;
}
