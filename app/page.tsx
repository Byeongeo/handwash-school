import Link from "next/link";

const tiles = [
  {
    href: "/collect",
    title: "1. 샘플 수집",
    body: "휴대폰이나 패드 카메라로 실제 수돗가 각도에서 손씻기 동작 샘플을 모읍니다.",
    action: "수집 페이지 열기"
  },
  {
    href: "/student",
    title: "2. 학생 실행(키오스크)",
    body: "수돗가 기기에 띄우는 학생 전용 화면입니다. 발판(풋스위치)이나 화면 터치로 시작하고, QR 명찰로 학생을 인식합니다.",
    action: "학생 화면 열기"
  },
  {
    href: "/teacher",
    title: "3. 기록 확인",
    body: "Google Sheets에 저장된 샘플 수와 최근 손씻기 완료 기록을 확인합니다.",
    action: "교사용 페이지 열기"
  },
  {
    href: "/guide",
    title: "4. 연수 가이드",
    body: "시트 사본 만들기, Apps Script 배포, Vercel 배포, 수업 운영 순서를 확인합니다.",
    action: "가이드 보기"
  }
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-band">
        <div>
          <p className="eyebrow">Vercel + Google Sheets</p>
          <h1>교사가 가져가서 운영하는 손씻기 6단계 코칭 앱</h1>
          <p>
            연수에서는 앱을 배포하고, 휴대폰으로 손동작 샘플을 모은 뒤, 학생의 완료 기록을 각자 Google
            Sheets에 남기는 흐름까지 실습합니다.
          </p>
        </div>
      </section>

      <section className="tile-grid">
        {tiles.map((tile) => (
          <Link href={tile.href} className="tile" key={tile.href}>
            <h2>{tile.title}</h2>
            <p>{tile.body}</p>
            <span>{tile.action}</span>
          </Link>
        ))}
      </section>

      <section className="info-band">
        <h2>운영 원칙</h2>
        <div className="three-col">
          <div>
            <strong>샘플은 현장에서</strong>
            <p>노트북 대신 휴대폰이나 패드를 실제 설치 각도에 두고 수집합니다.</p>
          </div>
          <div>
            <strong>점수는 시트에</strong>
            <p>학생 완료 기록은 교사의 Google Sheets 사본에 자동으로 누적됩니다.</p>
          </div>
          <div>
            <strong>학생 화면은 단순하게</strong>
            <p>수집 기능과 학생 실행 기능을 분리해 실수로 학습 데이터를 망가뜨리지 않습니다.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
