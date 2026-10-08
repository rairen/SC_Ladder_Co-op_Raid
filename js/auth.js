/* =====================================================================
   auth.js — 로그인(구글), 내 프로필(방송 닉네임·게임 아이디), 운영자 권한
   ---------------------------------------------------------------------
   Firebase 를 연결했을 때만 동작합니다. (브라우저 저장 모드에서는 로그인 없음)
     users/<uid>   내 프로필 {name, ladder, gw}       본인만 쓰기
     admins/<uid>  운영자 표시 true                   운영자만 쓰기 (첫 운영자는 Firebase 콘솔에서 직접 등록)
   권한
     로그인 안 함   보기만 가능
     로그인        참가하기, 내 결과·룰렛·장비·역할 스킬 입력
     운영자        레이드 열기·종료, 파티원 추가, 모든 파티원 입력, 데이터 초기화
   ===================================================================== */
let auth = null, authUser = null, profile = null, admins = {}, adminsLoaded = false, unsubProfile = null;

const useAuth = () => !local && !!db && !!auth;
const isAdmin = () => !!(useAuth() && authUser && admins[authUser.uid] === true);
/* 운영자 기능을 쓸 수 있는가 (브라우저 저장 모드에서는 항상 가능) */
const canOperate = () => !useAuth() || isAdmin();
const profileName = () => (profile && profile.name) || '';

function initAuth(app){
  if(!firebase.auth){ return; }
  auth = app.auth();
  db.ref('admins').on('value', snap=>{ admins = snap.val() || {}; adminsLoaded = true; render(); renderAuth(); });
  auth.onAuthStateChanged(u=>{
    // 계정이 바뀌면 이전 사람의 "내 이름" 선택을 지움 (같은 PC를 여럿이 쓸 때)
    if((authUser && authUser.uid) !== (u && u.uid) && authUser !== null){ meName = ''; try{ localStorage.removeItem(ME_KEY); }catch(_){} }
    authUser = u || null;
    if(unsubProfile){ unsubProfile(); unsubProfile = null; }
    profile = null;
    if(u){
      const ref = db.ref('users/'+u.uid), h = snap=>{
        profile = snap.val();
        if(!profile || !profile.name){ openProfile(true); }
        render(); renderAuth();
      };
      ref.on('value', h); unsubProfile = ()=>ref.off('value', h);
    }
    render(); renderAuth();
  });
}

/* render() 맨 앞에서 호출: 로그인 상태에 따라 보기 전용 여부를 정함 */
function applyAccess(){
  if(!useAuth()) return;
  const nm = profileName();
  const member = !!(raid && nm && (raid.members||[]).includes(nm));
  readOnly = !(isAdmin() || (authUser && member));
}
/* 로그인 모드에서 "내 이름": 운영자가 아니면 프로필 닉네임으로 고정 */
function authMe(s){
  if(isAdmin()) return meName && s.members.includes(meName) ? meName : '';
  const nm = profileName();
  return authUser && nm && s.members.includes(nm) ? nm : '';
}

function renderAuth(){
  const box = $('authBox');
  if(!useAuth()){ box.hidden = true; return; }
  box.hidden = OVERLAY;
  box.innerHTML = authUser
    ? `<button class="btn" type="button" id="profileBtn" title="내 프로필">${isAdmin() ? '<span class="adm-tag">운영자</span>' : ''}${esc(profileName() || '프로필 설정')}</button>`
    : `<button class="btn primary" type="button" id="loginBtn">구글 로그인</button>`;
  ['exportBtn','importBtn'].forEach(id=>{ $(id).hidden = !canOperate(); });
  if(!$('profileModal').hidden) renderProfile();
}

async function login(){
  const provider = new firebase.auth.GoogleAuthProvider();
  try{ await auth.signInWithPopup(provider); }
  catch(e){
    const c = String(e && e.code || '');
    if(/popup-blocked|operation-not-supported/.test(c)){ await auth.signInWithRedirect(provider); return; }
    if(/popup-closed|cancelled-popup/.test(c)) return;
    if(/unauthorized-domain/.test(c)) toast('Firebase 인증의 승인된 도메인에 이 사이트 주소를 추가해야 합니다.');
    else if(/operation-not-allowed|configuration-not-found/.test(c)) toast('Firebase 콘솔에서 Google 로그인을 사용 설정해야 합니다.');
    else toast('로그인하지 못했습니다. 잠시 뒤 다시 시도하세요.');
  }
}

