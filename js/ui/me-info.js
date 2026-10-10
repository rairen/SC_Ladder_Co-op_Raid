/* =====================================================================
   me-info.js — 왼쪽 "내 정보" 창
   ---------------------------------------------------------------------
   내 이름으로 들어왔으면 내 정보, 운영자면 데미지 입력에서 고른 공략대원 정보를 보여줍니다.
   체력, 스킬 게이지, 착용 장비, 그리고 지금 상태에서의 데미지 계산식.
   ===================================================================== */
import { App } from '@app/core/app.js';
import { ROLES, PARTY_HP, REVIVE_HP, PENDING_LABEL } from '@app/core/game-data.js';
import { $, OVERLAY, esc, fmt } from '@app/core/state.js';
import { gearHtml, statusTags } from '@app/core/logic.js';
import { guard, store, toast } from '@app/core/store.js';

const num = v => String(Math.round(v*100)/100);

/* 계산식: 지금 이 공략대원에게 적용되는 배율만 골라서 보여줌 */
function formulaHtml(s, m){
  const g = s.gear[m] || {}, pend = s.pending[m], down = (s.mhp[m] ?? 1) <= 0;
  const mul = [];
  if(g.dmg) mul.push([1 + g.dmg, `${g.weapon.name}`]);
  if(pend === 'double') mul.push([2, PENDING_LABEL.double]);
  if(pend === 'mission') mul.push([3, PENDING_LABEL.mission]);
  if(s.curse[m]) mul.push([s.curse[m], '저주']);
  if(s.barrier) mul.push([0.5, '보스 보호막']);
  if(s.rally) mul.push([1.5, '전투 자극']);
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
  const left = (s.fee[m]||0) - (s.spent[m]||0), fund = (s.fund && s.fund[m]) || 0, init0 = (s.fee[m]||0) - fund;
  $('meMoney').innerHTML = `<span class="label" style="margin:0">지참금</span><b class="num">${fmt(left)}</b><span class="hint">남음 · 초기 ${fmt(init0)}${fund ? ` + 지원 ${fmt(fund)}` : ''}${s.spent[m] ? ` − 사용 ${fmt(s.spent[m])}` : ''}</span>`;
  $('fundRow').hidden = !mine;

  /* 소모품 */
  const pots = (s.pots && s.pots[m]) || {};
  $('mePots').innerHTML = `<div class="label mc-gl">소모품</div>` + Object.entries(s.S.potions).map(([k,p])=>{
    const n = pots[k] || 0, isFull = k === 'hp' ? h >= mx : g >= need;
    return `<div class="pot pot-${k}"><span class="pot-ic" aria-hidden="true"></span>
      <span class="pot-tx"><b>${esc(p.name)}</b> <span class="num pot-n">×${n}</span><small>${esc(p.unit)} +${fmt(p.v)} · ${fmt(p.cost)}</small></span>
      ${mine ? `<span class="pot-act"><button type="button" class="btn sm" data-potuse="${k}"${n > 0 && alive && !isFull ? '' : ' disabled'}${isFull && n > 0 ? ' title="이미 가득 찼습니다"' : ''}>사용</button><button type="button" class="btn sm" data-potbuy="${k}"${left >= p.cost ? '' : ` disabled title="지참금 부족"`}>구매</button></span>` : ''}</div>`;
  }).join('');
}

/* 처음 한 번 실행: 화면 이벤트 연결 (js/main.js 가 파일 순서대로 부름) */
export function init(){
  $('mePanel').addEventListener('click', e=>{
    const b = e.target.closest('[data-potbuy],[data-potuse]'); if(!b || b.disabled || !App.raid || !App.selected) return;
    const who = App.selected, buy = !!b.dataset.potbuy, item = buy ? b.dataset.potbuy : b.dataset.potuse;
    const p = App.lastState && App.lastState.S.potions[item];
    guard(async()=>{ await store.addEvent({raidId:App.raid.raidId, t:Date.now(), type: buy ? 'buy' : 'use', member:who, item, undone:false}); if(p) toast(`${who} ${p.name} ${buy ? '구매' : '사용'}`); });
  });
}

export { renderMeInfo, formulaHtml };
