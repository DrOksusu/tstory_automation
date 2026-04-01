'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '@/utils/apiBase';
import type { RecentPost } from '../hooks/useBlogPublish';

interface PromptTemplate {
  id: number;
  name: string;
  content: string;
}

// 디폴트 시스템 프롬프트 (백엔드 geminiService.ts와 동일)
const DEFAULT_SYSTEM_PROMPT = `너는 상위 노출 1%를 만드는 검색엔진 최적화(SEO) 전문가이자 콘텐츠 에디터야. 아래 참고 내용을 바탕으로 검색엔진 최적화된 블로그 글을 HTML 형식으로 작성해줘.

## 작성 규칙

1. 메인 키워드는 '{mainKeyword}'야. 글 서론, 본론, 결론에 총 5회 자연스럽게 삽입해줘.
2. 글자수는 2000자 이상으로 작성해줘.
3. '메타 디스크립션 - 서론 - 목차 - 본론 - 마무리' 구성으로 작성해줘.
4. 본문에 가장 매칭률 높은 제목 1개를 선택해줘. (제목 후보는 5개 생성 후 최적의 1개 선택)
5. 제목에는 '{regionKeyword}' 지역 키워드를 자연스럽게 삽입해줘.
6. 메인 키워드는 수정하지 말고, '치과', '환자', '병원' 같은 상업 키워드는 5회 이하로 사용해줘.
7. 실제 40대 남자 치과의사가 작성한 것처럼 말투를 자연스럽게 작성해줘.`;

interface FormData {
  sourceUrl: string;
  mainKeyword: string;
  regionKeyword: string;
  customTopic: string;
  systemPrompt: string;
  aiModel: 'claude' | 'gemini';
  blogName: string;
}

interface BlogFormProps {
  formData: FormData;
  setFormData: (data: FormData) => void;
  onPreview: () => void;
  onPublish: () => void;
  loading: boolean;
  loadingType: 'preview' | 'publish' | null;
  recentPosts?: RecentPost[];
  blogNames?: string[];
}

