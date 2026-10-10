/* =====================================================================
   role-skill.js — 역할 스킬 사용 바, 공략대 현황에서 역할·지참금 수정
   ===================================================================== */
/* ---------- Role skill bar ---------- */
import { App } from '@app/core/app.js';
import { ROLES } from '@app/core/game-data.js';
import { $, esc } from '@app/core/state.js';
import { guard, store, toast } from '@app/core/store.js';

function renderRoleBar(s, me, canAct){
  const bar = $('roleBar');
  if(!App.raid || !App.selected || !s.members.includes(App.selected)){ bar.hidden = true; return; }
  const rk = s.role[App.selected] || 'dealer', sk = s.RS[rk], g = s.gauge[App.selected] ?? 0, need = s.needG[App.selected] ?? s.G.max, full = g >= need, alive = (s.mhp[App.selected] ?? 1) > 0;
  const mine = !me || me === App.selected;
  bar.hidden = false;
  bar.innerHTML = `<div class="rb-text"><span class="role-tag ${rk}">${ROLES[rk].short}</span><b>${esc(ROLES[rk].label)} · ${esc(sk.name)}</b>
      <small>${esc(ROLES[rk].desc(sk.v))}</small></div>
    <div class="sk-actions"><button type="button" class="btn skill" id="useRole"${(canAct && mine && full && alive) ? '' : ' disabled'}>스킬 사용</button></div>`;
}

/* 처음 한 번 실행: 화면 이벤트 연결, 초기값 설정 (js/main.js 가 파일 순서대로 부름) */
export function init(){

  document.addEventListener('click', e=>{
    if(e.target.id !== 'useRole' || e.target.disabled || !App.raid || !App.selected) return;
    const who = App.selected;
    guard(async()=>{ await store.addEvent({raidId:App.raid.raidId, t:Date.now(), type:'role', member:who, undone:false}); toast(`${who} 역할 스킬 사용`); });
  });
  /* 공략대 현황에서 역할·지참금 고치기 */
  $('partyBody').addEventListener('change', e=>{
    const r = e.target.closest('[data-rrole]'), f = e.target.closest('[data-rfee]');
    if(r) guard(async()=>{ await store.setRoster(r.dataset.rrole, {role:r.value}); await store.partyLog(r.dataset.rrole, 'role', {role:r.value}); });
    if(f){ const fee = Math.max(0, Math.round(Number(f.value)||0)); guard(async()=>{ await store.setRoster(f.dataset.rfee, {fee}); await store.partyLog(f.dataset.rfee, 'fee', {fee}); }); }
  });
}


export { renderRoleBar };
