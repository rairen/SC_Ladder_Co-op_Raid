/* =====================================================================
   history.js — 오버레이 스킬 목록, 레이드 기록, 명예의 전당
   ===================================================================== */
/* ---------- Skill board (overlay) ---------- */
function renderSkillBoard(s){
  if(!OVERLAY || !document.documentElement.classList.contains('ovl-skills')) return;
  const list = s.BS;
  const ready = s.members.filter(m=>(s.gauge[m]??0) >= (s.needG[m] ?? s.G.max) && (s.mhp[m]??1) > 0);
  $('skillBoard').innerHTML = `<div class="sb-title">${raid ? esc(raid.name) : '보스 대기 중'}<small>보스 스킬 · 분노 ${fmt(s.rage)}/${fmt(s.maxRage)}</small></div>
    <ul class="sb-list">${list.map(x=>`<li class="${x.name===s.lastSkill?'last':''}"><span class="sn">${esc(x.name)}</span><span class="sd">${esc((SKILL_TYPES[x.type]||SKILL_TYPES.smash).desc(x.v))}</span><span class="sw">${pct(x.w, list)}%</span></li>`).join('')}</ul>
    ${ready.length ? `<div class="sb-ready">공략대 스킬 준비: ${ready.map(m=>`<b>${esc(m)}</b> (${esc(s.RS[s.role[m]].name)})`).join(', ')}</div>` : ''}`;
}