export default function BlogForm({
  formData,
  setFormData,
  onPreview,
  onPublish,
  loading,
  loadingType,
  recentPosts = [],
  blogNames = [],
}: BlogFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isCustomBlog, setIsCustomBlog] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('default');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [newPromptName, setNewPromptName] = useState('');

  const fetchPrompts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/blog/prompts`);
      const data = await res.json();
      if (data.success) setPromptTemplates(data.prompts);
    } catch (err) {
      console.error('프롬프트 목록 조회 실패:', err);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const handlePromptSelect = (value: string) => {
    setSelectedPromptId(value);
    if (value === 'default') {
      setFormData({ ...formData, systemPrompt: '' });
    } else {
      const template = promptTemplates.find(t => t.id === Number(value));
      if (template) {
        setFormData({ ...formData, systemPrompt: template.content });
      }
    }
  };

  const handleSavePrompt = async () => {
    if (!newPromptName.trim()) return;
    const content = formData.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    setSavingPrompt(true);
    try {
      const res = await fetch(`${API_BASE}/api/blog/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPromptName.trim(), content }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchPrompts();
        setSelectedPromptId(String(data.prompt.id));
        setNewPromptName('');
        setShowSaveInput(false);
      }
    } catch (err) {
      console.error('프롬프트 저장 실패:', err);
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleDeletePrompt = async () => {
    if (selectedPromptId === 'default') return;
    const template = promptTemplates.find(t => t.id === Number(selectedPromptId));
    if (!template || !confirm(`"${template.name}" 프롬프트를 삭제하시겠습니까?`)) return;
    try {
      await fetch(`${API_BASE}/api/blog/prompts/${selectedPromptId}`, { method: 'DELETE' });
      setSelectedPromptId('default');
      setFormData({ ...formData, systemPrompt: '' });
      await fetchPrompts();
    } catch (err) {
      console.error('프롬프트 삭제 실패:', err);
    }
  };

  // 최근 5개 블로그 (중복 제거)
  const recentBlogNames = blogNames.slice(0, 5);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // 최근 기록 선택 시 폼 자동 채움
  const handleRecentSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const postId = Number(e.target.value);
    if (!postId) return;
    const post = recentPosts.find((p) => p.id === postId);
    if (post) {
      setFormData({
        ...formData,
        sourceUrl: post.sourceUrl,
        mainKeyword: post.mainKeyword,
        regionKeyword: post.regionKeyword,
      });
    }
  };

  // datalist에 추가할 최근 기록의 고유 키워드
  const recentMainKeywords = [...new Set(recentPosts.map((p) => p.mainKeyword))];
  const recentRegionKeywords = [...new Set(recentPosts.map((p) => p.regionKeyword))];
  const defaultMainKeywords = ['임플란트', '치아교정', '라미네이트', '충치치료', '스케일링', '치아미백', '사랑니발치', '신경치료'];
  const defaultRegionKeywords = ['이수역', '사당', '사당동', '방배동', '동작구'];
  const allMainKeywords = [...new Set([...recentMainKeywords, ...defaultMainKeywords])];
  const allRegionKeywords = [...new Set([...recentRegionKeywords, ...defaultRegionKeywords])];

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
      <h3 className="text-lg font-semibold text-slate-800 mb-6">글 작성 정보</h3>

      <div className="space-y-5">
        {/* 최근 작성 기록 드롭다운 */}
        {recentPosts.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              최근 작성 기록
            </label>
            <select
              onChange={handleRecentSelect}
              defaultValue=""
              disabled={loading}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none bg-white text-sm"
            >
              <option value="">최근 기록에서 선택...</option>
              {recentPosts.map((post) => (
                <option key={post.id} value={post.id}>
                  {new Date(post.createdAt).toLocaleDateString('ko-KR')} | {post.mainKeyword} | {post.regionKeyword}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              최근 기록을 선택하면 URL, 키워드가 자동으로 채워집니다
            </p>
          </div>
        )}

        {/* 발행 블로그 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            발행 블로그
          </label>
          <div className="flex items-center gap-2">
            {recentBlogNames.length > 0 && !isCustomBlog ? (
              <select
                value={formData.blogName}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setIsCustomBlog(true);
                    setFormData({ ...formData, blogName: '' });
                  } else {
                    setFormData({ ...formData, blogName: e.target.value });
                  }
                }}
                disabled={loading}
                className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none bg-white text-sm"
              >
                {!formData.blogName && (
                  <option value="">블로그를 선택하세요</option>
                )}
                {recentBlogNames.map((name) => (
                  <option key={name} value={name}>
                    {name}.tistory.com
                  </option>
                ))}
                <option value="__custom__">+ 새 블로그 직접 입력</option>
              </select>
            ) : (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  name="blogName"
                  value={formData.blogName}
                  onChange={handleChange}
                  placeholder="블로그 이름 입력 (예: my-blog)"
                  className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none"
                  disabled={loading}
                  autoFocus={isCustomBlog}
                />
                {isCustomBlog && recentBlogNames.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomBlog(false);
                      setFormData({ ...formData, blogName: recentBlogNames[0] });
                    }}
                    className="text-xs text-slate-500 hover:text-orange-500 whitespace-nowrap"
                  >
                    목록으로
                  </button>
                )}
              </div>
            )}
            {(isCustomBlog || recentBlogNames.length === 0) && (
              <span className="text-sm text-slate-500 whitespace-nowrap">.tistory.com</span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {recentBlogNames.length > 0
              ? '최근 사용한 블로그가 자동 선택됩니다. 새 블로그는 직접 입력할 수 있습니다.'
              : '글을 발행할 티스토리 블로그 이름을 입력하세요'}
          </p>
        </div>

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
              list="mainKeywordList"
              value={formData.mainKeyword}
              onChange={handleChange}
              placeholder="예: 임플란트 수술"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none"
              disabled={loading}
            />
            <datalist id="mainKeywordList">
              {allMainKeywords.map((kw) => (
                <option key={kw} value={kw} />
              ))}
            </datalist>
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
              list="regionKeywordList"
              value={formData.regionKeyword}
              onChange={handleChange}
              placeholder="예: 이수역"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none"
              disabled={loading}
            />
            <datalist id="regionKeywordList">
              {allRegionKeywords.map((kw) => (
                <option key={kw} value={kw} />
              ))}
            </datalist>
            <p className="mt-1.5 text-xs text-slate-500">
              제목에 포함될 지역 키워드
            </p>
          </div>
        </div>

        {/* 핵심 주제 (선택) */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            핵심 주제 <span className="text-slate-400 font-normal">(선택)</span>
          </label>
          <textarea
            name="customTopic"
            value={formData.customTopic}
            onChange={handleChange}
            placeholder="예: 임플란트 시술 후 관리법을 중심으로, 환자가 자주 묻는 질문 Q&A 형태로 작성해주세요"
            rows={2}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none resize-none"
            disabled={loading}
          />
          <p className="mt-1.5 text-xs text-slate-500">
            AI가 글에 반영할 핵심 주제나 강조점을 자유롭게 입력하세요
          </p>
        </div>

        {/* AI 모델 선택 */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700 whitespace-nowrap">
            AI 모델
          </label>
          <select
            name="aiModel"
            value={formData.aiModel}
            onChange={handleChange}
            disabled={loading}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none bg-white"
          >
            <option value="claude">Claude (기본)</option>
            <option value="gemini">Gemini</option>
          </select>
        </div>

        {/* 고급 설정 (시스템 프롬프트) */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700"
          >
            <span>고급 설정 (시스템 프롬프트)</span>
            <svg
              className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showAdvanced && (
            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-500">
                AI에게 전달할 프롬프트를 선택하거나 수정할 수 있습니다.
                <code className="text-orange-600 ml-1">{'{mainKeyword}'}</code>, <code className="text-orange-600">{'{regionKeyword}'}</code> 플레이스홀더는 실제 키워드로 자동 치환됩니다.
              </p>

              {/* 프롬프트 드롭다운 */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedPromptId}
                  onChange={(e) => handlePromptSelect(e.target.value)}
                  disabled={loading}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none bg-white"
                >
                  <option value="default">기본 프롬프트</option>
                  {promptTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {selectedPromptId !== 'default' && (
                  <button
                    type="button"
                    onClick={handleDeletePrompt}
                    className="px-2 py-2 text-red-400 hover:text-red-600 transition-colors"
                    title="선택된 프롬프트 삭제"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>

              <textarea
                name="systemPrompt"
                value={formData.systemPrompt || DEFAULT_SYSTEM_PROMPT}
                onChange={(e) => {
                  const value = e.target.value === DEFAULT_SYSTEM_PROMPT ? '' : e.target.value;
                  setFormData({ ...formData, systemPrompt: value });
                  setSelectedPromptId('default');
                }}
                rows={10}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none resize-y text-sm font-mono leading-relaxed"
                disabled={loading}
              />

              {/* 저장/초기화 버튼 */}
              <div className="flex items-center gap-2 flex-wrap">
                {formData.systemPrompt && (
                  <button
                    type="button"
                    onClick={() => { setFormData({ ...formData, systemPrompt: '' }); setSelectedPromptId('default'); }}
                    className="text-xs text-orange-500 hover:text-orange-700 font-medium"
                  >
                    기본 프롬프트로 초기화
                  </button>
                )}
                {showSaveInput ? (
                  <div className="flex items-center gap-2 ml-auto">
                    <input
                      type="text"
                      value={newPromptName}
                      onChange={(e) => setNewPromptName(e.target.value)}
                      placeholder="프롬프트 이름"
                      className="px-2 py-1 border border-slate-300 rounded text-xs w-36 focus:ring-1 focus:ring-orange-500 outline-none"
                      onKeyDown={(e) => e.key === 'Enter' && handleSavePrompt()}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSavePrompt}
                      disabled={savingPrompt || !newPromptName.trim()}
                      className="text-xs bg-orange-500 text-white px-2 py-1 rounded hover:bg-orange-600 disabled:opacity-50"
                    >
                      {savingPrompt ? '저장 중...' : '저장'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowSaveInput(false); setNewPromptName(''); }}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSaveInput(true)}
                    className="text-xs text-blue-500 hover:text-blue-700 font-medium ml-auto"
                  >
                    현재 프롬프트 저장
                  </button>
                )}
              </div>
            </div>
          )}
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
