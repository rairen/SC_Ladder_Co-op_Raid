/* =====================================================================
   render.js — 메인 화면 그리기 (보스 HUD, 파티 현황, 전투 기록, 결과 미리보기)
   ===================================================================== */
/* ---------- Rendering ---------- */
function render(){
  const s = compute(raid, events);
  lastState = s;
  const hasRaid = !!raid;

  // connection pill
  const cp = $('connPill');
  cp.className = 'pill ' + (local ? 'local' : (hasRaid ? s.status : ''));
  cp.textContent = local ? (hasRaid ? (s.status==='clear' ? '레이드 성공' : s.status==='fail' ? '레이드 실패' : '진행 중 · 이 브라우저에 저장') : '레이드 없음') : !online ? '연결 끊김 · 재연결 중' : !hasRaid ? '레이드 없음' : s.status==='clear' ? '레이드 성공' : s.status==='fail' ? '레이드 실패' : '진행 중 · 실시간 공유';
  $('importBtn').hidden = !local;

  // HUD
  $('bossName').textContent = hasRaid ? (raid.name || '이름 없는 보스') : '레이드 대기 중';
  const meta = $('bossMeta');
  if(hasRaid){
    const p = PRESETS[raid.diff] || PRESETS.custom;
    meta.innerHTML = `<span class="pill">${esc(p.label)}</span><span class="pill">파티 ${s.members.length}명</span><span class="pill">1인당 HP ${fmt(s.cfg.hp)} +인원당 ${fmt(s.cfg.bonus||0)} · 분노 최대 ${fmt(s.cfg.rage)} (데미지 × ${s.cfg.rageRate}) · 회복 ${s.cfg.rec}%</span>`;
  } else meta.innerHTML = `<span class="pill">위의 "레이드 설정"에서 파티원과 난이도를 정하면 시작됩니다</span>`;
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
    const act = OVERLAY ? '' : meNow
      ? '<span>운영자가 초기화하면 새 레이드에 참가할 수 있습니다.</span>'
      : '<button type="button" class="btn primary" data-act="reset">새 레이드 시작</button><span>이번 레이드는 아래 레이드 기록에 보관됩니다.</span>';
    bn.innerHTML = (s.status==='clear'
      ? `<strong>레이드 성공</strong><span>${wins}승 ${losses}패${mvp ? ' · MVP '+esc(mvp) : ''}</span>`
      : `<strong>레이드 실패</strong><span>파티 전멸 · 남은 보스 HP ${fmt(s.hp)}</span>`) + act;
  } else bn.hidden = true;

  // chips
  const me = myName(s);
  if(me) selected = me;
  if(selected && !s.members.includes(selected)) selected = null;
  if(!selected && s.members.length) selected = s.members[0];
  const meSel = $('meSelect'), meOpts = ['<option value="">운영자 (전체 입력)</option>'].concat(s.members.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`)).join('');
  if(meSel.dataset.opts !== meOpts){ meSel.innerHTML = meOpts; meSel.dataset.opts = meOpts; }
  meSel.value = me || '';
  $('memberChips').innerHTML = s.members.length ? s.members.map(m=>{
    const pend = s.pending[m];
    return `<button type="button" class="chip" data-m="${esc(m)}" aria-pressed="${m===selected}"${me && m!==me ? ' disabled' : ''}>${esc(m)}${(s.mhp[m] ?? 1) <= 0 ? '<span class="tag">전투불능</span>' : ''}${pend?`<span class="tag fx">${esc(PENDING_LABEL[pend])}</span>`:''}</button>`;
  }).join('') : `<span class="empty">참가한 파티원이 여기에 표시됩니다.</span>`;

  // party table
  const rows = s.members.slice().sort((a,b)=>s.stats[b].dmg - s.stats[a].dmg);
  const top = rows.length ? s.stats[rows[0]].dmg : 0;
  const maxD = Math.max(1, top);
  const editAll = hasRaid && !readOnly && !OVERLAY && s.status === 'live';
  $('partyBody').innerHTML = rows.length ? rows.map(m=>{
    const x = s.stats[m], ro = rosterOf(raid, m), canEdit = editAll && (!me || me === m);
    const roleCell = canEdit
      ? `<select data-rrole="${esc(m)}" aria-label="${esc(m)} 역할">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}"${k===ro.role?' selected':''}>${v.label}</option>`).join('')}</select>`
      : `<span class="role-tag ${ro.role}">${ROLES[ro.role].short}</span>${ROLES[ro.role].label}`;
    const left = (s.fee[m] ?? ro.fee) - (s.spent[m] ?? 0);
    const feeCell = (canEdit ? `<input type="number" min="0" step="10" value="${ro.fee}" data-rfee="${esc(m)}" aria-label="${esc(m)} 받은 입장료">` : `<span class="num">${fmt(ro.fee)}</span>`) + `<div class="hint num" title="장비 룰렛에 쓰고 남은 입장료">남음 ${fmt(left)}</div>`;
    const g = s.gauge[m] ?? 0, need = s.needG[m] ?? s.G.max, full = g >= need;
    return `<tr><td>${esc(m)}${x.dmg>0 && x.dmg===top ? '<span class="mvp">MVP</span>':''}</td>
      <td>${roleCell}</td><td class="r">${feeCell}</td><td>${gearHtml(s, m)}</td>
      <td class="r num">${x.w}</td><td class="r num">${x.l}</td>
      <td class="r num">${fmt(x.dmg)}<span class="share" style="width:${Math.round(x.dmg/maxD*40)}px"></span></td>
      <td class="r num">${fmt(s.mhp[m] ?? PARTY_HP)}/${fmt(s.maxH[m] ?? PARTY_HP)}</td>
      <td class="num"><span class="gauge-mini${full?' full':''}"><i style="width:${Math.min(100, g/need*100)}%"></i></span>${g}/${need}</td>
      <td>${statusTags(s, m) || '<span style="color:var(--muted)">-</span>'}</td></tr>`;
  }).join('') : `<tr><td colspan="10" class="empty">아직 파티원이 없습니다.</td></tr>`;

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
    const pd = (e.party||[]).reduce((a,x)=>a+x.d,0); if(pd) deltas.push(`<span class="d-party">파티 −${fmt(pd)}</span>`);
    if(e.healed) deltas.push(`<span class="d-heal">파티 +${fmt(e.healed)}</span>`);
    const id = esc(ev._id);
    const canCtl = !(readOnly || !ev._id || (me && ev.member !== me));
    const ctl = canCtl ? `<button type="button" class="undo" data-undo="${id}" data-state="${ev.undone?1:0}">${ev.undone?'되살리기':'취소'}</button>` : '';
    const wtCur = ev.multi?'multi':ev.same?'same':ev.banned?'banned':'normal';
    const wtSel = (canCtl && ev.type==='game' && Number(ev.points) > 0 && !ev.undone && s.status==='live')
      ? `<select class="wtsel" data-wtev="${id}" aria-label="승리 유형">${[['normal','일반 승리'],['multi','운영 승리'],['same','빌드 반복'],['banned','초반 올인']].map(([k,l])=>`<option value="${k}"${k===wtCur?' selected':''}>${l}</option>`).join('')}</select>` : '';
    if(wtSel) e.wtEdit = true;
    return `<li class="${e.undone?'undone':''} ${e.ignored?'ignored':''}"><span class="time">${tm}</span>
      <div class="what">${whatHtml(e)}${wtSel}${e.notes.length?`<div class="fx">${esc(e.notes.join(' · '))}</div>`:''}${skillHtml(e)}${ctl}</div>
      <div class="delta">${deltas.join('<br>') || '<span style="color:var(--muted)">-</span>'}</div></li>`;
  }).join('') : `<li style="display:block" class="empty">결과를 입력하거나 룰렛을 돌리면 기록이 쌓입니다. 잘못 넣은 기록은 여기서 취소할 수 있습니다.</li>`;

  // input availability
  const canAct = hasRaid && s.status==='live' && !readOnly && s.members.length>0;
  ['submitGame','spin','applyManual','points','btnWin','btnLoss'].forEach(id=>{ $(id).disabled = !canAct || (spinning && (id==='spin'||id==='applyManual')); });
  document.querySelectorAll('.wt').forEach(b=>{ b.disabled = !canAct; });
  $('addMember').disabled = $('addMemberBtn').disabled = $('addMemberRole').disabled = !hasRaid || readOnly || s.status!=='live' || !!me;
  $('spinFor').textContent = selected ? `${selected} 룰렛으로 기록됩니다` : '';
  $('subline').textContent = hasRaid ? `시작 ${new Date(raid.startedAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}` : '래더 점수로 보스를 잡는 협동 레이드';
  updateGamePreview();
  if(typeof autoArchive === 'function' && hasRaid && !OVERLAY) autoArchive(s);
  renderTicker(s);
  renderJoin(s, myName(s));
  renderEndBtn(s, me);
  renderGearPanel(s, canAct, me);
  renderRoleBar(s, me, canAct);
  if(typeof renderLadderPanel === 'function') renderLadderPanel(s, me);
  $('wtMulti').textContent = `멀티 확보 ×${s.S.win.multi}`; $('wtSame').textContent = `같은 빌드 2연속 ×${s.S.win.same}`; $('wtBanned').textContent = `금지 빌드 ×${s.S.win.banned}`;
  renderOdds(s.S);
  renderSkillBoard(s);
  if(!$('skillModal').hidden && !skDirty && !setDirty) renderSkillModal();
}

