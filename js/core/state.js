/* =====================================================================
   state.js — 공통 도우미와 화면 상태 변수
   ===================================================================== */
import { App } from '@app/core/app.js';

const $ = id => document.getElementById(id);
const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const CUR_KEY = 'sc-boss-raid:cur:coop';
const squadLabel = r => r && r.squad ? `${r.squad}공략대` : '공략대';
// 방 코드: 주소 끝에 ?room=코드 를 붙이면 그룹별로 레이드가 분리됩니다.
const OVERLAY = document.documentElement.classList.contains('overlay');
/* 테스트 모드: 주소 끝에 ?test=1. 이 탭에서만 유지되는 테스트 계정(익명 로그인)으로 스트리머 화면을 시험합니다.
   탭마다 다른 계정이라, 탭을 여러 개 열면 여러 명의 스트리머로 시험할 수 있습니다. */
const TEST = !OVERLAY && (()=>{ try{ return new URLSearchParams(location.search).get('test') === '1'; }catch(_){ return false; } })();
if(TEST) document.documentElement.classList.add('testmode');
/* 게임 모드. 나중에 '래더 보스 레이드 대전' 버전을 추가하면 'versus'처럼 다른 값을 써서 데이터가 섞이지 않게 합니다. */
const MODE = 'coop';
const ROOM = MODE;
const base = () => MODE;

/* 처음 한 번 실행: 화면 이벤트 연결, 초기값 설정 (js/main.js 가 파일 순서대로 부름) */
export function init(){


  App.db = null; App.local = false; App.readOnly = false; App.online = false;
  App.history = []; App.histTab = 'hist'; App.openHist = null;
  App.raid = null; App.events = []; App.unsubEvents = null; App.subRaidId = null;
  App.ladderSnap = {}; App.collector = null; App.unsubLadder = null;     // 래더 자동 수집 (Firebase 연결 때만)
  /* 던전: 공략대 여럿이 동시에 레이드. raids = 진행 중인 모든 공략대, raid/events/ladderSnap = 지금 보고 있는 공략대 */
  App.raids = {}; App.allEvents = {}; App.allLadder = {}; App.curRid = ''; App.eventsReady = false;
  try{ App.curRid = new URLSearchParams(location.search).get('raid') || localStorage.getItem(CUR_KEY) || ''; }catch(_){}
  /* 예전 '방(main)' 데이터가 이 브라우저에 있으면 협동 모드로 한 번만 옮깁니다. */
  (function migrate(){
    try{
      const pairs = [['sc-boss-raid:main','sc-boss-raid:'+MODE],['sc-boss-raid:history:main','sc-boss-raid:history:'+MODE],['sc-boss-raid:me:main','sc-boss-raid:me:'+MODE]];
      for(const [from,to] of pairs){ const v = localStorage.getItem(from); if(v !== null && localStorage.getItem(to) === null) localStorage.setItem(to, v); }
      ['sc-boss-raid:room','sc-boss-raid:rooms'].forEach(k=>localStorage.removeItem(k));
    }catch(_){}
  })();
  App.selected = null; App.isWin = true; App.diff = 'normal'; App.confirmArm = false; App.spinning = false;
  App.lastState = null;
}


/* 팝업(모달) 공통: 바깥 클릭·Esc·닫기 버튼으로 닫힘. bindModal('ladderModal', 'ladderClose') */
function bindModal(id, closeId, onClose){
  const el = document.getElementById(id), close = ()=>{ el.hidden = true; if(onClose) onClose(); };
  if(closeId) document.getElementById(closeId).addEventListener('click', close);
  el.addEventListener('click', e=>{ if(e.target === el) close(); });
  el.addEventListener('keydown', e=>{ if(e.key === 'Escape') close(); });
  return close;
}
function openModal(id, focusSel){
  const el = document.getElementById(id); el.hidden = false;
  const f = focusSel ? el.querySelector(focusSel) : el.querySelector('button, input, select');
  if(f) setTimeout(()=>f.focus(), 0);
}

export { $, esc, fmt, CUR_KEY, squadLabel, OVERLAY, TEST, MODE, ROOM, base, bindModal, openModal };
