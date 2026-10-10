/* =====================================================================
   render.js — 메인 화면 그리기 (보스 HUD, 공략대 현황, 전투 기록, 결과 미리보기)
   ===================================================================== */
/* ---------- Rendering ---------- */
import { App } from '@app/core/app.js';
import { PARTY_HP, PENDING_LABEL, PRESETS, REVIVE_HP, ROLES } from '@app/core/game-data.js';
import { $, OVERLAY, esc, fmt, squadLabel } from '@app/core/state.js';
import { compute, gearHtml, rosterOf, skillHtml, statusTags, whatHtml } from '@app/core/logic.js';
import { renderEndBtn } from '@app/ui/setup.js';
import { renderOdds } from '@app/features/actions.js';
import { renderGearPanel, renderJoin } from '@app/features/gear-roulette.js';
import { renderDmgMeter, renderTicker } from '@app/ui/overlay.js';
import { renderRoleBar } from '@app/features/role-skill.js';
import { renderMeInfo } from '@app/ui/me-info.js';
import { renderAdminBtn } from '@app/ui/admin-tools.js';
import { renderSkillModal } from '@app/ui/info-window.js';
import { autoOn, renderLadderPanel } from '@app/features/ladder.js';
import { renderInvite } from '@app/features/party.js';
import { renderBrowserCollect } from '@app/features/ladder-browser.js';
import { applyAccess, canOperate } from '@app/features/auth.js';
import { autoArchive, renderSkillBoard } from '@app/ui/history.js';
import { renderLobby } from '@app/ui/dungeon.js';
import { myName } from '@app/core/boot.js';

