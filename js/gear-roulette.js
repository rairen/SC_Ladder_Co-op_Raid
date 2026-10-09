/* =====================================================================
   gear-roulette.js — 장비 룰렛
   ===================================================================== */
/* ---------- 장비 룰렛 ---------- */
function renderGearPanel(s, canAct, me){
  const S = s.S, m = selected;
  if(!raid || !m || !s.members.includes(m)){ $('gearFeeLine').innerHTML = '<span class="hint">파티원을 고르면 남은 입장료와 장비가 표시됩니다.</span>'; $('gearSpin').disabled = true; $('gearFor').textContent = ''; $('invList').innerHTML = ''; $('invCount').textContent = ''; return; }
  const left = (s.fee[m]||0) - (s.spent[m]||0), cost = S.gearCost, times = cost > 0 ? Math.floor(left / cost) : 0;
  $('gearFeeLine').innerHTML = `<span>${esc(m)} 남은 입장료 <b>${fmt(left)}</b> / 받은 ${fmt(s.fee[m]||0)}</span><span>1회 <b>${fmt(cost)}</b> · ${cost > 0 ? times+'회 가능' : '무료'}</span>${gearHtml(s, m)}`;
  renderInventory(s, m, canAct && (!me || me === m));
  const mine = !me || me === m;
  $('gearSpin').disabled = !(canAct && mine && left >= cost);
  $('gearSpin').textContent = `장비 뽑기 (−${fmt(cost)})`;
  $('gearFor').textContent = left < cost ? '입장료가 부족합니다. 파티 현황에서 받은 입장료를 늘려 주세요.' : '';
}
/* 인벤토리: 얻은 장비 목록, 착용·해제 */
function renderInventory(s, m, canEdit){
  const box = $('invList'), items = (s.inv && s.inv[m]) || [], eq = (s.eq && s.eq[m]) || {};
  $('invCount').textContent = items.length ? `${items.filter(x=>!x.broken).length}개 보유${items.some(x=>x.broken) ? ` · 파괴 ${items.filter(x=>x.broken).length}` : ''}` : '';
  if(!items.length){ box.innerHTML = '<li class="empty">장비 룰렛으로 얻은 장비가 여기에 쌓입니다.</li>'; return; }
  const order = {weapon:0, armor:1, accessory:2};
  const list = items.slice().sort((a,b)=> (a.broken-b.broken) || (order[a.slot]-order[b.slot]) || (itemScore(b)-itemScore(a)));
  box.innerHTML = list.map(it=>{
    const on = eq[it.slot] === it.id;
    const eff = it.slot==='weapon' ? `승리 데미지 +${Math.round(it.v*100)}%` : it.slot==='armor' ? `최대 체력 +${it.v}` : it.idx===1 ? `분노 상승 −${Math.round(it.v*100)}%` : `쓰러질 때 체력 ${it.revive}`;
    const dur = it.dur === Infinity ? '' : `<span class="inv-dur"><i style="width:${Math.round(it.dur/it.maxDur*100)}%"></i></span><span class="num">${it.dur}/${it.maxDur}</span>`;
    const btn = !canEdit || it.broken ? '' : on
      ? `<button type="button" class="btn sm" data-unequip="${it.slot}">해제</button>`
      : `<button type="button" class="btn sm" data-equip="${esc(it.id)}">장착</button>`;
    return `<li class="${it.broken?'broken':''}${on?' on':''}"><span class="inv-slot">${GEAR_SLOT[it.slot]}</span>
      <span class="inv-name${it.grade?' gr-'+it.grade:''}">${it.gradeLabel?`<span class="gr-tag">${it.gradeLabel}</span>`:''}${esc(it.name)}</span>
      <span class="inv-eff">${eff}</span><span class="inv-d">${it.broken ? '<span class="d-hp">파괴</span>' : dur}</span>
      <span class="inv-act">${on ? '<span class="inv-on">착용 중</span>' : ''}${btn}</span></li>`;
  }).join('');
}
document.addEventListener('click', e=>{
  const eqb = e.target.closest('[data-equip]'), off = e.target.closest('[data-unequip]');
  if(!(eqb || off) || !raid || !selected) return;
  const who = selected;
  guard(()=>store.addEvent({raidId:raid.raidId, t:Date.now(), type:'equip', member:who, item: eqb ? eqb.dataset.equip : 'off:'+off.dataset.unequip, undone:false}));
});
function pickGrade(){
  const S = settingsOf(raid), list = GEAR_GRADES.map(g=>gradeOf(S, g.id)), tot = list.reduce((a,x)=>a+x.w,0);
  if(!tot) return GEAR_GRADES[0].id;
  const arr = new Uint32Array(1); crypto.getRandomValues(arr);
  let r = arr[0]/4294967296*tot;
  for(const x of list){ if((r -= x.w) < 0) return x.id; }
  return GEAR_GRADES[0].id;
}
function pickGear(){
  const S = settingsOf(raid), list = gearRollList(S), tot = list.reduce((a,x)=>a+x.w,0);
  if(!tot) return 'none';
  const arr = new Uint32Array(1); crypto.getRandomValues(arr);
  let r = arr[0]/4294967296*tot;
  for(const x of list){ if((r -= x.w) < 0) return x.key; }
  return 'none';
}
let gearSpinning = false;
$('gearSpin').onclick = ()=>{
  if(gearSpinning || !selected || !raid) return;
  const who = selected, S = settingsOf(raid), key = pickGear(), grade = key === 'none' ? '' : pickGrade(), cost = S.gearCost;
  gearSpinning = true; $('gearSpin').disabled = true;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, keys = Object.keys(DEFAULT_GEAR_ROLL);
  let i = 0; const steps = reduce ? 0 : 12;
  const show = (k, label, gr)=>{ $('gearReel').innerHTML = `<span class="t">${label || (k==='none' ? '꽝' : GEAR_SLOT[k.split(':')[0]])}</span><span class="n${gr?' gr-'+gr:''}">${esc(gearItemName(S, k, gr))}</span>`; };
  const tick = ()=>{
    if(i < steps){ show(keys[Math.floor(Math.random()*keys.length)]); i++; setTimeout(tick, 50 + i*i*2); return; }
    show(key, key==='none' ? '꽝' : GEAR_SLOT[key.split(':')[0]] + ' 획득', grade);
    gearSpinning = false;
    guard(()=>store.addEvent({raidId:raid.raidId, t:Date.now(), type:'gear', member:who, item:key, ...(grade ? {grade} : {}), cost, undone:false}));
    render();
  };
  tick();
};
document.addEventListener('click', e=>{
  const b = e.target.closest('[data-openlist]'); if(!b) return;
  openSkillModal('info', b.dataset.openlist === 'gear' ? 'gear' : 'roulette');
});

