import { GeneratedContent } from '../types';
import { generateBlogContent as generateWithGemini } from './geminiService';
import { generateBlogContentWithClaude } from './claudeService';

// AI 모델 선택에 따라 블로그 콘텐츠 생성
export async function generateBlogContent(
  sourceUrl: string,
  mainKeyword: string,
  regionKeyword: string,
  aiModel: 'gemini' | 'claude' = 'claude'
): Promise<GeneratedContent> {
  console.log(`AI 모델 선택: ${aiModel}`);

  if (aiModel === 'claude') {
    return generateBlogContentWithClaude(sourceUrl, mainKeyword, regionKeyword);
  }

  return generateWithGemini(sourceUrl, mainKeyword, regionKeyword);
}
