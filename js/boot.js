/* =====================================================================
   boot.js — 시작: 저장된 데이터 불러오기, 백업, Firebase 연결
   ===================================================================== */
/* ---------- Boot ---------- */
/* 베타 로컬 저장: 같은 브라우저의 다른 탭에도 자동 반영 */
const LS_KEY = 'sc-boss-raid:' + ROOM;
/* 스트리머 모드: 이 브라우저에서 "내 이름"을 고르면 자기 기록만 입력·취소할 수 있습니다. */
const ME_KEY = 'sc-boss-raid:me:' + ROOM;
let meName = ''; try{ meName = localStorage.getItem(ME_KEY) || ''; }catch(_){}
{ const qm = new URLSearchParams(location.search).get('me'); if(qm){ meName = String(qm).replace(/\s+/g,' ').trim().slice(0,20); try{ localStorage.setItem(ME_KEY, meName); }catch(_){} } }
// 개인 링크로 들어왔으면 읽은 뒤 주소창은 깔끔하게 비웁니다 (오버레이 주소는 그대로 둡니다)
if(!OVERLAY && location.search){ try{ window.history.replaceState(null, '', location.pathname + location.hash); }catch(_){} }
function myName(s){ if(typeof useAuth === 'function' && useAuth()) return authMe(s); return meName && s.members.includes(meName) ? meName : ''; }
$('meSelect').onchange = e=>{
  meName = e.target.value;
  try{ meName ? localStorage.setItem(ME_KEY, meName) : localStorage.removeItem(ME_KEY); }catch(_){}
  if(meName) openSetup(false);
  render();
  toast(meName ? `${meName} 스트리머 모드: 내 결과와 룰렛만 입력합니다.` : '운영자 모드: 모든 공략대원을 입력할 수 있습니다.');
};
const LS_HIST = 'sc-boss-raid:history:' + ROOM;
function loadHistory(){ try{ const h = JSON.parse(localStorage.getItem(LS_HIST) || '[]'); history = Array.isArray(h) ? h : []; }catch(_){ history = []; } }
function commitHistory(){ try{ localStorage.setItem(LS_HIST, JSON.stringify(history)); }catch(_){} renderHistory(); }
/* 브라우저 저장 모드의 데이터: {raids:{id:레이드}, events:{id:[기록]}} (예전 {raid, events} 형식은 자동으로 옮김) */
let localDB = {raids:{}, events:{}};
function loadLocal(){
  try{
    const d = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if(d && d.raids){ localDB = {raids: d.raids || {}, events: d.events || {}}; }
    else if(d && d.raid){ const r = {squad:1, ...d.raid}; localDB = {raids:{[r.raidId]: r}, events:{[r.raidId]: Array.isArray(d.events) ? d.events : []}}; }
    else localDB = {raids:{}, events:{}};
  }catch(_){ localDB = {raids:{}, events:{}}; }
  raids = localDB.raids; allEvents = localDB.events;
  syncSelected();
}
function commit(){
  if(raid){ localDB.raids[raid.raidId] = raid; localDB.events[raid.raidId] = events; }
  raids = localDB.raids; allEvents = localDB.events;
  try{ localStorage.setItem(LS_KEY, JSON.stringify({raids: localDB.raids, events: localDB.events, savedAt:Date.now()})); }
  catch(_){ toast('브라우저 저장 공간에 저장하지 못했습니다. "백업 저장"으로 파일을 남겨두세요.'); }
  // 입력 칸의 change/blur 도중에 화면을 다시 그리면 오류가 나므로 한 박자 뒤에 그림
  setTimeout(render, 0);
}
window.addEventListener('storage', e=>{ if(!local) return; if(e.key === LS_KEY){ loadLocal(); render(); } if(e.key === LS_HIST){ loadHistory(); renderHistory(); } });
function startLocal(){ local = true; loadLocal(); loadHistory(); render(); renderHistory(); if(!Object.keys(raids).length && !OVERLAY) openSetup(true); }