$('applyManual').onclick = ()=>{
  if(!selected) return;
  const it = ITEM[$('manualItem').value];
  showReel(it, it.tier + ' · 직접 입력');
  guard(()=>store.addEvent({raidId:raid.raidId, t:Date.now(), type:'roulette', member:selected, item:it.id, manual:true, undone:false}));
};

function cleanName(v){ return String(v||'').replace(/\s+/g,' ').trim().slice(0,20); }
function setMe(name){
  meName = name;
  try{ name ? localStorage.setItem(ME_KEY, name) : localStorage.removeItem(ME_KEY); }catch(_){}
  if(name) openSetup(false);
  render();
}
$('joinRole').innerHTML = Object.entries(ROLES).map(([k,v])=>`<option value="${k}"${k==='dealer'?' selected':''}>${v.label}</option>`).join('');
function renderJoinGear(){ const S = settingsOf(raid), f = Math.max(0, Number($('joinFee').value)||0); $('joinGear').textContent = `장비 룰렛 ${S.gearCost > 0 ? Math.floor(f / S.gearCost) + '회' : '무제한'} 가능 (1회 ${fmt(S.gearCost)}) · 역할 스킬 필요 게이지 ${Math.max(1, Math.round((gaugeOf(raid).max - f*(Number(S.feeGauge)||0))*10)/10)}`; }
$('joinFee').addEventListener('input', renderJoinGear); renderJoinGear();
$('joinBtn').onclick = doJoin;
$('joinName').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); doJoin(); } });
function doJoin(){
  const authed = useAuth();
  if(authed && !authUser){ login(); return; }
  const name = authed ? profileName() : cleanName($('joinName').value);
  if(authed && !name){ openProfile(true); return; }
  if(!name){ toast('방송에서 쓰는 이름을 입력하세요.'); $('joinName').focus(); return; }
  if(!raid){ toast('아직 열린 레이드가 없습니다. 운영자가 레이드를 열면 참가할 수 있습니다.'); return; }
  const already = raid.members.includes(name);
  const role = $('joinRole').value, fee = Math.max(0, Math.round(Number($('joinFee').value)||0)), ladder = cleanLadderId($('joinLadder').value), gw = authed ? (Number(profile && profile.gw)||30) : 30;
  guard(async()=>{
    await store.join(name);
    if(!already || role !== rosterOf(raid, name).role || fee !== rosterOf(raid, name).fee) await store.setRoster(name, {role, fee});
    if(authed) await store.setRoster(name, {uid: authUser.uid, ladder, gw});
    else if(ladder) await store.setRoster(name, {ladder});
    if(authed && profile && ladder !== (profile.ladder||'')) await db.ref('users/'+authUser.uid).update({ladder});
    $('joinName').value = ''; $('joinLadder').value = ''; delete $('joinLadder').dataset.touched;
    setMe(name);
    toast(already ? `${name} 이름으로 다시 들어왔습니다.` : `${name} 참가 완료 · 보스가 강해졌습니다`);
  });
}
$('joinExisting').addEventListener('click', e=>{ const b = e.target.closest('[data-claim]'); if(b) setMe(b.dataset.claim); });
$('leaveMe').onclick = ()=>{ setMe(''); toast('운영자 모드로 바꿨습니다. 다른 이름으로 참가하려면 이름을 새로 입력하세요.'); };
function myLink(){
  const u = new URL(location.href); u.search = ''; u.hash = '';
  const q = new URLSearchParams(); q.set('me', meName);
  return u.toString() + '?' + q.toString();
}
$('myLinkBtn').onclick = async ()=>{
  try{ await navigator.clipboard.writeText(myLink()); toast('내 입력 링크를 복사했습니다. 다음 방송부터 이 링크로 들어오면 바로 내 이름으로 열립니다.'); }
  catch(_){ toast(myLink()); }
};
function renderJoin(s, me){
  const hasRaid = !!raid, live = hasRaid && s.status === 'live';
  $('joinPanel').hidden = !(live && !me) || OVERLAY;
  $('mePanel').hidden = !me;
  $('meNameView').textContent = me || '';
  if(!$('joinPanel').hidden) renderJoinGear();
  $('meSelect').parentElement.hidden = !!me || OVERLAY || !canOperate();
  $('dangerZone').hidden = !!me || !canOperate();
  // 로그인 모드: 로그인 전에는 로그인 버튼, 로그인 후에는 프로필 닉네임으로 참가
  const authed = useAuth(), needLogin = authed && !authUser;
  $('joinLogin').hidden = !needLogin; $('joinForm').hidden = needLogin; $('joinIntro').hidden = needLogin;
  $('joinExisting').hidden = authed && !isAdmin();
  $('leaveMe').hidden = authed && !isAdmin();
  $('joinName').disabled = authed;
  if(authed && authUser){
    $('joinName').value = profileName();
    if(document.activeElement !== $('joinLadder') && !$('joinLadder').dataset.touched) $('joinLadder').value = (profile && profile.ladder) || '';
  }
  if(!me && meName && !$('joinName').value && document.activeElement !== $('joinName')) $('joinName').value = meName;
  const others = s.members;
  $('joinExisting').innerHTML = others.length
    ? '이미 참가한 이름이면 눌러서 들어가세요: ' + others.map(m=>`<button type="button" class="linkbtn" data-claim="${esc(m)}">${esc(m)}</button>`).join(' · ')
    : '아직 참가한 파티원이 없습니다. 첫 번째로 참가해 보세요.';
  $('addHint').textContent = me ? '파티원 추가는 운영자 모드에서만 할 수 있습니다.' : '파티원이 한 명 늘면 보스 HP가 1인당 HP + 인원당 추가 HP만큼 늘어납니다.';
}

$('addMemberBtn').onclick = addMember;
$('addMember').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); addMember(); } });
function addMember(){
  const name = $('addMember').value.trim().slice(0,20);
  if(!name || !raid) return;
  if(raid.members.includes(name)){ toast('이미 파티에 있는 이름입니다.'); return; }
  const role = $('addMemberRole').value;
  guard(async()=>{ await store.join(name); await store.setRoster(name, {role}); $('addMember').value=''; toast(`${name}(${ROLES[role].label}) 추가 · 보스가 강해졌습니다`); });
}

$('joinLadder').addEventListener('input', ()=>{ $('joinLadder').dataset.touched = '1'; });
document.addEventListener('click', e=>{ if(e.target.id === 'loginBtn2') login(); });
