'use client';

import { useState, useRef } from 'react';

interface PreviewData {
  title: string;
  metaDescription: string;
  content: string;
}

interface PreviewModalProps {
  data: PreviewData;
  onClose: () => void;
  onPublish: (editedData: PreviewData) => void;
}

export default function PreviewModal({ data, onClose, onPublish }: PreviewModalProps) {
  const [editedData, setEditedData] = useState<PreviewData>({
    title: data.title,
    metaDescription: data.metaDescription,
    content: data.content,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [showImageInput, setShowImageInput] = useState(false);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  const handlePublishClick = () => {
    onPublish(editedData);
  };

  const handleInsertImage = () => {
    if (!imageUrl.trim()) {
      alert('이미지 URL을 입력해주세요.');
      return;
    }

    const imgTag = `<figure class="imageblock alignCenter">
  <img src="${imageUrl.trim()}" alt="${imageAlt.trim() || '이미지'}" style="max-width: 100%; height: auto;">
  ${imageAlt.trim() ? `<figcaption>${imageAlt.trim()}</figcaption>` : ''}
</figure>\n\n`;

    const textarea = contentTextareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent =
        editedData.content.substring(0, start) +
        imgTag +
        editedData.content.substring(end);

      setEditedData({ ...editedData, content: newContent });

      // 커서 위치 조정
      setTimeout(() => {
        textarea.focus();
        const newPosition = start + imgTag.length;
        textarea.setSelectionRange(newPosition, newPosition);
      }, 0);
    } else {
      // textarea가 없으면 맨 끝에 추가
      setEditedData({
        ...editedData,
        content: editedData.content + '\n\n' + imgTag
      });
    }

    // 입력 필드 초기화
    setImageUrl('');
    setImageAlt('');
    setShowImageInput(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* 모달 컨텐츠 */}
      <div className="relative min-h-full flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
          {/* 헤더 */}
          <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">
                {isEditing ? '글 편집' : '미리보기'}
              </h3>
              <p className="text-sm text-slate-500">
                {isEditing ? '제목과 본문을 수정한 후 발행하세요' : '생성된 글을 확인하고 편집하거나 발행하세요'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${
                  isEditing
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
              >
                {isEditing ? '미리보기' : '편집 모드'}
              </button>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* 본문 */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
            {/* 제목 */}
            <div className="mb-6">
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                제목
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedData.title}
                  onChange={(e) => setEditedData({ ...editedData, title: e.target.value })}
                  className="w-full text-2xl font-bold text-slate-800 border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              ) : (
                <h2 className="text-2xl font-bold text-slate-800">{editedData.title}</h2>
              )}
            </div>

            {/* 메타 디스크립션 */}
            <div className="mb-6">
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                메타 디스크립션
              </label>
              {isEditing ? (
                <textarea
                  value={editedData.metaDescription}
                  onChange={(e) => setEditedData({ ...editedData, metaDescription: e.target.value })}
                  rows={2}
                  className="w-full text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              ) : (
                <p className="text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  {editedData.metaDescription}
                </p>
              )}
            </div>

            {/* 본문 내용 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide">
                  본문 내용 {isEditing && <span className="text-orange-500">(HTML 형식)</span>}
                </label>
                {isEditing && (
                  <button
                    onClick={() => setShowImageInput(!showImageInput)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg text-sm font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    이미지 삽입
                  </button>
                )}
              </div>

              {/* 이미지 삽입 폼 */}
              {isEditing && showImageInput && (
                <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-purple-700 mb-1">
                        이미지 URL *
                      </label>
                      <input
                        type="url"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="https://example.com/image.jpg"
                        className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-purple-700 mb-1">
                        이미지 설명 (alt 텍스트, 선택사항)
                      </label>
                      <input
                        type="text"
                        value={imageAlt}
                        onChange={(e) => setImageAlt(e.target.value)}
                        placeholder="이미지에 대한 설명"
                        className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleInsertImage}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                      >
                        삽입하기
                      </button>
                      <button
                        onClick={() => {
                          setShowImageInput(false);
                          setImageUrl('');
                          setImageAlt('');
                        }}
                        className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300 transition-colors"
                      >
                        취소
                      </button>
                    </div>
                    <p className="text-xs text-purple-600">
                      * 커서 위치에 이미지가 삽입됩니다. 외부 이미지 URL을 사용하세요.
                    </p>
                  </div>
                </div>
              )}

              {isEditing ? (
                <textarea
                  ref={contentTextareaRef}
                  value={editedData.content}
                  onChange={(e) => setEditedData({ ...editedData, content: e.target.value })}
                  rows={20}
                  className="w-full font-mono text-sm text-slate-700 bg-slate-50 p-4 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="HTML 형식으로 본문을 작성하세요..."
                />
              ) : (
                <div
                  className="prose prose-slate max-w-none bg-slate-50 p-4 rounded-lg border border-slate-200"
                  dangerouslySetInnerHTML={{ __html: editedData.content }}
                />
              )}
            </div>
          </div>

          {/* 푸터 */}
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-slate-700 font-medium hover:bg-slate-100 rounded-xl transition-colors"
            >
              닫기
            </button>
            <button
              onClick={handlePublishClick}
              className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium rounded-xl hover:from-orange-600 hover:to-red-600 transition-all shadow-lg shadow-orange-500/25 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              티스토리에 발행
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
