/* =====================================================================
   updates.js — 화면 맨 위 업데이트 줄과 업데이트 내역 팝업
   ---------------------------------------------------------------------
   내용은 js/core/changelog.js 에서 고칩니다. 최신 묶음의 id 를 아직 안 본 방문자에게는 NEW 표시.
   ===================================================================== */
import { CHANGELOG } from '@app/core/changelog.js';
import { $, OVERLAY, esc, bindModal, openModal } from '@app/core/state.js';

const SEEN_KEY = 'sc-boss-raid:updSeen';
const fmtDay = d => { const [y, m, dd] = d.split('-'); return `${+m}월 ${+dd}일`; };
function seen(){ try{ return localStorage.getItem(SEEN_KEY) || ''; }catch(_){ return ''; } }
function markSeen(){ try{ localStorage.setItem(SEEN_KEY, CHANGELOG[0].id); }catch(_){} }

function renderBar(){
  const bar = $('updBar');
  if(OVERLAY || !CHANGELOG.length){ bar.hidden = true; return; }
  const top = CHANGELOG[0], fresh = seen() !== top.id;
  bar.hidden = false;
  bar.innerHTML = `<span class="upd-tag">업데이트</span>${fresh ? '<span class="upd-new">NEW</span>' : ''}
    <span class="upd-date num">${esc(fmtDay(top.date))}</span>
    <span class="upd-text">${top.items.slice(0, 3).map((x,i)=>`<span class="upd-it">${i ? '<i>·</i>' : ''}${esc(x)}</span>`).join('')}${top.items.length > 3 ? `<span class="hint upd-etc upd-d"><i>·</i>외 ${top.items.length - 3}개</span>` : ''}${top.items.length > 1 ? `<span class="hint upd-etc upd-mo"><i>·</i>외 ${top.items.length - 1}개</span>` : ''}</span>
    <button type="button" class="linkbtn upd-more" id="updOpen">업데이트 내역</button>`;
}

function openUpdates(){
  $('updBody').innerHTML = CHANGELOG.map(g=>`<section class="upd-group"><h3 class="upd-day">${esc(fmtDay(g.date))}<span class="hint num">${esc(g.date)}</span></h3>
    <ul>${g.items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`).join('');
  openModal('updModal', '#updClose');
  markSeen(); renderBar();
}

/* 처음 한 번 실행 (js/main.js 가 파일 순서대로 부름) */
export function init(){
  renderBar();
  bindModal('updModal', 'updClose');
  document.addEventListener('click', e=>{ if(e.target.closest('#updOpen')) openUpdates(); });
}

export { renderBar, openUpdates };