function render(){
  if(typeof applyAccess === 'function') applyAccess();
  const s = compute(App.raid, App.events);
  App.lastState = s;
  const hasRaid = !!App.raid;

  // connection pill
  const cp = $('connPill');
  cp.className = 'pill ' + (App.local ? 'local' : (hasRaid ? s.status : ''));
  cp.textContent = App.local ? (hasRaid ? (s.status==='clear' ? '레이드 성공' : s.status==='fail' ? '레이드 실패' : '진행 중 · 이 브라우저에 저장') : '레이드 없음') : !App.online ? '연결 끊김 · 재연결 중' : !hasRaid ? '레이드 없음' : s.status==='clear' ? '레이드 성공' : s.status==='fail' ? '레이드 실패' : '진행 중 · 실시간 공유';
  $('importBtn').hidden = !App.local;

  // HUD
  $('bossName').textContent = hasRaid ? (App.raid.name || '이름 없는 보스') : '레이드 대기 중';
  $('squadTag').textContent = hasRaid ? squadLabel(App.raid) : 'BOSS';
  if(typeof renderLobby === 'function') renderLobby();
  const meta = $('bossMeta');
  if(hasRaid){
    const p = PRESETS[App.raid.diff] || PRESETS.custom;
    meta.innerHTML = `<span class="pill">${esc(p.label)}</span><span class="pill">공략대 ${s.members.length}명</span><span class="pill">1인당 HP ${fmt(s.cfg.hp)} +인원당 ${fmt(s.cfg.bonus||0)} · 분노 최대 ${fmt(s.cfg.rage)} (데미지 × ${s.cfg.rageRate}) · 회복 ${s.cfg.rec}%</span>`;
  } else meta.innerHTML = `<span class="pill">위의 "레이드 설정"에서 공략대원과 난이도를 정하면 시작됩니다</span>`;
  const hpPct = hasRaid && s.maxHp ? s.hp/s.maxHp*100 : 100;
  const ragePct = hasRaid && s.maxRage ? Math.min(100, s.rage/s.maxRage*100) : 0;
  $('hpFill').style.width = hpPct+'%';
  $('rageFill').style.width = ragePct+'%';
  $('hpMeter').setAttribute('aria-valuenow', Math.round(hpPct));
  $('rageMeter').setAttribute('aria-valuenow', Math.round(ragePct));
  $('hpVal').innerHTML = `${fmt(hasRaid?s.hp:0)} <small>/ ${fmt(hasRaid?s.maxHp:0)}</small>`;
  $('rageVal').innerHTML = `${fmt(hasRaid?s.rage:0)} <small>/ ${fmt(hasRaid?s.maxRage:0)}</small>`;
  const games = s.log.filter(e=>!e.undone && !e.ignored && e.ev.type==='game');
  const wins = games.filter(e=>e.ev.points>0).length, losses = games.filter(e=>e.ev.points<0).length;
  const chainDots = [0,1,2].map(i=>`<i class="${i < s.chain.length ? 'on':''}"></i>`).join('');
  $('hudFoot').innerHTML = hasRaid ? `
    <span>HP <b>${hpPct.toFixed(1)}%</b></span>
    <span>전적 <b>${wins}승 ${losses}패</b></span>
    <span>체인 <span class="chain" title="서로 다른 3명 연속 승리 시 보스 HP 2% 추가">${chainDots}</span> <b>${s.chain.length}/3</b></span>
    <span>분노 가득 → 보스 스킬${s.barrier ? ' · <b>보호막 '+s.barrier+'회</b>' : ''}</span>` : '';
  const bn = $('banner');
  if(hasRaid && s.status !== 'live'){
    bn.hidden = false; bn.className = 'banner ' + s.status;
    const mvp = topDealer(s);
    const meNow = myName(s);
    const act = OVERLAY ? '' : canOperate()
      ? '<button type="button" class="btn primary" data-act="reset">레이드 정리</button><span>이번 레이드는 아래 레이드 기록에 보관됩니다.</span>'
      : (meNow ? '<span>운영자가 정리하면 이 공략대는 기록으로 넘어갑니다.</span>' : '');
    bn.innerHTML = (s.status==='clear'
      ? `<strong>레이드 성공</strong><span>${wins}승 ${losses}패${mvp ? ' · MVP '+esc(mvp) : ''}</span>`
      : `<strong>레이드 실패</strong><span>공략대 전멸 · 남은 보스 HP ${fmt(s.hp)}</span>`) + act;
  } else bn.hidden = true;

  // chips
  const me = myName(s);
  if(me) App.selected = me;
  if(App.selected && !s.members.includes(App.selected)) App.selected = null;
  if(!App.selected && s.members.length) App.selected = s.members[0];
  const meSel = $('meSelect'), meOpts = ['<option value="">운영자 (전체 입력)</option>'].concat(s.members.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`)).join('');
  if(meSel.dataset.opts !== meOpts){ meSel.innerHTML = meOpts; meSel.dataset.opts = meOpts; }
  meSel.value = me || '';
  /* 데미지 입력 대상: 내 이름으로 들어왔으면 나 자신(선택 칸 없음), 운영자면 작은 선택 칸 */
  const who = $('inputWho'), whoOpts = s.members.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
  if(who.dataset.opts !== whoOpts){ who.innerHTML = whoOpts; who.dataset.opts = whoOpts; }
  who.value = App.selected || '';
  $('inputWhoWrap').hidden = !!me || !s.members.length;
  $('inputMe').textContent = me ? me : '';

  // party status cards (공략대 상태)
  const rows = s.members.slice().sort((a,b)=>s.stats[b].dmg - s.stats[a].dmg);
  const top = rows.length ? s.stats[rows[0]].dmg : 0;
  const maxD = Math.max(1, top);
  const editAll = hasRaid && !App.readOnly && !OVERLAY && s.status === 'live';
  const alive = rows.filter(m=>(s.mhp[m] ?? 1) > 0).length;
  $('partyCount').textContent = rows.length ? `생존 ${alive} / ${rows.length}` : '';
  const pb = $('partyBody');
  if(!(pb.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName))){
  pb.innerHTML = rows.length ? rows.map((m,i)=>{
    const x = s.stats[m], ro = rosterOf(App.raid, m), canEdit = editAll && (!me || me === m);
    const h = s.mhp[m] ?? PARTY_HP, mx = s.maxH[m] ?? PARTY_HP, down = h <= 0, low = !down && h <= mx*0.4;
    const g = s.gauge[m] ?? 0, need = s.needG[m] ?? s.G.max, full = g >= need;
    const rk = s.role[m] || ro.role;
    /* 역할은 레이드 시작 후 바꿀 수 없음 (참가할 때 정함) */
    const roleCell = `<span title="레이드 시작 후에는 역할을 바꿀 수 없습니다">${ROLES[rk].label}</span>`;
    const left = (s.fee[m] ?? ro.fee) - (s.spent[m] ?? 0), fund = (s.fund && s.fund[m]) || 0;
    const feeCell = (canEdit ? `<input type="number" min="0" step="10" value="${ro.fee}" data-rfee="${esc(m)}" aria-label="${esc(m)} 초기 지참금" title="초기 지참금">` : `<b class="num" title="초기 지참금">${fmt(ro.fee)}</b>`) + (fund ? `<span class="hint num" title="추가 지원금">+지원 ${fmt(fund)}</span>` : '') + `<span class="hint num" title="장비 룰렛에 쓰고 남은 지참금">남음 ${fmt(left)}</span>`;
    const kick = editAll && !me && canOperate() ? `<button type="button" class="kick" data-kick="${esc(m)}" title="공략대에서 내보내기">${App.kickArm===m ? '정말 내보내기' : '내보내기'}</button>` : '';
    const mvp = x.dmg>0 && x.dmg===top ? '<span class="mvp">MVP</span>' : '';
    return `<article class="pcard${down?' down':''}${low?' low':''}${m===me?' mine':''}${!me && m===App.selected?' sel':''}" data-pick="${esc(m)}">
      <header class="pc-head"><span class="pc-rank num">${i+1}</span><span class="role-tag ${rk}">${ROLES[rk].short}</span><b class="pc-name">${esc(m)}</b>${mvp}<span class="pc-tags">${statusTags(s, m)}</span>${kick}</header>
      <div class="rbar hp${low?' low':''}${down?' ko':''}"><i style="width:${Math.max(0, h/mx*100)}%"></i><span class="rb-l">HP</span><span class="rb-v num">${down ? '전투불능' : `${fmt(h)} / ${fmt(mx)}`}</span></div>
      <div class="rbar sp${full?' full':''}"><i style="width:${Math.min(100, g/need*100)}%"></i><span class="rb-l">스킬</span><span class="rb-v num">${full ? '사용 가능' : `${g} / ${need}`}</span></div>
      ${gearHtml(s, m)}
      <footer class="pc-foot">
        <span class="pc-stat"><span class="hint">전적</span><b class="num">${x.w}승 ${x.l}패</b></span>
        <span class="pc-stat"><span class="hint">데미지</span><b class="num">${fmt(x.dmg)}</b><span class="share" style="width:${Math.round(x.dmg/maxD*48)}px"></span></span>
        <span class="pc-stat"><span class="hint">역할</span>${roleCell}</span>
        <span class="pc-stat"><span class="hint">지참금</span>${feeCell}</span>
      </footer>
    </article>`;
  }).join('') : `<p class="empty">아직 공략대원이 없습니다. 초대 코드로 참가하면 여기에 나타납니다.</p>`;
  }

  // party HP strip (HUD & overlay)
  $('partyStrip').innerHTML = s.members.map(m=>{
    const h = s.mhp[m] ?? PARTY_HP, mx = s.maxH[m] ?? PARTY_HP, pct = Math.max(0, h/mx*100), rk = s.role[m] || 'dealer';
    const g = s.gauge[m] ?? 0, need = s.needG[m] ?? s.G.max, full = g >= need;
    return `<span class="pm${h<=0?' down':h<=mx*0.4?' low':''}" title="${esc(m)} ${ROLES[rk].label} · 체력 ${h}/${mx} · 게이지 ${g}/${need}"><span class="nm"><span class="role-tag ${rk}">${ROLES[rk].short}</span>${esc(m)}</span><span class="pb"><i style="width:${pct}%"></i></span><span class="hv">${h<=0?'KO':h}</span>${s.curse[m]?'<span class="cur">저주</span>':''}<span class="gb${full?' full':''}"><i style="width:${Math.min(100,g/need*100)}%"></i></span></span>`;
  }).join('');

  // log
  const items = s.log.slice().reverse();
  $('log').innerHTML = items.length ? items.map(e=>{
    const ev = e.ev, d = new Date(ev.t);
    const tm = String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    const deltas = [];
    if(e.dHp < 0) deltas.push(`<span class="d-hp">HP ${fmt(e.dHp)}</span>`);
    if(e.dHp > 0) deltas.push(`<span class="d-heal">HP +${fmt(e.dHp)}</span>`);
    if(e.dRage > 0) deltas.push(`<span class="d-rage">분노 +${fmt(e.dRage)}</span>`);
    if(e.dRage < 0) deltas.push(`<span class="d-heal">분노 ${fmt(e.dRage)}</span>`);
    const pd = (e.party||[]).reduce((a,x)=>a+x.d,0); if(pd) deltas.push(`<span class="d-party">공략대 −${fmt(pd)}</span>`);
    if(e.healed) deltas.push(`<span class="d-heal">공략대 +${fmt(e.healed)}</span>`);
    const id = esc(ev._id);
    const canCtl = !(App.readOnly || !ev._id || (me && ev.member !== me)) && ev.type !== 'party';
    const ctl = canCtl ? `<button type="button" class="undo" data-undo="${id}" data-state="${ev.undone?1:0}">${ev.undone?'되살리기':'취소'}</button>` : '';
    return `<li class="${e.undone?'undone':''} ${e.ignored?'ignored':''}"><span class="time">${tm}</span>
      <div class="what">${whatHtml(e)}${e.notes.length?`<div class="fx">${esc(e.notes.join(' · '))}</div>`:''}${skillHtml(e)}${ctl}</div>
      <div class="delta">${deltas.join('<br>') || '<span style="color:var(--muted)">-</span>'}</div></li>`;
  }).join('') : `<li style="display:block" class="empty">결과를 입력하거나 룰렛을 돌리면 기록이 쌓입니다. 잘못 넣은 기록은 여기서 취소할 수 있습니다.</li>`;

  // input availability
  const canAct = hasRaid && s.status==='live' && !App.readOnly && s.members.length>0;
  ['submitGame','spin','points','btnWin','btnLoss'].forEach(id=>{ $(id).disabled = !canAct || (App.spinning && id==='spin'); });
  document.querySelectorAll('.wt').forEach(b=>{ b.disabled = !canAct; });
  $('addMember').disabled = $('addMemberBtn').disabled = $('addMemberRole').disabled = !hasRaid || App.readOnly || s.status!=='live' || !!me || !canOperate();
  $('spinFor').textContent = App.selected ? `${App.selected} 룰렛으로 기록됩니다` : '';
  $('subline').textContent = hasRaid ? `시작 ${new Date(App.raid.startedAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}` : '래더 점수로 보스를 잡는 협동 레이드';
  updateGamePreview();
  if(typeof autoArchive === 'function' && hasRaid && !OVERLAY) autoArchive(s);
  renderTicker(s);
  renderJoin(s, myName(s));
  renderEndBtn(s, me);
  renderGearPanel(s, canAct, me);
  renderMeInfo(s, me, canAct);
  renderAdminBtn();
  renderRoleBar(s, me, canAct);
  if(typeof renderLadderPanel === 'function') renderLadderPanel(s, me);
  if(typeof renderBrowserCollect === 'function') renderBrowserCollect();
  if(typeof renderInvite === 'function') renderInvite(s, me);
  renderOdds(s.S);
  renderSkillBoard(s);
  if(typeof renderDmgMeter === 'function') renderDmgMeter(s);
  if(!$('skillModal').hidden && !App.skDirty && !App.setDirty) renderSkillModal();
}

function topDealer(s){
  let best = null, v = 0;
  for(const m of s.members){ if(s.stats[m].dmg > v){ v = s.stats[m].dmg; best = m; } }
  return best;
}

function updateGamePreview(){
  const s = App.lastState; const el = $('gamePreview');
  if(!s || !App.raid || !App.selected){ el.innerHTML = '공략대원과 점수를 입력하면 들어갈 데미지가 여기에 미리 표시됩니다.'; return; }
  const p = Math.abs(parseInt($('points').value,10) || 0);
  const pend = s.pending[App.selected];
  if(!p){ el.innerHTML = `<b>${esc(App.selected)}</b>의 래더 결과 화면 점수를 입력하세요.${pend?` 대기 효과: <b>${esc(PENDING_LABEL[pend])}</b>`:''}${autoOn(App.selected)?'<br><b style="color:#ffd34d">이 공략대원은 래더 결과가 자동으로 들어옵니다.</b> 자동으로 못 들어온 판만 직접 입력하세요.':''}`; return; }
  if(App.isWin){
    let mult = 1;
    const gw = s.gear[App.selected]; if(gw && gw.dmg) mult *= 1 + gw.dmg;
    if(pend==='double') mult *= 2;
    if(pend==='mission') mult *= 3;
    if((s.mhp[App.selected] ?? 1) <= 0){ el.innerHTML = `<b>${esc(App.selected)}</b>는 전투불능입니다. 승리하면 데미지 대신 <b class="d-heal">체력 ${REVIVE_HP}으로 부활</b>합니다.`; return; }
    if(s.curse[App.selected]) mult *= s.curse[App.selected];
    if(s.barrier) mult *= 0.5;
    if(s.rally) mult *= 1.5;
    mult = Math.round(mult*100)/100;
    const chainNext = !s.chain.includes(App.selected) && s.chain.length===2;
    const dmgP = Math.round(p*mult), rr = Math.round(dmgP * (s.cfg.rageRate ?? 0.5) * (1 - ((s.gear[App.selected]||{}).rageCut||0)) * 10)/10, boomW = s.maxRage && s.rage + rr >= s.maxRage;
    el.innerHTML = `보스 HP <b class="d-hp">−${fmt(dmgP)}</b>${mult!==1?` (×${mult})`:''} · 분노 <b class="d-rage">+${fmt(rr)}</b>${boomW?' · <b class="d-hp">분노 가득 → 보스 스킬 발동</b>':''}${chainNext?` + 체인 보너스 <b class="d-hp">−${fmt(Math.round(s.maxHp*s.S.chain/100))}</b>`:''}`;
  } else {
    if(pend==='shield'){ el.innerHTML = '패배 보호가 발동해서 <b>보스가 회복하지 않습니다</b>.'; return; }
    const h = s.enraged ? Math.min(Math.round(p*s.cfg.rec/100), s.maxHp - s.hp) : 0;
    const ld = Math.round(p * (Number(s.S.lossDmg)||0));
    el.innerHTML = `${ld ? `<b>${esc(App.selected)}</b> 체력 <b class="d-hp">−${fmt(ld)}</b>` : '체력 피해 없음'}${h ? ` · 보스 HP가 50% 아래라 <b class="d-heal">+${fmt(h)}</b> 회복` : ''} · 스킬 게이지 +${s.G.loss}`;
  }
}

export { render, topDealer, updateGamePreview };
