import type { Metadata } from 'next';
import './globals.css';

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
        <header className="bg-white shadow-sm border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-lg">T</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-800">Tistory Auto Publisher</h1>
                  <p className="text-xs text-slate-500">Powered by Gemini AI</p>
                </div>
              </div>
              <nav className="flex items-center gap-4">
                <a href="/" className="text-slate-600 hover:text-orange-500 font-medium transition-colors">
                  글 작성
                </a>
                <a href="/posts" className="text-slate-600 hover:text-orange-500 font-medium transition-colors">
                  발행 목록
                </a>
              </nav>
            </div>
          </div>
        </header>
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
      </body>
    </html>
  );
}
