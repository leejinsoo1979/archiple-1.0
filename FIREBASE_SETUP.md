# Firebase 설정 가이드

Export 링크 공유 기능을 사용하려면 Firebase를 설정해야 합니다.

## 1. Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com/)에 접속
2. "프로젝트 추가" 클릭
3. 프로젝트 이름 입력 (예: archiple-1-0)
4. Google Analytics는 선택사항 (필요 없으면 비활성화)
5. 프로젝트 생성 완료

## 2. 웹 앱 추가

1. Firebase Console에서 프로젝트 선택
2. 좌측 메뉴에서 "프로젝트 설정" (톱니바퀴 아이콘) 클릭
3. 아래로 스크롤해서 "내 앱" 섹션 찾기
4. 웹 아이콘(`</>`) 클릭
5. 앱 닉네임 입력 (예: archiple-web)
6. "Firebase Hosting 설정" 체크 해제
7. "앱 등록" 클릭
8. Firebase 설정 코드에서 `firebaseConfig` 객체의 값들 복사

## 3. Firestore 데이터베이스 생성

1. 좌측 메뉴에서 "Firestore Database" 클릭
2. "데이터베이스 만들기" 클릭
3. **테스트 모드로 시작** 선택 (공개 읽기/쓰기 허용)
4. 위치 선택: `asia-northeast3 (Seoul)` 권장
5. "사용 설정" 클릭

## 4. 환경 변수 설정

1. 프로젝트 루트에 `.env` 파일 생성:
```bash
cp .env.example .env
```

2. `.env` 파일을 열고 Firebase 설정 값 입력:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## 5. Vercel 환경 변수 설정

1. [Vercel Dashboard](https://vercel.com/dashboard) 접속
2. archiple-1-0 프로젝트 선택
3. Settings → Environment Variables
4. 다음 6개 변수 추가:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

5. 각 변수에 Firebase 설정값 입력
6. "Save" 클릭
7. 프로젝트 재배포

## 6. 테스트

1. 로컬에서 테스트:
```bash
npm run dev
```

2. 에디터에서 프로젝트 생성
3. Export → 링크로 내보내기
4. 생성된 링크를 다른 브라우저나 기기에서 열기
5. 정상적으로 3D 뷰가 로드되면 성공!

## 보안 규칙 (선택사항)

현재는 테스트 모드로 설정되어 있어 누구나 읽기/쓰기가 가능합니다.
프로덕션 환경에서는 Firestore 보안 규칙을 설정해야 합니다:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{projectId} {
      // 누구나 읽기 가능, 쓰기는 1시간 내 생성된 것만
      allow read: if true;
      allow create: if request.time == request.resource.data.timestamp;
      allow update, delete: if false;
    }
  }
}
```
