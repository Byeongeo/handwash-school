"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const pathname = usePathname();
  if (pathname === "/student") return null;
  return (
    <header className="app-header">
      <Link href="/" className="brand">
        손씻기 코칭
      </Link>
      <nav>
        <Link href="/collect">샘플 수집</Link>
        <Link href="/teacher">교사용</Link>
        <Link href="/guide">가이드</Link>
      </nav>
    </header>
  );
}
