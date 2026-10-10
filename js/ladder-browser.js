/* =====================================================================
   ladder-browser.js — 프로그램 없이 이 브라우저로 래더 수집 (실험)
   ---------------------------------------------------------------------
   공략대장(운영자)이 스타크래프트를 켠 PC에서 레이드 화면을 열고 "이 브라우저로 수집"을 누르면,
   이 탭이 수집기 프로그램과 같은 일을 합니다. (js/ladder-local.js 로 로컬 래더 서버 조회)
   브라우저 보안에 막히는 PC에서는 동작하지 않습니다. ladder-test.html 로 먼저 확인할 수 있습니다.
   - 레이드 화면 탭을 닫거나 PC가 잠들면 멈춥니다. 탭을 숨겨 두면 조회 간격이 길어질 수 있습니다.
   - 수집기 프로그램이 이미 돌고 있으면 중복 기록을 막기 위해 시작하지 않습니다.
   ===================================================================== */
const BC_INTERVAL = 20000;
const BC_AUTO_KEY = 'sc-boss-raid:browsercollect';
const bc = {on:false, port:null, timer:null, cache:{}, msg:'', busy:false, finding:false};

function bcSetAuto(v){ try{ v ? localStorage.setItem(BC_AUTO_KEY, '1') : localStorage.removeItem(BC_AUTO_KEY); }catch(_){} }
function bcWantsAuto(){ try{ return localStorage.getItem(BC_AUTO_KEY) === '1'; }catch(_){ return false; } }
const programCollectorAlive = () => typeof collectorAlive === 'function' && collectorAlive() && collector && collector.src !== 'browser';

async function bcStart(fromAuto){
  if(bc.on || bc.finding) return;
  if(!Object.keys(raids).length){ toast('공략대 레이드를 시작한 뒤에 수집할 수 있습니다.'); return; }
  if(programCollectorAlive()){ if(!fromAuto) toast('수집기 프로그램이 이미 수집 중입니다. 중복을 막기 위해 브라우저 수집은 켜지 않습니다.'); return; }
  bc.finding = true; bc.msg = '스타크래프트 래더 서버를 찾는 중…'; renderBrowserCollect();
  let out;
  try{ out = await BW_LOCAL.find({onProgress:(d,t)=>{ bc.msg = `스타크래프트 찾는 중 ${Math.round(d/t*100)}%`; renderBrowserCollect(); }}); }
  catch(_){ out = {found:null, open:[]}; }
  bc.finding = false;
  if(!out.found){
    bc.msg = out.open && out.open.length ? '브라우저 보안에 막혀 읽지 못했습니다. 수집기 프로그램을 써 주세요.' : '스타크래프트를 찾지 못했습니다. 켜고 로그인했는지 확인하세요.';
    if(!fromAuto) toast(bc.msg);
    renderBrowserCollect(); return;
  }
  bc.port = out.found.port; bc.on = true; bc.msg = '수집 중'; bcSetAuto(true);
  toast('이 브라우저로 래더 수집을 시작했습니다. 이 탭을 열어 두세요.');
  bcTick();
}
function bcStop(){
  bc.on = false; clearTimeout(bc.timer); bc.timer = null; bc.msg = '꺼짐'; bcSetAuto(false);
  renderBrowserCollect();
}

