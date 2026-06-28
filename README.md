# 손씻기 코칭 연수 앱

Vercel에 배포하고, Google Sheets 사본을 백엔드로 사용하는 손씻기 6단계 코칭 앱입니다.

- `/collect`: 휴대폰/패드 카메라로 손씻기 동작 샘플 수집
- `/wash`: 학생 손씻기 실행, 부족 단계 음성 안내, 완료 기록 저장
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

아래 Deploy Button의 `repository-url`은 실제 GitHub 저장소 주소로 바꿔 사용하세요.

```md
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_ID%2Fhandwash-school&env=APPS_SCRIPT_URL,APP_SHARED_SECRET,TRAINER_CODE&envDescription=Apps%20Script%20web%20app%20URL%20and%20optional%20secrets&project-name=handwash-school&repository-name=handwash-school)
```

Vercel 환경변수:

- `APPS_SCRIPT_URL`: Apps Script 웹앱 `/exec` URL
- `APP_SHARED_SECRET`: 선택. Apps Script `setSecret` 값과 같게 입력
- `TRAINER_CODE`: 선택. `/collect` 샘플 업로드를 제한하는 교사용 코드

### 3. 수업 전 샘플 수집

1. 휴대폰 또는 패드에서 `https://내앱.vercel.app/collect`를 엽니다.
2. 실제 수돗가에서 사용할 각도로 기기를 고정합니다.
3. `카메라 시작`을 누릅니다.
4. `샘플 세트 이름`을 입력합니다. 예: `3학년_보건실`
5. 라벨을 선택하고 `연속 수집`으로 샘플을 모읍니다.
6. 6단계와 `기타/대기`를 모두 수집합니다.
7. `묶음 업로드`를 눌러 Google Sheets에 저장합니다.
8. Google Sheets `config` 탭의 `activeSampleSet` 값을 사용할 샘플 세트 이름으로 맞춥니다.

권장 수량:

- 각 단계 50개 이상
- 가능하면 각 단계 100개 이상
- `기타/대기`도 반드시 50개 이상

### 4. 학생 실행

1. 공용 패드 또는 교사용 휴대폰에서 `https://내앱.vercel.app/wash`를 엽니다.
2. `카메라 시작`을 누릅니다.
3. 학생 QR을 보여주거나 수동 학생 ID를 입력합니다.
4. 학생이 손씻기 6단계를 수행합니다.
5. 부족한 단계는 음성으로 안내됩니다.
6. 완료되면 Google Sheets `records` 탭에 기록됩니다.

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
