/* =====================================================================
   party.js — 공략대 구성: 초대 코드로 참가, 운영자의 내보내기
   ---------------------------------------------------------------------
   로그인 모드(Firebase)에서는 운영자가 레이드를 시작하면 초대 코드가 만들어지고,
   공략대원은 그 코드를 넣어야 참가할 수 있습니다. 운영자가 이름을 직접 넣는 기능은 없습니다.
     invites/<mode>/<raidId>        {code, t}     공략대별 초대 코드. 운영자만 읽고 씀
     joins/<mode>/<raidId>/<uid>    참가할 때 넣은 코드   규칙이 그 공략대 코드와 같은지 확인
     <mode>/raids/<raidId>/uids/<uid> 참가한 계정 → 이름  코드가 맞아야 쓸 수 있음. 이 목록에 있어야 기록을 남길 수 있음
   브라우저 저장 모드에서는 초대 코드 없이 예전처럼 이름으로 참가합니다.
   ===================================================================== */
import { App } from '@app/core/app.js';
import { $, OVERLAY, ROOM, esc } from '@app/core/state.js';
import { guard, store, toast } from '@app/core/store.js';
import { render } from '@app/ui/render.js';
import { doJoin } from '@app/features/gear-roulette.js';
import { isAdmin, useAuth } from '@app/features/auth.js';
import { myName } from '@app/core/boot.js';

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode(len = 6){
  const a = new Uint32Array(len); crypto.getRandomValues(a);
  return Array.from(a, x=>INVITE_CHARS[x % INVITE_CHARS.length]).join('');
}
async function newInvite(raidId){
  const rid = raidId || (App.raid && App.raid.raidId); if(!rid) return;
  await App.db.ref('invites/'+ROOM+'/'+rid).set({code: genCode(), raidId: rid, t: Date.now()});
}
/* 운영자일 때만 초대 코드를 구독 (운영자가 아니면 규칙상 읽을 수 없음) */
function watchInvite(){
  const want = useAuth() && isAdmin() && App.raid ? App.authUser.uid + '|' + App.raid.raidId : '';
  if(want === App.inviteFor) return;
  App.inviteFor = want; App.inviteCode = null;
  if(App.unsubInvite){ App.unsubInvite(); App.unsubInvite = null; }
  if(!want) return;
  const ref = App.db.ref('invites/'+ROOM+'/'+App.raid.raidId), h = snap=>{ App.inviteCode = snap.val(); if(App.lastState) renderInvite(App.lastState, myName(App.lastState)); };
  ref.on('value', h, ()=>{});
  App.unsubInvite = ()=>ref.off('value', h);
}

const INVITE_SHOW_KEY = 'sc-boss-raid:inviteShow';
function inviteShown(){ try{ return localStorage.getItem(INVITE_SHOW_KEY) === '1'; }catch(_){ return false; } }
function renderInvite(s, me){
  const authed = useAuth();
  $('addMemberRow').hidden = authed;
  $('addHint').hidden = authed;
  watchInvite();
  const box = $('inviteBox');
  /* 운영자에게는 공략대원으로 참가 중이어도 항상 표시. 방송 화면 노출을 막으려고 기본은 가림 */
  const show = authed && isAdmin() && !!App.raid && s.status === 'live' && !OVERLAY;
  box.hidden = !show;
  if(!show) return;
  const cur = App.inviteCode && App.inviteCode.raidId === App.raid.raidId ? App.inviteCode.code : '';
  const open = inviteShown();
  box.innerHTML = cur
    ? `<span class="label">초대 코드</span><b class="code num${open ? '' : ' masked'}" aria-label="${open ? esc(cur) : '가려진 초대 코드'}">${open ? esc(cur) : '•'.repeat(cur.length)}</b>
       <label class="toggle" title="방송 화면에 코드가 보이지 않게 가릴 수 있습니다"><input type="checkbox" id="inviteShow"${open ? ' checked' : ''}><span class="tg-knob"></span><span class="tg-tx">${open ? '보이기' : '가림'}</span></label>
       <button type="button" class="btn sm" id="inviteCopy">복사</button>
       <button type="button" class="btn sm" id="inviteNew" title="새 코드를 만들면 이전 코드로는 참가할 수 없습니다. 이미 참가한 공략대원은 그대로입니다.">새 코드</button>
       <span class="hint">공략대원은 로그인 후 레이드 참가에서 이 코드를 넣습니다. 가려져 있어도 복사는 됩니다.</span>`
    : `<span class="label">초대 코드</span><span class="hint">아직 없습니다.</span><button type="button" class="btn sm primary" id="inviteNew">코드 만들기</button>`;
}

/* 처음 한 번 실행: 화면 이벤트 연결, 초기값 설정 (js/main.js 가 파일 순서대로 부름) */
export function init(){
     // 헷갈리는 0/O, 1/I 제외
  App.inviteCode = null; App.inviteFor = ''; App.unsubInvite = null; App.kickArm = null;

  document.addEventListener('change', e=>{
    if(e.target.id !== 'inviteShow') return;
    try{ e.target.checked ? localStorage.setItem(INVITE_SHOW_KEY, '1') : localStorage.removeItem(INVITE_SHOW_KEY); }catch(_){}
    render();
  });
  document.addEventListener('click', e=>{
    const id = e.target.id;
    if(id === 'inviteNew'){ guard(async()=>{ await newInvite(); toast('새 초대 코드를 만들었습니다. 이전 코드로는 더 이상 참가할 수 없습니다.'); }); return; }
    if(id === 'inviteCopy'){ const c = App.inviteCode && App.inviteCode.code; if(c) navigator.clipboard.writeText(c).then(()=>toast(`초대 코드 ${c} 복사`), ()=>toast(c)); return; }
    const k = e.target.closest('[data-kick]');
    if(k){
      const name = k.dataset.kick;
      if(App.kickArm !== name){ App.kickArm = name; render(); setTimeout(()=>{ if(App.kickArm === name){ App.kickArm = null; render(); } }, 4000); return; }
      App.kickArm = null;
      guard(async()=>{ await store.partyLog(name, 'kick'); await store.kick(name); toast(useAuth() ? `${name} 님을 내보냈습니다. 같은 코드로 다시 못 들어오게 하려면 새 코드를 만드세요.` : `${name} 님을 공략대에서 내보냈습니다.`); });
    }
  });
  $('joinCode').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); doJoin(); } });
}


export { genCode, newInvite, watchInvite, renderInvite, INVITE_CHARS };
