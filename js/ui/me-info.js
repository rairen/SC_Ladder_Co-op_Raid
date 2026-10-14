/* =====================================================================
   me-info.js — 왼쪽 "내 정보" 창
   ---------------------------------------------------------------------
   내 이름으로 들어왔으면 내 정보, 운영자면 데미지 입력에서 고른 공략대원 정보를 보여줍니다.
   체력, 스킬 게이지, 착용 장비, 그리고 지금 상태에서의 데미지 계산식.
   ===================================================================== */
import { App } from '@app/core/app.js';
import { ROLES, PARTY_HP, REVIVE_HP, PENDING_LABEL } from '@app/core/game-data.js';
import { $, OVERLAY, esc, fmt } from '@app/core/state.js';
import { gearHtml, statusTags, sellPotValue } from '@app/core/logic.js';
import { guard, store, toast } from '@app/core/store.js';
import { render } from '@app/ui/render.js';
import { myName } from '@app/core/boot.js';
import { setMe } from '@app/features/gear-roulette.js';
import { useAuth } from '@app/features/auth.js';

const num = v => String(Math.round(v*100)/100);

/* 계산식: 지금 이 공략대원에게 적용되는 배율만 골라서 보여줌 */
function formulaHtml(s, m){
  const g = s.gear[m] || {}, pend = s.pending[m], down = (s.mhp[m] ?? 1) <= 0;
  const mul = [];
  if(g.dmg) mul.push([1 + g.dmg, `${g.weapon.name}`]);
  if(pend === 'double') mul.push([2, PENDING_LABEL.double]);
  if(s.curse[m]) mul.push([s.curse[m], '저주']);
  if(s.barrier) mul.push([0.5, '보스 보호막']);
  if(s.rally) mul.push([1.5, '전투 자극']);
  if(s.weaken) mul.push([1.3, '약점 분석']);
  const mulTx = mul.map(([v, why])=>` × <b>${num(v)}</b> <small>${esc(why)}</small>`).join('');
  const rr = s.cfg.rageRate ?? 0.5, cut = g.rageCut || 0;
  const loss = Math.round((Number(s.S.lossDmg) || 0) * 100);
  const win = down
    ? `데미지 없이 <b class="d-heal">체력 ${REVIVE_HP}으로 부활</b>`
    : `보스 HP <b class="d-hp">−</b> 점수${mulTx}`;
  const lose = pend === 'shield'
    ? '<b>패배 보호</b> · 피해와 보스 회복 없음'
    : `내 체력 <b class="d-hp">−</b> 점수 × <b>${loss}%</b>${s.enraged ? ` · 보스 HP <b class="d-heal">+</b> 점수 × <b>${s.cfg.rec}%</b> <small>보스 HP 50% 이하</small>` : ''}`;
  return `<div class="fm-title">계산식</div>
    <dl class="fm">
      <dt class="w">승리</dt><dd>${win}</dd>
      ${down ? '' : `<dt>분노</dt><dd>데미지 × <b>${num(rr)}</b>${cut ? ` × <b>${num(1 - cut)}</b> <small>${esc(g.accessory.name)}</small>` : ''}</dd>`}
      <dt class="l">패배</dt><dd>${lose}</dd>
      <dt>게이지</dt><dd>승리 <b>+${s.G.win}</b> · 패배 <b>+${s.G.loss}</b></dd>
      <dt>체인</dt><dd>서로 다른 3명 연속 승리 시 보스 최대 HP × <b>${s.S.chain}%</b> <small>지금 ${s.chain.length}/3</small></dd>
    </dl>`;
}

