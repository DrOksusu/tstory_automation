'use client';

import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';

export default function Header() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  // 로그인 페이지에서는 간단한 헤더만 표시
  const isLoginPage = pathname === '/login';

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
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

          {!isLoginPage && (
            <div className="flex items-center gap-6">
              <nav className="flex items-center gap-4">
                <a href="/" className="text-slate-600 hover:text-orange-500 font-medium transition-colors">
                  글 작성
                </a>
                <a href="/posts" className="text-slate-600 hover:text-orange-500 font-medium transition-colors">
                  발행 목록
                </a>
              </nav>

              {user && (
                <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-700">{user.email}</p>
                    <p className="text-xs text-slate-500">로그인됨</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
                  >
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
