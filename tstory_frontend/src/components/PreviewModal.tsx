'use client';

import { useState, useRef, DragEvent, useEffect, MouseEvent } from 'react';

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

interface SelectedImage {
  element: HTMLImageElement | null;
  rect: DOMRect | null;
}

export default function PreviewModal({ data, onClose, onPublish }: PreviewModalProps) {
  const [editedData, setEditedData] = useState<PreviewData>({
    title: data.title,
    metaDescription: data.metaDescription,
    content: data.content,
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [selectedImage, setSelectedImage] = useState<SelectedImage>({
    element: null,
    rect: null,
  });
  const contentRef = useRef<HTMLDivElement>(null);
  // 드롭 위치를 저장 (리렌더링 영향 없음)
  const dropRangeRef = useRef<Range | null>(null);
  // 드래그 상태도 ref로 관리 (리렌더링 방지)
  const isDraggingRef = useRef(false);

  const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

  // 이미지 클릭 핸들러
  const handleContentClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    if (target.tagName === 'IMG') {
      e.preventDefault();
      const img = target as HTMLImageElement;
      updateSelectedImage(img);
    } else {
      // 이미지 외 클릭 시 선택 해제 (선택된 이미지가 있을 때만)
      if (selectedImage.element) {
        clearSelectedImage();
      }
      // 선택된 이미지가 없으면 아무것도 하지 않음 (커서 위치 유지)
    }
  };

  // 선택된 이미지 업데이트
  const updateSelectedImage = (img: HTMLImageElement) => {
    // 이전 선택 해제
    if (selectedImage.element && selectedImage.element !== img) {
      selectedImage.element.style.outline = '';
    }

    const rect = img.getBoundingClientRect();
    const containerRect = contentRef.current?.getBoundingClientRect();

    if (containerRect) {
      img.style.outline = '2px solid #7c3aed';

      setSelectedImage({
        element: img,
        rect: new DOMRect(
          rect.left - containerRect.left,
          rect.top - containerRect.top,
          rect.width,
          rect.height
        ),
      });
    }
  };

  // 이미지 선택 해제
  const clearSelectedImage = () => {
    if (selectedImage.element) {
      selectedImage.element.style.outline = '';
    }
    setSelectedImage({ element: null, rect: null });
  };

  // 리사이즈 시작
  const handleResizeStart = (e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();

    // 현재 선택된 이미지를 로컬 변수로 저장 (클로저에서 사용)
    const targetImage = selectedImage.element;
    if (!targetImage) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = targetImage.offsetWidth;
    const startHeight = targetImage.offsetHeight;

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      let newWidth = startWidth;

      // 모서리별 크기 계산
      if (corner.includes('e')) {
        newWidth = Math.max(50, startWidth + deltaX);
      } else if (corner.includes('w')) {
        newWidth = Math.max(50, startWidth - deltaX);
      }

      // 세로 방향 드래그도 가로 크기에 반영 (비율 유지를 위해)
      if (corner.includes('s') && !corner.includes('e') && !corner.includes('w')) {
        const aspectRatio = startWidth / startHeight;
        newWidth = Math.max(50, (startHeight + deltaY) * aspectRatio);
      } else if (corner.includes('n') && !corner.includes('e') && !corner.includes('w')) {
        const aspectRatio = startWidth / startHeight;
        newWidth = Math.max(50, (startHeight - deltaY) * aspectRatio);
      }

      // 대각선 드래그는 더 큰 변화량 사용
      if ((corner === 'se' || corner === 'nw')) {
        const diagonalDelta = Math.max(Math.abs(deltaX), Math.abs(deltaY));
        const sign = (deltaX + deltaY) > 0 ? 1 : -1;
        newWidth = Math.max(50, startWidth + diagonalDelta * sign);
      } else if ((corner === 'sw' || corner === 'ne')) {
        const diagonalDelta = Math.max(Math.abs(deltaX), Math.abs(deltaY));
        const sign = (deltaX - deltaY) < 0 ? 1 : -1;
        newWidth = Math.max(50, startWidth + diagonalDelta * sign);
      }

      targetImage.style.width = `${newWidth}px`;
      targetImage.style.height = 'auto';

      // 핸들 위치 업데이트
      updateSelectedImage(targetImage);
    };

    const handleMouseUp = () => {
      // state 업데이트
      if (contentRef.current) {
        setEditedData(prev => ({
          ...prev,
          content: contentRef.current?.innerHTML || prev.content
        }));
      }

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // 이미지 삭제
  const handleDeleteImage = () => {
    if (selectedImage.element) {
      const figure = selectedImage.element.closest('figure');
      if (figure) {
        figure.remove();
      } else {
        selectedImage.element.remove();
      }

      if (contentRef.current) {
        setEditedData(prev => ({
          ...prev,
          content: contentRef.current?.innerHTML || prev.content
        }));
      }

      setSelectedImage({ element: null, rect: null });
    }
  };

  // ESC 키로 선택 해제
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedImage.element) {
        clearSelectedImage();
      }
      if (e.key === 'Delete' && selectedImage.element) {
        handleDeleteImage();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage.element]);

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

  // 드래그 시각 효과 적용/제거 (DOM 직접 조작)
  const setDragStyle = (active: boolean) => {
    if (contentRef.current) {
      if (active) {
        contentRef.current.classList.add('border-purple-500', 'bg-purple-50', 'border-dashed');
        contentRef.current.classList.remove('border-slate-200', 'bg-slate-50');
      } else {
        contentRef.current.classList.remove('border-purple-500', 'bg-purple-50', 'border-dashed');
        contentRef.current.classList.add('border-slate-200', 'bg-slate-50');
      }
    }
  };

  // 드래그 이벤트 핸들러 (리렌더링 없이 ref만 사용)
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // 드롭 위치 저장 (DOM 조작 없이 range만 저장)
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);

    // 디버깅: 매 드래그마다 출력하면 너무 많으니 첫 번째만
    if (!isDraggingRef.current) {
      console.log('=== DRAGOVER DEBUG (first) ===');
      console.log('clientX, clientY:', e.clientX, e.clientY);
      console.log('caretRangeFromPoint result:', range);
      console.log('range?.startContainer:', range?.startContainer);
      console.log('range?.startContainer.nodeName:', range?.startContainer?.nodeName);
      console.log('contentRef.current:', contentRef.current);
      console.log('contains check:', range ? contentRef.current?.contains(range.startContainer) : 'no range');
    }

    if (range && contentRef.current?.contains(range.startContainer)) {
      dropRangeRef.current = range.cloneRange();
    }

    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      setDragStyle(true);
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      setDragStyle(true);
    }
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
        isDraggingRef.current = false;
        dropRangeRef.current = null;
        setDragStyle(false);
      }
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = false;
    setDragStyle(false);

    // 저장된 드롭 위치
    const savedRange = dropRangeRef.current;
    dropRangeRef.current = null;

    console.log('=== DROP DEBUG ===');
    console.log('1. savedRange:', savedRange);
    console.log('2. savedRange?.startContainer:', savedRange?.startContainer);
    console.log('3. savedRange?.startContainer.nodeName:', savedRange?.startContainer?.nodeName);
    console.log('4. savedRange?.startContainer.textContent (first 50):', savedRange?.startContainer?.textContent?.substring(0, 50));
    console.log('5. savedRange?.startOffset:', savedRange?.startOffset);
    console.log('6. contentRef.current:', contentRef.current);
    console.log('7. contains check:', savedRange ? contentRef.current?.contains(savedRange.startContainer) : 'no range');

    const files = e.dataTransfer.files;
    if (files.length === 0) {
      console.log('8. No files');
      return;
    }

    const file = files[0];
    console.log('9. File:', file.name, file.type, file.size);

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

    // 저장된 range 위치에 플레이스홀더 삽입
    const placeholderId = `img-placeholder-${Date.now()}`;
    let placeholderInserted = false;

    if (savedRange && contentRef.current) {
      try {
        // range의 startContainer가 아직 contentRef 안에 있는지 확인
        if (contentRef.current.contains(savedRange.startContainer)) {
          const placeholder = document.createElement('span');
          placeholder.id = placeholderId;
          placeholder.innerHTML = '<span style="display:inline-block;padding:8px 16px;background:#f3e8ff;border-radius:8px;color:#7c3aed;font-size:12px;">이미지 업로드 중...</span>';

          savedRange.insertNode(placeholder);
          placeholderInserted = true;
          console.log('10. Placeholder inserted:', placeholderId);

          // 핵심: placeholder 삽입 후 바로 state 업데이트하여 리렌더링 시에도 유지
          setEditedData(prev => ({
            ...prev,
            content: contentRef.current?.innerHTML || prev.content
          }));
          console.log('11. State updated with placeholder');
        } else {
          console.log('10. Range not in contentRef');
        }
      } catch (err) {
        console.error('10. Failed to insert placeholder:', err);
      }
    } else {
      console.log('10. No savedRange or contentRef:', { savedRange: !!savedRange, contentRef: !!contentRef.current });
    }

    setIsUploading(true);
    setUploadError('');
    console.log('12. Upload started, placeholderInserted:', placeholderInserted);

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
                  onClick={handleContentClick}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className="prose prose-slate max-w-none p-4 rounded-lg border-2 transition-all min-h-[400px] cursor-text border-slate-200 bg-slate-50 hover:bg-white focus:bg-white hover:border-slate-300 focus:border-orange-500 focus:outline-none"
                  dangerouslySetInnerHTML={{ __html: editedData.content }}
                />

                {/* 이미지 리사이즈 핸들 */}
                {selectedImage.element && selectedImage.rect && (
                  <>
                    {/* 리사이즈 핸들 - 8방향 */}
                    {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((corner) => {
                      const rect = selectedImage.rect!;
                      let left = rect.x;
                      let top = rect.y;
                      let cursor = 'default';

                      switch (corner) {
                        case 'nw': left = rect.x - 4; top = rect.y - 4; cursor = 'nwse-resize'; break;
                        case 'n': left = rect.x + rect.width / 2 - 4; top = rect.y - 4; cursor = 'ns-resize'; break;
                        case 'ne': left = rect.x + rect.width - 4; top = rect.y - 4; cursor = 'nesw-resize'; break;
                        case 'e': left = rect.x + rect.width - 4; top = rect.y + rect.height / 2 - 4; cursor = 'ew-resize'; break;
                        case 'se': left = rect.x + rect.width - 4; top = rect.y + rect.height - 4; cursor = 'nwse-resize'; break;
                        case 's': left = rect.x + rect.width / 2 - 4; top = rect.y + rect.height - 4; cursor = 'ns-resize'; break;
                        case 'sw': left = rect.x - 4; top = rect.y + rect.height - 4; cursor = 'nesw-resize'; break;
                        case 'w': left = rect.x - 4; top = rect.y + rect.height / 2 - 4; cursor = 'ew-resize'; break;
                      }

                      return (
                        <div
                          key={corner}
                          className="absolute w-3 h-3 bg-purple-600 border-2 border-white rounded-sm shadow-md z-30"
                          style={{ left, top, cursor }}
                          onMouseDown={(e) => handleResizeStart(e, corner)}
                        />
                      );
                    })}

                    {/* 삭제 버튼 */}
                    <button
                      className="absolute z-30 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
                      style={{
                        left: selectedImage.rect.x + selectedImage.rect.width - 8,
                        top: selectedImage.rect.y - 8,
                      }}
                      onClick={handleDeleteImage}
                      title="이미지 삭제 (Delete 키)"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </>
                )}

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

              </div>

              <p className="mt-2 text-xs text-slate-400">
                본문을 클릭하면 바로 편집할 수 있습니다. 이미지를 드래그하여 원하는 위치에 놓거나, 이미지를 클릭하여 크기를 조절하세요.
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
