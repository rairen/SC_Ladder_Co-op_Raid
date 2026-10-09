/* =====================================================================
   role-skill.js — 역할 스킬 사용 바, 파티 현황에서 역할·입장료 수정
   ===================================================================== */
/* ---------- Role skill bar ---------- */
function renderRoleBar(s, me, canAct){
  const bar = $('roleBar');
  if(!raid || !selected || !s.members.includes(selected)){ bar.hidden = true; return; }
  const rk = s.role[selected] || 'dealer', sk = s.RS[rk], g = s.gauge[selected] ?? 0, need = s.needG[selected] ?? s.G.max, full = g >= need, alive = (s.mhp[selected] ?? 1) > 0;
  const mine = !me || me === selected;
  bar.hidden = false;
  bar.innerHTML = `<div class="rb-text"><span class="role-tag ${rk}">${ROLES[rk].short}</span><b>${esc(ROLES[rk].label)} · ${esc(sk.name)}</b>
      <small>${esc(ROLES[rk].desc(sk.v))}</small>${gearHtml(s, selected)}</div>
    <div class="sk-actions"><span class="gauge-mini${full?' full':''}" style="width:90px"><i style="width:${Math.min(100,g/need*100)}%"></i></span><span class="num">${g}/${need}</span>
    <button type="button" class="btn skill" id="useRole"${(canAct && mine && full && alive) ? '' : ' disabled'}>스킬 사용</button></div>`;
}
document.addEventListener('click', e=>{
  if(e.target.id !== 'useRole' || e.target.disabled || !raid || !selected) return;
  const who = selected;
  guard(async()=>{ await store.addEvent({raidId:raid.raidId, t:Date.now(), type:'role', member:who, undone:false}); toast(`${who} 역할 스킬 사용`); });
});
/* 파티 현황에서 역할·입장료 고치기 */
$('partyBody').addEventListener('change', e=>{
  const r = e.target.closest('[data-rrole]'), f = e.target.closest('[data-rfee]');
  if(r) guard(async()=>{ await store.setRoster(r.dataset.rrole, {role:r.value}); await store.partyLog(r.dataset.rrole, 'role', {role:r.value}); });
  if(f){ const fee = Math.max(0, Math.round(Number(f.value)||0)); guard(async()=>{ await store.setRoster(f.dataset.rfee, {fee}); await store.partyLog(f.dataset.rfee, 'fee', {fee}); }); }
});
