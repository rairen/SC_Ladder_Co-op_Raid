/* =====================================================================
   ladder.js — 래더 자동 수집 패널
   ---------------------------------------------------------------------
   공략대원마다 래더 아이디(roster.ladder)와 서버(roster.gw)를 저장합니다.
   실제 조회는 스타크래프트가 켜진 PC에서 collector/ladder-collector.cmd 가 하고,
   결과를 Firebase 에 씁니다.
     coop/collector               수집기 상태 {t, state, msg}
     coop/ladder/<raidId>/<이름>   공략대원별 마지막 조회 {id, gw, rating, wins, losses, t, err}
     coop/events/<raidId>         래더 한 판마다 type:'game', auto:true 기록 추가
   ===================================================================== */
import { App } from '@app/core/app.js';
import { $, OVERLAY, esc, fmt, bindModal, openModal, now } from '@app/core/state.js';
import { guard, store } from '@app/core/store.js';
import { rosterKey, rosterOf } from '@app/core/logic.js';
import { render } from '@app/ui/render.js';
import { myName } from '@app/core/boot.js';

const LADDER_GW = [[30,'한국'], [45,'아시아'], [10,'미국 서부'], [11,'미국 동부'], [20,'유럽']];
const COLLECTOR_ALIVE_MS = 90 * 1000;   // 이 시간 안에 신호가 있으면 "수집 중"

const cleanLadderId = v => String(v||'').trim().replace(/\s+/g,'').slice(0,24);
const gwLabel = gw => (LADDER_GW.find(x=>x[0]===Number(gw))||[0,'한국'])[1];

/* ---------- 스타 닉네임 등록 (중복 방지) ----------
   starIds/<서버>/<닉 소문자>  {uid, id, gwn}   먼저 등록한 계정만 그 닉을 씀 (다른 계정은 등록·삭제 불가)
   users/<uid>/stars/<서버_닉>  {id, gw}        내 프로필에 등록한 스타 닉 목록 (서버마다 최대 3개)
   공략대 roster 에 ladder 를 넣을 때는 starRef('<서버>/<닉>') 를 같이 넣어야 규칙을 통과함 */
