import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { GeneratedContent } from '../types';
import { scrapeWebContent } from './scraperService';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

export async function generateBlogContent(
  sourceUrl: string,
  mainKeyword: string,
  regionKeyword: string
): Promise<GeneratedContent> {
  // 참고 링크에서 콘텐츠 스크래핑
  const sourceContent = await scrapeWebContent(sourceUrl);

  const prompt = buildPrompt(mainKeyword, regionKeyword, sourceContent);

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  // 응답에서 제목, 메타디스크립션, 본문 파싱
  return parseGeneratedContent(text);
}

function buildPrompt(
  mainKeyword: string,
  regionKeyword: string,
  sourceContent: string
): string {
  return `너는 상위 노출 1%를 만드는 검색엔진 최적화(SEO) 전문가이자 콘텐츠 에디터야. 아래 참고 내용을 바탕으로 검색엔진 최적화된 블로그 글을 HTML 형식으로 작성해줘.

## 작성 규칙

1. 메인 키워드는 '${mainKeyword}'야. 글 서론, 본론, 결론에 총 5회 자연스럽게 삽입해줘.
2. 글자수는 2000자 이상으로 작성해줘.
3. '메타 디스크립션 - 서론 - 목차 - 본론 - 마무리' 구성으로 작성해줘.
4. 본문에 가장 매칭률 높은 제목 1개를 선택해줘. (제목 후보는 5개 생성 후 최적의 1개 선택)
5. 제목에는 '${regionKeyword}' 지역 키워드를 자연스럽게 삽입해줘.
6. 메인 키워드는 수정하지 말고, '치과', '환자', '병원' 같은 상업 키워드는 5회 이하로 사용해줘.
7. 실제 40대 남자 치과의사가 작성한 것처럼 말투를 자연스럽게 작성해줘.

## 출력 형식

반드시 아래 JSON 형식으로만 출력해줘 (코드 블록 없이 순수 JSON만):

{
  "title": "선택된 최적의 제목",
  "metaDescription": "SEO 최적화된 메타 디스크립션 (150자 내외)",
  "content": "<h2>서론</h2><p>서론 내용...</p><h2>목차</h2>...<h2>본론</h2>...<h2>마무리</h2>..."
}

## 참고 내용

${sourceContent}
`;
}

function parseGeneratedContent(text: string): GeneratedContent {
  console.log('Parsing Gemini response...');
  console.log('Response length:', text.length);
  console.log('First 200 chars:', text.substring(0, 200));

  try {
    // 방법 1: JSON 코드 블록 추출 (다양한 패턴 시도)
    const jsonPatterns = [
      /```json\s*([\s\S]*?)\s*```/,
      /```\s*([\s\S]*?)\s*```/,
      /\{[\s\S]*"title"[\s\S]*"content"[\s\S]*\}/,
    ];

    for (const pattern of jsonPatterns) {
      const match = text.match(pattern);
      if (match) {
        const jsonStr = match[1] || match[0];
        try {
          // JSON 문자열 정리 (줄바꿈, 제어문자 처리)
          const cleanedJson = jsonStr
            .replace(/[\x00-\x1F\x7F]/g, (char) => {
              if (char === '\n' || char === '\r' || char === '\t') return char;
              return '';
            });

          const parsed = JSON.parse(cleanedJson);
          console.log('JSON parsed successfully with pattern:', pattern.toString().substring(0, 30));
          return {
            title: parsed.title || '',
            metaDescription: parsed.metaDescription || '',
            content: parsed.content || '',
          };
        } catch (e) {
          console.log('Pattern matched but JSON parse failed:', pattern.toString().substring(0, 30));
          continue;
        }
      }
    }

    // 방법 2: 직접 JSON 파싱 시도
    try {
      const parsed = JSON.parse(text);
      console.log('Direct JSON parse successful');
      return {
        title: parsed.title || '',
        metaDescription: parsed.metaDescription || '',
        content: parsed.content || '',
      };
    } catch {
      // 방법 3: 필드별 추출 시도
      console.log('Trying field-by-field extraction...');

      const titleMatch = text.match(/"title"\s*:\s*"([^"]+)"/);
      const metaMatch = text.match(/"metaDescription"\s*:\s*"([^"]+)"/);
      const contentMatch = text.match(/"content"\s*:\s*"([\s\S]*?)(?:"\s*[,}]|"$)/);

      if (titleMatch || contentMatch) {
        console.log('Field extraction partial success');
        return {
          title: titleMatch ? titleMatch[1] : '제목 추출 실패',
          metaDescription: metaMatch ? metaMatch[1] : '',
          content: contentMatch ? contentMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : text,
        };
      }
    }

    // 방법 4: 마지막 수단 - HTML 태그가 있으면 본문으로 간주
    console.error('All JSON parsing methods failed, using fallback');

    // JSON wrapper 제거 시도
    let cleanedText = text
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/i, '')
      .replace(/^\s*\{\s*/, '')
      .replace(/\s*\}\s*$/, '');

    return {
      title: '제목 생성 실패 - 수동 입력 필요',
      metaDescription: '',
      content: cleanedText,
    };
  } catch (error) {
    console.error('Unexpected error in parseGeneratedContent:', error);
    return {
      title: '제목 생성 실패',
      metaDescription: '',
      content: text,
    };
  }
}
