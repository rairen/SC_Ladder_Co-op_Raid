/* =====================================================================
   character.js — 프로필 창의 캐릭터 탭 (능력치 · 스킬 · 장비 · 인벤토리)
   ---------------------------------------------------------------------
   - 공략대에 참가 중이면: 그 레이드의 지금 상태(역할, 체력, 게이지, 착용 장비, 가방)
   - 참가 중이 아니면: 저장된 가방(coop/players/<이름>)으로 장비·인벤토리·지참금을 보여 주고,
     역할 능력치·스킬은 역할별 표로 보여 줌 (역할은 참가할 때 고름)
   ===================================================================== */
import { App } from '@app/core/app.js';
import { GEAR_SLOT, PARTY_HP, PRESETS, ROLES, ROLE_STATS } from '@app/core/game-data.js';
import { $, esc, fmt, squadLabel } from '@app/core/state.js';
import { store } from '@app/core/store.js';
import { compute, gearHtml, roleSkillsOf, rosterKey } from '@app/core/logic.js';
import { eventsOf } from '@app/core/boot.js';
import { profileName } from '@app/features/auth.js';

let tab = 'acc', seq = 0;
const pc = v => Math.round((Number(v) || 0) * 100) + '%';
const NEUTRAL = {atk:1, def:1, gauge:1};

/* 내 캐릭터 상태 가져오기 */
async function charState(){
  const uid = App.authUser && App.authUser.uid, name = profileName();
  const r = uid ? Object.values(App.raids).find(x=>x.uids && x.uids[uid] && (x.members || []).includes(x.uids[uid])) : null;
  if(r){ const m = r.uids[uid]; return {live: true, r, m, s: compute(r, eventsOf(r.raidId))}; }
  if(!name) return null;
  const bag = await store.loadBag(name).catch(()=>null);
  const fake = {raidId: 'char', members: [name], startedAt: 0, cfg: {...PRESETS.normal}, roster: {[rosterKey(name)]: {role: 'dealer', fee: 0, ...(bag ? {bag} : {})}}};
  return {live: false, m: name, s: compute(fake, []), bag};
}

function statTab(c){
  const {s, m, live} = c, g = s.gear[m] || {}, rk = live ? s.role[m] : '';
  const rst = live ? ((s.roleStats && s.roleStats[rk]) || NEUTRAL) : NEUTRAL;
  const atk = rst.atk * (1 + (g.dmg || 0));
  const rows = [
    ['체력', live ? `${fmt(Math.max(0, s.mhp[m] ?? 0))} / ${fmt(s.maxH[m])}` : fmt(PARTY_HP + (g.hp || 0)), `기본 ${PARTY_HP}${g.hp ? ` + 갑옷 ${g.hp}` : ''}`],
    ['공격 (승리 데미지)', pc(atk), `${live ? `역할 ${pc(rst.atk)}` : '역할 배율'}${g.dmg ? ` × 무기 +${Math.round(g.dmg*100)}%` : ''}`],
    ['받는 피해', live ? pc(rst.def) : '역할별', live ? '낮을수록 덜 아픔' : '참가할 때 고른 역할에 따라 달라집니다'],
    ['스킬 게이지 충전', live ? pc(rst.gauge) : '역할별', '승리·패배로 차는 양'],
    ['분노 상승', g.rageCut ? `−${Math.round(g.rageCut*100)}%` : '보통', g.rageCut ? '평온의 부적' : ''],
    ['불사', g.immortal ? (live && s.immUsed && s.immUsed[m] ? '사용함' : `쓰러질 때 체력 ${g.revive}`) : '없음', g.immortal ? '불사의 목걸이' : '']
  ];
  const head = live
    ? `<p class="pf-now"><span class="role-tag ${rk}">${ROLES[rk].short}</span><b>${esc(m)}</b> · ${esc(ROLES[rk].label)} · ${esc(squadLabel(c.r))} "${esc(c.r.name || '')}" 참가 중</p>`
    : `<p class="hint" style="margin:0">지금은 공략대에 참가하지 않았습니다. 장비 능력치만 보이고, 역할 능력치는 참가할 때 고른 역할로 정해집니다.</p>`;
  const roleTbl = `<h3 class="label" style="margin:8px 0 4px">역할별 기본 능력치</h3>
    <div class="tbl-wrap"><table class="sk-table"><thead><tr><th>역할</th><th class="r">공격</th><th class="r">받는 피해</th><th class="r">게이지 충전</th></tr></thead><tbody>
    ${Object.entries(ROLES).map(([k,R])=>{ const x = ROLE_STATS[k] || NEUTRAL; return `<tr${k === rk ? ' class="on"' : ''}><td><span class="role-tag ${k}">${R.short}</span>${R.label}</td><td class="r num">${pc(x.atk)}</td><td class="r num">${pc(x.def)}</td><td class="r num">${pc(x.gauge)}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  return head + `<div class="tbl-wrap"><table class="sk-table pf-stat"><tbody>${rows.map(([k,v,d])=>`<tr><td><b>${k}</b></td><td class="r num">${v}</td><td class="desc">${esc(d)}</td></tr>`).join('')}</tbody></table></div>` + roleTbl;
}

