/* =====================================================================
   party.js — 파티 구성: 초대 코드로 참가, 운영자의 내보내기
   ---------------------------------------------------------------------
   로그인 모드(Firebase)에서는 운영자가 레이드를 시작하면 초대 코드가 만들어지고,
   파티원은 그 코드를 넣어야 참가할 수 있습니다. 운영자가 이름을 직접 넣는 기능은 없습니다.
     invites/<mode>        {code, raidId, t}   운영자만 읽고 씀 (코드는 화면에 운영자에게만 보임)
     joins/<mode>/<uid>    참가할 때 넣은 코드   규칙이 invites 의 코드와 같은지 확인
     <mode>/raid/uids/<uid> 참가한 계정 → 이름  코드가 맞아야 쓸 수 있음. 이 목록에 있어야 기록을 남길 수 있음
   브라우저 저장 모드에서는 초대 코드 없이 예전처럼 이름으로 참가합니다.
   ===================================================================== */
const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 헷갈리는 0/O, 1/I 제외
let inviteCode = null, inviteFor = '', unsubInvite = null, kickArm = null;

function genCode(len = 6){
  const a = new Uint32Array(len); crypto.getRandomValues(a);
  return Array.from(a, x=>INVITE_CHARS[x % INVITE_CHARS.length]).join('');
}
async function newInvite(raidId){
  await db.ref('invites/'+ROOM).set({code: genCode(), raidId: raidId || (raid && raid.raidId) || '', t: Date.now()});
}
/* 운영자일 때만 초대 코드를 구독 (운영자가 아니면 규칙상 읽을 수 없음) */
function watchInvite(){
  const want = useAuth() && isAdmin() ? authUser.uid : '';
  if(want === inviteFor) return;
  inviteFor = want; inviteCode = null;
  if(unsubInvite){ unsubInvite(); unsubInvite = null; }
  if(!want) return;
  const ref = db.ref('invites/'+ROOM), h = snap=>{ inviteCode = snap.val(); if(lastState) renderInvite(lastState, myName(lastState)); };
  ref.on('value', h, ()=>{});
  unsubInvite = ()=>ref.off('value', h);
}

function renderInvite(s, me){
  const authed = useAuth();
  $('addMemberRow').hidden = authed;
  $('addHint').hidden = authed;
  watchInvite();
  const box = $('inviteBox');
  const show = authed && isAdmin() && !me && !!raid && s.status === 'live' && !OVERLAY;
  box.hidden = !show;
  if(!show) return;
  const cur = inviteCode && inviteCode.raidId === raid.raidId ? inviteCode.code : '';
  box.innerHTML = cur
    ? `<span class="label">초대 코드</span><b class="code num">${esc(cur)}</b>
       <button type="button" class="btn sm" id="inviteCopy">복사</button>
       <button type="button" class="btn sm" id="inviteNew" title="새 코드를 만들면 이전 코드로는 참가할 수 없습니다. 이미 참가한 파티원은 그대로입니다.">새 코드</button>
       <span class="hint">파티원은 로그인 후 레이드 참가에서 이 코드를 넣습니다.</span>`
    : `<span class="label">초대 코드</span><span class="hint">아직 없습니다.</span><button type="button" class="btn sm primary" id="inviteNew">코드 만들기</button>`;
}

document.addEventListener('click', e=>{
  const id = e.target.id;
  if(id === 'inviteNew'){ guard(async()=>{ await newInvite(); toast('새 초대 코드를 만들었습니다. 이전 코드로는 더 이상 참가할 수 없습니다.'); }); return; }
  if(id === 'inviteCopy'){ const c = inviteCode && inviteCode.code; if(c) navigator.clipboard.writeText(c).then(()=>toast(`초대 코드 ${c} 복사`), ()=>toast(c)); return; }
  const k = e.target.closest('[data-kick]');
  if(k){
    const name = k.dataset.kick;
    if(kickArm !== name){ kickArm = name; render(); setTimeout(()=>{ if(kickArm === name){ kickArm = null; render(); } }, 4000); return; }
    kickArm = null;
    guard(async()=>{ await store.partyLog(name, 'kick'); await store.kick(name); toast(useAuth() ? `${name} 님을 내보냈습니다. 같은 코드로 다시 못 들어오게 하려면 새 코드를 만드세요.` : `${name} 님을 파티에서 내보냈습니다.`); });
  }
});
$('joinCode').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); doJoin(); } });
