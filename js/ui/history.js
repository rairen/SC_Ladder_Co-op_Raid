/* =====================================================================
   history.js — 오버레이 스킬 목록, 레이드 기록, 명예의 전당
   ===================================================================== */
/* ---------- Skill board (overlay) ---------- */
import { App } from '@app/core/app.js';
import { PARTY_HP, PRESETS, RACES, ROLES, SKILL_TYPES } from '@app/core/game-data.js';
import { $, OVERLAY, esc, fmt, squadLabel, leadName, bindModal, openModal } from '@app/core/state.js';
import { guard, store, toast } from '@app/core/store.js';
import { bossSkillsOf, cfgOf, compute, dmgByText, inputOf, rosterOf, skillHtml, whatHtml, catOf, catTag, LOG_CATS } from '@app/core/logic.js';
import { render, topDealer } from '@app/ui/render.js';
import { openSetup } from '@app/ui/setup.js';
import { pct } from '@app/ui/info-window.js';
import { canOperate, canSeeHist } from '@app/features/auth.js';

function renderSkillBoard(s){
  if(!OVERLAY || !document.documentElement.classList.contains('ovl-skills')) return;
  const list = s.BS;
  const ready = s.members.filter(m=>(s.gauge[m]??0) >= (s.needG[m] ?? s.G.max) && (s.mhp[m]??1) > 0);
  $('skillBoard').innerHTML = `<div class="sb-title">${App.raid ? esc(App.raid.name) : '보스 대기 중'}<small>보스 스킬 · 분노 ${fmt(s.rage)}/${fmt(s.maxRage)}</small></div>
    <ul class="sb-list">${list.map(x=>`<li class="${x.name===s.lastSkill?'last':''}"><span class="sn">${esc(x.name)}</span><span class="sd">${esc((SKILL_TYPES[x.type]||SKILL_TYPES.smash).desc(x.v))}</span><span class="sw">${pct(x.w, list)}%</span></li>`).join('')}</ul>
    ${ready.length ? `<div class="sb-ready">공략대 스킬 준비: ${ready.map(m=>`<b>${esc(m)}</b> (${esc(s.RS[s.role[m]].name)})`).join(', ')}</div>` : ''}`;
}