function skillTab(c){
  const {s, m, live} = c, RS = live ? s.RS : roleSkillsOf(null), rk = live ? s.role[m] : '';
  let mine = '';
  if(live){
    const sk = RS[rk], g = s.gauge[m] ?? 0, need = s.needG[m] ?? s.G.max, full = g >= need;
    mine = `<div class="pf-skill${full ? ' ready' : ''}"><div><span class="role-tag ${rk}">${ROLES[rk].short}</span><b>${esc(sk.name)}</b> <span class="hint">${esc(ROLES[rk].label)}</span></div>
      <div class="hint">${esc(ROLES[rk].desc(sk.v))}</div>
      <div class="rbar sp${full ? ' full' : ''}"><i style="width:${Math.min(100, g/need*100)}%"></i><span class="rb-l">스킬</span><span class="rb-v num">${full ? '사용 가능' : `${g} / ${need}`}</span></div></div>`;
  }
  return mine + `<h3 class="label" style="margin:8px 0 4px">${live ? '다른 역할 스킬' : '역할 스킬 (참가할 때 고른 역할의 스킬을 씀)'}</h3>
    <div class="tbl-wrap"><table class="sk-table"><tbody>${Object.entries(ROLES).filter(([k])=>k !== rk).map(([k,R])=>`<tr><td><span class="role-tag ${k}">${R.short}</span>${R.label}</td><td><b>${esc(RS[k].name)}</b></td><td class="desc">${esc(R.desc(RS[k].v))}</td></tr>`).join('')}</tbody></table></div>`;
}

const effText = it => it.slot === 'weapon' ? `승리 데미지 +${Math.round(it.v*100)}%` : it.slot === 'armor' ? `최대 체력 +${it.v}` : it.idx === 1 ? `분노 상승 −${Math.round(it.v*100)}%` : `쓰러질 때 체력 ${it.revive} (1회)`;
function gearTab(c){
  const {s, m} = c, g = s.gear[m];
  if(!g) return '<p class="empty">장비 정보가 없습니다.</p>';
  const row = (slot, it) => `<tr><td>${GEAR_SLOT[slot]}</td><td><b class="${it.grade ? 'gr-' + it.grade : ''}">${esc(it.name)}${it.gradeLabel && !it.base ? ` [${it.gradeLabel}]` : ''}</b></td><td class="desc">${it.base ? '기본 장비' : esc(effText(it))}</td><td class="r num">${it.base || it.dur === Infinity ? '-' : `${it.dur}/${it.maxDur}`}</td></tr>`;
  return `<div class="pf-gear">${gearHtml(s, m)}</div>
    <div class="tbl-wrap"><table class="sk-table"><thead><tr><th>슬롯</th><th>장비</th><th>효과</th><th class="r">내구도</th></tr></thead><tbody>${row('weapon', g.weapon)}${row('armor', g.armor)}${row('accessory', g.accessory)}</tbody></table></div>
    <p class="hint" style="margin:0">장착 · 해제 · 수리 · 판매는 레이드 화면의 장비 룰렛 인벤토리에서 합니다.</p>`;
}

