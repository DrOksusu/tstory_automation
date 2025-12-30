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
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [showImageInput, setShowImageInput] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handlePublishClick = () => {
    // contentEditable에서 최신 HTML 가져오기
    if (contentRef.current) {
      setEditedData(prev => ({
        ...prev,
        content: contentRef.current?.innerHTML || prev.content
      }));
    }
    onPublish({
      ...editedData,
      content: contentRef.current?.innerHTML || editedData.content
    });
  };

  const handleInsertImage = () => {
    if (!imageUrl.trim()) {
      alert('이미지 URL을 입력해주세요.');
      return;
    }

    const imgHtml = `<figure class="imageblock alignCenter">
  <img src="${imageUrl.trim()}" alt="${imageAlt.trim() || '이미지'}" style="max-width: 100%; height: auto;">
  ${imageAlt.trim() ? `<figcaption>${imageAlt.trim()}</figcaption>` : ''}
</figure>`;

    // 현재 커서 위치에 이미지 삽입
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && contentRef.current?.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();

      const template = document.createElement('template');
      template.innerHTML = imgHtml;
      const fragment = template.content;
      range.insertNode(fragment);

      // 커서를 삽입된 이미지 뒤로 이동
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      // 커서가 없으면 맨 끝에 추가
      if (contentRef.current) {
        contentRef.current.innerHTML += imgHtml;
      }
    }

    // 입력 필드 초기화
    setImageUrl('');
    setImageAlt('');
    setShowImageInput(false);

    // content state 업데이트
    if (contentRef.current) {
      setEditedData(prev => ({
        ...prev,
        content: contentRef.current?.innerHTML || prev.content
      }));
    }
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
              <h3 className="text-lg font-semibold text-slate-800">미리보기 및 편집</h3>
              <p className="text-sm text-slate-500">클릭하여 직접 수정하세요</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 본문 */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
            {/* 제목 */}
            <div className="mb-6">
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                제목
              </label>
              <input
                type="text"
                value={editedData.title}
                onChange={(e) => setEditedData({ ...editedData, title: e.target.value })}
                className="w-full text-2xl font-bold text-slate-800 border-b-2 border-transparent hover:border-slate-200 focus:border-orange-500 px-1 py-2 focus:outline-none transition-colors bg-transparent"
                placeholder="제목을 입력하세요"
              />
            </div>

            {/* 메타 디스크립션 */}
            <div className="mb-6">
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                메타 디스크립션
              </label>
              <textarea
                value={editedData.metaDescription}
                onChange={(e) => setEditedData({ ...editedData, metaDescription: e.target.value })}
                rows={2}
                className="w-full text-slate-600 bg-slate-50 hover:bg-slate-100 focus:bg-white p-3 rounded-lg border border-transparent hover:border-slate-200 focus:border-orange-500 focus:outline-none transition-all resize-none"
                placeholder="메타 디스크립션을 입력하세요"
              />
            </div>

            {/* 본문 내용 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide">
                  본문 내용
                </label>
                <button
                  onClick={() => setShowImageInput(!showImageInput)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  이미지 삽입
                </button>
              </div>

              {/* 이미지 삽입 폼 */}
              {showImageInput && (
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
                      * 본문에서 원하는 위치를 클릭한 후 삽입하면 해당 위치에 이미지가 들어갑니다.
                    </p>
                  </div>
                </div>
              )}

              {/* WYSIWYG 편집 영역 */}
              <div
                ref={contentRef}
                contentEditable
                suppressContentEditableWarning
                onBlur={() => {
                  if (contentRef.current) {
                    setEditedData(prev => ({
                      ...prev,
                      content: contentRef.current?.innerHTML || prev.content
                    }));
                  }
                }}
                className="prose prose-slate max-w-none bg-slate-50 hover:bg-white focus:bg-white p-4 rounded-lg border border-slate-200 hover:border-slate-300 focus:border-orange-500 focus:outline-none transition-all min-h-[400px] cursor-text"
                dangerouslySetInnerHTML={{ __html: editedData.content }}
              />
              <p className="mt-2 text-xs text-slate-400">
                본문을 클릭하면 바로 편집할 수 있습니다. 텍스트 선택 후 수정하거나, 원하는 위치에 커서를 놓고 이미지를 삽입하세요.
              </p>
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