function renderMeInfo(s, me, canAct){
  const panel = $('mePanel'), m = App.selected;
  panel.hidden = OVERLAY || !App.raid || !m || !s.members.includes(m);
  if(panel.hidden) return;
  $('meTitle').textContent = me ? '내 정보' : '공략대원 정보';
  $('meSub').textContent = me ? '' : '데미지 입력에서 고른 공략대원';
  /* 공략대 떠나기: 내 정보일 때만. 한 번 누르면 확인으로 바뀌고 한 번 더 누르면 떠남 */
  const lb = $('leaveBtn');
  lb.hidden = !(me && m === me && s.status === 'live' && !App.readOnly);
  lb.textContent = App.leaveArm ? '정말 떠나기' : '공략대 떠나기';
  lb.classList.toggle('danger', !!App.leaveArm);
  const rk = s.role[m] || 'dealer';
  const h = s.mhp[m] ?? PARTY_HP, mx = s.maxH[m] ?? PARTY_HP, down = h <= 0, low = !down && h <= mx*0.4;
  const g = s.gauge[m] ?? 0, need = s.needG[m] ?? s.G.max, full = g >= need;
  $('meCard').innerHTML = `
    <div class="mc-head"><span class="role-tag ${rk}">${ROLES[rk].short}</span><b class="mc-name">${esc(m)}</b><span class="hint">${esc(ROLES[rk].label)}</span><span class="pc-tags">${statusTags(s, m)}</span></div>
    <div class="rbar hp${low?' low':''}${down?' ko':''}"><i style="width:${Math.max(0, h/mx*100)}%"></i><span class="rb-l">HP</span><span class="rb-v num">${down ? '전투불능' : `${fmt(h)} / ${fmt(mx)}`}</span></div>
    <div class="rbar sp${full?' full':''}"><i style="width:${Math.min(100, g/need*100)}%"></i><span class="rb-l">스킬</span><span class="rb-v num">${full ? '사용 가능' : `${g} / ${need}`}</span></div>
    <div class="label mc-gl">착용 장비</div>${gearHtml(s, m)}`;
  $('meFormula').innerHTML = formulaHtml(s, m);

  /* 지참금 · 추가 지원금 */
  const mine = !!canAct && (!me || me === m), alive = !down;
  const left = (s.fee[m]||0) - (s.spent[m]||0);
  const sum = k => ((s.money && s.money[m]) || []).filter(x=>x.k===k).reduce((a,x)=>a+x.a, 0);
  const parts = [['이월', sum('carry')], ['이번', sum('deposit')], ['지원', sum('fund')], ['분해', sum('salvage')], ['판매', sum('sell')]].filter(x=>x[1]).map(([k,v])=>`${k} ${fmt(v)}`);
  /* 지참금: 패널 맨 위에 크게. 지금 돈으로 할 수 있는 것도 같이 */
  const rc = s.S.rouletteCost || 0, gc = s.S.gearCost || 0;
  const can = [rc ? `룰렛 ${Math.floor(Math.max(0,left)/rc)}회` : '', gc ? `장비 룰렛 ${Math.floor(Math.max(0,left)/gc)}회` : ''].filter(Boolean).join(' · ');
  $('meMoney').classList.toggle('low', left < Math.max(rc, 1));
  $('meMoney').innerHTML = `<div class="mm-top"><span class="mm-label">${me && me === m ? '내 지참금' : '지참금'}</span><button type="button" class="linkbtn" data-ledger="${esc(m)}">내역</button></div>
    <div class="mm-amt"><span class="mm-ico" aria-hidden="true">★</span><b class="num">${fmt(left)}</b><span class="mm-unit">별풍선</span></div>
    <div class="mm-sub">${parts.length ? parts.join(' + ') : '가져온 지참금 없음'}${s.spent[m] ? ` − 사용 ${fmt(s.spent[m])}` : ''}${can ? `<span class="mm-can">${can} 가능</span>` : ''}</div>`;
  $('fundRow').hidden = !mine;

  /* 소모품 */
  const pots = (s.pots && s.pots[m]) || {};
  $('mePots').innerHTML = `<div class="label mc-gl">소모품</div>` + Object.entries(s.S.potions).map(([k,p])=>{
    const n = pots[k] || 0, isFull = k === 'hp' ? h >= mx : g >= need, sv = sellPotValue(s.S, k, s.sellRate || 1);
    return `<div class="pot pot-${k}"><span class="pot-ic" aria-hidden="true"></span>
      <span class="pot-tx"><b>${esc(p.name)}</b> <span class="num pot-n">×${n}</span><small>${esc(p.unit)} +${fmt(p.v)} · ${fmt(p.cost)}</small></span>
      ${mine ? `<span class="pot-act"><button type="button" class="btn sm" data-potuse="${k}"${n > 0 && alive && !isFull ? '' : ' disabled'}${isFull && n > 0 ? ' title="이미 가득 찼습니다"' : ''}>사용</button><button type="button" class="btn sm" data-potbuy="${k}"${left >= p.cost ? '' : ` disabled title="지참금 부족"`}>구매</button><button type="button" class="btn sm ghost" data-potsell="${k}"${n > 0 ? '' : ' disabled'} title="1개 팔면 지참금 ${fmt(sv)}">판매 +${fmt(sv)}</button></span>` : ''}</div>`;
  }).join('');
}

/* 처음 한 번 실행: 화면 이벤트 연결 (js/main.js 가 파일 순서대로 부름) */
export function init(){
  App.leaveArm = false;
  $('leaveBtn').addEventListener('click', ()=>{
    const s = App.lastState, me = s && myName(s);
    if(!App.raid || !me) return;
    if(!App.leaveArm){ App.leaveArm = true; render(); setTimeout(()=>{ if(App.leaveArm){ App.leaveArm = false; render(); } }, 4000); return; }
    App.leaveArm = false;
    guard(async()=>{
      await store.leave(me);
      App.selected = null;
      if(!useAuth()) setMe(''); else render();
      toast(`${me} 님이 공략대를 떠났습니다. 떠나기 전 기록과 장비·지참금은 남습니다.`);
    });
  });
  $('mePanel').addEventListener('click', e=>{
    const sb = e.target.closest('[data-potsell]');
    if(sb && !sb.disabled && App.raid && App.selected){
      const who = App.selected, k = sb.dataset.potsell, p = App.lastState && App.lastState.S.potions[k];
      guard(async()=>{ await store.addEvent({raidId:App.raid.raidId, t:Date.now(), type:'sell', member:who, pot:k, undone:false}); if(p) toast(`${who} ${p.name} 판매`); });
      return;
    }
    const b = e.target.closest('[data-potbuy],[data-potuse]'); if(!b || b.disabled || !App.raid || !App.selected) return;
    const who = App.selected, buy = !!b.dataset.potbuy, item = buy ? b.dataset.potbuy : b.dataset.potuse;
    const p = App.lastState && App.lastState.S.potions[item];
    guard(async()=>{ await store.addEvent({raidId:App.raid.raidId, t:Date.now(), type: buy ? 'buy' : 'use', member:who, item, undone:false}); if(p) toast(`${who} ${p.name} ${buy ? '구매' : '사용'}`); });
  });
}

export { renderMeInfo, formulaHtml };