/* ---------- Raid history ---------- */
function summarize(r, s, stopped, evs = App.events){
  const members = {}, gone = s.gone || [];
  for(const m of s.members.concat(gone)){
    const x = s.stats[m] || {w:0,l:0,dmg:0,rage:0,best:0}, ro = rosterOf(r, m), g = s.gear[m];
    const join = evs.find(e=>e.type==='party' && e.action==='join' && e.member===m && !e.undone);
    const itemName = it => it && !it.base ? it.name + (it.gradeLabel ? `[${it.gradeLabel}]` : '') : '';
    members[m] = {w:x.w, l:x.l, dmg:x.dmg, by:{...(x.by || {})}, rage:x.rage, best:x.best||0, taken:x.skills||0, hp:s.mhp[m] ?? PARTY_HP, maxHp:s.maxH[m] ?? PARTY_HP,
      role: s.role[m] || ro.role, fee: s.fee[m] ?? ro.fee, spent: s.spent[m] || 0, ladder: ro.ladder || '', joinedAt: join ? join.t : (r.startedAt||0),
      gear: g ? [itemName(g.weapon), itemName(g.armor), itemName(g.accessory)].filter(Boolean) : [],
      items: ((s.inv && s.inv[m]) || []).length, ...(gone.includes(m) ? {gone: true} : {})};
  }
  const left = [...new Set(evs.filter(e=>e.type==='party' && e.action==='kick' && !e.undone).map(e=>e.member))].filter(m=>!s.members.includes(m));
  const tot = Object.values(members).reduce((a,x)=>({w:a.w+x.w, l:a.l+x.l}), {w:0,l:0});
  const lastT = evs.filter(e=>!e.undone).reduce((a,e)=>Math.max(a, e.t||0), r.startedAt||0);
  return {raidId:r.raidId, squad:r.squad||0, squadLabel: squadLabel(r), lead: leadName(r), name:r.name||'이름 없는 보스', diff:r.diff||'custom', cfg:s.cfg, startedAt:r.startedAt||0, endedAt:s.endedAt || lastT,
    status: s.status==='live' ? (stopped ? 'stopped' : 'live') : s.status,
    maxHp:s.maxHp, hpLeft:s.hp, rage:s.rage, maxRage:s.maxRage, wins:tot.w, losses:tot.l, mvp:topDealer(s)||'', members, left,
    boss: bossSpecOf(r, s), hqDmg: (s.hq && s.hq.dmg) || 0, private: !!r.private, maxMembers: Number(r.maxMembers) || 0,
    evCount: evs.length, race: r.race || 'mixed', bossSkills: bossSkillsOf(r), roleSkills: r.roleSkills || null, gauge: r.gauge || null, roster: r.roster || null, settings: r.settings || null,
    events: evs.map(e=>{ const o = {t:e.t||0, type:e.type, member:e.member}; if(e.type==='game'){ o.points = e.points; o.input = e.input === 'auto' || e.input === 'manual' ? e.input : (e.auto ? 'auto' : 'manual'); if(e.auto) o.auto = true; if(e.src) o.src = e.src; if(e.games > 1) o.games = e.games; if(e.multi) o.multi = true; if(e.same) o.same = true; if(e.banned) o.banned = true; } else if(e.type==='roulette'){ o.item = e.item; if(e.target) o.target = e.target; } else if(e.type==='repair' || e.type==='buy' || e.type==='use') o.item = e.item; else if(e.type==='drop'){ o.item = e.item; if(e.salvage) o.salvage = true; } else if(e.type==='hq'){ o.item = e.item; o.slot = e.slot; if(e.by) o.by = e.by; } else if(e.type==='gear'){ o.item = e.item; o.cost = e.cost; if(e.grade) o.grade = e.grade; o.id = e._id || ''; } else if(e.type==='equip') o.item = e.item; else if(e.type==='fund') o.amount = e.amount; else if(e.type==='party'){ o.action = e.action; if(e.role) o.role = e.role; if(e.fee != null) o.fee = e.fee; } if(e.undone) o.undone = true; return o; })};
}
function autoArchive(s){
  if(!App.raid || s.status === 'live' || App.readOnly || !canOperate()) return;
  const sum = summarize(App.raid, s, false);
  const prev = App.history.find(h=>h.raidId===sum.raidId);
  const same = prev && prev.status===sum.status && prev.hpLeft===sum.hpLeft && prev.rage===sum.rage && prev.wins===sum.wins && prev.losses===sum.losses && prev.evCount===sum.evCount && Object.keys(prev.members||{}).length===Object.keys(sum.members).length;
  if(same) return;
  clearTimeout(App.archiveTimer);
  App.archiveTimer = setTimeout(()=>guard(()=>store.archive(sum)), 600);
}
const RES_LABEL = {clear:'성공', fail:'실패', stopped:'중단', live:'진행 중'};
/* 보스 스펙: 레이드 기록에 함께 남기는 보스 수치 */
function bossSpecOf(r, s){
  const c = cfgOf(r);
  return {diff: r.diff || 'custom', race: r.race || 'mixed', hp: Number(c.hp)||0, bonus: Number(c.bonus)||0, rage: Number(c.rage)||0, rageRate: Number(c.rageRate ?? 0.5), rec: Number(c.rec)||0,
    n: s.members.length, maxHp: s.maxHp, maxRage: s.maxRage, skills: bossSkillsOf(r).map(x=>({name: x.name, type: x.type, w: x.w, v: x.v}))};
}
/* 예전 기록(boss 없음)은 남아 있는 값으로 보스 스펙을 만듦 */
function specOfHist(h){
  if(h.boss) return h.boss;
  const c = h.cfg || {};
  return {diff: h.diff || 'custom', race: h.race || 'mixed', hp: Number(c.hp)||0, bonus: Number(c.bonus)||0, rage: Number(c.rage)||0, rageRate: Number(c.rageRate ?? 0.5), rec: Number(c.rec)||0,
    n: Object.keys(h.members||{}).length, maxHp: h.maxHp||0, maxRage: h.maxRage||0, skills: (h.bossSkills || []).map(x=>({name:x.name, type:x.type, w:x.w, v:x.v}))};
}
/* 보스 스펙 표시 (레이드 기록 펼침, 공략대원 참여 레이드 팝업에서 같이 씀) */
/* basic: 비공개 공략대 잠금 화면용. 인원에 따라 바뀌는 전체 HP는 빼고 시작 전 기본값만 */
function bossSpecHtml(b, {basic = false} = {}){
  const skills = (b.skills||[]).map(x=>{ const t = SKILL_TYPES[x.type]; return `<span class="bs-chip" title="${esc(t ? t.desc(x.v) : '')}">${esc(x.name)}${t ? `<small>${esc(t.desc(x.v))}</small>` : ''}</span>`; }).join('');
  return `<div class="boss-spec">
    <span>난이도 <b>${esc((PRESETS[b.diff]||PRESETS.custom).label)}</b></span><span>종족 <b>${esc(RACES[b.race] || RACES.mixed)}</b></span>
    ${basic ? `<span>보스 HP <b>1인당 ${fmt(b.hp)}</b>${b.bonus ? ` <small>+ 인원당 ${fmt(b.bonus)}</small>` : ''}</span>` : `<span>보스 HP <b>${fmt(b.maxHp)}</b> <small>1인당 ${fmt(b.hp)}${b.bonus ? ` + 인원당 ${fmt(b.bonus)}` : ''} · ${b.n}명</small></span>`}
    <span>분노 최대 <b>${fmt(basic ? b.rage : b.maxRage)}</b> <small>데미지 × ${b.rageRate}</small></span><span>보스 회복 <b>${b.rec}%</b></span>
  </div>${skills ? `<div class="bs-skills"><span class="label" style="margin:0">보스 스킬</span>${skills}</div>` : ''}`;
}
function fmtDate(t){ if(!t) return '-'; const d = new Date(t); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function fame(){
  const P = {};
  let bestHit = null, bestRaid = null;
  for(const h of App.history){
    if(h.status==='live' || !canSeeHist(h)) continue;
    for(const [m,x] of Object.entries(h.members||{})){
      const p = P[m] || (P[m] = {raids:0, clears:0, w:0, l:0, dmg:0, rage:0, best:0, mvp:0});
      p.raids++; if(h.status==='clear') p.clears++;
      p.w += x.w||0; p.l += x.l||0; p.dmg += x.dmg||0; p.rage += x.rage||0;
      if((x.best||0) > p.best) p.best = x.best;
      if(h.mvp===m) p.mvp++;
      if(!bestHit || (x.best||0) > bestHit.v) bestHit = {m, v:x.best||0, boss:h.name};
      if(!bestRaid || (x.dmg||0) > bestRaid.v) bestRaid = {m, v:x.dmg||0, boss:h.name};
    }
  }
  return {P, bestHit, bestRaid};
}
function renderHistory(){
  const done = App.history.filter(h=>h.status!=='live' && canSeeHist(h)).sort((a,b)=>(b.endedAt||b.startedAt)-(a.endedAt||a.startedAt));
  const {P, bestHit, bestRaid} = fame();
  const names = Object.keys(P).sort((a,b)=>P[b].dmg-P[a].dmg);
  const clears = done.filter(h=>h.status==='clear').length, fails = done.filter(h=>h.status==='fail').length;
  $('records').innerHTML = `
    <div class="rec"><div class="k">레이드 전적</div><div class="v">${clears}승 ${fails}패</div><div class="w">총 ${done.length}회${done.length-clears-fails ? ' · 중단 '+(done.length-clears-fails) : ''}</div></div>
    <div class="rec"><div class="k">누적 딜 1위</div><div class="v">${names[0] ? esc(names[0]) : '-'}</div><div class="w">${names[0] ? fmt(P[names[0]].dmg) : '기록 없음'}</div></div>
    <div class="rec"><div class="k">한 판 최고 데미지</div><div class="v">${bestHit && bestHit.v ? esc(bestHit.m) : '-'}</div><div class="w">${bestHit && bestHit.v ? fmt(bestHit.v)+' · '+esc(bestHit.boss) : '기록 없음'}</div></div>
    <div class="rec"><div class="k">레이드 1회 최고 딜</div><div class="v">${bestRaid && bestRaid.v ? esc(bestRaid.m) : '-'}</div><div class="w">${bestRaid && bestRaid.v ? fmt(bestRaid.v)+' · '+esc(bestRaid.boss) : '기록 없음'}</div></div>`;

  $('histView').innerHTML = done.length ? `<div class="tbl-wrap"><table>
    <thead><tr><th>시작</th><th>종료</th><th>보스</th><th>난이도</th><th class="r">인원</th><th>결과</th><th class="r">전적</th><th class="r">남은 HP</th><th>MVP</th></tr></thead>
    <tbody>${done.map(h=>{
      const mem = Object.entries(h.members||{});
      return `<tr class="hrow" data-h="${esc(h.raidId)}" tabindex="0" aria-haspopup="dialog" title="눌러서 이 레이드 기록 보기"><td class="num">${fmtDate(h.startedAt)}</td><td class="num">${fmtDate(h.endedAt)}</td><td>${esc(h.name)}</td><td>${esc((PRESETS[h.diff]||PRESETS.custom).label)}</td>
        <td class="r num">${mem.length}</td><td><span class="res ${h.status}">${RES_LABEL[h.status]||h.status}</span></td>
        <td class="r num">${h.wins}승 ${h.losses}패</td><td class="r num">${fmt(h.hpLeft)} / ${fmt(h.maxHp)}</td><td>${h.mvp ? esc(h.mvp) : '-'}</td></tr>`;
    }).join('')}</tbody></table></div><p class="hint" style="margin:8px 0 0">줄을 누르면 그 레이드의 공략대원 기록과 전투 기록이 팝업으로 열립니다.</p>`
    : `<p class="empty">레이드가 성공·실패로 끝나거나 새 레이드를 시작하면 여기에 기록이 남습니다.</p>`;

  $('fameView').innerHTML = names.length ? `<div class="tbl-wrap"><table>
    <thead><tr><th>순위</th><th>공략대원</th><th class="r">참여</th><th class="r">클리어</th><th class="r">MVP</th><th class="r">승</th><th class="r">패</th><th class="r">누적 데미지</th><th class="r">한 판 최고</th><th class="r">분노 유발</th></tr></thead>
    <tbody>${names.map((m,i)=>{ const p = P[m]; return `<tr><td class="num">${i+1}</td><td><button type="button" class="linkbtn name-btn" data-ledger="${esc(m)}" title="${esc(m)} 지참금 내역">${esc(m)}</button></td><td class="r num"><button type="button" class="linkbtn num" data-praids="${esc(m)}" title="${esc(m)} 참여 레이드 보기">${p.raids}</button></td><td class="r num">${p.clears}</td><td class="r num">${p.mvp}</td><td class="r num">${p.w}</td><td class="r num">${p.l}</td><td class="r num">${fmt(p.dmg)}</td><td class="r num">${fmt(p.best)}</td><td class="r num">${fmt(p.rage)}</td></tr>`; }).join('')}</tbody>
  </table></div>` : `<p class="empty">끝난 레이드가 쌓이면 공략대원별 누적 기록이 표시됩니다.</p>`;
  $('histView').hidden = App.histTab !== 'hist';
  $('fameView').hidden = App.histTab !== 'fame';
}
function histDetail(h, mem){
  const cfg = h.cfg || {hp:0, rage:0, rec:0};
  const dur = h.endedAt && h.startedAt ? Math.max(0, Math.round((h.endedAt - h.startedAt)/60000)) : null;
  const meta = `<div class="hd-meta">
    <span>시작 <b>${fmtDate(h.startedAt)}</b></span><span>종료 <b>${fmtDate(h.endedAt)}</b></span>${dur!==null ? `<span>진행 <b>${dur >= 60 ? Math.floor(dur/60)+'시간 '+(dur%60)+'분' : dur+'분'}</b></span>` : ''}
    ${(()=>{ const g = (h.events||[]).filter(e=>e.type==='game' && !e.undone); if(!g.length) return ''; const a = g.filter(e=>inputOf(e)==='auto').length; return `<span>래더 기록 <b>자동 ${a}</b> · <b>수동 ${g.length - a}</b></span>`; })()}
    <span>남은 보스 HP <b>${fmt(h.hpLeft)} / ${fmt(h.maxHp)}</b></span>${h.hqDmg ? `<span>본부 공격지원 <b>${fmt(h.hqDmg)}</b></span>` : ''}<span>분노 <b>${fmt(h.rage)} / ${fmt(h.maxRage)}</b></span></div>
    <h3 class="label" style="margin:10px 0 4px">보스 스펙</h3>${bossSpecHtml(specOfHist(h))}`;
  const table = `<div class="tbl-wrap"><table class="mini">
    <thead><tr><th>공략대원</th><th>역할</th><th class="r">지참금</th><th class="r">승</th><th class="r">패</th><th class="r">데미지</th><th class="r">한 판 최고</th><th class="r">분노 유발</th><th class="r">최종 체력</th><th>장비</th></tr></thead>
    <tbody>${mem.length ? mem.map(([m,x])=>`<tr><td>${esc(m)}${x.gone?'<span class="gone-tag" title="레이드 도중 공략대를 떠남">떠남</span>':''}${h.lead===m?'<span class="lead-tag" title="공략대장">대장</span>':''}${h.mvp===m?'<span class="mvp">MVP</span>':''}${x.ladder?`<div class="hint">${esc(x.ladder)}</div>`:''}</td>
      <td>${x.role && ROLES[x.role] ? `<span class="role-tag ${x.role}">${ROLES[x.role].short}</span>${ROLES[x.role].label}` : '-'}</td>
      <td class="r num">${x.fee != null ? fmt(x.fee) + (x.spent ? `<div class="hint">사용 ${fmt(x.spent)}</div>` : '') : '-'}</td>
      <td class="r num">${x.w}</td><td class="r num">${x.l}</td><td class="r num">${fmt(x.dmg)}${x.by && Object.keys(x.by).some(k=>k !== 'ladder' && x.by[k]) ? `<div class="hint">${esc(dmgByText(x.by))}</div>` : ''}</td><td class="r num">${fmt(x.best||0)}</td><td class="r num">${fmt(x.rage)}</td>
      <td class="r num">${x.hp != null ? (x.gone ? '<span class="hint">떠남</span>' : x.hp <= 0 ? '<span class="d-hp">전투불능</span>' : `${fmt(x.hp)}${x.maxHp ? '/'+fmt(x.maxHp) : ''}`) : '-'}</td>
      <td>${x.gear && x.gear.length ? esc(x.gear.join(', ')) : '<span class="hint">기본</span>'}</td></tr>`).join('') : '<tr><td colspan="10" class="empty">참가한 공략대원이 없었습니다.</td></tr>'}</tbody>
  </table></div>${h.left && h.left.length ? `<p class="hint" style="margin:6px 0 0">중간에 내보낸 공략대원: ${esc(h.left.join(', '))}</p>` : ''}`;
  let logHtml = '<p class="empty">이 레이드는 전투 기록이 저장되지 않았습니다.</p>';
  if(Array.isArray(h.events) && h.events.length){
    const rows = [];
    const st = compute({members:Object.keys(h.members||{}), cfg:h.cfg, bossSkills:h.bossSkills, roleSkills:h.roleSkills, gauge:h.gauge, roster:h.roster, settings:h.settings}, h.events.map((e,i)=>({...e, _id: e.id || 'h'+i})));
    st.log.slice().reverse().forEach(e=>{
      const ev = e.ev, d = new Date(ev.t), tm = String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
      const what = whatHtml(e);
      const ds = [];
      if(e.dHp < 0) ds.push(`<span class="d-hp">HP ${fmt(e.dHp)}</span>`);
      if(e.dHp > 0) ds.push(`<span class="d-heal">HP +${fmt(e.dHp)}</span>`);
      if(e.dRage > 0) ds.push(`<span class="d-rage">분노 +${fmt(e.dRage)}</span>`);
      if(e.dRage < 0) ds.push(`<span class="d-heal">분노 ${fmt(e.dRage)}</span>`);
      const pd = (e.party||[]).reduce((a,x)=>a+x.d,0); if(pd) ds.push(`<span class="d-party">공략대 −${fmt(pd)}</span>`);
      if(e.healed) ds.push(`<span class="d-heal">공략대 +${fmt(e.healed)}</span>`);
      rows.push({cat: catOf(ev), html: `<li class="${e.undone?'undone':''} ${e.ignored?'ignored':''}" data-cat="${catOf(ev)}"><span class="time">${tm}${catTag(ev)}</span><div class="what">${what}${e.notes.length?`<div class="fx">${esc(e.notes.join(' · '))}</div>`:''}${skillHtml(e)}</div><div class="delta">${ds.join('<br>') || '<span style="color:var(--muted)">-</span>'}</div></li>`});
    });
    /* 메인 화면처럼 2단: 왼쪽 데미지 관련 전투 기록, 오른쪽 그 외 (분류 탭) */
    const bat = rows.filter(x=>x.cat === 'battle'), etc = rows.filter(x=>x.cat !== 'battle'), n = {all: etc.length};
    etc.forEach(x=>{ n[x.cat] = (n[x.cat]||0) + 1; });
    const tabs = [['all','전체'], ...Object.entries(LOG_CATS).filter(([k])=>k !== 'battle')].map(([k,l])=>`<button type="button" data-hlogf="${k}" aria-pressed="${k==='all'}"${k !== 'all' && !n[k] ? ' class="empty-cat"' : ''}>${l}${n[k] ? ` <span class="num">${n[k]}</span>` : ''}</button>`).join('');
    logHtml = `<div class="log-cols hd-logs">
      <div class="log-col"><div class="panel-head"><h3>전투 기록</h3></div><ul class="log compact">${bat.length ? bat.map(x=>x.html).join('') : '<li style="display:block" class="empty">데미지 관련 기록이 없습니다.</li>'}</ul></div>
      <div class="log-col"><div class="panel-head"><h3>기타 기록</h3><div class="seg small log-filter" role="tablist" aria-label="기록 분류">${tabs}</div></div><ul class="log compact hlog-etc" data-f="all">${etc.length ? etc.map(x=>x.html).join('') : '<li style="display:block" class="empty">룰렛 · 본부지원 · 아이템 · 지원금 · 공략대 기록이 없습니다.</li>'}</ul></div>
    </div>`;
  }
  return meta + `<h3 class="hd-h">공략대원 기록</h3>${table}${logHtml}`;
}
/* 레이드 기록 팝업 */
function openHistModal(rid){
  const h = App.history.find(x=>x.raidId === rid); if(!h || !canSeeHist(h)) return;
  const mem = Object.entries(h.members||{}).sort((a,b)=>b[1].dmg-a[1].dmg);
  $('histModalTitle').textContent = `${h.lead ? h.lead+' 공략대 · ' : ''}${h.squadLabel || ''} "${h.name}" · ${RES_LABEL[h.status] || h.status}`;
  $('histBody').innerHTML = histDetail(h, mem);
  openModal('histModal', '#histClose');
}
function setHistTab(t){ App.histTab = t; $('tabHist').setAttribute('aria-pressed', t==='hist'); $('tabFame').setAttribute('aria-pressed', t==='fame'); renderHistory(); }

/* 처음 한 번 실행: 화면 이벤트 연결, 초기값 설정 (js/main.js 가 파일 순서대로 부름) */
export function init(){

  App.archiveTimer = null;
  $('tabHist').onclick = ()=>setHistTab('hist');
  $('tabFame').onclick = ()=>setHistTab('fame');
  $('histView').addEventListener('click', e=>{ const r = e.target.closest('tr.hrow'); if(r) openHistModal(r.dataset.h); });
  $('histView').addEventListener('keydown', e=>{ if(e.key!=='Enter') return; const r = e.target.closest('tr.hrow'); if(r) openHistModal(r.dataset.h); });
  bindModal('histModal', 'histClose');
  $('histBody').addEventListener('click', e=>{
    const b = e.target.closest('[data-hlogf]'); if(!b) return;
    const ul = $('histBody').querySelector('.hlog-etc'); if(ul) ul.dataset.f = b.dataset.hlogf;
    b.parentElement.querySelectorAll('[data-hlogf]').forEach(x=>x.setAttribute('aria-pressed', x === b));
  });
}


export { bossSpecOf, specOfHist, bossSpecHtml, renderSkillBoard, summarize, autoArchive, fmtDate, fame, renderHistory, histDetail, openHistModal, setHistTab, RES_LABEL };
