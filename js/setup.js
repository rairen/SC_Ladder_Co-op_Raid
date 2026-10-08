/* =====================================================================
   setup.js — 새 레이드 만들기 화면, 레이드 종료, 보스 이름
   ===================================================================== */
/* ---------- Setup ---------- */
function renderDiffs(){
  $('diffs').innerHTML = Object.entries(PRESETS).map(([k,p])=>
    `<button type="button" class="diff" data-d="${k}" aria-pressed="${k===diff}"><span class="dn">${p.label}</span><span class="dd">${k==='custom' ? p.desc : `HP ${p.hp} +인원당 ${p.bonus} · 분노 최대 ${p.rage} · 회복 ${p.rec}%`}</span></button>`).join('');
  $('customBox').hidden = diff !== 'custom';
  updateSetupPreview();
}
let setupList = [], setupRoles = {};
const roleOptions = sel => Object.entries(ROLES).map(([k,v])=>`<option value="${k}"${k===sel?' selected':''}>${v.label}</option>`).join('');
$('memberAddRole').innerHTML = roleOptions('dealer');
$('addMemberRole').innerHTML = roleOptions('dealer');
function parseMembers(){ return setupList.slice(); }
function renderSetupMembers(){
  $('setupMembers').innerHTML = setupList.length
    ? setupList.map((m,i)=>{ const rk = setupRoles[m] || 'dealer'; return `<span class="chip"><select data-srole="${esc(m)}" aria-label="${esc(m)} 역할" style="padding:2px 4px;font-size:12px">${roleOptions(rk)}</select>${esc(m)}<button type="button" class="x" data-rm="${i}" aria-label="${esc(m)} 빼기">×</button></span>`; }).join('')
    : '<span class="hint">아직 넣은 파티원이 없습니다.</span>';
  updateSetupPreview();
}
$('setupMembers').addEventListener('change', e=>{ const sl = e.target.closest('[data-srole]'); if(sl) setupRoles[sl.dataset.srole] = sl.value; });
function addSetupMember(){
  const name = String($('memberAdd').value||'').replace(/\s+/g,' ').trim().slice(0,20);
  if(!name){ $('memberAdd').focus(); return; }
  if(setupList.includes(name)){ toast('이미 넣은 이름입니다.'); return; }
  setupList.push(name); setupRoles[name] = $('memberAddRole').value; $('memberAdd').value = ''; $('memberAdd').focus(); renderSetupMembers();
}
$('memberAddBtn').onclick = addSetupMember;
$('memberAdd').addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.isComposing){ e.preventDefault(); addSetupMember(); } });
$('setupMembers').addEventListener('click', e=>{ const b = e.target.closest('[data-rm]'); if(b){ setupList.splice(+b.dataset.rm, 1); renderSetupMembers(); } });
function setupCfg(){
  if(diff !== 'custom'){ const p = PRESETS[diff]; return {hp:p.hp, bonus:p.bonus, rage:p.rage, rageRate:p.rageRate, rec:p.rec}; }
  return {hp:Math.max(5, +$('cHp').value||220), bonus:Math.max(0, +$('cBonus').value||0), rage:Math.max(5, +$('cRage').value||80), rageRate:Math.max(0, +$('cRageRate').value||0), rec:Math.max(0, +$('cRec').value||0)};
}
function updateSetupPreview(){
  const ms = parseMembers(), c = setupCfg(), n = ms.length;
  $('setupPreview').innerHTML = n
    ? `파티 <b>${n}명</b> → 보스 HP <b>${fmt(bossHpOf(c, n))}</b> (${fmt(c.hp)}×${n}${n>1?` + ${fmt(c.bonus)}×${n-1}`:''}) · 분노 최대치 <b>${fmt(c.rage)}</b> (데미지 × ${c.rageRate}) · 회복률 <b>${c.rec}%</b>`
    : `파티원 없이 열면 스트리머가 각자 <b>참가하기</b>로 들어옵니다. 첫 참가자는 보스 HP <b>${fmt(c.hp)}</b>, 이후 한 명마다 <b>+${fmt(c.hp + c.bonus)}</b>. 분노 최대치는 인원과 상관없이 <b>${fmt(c.rage)}</b>`;
  confirmArm = false; $('startRaid').textContent = '레이드 시작'; $('setupHint').textContent = '';
}
function openSetup(open){
  $('setup').hidden = !open;
  if(open && !raid){ setupList = []; setupRoles = {}; setupSrc = null; }
  if(open){
    if(raid){
      $('raidName').value = raid.name || '';
      setupList = (raid.members||[]).slice(); setupRoles = Object.fromEntries(setupList.map(m=>[m, rosterOf(raid, m).role]));
      diff = raid.diff || 'normal';
      if(diff==='custom' && raid.cfg){ $('cHp').value = raid.cfg.hp; $('cBonus').value = raid.cfg.bonus || 0; $('cRage').value = raid.cfg.rage; $('cRageRate').value = raid.cfg.rageRate ?? 0.5; $('cRec').value = raid.cfg.rec; }
    }
    else { $('raidName').value = randomBossName(); }
    $('bossRace').value = (raid && raid.race) || raceOfName($('raidName').value.trim()); renderRaceSkills();
    renderDiffs(); renderSetupMembers();
    $('raidName').focus();
  }
}

