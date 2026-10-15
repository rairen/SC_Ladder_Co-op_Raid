/* =====================================================================
   auth.js — 로그인(구글), 내 프로필(닉네임·게임 아이디), 운영자 권한
   ---------------------------------------------------------------------
   Firebase 를 연결했을 때만 동작합니다. (브라우저 저장 모드에서는 로그인 없음)
     users/<uid>   내 프로필 {name, ladder, gw}       본인만 쓰기
     admins/<uid>  운영자 표시 true                   사이트에서는 못 씀 (Firebase 콘솔에서만 등록·삭제)
   권한
     로그인 안 함   보기만 가능
     로그인        참가하기, 내 결과·룰렛·장비·역할 스킬 입력
     운영자        레이드 열기·종료, 공략대원 추가, 모든 공략대원 입력, 데이터 초기화 (콘솔에서 지정)
   ===================================================================== */
import { App } from '@app/core/app.js';
import { $, OVERLAY, ROOM, TEST, esc, bootReady, leadName, bindModal, openModal } from '@app/core/state.js';
import { guard, store, toast } from '@app/core/store.js';
import { render } from '@app/ui/render.js';
import { cleanName } from '@app/features/gear-roulette.js';
import { LADDER_GW, cleanLadderId } from '@app/features/ladder.js';
import { ME_KEY } from '@app/core/boot.js';


const useAuth = () => !App.local && !!App.db && !!App.auth;
const isAdmin = () => !!(useAuth() && App.authUser && App.admins[App.authUser.uid] === true);
/* 운영자 기능을 쓸 수 있는가 (브라우저 저장 모드에서는 항상 가능) */
const canOperate = () => !useAuth() || isAdmin();
const profileName = () => (App.profile && App.profile.name) || '';

function initAuth(app){
  if(!firebase.auth){ bootReady('auth', 'admins'); return; }
  App.auth = app.auth();
  /* 테스트 모드: 로그인을 이 탭에만 저장 (탭마다 다른 테스트 계정) */
  if(TEST && App.auth.setPersistence && firebase.auth.Auth) App.auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(()=>{});
  App.db.ref('admins').on('value', snap=>{ App.admins = snap.val() || {}; App.adminsLoaded = true; render(); renderAuth(); bootReady('admins'); }, ()=>bootReady('admins'));
  App.auth.onAuthStateChanged(u=>{
    bootReady('auth');
    // 계정이 바뀌면 이전 사람의 "내 이름" 선택을 지움 (같은 PC를 여럿이 쓸 때)
    if((App.authUser && App.authUser.uid) !== (u && u.uid) && App.authUser !== null){ App.meName = ''; try{ localStorage.removeItem(ME_KEY); }catch(_){} }
    App.authUser = u || null;
    if(u){ const m = document.getElementById('authModal'); if(m) m.hidden = true; }
    if(App.unsubProfile){ App.unsubProfile(); App.unsubProfile = null; }
    App.profile = null;
    if(u){
      const ref = App.db.ref('users/'+u.uid), h = snap=>{
        App.profile = snap.val();
        if(!App.profile || !App.profile.name){ openProfile(true); }
        render(); renderAuth();
      };
      ref.on('value', h); App.unsubProfile = ()=>ref.off('value', h);
    }
    render(); renderAuth();
  });
}

/* 내 계정이 지금 공략대에 참가한 이름: 공략대의 uids 에 기록된 값으로 판단
   (브라우저마다 다른 저장값이나 바뀔 수 있는 프로필 닉네임에 기대지 않음 → 다른 창·기기에서도 같음) */
function uidName(){
  const u = App.authUser, r = App.raid;
  if(!u || !r || !r.uids) return '';
  const n = r.uids[u.uid];
  return n && (r.members||[]).includes(n) ? n : '';
}
function joinedAs(nm){ return !!nm && uidName() === nm; }
/* 비공개 공략대: 진행 상황(HP·전투 기록·랭킹·레이드 기록)은 운영자와 그 공략대원만 봄.
   던전 목록에는 자물쇠로 보이고, 눌러도 시작 전 기본 보스 정보와 참가(초대 코드)만 보임. 방송 오버레이는 그대로 */
