import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { GeneratedContent } from '../types';
import { buildPrompt, parseGeneratedContent } from './geminiService';
import { scrapeWebContent } from './scraperService';

const anthropic = new Anthropic({
  apiKey: config.claude.apiKey,
});

// Claude API로 블로그 콘텐츠 생성
export async function generateBlogContentWithClaude(
  sourceUrl: string,
  mainKeyword: string,
  regionKeyword: string,
  customTopic?: string,
  systemPrompt?: string
): Promise<GeneratedContent> {
  // 참고 링크에서 콘텐츠 스크래핑
  const sourceContent = await scrapeWebContent(sourceUrl);

  const prompt = buildPrompt(mainKeyword, regionKeyword, sourceContent, customTopic, systemPrompt);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  // Claude 응답에서 텍스트 추출
  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude 응답에서 텍스트를 찾을 수 없습니다.');
  }

  // geminiService의 파싱 로직 재사용
  return parseGeneratedContent(textBlock.text);
}