/* ---------- 레이드 종료 / 새 레이드 ---------- */
function renderEndBtn(s, me){
  const b = $('endRaidBtn');
  const can = !OVERLAY && !readOnly && !me && canOperate();
  b.hidden = !can;
  if(!can){ $('endConfirm').hidden = true; return; }
  if(!raid){ b.textContent = '새 레이드'; b.classList.remove('danger'); }
  else if(s.status === 'live'){ b.textContent = '레이드 종료'; b.classList.add('danger'); }
  else { b.textContent = '새 레이드 시작'; b.classList.remove('danger'); }
}
function finishAndReset(){
  if(!raid){ openSetup(true); return; }
  const sum = summarize(raid, compute(raid, events), true);
  guard(async()=>{
    await store.reset(sum);
    $('endConfirm').hidden = true;
    openHist = sum.raidId; setHistTab('hist');
    toast(sum.status === 'stopped' ? '레이드를 중단하고 기록에 보관했습니다. 새 레이드를 열 수 있습니다.' : '레이드를 초기화했습니다. 새 레이드를 열 수 있습니다.');
    openSetup(true);
  });
}
$('endRaidBtn').onclick = ()=>{
  if(!raid){ openSetup(true); return; }
  const s = lastState;
  if(s && s.status === 'live' && events.some(e=>!e.undone)){
    $('endConfirmText').textContent = `진행 중인 "${raid.name}" 레이드를 중단할까요? 지금까지의 기록은 레이드 기록에 "중단"으로 보관됩니다.`;
    $('endConfirm').hidden = false; $('endNo').focus(); return;
  }
  finishAndReset();
};
$('endYes').onclick = finishAndReset;
$('endNo').onclick = ()=>{ $('endConfirm').hidden = true; };

/* ---------- Boss names ---------- */
const BOSS_NAMES = [].concat(...Object.values(BOSS_BY_RACE));
function raceOfName(n){ for(const k in BOSS_BY_RACE) if(BOSS_BY_RACE[k].includes(n)) return k; return 'mixed'; }
$('bossRace').innerHTML = Object.entries(RACES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
function renderRaceSkills(){
  const set = BOSS_SETS[$('bossRace').value] || BOSS_SETS.mixed;
  $('raceSkills').textContent = '스킬: ' + set.map(x=>x.name).join(', ') + ' (레이드 시작 후 스킬 목록에서 고칠 수 있습니다)';
}
$('bossRace').onchange = ()=>{
  renderRaceSkills();
  if(setupSrc){ const r = $('bossRace').value; setupSrc.race = r; if(setupSrc.customBoss) toast('종족이 바뀌어 보스 스킬을 그 종족 기본 세트로 바꿨습니다.'); setupSrc.bossSkills = BOSS_SETS[r].map(x=>({...x})); setupSrc.customBoss = false; }
};
$('raidName').addEventListener('input', ()=>{ const r = raceOfName($('raidName').value.trim()); if(r !== 'mixed'){ $('bossRace').value = r; renderRaceSkills(); } });
function randomBossName(){
  const recent = new Set(history.slice(-5).map(h=>h.name));
  if(raid && raid.name) recent.add(raid.name);
  const pool = BOSS_NAMES.filter(n=>!recent.has(n));
  const list = pool.length ? pool : BOSS_NAMES;
  return list[Math.floor(Math.random()*list.length)];
}
$('rollName').onclick = ()=>{
  let n = randomBossName(), guard = 0;
  while(n === $('raidName').value && guard++ < 5) n = randomBossName();
  $('raidName').value = n; $('bossRace').value = raceOfName(n); renderRaceSkills();
};
