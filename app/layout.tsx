import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "손씻기 코칭 연수 앱",
  description: "Vercel과 Google Sheets로 운영하는 손씻기 6단계 코칭 앱"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="app-header">
          <Link href="/" className="brand">
            손씻기 코칭
          </Link>
          <nav>
            <Link href="/collect">샘플 수집</Link>
            <Link href="/wash">학생 실행</Link>
            <Link href="/teacher">교사용</Link>
            <Link href="/guide">가이드</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