const STAR_PER_GW = 3;
const starName = id => String(id||'').toLowerCase().replace(/[.#$\[\]\/]/g,'_');
const starRef = (id, gw) => `${Number(gw)||30}/${starName(id)}`;
const starKey = (id, gw) => `${Number(gw)||30}_${starName(id)}`;
/* 내 프로필의 스타 닉 목록 [{key, id, gw}] (서버 → 이름 순) */
function myStars(){
  const st = (App.profile && App.profile.stars) || {};
  const ord = g => LADDER_GW.findIndex(x=>x[0]===g);
  return Object.entries(st).filter(([,x])=>x && x.id).map(([key, x])=>({key, id: String(x.id), gw: Number(x.gw)||30}))
    .sort((a,b)=>(ord(a.gw)-ord(b.gw)) || a.id.localeCompare(b.id));
}
/* 공략대 roster 에 넣을 값 (등록 안 한 닉이면 비움) */
function rosterStar(star){ return star ? {ladder: star.id, gw: star.gw, starRef: starRef(star.id, star.gw)} : {ladder: '', gw: 30, starRef: null}; }
function collectorAlive(){ return !App.local && App.collector && (now() - Number(App.collector.t||0)) < COLLECTOR_ALIVE_MS; }
function ladderOf(name){ return App.ladderSnap[rosterKey(name)] || null; }
/* 이 공략대원의 결과가 자동으로 들어오는 중인가 */
function autoOn(name){ return !!(App.raid && collectorAlive() && rosterOf(App.raid, name).ladder); }

function agoText(t){
  const s = Math.max(0, Math.round((now() - Number(t||0))/1000));
  return s < 60 ? `${s}초 전` : s < 3600 ? `${Math.floor(s/60)}분 전` : `${Math.floor(s/3600)}시간 전`;
}

function renderLadderPanel(s, me){
  const btn = $('ladderOpen');
  btn.hidden = OVERLAY || !App.raid;
  if(btn.hidden){ $('ladderModal').hidden = true; return; }

  // 수집기 상태 (버튼에는 짧게, 팝업에는 자세히)
  let tx, cls;
  if(App.local){ tx = 'Firebase 필요'; cls = 'warn'; }
  else if(!App.collector || !collectorAlive()){ tx = '꺼짐'; cls = ''; }
  else if(App.collector.state === 'ok'){ tx = '● 수집 중'; cls = 'on'; }
  else { tx = '대기 중'; cls = 'warn'; }
  for(const id of ['collectorState', 'collectorState2']){ const st = $(id); st.textContent = tx; st.className = 'col-state ' + cls; }
  $('collectorMsg').textContent = App.local ? '브라우저 저장 모드에서는 자동 수집을 쓸 수 없습니다.'
    : App.collector ? `${App.collector.src === 'browser' ? '브라우저 수집' : '수집기 프로그램'} · ${App.collector.msg || ''} · ${agoText(App.collector.t)}` : '아직 수집기를 켠 적이 없습니다.';
  const reg = s.members.filter(m=>rosterOf(App.raid, m).ladder).length;
  $('ladderIdsSum').textContent = `래더 아이디 · ${reg}/${s.members.length}명 등록`;

  // 공략대원 표 (입력 중인 칸은 다시 그리지 않음)
  const body = $('ladderBody');
  if(body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const live = s.status === 'live' && !App.readOnly;
  body.innerHTML = s.members.length ? s.members.map(m=>{
    const ro = rosterOf(App.raid, m), snap = ladderOf(m);
    /* 로그인 모드: 운영자만 직접 입력, 본인은 프로필에 등록한 스타 닉 중에서 고름 (남의 닉을 못 쓰게) */
    const authMode = !App.local && !!App.auth, adm = authMode && App.authUser && App.admins[App.authUser.uid] === true;
    const canEdit = live && (authMode ? adm : (!me || me === m));
    const pick = live && authMode && !adm && me === m;
    if(pick){
      const mine = myStars(), cur = mine.find(x=>x.id === ro.ladder && x.gw === ro.gw);
      const opts = `<option value=""${cur ? '' : ' selected'}>없음 (결과 직접 입력)</option>` + mine.map(x=>`<option value="${esc(x.key)}"${cur && cur.key === x.key ? ' selected' : ''}>${esc(x.id)} · ${esc(gwLabel(x.gw))}</option>`).join('');
      const idPick = `<select data-lstar="${esc(m)}" aria-label="참가할 스타 닉">${opts}</select>${mine.length ? '' : ' <button type="button" class="linkbtn" data-openprofile="1">프로필에서 등록</button>'}`;
      const stPick = !ro.ladder ? '<span class="hint">직접 입력</span>' : !(snap && snap.id === ro.ladder) ? '<span class="hint">조회 대기</span>' : snap.err ? `<span class="err">${esc(snap.err)}</span>` : `<span class="ok" title="마지막 조회 ${agoText(snap.t)}">연결됨</span>`;
      return `<tr><td>${esc(m)}</td><td colspan="2">${idPick}</td><td>${stPick}</td></tr>`;
    }
    const idCell = canEdit
      ? `<input type="text" value="${esc(ro.ladder)}" data-lid="${esc(m)}" placeholder="게임 아이디" maxlength="24" autocomplete="off" spellcheck="false" aria-label="${esc(m)} 래더 아이디">`
      : (ro.ladder ? esc(ro.ladder) : '<span class="hint">-</span>');
    const gwCell = canEdit
      ? `<select data-lgw="${esc(m)}" aria-label="${esc(m)} 서버">${LADDER_GW.map(([k,l])=>`<option value="${k}"${k===ro.gw?' selected':''}>${l}</option>`).join('')}</select>`
      : esc((LADDER_GW.find(x=>x[0]===ro.gw)||[0,'한국'])[1]);
    const fresh = snap && snap.id === ro.ladder;
    // 승패는 보여주지 않고, 자동으로 들어온 마지막 판의 점수 변동과 그 점수로 계산된 딜만 표시
    const lastAuto = s.log.slice().reverse().find(e=>e.ev.type==='game' && e.ev.auto && e.ev.member===m && !e.undone);
    const lp = lastAuto ? Number(lastAuto.ev.points)||0 : 0;
    const recent = lastAuto ? ` · <span class="num ${lp>0?'d-hp':'d-rage'}" title="자동으로 들어온 마지막 판">${lp>0?'+':''}${lp}${lastAuto.dHp < 0 ? ` (딜 ${fmt(-lastAuto.dHp)})` : ''}</span>` : '';
    let state;
    if(!ro.ladder) state = '<span class="hint">직접 입력</span>';
    else if(!fresh) state = '<span class="hint">조회 대기</span>';
    else if(snap.err) state = `<span class="err">${esc(snap.err)}</span>`;
    else state = `<span class="ok" title="마지막 조회 ${agoText(snap.t)}">연결됨</span>${recent}`;
    return `<tr><td>${esc(m)}</td><td>${idCell}</td><td>${gwCell}</td><td>${state}</td></tr>`;
  }).join('') : `<tr><td colspan="4" class="empty">공략대원이 참가하면 여기서 래더 아이디를 넣을 수 있습니다.</td></tr>`;
}

/* 처음 한 번 실행: 화면 이벤트 연결, 초기값 설정 (js/main.js 가 파일 순서대로 부름) */
export function init(){


  $('ladderBody').addEventListener('change', e=>{
    const i = e.target.closest('[data-lid]'), g = e.target.closest('[data-lgw]');
    if(i){ const v = cleanLadderId(i.value); i.value = v; guard(()=>store.setRoster(i.dataset.lid, {ladder: v})).then(()=>{ i.blur(); render(); }); }
    if(g) guard(()=>store.setRoster(g.dataset.lgw, {gw: Number(g.value)||30}));
    const sp = e.target.closest('[data-lstar]');
    if(sp){ const star = myStars().find(x=>x.key === sp.value) || null; guard(async()=>{ await store.setRoster(sp.dataset.lstar, rosterStar(star)); await App.db.ref('users/'+App.authUser.uid+'/star').set(star ? star.key : null); }).then(()=>{ sp.blur(); render(); }); }
  });
  $('ladderBody').addEventListener('keydown', e=>{ if(e.key==='Enter' && e.target.matches('[data-lid]')) e.target.blur(); });
  // "몇 초 전" 표시를 갱신
  $('ladderOpen').onclick = ()=>{ if(App.lastState) renderLadderPanel(App.lastState, myName(App.lastState)); openModal('ladderModal', '#ladderClose'); };
  bindModal('ladderModal', 'ladderClose');
  setInterval(()=>{ if(App.raid && !OVERLAY && App.lastState) renderLadderPanel(App.lastState, myName(App.lastState)); }, 15000);
}


export { STAR_PER_GW, starName, starRef, starKey, myStars, rosterStar, gwLabel, collectorAlive, ladderOf, autoOn, agoText, renderLadderPanel, LADDER_GW, COLLECTOR_ALIVE_MS, cleanLadderId };
