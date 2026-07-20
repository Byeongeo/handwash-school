# 손씻기 코칭 연수 앱

Vercel에 배포하고, Google Sheets 사본을 백엔드로 사용하는 손씻기 6단계 코칭 앱입니다.

- `/student`: **학생 전용 키오스크(수돗가 기기용)** — 상단 메뉴 없음. 발판(풋스위치)·화면 터치로 시작 → QR 명찰 인식 → 6단계 코칭 → 완료 시 점수·기록. 손이 안 보인 채 `idleTimeoutSec`(기본 20초)가 지나면 자동 취소(기록 없음)
- `/collect`: 휴대폰/패드 카메라로 손씻기 동작 샘플 수집 (교사용)
- `/wash`: 교사 점검용 실행 화면(수동 ID·상세 패널 포함)
- `/teacher`: 샘플 수와 최근 기록 확인
- `/guide`: 초보 교사용 설치/연수 가이드

## 연수 운영 방식

교사는 강사가 제공한 Google Sheets 템플릿을 사본으로 만들고, Apps Script를 배포한 뒤, Vercel Deploy Button으로 자기 앱을 배포합니다.

### 1. Google Sheets 준비

1. 강사가 제공한 시트 템플릿을 엽니다.
2. `파일 > 사본 만들기`로 자기 Google Drive에 복사합니다.
3. `확장 프로그램 > Apps Script`를 엽니다.
4. `apps-script/Code.gs` 내용을 붙여넣습니다.
5. 함수 목록에서 `setup`을 실행하고 권한을 승인합니다.
6. `배포 > 새 배포 > 웹 앱`을 선택합니다.
   - 실행: `나`
   - 액세스 권한: `모든 사용자`
7. `/exec`로 끝나는 웹앱 URL을 복사합니다.

### 2. Vercel 배포

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FByeongeo%2Fhandwash-school&env=APPS_SCRIPT_URL,APP_SHARED_SECRET,TRAINER_CODE&envDescription=Apps%20Script%20web%20app%20URL%20and%20optional%20secrets&project-name=handwash-school&repository-name=handwash-school)

운영 배포본: https://handwash-school.vercel.app (GitHub `main` 푸시 시 자동 재배포)

Vercel 환경변수:

- `APPS_SCRIPT_URL`: Apps Script 웹앱 `/exec` URL
- `APP_SHARED_SECRET`: 선택. Apps Script `setSecret` 값과 같게 입력
- `TRAINER_CODE`: 선택. `/collect` 샘플 업로드를 제한하는 교사용 코드

### 3. 수업 전 샘플 수집

1. 휴대폰 또는 패드에서 `https://내앱.vercel.app/collect`를 엽니다.
2. 실제 수돗가에서 사용할 각도로 기기를 고정합니다.
3. `카메라 시작`을 누릅니다. 기본은 화면(액정) 쪽 전면 카메라이며, `카메라 전환` 버튼으로 바꿀 수
   있습니다(선택은 같은 기기의 `/student`에도 기억됨 · 수집과 실행은 같은 방향 사용).
4. `샘플 세트 이름`을 입력합니다. 예: `3학년_보건실`
5. 라벨을 선택하고 `연속 수집`으로 샘플을 모읍니다.
6. 6단계와 `기타/대기`를 모두 수집합니다.
7. `묶음 업로드`를 눌러 Google Sheets에 저장합니다.
8. Google Sheets `config` 탭의 `activeSampleSet` 값을 사용할 샘플 세트 이름으로 맞춥니다.

권장 수량:

- 각 단계 50개 이상
- 가능하면 각 단계 100개 이상
- `기타/대기`도 반드시 50개 이상

### 4. 학생 실행 (수돗가 키오스크)

1. 수돗가에 거치한 패드/휴대폰에서 `https://내앱.vercel.app/student`를 엽니다.
2. 학생이 발판(풋스위치)이나 화면을 눌러 카메라를 켭니다.
   - 무접촉 운영: 시트 `config` 탭에서 `alwaysOn`을 `Y`로 바꾸면, 교사가 아침에 화면을 한 번 눌러 켠 뒤
     하루 종일 QR 대기 상태가 유지됩니다(학생은 QR 명찰만 보여주면 시작 · 충전기 상시 연결 권장).
3. QR 명찰을 카메라에 보여주면 이름을 부르며 세션이 시작됩니다.
4. 학생이 손씻기 6단계를 수행합니다. 부족한 단계는 음성으로 안내됩니다.
5. 6단계를 모두 채우면 칭찬 음성과 점수가 나오고 Google Sheets `records` 탭에 기록됩니다.
6. 도중에 자리를 뜨면(손 미감지 `idleTimeoutSec`초, 기본 20초 · `config` 탭에서 조절) 자동 취소되고 기록되지 않습니다.
7. `/wash`는 교사 점검·연수 실습용 화면으로 유지됩니다.

## 개발 실행

```powershell
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 설계 원칙

- 실시간 손동작 판정은 브라우저에서 처리합니다.
- Apps Script는 완료 기록 저장과 샘플 묶음 저장에만 사용합니다.
- 학생 페이지는 샘플 수집 기능을 포함하지 않습니다.
- 샘플은 한 개씩 저장하지 않고 50~500개 단위로 묶어 저장합니다.
