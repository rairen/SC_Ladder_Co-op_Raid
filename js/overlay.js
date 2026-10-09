/* =====================================================================
   overlay.js — 방송 오버레이 (체력바 알림, 데미지 숫자, 오버레이 주소)
   ===================================================================== */
/* ---------- Overlay ---------- */
let lastSeenEv = null, tickerReady = false;
function evText(e){
  const ev = e.ev;
  if(ev.type === 'game'){
    const p = Number(ev.points)||0;
    if(p > 0) return `${ev.member} 승리! 보스에게 ${fmt(-e.dHp)} 데미지${e.notes.length ? ' · '+e.notes.join(' · ') : ''}`;
    if(p < 0) return `${ev.member} 패배…${e.dHp > 0 ? ' 보스 HP +'+fmt(e.dHp)+' 회복' : ''}`;
    return `${ev.member} 무승부`;
  }
  if(ev.type === 'gear'){ return `${ev.member} 장비 룰렛 ${(e.gear||{}).name||''} · ${e.notes.join(' · ')}`; }
  if(ev.type === 'equip'){ return `${ev.member} ${e.notes.join(' · ')}`; }
  if(ev.type === 'role'){ const r0 = e.role || {name:'역할 스킬'}; return `${ev.member} 역할 스킬 ${r0.name}! ${e.notes.join(' · ')}`; }
  const it = ITEM[ev.item] || ITEM.none;
  return `${ev.member} 룰렛 [${it.tier}] ${it.name}`;
}
function popAt(gaugeSel, text, cls){
  const m = document.querySelector(gaugeSel); const g = m && m.parentElement; if(!g) return;
  const el = document.createElement('span'); el.className = 'pop ' + (cls||''); el.textContent = text;
  g.appendChild(el); setTimeout(()=>el.remove(), 1700);
}
function renderTicker(s){
  const live = s.log.filter(e=>!e.undone && !e.ignored);
  const last = live[live.length-1];
  const tk = $('ticker');
  const sk = last && last.skills && last.skills.length ? last.skills[last.skills.length-1] : null;
  tk.innerHTML = sk ? `<span class="tk-tag boss">BOSS SKILL</span><span class="tk-text">${esc(sk.name)}! ${esc(sk.text)}${last.party.some(x=>x.down) ? ' · 전투불능 '+esc(last.party.filter(x=>x.down).map(x=>x.m).join(', ')) : ''}</span>`
    : last ? `<span class="tk-tag">${last.ev.type==='roulette' ? 'ROULETTE' : last.ev.type==='role' ? 'PARTY SKILL' : last.ev.type==='gear' ? 'GEAR' : 'LADDER'}</span><span class="tk-text">${esc(evText(last))}</span>` : (raid ? '<span class="tk-text" style="color:var(--muted)">첫 래더 결과를 기다리는 중</span>' : '');
  const id = last ? (last.ev._id || last.ev.t) : null;
  if(tickerReady && id && id !== lastSeenEv && OVERLAY){
    if(last.dHp < 0) popAt('#hpMeter', '−'+fmt(-last.dHp));
    else if(last.dHp > 0) popAt('#hpMeter', '+'+fmt(last.dHp), 'heal');
    if(last.dRage > 0 && !sk) popAt('#rageMeter', '+'+fmt(last.dRage), 'rage');
    if(sk) popAt('#rageMeter', sk.name+'!', 'sk');
  }
  lastSeenEv = id; tickerReady = true;
}

/* 오버레이 주소 (OBS 브라우저 소스용) */
function overlayUrl(){
  const u = new URL(location.href); u.search = ''; u.hash = '';
  const q = new URLSearchParams(); q.set('overlay', '1');
  if(ovlView === 'skills') q.set('view', 'skills'); else if($('ovlNoRage').checked) q.set('rage', '0');
  return u.toString() + '?' + q.toString();
}
function refreshOvl(){
  $('ovlUrl').textContent = overlayUrl();
  $('ovlNote').textContent = local
    ? '지금은 Firebase가 연결되지 않아 기록이 이 브라우저에만 있습니다. OBS 브라우저 소스는 별도 브라우저라서, 공유 연결 전에는 오버레이에 기록이 보이지 않습니다. 미리보기는 같은 브라우저라 정상으로 보입니다.'
    : '모든 파티원의 입력이 오버레이에 실시간으로 반영됩니다.';
}
$('ovlBtn').onclick = ()=>{ const p = $('ovlPanel'); p.hidden = !p.hidden; refreshOvl(); };
$('ovlNoRage').onchange = refreshOvl;
let ovlView = 'hp';
$('ovlPanel').addEventListener('click', e=>{
  const b = e.target.closest('[data-ovlview]'); if(!b) return;
  ovlView = b.dataset.ovlview;
  document.querySelectorAll('[data-ovlview]').forEach(x=>x.setAttribute('aria-pressed', x===b));
  $('ovlRageWrap').hidden = ovlView === 'skills';
  refreshOvl();
});
$('ovlPreview').onclick = ()=>{ const w = window.open(overlayUrl(), '_blank', 'noopener'); if(!w) toast('팝업이 막혔습니다. 주소를 복사해서 새 탭에 붙여넣으세요.'); };
$('ovlCopy').onclick = async ()=>{
  const t = $('ovlUrl').textContent;
  try{ await navigator.clipboard.writeText(t); toast('오버레이 주소를 복사했습니다.'); }
  catch(_){ const r = document.createRange(); r.selectNodeContents($('ovlUrl')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('주소를 선택해 두었습니다. Ctrl+C로 복사하세요.'); }
};