/* ---------- Raid history ---------- */
function summarize(r, s, stopped){
  const members = {};
  for(const m of s.members){
    const x = s.stats[m] || {w:0,l:0,dmg:0,rage:0,best:0}, ro = rosterOf(r, m), g = s.gear[m];
    const join = events.find(e=>e.type==='party' && e.action==='join' && e.member===m && !e.undone);
    const itemName = it => it && !it.base ? it.name + (it.gradeLabel ? `[${it.gradeLabel}]` : '') : '';
    members[m] = {w:x.w, l:x.l, dmg:x.dmg, rage:x.rage, best:x.best||0, taken:x.skills||0, hp:s.mhp[m] ?? PARTY_HP, maxHp:s.maxH[m] ?? PARTY_HP,
      role: s.role[m] || ro.role, fee: s.fee[m] ?? ro.fee, spent: s.spent[m] || 0, ladder: ro.ladder || '', joinedAt: join ? join.t : (r.startedAt||0),
      gear: g ? [itemName(g.weapon), itemName(g.armor), itemName(g.accessory)].filter(Boolean) : [],
      items: ((s.inv && s.inv[m]) || []).length};
  }
  const left = [...new Set(events.filter(e=>e.type==='party' && e.action==='kick' && !e.undone).map(e=>e.member))].filter(m=>!s.members.includes(m));
  const tot = Object.values(members).reduce((a,x)=>({w:a.w+x.w, l:a.l+x.l}), {w:0,l:0});
  const lastT = events.filter(e=>!e.undone).reduce((a,e)=>Math.max(a, e.t||0), r.startedAt||0);
  return {raidId:r.raidId, squad:r.squad||0, squadLabel: squadLabel(r), name:r.name||'이름 없는 보스', diff:r.diff||'custom', cfg:s.cfg, startedAt:r.startedAt||0, endedAt:lastT,
    status: s.status==='live' ? (stopped ? 'stopped' : 'live') : s.status,
    maxHp:s.maxHp, hpLeft:s.hp, rage:s.rage, maxRage:s.maxRage, wins:tot.w, losses:tot.l, mvp:topDealer(s)||'', members, left,
    evCount: events.length, race: r.race || 'mixed', bossSkills: bossSkillsOf(r), roleSkills: r.roleSkills || null, gauge: r.gauge || null, roster: r.roster || null, settings: r.settings || null,
    events: events.map(e=>{ const o = {t:e.t||0, type:e.type, member:e.member}; if(e.type==='game'){ o.points = e.points; if(e.multi) o.multi = true; if(e.same) o.same = true; if(e.banned) o.banned = true; } else if(e.type==='roulette') o.item = e.item; else if(e.type==='gear'){ o.item = e.item; o.cost = e.cost; if(e.grade) o.grade = e.grade; o.id = e._id || ''; } else if(e.type==='equip') o.item = e.item; else if(e.type==='party'){ o.action = e.action; if(e.role) o.role = e.role; if(e.fee != null) o.fee = e.fee; } if(e.undone) o.undone = true; return o; })};
}
let archiveTimer = null;
function autoArchive(s){
  if(!raid || s.status === 'live' || readOnly || !canOperate()) return;
  const sum = summarize(raid, s, false);
  const prev = history.find(h=>h.raidId===sum.raidId);
  const same = prev && prev.status===sum.status && prev.hpLeft===sum.hpLeft && prev.rage===sum.rage && prev.wins===sum.wins && prev.losses===sum.losses && prev.evCount===sum.evCount && Object.keys(prev.members||{}).length===Object.keys(sum.members).length;
  if(same) return;
  clearTimeout(archiveTimer);
  archiveTimer = setTimeout(()=>guard(()=>store.archive(sum)), 600);
}
const RES_LABEL = {clear:'성공', fail:'실패', stopped:'중단'};
function fmtDate(t){ if(!t) return '-'; const d = new Date(t); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function fame(){
  const P = {};
  let bestHit = null, bestRaid = null;
  for(const h of history){
    if(h.status==='live') continue;
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
  const done = history.filter(h=>h.status!=='live').sort((a,b)=>(b.endedAt||b.startedAt)-(a.endedAt||a.startedAt));
  const {P, bestHit, bestRaid} = fame();
  const names = Object.keys(P).sort((a,b)=>P[b].dmg-P[a].dmg);
  const clears = done.filter(h=>h.status==='clear').length, fails = done.filter(h=>h.status==='fail').length;
  $('records').innerHTML = `
    <div class="rec"><div class="k">레이드 전적</div><div class="v">${clears}승 ${fails}패</div><div class="w">총 ${done.length}회${done.length-clears-fails ? ' · 중단 '+(done.length-clears-fails) : ''}</div></div>
    <div class="rec"><div class="k">누적 딜 1위</div><div class="v">${names[0] ? esc(names[0]) : '-'}</div><div class="w">${names[0] ? fmt(P[names[0]].dmg) : '기록 없음'}</div></div>
    <div class="rec"><div class="k">한 판 최고 데미지</div><div class="v">${bestHit && bestHit.v ? esc(bestHit.m) : '-'}</div><div class="w">${bestHit && bestHit.v ? fmt(bestHit.v)+' · '+esc(bestHit.boss) : '기록 없음'}</div></div>
    <div class="rec"><div class="k">레이드 1회 최고 딜</div><div class="v">${bestRaid && bestRaid.v ? esc(bestRaid.m) : '-'}</div><div class="w">${bestRaid && bestRaid.v ? fmt(bestRaid.v)+' · '+esc(bestRaid.boss) : '기록 없음'}</div></div>`;

  $('histView').innerHTML = done.length ? `<div class="tbl-wrap"><table>
    <thead><tr><th>날짜</th><th>보스</th><th>난이도</th><th class="r">인원</th><th>결과</th><th class="r">전적</th><th class="r">남은 HP</th><th>MVP</th></tr></thead>
    <tbody>${done.map(h=>{
      const open = openHist === h.raidId;
      const mem = Object.entries(h.members||{}).sort((a,b)=>b[1].dmg-a[1].dmg);
      const detail = open ? `<tr class="hdetail"><td colspan="8">${histDetail(h, mem)}</td></tr>` : '';
      return `<tr class="hrow" data-h="${esc(h.raidId)}" tabindex="0" aria-expanded="${open}"><td class="num">${fmtDate(h.endedAt||h.startedAt)}</td><td>${esc(h.name)}</td><td>${esc((PRESETS[h.diff]||PRESETS.custom).label)}</td>
        <td class="r num">${mem.length}</td><td><span class="res ${h.status}">${RES_LABEL[h.status]||h.status}</span></td>
        <td class="r num">${h.wins}승 ${h.losses}패</td><td class="r num">${fmt(h.hpLeft)} / ${fmt(h.maxHp)}</td><td>${h.mvp ? esc(h.mvp) : '-'}</td></tr>${detail}`;
    }).join('')}</tbody></table></div><p class="hint" style="margin:8px 0 0">줄을 누르면 공략대원별 기록이 펼쳐집니다.</p>`
    : `<p class="empty">레이드가 성공·실패로 끝나거나 새 레이드를 시작하면 여기에 기록이 남습니다.</p>`;

  $('fameView').innerHTML = names.length ? `<div class="tbl-wrap"><table>
    <thead><tr><th>순위</th><th>공략대원</th><th class="r">참여</th><th class="r">클리어</th><th class="r">MVP</th><th class="r">승</th><th class="r">패</th><th class="r">누적 데미지</th><th class="r">한 판 최고</th><th class="r">분노 유발</th></tr></thead>
    <tbody>${names.map((m,i)=>{ const p = P[m]; return `<tr><td class="num">${i+1}</td><td>${esc(m)}</td><td class="r num">${p.raids}</td><td class="r num">${p.clears}</td><td class="r num">${p.mvp}</td><td class="r num">${p.w}</td><td class="r num">${p.l}</td><td class="r num">${fmt(p.dmg)}</td><td class="r num">${fmt(p.best)}</td><td class="r num">${fmt(p.rage)}</td></tr>`; }).join('')}</tbody>
  </table></div>` : `<p class="empty">끝난 레이드가 쌓이면 공략대원별 누적 기록이 표시됩니다.</p>`;
  $('histView').hidden = histTab !== 'hist';
  $('fameView').hidden = histTab !== 'fame';
}
function histDetail(h, mem){
  const cfg = h.cfg || {hp:0, rage:0, rec:0};
  const dur = h.endedAt && h.startedAt ? Math.max(0, Math.round((h.endedAt - h.startedAt)/60000)) : null;
  const meta = `<div class="hd-meta">
    <span>시작 <b>${fmtDate(h.startedAt)}</b></span><span>종료 <b>${fmtDate(h.endedAt)}</b></span>${dur!==null ? `<span>진행 <b>${dur >= 60 ? Math.floor(dur/60)+'시간 '+(dur%60)+'분' : dur+'분'}</b></span>` : ''}
    <span>1인당 HP <b>${fmt(cfg.hp)}</b> · 분노 최대 <b>${fmt(cfg.rage)}</b> · 회복 <b>${cfg.rec}%</b></span>
    <span>보스 HP <b>${fmt(h.hpLeft)} / ${fmt(h.maxHp)}</b></span><span>분노 <b>${fmt(h.rage)} / ${fmt(h.maxRage)}</b></span></div>`;
  const table = `<div class="tbl-wrap"><table class="mini">
    <thead><tr><th>공략대원</th><th>역할</th><th class="r">입장료</th><th class="r">승</th><th class="r">패</th><th class="r">데미지</th><th class="r">한 판 최고</th><th class="r">분노 유발</th><th class="r">최종 체력</th><th>장비</th></tr></thead>
    <tbody>${mem.length ? mem.map(([m,x])=>`<tr><td>${esc(m)}${h.mvp===m?'<span class="mvp">MVP</span>':''}${x.ladder?`<div class="hint">${esc(x.ladder)}</div>`:''}</td>
      <td>${x.role && ROLES[x.role] ? `<span class="role-tag ${x.role}">${ROLES[x.role].short}</span>${ROLES[x.role].label}` : '-'}</td>
      <td class="r num">${x.fee != null ? fmt(x.fee) + (x.spent ? `<div class="hint">사용 ${fmt(x.spent)}</div>` : '') : '-'}</td>
      <td class="r num">${x.w}</td><td class="r num">${x.l}</td><td class="r num">${fmt(x.dmg)}</td><td class="r num">${fmt(x.best||0)}</td><td class="r num">${fmt(x.rage)}</td>
      <td class="r num">${x.hp != null ? (x.hp <= 0 ? '<span class="d-hp">전투불능</span>' : `${fmt(x.hp)}${x.maxHp ? '/'+fmt(x.maxHp) : ''}`) : '-'}</td>
      <td>${x.gear && x.gear.length ? esc(x.gear.join(', ')) : '<span class="hint">기본</span>'}</td></tr>`).join('') : '<tr><td colspan="10" class="empty">참가한 공략대원이 없었습니다.</td></tr>'}</tbody>
  </table></div>${h.left && h.left.length ? `<p class="hint" style="margin:6px 0 0">중간에 내보낸 공략대원: ${esc(h.left.join(', '))}</p>` : ''}`;
  let logHtml = '<p class="empty">이 레이드는 전투 기록이 저장되지 않았습니다.</p>';
  if(Array.isArray(h.events) && h.events.length){
    const st = compute({members:Object.keys(h.members||{}), cfg:h.cfg, bossSkills:h.bossSkills, roleSkills:h.roleSkills, gauge:h.gauge, roster:h.roster, settings:h.settings}, h.events.map((e,i)=>({...e, _id: e.id || 'h'+i})));
    logHtml = '<ul class="log compact">' + st.log.slice().reverse().map(e=>{
      const ev = e.ev, d = new Date(ev.t), tm = String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
      const what = whatHtml(e);
      const ds = [];
      if(e.dHp < 0) ds.push(`<span class="d-hp">HP ${fmt(e.dHp)}</span>`);
      if(e.dHp > 0) ds.push(`<span class="d-heal">HP +${fmt(e.dHp)}</span>`);
      if(e.dRage > 0) ds.push(`<span class="d-rage">분노 +${fmt(e.dRage)}</span>`);
      if(e.dRage < 0) ds.push(`<span class="d-heal">분노 ${fmt(e.dRage)}</span>`);
      const pd = (e.party||[]).reduce((a,x)=>a+x.d,0); if(pd) ds.push(`<span class="d-party">공략대 −${fmt(pd)}</span>`);
      if(e.healed) ds.push(`<span class="d-heal">공략대 +${fmt(e.healed)}</span>`);
      return `<li class="${e.undone?'undone':''} ${e.ignored?'ignored':''}"><span class="time">${tm}</span><div class="what">${what}${e.notes.length?`<div class="fx">${esc(e.notes.join(' · '))}</div>`:''}${skillHtml(e)}</div><div class="delta">${ds.join('<br>') || '<span style="color:var(--muted)">-</span>'}</div></li>`;
    }).join('') + '</ul>';
  }
  return meta + `<div class="hd-grid"><div><h3>공략대원 기록</h3>${table}</div><div><h3>전투 기록</h3>${logHtml}</div></div>`;
}
function wipeIdle(){
  $('wipeAct').innerHTML = '<button type="button" class="btn danger" id="wipeBtn">데이터 초기화</button>';
}
$('dangerZone').addEventListener('click', e=>{
  const id = e.target.id;
  if((id === 'wipeBtn' || id === 'wipeYes') && !canOperate()){ wipeIdle(); toast('데이터 초기화는 운영자만 할 수 있습니다.'); return; }
  if(id === 'wipeBtn'){
    $('wipeAct').innerHTML = `<span class="warn">모든 기록을 지울까요?</span>
      <button type="button" class="btn danger solid" id="wipeYes">모두 지우기</button>
      <button type="button" class="btn" id="wipeNo">취소</button>`;
    $('wipeNo').focus();
  } else if(id === 'wipeNo'){
    wipeIdle();
  } else if(id === 'wipeYes'){
    guard(async()=>{
      await store.wipe();
      openHist = null; wipeIdle(); renderHistory(); render();
      openSetup(true);
      toast('모든 데이터를 초기화했습니다.');
    });
  }
});
function setHistTab(t){ histTab = t; $('tabHist').setAttribute('aria-pressed', t==='hist'); $('tabFame').setAttribute('aria-pressed', t==='fame'); renderHistory(); }
$('tabHist').onclick = ()=>setHistTab('hist');
$('tabFame').onclick = ()=>setHistTab('fame');
$('histView').addEventListener('click', e=>{ const r = e.target.closest('tr.hrow'); if(!r) return; openHist = openHist === r.dataset.h ? null : r.dataset.h; renderHistory(); });
$('histView').addEventListener('keydown', e=>{ if(e.key!=='Enter') return; const r = e.target.closest('tr.hrow'); if(r){ openHist = openHist === r.dataset.h ? null : r.dataset.h; renderHistory(); } });