function canSeeRaid(r){
  if(!r || !r.private || canOperate()) return true;
  if(App.authUser && r.uids && r.uids[App.authUser.uid]) return true;
  return !useAuth() && !!App.meName && (r.members || []).includes(App.meName);
}
/* 지금 보고 있는 공략대의 공략대장인지 (로그인 모드는 계정, 브라우저 저장 모드는 이름으로 확인) */
function isLeader(r = App.raid){
  if(!r || !r.lead || !leadName(r)) return false;
  if(useAuth()) return !!App.authUser && r.lead.uid === App.authUser.uid;
  return !!App.meName && r.lead.name === App.meName;
}
function canSeeHist(h){
  if(!h || !h.private || canOperate()) return true;
  const uid = App.authUser && App.authUser.uid;
  return !!uid && Object.values(h.roster || {}).some(x=>x && x.uid === uid);
}
/* render() 맨 앞에서 호출: 로그인 상태에 따라 보기 전용 여부를 정함 */
function applyAccess(){
  if(!useAuth()) return;
  // 초대 코드로 참가해서 uids 에 내 계정이 올라가 있어야 공략대원
  const member = !!uidName();
  App.readOnly = !(isAdmin() || (App.authUser && member));
}
/* 로그인 모드에서 "내 이름": 운영자가 아니면 프로필 닉네임으로 고정 */
function authMe(s){
  const n = uidName();
  if(n) return n;
  // 운영자는 공략대에 참가하지 않음 (운영자 모드로 모든 공략대원 입력)
  return '';
}

function renderAuth(){
  const box = $('authBox');
  if(!useAuth()){ box.hidden = true; return; }
  box.hidden = OVERLAY;
  const anon = !!(App.authUser && App.authUser.isAnonymous);
  box.innerHTML = App.authUser
    ? `<button class="btn" type="button" id="profileBtn" title="내 프로필">${isAdmin() ? '<span class="adm-tag">운영자</span>' : ''}${anon ? '<span class="test-tag">테스트</span>' : ''}${esc(profileName() || '프로필 설정')}</button>`
    : `<button class="btn primary" type="button" id="loginBtn">${TEST ? '테스트 로그인' : '로그인'}</button>`;
  ['exportBtn','importBtn'].forEach(id=>{ $(id).hidden = !canOperate(); });
  if(!$('profileModal').hidden) renderProfile();
}

/* 테스트 계정: Firebase 익명 로그인. 이 탭에서만 유지되고, 탭을 닫거나 로그아웃하면 그 계정은 다시 쓸 수 없음 */
async function loginTest(){
  try{ await App.auth.signInAnonymously(); }
  catch(e){
    const c = String(e && e.code || '');
    if(/operation-not-allowed|admin-restricted/.test(c)) toast('Firebase 콘솔 → Authentication → 로그인 방법에서 "익명"을 사용 설정해야 테스트 계정을 쓸 수 있습니다.');
    else toast('테스트 계정으로 로그인하지 못했습니다. 잠시 뒤 다시 시도하세요.');
  }
}
/* ---------- 로그인 창 ----------
   로그인 방법(공급자)을 고르는 팝업. 지금은 구글, 나중에 SOOP 등을 PROVIDERS 에 추가하면 버튼이 생김
   ready:false 면 "준비 중"으로 보이기만 함. 테스트 모드(?test=1)에서는 테스트 계정 버튼만 */
