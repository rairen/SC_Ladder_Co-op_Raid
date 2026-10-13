/* =====================================================================
   hq.js — 본부지원
   ---------------------------------------------------------------------
   레이드 설정에서 켰을 때만 동작 (기본 사용 안 함).
   레이드 시작부터 난이도별 간격마다 본부지원이 도착하고, 받을 수 있는 시간 안에 공략대원 누구든
   "본부지원 받기"를 누르면 목록(js/core/game-data.js 의 HQ_SUPPORT)에서 비중대로 하나가 정해져 적용됩니다.
   기록: {type:'hq', slot:회차, item:id}. 같은 회차는 먼저 받은 기록만 반영 (js/core/logic.js)
   ===================================================================== */
import { App } from '@app/core/app.js';
import { HQ_SUPPORT, HQ_TYPES, PRESETS } from '@app/core/game-data.js';
import { $, OVERLAY, esc, fmt, bindModal, openModal } from '@app/core/state.js';
import { guard, store, toast } from '@app/core/store.js';
import { hqEveryMin, hqSlot, hqPick, settingsOf } from '@app/core/logic.js';
import { myName } from '@app/core/boot.js';

const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2,'0') : m) + ':' + String(x).padStart(2,'0'); };

/* 지금 시각 기준: 받을 수 있는 회차(open) 또는 다음 도착 회차(next) */
function hqNow(s){
  const r = App.raid, S = s.S, now = Date.now();
  const every = hqEveryMin(r) * 60000, start = r.startedAt || now;
  const k = Math.floor((now - start) / every);
  if(k >= 1){
    const sl = hqSlot(r, S, k);
    if(now <= sl.until && !s.hq.claimed[k]) return {open: sl};
  }
  return {next: hqSlot(r, S, Math.max(1, k + 1))};
}

/* 방송 오버레이 (?overlay=1&view=hq): 남은 시간 · 도착 알림 · 받은 지원 */
let ovlSeenK = null;
function renderHqOverlay(s){
  const box = $('hqOvl'); if(!box) return;
  const on = OVERLAY && document.documentElement.classList.contains('ovl-hq');
  box.hidden = !on; if(!on) return;
  if(!App.raid || !s){ box.innerHTML = '<div class="ho-head"><b>본부지원</b></div><div class="ho-main ho-dim">레이드 대기 중</div>'; return; }
  if(!s.hq || !s.hq.on){ box.innerHTML = '<div class="ho-head"><b>본부지원</b></div><div class="ho-main ho-dim">이 레이드는 본부지원을 쓰지 않습니다</div>'; return; }
  const live = s.status === 'live', w = live ? hqNow(s) : null, last = s.hq.last, it = last && HQ_SUPPORT.find(x=>x.id === last.id);
  const fresh = last && ovlSeenK !== null && last.k !== ovlSeenK;
  if(last) ovlSeenK = last.k; else if(ovlSeenK === null) ovlSeenK = 0;
  const main = !live ? '<div class="ho-main ho-dim">레이드 종료</div>'
    : w.open ? `<div class="ho-main ho-ready"><span>${w.open.k}회차 본부지원 도착!</span><b class="num" data-hqleft="${w.open.until}">${mmss(w.open.until - Date.now())}</b></div>`
    : `<div class="ho-main"><span>다음 본부지원</span><b class="num" data-hqnext="${w.next.at}">${mmss(w.next.at - Date.now())}</b></div>`;
  box.className = 'hq-ovl' + (live && w.open ? ' ready' : '');
  box.innerHTML = `<div class="ho-head"><b>본부지원</b><span>${hqEveryMin(App.raid)}분마다</span></div>${main}
    ${it ? `<div class="ho-last${fresh ? ' fresh' : ''}"><span class="hq-tag ${it.type}">${HQ_TYPES[it.type]}</span><b>${esc(it.name)}</b><span>${esc(it.desc(it.v))}</span></div>` : ''}`;
}

function renderHq(s){
  renderHqOverlay(s);
  const box = $('hqBox'); if(!box) return;
  const on = !OVERLAY && !!App.raid && s && s.hq && s.hq.on;
  box.hidden = !on;
  if(!on) return;
  const live = s.status === 'live', canAct = live && !App.readOnly && s.members.length > 0;
  const w = hqNow(s), last = s.hq.last, lastIt = last && HQ_SUPPORT.find(x=>x.id === last.id);
  const lastHtml = lastIt ? `<span class="hint hq-last">지난 지원 ${last.k}회차 · <span class="hq-tag ${lastIt.type}">${HQ_TYPES[lastIt.type]}</span> ${esc(lastIt.name)}</span>` : '';
  let main;
  if(!live) main = '<span class="hint">레이드가 끝나 본부지원이 멈췄습니다.</span>';
  else if(w.open) main = `<b class="hq-ready">${w.open.k}회차 본부지원 도착</b><span class="hint num" data-hqleft="${w.open.until}">남은 ${mmss(w.open.until - Date.now())}</span>
      <button type="button" class="btn primary sm" id="hqClaim" data-slot="${w.open.k}"${canAct ? '' : ' disabled'}>본부지원 받기</button>`;
  else main = `<span>다음 본부지원 <b class="num" data-hqnext="${w.next.at}">${mmss(w.next.at - Date.now())}</b></span><span class="hint">${w.next.k}회차 · ${hqEveryMin(App.raid)}분마다</span>`;
  box.className = 'hq-box' + (live && w.open ? ' ready' : '');
  box.innerHTML = `<span class="hq-title">본부지원</span>${main}${lastHtml}<button type="button" class="linkbtn hq-list" id="hqListBtn">지원 목록</button>`;
}

