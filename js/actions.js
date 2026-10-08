/* =====================================================================
   actions.js — 버튼 동작: 결과 반영, 룰렛, 참가, 파티원 추가
   ===================================================================== */
/* ---------- Events ---------- */
document.addEventListener('click', e=>{
  const chip = e.target.closest('.chip[data-m]');
  if(chip){ selected = chip.dataset.m; render(); return; }
  const d = e.target.closest('.diff[data-d]');
  if(d){ diff = d.dataset.d; renderDiffs(); return; }
  const rs = e.target.closest('[data-act="reset"]');
  if(rs && raid){
    const sum = summarize(raid, compute(raid, events), true);
    guard(async()=>{ await store.reset(sum); openHist = sum.raidId; setHistTab('hist'); toast('레이드를 초기화했습니다. 새 레이드를 열 수 있습니다.'); openSetup(true); });
    return;
  }
  const u = e.target.closest('[data-undo]');
  if(u){ guard(()=>store.setUndone(u.dataset.undo, u.dataset.state !== '1')); return; }
});
$('cancelSetup').onclick = ()=>openSetup(false);
['cHp','cBonus','cRage','cRageRate','cRec'].forEach(id=>$(id).addEventListener('input', updateSetupPreview));
$('startRaid').onclick = ()=>{
  const ms = parseMembers();
  const live = raid && lastState && lastState.status==='live' && events.length>0;
  if(live && !confirmArm){
    confirmArm = true; $('startRaid').textContent = '진행 중 레이드를 끝내고 새로 시작';
    $('setupHint').textContent = '진행 중인 레이드 기록은 화면에서 사라집니다. 한 번 더 누르면 시작합니다.'; return;
  }
  const nm = $('raidName').value.trim().slice(0,40) || randomBossName();
  const race = $('bossRace').value || raceOfName(nm);
  const ss = (setupSrc && setupSrc.race === race) ? setupSrc : null;
  const extra = {}; if(ss){ if(ss.roleSkills) extra.roleSkills = ss.roleSkills; if(ss.gauge) extra.gauge = ss.gauge; if(ss.settings) extra.settings = ss.settings; }
  const data = {...extra, raidId:'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), name:nm, race, bossSkills: (ss ? ss.bossSkills : BOSS_SETS[race]).map(x=>({...x})), members:ms, roster: Object.fromEntries(ms.map(m=>[rosterKey(m), {role: setupRoles[m] || 'dealer', fee:0}])), diff, cfg:setupCfg(), startedAt:Date.now()};
  guard(async()=>{
    if(raid && events.some(e=>!e.undone)) await store.archive(summarize(raid, compute(raid, events), true));
    await store.setRaid(data); setupSrc = null; openSetup(false); toast('레이드를 시작했습니다. 수치는 이제 고정됩니다.');
  });
};

function setResult(win){ isWin = win; $('btnWin').setAttribute('aria-pressed', win); $('btnLoss').setAttribute('aria-pressed', !win); updateGamePreview(); }
$('btnWin').onclick = ()=>setResult(true);
$('btnLoss').onclick = ()=>setResult(false);
$('points').addEventListener('input', updateGamePreview);
let winType = 'normal';
function setWinType(t){
  winType = t;
  document.querySelectorAll('.wt').forEach(b=>b.setAttribute('aria-checked', b.dataset.wt===t));
  updateGamePreview();
}
$('winChecks').addEventListener('click', e=>{ const b = e.target.closest('.wt'); if(b && !b.disabled) setWinType(b.dataset.wt); });
$('points').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); submitGame(); } });
$('submitGame').onclick = submitGame;
function submitGame(){
  if($('submitGame').disabled) return;
  const p = Math.abs(parseInt($('points').value,10) || 0);
  if(!selected){ toast('파티원을 먼저 고르세요.'); return; }
  if(!p){ toast('래더 결과 화면의 점수 변동값을 입력하세요.'); $('points').focus(); return; }
  const ev = {raidId:raid.raidId, t:Date.now(), type:'game', member:selected, points: isWin ? p : -p,
    multi: isWin && winType==='multi', same: isWin && winType==='same', banned: isWin && winType==='banned', undone:false};
  guard(async()=>{
    await store.addEvent(ev);
    $('points').value = ''; setWinType('normal');
    flash(isWin ? 'hpFill' : 'rageFill');
    toast(`${selected} ${isWin?'승리':'패배'} ${isWin?'+':'−'}${p}점 반영`);
    updateGamePreview();
  });
}
function flash(id){ const el = $(id); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

/* Roulette */
function rouletteWeights(S){ S = S || settingsOf(raid); return ITEMS.map(i=>({it:i, w: Math.max(0, Number(S.roulette[i.id])||0)})); }
function renderOdds(S){
  const ws = rouletteWeights(S), total = ws.reduce((a,x)=>a+x.w,0) || 1;
  const html = TIERS.map(t=>{ const w = ws.filter(x=>x.it.tier===t).reduce((a,x)=>a+x.w,0); return `<div class="tier-${t}"><b>${Math.round(w/total*1000)/10}%</b>${t}</div>`; }).join('');
  if($('odds').dataset.h !== html){ $('odds').innerHTML = html; $('odds').dataset.h = html; }
}
renderOdds(settingsOf(null));
$('manualItem').innerHTML = ITEMS.map(i=>`<option value="${i.id}">[${i.tier}] ${esc(i.name)}</option>`).join('');
function pick(){
  const arr = new Uint32Array(1); crypto.getRandomValues(arr);
  const ws = rouletteWeights(), total = ws.reduce((a,x)=>a+x.w,0);
  if(!total) return ITEMS[0];
  let r = arr[0]/4294967296*total;
  for(const x of ws){ if((r -= x.w) < 0) return x.it; }
  return ITEMS[0];
}
function showReel(it, label){
  const reel = $('reel');
  reel.className = 'reel tier-'+it.tier;
  reel.innerHTML = `<span class="t">${label || it.tier}</span><span class="n">${esc(it.name)}</span>`;
}
$('spin').onclick = ()=>{
  if(spinning || !selected) return;
  const result = pick(), who = selected;
  spinning = true; render();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const steps = reduce ? 0 : 16; let i = 0;
  const tick = ()=>{
    if(i < steps){ showReel(ITEMS[Math.floor(Math.random()*ITEMS.length)]); i++; setTimeout(tick, 50 + i*i*1.6); return; }
    showReel(result, result.tier + (result.next ? ' · '+who+' 다음 판' : ''));
    spinning = false;
    guard(()=>store.addEvent({raidId:raid.raidId, t:Date.now(), type:'roulette', member:who, item:result.id, undone:false}));
    render();
  };
  tick();
};
