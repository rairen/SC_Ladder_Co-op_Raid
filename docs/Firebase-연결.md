# Firebase 무료 연결 방법

Firebase 를 연결하면 레이드 기록이 인터넷에 저장되어, 스트리머 각자의 방송 PC와 OBS 오버레이가 같은 레이드를 실시간으로 함께 봅니다. 연결하지 않으면 기록은 그 브라우저에만 저장됩니다.

## 무료(Spark) 요금제로 충분한가

Realtime Database 무료 한도는 **동시 접속 100개, 저장 1GB, 월 다운로드 10GB** 이고, 결제 수단 등록이 필요 없습니다. 레이드 기록은 한 판에 수백 바이트 수준이라 방송용으로는 넉넉합니다. 한도는 바뀔 수 있으니 https://firebase.google.com/pricing 에서 확인하세요.

## 1. 프로젝트 만들기

1. https://console.firebase.google.com 에 구글 계정으로 로그인합니다.
2. **프로젝트 만들기**(또는 "Firebase 프로젝트 시작하기")를 누릅니다.
3. 프로젝트 이름을 넣습니다. 예: `sc-ladder-raid`
4. Google 애널리틱스는 필요 없으니 **꺼도 됩니다**.
5. **프로젝트 만들기** → 완료되면 **계속**.

## 2. Realtime Database 만들기

1. 왼쪽 메뉴 **빌드 → Realtime Database** (메뉴가 접혀 있으면 "모든 제품"에서 찾기)
2. **데이터베이스 만들기**
3. 위치: **싱가포르 (asia-southeast1)** 를 고르면 한국에서 가장 빠릅니다.
4. 보안 규칙: **잠금 모드로 시작** 을 고르고 **사용 설정**.
5. 화면 위쪽에 보이는 주소를 복사해 둡니다.
   `https://프로젝트ID-default-rtdb.asia-southeast1.firebasedatabase.app` 형태입니다. 이것이 `databaseURL` 입니다.

> Firestore 가 아니라 **Realtime Database** 를 만들어야 합니다.

## 3. 보안 규칙 넣기

1. Realtime Database 화면의 **규칙** 탭을 엽니다.
2. 들어 있는 내용을 모두 지우고, 레포의 `database.rules.json` 내용을 그대로 붙여넣습니다.
3. **게시** 를 누릅니다.

이 규칙은 다음과 같이 동작합니다.

| 누가 | 할 수 있는 것 |
|---|---|
| 누구나 | 보기 (오버레이 포함) |
| 로그인한 사람 | 참가하기, 결과·룰렛·장비·역할 스킬 입력, 내 프로필 저장 |
| 운영자 | 레이드 열기·종료, 수치 설정, 레이드 기록 저장, 데이터 초기화 |
| 래더 수집기 | 결과 기록, 래더 조회 결과 저장 (익명 로그인) |

이 규칙은 로그인한 사람만 쓸 수 있게 하므로, 아래 "7. 로그인 켜기"의 Google 로그인도 함께 켜 두세요. 운영자는 사이트에서 등록할 수 없고, Firebase 콘솔에서만 등록·삭제합니다.

## 4. 웹 앱 등록하고 설정값 받기

