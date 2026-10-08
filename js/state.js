/* =====================================================================
   state.js — 공통 도우미와 화면 상태 변수
   ===================================================================== */
const $ = id => document.getElementById(id);
const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Math.round(n).toLocaleString('ko-KR');

let db = null, local = false, readOnly = false, online = false;
let history = [], histTab = 'hist', openHist = null;
let raid = null, events = [], unsubEvents = null, subRaidId = null;
// 방 코드: 주소 끝에 ?room=코드 를 붙이면 그룹별로 레이드가 분리됩니다.
const OVERLAY = document.documentElement.classList.contains('overlay');
/* 게임 모드. 나중에 '래더 보스 레이드 대전' 버전을 추가하면 'versus'처럼 다른 값을 써서 데이터가 섞이지 않게 합니다. */
const MODE = 'coop';
const ROOM = MODE;
const base = () => MODE;
/* 예전 '방(main)' 데이터가 이 브라우저에 있으면 협동 모드로 한 번만 옮깁니다. */
(function migrate(){
  try{
    const pairs = [['sc-boss-raid:main','sc-boss-raid:'+MODE],['sc-boss-raid:history:main','sc-boss-raid:history:'+MODE],['sc-boss-raid:me:main','sc-boss-raid:me:'+MODE]];
    for(const [from,to] of pairs){ const v = localStorage.getItem(from); if(v !== null && localStorage.getItem(to) === null) localStorage.setItem(to, v); }
    ['sc-boss-raid:room','sc-boss-raid:rooms'].forEach(k=>localStorage.removeItem(k));
  }catch(_){}
})();
let selected = null, isWin = true, diff = 'normal', confirmArm = false, spinning = false;
let lastState = null;
