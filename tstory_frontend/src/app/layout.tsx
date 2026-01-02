import type { Metadata } from 'next';
import './globals.css';
import Providers from '@/components/Providers';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: '티스토리 자동 발행 시스템',
  description: 'Gemini AI를 활용한 SEO 최적화 블로그 글 자동 생성 및 발행',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Providers>
          <Header />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
          <footer className="bg-white border-t border-slate-200 mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <p className="text-center text-slate-500 text-sm">
                © 2024 Tistory Auto Publisher. AI 기반 블로그 자동 발행 시스템
              </p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
