/* =====================================================================
   setup.js — 새 레이드 만들기 화면, 레이드 종료, 보스 이름
   ===================================================================== */
/* ---------- Setup ---------- */
import { App } from '@app/core/app.js';
import { BOSS_BY_RACE, BOSS_SETS, PRESETS, RACES, ROLES } from '@app/core/game-data.js';
import { $, OVERLAY, esc, fmt, squadLabel } from '@app/core/state.js';
import { guard, store, toast } from '@app/core/store.js';
import { bossHpOf, compute, rosterOf } from '@app/core/logic.js';
import { canOperate, useAuth } from '@app/features/auth.js';
import { setHistTab, summarize } from '@app/ui/history.js';

function renderDiffs(){
  $('diffs').innerHTML = Object.entries(PRESETS).map(([k,p])=>
    `<button type="button" class="diff" data-d="${k}" aria-pressed="${k===App.diff}"><span class="dn">${p.label}</span><span class="dd">${k==='custom' ? p.desc : `HP ${p.hp} +인원당 ${p.bonus} · 분노 최대 ${p.rage} · 회복 ${p.rec}%`}</span></button>`).join('');
  $('customBox').hidden = App.diff !== 'custom';
  updateSetupPreview();
}
const roleOptions = sel => Object.entries(ROLES).map(([k,v])=>`<option value="${k}"${k===sel?' selected':''}>${v.label}</option>`).join('');
function parseMembers(){ return App.setupList.slice(); }
function renderSetupMembers(){
  $('setupMembers').innerHTML = App.setupList.length
    ? App.setupList.map((m,i)=>{ const rk = App.setupRoles[m] || 'dealer'; return `<span class="chip"><select data-srole="${esc(m)}" aria-label="${esc(m)} 역할" style="padding:2px 4px;font-size:12px">${roleOptions(rk)}</select>${esc(m)}<button type="button" class="x" data-rm="${i}" aria-label="${esc(m)} 빼기">×</button></span>`; }).join('')
    : '<span class="hint">아직 넣은 공략대원이 없습니다.</span>';
  updateSetupPreview();
}
function addSetupMember(){
  const name = String($('memberAdd').value||'').replace(/\s+/g,' ').trim().slice(0,20);
  if(!name){ $('memberAdd').focus(); return; }
  if(App.setupList.includes(name)){ toast('이미 넣은 이름입니다.'); return; }
  App.setupList.push(name); App.setupRoles[name] = $('memberAddRole').value; $('memberAdd').value = ''; $('memberAdd').focus(); renderSetupMembers();
}
function setupCfg(){
  if(App.diff !== 'custom'){ const p = PRESETS[App.diff]; return {hp:p.hp, bonus:p.bonus, rage:p.rage, rageRate:p.rageRate, rec:p.rec}; }
  return {hp:Math.max(5, +$('cHp').value||220), bonus:Math.max(0, +$('cBonus').value||0), rage:Math.max(5, +$('cRage').value||80), rageRate:Math.max(0, +$('cRageRate').value||0), rec:Math.max(0, +$('cRec').value||0)};
}
function updateSetupPreview(){
  const ms = parseMembers(), c = setupCfg(), n = ms.length;
  $('setupPreview').innerHTML = n
    ? `공략대 <b>${n}명</b> → 보스 HP <b>${fmt(bossHpOf(c, n))}</b> (${fmt(c.hp)}×${n}${n>1?` + ${fmt(c.bonus)}×${n-1}`:''}) · 분노 최대치 <b>${fmt(c.rage)}</b> (데미지 × ${c.rageRate}) · 회복률 <b>${c.rec}%</b>`
    : `공략대원 없이 열면 스트리머가 각자 <b>참가하기</b>로 들어옵니다. 첫 참가자는 보스 HP <b>${fmt(c.hp)}</b>, 이후 한 명마다 <b>+${fmt(c.hp + c.bonus)}</b>. 분노 최대치는 인원과 상관없이 <b>${fmt(c.rage)}</b>`;
  App.confirmArm = false; $('startRaid').textContent = '레이드 시작'; $('setupHint').textContent = '';
}
function openSetup(open){
  $('setup').hidden = !open;
  // 로그인 모드에서는 공략대원을 미리 넣지 않고, 초대 코드로 각자 참가
  const invite = typeof useAuth === 'function' && useAuth();
  $('setupMembersBox').hidden = invite; $('setupInviteHint').hidden = !invite;
  if(invite){ App.setupList = []; App.setupRoles = {}; }
  if(open){ App.setupList = []; App.setupRoles = {}; App.setupSrc = null; }
  if(open){
    if(false){
      $('raidName').value = App.raid.name || '';
      App.setupList = (App.raid.members||[]).slice(); App.setupRoles = Object.fromEntries(App.setupList.map(m=>[m, rosterOf(App.raid, m).role]));
      App.diff = App.raid.diff || 'normal';
      if(App.diff==='custom' && App.raid.cfg){ $('cHp').value = App.raid.cfg.hp; $('cBonus').value = App.raid.cfg.bonus || 0; $('cRage').value = App.raid.cfg.rage; $('cRageRate').value = App.raid.cfg.rageRate ?? 0.5; $('cRec').value = App.raid.cfg.rec; }
    }
    else { $('raidName').value = randomBossName(); }
    $('bossRace').value = raceOfName($('raidName').value.trim()); renderRaceSkills();
    renderDiffs(); renderSetupMembers();
    $('raidName').focus();
  }
}

