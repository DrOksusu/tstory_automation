'use client';

interface FormData {
  sourceUrl: string;
  mainKeyword: string;
  regionKeyword: string;
}

interface BlogFormProps {
  formData: FormData;
  setFormData: (data: FormData) => void;
  onPreview: () => void;
  onPublish: () => void;
  loading: boolean;
  loadingType: 'preview' | 'publish' | null;
}

export default function BlogForm({
  formData,
  setFormData,
  onPreview,
  onPublish,
  loading,
  loadingType,
}: BlogFormProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
      <h3 className="text-lg font-semibold text-slate-800 mb-6">글 작성 정보</h3>

      <div className="space-y-5">
        {/* 참고 URL */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            참고 URL
          </label>
          <input
            type="url"
            name="sourceUrl"
            value={formData.sourceUrl}
            onChange={handleChange}
            placeholder="https://blog.naver.com/..."
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none"
            disabled={loading}
          />
          <p className="mt-1.5 text-xs text-slate-500">
            참고할 블로그 글 URL을 입력하세요 (네이버 블로그 지원)
          </p>
        </div>

        {/* 키워드 입력 */}
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              메인 키워드
            </label>
            <input
              type="text"
              name="mainKeyword"
              value={formData.mainKeyword}
              onChange={handleChange}
              placeholder="예: 임플란트 수술"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none"
              disabled={loading}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              글 본문에 자연스럽게 삽입될 메인 키워드
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              지역 키워드
            </label>
            <input
              type="text"
              name="regionKeyword"
              value={formData.regionKeyword}
              onChange={handleChange}
              placeholder="예: 이수역"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none"
              disabled={loading}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              제목에 포함될 지역 키워드
            </p>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={onPreview}
            disabled={loading}
            className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {loadingType === 'preview' ? (
              <>
                <LoadingSpinner />
                <span>AI 글 생성 중...</span>
              </>
            ) : (
              <>
                <EyeIcon />
                <span>미리보기</span>
              </>
            )}
          </button>

          <button
            onClick={onPublish}
            disabled={loading}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium rounded-xl hover:from-orange-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25"
          >
            {loadingType === 'publish' ? (
              <>
                <LoadingSpinner />
                <span>발행 중...</span>
              </>
            ) : (
              <>
                <PublishIcon />
                <span>바로 발행</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function PublishIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
  );
}
