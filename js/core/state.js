/* =====================================================================
   state.js — 공통 도우미와 화면 상태 변수
   ===================================================================== */
import { App } from '@app/core/app.js';

const $ = id => document.getElementById(id);
const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const CUR_KEY = 'sc-boss-raid:cur:coop';
const squadLabel = r => r && r.squad ? `${r.squad}공략대` : '공략대';
/* 공략대장: 운영자가 연 공략대(본부 모집)에 처음 참가한 공략대원. raid.lead = {uid, name} */
const leadName = r => (r && r.lead && r.lead.name && (r.members || []).includes(r.lead.name)) ? r.lead.name : '';
/* 공략대 별칭: "닉네임 공략대". 공략대장이 없으면 본부 모집 공략대 */
const squadAlias = r => leadName(r) ? `${leadName(r)} 공략대` : '본부 모집 공략대';
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


/* 첫 로딩 화면: 필요한 데이터가 모두 도착하면(bootNeed 로 정한 항목이 bootReady 로 다 오면) 걷어냄.
   네트워크가 느리거나 실패해도 10초 뒤에는 화면을 보여 줌 */
const BOOT = {need: null, got: new Set()};
function bootFinish(){
  const r = document.documentElement; if(!r.classList.contains('booting')) return;
  requestAnimationFrame(()=>{ r.classList.remove('booting'); const l = document.getElementById('bootLoader'); if(l){ l.classList.add('done'); setTimeout(()=>l.remove(), 450); } });
}
function bootCheck(){ if(!BOOT.need) return; for(const k of BOOT.need) if(!BOOT.got.has(k)) return; bootFinish(); }
function bootNeed(keys){ BOOT.need = new Set(keys); bootCheck(); }
function bootReady(...keys){ keys.forEach(k=>BOOT.got.add(k)); bootCheck(); }
setTimeout(bootFinish, 10000);

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

/* ---------- 오류 알림 ----------
   예상하지 못한 오류가 나면 화면 위에 안내 줄을 띄움 (새로고침 버튼). 같은 오류는 30초에 한 번만.
   방송 오버레이에서는 화면을 가리지 않도록 콘솔에만 남김 */
let lastErr = '', lastErrAt = 0;
function reportError(err, where = ''){
  const msg = String((err && (err.message || err.reason && err.reason.message)) || err || '알 수 없는 오류');
  console.error('[스타 보스 공략대]', where, err);
  if(OVERLAY) return;
  const t = Date.now(); if(msg === lastErr && t - lastErrAt < 30000) return;
  lastErr = msg; lastErrAt = t;
  let bar = document.getElementById('errBar');
  if(!bar){
    bar = document.createElement('div'); bar.id = 'errBar'; bar.className = 'err-bar'; bar.setAttribute('role', 'alert');
    bar.innerHTML = '<span class="eb-tx"></span><button type="button" class="btn sm primary" data-eb="reload">새로고침</button><button type="button" class="btn sm" data-eb="close">닫기</button>';
    bar.addEventListener('click', e=>{ const b = e.target.closest('[data-eb]'); if(!b) return; if(b.dataset.eb === 'reload') location.reload(); else bar.hidden = true; });
    document.body.appendChild(bar);
  }
  bar.hidden = false;
  bar.querySelector('.eb-tx').textContent = `문제가 생겼습니다${where ? ` (${where})` : ''}. 화면이 이상하면 새로고침하세요. 계속되면 건의·문의로 알려 주세요. · ${msg.slice(0, 120)}`;
}
/* 이 사이트 파일에서 난 오류만 (브라우저 확장 프로그램 오류는 무시) */
function ownError(e){ const f = (e && (e.filename || (e.reason && e.reason.stack) || (e.error && e.error.stack))) || ''; return !f || f.includes(location.host) || f.includes('/js/'); }
if(typeof window !== 'undefined'){
  window.addEventListener('error', e=>{ if(ownError(e)) reportError(e.error || e.message, ''); });
  window.addEventListener('unhandledrejection', e=>{ if(ownError(e)) reportError(e.reason, ''); });
}

/* 서버 기준 현재 시각 (ms). 각자 PC 시계가 틀려도 기록 순서·본부지원 시간이 어긋나지 않게 Firebase 서버 시각 차이를 더함 */
function now(){ return Date.now() + (Number(App.timeOffset) || 0); }

export { now, reportError, bootNeed, bootReady, bootFinish, $, esc, fmt, CUR_KEY, squadLabel, squadAlias, leadName, OVERLAY, TEST, MODE, ROOM, base, bindModal, openModal };
