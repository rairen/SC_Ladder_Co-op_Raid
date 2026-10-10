/* =====================================================================
   actions.js — 버튼 동작: 결과 반영, 룰렛, 참가, 공략대원 추가
   ===================================================================== */
/* ---------- Events ---------- */
import { App } from '@app/core/app.js';
import { BOSS_SETS, ITEMS, TIERS } from '@app/core/game-data.js';
import { $, esc } from '@app/core/state.js';
import { guard, store, toast } from '@app/core/store.js';
import { compute, rosterKey, settingsOf } from '@app/core/logic.js';
import { render, updateGamePreview } from '@app/ui/render.js';
import { openSetup, parseMembers, raceOfName, randomBossName, renderDiffs, setupCfg, updateSetupPreview } from '@app/ui/setup.js';
import { newInvite } from '@app/features/party.js';
import { useAuth } from '@app/features/auth.js';
import { setHistTab, summarize } from '@app/ui/history.js';
import { selectRaid } from '@app/core/boot.js';


function setResult(win){ App.isWin = win; $('btnWin').setAttribute('aria-pressed', win); $('btnLoss').setAttribute('aria-pressed', !win); updateGamePreview(); }
function submitGame(){
  if($('submitGame').disabled) return;
  const p = Math.abs(parseInt($('points').value,10) || 0);
  if(!App.selected){ toast('공략대원을 먼저 고르세요.'); return; }
  if(!p){ toast('래더 결과 화면의 점수 변동값을 입력하세요.'); $('points').focus(); return; }
  const ev = {raidId:App.raid.raidId, t:Date.now(), type:'game', member:App.selected, points: App.isWin ? p : -p,
    undone:false};
  guard(async()=>{
    await store.addEvent(ev);
    $('points').value = '';
    flash(App.isWin ? 'hpFill' : 'rageFill');
    toast(`${App.selected} ${App.isWin?'승리':'패배'} ${App.isWin?'+':'−'}${p}점 반영`);
    updateGamePreview();
  });
}
function flash(id){ const el = $(id); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

/* Roulette */
function rouletteWeights(S){ S = S || settingsOf(App.raid); return ITEMS.map(i=>({it:i, w: Math.max(0, Number(S.roulette[i.id])||0)})); }
function renderOdds(S){
  const ws = rouletteWeights(S), total = ws.reduce((a,x)=>a+x.w,0) || 1;
  const html = TIERS.map(t=>{ const w = ws.filter(x=>x.it.tier===t).reduce((a,x)=>a+x.w,0); return `<div class="tier-${t}"><b>${Math.round(w/total*1000)/10}%</b>${t}</div>`; }).join('');
  if($('odds').dataset.h !== html){ $('odds').innerHTML = html; $('odds').dataset.h = html; }
}
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

/* 처음 한 번 실행: 화면 이벤트 연결, 초기값 설정 (js/main.js 가 파일 순서대로 부름) */
export function init(){

  document.addEventListener('click', e=>{
    /* 운영자: 공략대 상태 카드를 누르면 그 공략대원이 데미지 입력 대상이 됨 */
    const pk = e.target.closest('[data-pick]');
    if(pk && !e.target.closest('input,select,button,a') && App.selected !== pk.dataset.pick){ App.selected = pk.dataset.pick; render(); return; }
    const d = e.target.closest('.diff[data-d]');
    if(d){ App.diff = d.dataset.d; renderDiffs(); return; }
    const rs = e.target.closest('[data-act="reset"]');
    if(rs && App.raid){
      const sum = summarize(App.raid, compute(App.raid, App.events), true);
      guard(async()=>{ await store.reset(sum); App.openHist = sum.raidId; setHistTab('hist'); toast(`${sum.squadLabel} 레이드를 정리하고 기록에 보관했습니다.`); });
      return;
    }
    const u = e.target.closest('[data-undo]');
    if(u){ guard(()=>store.setUndone(u.dataset.undo, u.dataset.state !== '1')); return; }
  });
  $('inputWho').addEventListener('change', e=>{ App.selected = e.target.value || null; render(); });
  $('cancelSetup').onclick = ()=>openSetup(false);
  ['cHp','cBonus','cRage','cRageRate','cRec'].forEach(id=>$(id).addEventListener('input', updateSetupPreview));
  $('startRaid').onclick = ()=>{
    const ms = parseMembers();
    // 새 공략대 번호: 진행 중인 공략대가 쓰지 않는 가장 작은 번호
    const used = Object.values(App.raids).map(r=>r.squad||0); let squad = 1; while(used.includes(squad)) squad++;
    const nm = $('raidName').value.trim().slice(0,40) || randomBossName();
    const race = $('bossRace').value || raceOfName(nm);
    const ss = (App.setupSrc && App.setupSrc.race === race) ? App.setupSrc : null;
    const extra = {}; if(ss){ if(ss.roleSkills) extra.roleSkills = ss.roleSkills; if(ss.gauge) extra.gauge = ss.gauge; if(ss.settings) extra.settings = ss.settings; }
    const data = {...extra, raidId:'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), name:nm, race, bossSkills: (ss ? ss.bossSkills : BOSS_SETS[race]).map(x=>({...x})), squad, owner: (typeof App.authUser !== 'undefined' && App.authUser) ? App.authUser.uid : '', members:ms, roster: Object.fromEntries(ms.map(m=>[rosterKey(m), {role: App.setupRoles[m] || 'dealer', fee:0}])), diff: App.diff, cfg:setupCfg(), startedAt:Date.now()};
    guard(async()=>{
      await store.setRaid(data); App.setupSrc = null; openSetup(false); selectRaid(data.raidId);
      if(useAuth()){ await newInvite(data.raidId); toast(`${squad}공략대 레이드를 시작했습니다. 공략대 현황의 초대 코드를 공략대원에게 알려 주세요.`); }
      else toast(`${squad}공략대 레이드를 시작했습니다. 수치는 이제 고정됩니다.`);
    });
  };
  $('btnWin').onclick = ()=>setResult(true);
  $('btnLoss').onclick = ()=>setResult(false);
  $('points').addEventListener('input', updateGamePreview);
  $('points').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); submitGame(); } });
  $('submitGame').onclick = submitGame;
  renderOdds(settingsOf(null));
  $('spin').onclick = ()=>{
    if(App.spinning || !App.selected) return;
    const result = pick(), who = App.selected;
    App.spinning = true; render();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const steps = reduce ? 0 : 16; let i = 0;
    const tick = ()=>{
      if(i < steps){ showReel(ITEMS[Math.floor(Math.random()*ITEMS.length)]); i++; setTimeout(tick, 50 + i*i*1.6); return; }
      showReel(result, result.tier + (result.next ? ' · '+who+' 다음 판' : ''));
      App.spinning = false;
      guard(()=>store.addEvent({raidId:App.raid.raidId, t:Date.now(), type:'roulette', member:who, item:result.id, undone:false}));
      render();
    };
    tick();
  };
}


export { setResult, submitGame, flash, rouletteWeights, renderOdds, pick, showReel };
