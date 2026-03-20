// API 응답 안전 파싱 유틸리티

export async function safeJsonParse(response: Response): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    return { ok: false, error: text || response.statusText || 'Server error' };
  }
  try {
    const data = await response.json();
    return { ok: response.ok, data, error: response.ok ? undefined : (data?.error || data?.message || 'Request failed') };
  } catch {
    return { ok: false, error: 'Invalid JSON response' };
  }
}