/* ---------- 프로필 창 ---------- */
function openProfile(open){
  $('profileModal').hidden = !open;
  if(open){
    const p = profile || {};
    $('pfName').value = p.name || (authUser && authUser.displayName || '').slice(0,20);
    $('pfLadder').value = p.ladder || '';
    $('pfGw').innerHTML = LADDER_GW.map(([k,l])=>`<option value="${k}"${k===(Number(p.gw)||30)?' selected':''}>${l}</option>`).join('');
    renderProfile();
    setTimeout(()=>$('pfName').focus(), 0);
  }
}
function renderProfile(){
  $('pfEmail').textContent = authUser ? (authUser.email || '') : '';
  const noAdmins = adminsLoaded && !Object.values(admins).some(v=>v===true);
  $('pfAdmin').innerHTML = isAdmin()
    ? '<b class="ok">운영자</b> · 레이드 열기·종료, 파티원 추가, 데이터 초기화를 할 수 있습니다.'
    : noAdmins
      ? `아직 운영자가 없습니다. 첫 운영자는 Firebase 콘솔에서 등록합니다. 내 계정 ID: <code class="uid">${esc(authUser ? authUser.uid : '')}</code> <button class="btn sm" type="button" id="copyUid">복사</button>`
      : '스트리머 계정입니다. 운영자가 운영자 목록에서 권한을 줄 수 있습니다.';
  // 운영자: 로그인한 사용자 목록에서 운영자 지정
  const list = $('pfUsers');
  list.hidden = !isAdmin();
  if(isAdmin()){
    db.ref('users').once('value').then(snap=>{
      const users = snap.val() || {};
      const rows = Object.entries(users).sort((a,b)=>String(a[1].name||'').localeCompare(String(b[1].name||'')));
      list.innerHTML = `<div class="label" style="margin-top:6px">운영자 지정</div>` + (rows.length ? rows.map(([uid,u])=>
        `<label class="pf-user"><input type="checkbox" data-admin="${esc(uid)}"${admins[uid]===true?' checked':''}${uid===authUser.uid?' disabled':''}> ${esc(u.name||'(이름 없음)')}${u.ladder?` <span class="hint">${esc(u.ladder)}</span>`:''}</label>`).join('') : '<p class="hint">아직 로그인한 사람이 없습니다.</p>');
    }).catch(()=>{});
  }
}
async function saveProfile(){
  const name = cleanName($('pfName').value);
  if(!name){ toast('방송 닉네임을 입력하세요.'); $('pfName').focus(); return; }
  const ladder = cleanLadderId($('pfLadder').value), gw = Number($('pfGw').value)||30;
  const old = profileName();
  await guard(async()=>{
    await db.ref('users/'+authUser.uid).set({name, ladder, gw, updatedAt: Date.now()});
    // 지금 레이드에 참가 중이면 게임 아이디도 같이 바꿈
    if(raid && (raid.members||[]).includes(name)) await store.setRoster(name, {ladder, gw, uid: authUser.uid});
    openProfile(false);
    toast(old && old !== name ? `닉네임을 ${name}(으)로 바꿨습니다. 이미 참가한 레이드의 이름은 그대로입니다.` : '프로필을 저장했습니다.');
  });
}

document.addEventListener('click', e=>{
  const id = e.target.id;
  if(id === 'loginBtn') login();
  else if(id === 'profileBtn') openProfile(true);
  else if(id === 'pfClose') openProfile(false);
  else if(id === 'pfSave') saveProfile();
  else if(id === 'pfLogout'){ auth.signOut(); openProfile(false); toast('로그아웃했습니다.'); }
  else if(id === 'copyUid'){ navigator.clipboard.writeText(authUser.uid).then(()=>toast('계정 ID를 복사했습니다.'), ()=>toast(authUser.uid)); }
});
$('profileModal').addEventListener('change', e=>{
  const c = e.target.closest('[data-admin]'); if(!c) return;
  guard(()=>db.ref('admins/'+c.dataset.admin).set(c.checked ? true : null));
});
$('profileModal').addEventListener('keydown', e=>{ if(e.key==='Enter' && e.target.matches('#pfName,#pfLadder')) saveProfile(); if(e.key==='Escape') openProfile(false); });
