import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { InAppWarning } from "@/components/InAppWarning";
import "./globals.css";

export const metadata: Metadata = {
  title: "손씻기 코칭 연수 앱",
  description: "Vercel과 Google Sheets로 운영하는 손씻기 6단계 코칭 앱"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <InAppWarning />
        <Nav />
        {children}
      </body>
    </html>
  );
}