/* ---------- 레이드 종료 / 새 레이드 ---------- */
function renderEndBtn(s, me){
  const b = $('endRaidBtn');
  const can = !OVERLAY && !App.readOnly && canOperate();
  b.hidden = !can;
  if(!can){ $('endConfirm').hidden = true; return; }
  if(!App.raid){ b.hidden = true; $('endConfirm').hidden = true; return; }
  if(s.status === 'live'){ b.textContent = '레이드 종료'; b.classList.add('danger'); }
  else { b.textContent = '레이드 정리'; b.classList.remove('danger'); }
}
function finishAndReset(){
  if(!App.raid){ openSetup(true); return; }
  const sum = summarize(App.raid, compute(App.raid, App.events), true);
  guard(async()=>{
    await store.reset(sum);
    $('endConfirm').hidden = true;
    App.openHist = sum.raidId; setHistTab('hist');
    toast(sum.status === 'stopped' ? `${sum.squadLabel || '공략대'} 레이드를 중단하고 기록에 보관했습니다.` : `${sum.squadLabel || '공략대'} 레이드를 정리하고 기록에 보관했습니다.`);
  });
}

/* ---------- Boss names ---------- */
const BOSS_NAMES = [].concat(...Object.values(BOSS_BY_RACE));
function raceOfName(n){ for(const k in BOSS_BY_RACE) if(BOSS_BY_RACE[k].includes(n)) return k; return 'mixed'; }
function renderRaceSkills(){
  const set = BOSS_SETS[$('bossRace').value] || BOSS_SETS.mixed;
  $('raceSkills').textContent = '스킬: ' + set.map(x=>x.name).join(', ') + ' (레이드 시작 후 스킬 목록에서 고칠 수 있습니다)';
}
function randomBossName(){
  const recent = new Set(App.history.slice(-5).map(h=>h.name));
  if(App.raid && App.raid.name) recent.add(App.raid.name);
  const pool = BOSS_NAMES.filter(n=>!recent.has(n));
  const list = pool.length ? pool : BOSS_NAMES;
  return list[Math.floor(Math.random()*list.length)];
}

/* 처음 한 번 실행: 화면 이벤트 연결, 초기값 설정 (js/main.js 가 파일 순서대로 부름) */
export function init(){

  App.setupList = []; App.setupRoles = {};
  $('memberAddRole').innerHTML = roleOptions('dealer');
  $('addMemberRole').innerHTML = roleOptions('dealer');
  $('setupMembers').addEventListener('change', e=>{ const sl = e.target.closest('[data-srole]'); if(sl) App.setupRoles[sl.dataset.srole] = sl.value; });
  $('memberAddBtn').onclick = addSetupMember;
  $('memberAdd').addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.isComposing){ e.preventDefault(); addSetupMember(); } });
  $('setupMembers').addEventListener('click', e=>{ const b = e.target.closest('[data-rm]'); if(b){ App.setupList.splice(+b.dataset.rm, 1); renderSetupMembers(); } });
  $('endRaidBtn').onclick = ()=>{
    if(!App.raid){ openSetup(true); return; }
    const s = App.lastState;
    if(s && s.status === 'live' && App.events.some(e=>!e.undone)){
      $('endConfirmText').textContent = `${squadLabel(App.raid)} "${App.raid.name}" 레이드를 중단할까요? 지금까지의 기록은 레이드 기록에 "중단"으로 보관됩니다.`;
      $('endConfirm').hidden = false; $('endNo').focus(); return;
    }
    finishAndReset();
  };
  $('endYes').onclick = finishAndReset;
  $('endNo').onclick = ()=>{ $('endConfirm').hidden = true; };
  $('bossRace').innerHTML = Object.entries(RACES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  $('bossRace').onchange = ()=>{
    renderRaceSkills();
    if(App.setupSrc){ const r = $('bossRace').value; App.setupSrc.race = r; if(App.setupSrc.customBoss) toast('종족이 바뀌어 보스 스킬을 그 종족 기본 세트로 바꿨습니다.'); App.setupSrc.bossSkills = BOSS_SETS[r].map(x=>({...x})); App.setupSrc.customBoss = false; }
  };
  $('raidName').addEventListener('input', ()=>{ const r = raceOfName($('raidName').value.trim()); if(r !== 'mixed'){ $('bossRace').value = r; renderRaceSkills(); } });
  $('rollName').onclick = ()=>{
    let n = randomBossName(), guard = 0;
    while(n === $('raidName').value && guard++ < 5) n = randomBossName();
    $('raidName').value = n; $('bossRace').value = raceOfName(n); renderRaceSkills();
  };
}


export { renderDiffs, parseMembers, renderSetupMembers, addSetupMember, setupCfg, updateSetupPreview, openSetup, renderEndBtn, finishAndReset, raceOfName, renderRaceSkills, randomBossName, roleOptions, BOSS_NAMES };