/* ---------- 공략대 선택 ---------- */
/* 보고 있는 공략대를 바꿈. '' 이면 던전 목록만 보임 */
function selectRaid(rid){
  curRid = rid || '';
  try{ curRid ? localStorage.setItem(CUR_KEY, curRid) : localStorage.removeItem(CUR_KEY); }catch(_){}
  selected = null;
  syncSelected();
  render();
}
/* raids/allEvents/allLadder 에서 지금 공략대의 raid/events/ladderSnap 을 골라 냄 */
function syncSelected(){
  const ids = Object.keys(raids).sort((a,b)=>(raids[a].squad||0)-(raids[b].squad||0));
  if(curRid && !raids[curRid]) curRid = '';
  if(!curRid && ids.length === 1) curRid = ids[0];
  if(!curRid && OVERLAY && ids.length) curRid = ids[0];
  raid = curRid ? raids[curRid] : null;
  if(raid && !Array.isArray(raid.members)) raid.members = Object.values(raid.members || {});
  if(local && curRid && raids[curRid] && !allEvents[curRid]) allEvents[curRid] = [];
  const ev = (curRid && allEvents[curRid]) || [];
  events = Array.isArray(ev) ? ev : Object.entries(ev).map(([k,v])=>({...v, _id:k}));
  ladderSnap = (curRid && allLadder[curRid]) || {};
}
const eventsOf = rid => { const ev = allEvents[rid] || []; return Array.isArray(ev) ? ev : Object.entries(ev).map(([k,v])=>({...v, _id:k})); };

$('exportBtn').onclick = ()=>{
  if(!raid){ toast('저장할 레이드가 없습니다.'); return; }
  const blob = new Blob([JSON.stringify({version:2, mode:MODE, raid, events, history}, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  const d = new Date(), pad = n=>String(n).padStart(2,'0');
  a.href = URL.createObjectURL(blob);
  a.download = `boss-raid-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  toast('백업 파일을 저장했습니다.');
};
$('importBtn').onclick = ()=>{ if(local) $('importFile').click(); };
$('importFile').onchange = async e=>{
  const f = e.target.files[0]; e.target.value = '';
  if(!f) return;
  try{
    const d = JSON.parse(await f.text());
    if(!d || !d.raid || !Array.isArray(d.raid.members) || !Array.isArray(d.events)) throw new Error('format');
    raid = d.raid; curRid = raid.raidId; events = d.events; if(Array.isArray(d.history)) { history = d.history; commitHistory(); } commit(); openSetup(false);
    toast(`"${raid.name}" 레이드를 불러왔습니다.`);
  }catch(_){ toast('레이드 백업 파일이 아닙니다. "백업 저장"으로 만든 .json 파일을 고르세요.'); }
};
render();
(function boot(){
  const cfg = window.RAID_FIREBASE_CONFIG;
  if(!cfg || !cfg.databaseURL || /여기에|YOUR_/.test(cfg.databaseURL) || !window.firebase){
    startLocal();
    return;
  }
  try{
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
    db = app.database();
    initAuth(app);
  }catch(e){ startLocal(); toast('Firebase 설정이 올바르지 않습니다. firebase-config.js 값을 확인하세요.'); return; }

  db.ref('.info/connected').on('value', snap=>{ online = snap.val() === true; render(); });
  db.ref(base()+'/history').on('value', snap=>{ history = Object.values(snap.val() || {}); renderHistory(); });
  db.ref(base()+'/collector').on('value', snap=>{ collector = snap.val(); render(); });

  /* 공략대 전체, 기록 전체, 래더 조회 전체를 구독하고 지금 보는 공략대만 골라서 화면에 씀 */
  const onErr = ()=>toast('레이드 정보를 불러오지 못했습니다. Firebase 보안 규칙을 확인하세요.');
  db.ref(base()+'/raids').on('value', snap=>{
    raids = snap.val() || {};
    for(const r of Object.values(raids)) if(r && !Array.isArray(r.members)) r.members = Object.values(r.members || {});
    syncSelected();
    if(!Object.keys(raids).length && $('setup').hidden && !meName && !OVERLAY && canOperate()) openSetup(true);
    render();
    migrateLegacy();
  }, onErr);
  db.ref(base()+'/events').on('value', snap=>{ allEvents = snap.val() || {}; syncSelected(); render(); }, onErr);
  db.ref(base()+'/ladder').on('value', snap=>{ allLadder = snap.val() || {}; syncSelected(); render(); }, ()=>{});
})();

/* 예전 한 개짜리 레이드(coop/raid)가 남아 있으면 운영자가 볼 때 1공략대로 옮김 */
let legacyChecked = false;
function migrateLegacy(){
  if(legacyChecked || local || !db || typeof canOperate !== 'function' || !useAuth() || !isAdmin()) return;
  legacyChecked = true;
  db.ref(base()+'/raid').once('value').then(async snap=>{
    const old = snap.val(); if(!old || !old.raidId) return;
    const used = Object.values(raids).map(r=>r.squad||0);
    let n = 1; while(used.includes(n)) n++;
    await db.ref(base()+'/raids/'+old.raidId).set({...old, squad: n});
    await db.ref(base()+'/raid').remove();
    toast(`진행 중이던 레이드를 ${n}공략대로 옮겼습니다.`);
  }).catch(()=>{});
}
