export default function GuidePage() {
  return (
    <main className="page-shell narrow">
      <section className="panel">
        <p className="eyebrow">연수 진행 순서</p>
        <h1>구글 시트 사본 만들기 + Vercel 배포</h1>
        <p>
          초보 교사용 상세 HTML 안내는 <a href="/teacher-guide.html">teacher-guide.html</a>에서 열 수 있습니다.
          연수 참여자에게 이 주소를 공유하면 순서대로 따라 하며 자기 앱을 만들 수 있습니다.
        </p>
        <ol className="guide-list">
          <li>강사가 제공한 Google Sheets 템플릿 링크를 열고, 각자 사본을 만듭니다.</li>
          <li>사본 시트에서 확장 프로그램, Apps Script를 열고 `setup`을 실행합니다.</li>
          <li>Apps Script를 웹앱으로 배포하고 `/exec`로 끝나는 URL을 복사합니다.</li>
          <li>강사가 제공한 Deploy with Vercel 버튼을 누르고 `APPS_SCRIPT_URL`에 복사한 URL을 넣습니다.</li>
          <li>필요하면 `APP_SHARED_SECRET`, `TRAINER_CODE`를 같은 값으로 입력합니다.</li>
          <li>배포가 끝나면 `/collect`에서 휴대폰이나 패드로 샘플을 수집합니다.</li>
          <li>`/wash`에서 테스트 학생으로 손씻기 완료 기록을 남깁니다.</li>
          <li>`/teacher`와 Google Sheets에서 샘플 수와 학생 기록을 확인합니다.</li>
        </ol>
      </section>

      <section className="panel">
        <h2>수집 권장 기준</h2>
        <div className="two-col">
          <div>
            <strong>라벨별 최소 수량</strong>
            <p>각 단계 50개 이상, 가능하면 100개 이상. 기타/대기도 반드시 수집합니다.</p>
          </div>
          <div>
            <strong>카메라 위치</strong>
            <p>실제 수돗가에서 사용할 위치와 같은 각도, 같은 조명으로 수집합니다.</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>교사에게 강조할 점</h2>
        <p>
          학생용 `/wash`는 점수 기록용입니다. 샘플 수집은 `/collect`에서 교사가 관리해야 합니다. 학생이 잘못된
          라벨로 샘플을 올리면 판정 품질이 떨어질 수 있으므로 수집 코드는 교사용으로만 공유하세요.
        </p>
      </section>
    </main>
  );
}
