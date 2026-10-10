/* =====================================================================
   player-raids.js — 공략대원 참여 레이드 팝업
   ---------------------------------------------------------------------
   명예의 전당·개인 랭킹의 "참여 / 레이드" 숫자를 누르면, 그 공략대원이 참여한
   레이드 목록과 각 레이드의 보스 스펙(HP, 분노, 회복, 보스 스킬)을 보여줍니다.
   ===================================================================== */
import { App } from '@app/core/app.js';
import { PRESETS, ROLES } from '@app/core/game-data.js';
import { $, esc, fmt, squadLabel, bindModal, openModal } from '@app/core/state.js';
import { compute } from '@app/core/logic.js';
import { eventsOf } from '@app/core/boot.js';
import { bossSpecOf, specOfHist, bossSpecHtml, fmtDate, RES_LABEL } from '@app/ui/history.js';

/* 이 공략대원이 참여한 레이드: 진행 중 + 끝난 기록 */
function raidsOf(name){
  const out = [];
  for(const r of Object.values(App.raids)){
    if(!(r.members || []).includes(name)) continue;
    const s = compute(r, eventsOf(r.raidId)), x = s.stats[name] || {};
    out.push({label: squadLabel(r), boss: r.name || '이름 없는 보스', status: s.status === 'live' ? 'live' : s.status, t: r.startedAt || 0, live: true,
      spec: bossSpecOf(r, s), hpLeft: s.hp, me: {w: x.w||0, l: x.l||0, dmg: x.dmg||0, role: s.role[name]}});
  }
  for(const h of App.history){
    if(App.raids[h.raidId] || h.status === 'live') continue;
    const x = (h.members || {})[name]; if(!x) continue;
    out.push({label: h.squadLabel || '', boss: h.name || '이름 없는 보스', status: h.status, t: h.endedAt || h.startedAt || 0, live: false,
      spec: specOfHist(h), hpLeft: h.hpLeft, mvp: h.mvp === name, me: {w: x.w||0, l: x.l||0, dmg: x.dmg||0, role: x.role}});
  }
  return out.sort((a,b)=> (b.live - a.live) || (b.t - a.t));
}

function openPlayerRaids(name){
  const list = raidsOf(name);
  const live = list.filter(x=>x.live).length;
  $('prTitle').textContent = `${name} · 참여 레이드 ${list.length}회${live ? ` (진행 중 ${live} 포함)` : ''}`;
  $('prBody').innerHTML = list.length ? list.map(x=>{
    const rk = x.me.role && ROLES[x.me.role] ? x.me.role : '';
    return `<article class="pr-card">
      <header class="pr-head">${x.live ? '' : `<span class="pr-when num">${fmtDate(x.t)}</span>`}<b>${esc(x.label)}</b><b class="pr-boss">${esc(x.boss)}</b>
        <span class="hint">${esc((PRESETS[x.spec.diff]||PRESETS.custom).label)}</span><span class="res ${x.status}">${esc(RES_LABEL[x.status] || x.status)}</span>${x.mvp ? '<span class="mvp">MVP</span>' : ''}</header>
      <div class="pr-me">${rk ? `<span class="role-tag ${rk}">${ROLES[rk].short}</span>${ROLES[rk].label} · ` : ''}데미지 <b class="num">${fmt(x.me.dmg)}</b> · ${x.me.w}승 ${x.me.l}패 · 남은 보스 HP ${fmt(x.hpLeft)} / ${fmt(x.spec.maxHp)}</div>
      ${bossSpecHtml(x.spec)}
    </article>`;
  }).join('') : '<p class="empty">참여한 레이드가 없습니다.</p>';
  openModal('prModal', '#prClose');
}

/* 처음 한 번 실행 (js/main.js 가 파일 순서대로 부름) */
export function init(){
  bindModal('prModal', 'prClose');
  document.addEventListener('click', e=>{
    const b = e.target.closest('[data-praids]'); if(!b) return;
    openPlayerRaids(b.dataset.praids);
  });
}

export { openPlayerRaids, raidsOf };
