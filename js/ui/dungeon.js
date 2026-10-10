/* =====================================================================
   dungeon.js — 던전(공략대 목록)과 랭킹 창
   ---------------------------------------------------------------------
   공략대 여럿이 각자 레이드를 동시에 진행합니다. (예: 아비터-1공략대, 불멸자-2공략대)
   위쪽 던전 목록에서 공략대를 고르면 아래 화면이 그 공략대로 바뀝니다.
   데이터: coop/raids/<raidId> (공략대마다 squad 번호), coop/events/<raidId>
   ===================================================================== */
import { App } from '@app/core/app.js';
import { PRESETS } from '@app/core/game-data.js';
import { $, OVERLAY, esc, fmt, squadLabel } from '@app/core/state.js';
import { compute } from '@app/core/logic.js';
import { topDealer } from '@app/ui/render.js';
import { openSetup } from '@app/ui/setup.js';
import { canOperate, useAuth } from '@app/features/auth.js';
import { eventsOf, selectRaid } from '@app/core/boot.js';

const DIFF_LABEL = k => (PRESETS[k] && PRESETS[k].label) || '커스텀';

/* 내가 참가해 있는 공략대 (로그인: 내 계정이 uids 에 있음 / 브라우저 저장: 내 이름이 공략대원) */
function mySquadId(){
  if(typeof useAuth === 'function' && useAuth()){
    if(!App.authUser) return '';
    const r = Object.values(App.raids).find(r=>r.uids && r.uids[App.authUser.uid]);
    return r ? r.raidId : '';
  }
  if(!App.meName) return '';
  const r = Object.values(App.raids).find(r=>(r.members||[]).includes(App.meName));
  return r ? r.raidId : '';
}
function renderLobby(){
  const box = $('lobby'); if(!box) return;
  box.hidden = OVERLAY;
  if(OVERLAY) return;
  const list = Object.values(App.raids).sort((a,b)=>(a.squad||0)-(b.squad||0));
  $('newSquadBtn').hidden = !canOperate();
  // 공략대에 참가 중이면 목록은 숨기고 내 공략대만 보여 줌
  const mine = mySquadId();
  box.classList.toggle('joined', !!mine);
  $('dungeonList').hidden = !!mine;
  if(mine){
    if(App.curRid !== mine){ setTimeout(()=>selectRaid(mine), 0); }
    $('lobbyCount').textContent = `내 공략대 · ${squadLabel(App.raids[mine])} ${App.raids[mine].name || ''}`;
    ['hud','skillBoard'].forEach(id=>{ const el = $(id); if(el) el.hidden = false; });
    document.querySelector('.grid').hidden = false; $('logPanel').hidden = false;
    return;
  }
  $('lobbyCount').textContent = list.length ? `진행 중인 공략대 ${list.length}` : '';
  $('dungeonList').innerHTML = list.length ? list.map(r=>{
    const st = compute(r, eventsOf(r.raidId));
    const pct = st.maxHp ? Math.max(0, st.hp/st.maxHp*100) : 100;
    const alive = st.members.filter(m=>(st.mhp[m] ?? 1) > 0).length;
    const status = st.status === 'clear' ? '<b class="ok">격파</b>' : st.status === 'fail' ? '<b class="d-hp">전멸</b>' : '진행 중';
    return `<button type="button" class="dcard${r.raidId === App.curRid ? ' on' : ''}${st.status !== 'live' ? ' done' : ''}" data-rid="${esc(r.raidId)}" aria-pressed="${r.raidId === App.curRid}">
      <span class="dc-squad">${esc(squadLabel(r))}</span>
      <span class="dc-boss">${esc(r.name || '이름 없는 보스')}</span>
      <span class="dc-hp"><i style="width:${pct}%"></i></span>
      <span class="dc-meta"><span>HP ${Math.round(pct)}%</span><span>공략대원 ${alive}/${st.members.length}</span><span>${DIFF_LABEL(r.diff)}</span><span>${status}</span></span>
    </button>`;
  }).join('') : `<p class="empty">진행 중인 공략대가 없습니다.${canOperate() ? ' <b>새 공략대</b>로 레이드를 여세요.' : ' 운영자가 공략대를 열면 여기에 나타납니다.'}</p>`;
  // 공략대를 고르지 않았으면 아래 화면은 숨김
  const none = !App.raid;
  ['hud','skillBoard'].forEach(id=>{ const el = $(id); if(el) el.hidden = none && !OVERLAY; });
  document.querySelector('.grid').hidden = none && !OVERLAY;
  $('logPanel').hidden = none && !OVERLAY;
  if(none && list.length > 1) $('lobbyCount').textContent += ' · 볼 공략대를 고르세요';
}
function rankData(){
  const squads = [], players = {};
  const addP = (name, x, squad, live, clear) => {
    const p = players[name] || (players[name] = {name, dmg:0, w:0, l:0, best:0, raids:0, clears:0, now:''});
    p.dmg += x.dmg||0; p.w += x.w||0; p.l += x.l||0; p.best = Math.max(p.best, x.best||0); p.raids++; if(clear) p.clears++;
    if(live) p.now = squad;
  };
  for(const r of Object.values(App.raids)){
    const st = compute(r, eventsOf(r.raidId));
    const dmg = st.members.reduce((a,m)=>a + (st.stats[m].dmg||0), 0);
    const end = st.status !== 'live' ? Math.max(r.startedAt||0, ...eventsOf(r.raidId).filter(e=>!e.undone).map(e=>e.t||0)) : Date.now();
    squads.push({label: squadLabel(r), boss: r.name, diff: r.diff, status: st.status, live: true, progress: st.maxHp ? 1 - st.hp/st.maxHp : 0, dmg, n: st.members.length, mvp: topDealer(st) || '', start: r.startedAt||0, end});
    st.members.forEach(m=>addP(m, st.stats[m], squadLabel(r), true, st.status === 'clear'));
  }
  for(const h of App.history){
    if(App.raids[h.raidId] || h.status === 'live') continue;
    const mem = h.members || {};
    const dmg = Object.values(mem).reduce((a,x)=>a + (x.dmg||0), 0);
    squads.push({label: h.squadLabel || '', boss: h.name, diff: h.diff, status: h.status, live: false, progress: h.maxHp ? 1 - (h.hpLeft||0)/h.maxHp : 0, dmg, n: Object.keys(mem).length, mvp: h.mvp || '', start: h.startedAt||0, end: h.endedAt||h.startedAt||0});
    Object.entries(mem).forEach(([m,x])=>addP(m, x, h.squadLabel || '', false, h.status === 'clear'));
  }
  const dur = x => Math.max(0, x.end - x.start);
  squads.sort((a,b)=> ((b.status==='clear') - (a.status==='clear')) || (a.status==='clear' ? dur(a)-dur(b) : 0) || (b.progress - a.progress) || (b.dmg - a.dmg));
  return {squads, players: Object.values(players).sort((a,b)=>b.dmg - a.dmg || b.w - a.w)};
}
const durText = ms => { const m = Math.round(ms/60000); return m >= 60 ? `${Math.floor(m/60)}시간 ${m%60}분` : `${m}분`; };
function renderRank(){
  const {squads, players} = rankData();
  document.querySelectorAll('[data-rtab]').forEach(b=>b.setAttribute('aria-pressed', b.dataset.rtab === App.rankTab));
  const medal = i => i < 3 ? `<span class="medal m${i+1}">${i+1}</span>` : `<span class="medal">${i+1}</span>`;
  if(App.rankTab === 'squad'){
    $('rankNote').textContent = '격파한 공략대가 먼저, 그다음 진행률 순입니다. 격파끼리는 걸린 시간이 짧을수록 위입니다.';
    $('rankBody').innerHTML = squads.length ? `<div class="tbl-wrap"><table class="rank-table"><thead><tr><th></th><th>공략대</th><th>보스</th><th>상태</th><th class="r">진행률</th><th class="r">총 데미지</th><th class="r">인원</th><th>MVP</th><th class="r">시간</th></tr></thead><tbody>
      ${squads.map((x,i)=>`<tr class="${x.live?'live':''}"><td>${medal(i)}</td><td><b>${esc(x.label || '-')}</b></td><td>${esc(x.boss || '')}<div class="hint">${DIFF_LABEL(x.diff)}</div></td>
        <td>${x.status==='clear' ? '<b class="ok">격파</b>' : x.status==='fail' ? '<b class="d-hp">전멸</b>' : x.status==='stopped' ? '중단' : '진행 중'}</td>
        <td class="r num"><span class="rk-bar"><i style="width:${Math.round(x.progress*100)}%"></i></span>${Math.round(x.progress*100)}%</td>
        <td class="r num">${fmt(x.dmg)}</td><td class="r num">${x.n}</td><td>${esc(x.mvp || '-')}</td><td class="r num">${durText(x.end - x.start)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty">아직 공략대 기록이 없습니다.</p>';
  } else {
    $('rankNote').textContent = '진행 중인 공략대와 지난 레이드 기록을 합친 개인 누적 데미지 순입니다.';
    $('rankBody').innerHTML = players.length ? `<div class="tbl-wrap"><table class="rank-table"><thead><tr><th></th><th>공략대원</th><th>지금</th><th class="r">데미지</th><th class="r">승</th><th class="r">패</th><th class="r">한 판 최고</th><th class="r">레이드</th><th class="r">격파</th></tr></thead><tbody>
      ${players.map((p,i)=>`<tr><td>${medal(i)}</td><td><button type="button" class="linkbtn name-btn" data-ledger="${esc(p.name)}" title="${esc(p.name)} 지참금 내역"><b>${esc(p.name)}</b></button></td><td>${p.now ? esc(p.now) : '<span class="hint">-</span>'}</td><td class="r num">${fmt(p.dmg)}</td><td class="r num">${p.w}</td><td class="r num">${p.l}</td><td class="r num">${fmt(p.best)}</td><td class="r num"><button type="button" class="linkbtn num" data-praids="${esc(p.name)}" title="${esc(p.name)} 참여 레이드 보기">${p.raids}</button></td><td class="r num">${p.clears}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty">아직 공략대원 기록이 없습니다.</p>';
  }
}

/* 처음 한 번 실행: 화면 이벤트 연결, 초기값 설정 (js/main.js 가 파일 순서대로 부름) */
export function init(){

  document.addEventListener('click', e=>{
    const c = e.target.closest('.dcard[data-rid]');
    if(c){ selectRaid(c.dataset.rid); return; }
    if(e.target.id === 'newSquadBtn'){ openSetup(true); $('setup').scrollIntoView({behavior:'smooth', block:'start'}); }
  });

  /* ---------- 랭킹 ---------- */
  App.rankTab = 'squad';
  $('rankBtn').onclick = ()=>{ $('rankModal').hidden = false; renderRank(); };
  $('rankClose').onclick = ()=>{ $('rankModal').hidden = true; };
  $('rankModal').addEventListener('click', e=>{
    if(e.target === $('rankModal')){ $('rankModal').hidden = true; return; }
    const t = e.target.closest('[data-rtab]'); if(t){ App.rankTab = t.dataset.rtab; renderRank(); }
  });
  $('rankModal').addEventListener('keydown', e=>{ if(e.key === 'Escape') $('rankModal').hidden = true; });
}


export { mySquadId, renderLobby, rankData, renderRank, DIFF_LABEL, durText };
