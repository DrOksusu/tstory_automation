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
