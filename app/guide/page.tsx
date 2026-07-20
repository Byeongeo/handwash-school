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
          <li>GitHub·Vercel 계정이 없다면 먼저 만듭니다(가입 순서는 teacher-guide.html의 2번 참고 — Vercel은 "Continue with GitHub"로).</li>
          <li>강사가 제공한 Google Sheets 템플릿 링크를 열고, 각자 사본을 만듭니다.</li>
          <li>사본 시트에서 확장 프로그램, Apps Script를 열고 `setup`을 실행합니다.</li>
          <li>Apps Script를 웹앱으로 배포하고 `/exec`로 끝나는 URL을 복사합니다.</li>
          <li>강사가 제공한 Deploy with Vercel 버튼을 누르고 `APPS_SCRIPT_URL`에 복사한 URL을 넣습니다.</li>
          <li>필요하면 `APP_SHARED_SECRET`, `TRAINER_CODE`를 같은 값으로 입력합니다.</li>
          <li>배포가 끝나면 `/collect`에서 휴대폰이나 패드로 샘플을 수집합니다.</li>
          <li>`/wash`(교사 점검 화면)에서 테스트 학생으로 판정과 기록을 확인합니다.</li>
          <li>수돗가 기기에는 학생 전용 `/student`(전체화면 키오스크)를 띄워 운영합니다.</li>
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
        <h2>학생 키오스크(/student) 운영</h2>
        <div className="two-col">
          <div>
            <strong>시작 방법 3가지</strong>
            <p>
              ① 화면 터치 ② 블루투스 풋스위치(키보드형 페달 — 폰·패드에서도 동작) ③ <b>항상 대기 모드</b>: 시트
              `config`의 `alwaysOn`을 `Y`로 바꾸면, 아침에 교사가 화면을 한 번 눌러 켠 뒤 하루 종일 카메라가 QR
              대기 상태를 유지합니다. 학생은 QR 명찰만 보여주면 시작되어 아무것도 만질 필요가 없습니다(충전기 상시
              연결 권장). 카메라는 기본 전면(화면 쪽)이며, `/collect`의 "카메라 전환" 버튼으로 바꾸면 같은 기기에서
              기억됩니다.
            </p>
          </div>
          <div>
            <strong>자동 취소</strong>
            <p>
              손씻기 도중 손이 화면에서 사라진 채 `idleTimeoutSec`(기본 20초)가 지나면 세션이 자동 취소되고 기록이
              남지 않습니다. 값은 Google Sheets `config` 탭에서 바꿀 수 있습니다.
            </p>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>교사에게 강조할 점</h2>
        <p>
          학생에게는 `/student` 주소만 열어 주세요. `/wash`는 교사 점검용, 샘플 수집은 `/collect`에서 교사가
          관리해야 합니다. 학생이 잘못된 라벨로 샘플을 올리면 판정 품질이 떨어질 수 있으므로 수집 코드는 교사용으로만
          공유하세요.
        </p>
      </section>
    </main>
  );
}
