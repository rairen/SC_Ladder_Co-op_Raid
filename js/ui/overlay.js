/* =====================================================================
   overlay.js — 방송 오버레이 (체력바 알림, 데미지 숫자, 오버레이 주소)
   ===================================================================== */
/* ---------- Overlay ---------- */
import { App } from '@app/core/app.js';
import { ITEM, PARTY_HP, ROLES } from '@app/core/game-data.js';
import { $, OVERLAY, esc, fmt, squadLabel } from '@app/core/state.js';
import { toast } from '@app/core/store.js';
import { partyText } from '@app/core/logic.js';

function evText(e){
  const ev = e.ev;
  if(ev.type === 'game'){
    const p = Number(ev.points)||0;
    if(p > 0) return `${ev.member} 승리! 보스에게 ${fmt(-e.dHp)} 데미지${e.notes.length ? ' · '+e.notes.join(' · ') : ''}`;
    if(p < 0) return `${ev.member} 패배…${e.dHp > 0 ? ' 보스 HP +'+fmt(e.dHp)+' 회복' : ''}`;
    return `${ev.member} 무승부`;
  }
  if(ev.type === 'party'){ return `${ev.member} ${partyText(ev)}`; }
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
    : last ? `<span class="tk-tag">${last.ev.type==='roulette' ? 'ROULETTE' : last.ev.type==='role' ? 'PARTY SKILL' : last.ev.type==='gear' ? 'GEAR' : last.ev.type==='party' ? 'PARTY' : 'LADDER'}</span><span class="tk-text">${esc(evText(last))}</span>` : (App.raid ? '<span class="tk-text" style="color:var(--muted)">첫 래더 결과를 기다리는 중</span>' : '');
  reactToNew(s);
}

/* 오버레이 주소 (OBS 브라우저 소스용) */
function overlayUrl(){
  const u = new URL(location.href); u.search = ''; u.hash = '';
  const q = new URLSearchParams(); q.set('overlay', '1'); if(App.raid) q.set('raid', App.raid.raidId);
  if(App.ovlView === 'meter') q.set('view', 'meter'); else if($('ovlNoRage').checked) q.set('rage', '0');
  return u.toString() + '?' + q.toString();
}
function refreshOvl(){
  $('ovlUrl').textContent = overlayUrl();
  $('ovlTitle').textContent = App.raid ? `방송 오버레이 · ${squadLabel(App.raid)}` : '방송 오버레이';
  $('ovlNote').textContent = App.local
    ? '지금은 Firebase가 연결되지 않아 기록이 이 브라우저에만 있습니다. OBS 브라우저 소스는 별도 브라우저라서, 공유 연결 전에는 오버레이에 기록이 보이지 않습니다. 미리보기는 같은 브라우저라 정상으로 보입니다.'
    : '모든 공략대원의 입력이 오버레이에 실시간으로 반영됩니다.';
}

/* ---------- 공략대 딜 미터기 오버레이 (?overlay=1&view=meter) ---------- */
function renderDmgMeter(s){
  const box = $('dmgMeter');
  if(!OVERLAY || !document.documentElement.classList.contains('ovl-meter')){ box.hidden = true; return; }
  box.hidden = false;
  if(!App.raid){ box.innerHTML = '<div class="dm-head"><b>공략대 딜 미터기</b></div><div class="dm-empty">레이드 대기 중</div>'; return; }
  const rows = s.members.slice().sort((a,b)=>s.stats[b].dmg - s.stats[a].dmg);
  const total = rows.reduce((a,m)=>a + s.stats[m].dmg, 0), top = rows.length ? Math.max(1, s.stats[rows[0]].dmg) : 1;
  const alive = rows.filter(m=>(s.mhp[m] ?? 1) > 0).length;
  box.innerHTML = `<div class="dm-head"><b>공략대 딜 미터기</b><span>생존 ${alive}/${rows.length} · 총 ${fmt(total)}</span></div>` +
    (rows.length ? rows.map((m,i)=>{
      const x = s.stats[m], rk = s.role[m] || 'dealer', h = s.mhp[m] ?? PARTY_HP, mx = s.maxH[m] ?? PARTY_HP, down = h <= 0;
      const pct = total ? Math.round(x.dmg/total*100) : 0;
      return `<div class="dm-row${down?' down':''}${h>0 && h<=mx*0.4?' low':''}">
        <span class="dm-rank">${i+1}</span>
        <span class="dm-name"><span class="role-tag ${rk}">${ROLES[rk].short}</span>${esc(m)}</span>
        <span class="dm-num">${fmt(x.dmg)}<small>${pct}%</small></span>
        <span class="dm-bar"><i style="width:${Math.round(x.dmg/top*100)}%"></i></span>
        <span class="dm-hp">${down ? '<b class="ko">전투불능</b>' : `<span class="dm-hpbar"><i style="width:${Math.max(0, h/mx*100)}%"></i></span><span class="dm-hpv">${h}/${mx}</span>`}<span class="dm-wl">${x.w}승 ${x.l}패</span></span>
      </div>`;
    }).join('') : '<div class="dm-empty">참가한 공략대원이 없습니다</div>');
}

/* ---------- 실시간 반응 ----------
   다른 스트리머가 결과를 넣으면 모든 화면에서 바로 보이도록:
   보스 HP·분노 바 위에 숫자가 튀고, 바가 번쩍이고, 화면 구석에 알림 카드가 뜹니다.
   보스 스킬이 터지면 보스 화면이 흔들립니다. (처음 열 때 이미 있던 기록에는 반응하지 않음) */
