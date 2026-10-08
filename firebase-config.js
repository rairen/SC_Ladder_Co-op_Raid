/* =====================================================================
   Firebase 연결 설정
   ---------------------------------------------------------------------
   Firebase 콘솔 > 프로젝트 설정(톱니바퀴) > 일반 > 내 앱(웹 </>) 에 있는
   firebaseConfig 값을 아래에 그대로 옮겨 적으세요.

   - 값이 "여기에_..." 그대로면 Firebase 를 쓰지 않고, 기록은 그 브라우저에만 저장됩니다.
   - databaseURL 은 반드시 있어야 합니다. Realtime Database 화면 위쪽 주소
     (https://...firebasedatabase.app) 를 복사해 넣으세요.
   - 이 값들은 웹 페이지에 공개되어도 되는 값입니다. 실제 보호는
     database.rules.json 의 보안 규칙이 담당합니다.
   ===================================================================== */
window.RAID_FIREBASE_CONFIG = {
  apiKey: "여기에_apiKey",
  authDomain: "여기에_프로젝트ID.firebaseapp.com",
  databaseURL: "여기에_https://프로젝트ID-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "여기에_프로젝트ID",
  appId: "여기에_appId"
};