const PROVIDERS = [
  {id:'google', label:'Google 계정으로 로그인', ready:true,  run: ()=>loginGoogle()},
  {id:'soop',   label:'SOOP 계정으로 로그인',   ready:false, note:'준비 중'}
];
function renderLoginModal(){
  const list = TEST
    ? `<button type="button" class="btn primary login-opt" id="loginTestBtn">테스트 계정으로 시작</button><p class="hint" style="margin:0">이 탭에서만 유지되는 테스트 계정입니다.</p>`
    : PROVIDERS.map(p=>`<button type="button" class="btn login-opt lp-${p.id}${p.ready ? '' : ' soon'}" data-login="${p.id}"${p.ready ? '' : ' disabled'}><span class="lp-ic" aria-hidden="true"></span>${esc(p.label)}${p.note ? `<small>${esc(p.note)}</small>` : ''}</button>`).join('');
  $('authList').innerHTML = list;
}
function login(){
  if(!useAuth()) return;
  renderLoginModal();
  openModal('authModal', TEST ? '#loginTestBtn' : '[data-login]:not([disabled])');
}
async function loginGoogle(){
  const provider = new firebase.auth.GoogleAuthProvider();
  try{ await App.auth.signInWithPopup(provider); }
  catch(e){
    const c = String(e && e.code || '');
    if(/popup-blocked|operation-not-supported/.test(c)){ await App.auth.signInWithRedirect(provider); return; }
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
    const p = App.profile || {};
    /* 구글 계정 이름은 쓰지 않음 (방송에 실명이 드러나지 않게): 기본값은 '공략대원' + 숫자, 테스트 계정은 '테스트' + 숫자 */
    $('pfName').value = p.name || ((App.authUser && App.authUser.isAnonymous ? '테스트' : '공략대원') + String(Math.floor(Math.random()*9000)+1000));
    $('pfLadder').value = p.ladder || '';
    $('pfGw').innerHTML = LADDER_GW.map(([k,l])=>`<option value="${k}"${k===(Number(p.gw)||30)?' selected':''}>${l}</option>`).join('');
    renderProfile();
    setTimeout(()=>$('pfName').focus(), 0);
  }
}
function renderProfile(){
  $('pfEmail').textContent = !App.authUser ? '' : App.authUser.isAnonymous ? '테스트 계정 · 이 탭에서만 유지됩니다. 탭을 닫거나 로그아웃하면 이 계정은 다시 쓸 수 없습니다.' : (App.authUser.email || '');
  const idHtml = `내 계정 ID: <code class="uid">${esc(App.authUser ? App.authUser.uid : '')}</code> <button class="btn sm" type="button" id="copyUid">복사</button>`;
  $('pfAdmin').innerHTML = isAdmin()
    ? '<b class="ok">운영자</b> · 레이드 열기·종료, 공략대원 추가, 데이터 초기화를 할 수 있습니다.'
    : `운영자 권한은 Firebase 콘솔에서만 줄 수 있습니다.<br>${idHtml}`;
}
async function saveProfile(){
  const name = cleanName($('pfName').value);
  if(!name){ toast('닉네임을 입력하세요.'); $('pfName').focus(); return; }
  const ladder = cleanLadderId($('pfLadder').value), gw = Number($('pfGw').value)||30;
  const old = profileName();
  await guard(async()=>{
    await App.db.ref('users/'+App.authUser.uid).set({name, ladder, gw, updatedAt: Date.now()});
    // 지금 레이드에 참가 중이면 게임 아이디도 같이 바꿈
    if(App.raid && (App.raid.members||[]).includes(name)) await store.setRoster(name, {ladder, gw, uid: App.authUser.uid});
    openProfile(false);
    toast(old && old !== name ? `닉네임을 ${name}(으)로 바꿨습니다. 이미 참가한 레이드의 이름은 그대로입니다.` : '프로필을 저장했습니다.');
  });
}
async function deleteAccount(btn){
  if(!App.authUser) return;
  if(!App.deleteArm){ App.deleteArm = true; btn.textContent = '정말 삭제 (한 번 더)'; setTimeout(()=>{ App.deleteArm = false; btn.textContent = '로그인 정보 삭제'; }, 4000); return; }
  App.deleteArm = false;
  const uid = App.authUser.uid;
  await guard(async()=>{
    await App.db.ref('users/'+uid).remove();
    if(App.raid) await App.db.ref('joins/'+ROOM+'/'+App.raid.raidId+'/'+uid).remove().catch(()=>{});
    const u = App.auth.currentUser;
    try{ await u.delete(); }
    catch(e){
      if(/requires-recent-login/.test(String(e && e.code))){ await u.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider()); await u.delete(); }
      else throw e;
    }
    openProfile(false);
    toast('로그인 정보를 삭제했습니다. 끝난 레이드 기록은 남아 있습니다.');
  });
}

/* 처음 한 번 실행: 화면 이벤트 연결, 초기값 설정 (js/main.js 가 파일 순서대로 부름) */
export function init(){

  bindModal('authModal', 'authClose');
  App.auth = null; App.authUser = null; App.profile = null; App.admins = {}; App.adminsLoaded = false; App.unsubProfile = null;

  document.addEventListener('click', e=>{
    const id = e.target.id;
    const lp = e.target.closest('[data-login]');
    if(lp && !lp.disabled){ const p = PROVIDERS.find(x=>x.id === lp.dataset.login); if(p && p.ready) p.run(); return; }
    if(id === 'loginBtn') login();
    else if(id === 'loginTestBtn') loginTest();
    else if(id === 'profileBtn') openProfile(true);
    else if(id === 'pfClose') openProfile(false);
    else if(id === 'pfSave') saveProfile();
    else if(id === 'pfDelete') deleteAccount(e.target);
    else if(id === 'pfLogout'){ App.auth.signOut(); openProfile(false); toast('로그아웃했습니다.'); }
    else if(id === 'copyUid'){ navigator.clipboard.writeText(App.authUser.uid).then(()=>toast('계정 ID를 복사했습니다.'), ()=>toast(App.authUser.uid)); }
  });
  $('profileModal').addEventListener('keydown', e=>{ if(e.key==='Enter' && e.target.matches('#pfName,#pfLadder')) saveProfile(); if(e.key==='Escape') openProfile(false); });

  /* 로그인 정보 삭제: 내 프로필과 구글 로그인 연결을 지움 (끝난 레이드 기록은 남음) */
  App.deleteArm = false;
}


export { isLeader, canSeeRaid, canSeeHist, initAuth, loginTest, uidName, joinedAs, applyAccess, authMe, renderAuth, login, openProfile, renderProfile, saveProfile, deleteAccount, useAuth, isAdmin, canOperate, profileName };