async function bcTick(){
  if(!bc.on) return;
  clearTimeout(bc.timer);
  if(bc.busy){ bc.timer = setTimeout(bcTick, BC_INTERVAL); return; }
  bc.busy = true;
  let state = 'ok', count = 0;
  try{
    const live = Object.values(raids).filter(r=>compute(r, eventsOf(r.raidId)).status === 'live');
    if(!live.length){ state = 'noraid'; bc.msg = '진행 중인 공략대 없음'; }
    else {
     for(const R of live){
      const rid = R.raidId, snaps = allLadder[rid] || {};
      if(!bc.cache[rid]) bc.cache[rid] = {};
      const cache = bc.cache[rid];
      for(const m of (R.members || [])){
        const ro = rosterOf(R, m), toon = cleanLadderId(ro.ladder); if(!toon) continue;
        count++;
        const key = rosterKey(m), gw = ro.gw || 30;
        // 이전 값: 이 탭의 기억 → 없으면 DB 에 남은 마지막 조회 (다른 수집기와 이어받기)
        const saved = snaps[key];
        const prev = cache[key] || (saved && saved.id === toon && +saved.gw === gw ? saved : null);
        const snap = {id:toon, gw, t:Date.now()};
        try{
          const r = await BW_LOCAL.ladder(bc.port, toon, gw);
          if(!r.ok) throw new Error(r.err);
          Object.assign(snap, {rating:r.rating, wins:r.wins, losses:r.losses, season:r.season, err:r.err || null});
          if(prev && prev.season === r.season){
            const dw = r.wins - (+prev.wins||0), dl = r.losses - (+prev.losses||0), n = dw + dl;
            if(n > 0){
              const delta = r.rating - (+prev.rating||0);
              if(+prev.rating > 0 && r.rating > 0){
                const win = (dw > 0 && dl === 0) || (dw > 0 && dl > 0 && delta >= 0), pts = Math.abs(delta);
                const ev = {raidId:rid, t:Date.now(), type:'game', member:m, points: win ? pts : -pts, multi:false, same:false, banned:false, undone:false, auto:true, src:'browser', rating:r.rating};
                if(n > 1) ev.games = n;
                if(local){ (localDB.events[rid] = localDB.events[rid] || []).push({...ev, _id:'l'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}); commit(); }
                else await db.ref(base()+'/events/'+rid).push(ev);
              } else snap.err = '배치 게임 중이라 점수 변동을 알 수 없음 (직접 입력)';
            }
          }
          cache[key] = {rating:r.rating, wins:r.wins, losses:r.losses, season:r.season};
        }catch(e){
          snap.err = '조회 실패: ' + (e && e.message || e);
          if(prev) Object.assign(snap, {rating:prev.rating||0, wins:prev.wins||0, losses:prev.losses||0, season:prev.season});
          if(/Failed to fetch|timeout|NetworkError/i.test(String(e && e.message))){ state = 'nogame'; bc.msg = '스타크래프트 연결이 끊겼습니다. 다시 찾는 중'; bc.on = false; }
        }
        if(!local) await db.ref(base()+'/ladder/'+rid+'/'+key).set(snap);
        else { (allLadder[rid] = allLadder[rid] || {})[key] = snap; if(rid === curRid) ladderSnap = allLadder[rid]; }
        if(!bc.on) break;
      }
      if(!bc.on) break;
     }
      if(state === 'ok') bc.msg = `수집 중 · 공략대 ${live.length}개 · ${count}명`;
    }
  }catch(e){ state = 'error'; bc.msg = '오류: ' + (e && e.message || e); }
  if(!local){ try{ await db.ref(base()+'/collector').set({t:Date.now(), state, msg:bc.msg, ver:'browser', src:'browser'}); }catch(_){} }
  bc.busy = false;
  renderBrowserCollect();
  if(bc.on) bc.timer = setTimeout(bcTick, BC_INTERVAL);
  else if(state === 'nogame'){ bc.port = null; setTimeout(()=>bcStart(true), BC_INTERVAL); }
}

function renderBrowserCollect(){
  const box = $('browserCol'); if(!box) return;
  const show = !OVERLAY && !!raid && canOperate() && !(typeof myName === 'function' && lastState && myName(lastState));
  box.hidden = !show; if(!show) return;
  const btn = bc.on ? '<button type="button" class="btn sm" id="bcStop">브라우저 수집 끄기</button>'
    : `<button type="button" class="btn sm primary" id="bcStart"${bc.finding ? ' disabled' : ''}>이 브라우저로 수집 (프로그램 없이)</button>`;
  box.innerHTML = `${btn}<span class="hint">${esc(bc.msg || '스타크래프트를 켠 PC에서 누르면 이 탭이 수집기 역할을 합니다.')}</span> <a class="hint" href="ladder-test.html" target="_blank" rel="noopener">되는지 테스트</a>`;
}
document.addEventListener('click', e=>{
  if(e.target.id === 'bcStart') bcStart(false);
  else if(e.target.id === 'bcStop') bcStop();
});
/* 이 PC에서 전에 브라우저 수집을 켰으면, 레이드가 있을 때 자동으로 다시 켭니다 */
setTimeout(function autoTry(){
  if(bc.on || bc.finding) return;
  if(Object.keys(raids).length && canOperate() && bcWantsAuto() && !programCollectorAlive()) bcStart(true);
  else setTimeout(autoTry, 5000);
}, 4000);