function topDealer(s){
  let best = null, v = 0;
  for(const m of s.members){ if(s.stats[m].dmg > v){ v = s.stats[m].dmg; best = m; } }
  return best;
}

function updateGamePreview(){
  const s = lastState; const el = $('gamePreview');
  $('winChecks').hidden = !isWin;
  if(!s || !raid || !selected){ el.innerHTML = '파티원과 점수를 입력하면 들어갈 데미지가 여기에 미리 표시됩니다.'; return; }
  const p = Math.abs(parseInt($('points').value,10) || 0);
  const pend = s.pending[selected];
  if(!p){ el.innerHTML = `<b>${esc(selected)}</b>의 래더 결과 화면 점수를 입력하세요.${pend?` 대기 효과: <b>${esc(PENDING_LABEL[pend])}</b>`:''}${autoOn(selected)?'<br><b style="color:#ffd34d">이 파티원은 래더 결과가 자동으로 들어옵니다.</b> 자동으로 못 들어온 판만 직접 입력하세요.':''}`; return; }
  if(isWin){
    if(winType==='banned' && !s.S.win.banned){ el.innerHTML = '초반 올인(금지 빌드) 승리는 <b>데미지 0</b>입니다.'; return; }
    let mult = 1;
    const gw = s.gear[selected]; if(gw && gw.dmg) mult *= 1 + gw.dmg;
    if(winType==='multi') mult *= s.S.win.multi;
    if(winType==='same') mult *= s.S.win.same;
    if(winType==='banned') mult *= s.S.win.banned;
    if(pend==='double') mult *= 2;
    if(pend==='mission') mult *= 3;
    if((s.mhp[selected] ?? 1) <= 0){ el.innerHTML = `<b>${esc(selected)}</b>는 전투불능입니다. 승리하면 데미지 대신 <b class="d-heal">체력 ${REVIVE_HP}으로 부활</b>합니다.`; return; }
    if(s.curse[selected]) mult *= s.curse[selected];
    if(s.barrier) mult *= 0.5;
    if(s.rally) mult *= 1.5;
    mult = Math.round(mult*100)/100;
    const chainNext = !s.chain.includes(selected) && s.chain.length===2;
    const dmgP = Math.round(p*mult), rr = Math.round(dmgP * (s.cfg.rageRate ?? 0.5) * (1 - ((s.gear[selected]||{}).rageCut||0)) * 10)/10, boomW = s.maxRage && s.rage + rr >= s.maxRage;
    el.innerHTML = `보스 HP <b class="d-hp">−${fmt(dmgP)}</b>${mult!==1?` (×${mult})`:''} · 분노 <b class="d-rage">+${fmt(rr)}</b>${boomW?' · <b class="d-hp">분노 가득 → 보스 스킬 발동</b>':''}${chainNext?` + 체인 보너스 <b class="d-hp">−${fmt(Math.round(s.maxHp*s.S.chain/100))}</b>`:''}`;
  } else {
    if(pend==='shield'){ el.innerHTML = '패배 보호가 발동해서 <b>보스가 회복하지 않습니다</b>.'; return; }
    const h = s.enraged ? Math.min(Math.round(p*s.cfg.rec/100), s.maxHp - s.hp) : 0;
    el.innerHTML = h ? `보스 HP가 50% 아래라 <b class="d-heal">+${fmt(h)}</b> 회복합니다. 스킬 게이지 +${s.G.loss}` : `패배는 보스에게 영향이 없습니다. 스킬 게이지 +${s.G.loss}`;
  }
}
