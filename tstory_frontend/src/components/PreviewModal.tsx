'use client';

import { useState, useRef, DragEvent } from 'react';

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
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const dropPositionRef = useRef<{ node: Node; offset: number } | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

  const handlePublishClick = () => {
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

  // 드래그 이벤트 핸들러
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isDragging) {
      setIsDragging(true);
    }

    // 드롭 위치 계산 (마우스 위치 기준)
    if (contentRef.current) {
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (range) {
        dropPositionRef.current = {
          node: range.startContainer,
          offset: range.startOffset
        };
      }
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // 실제로 영역을 벗어났는지 확인
    const rect = contentRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        setIsDragging(false);
        dropPositionRef.current = null;
      }
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];

    // 파일 타입 검증
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('지원하지 않는 이미지 형식입니다. (jpg, png, gif, webp만 가능)');
      setTimeout(() => setUploadError(''), 3000);
      return;
    }

    // 파일 크기 검증 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('파일 크기는 10MB 이하여야 합니다.');
      setTimeout(() => setUploadError(''), 3000);
      return;
    }

    // 드롭 위치에 플레이스홀더 삽입
    const placeholderId = `img-placeholder-${Date.now()}`;
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);

    console.log('=== 드래그 앤 드롭 디버그 ===');
    console.log('드롭 좌표:', { clientX: e.clientX, clientY: e.clientY });
    console.log('caretRangeFromPoint 결과:', range);
    console.log('range.startContainer:', range?.startContainer);
    console.log('range.startContainer.nodeName:', range?.startContainer?.nodeName);
    console.log('range.startContainer.textContent:', range?.startContainer?.textContent?.substring(0, 50));
    console.log('range.startOffset:', range?.startOffset);
    console.log('contentRef.current:', contentRef.current);
    console.log('contains 체크:', contentRef.current?.contains(range?.startContainer || null));

    if (range && contentRef.current?.contains(range.startContainer)) {
      console.log('✅ 플레이스홀더 삽입 시도');
      const placeholder = document.createElement('span');
      placeholder.id = placeholderId;
      placeholder.innerHTML = '<span style="display:inline-block;padding:8px 16px;background:#f3e8ff;border-radius:8px;color:#7c3aed;font-size:12px;">이미지 업로드 중...</span>';
      range.insertNode(placeholder);
      console.log('✅ 플레이스홀더 삽입 완료');
    } else {
      console.log('❌ 플레이스홀더 삽입 실패 - range 또는 contains 체크 실패');
    }

    setIsUploading(true);
    setUploadError('');

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`${API_URL}/api/upload/image`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success && result.url) {
        // 플레이스홀더를 이미지로 교체
        const placeholder = document.getElementById(placeholderId);
        if (placeholder && contentRef.current?.contains(placeholder)) {
          const imgHtml = `<figure class="imageblock alignCenter">
  <img src="${result.url}" alt="이미지" style="max-width: 100%; height: auto;">
</figure>`;
          const template = document.createElement('template');
          template.innerHTML = imgHtml;
          placeholder.replaceWith(template.content);
        } else {
          // 플레이스홀더가 없으면 맨 끝에 추가
          insertImageAtPosition(result.url, null);
        }

        // content state 업데이트
        if (contentRef.current) {
          setEditedData(prev => ({
            ...prev,
            content: contentRef.current?.innerHTML || prev.content
          }));
        }
      } else {
        // 업로드 실패 시 플레이스홀더 제거
        const placeholder = document.getElementById(placeholderId);
        placeholder?.remove();
        setUploadError(result.error || '이미지 업로드에 실패했습니다.');
        setTimeout(() => setUploadError(''), 3000);
      }
    } catch (error) {
      console.error('Upload error:', error);
      // 에러 시 플레이스홀더 제거
      const placeholder = document.getElementById(placeholderId);
      placeholder?.remove();
      setUploadError('이미지 업로드 중 오류가 발생했습니다.');
      setTimeout(() => setUploadError(''), 3000);
    } finally {
      setIsUploading(false);
      dropPositionRef.current = null;
    }
  };

  const insertImageAtPosition = (
    imageUrl: string,
    position: { node: Node; offset: number } | null
  ) => {
    const imgHtml = `<figure class="imageblock alignCenter">
  <img src="${imageUrl}" alt="이미지" style="max-width: 100%; height: auto;">
</figure>`;

    if (position && contentRef.current?.contains(position.node)) {
      const selection = window.getSelection();
      if (selection) {
        // 드롭 위치에 range 생성
        const range = document.createRange();
        try {
          range.setStart(position.node, position.offset);
          range.collapse(true);

          selection.removeAllRanges();
          selection.addRange(range);

          // 이미지 삽입
          const template = document.createElement('template');
          template.innerHTML = imgHtml;
          const fragment = template.content;
          range.insertNode(fragment);

          // 커서를 삽입된 이미지 뒤로 이동
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        } catch {
          // 위치 설정 실패 시 맨 끝에 추가
          if (contentRef.current) {
            contentRef.current.innerHTML += imgHtml;
          }
        }
      }
    } else {
      // 드롭 위치가 없으면 맨 끝에 추가
      if (contentRef.current) {
        contentRef.current.innerHTML += imgHtml;
      }
    }

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
                <span className="text-xs text-purple-600 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  이미지를 드래그하여 원하는 위치에 놓으세요
                </span>
              </div>

              {/* 에러 메시지 */}
              {uploadError && (
                <div className="mb-2 p-2 bg-red-100 border border-red-300 rounded-lg">
                  <p className="text-xs text-red-600">{uploadError}</p>
                </div>
              )}

              {/* WYSIWYG 편집 영역 (드래그 앤 드롭 지원) */}
              <div className="relative">
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
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`prose prose-slate max-w-none p-4 rounded-lg border-2 transition-all min-h-[400px] cursor-text ${
                    isDragging
                      ? 'border-purple-500 bg-purple-50 border-dashed'
                      : 'border-slate-200 bg-slate-50 hover:bg-white focus:bg-white hover:border-slate-300 focus:border-orange-500'
                  } focus:outline-none`}
                  dangerouslySetInnerHTML={{ __html: editedData.content }}
                />

                {/* 업로드 중 오버레이 */}
                {isUploading && (
                  <div className="absolute inset-0 bg-white/80 rounded-lg flex items-center justify-center">
                    <div className="flex items-center gap-2 text-purple-600">
                      <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="font-medium">이미지 업로드 중...</span>
                    </div>
                  </div>
                )}

                {/* 드래그 오버레이 */}
                {isDragging && !isUploading && (
                  <div className="absolute inset-0 bg-purple-100/50 rounded-lg flex items-center justify-center pointer-events-none">
                    <div className="flex flex-col items-center gap-2 text-purple-600">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="font-medium">여기에 이미지를 놓으세요</span>
                    </div>
                  </div>
                )}
              </div>

              <p className="mt-2 text-xs text-slate-400">
                본문을 클릭하면 바로 편집할 수 있습니다. 이미지는 파일을 드래그하여 원하는 위치에 놓으면 자동으로 업로드됩니다.
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
