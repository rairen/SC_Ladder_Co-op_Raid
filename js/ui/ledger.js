/* =====================================================================
   ledger.js — 공략대원 지참금 내역 팝업
   ---------------------------------------------------------------------
   지참금은 공략대원에게 붙어 있어서 레이드가 끝나도 남은 금액이 다음 레이드로 이월됩니다.
   - 진행 중인 레이드: 지금 기록(events)으로 계산한 내역 (compute 의 money)
   - 끝난 레이드: 레이드가 끝날 때 저장한 coop/players/<이름>/ledger/<레이드ID>
   ===================================================================== */
import { App } from '@app/core/app.js';
import { $, esc, fmt, squadLabel, bindModal, openModal } from '@app/core/state.js';
import { store } from '@app/core/store.js';
import { compute, listOf } from '@app/core/logic.js';
import { eventsOf } from '@app/core/boot.js';
import { fmtDate, RES_LABEL } from '@app/ui/history.js';

const KIND = {carry:'이월', deposit:'가져온 지참금', fund:'추가 지원금', gear:'장비 룰렛', repair:'장비 수리', buy:'소모품 구매', salvage:'장비 분해'};
const tm = t => { if(!t) return ''; const d = new Date(t); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); };

function groupHtml(g){
  const rows = (g.entries || []).map(x=>`<tr><td class="num hint">${tm(x.t)}</td><td>${esc(KIND[x.k] || x.k)}${x.n ? ` <span class="hint">${esc(x.n)}</span>` : ''}</td>
    <td class="r num ${x.a >= 0 ? 'd-heal' : 'd-hp'}">${x.a >= 0 ? '+' : '−'}${fmt(Math.abs(x.a))}</td><td class="r num">${fmt(x.b)}</td></tr>`).join('');
  return `<article class="lg-card">
    <header class="pr-head">${g.live ? '' : `<span class="pr-when num">${fmtDate(g.t)}</span>`}<b>${esc(g.label)}</b><b class="pr-boss">${esc(g.boss)}</b>${g.status ? `<span class="res ${g.status}">${esc(RES_LABEL[g.status] || g.status)}</span>` : ''}<span class="lg-end">${g.live ? '지금' : '남은'} <b class="num">${fmt(g.end)}</b></span></header>
    ${rows ? `<div class="tbl-wrap"><table class="mini lg-table"><thead><tr><th>시간</th><th>내용</th><th class="r">금액</th><th class="r">잔액</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="hint" style="margin:0">지참금 변동 없음</p>'}
  </article>`;
}

async function openLedger(name){
  $('lgTitle').textContent = `${name} · 지참금 내역`;
  $('lgBody').innerHTML = '<p class="hint">불러오는 중…</p>';
  openModal('lgModal', '#lgClose');
  const groups = [];
  let now = null;
  // 진행 중인 레이드
  for(const r of Object.values(App.raids)){
    if(!(r.members || []).includes(name)) continue;
    const s = compute(r, eventsOf(r.raidId));
    const end = Math.max(0, (s.fee[name] || 0) - (s.spent[name] || 0));
    now = end;
    groups.push({live: true, t: r.startedAt || 0, label: squadLabel(r), boss: r.name || '', status: s.status === 'live' ? 'live' : s.status, end, entries: (s.money && s.money[name]) || []});
  }
  // 끝난 레이드 (저장된 내역)
  const p = await store.loadPlayer(name);
  const past = p && p.ledger ? Object.values(p.ledger).map(g=>({...g, entries: listOf(g.entries)})).sort((a,b)=>(b.t||0)-(a.t||0)) : [];
  groups.push(...past);
  if(now === null) now = p ? Math.max(0, Number(p.money) || 0) : 0;
  $('lgSummary').innerHTML = `<span class="label" style="margin:0">보유 지참금</span><b class="num">${fmt(now)}</b><span class="hint">${groups.some(g=>g.live) ? '진행 중인 레이드 기준' : '다음 레이드로 이월'}</span>`;
  $('lgBody').innerHTML = groups.length ? groups.map(groupHtml).join('')
    : '<p class="empty">아직 지참금 내역이 없습니다. 레이드가 끝날 때마다 그 레이드의 내역이 쌓입니다.</p>';
}

/* 처음 한 번 실행 (js/main.js 가 파일 순서대로 부름) */
export function init(){
  bindModal('lgModal', 'lgClose');
  document.addEventListener('click', e=>{
    const b = e.target.closest('[data-ledger]'); if(!b) return;
    openLedger(b.dataset.ledger);
  });
}

export { openLedger };