const evId = e => e.ev._id || (e.ev.t + '|' + e.ev.member + '|' + e.ev.type);
function reactToNew(s){
  const rid = App.raid ? App.raid.raidId : null;
  if(rid !== App.seenRaid || !App.eventsReady){ App.seenRaid = App.eventsReady ? rid : undefined; App.seenEv = new Set(s.log.map(evId)); return; }
  const fresh = s.log.filter(e=>!App.seenEv.has(evId(e)));
  fresh.forEach(e=>App.seenEv.add(evId(e)));
  fresh.filter(e=>!e.undone && !e.ignored).slice(-3).forEach((e,i)=>setTimeout(()=>react(e), i*350));
}
function react(e, again){
  // 참가 기록은 공략대원 목록이 갱신된 뒤에야 보스 HP 변화가 계산되므로 잠깐 기다렸다가 다시 읽음
  if(e.ev.type === 'party' && !again){ const id = evId(e); setTimeout(()=>{ const f = App.lastState && App.lastState.log.find(x=>evId(x)===id); if(f) react(f, true); }, 800); return; }
  const sk = e.skills && e.skills.length ? e.skills[e.skills.length-1] : null;
  if(e.dHp < 0){ popAt('#hpMeter', '−'+fmt(-e.dHp)); flashEl('hpFill'); }
  else if(e.dHp > 0){ popAt('#hpMeter', '+'+fmt(e.dHp), 'heal'); }
  if(e.dRage > 0 && !sk){ popAt('#rageMeter', '+'+fmt(e.dRage), 'rage'); flashEl('rageFill'); }
  if(sk){ popAt('#rageMeter', sk.name+'!', 'sk'); shakeHud(); }
  if(!OVERLAY) feedCard(e, sk);
  // 공략대 상태 카드도 잠깐 강조
  const card = [...document.querySelectorAll('#partyBody .pcard')].find(c=>c.querySelector('.pc-name') && c.querySelector('.pc-name').textContent === e.ev.member);
  if(card){ card.classList.remove('ping'); void card.offsetWidth; card.classList.add('ping'); }
}
function flashEl(id){ const el = $(id); if(!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
function shakeHud(){ const h = $('hud'); if(!h) return; h.classList.remove('shake'); void h.offsetWidth; h.classList.add('shake'); }
function feedCard(e, sk){
  const box = $('liveFeed'); if(!box) return;
  const ev = e.ev, p = Number(ev.points)||0;
  const kind = sk ? 'boss' : ev.type === 'game' ? (p > 0 ? 'win' : 'loss') : ev.type === 'party' ? 'party' : ev.type === 'role' ? 'skill' : 'item';
  const head = sk ? `보스 스킬 · ${sk.name}` : ev.type === 'game' ? (p > 0 ? `${ev.member} 승리` : `${ev.member} 패배`) : ev.type === 'party' ? `${ev.member} ${partyText(ev)}` : ev.type === 'role' ? `${ev.member} 역할 스킬` : `${ev.member}`;
  const body = sk ? sk.text : [e.dHp < 0 ? `보스 HP −${fmt(-e.dHp)}` : e.dHp > 0 ? `보스 HP +${fmt(e.dHp)}` : '', e.dRage > 0 ? `분노 +${fmt(e.dRage)}` : '', ev.type === 'game' ? '' : ev.type === 'party' ? (e.late ? '중간 합류' : '') : evText(e).replace(ev.member, '').trim()].filter(Boolean).join(' · ');
  const el = document.createElement('div');
  el.className = 'feed ' + kind;
  el.innerHTML = `<b>${esc(head)}</b>${body ? `<span>${esc(body)}</span>` : ''}`;
  box.prepend(el);
  while(box.children.length > 4) box.lastChild.remove();
  setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(), 400); }, 5200);
}

/* 처음 한 번 실행: 화면 이벤트 연결, 초기값 설정 (js/main.js 가 파일 순서대로 부름) */
export function init(){

  App.seenEv = new Set(); App.seenRaid = undefined;
  $('ovlBtn').onclick = ()=>{ $('ovlModal').hidden = false; refreshOvl(); };
  $('ovlClose').onclick = ()=>{ $('ovlModal').hidden = true; };
  $('ovlModal').addEventListener('click', e=>{ if(e.target === $('ovlModal')) $('ovlModal').hidden = true; });
  $('ovlModal').addEventListener('keydown', e=>{ if(e.key === 'Escape') $('ovlModal').hidden = true; });
  $('ovlNoRage').onchange = refreshOvl;
  App.ovlView = 'hp';
  $('ovlModal').addEventListener('click', e=>{
    const b = e.target.closest('[data-ovlview]'); if(!b) return;
    App.ovlView = b.dataset.ovlview;
    document.querySelectorAll('[data-ovlview]').forEach(x=>x.setAttribute('aria-checked', x===b));
    $('ovlRageWrap').hidden = App.ovlView !== 'hp';
    refreshOvl();
  });
  $('ovlPreview').onclick = ()=>{ const w = window.open(overlayUrl(), '_blank', 'noopener'); if(!w) toast('팝업이 막혔습니다. 주소를 복사해서 새 탭에 붙여넣으세요.'); };
  $('ovlCopy').onclick = async ()=>{
    const t = $('ovlUrl').textContent;
    try{ await navigator.clipboard.writeText(t); toast('오버레이 주소를 복사했습니다.'); }
    catch(_){ const r = document.createRange(); r.selectNodeContents($('ovlUrl')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('주소를 선택해 두었습니다. Ctrl+C로 복사하세요.'); }
  };
}


export { evText, popAt, renderTicker, overlayUrl, refreshOvl, renderDmgMeter, reactToNew, react, flashEl, shakeHud, feedCard, evId };
