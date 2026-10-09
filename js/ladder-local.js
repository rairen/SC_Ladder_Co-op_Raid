/* =====================================================================
   ladder-local.js — 브라우저에서 스타크래프트 로컬 래더 서버 찾기·조회
   ---------------------------------------------------------------------
   스타크래프트: 리마스터는 로그인하면 PC 안(127.0.0.1)에 래더 조회 서버를 엽니다.
   포트는 실행할 때마다 바뀌므로 포트를 차례로 두드려 찾습니다.
   브라우저 보안(CORS·로컬 네트워크 접근)에 막히면 읽을 수 없고, 그때는 수집기 프로그램을 써야 합니다.
   ladder-test.html 과 레이드 화면이 함께 씁니다. (다른 js 에 기대지 않음)
   ===================================================================== */
const BW_LOCAL = (()=>{
  const HOST = 'http://127.0.0.1';
  const PORT_KEY = 'sc-boss-raid:gameport';
  const timeout = (ms, p) => Promise.race([p, new Promise((_, rej)=>setTimeout(()=>rej(new Error('timeout')), ms))]);

  /* 포트가 열려 있는지 (응답 내용은 못 읽어도 됨) */
  async function isOpen(port){
    try{ await timeout(1500, fetch(`${HOST}:${port}/`, {mode:'no-cors', cache:'no-store'})); return true; }
    catch(_){ return false; }
  }
  /* 래더 서버인지 확인하고 실제로 읽을 수 있는지 */
  async function probe(port){
    try{
      const res = await timeout(3000, fetch(`${HOST}:${port}/web-api/v1/gateway`, {cache:'no-store'}));
      const txt = await res.text();
      if(/"region"/.test(txt)) return {port, readable:true};
      return {port, readable:false, reason:'래더 서버가 아님'};
    }catch(e){ return {port, readable:false, reason:'읽기 차단(CORS) 또는 다른 프로그램'}; }
  }
  /* 포트 찾기: 저장된 포트 → 자주 쓰는 범위 → 전체 범위 */
  async function find({onProgress, full = false} = {}){
    const tried = new Set(), open = [];
    try{ const saved = +localStorage.getItem(PORT_KEY); if(saved){ const r = await probe(saved); if(r.readable) return {found:r, open:[saved]}; } }catch(_){}
    const ranges = [[49152, 65535]];
    if(full) ranges.push([1024, 49151]);
    let total = ranges.reduce((a,[s,e])=>a + e - s + 1, 0), done = 0;
    for(const [s, e] of ranges){
      let next = s;
      const worker = async ()=>{
        while(next <= e){
          const p = next++;
          if(tried.has(p)) continue; tried.add(p);
          if(await isOpen(p)) open.push(p);
          done++; if(onProgress && done % 256 === 0) onProgress(done, total, open.length);
        }
      };
      await Promise.all(Array.from({length:96}, worker));
    }
    if(onProgress) onProgress(total, total, open.length);
    const results = [];
    for(const p of open.sort((a,b)=>a-b)){
      const r = await probe(p); results.push(r);
      if(r.readable){ try{ localStorage.setItem(PORT_KEY, String(p)); }catch(_){} return {found:r, open, results}; }
    }
    return {found:null, open, results};
  }
  async function get(port, path){
    const res = await timeout(10000, fetch(`${HOST}:${port}${path}`, {cache:'no-store'}));
    if(!res.ok) throw new Error('HTTP '+res.status);
    return res.json();
  }
  /* 아이디의 이번 시즌 1:1 래더 정보 (수집기 Get-Ladder 와 같은 방식) */
  async function ladder(port, toon, gw){
    const d = await get(port, `/web-api/v2/aurora-profile-by-toon/${encodeURIComponent(toon)}/${gw}?request_flags=scr_mmtooninfo`);
    const season = d && d.matchmaked_current_season;
    if(season == null) return {ok:false, err:'프로필 없음'};
    const st = (d.matchmaked_stats || []).find(x=>x && x.season_id === season && x.game_mode_id === 1 && String(x.toon).toLowerCase() === String(toon).toLowerCase());
    if(!st) return {ok:true, rating:0, wins:0, losses:0, season, err:'이번 시즌 래더 기록 없음'};
    return {ok:true, rating:+st.rating||0, wins:+st.wins||0, losses:+st.losses||0, season, err:null};
  }
  return {find, probe, ladder, get, PORT_KEY};
})();