1. 왼쪽 위 **프로젝트 개요** 옆 톱니바퀴 → **프로젝트 설정**
2. **일반** 탭 아래쪽 **내 앱** 에서 웹 아이콘 **`</>`** 를 누릅니다.
3. 앱 닉네임을 넣습니다. 예: `raid-web`. **Firebase 호스팅은 체크하지 않습니다** (사이트는 GitHub Pages 에 있음).
4. **앱 등록** 을 누르면 `firebaseConfig` 코드가 나옵니다.

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "sc-ladder-raid.firebaseapp.com",
  databaseURL: "https://sc-ladder-raid-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sc-ladder-raid",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "1:...:web:..."
};
```

`databaseURL` 줄이 없으면 2단계에서 복사한 주소를 직접 넣으면 됩니다.

## 5. 사이트에 넣기

레포의 `firebase-config.js` 를 열어 `"여기에_..."` 부분을 위 값으로 바꿉니다.

```js
window.RAID_FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "sc-ladder-raid.firebaseapp.com",
  databaseURL: "https://sc-ladder-raid-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sc-ladder-raid",
  appId: "1:...:web:..."
};
```

GitHub 웹에서 고칠 때: 레포에서 `firebase-config.js` → 연필 아이콘 → 값 붙여넣기 → **Commit changes**. 1~2분 뒤 사이트에 반영됩니다.

`apiKey` 같은 값은 웹 페이지에 공개되어도 되는 값입니다. 실제 보호는 3단계의 보안 규칙이 합니다.

## 6. 연결 확인

1. 사이트를 열고 Ctrl+F5 로 새로고침합니다.
2. 상단 상태 표시가 "이 브라우저에 저장" 대신 **"진행 중 · 실시간 공유"** 또는 **"레이드 없음"** 으로 바뀌면 연결된 것입니다.
3. 다른 PC나 휴대폰에서 같은 주소를 열어, 한쪽에서 결과를 넣으면 다른 쪽에도 바로 보이는지 확인합니다.
4. Firebase 콘솔의 Realtime Database **데이터** 탭에 `coop` 아래 `raid`, `events` 가 생기는 것도 확인할 수 있습니다.

## 7. 로그인 켜기

1. 왼쪽 메뉴 **빌드 → Authentication → 시작하기**
2. **로그인 방법** 탭에서 **Google** 을 눌러 **사용 설정**, 프로젝트 지원 이메일을 고르고 저장합니다.
3. 같은 탭에서 **새 제공업체 추가 → 익명** 을 눌러 **사용 설정** 합니다. 래더 점수 수집기가 이것으로 로그인합니다.
4. **설정** 탭 → **승인된 도메인** → **도메인 추가** 에 `rairen.github.io` 를 넣습니다.
5. 3단계의 보안 규칙이 최신(`users`, `admins` 항목이 있는 것)인지 확인하고, 아니면 다시 게시합니다. 예전 규칙에서는 프로필과 운영자 등록이 막힙니다.
6. 사이트에서 **구글 로그인** → 방송 닉네임과 게임 아이디를 저장합니다.
7. 운영자 등록: 운영자로 만들 사람이 사이트에 로그인해서 프로필 창의 **내 계정 ID** 를 복사해 프로젝트 주인에게 전달합니다. Firebase 콘솔 Realtime Database **데이터** 탭에서 맨 위 주소 옆 **+** → 이름 `admins` → 다시 **+** 로 하위 항목 추가 → 이름에 복사한 계정 ID, 값 `true` → **추가**.
   (`admins` 가 이미 있으면 그 안에 **+** 로 계정 ID 를 추가만 하면 됩니다.)
8. 사이트를 새로고침하면 운영자가 됩니다. 운영자를 빼려면 콘솔에서 그 줄을 삭제합니다. 사이트에서는 누구도 운영자를 추가하거나 뺄 수 없습니다.

## 자주 생기는 문제

| 증상 | 원인과 해결 |
|---|---|
| 계속 "이 브라우저에 저장" 으로 나옴 | `firebase-config.js` 에 "여기에_" 가 남아 있거나 `databaseURL` 이 비어 있음 |
| "Firebase 규칙이 쓰기를 막고 있습니다" | 3단계 규칙을 게시하지 않았음 (잠금 모드 그대로) |
| "레이드 정보를 불러오지 못했습니다" | 규칙의 `.read` 가 false 이거나 `databaseURL` 주소가 틀림 |
| 로그인 창이 바로 닫히거나 "승인된 도메인" 안내 | 7단계 4번 승인된 도메인에 `rairen.github.io` 추가 |
| 로그인했는데 프로필 저장·운영자 등록·참가가 안 됨 | 3단계 규칙을 최신 `database.rules.json` 으로 다시 게시 |
| 수집기에 "익명 로그인을 하지 못했습니다" | 7단계 3번 익명 로그인 사용 설정 |
| 고쳤는데 그대로임 | GitHub Actions 배포가 끝나지 않았거나 브라우저 캐시. 1~2분 뒤 Ctrl+F5 |

## 기존 브라우저 기록 옮기기

Firebase 를 연결하기 전 브라우저에 쌓인 기록은 자동으로 옮겨지지 않습니다. 필요하면 연결 전에 **백업 저장** 으로 파일을 받아 두세요.
