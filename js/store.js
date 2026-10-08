/* =====================================================================
   store.js — 저장소: 이 브라우저(로컬) 또는 Firebase 에 레이드·기록을 저장
   ===================================================================== */
/* ---------- Store ---------- */
const store = {
  async setRaid(data){
    if(local){ raid = data; events = []; commit(); return; }
    await db.ref(base()+'/raid').set(data);
  },
  async updateRaid(patch){
    if(local){ raid = {...raid, ...patch}; commit(); return; }
    await db.ref(base()+'/raid').update(patch);
  },
  async addEvent(ev){
    if(local){ events.push({...ev, _id:'l'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}); commit(); return; }
    await db.ref(base()+'/events/'+ev.raidId).push(ev);
  },
  async setRoster(name, patch){
    const k = rosterKey(name);
    if(local){ const ro = {...(raid.roster||{})}; ro[k] = {...(ro[k]||{}), ...patch}; raid = {...raid, roster:ro}; commit(); return; }
    await db.ref(base()+'/raid/roster/'+k).update(patch);
  },
  async join(name){
    if(local){ if(!raid.members.includes(name)){ raid = {...raid, members:[...raid.members, name]}; commit(); } return; }
    await db.ref(base()+'/raid/members').transaction(list=>{
      const arr = Array.isArray(list) ? list : Object.values(list || {});
      return arr.includes(name) ? arr : arr.concat([name]);
    });
  },
  async wipe(){
    if(local){ raid = null; events = []; history = []; commitHistory(); commit(); return; }
    await db.ref(base()).remove();
  },
  async reset(sum){
    if(local){ history = history.filter(h=>h.raidId!==sum.raidId).concat([sum]); commitHistory(); raid = null; events = []; commit(); return; }
    await db.ref(base()+'/history/'+sum.raidId).set(sum);
    await db.ref(base()+'/events/'+sum.raidId).remove();
    await db.ref(base()+'/ladder/'+sum.raidId).remove();
    await db.ref(base()+'/raid').remove();
  },
  async archive(sum){
    if(local){ history = history.filter(h=>h.raidId!==sum.raidId).concat([sum]); commitHistory(); return; }
    await db.ref(base()+'/history/'+sum.raidId).set(sum);
  },
  async updateEvent(id, patch){
    if(local){ const e = events.find(x=>x._id===id); if(e) Object.assign(e, patch); commit(); return; }
    await db.ref(base()+'/events/'+raid.raidId+'/'+id).update(patch);
  },
  async setUndone(id, undone){
    if(local){ const e = events.find(x=>x._id===id); if(e) e.undone = undone; commit(); return; }
    await db.ref(base()+'/events/'+raid.raidId+'/'+id).update({undone});
  }
};

function toast(msg){
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._h); toast._h = setTimeout(()=>{t.hidden = true}, 2600);
}
async function guard(fn){
  try{ await fn(); }
  catch(e){
    const msg = String((e && (e.code || e.message)) || '');
    if(/permission/i.test(msg)){
      const ua = typeof useAuth === 'function' && useAuth();
      toast(ua && !authUser ? '로그인해야 입력할 수 있습니다. 오른쪽 위 구글 로그인을 누르세요.'
        : ua && !isAdmin() && !(typeof adminsLoaded !== 'undefined' && adminsLoaded && !Object.keys(admins).length) ? '운영자만 할 수 있는 작업이거나, Firebase 규칙이 최신이 아닙니다.'
        : 'Firebase 규칙이 쓰기를 막고 있습니다. 레포의 database.rules.json 을 Firebase 규칙 탭에 다시 게시하세요.');
    }
    else { toast('저장하지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.'); }
  }
}