/* 1초마다 남은 시간만 갱신 (회차가 바뀌면 다시 그림) */
function tick(){
  const ob = $('hqOvl');
  if(ob && !ob.hidden && App.lastState){
    const now = Date.now(), l = ob.querySelector('[data-hqleft]'), n = ob.querySelector('[data-hqnext]');
    if(l){ const u = +l.dataset.hqleft; if(now > u) renderHqOverlay(App.lastState); else l.textContent = mmss(u - now); }
    else if(n){ const a = +n.dataset.hqnext; if(now >= a) renderHqOverlay(App.lastState); else n.textContent = mmss(a - now); }
  }
  const box = $('hqBox'); if(!box || box.hidden || !App.lastState) return;
  const now = Date.now();
  const left = box.querySelector('[data-hqleft]'), next = box.querySelector('[data-hqnext]');
  if(left){ const u = +left.dataset.hqleft; if(now > u) renderHq(App.lastState); else left.textContent = '남은 ' + mmss(u - now); }
  else if(next){ const a = +next.dataset.hqnext; if(now >= a) renderHq(App.lastState); else next.textContent = mmss(a - now); }
}

function openHqList(){
  const tot = HQ_SUPPORT.reduce((a,x)=>a+x.w,0) || 1, pct = w => Math.round(w / tot * 1000) / 10;
  const S = settingsOf(App.raid);
  const group = type => { const list = HQ_SUPPORT.filter(x=>x.type === type), sum = list.reduce((a,x)=>a+x.w,0);
    return `<h3 class="label" style="margin:6px 0 4px"><span class="hq-tag ${type}">${HQ_TYPES[type]}</span> ${type === 'supply' ? '공략대원에게 도움' : '보스 약화'} · 합계 ${pct(sum)}%</h3>
      <div class="tbl-wrap"><table class="sk-table"><thead><tr><th>지원</th><th>효과</th><th class="r">확률</th></tr></thead><tbody>
      ${list.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td class="desc">${esc(x.desc(x.v))}</td><td class="r num">${pct(x.w)}%</td></tr>`).join('')}</tbody></table></div>`; };
  const cur = App.raid ? `이 레이드: <b>${S.hq.on ? '사용' : '사용 안 함'}</b>${S.hq.on ? ` · ${hqEveryMin(App.raid)}분마다` : ''} · ` : '';
  $('hqBody').innerHTML = `<p class="sk-note">${cur}레이드 시작부터 난이도별 간격마다 본부지원이 도착합니다. 도착 후 <b>${fmt(S.hq.claimMin)}분</b> 안에 공략대원 누구든 <b>본부지원 받기</b>를 누르면 아래 확률로 하나가 정해져 공략대 전체에 적용되고, 시간 안에 받지 않으면 그 회차는 사라집니다. 사용 여부는 레이드 시작 전 <b>수치 설정 → 레이드 설정</b>에서 정합니다.</p>
    <div class="tbl-wrap"><table class="sk-table"><thead><tr><th>난이도</th>${['light','normal','hard'].map(k=>`<th class="r">${PRESETS[k].label}</th>`).join('')}<th class="r">커스텀</th></tr></thead>
      <tbody><tr><td><b>지원 간격</b></td>${['light','normal','hard'].map(k=>`<td class="r num">${PRESETS[k].hqMin}분</td>`).join('')}<td class="r num">30분</td></tr></tbody></table></div>
    ${group('supply')}${group('attack')}`;
  openModal('hqModal', '#hqClose');
}

/* 처음 한 번 실행 (js/main.js 가 파일 순서대로 부름) */
export function init(){
  bindModal('hqModal', 'hqClose');
  setInterval(tick, 1000);
  document.addEventListener('click', e=>{
    if(e.target.closest('#hqListBtn, [data-hqlist]')){ openHqList(); return; }
    const b = e.target.closest('#hqClaim'); if(!b || b.disabled || !App.raid || !App.lastState) return;
    const s = App.lastState, who = myName(s) || App.selected || s.members[0], slot = +b.dataset.slot, item = hqPick();
    const it = HQ_SUPPORT.find(x=>x.id === item);
    b.disabled = true;
    guard(async()=>{
      /* 본부지원은 공략대 전체 기준: 기록의 주체는 '본부'(member 없음), 누른 사람은 by 로만 남김 */
      await store.addEvent({raidId: App.raid.raidId, t: Date.now(), type: 'hq', member: '', by: who || '', slot, item, undone: false});
      toast(`본부지원 ${slot}회차 · ${HQ_TYPES[it.type]} · ${it.name}: ${it.desc(it.v)}`);
    });
  });
}

export { renderHq, renderHqOverlay, openHqList };
