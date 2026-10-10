/* =====================================================================
   store.js — 저장소: 이 브라우저(로컬) 또는 Firebase 에 레이드·기록을 저장
   ===================================================================== */
/* ---------- Store ---------- */
/* 공략대(레이드) 경로: 지정이 없으면 지금 보고 있는 공략대 */
import { App } from '@app/core/app.js';
import { $, ROOM, base } from '@app/core/state.js';
import { rosterKey } from '@app/core/logic.js';
import { isAdmin, useAuth } from '@app/features/auth.js';
import { commit, commitHistory, selectRaid } from '@app/core/boot.js';

const rpath = rid => base()+'/raids/'+(rid || (App.raid && App.raid.raidId));
const store = {
  async setRaid(data){
    if(App.local){ App.raid = data; App.events = []; App.curRid = data.raidId; commit(); return; }
    await App.db.ref(rpath(data.raidId)).set(data);
  },
  async updateRaid(patch){
    if(App.local){ App.raid = {...App.raid, ...patch}; commit(); return; }
    await App.db.ref(rpath()).update(patch);
  },
  async addEvent(ev){
    if(App.local){ App.events.push({...ev, _id:'l'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}); commit(); return; }
    await App.db.ref(base()+'/events/'+ev.raidId).push(ev);
  },
  async setRoster(name, patch){
    const k = rosterKey(name);
    if(App.local){ const ro = {...(App.raid.roster||{})}; ro[k] = {...(ro[k]||{}), ...patch}; App.raid = {...App.raid, roster:ro}; commit(); return; }
    await App.db.ref(rpath()+'/roster/'+k).update(patch);
  },
  async join(name){
    if(App.local){ if(!App.raid.members.includes(name)){ App.raid = {...App.raid, members:[...App.raid.members, name]}; commit(); } return; }
    await App.db.ref(rpath()+'/members').transaction(list=>{
      const arr = Array.isArray(list) ? list : Object.values(list || {});
      return arr.includes(name) ? arr : arr.concat([name]);
    });
  },
  /* 공략대에서 내보내기 (운영자). 그 공략대원의 기록은 계산에서 빠집니다. */
  async kick(name){
    if(App.local){ App.raid = {...App.raid, members: App.raid.members.filter(x=>x!==name)}; commit(); return; }
    await App.db.ref(rpath()+'/members').transaction(list=>{ const arr = Array.isArray(list) ? list : Object.values(list || {}); return arr.filter(x=>x!==name); });
    const uid = App.raid && App.raid.roster && App.raid.roster[rosterKey(name)] && App.raid.roster[rosterKey(name)].uid;
    if(uid) await App.db.ref(rpath()+'/uids/'+uid).remove();
  },
  async wipe(){
    if(App.local){ App.raid = null; App.events = []; App.history = []; App.localDB = {raids:{}, events:{}}; commitHistory(); commit(); return; }
    /* 공략대·기록·래더 수집·초대 코드 모두 삭제. 로그인 프로필(users)과 운영자(admins)는 남김 */
    await App.db.ref(base()).remove();
    await App.db.ref('invites/'+ROOM).remove().catch(()=>{});
    await App.db.ref('joins/'+ROOM).remove().catch(()=>{});
  },
  async reset(sum){
    const cur = !!(App.raid && App.raid.raidId === sum.raidId);
    if(App.local){ App.history = App.history.filter(h=>h.raidId!==sum.raidId).concat([sum]); commitHistory(); delete App.localDB.raids[sum.raidId]; delete App.localDB.events[sum.raidId]; if(cur){ App.raid = null; App.events = []; selectRaid(''); } commit(); return; }
    await App.db.ref(base()+'/history/'+sum.raidId).set(sum);
    await App.db.ref(base()+'/events/'+sum.raidId).remove();
    await App.db.ref(base()+'/ladder/'+sum.raidId).remove();
    await App.db.ref('invites/'+ROOM+'/'+sum.raidId).remove().catch(()=>{});
    await App.db.ref(rpath(sum.raidId)).remove();
    if(cur) selectRaid('');
  },
  async archive(sum){
    if(App.local){ App.history = App.history.filter(h=>h.raidId!==sum.raidId).concat([sum]); commitHistory(); return; }
    await App.db.ref(base()+'/history/'+sum.raidId).set(sum);
  },
  async updateEvent(id, patch){
    if(App.local){ const e = App.events.find(x=>x._id===id); if(e) Object.assign(e, patch); commit(); return; }
    await App.db.ref(base()+'/events/'+App.raid.raidId+'/'+id).update(patch);
  },
  /* 공략대 구성 변화 기록 (참가, 내보내기, 역할·지참금 변경). 계산에는 영향 없음 */
  async partyLog(member, action, extra){
    if(!App.raid) return;
    await this.addEvent({raidId: App.raid.raidId, t: Date.now(), type:'party', member, action, ...(extra||{}), undone:false});
  },
  async setUndone(id, undone){
    if(App.local){ const e = App.events.find(x=>x._id===id); if(e) e.undone = undone; commit(); return; }
    await App.db.ref(base()+'/events/'+App.raid.raidId+'/'+id).update({undone});
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
      toast(ua && !App.authUser ? '로그인해야 입력할 수 있습니다. 오른쪽 위 구글 로그인을 누르세요.'
        : ua && !isAdmin() && !(typeof App.adminsLoaded !== 'undefined' && App.adminsLoaded && !Object.keys(App.admins).length) ? '운영자만 할 수 있는 작업이거나, Firebase 규칙이 최신이 아닙니다.'
        : 'Firebase 규칙이 쓰기를 막고 있습니다. 레포의 database.rules.json 을 Firebase 규칙 탭에 다시 게시하세요.');
    }
    else { toast('저장하지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.'); }
  }
}

export { toast, guard, rpath, store };
