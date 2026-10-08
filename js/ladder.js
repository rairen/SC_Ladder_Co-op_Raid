/* =====================================================================
   ladder.js — 래더 자동 수집 패널
   ---------------------------------------------------------------------
   파티원마다 래더 아이디(roster.ladder)와 서버(roster.gw)를 저장합니다.
   실제 조회는 스타크래프트가 켜진 PC에서 collector/ladder-collector.cmd 가 하고,
   결과를 Firebase 에 씁니다.
     coop/collector               수집기 상태 {t, state, msg}
     coop/ladder/<raidId>/<이름>   파티원별 마지막 조회 {id, gw, rating, wins, losses, t, err}
     coop/events/<raidId>         래더 한 판마다 type:'game', auto:true 기록 추가
   ===================================================================== */
const LADDER_GW = [[30,'한국'], [45,'아시아'], [10,'미국 서부'], [11,'미국 동부'], [20,'유럽']];
const COLLECTOR_ALIVE_MS = 90 * 1000;   // 이 시간 안에 신호가 있으면 "수집 중"

const cleanLadderId = v => String(v||'').trim().replace(/\s+/g,'').slice(0,24);
function collectorAlive(){ return !local && collector && (Date.now() - Number(collector.t||0)) < COLLECTOR_ALIVE_MS; }
function ladderOf(name){ return ladderSnap[rosterKey(name)] || null; }
/* 이 파티원의 결과가 자동으로 들어오는 중인가 */
function autoOn(name){ return !!(raid && collectorAlive() && rosterOf(raid, name).ladder); }

function agoText(t){
  const s = Math.max(0, Math.round((Date.now() - Number(t||0))/1000));
  return s < 60 ? `${s}초 전` : s < 3600 ? `${Math.floor(s/60)}분 전` : `${Math.floor(s/3600)}시간 전`;
}

function renderLadderPanel(s, me){
  const panel = $('ladderPanel');
  panel.hidden = OVERLAY || !raid;
  if(panel.hidden) return;

  // 수집기 상태
  const st = $('collectorState');
  if(local){ st.textContent = 'Firebase 연결 필요'; st.className = 'col-state warn'; }
  else if(!collector){ st.textContent = '수집기 꺼짐'; st.className = 'col-state'; }
  else if(!collectorAlive()){ st.textContent = `수집기 꺼짐 · 마지막 ${agoText(collector.t)}`; st.className = 'col-state'; }
  else if(collector.state === 'ok'){ st.textContent = '수집 중'; st.className = 'col-state on'; }
  else { st.textContent = collector.msg || '대기 중'; st.className = 'col-state warn'; }
  st.title = collector ? `${collector.msg || ''} (${agoText(collector.t)})` : '';

  // 파티원 표 (입력 중인 칸은 다시 그리지 않음)
  const body = $('ladderBody');
  if(body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const live = s.status === 'live' && !readOnly;
  body.innerHTML = s.members.length ? s.members.map(m=>{
    const ro = rosterOf(raid, m), snap = ladderOf(m), canEdit = live && (!me || me === m);
    const idCell = canEdit
      ? `<input type="text" value="${esc(ro.ladder)}" data-lid="${esc(m)}" placeholder="게임 아이디" maxlength="24" autocomplete="off" spellcheck="false" aria-label="${esc(m)} 래더 아이디">`
      : (ro.ladder ? esc(ro.ladder) : '<span class="hint">-</span>');
    const gwCell = canEdit
      ? `<select data-lgw="${esc(m)}" aria-label="${esc(m)} 서버">${LADDER_GW.map(([k,l])=>`<option value="${k}"${k===ro.gw?' selected':''}>${l}</option>`).join('')}</select>`
      : esc((LADDER_GW.find(x=>x[0]===ro.gw)||[0,'한국'])[1]);
    const fresh = snap && snap.id === ro.ladder;
    const rating = fresh && snap.rating ? fmt(snap.rating) : '-';
    const rec = fresh && (snap.wins || snap.losses) ? `${snap.wins}승 ${snap.losses}패` : '-';
    let state;
    if(!ro.ladder) state = '<span class="hint">직접 입력</span>';
    else if(!fresh) state = '<span class="hint">조회 대기</span>';
    else if(snap.err) state = `<span class="err">${esc(snap.err)}</span>`;
    else state = `<span class="ok" title="마지막 조회">${agoText(snap.t)}</span>`;
    return `<tr><td>${esc(m)}</td><td>${idCell}</td><td>${gwCell}</td><td class="r num">${rating}${rec!=='-'?`<div class="hint">${rec}</div>`:''}</td><td>${state}</td></tr>`;
  }).join('') : `<tr><td colspan="5" class="empty">파티원이 참가하면 여기서 래더 아이디를 넣을 수 있습니다.</td></tr>`;
}

$('ladderBody').addEventListener('change', e=>{
  const i = e.target.closest('[data-lid]'), g = e.target.closest('[data-lgw]');
  if(i){ const v = cleanLadderId(i.value); i.value = v; guard(()=>store.setRoster(i.dataset.lid, {ladder: v})).then(()=>{ i.blur(); render(); }); }
  if(g) guard(()=>store.setRoster(g.dataset.lgw, {gw: Number(g.value)||30}));
});
$('ladderBody').addEventListener('keydown', e=>{ if(e.key==='Enter' && e.target.matches('[data-lid]')) e.target.blur(); });
// "몇 초 전" 표시를 갱신
setInterval(()=>{ if(raid && !OVERLAY && !$('ladderPanel').hidden && lastState) renderLadderPanel(lastState, myName(lastState)); }, 15000);