function invTab(c){
  const {s, m} = c, items = (s.inv && s.inv[m]) || [], eq = (s.eq && s.eq[m]) || {}, pots = (s.pots && s.pots[m]) || {};
  const left = Math.max(0, (s.fee[m] || 0) - (s.spent[m] || 0));
  const list = items.slice().sort((a,b)=>(b.rank - a.rank) || (b.idx - a.idx));
  return `<div class="pf-money"><span class="label" style="margin:0">지참금</span><b class="num">★ ${fmt(left)}</b><button type="button" class="linkbtn" data-ledger="${esc(m)}">내역</button></div>
    <h3 class="label" style="margin:8px 0 4px">소모품</h3>
    <div class="pf-pots">${Object.entries(s.S.potions).map(([k,p])=>`<span class="pf-pot pot-${k}"><b>${esc(p.name)}</b> <span class="num">×${pots[k] || 0}</span><small>${esc(p.unit)} +${p.v}</small></span>`).join('')}</div>
    <h3 class="label" style="margin:8px 0 4px">장비 가방 · ${items.length}개</h3>
    ${list.length ? `<div class="tbl-wrap"><table class="sk-table"><thead><tr><th>장비</th><th>효과</th><th class="r">내구도</th><th></th></tr></thead><tbody>
      ${list.map(it=>`<tr class="${it.broken ? 'broken' : ''}"><td><b class="${it.grade ? 'gr-' + it.grade : ''}">${it.gradeLabel ? `[${it.gradeLabel}] ` : ''}${esc(it.name)}</b></td><td class="desc">${esc(effText(it))}</td><td class="r num">${it.broken ? '<span class="d-hp">파괴</span>' : it.dur === Infinity ? '-' : `${it.dur}/${it.maxDur}`}</td><td>${eq[it.slot] === it.id ? '<span class="inv-on">착용 중</span>' : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">아직 얻은 장비가 없습니다. 장비 룰렛이나 룰렛 보급품으로 얻습니다.</p>'}`;
}

const RENDER = {stat: statTab, skill: skillTab, gear: gearTab, inv: invTab};
async function renderChar(){
  const box = $('pfChar'); if(!box || tab === 'acc') return;
  const my = ++seq;
  box.innerHTML = '<p class="hint">불러오는 중…</p>';
  const c = await charState();
  if(my !== seq || tab === 'acc') return;
  box.innerHTML = c ? RENDER[tab](c) : '<p class="empty">프로필 닉네임을 먼저 저장하세요.</p>';
}
function setTab(t){
  tab = t;
  document.querySelectorAll('#pfTabs [data-pftab]').forEach(b=>b.setAttribute('aria-pressed', b.dataset.pftab === t));
  $('pfAcc').hidden = t !== 'acc'; $('pfChar').hidden = t === 'acc';
  renderChar();
}

/* 처음 한 번 실행 (js/main.js 가 파일 순서대로 부름) */
export function init(){
  $('pfTabs').addEventListener('click', e=>{ const b = e.target.closest('[data-pftab]'); if(b) setTab(b.dataset.pftab); });
  // 프로필 창을 열 때마다 계정 탭부터
  new MutationObserver(()=>{ if(!$('profileModal').hidden && tab !== 'acc') setTab('acc'); }).observe($('profileModal'), {attributes: true, attributeFilter: ['hidden']});
}

export { renderChar, setTab as setProfileTab };
