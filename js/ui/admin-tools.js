/* =====================================================================
   admin-tools.js — 운영자 도구 팝업
   ---------------------------------------------------------------------
   운영자(Firebase admins 에 등록된 계정, 또는 로그인 없는 브라우저 저장 모드)만 보입니다.
   - 레이드 종료: 진행 중인 공략대를 골라 끝내고 레이드 기록에 보관
   - 데이터 지우기: 레이드 기록만 / 진행 중인 공략대만 / 전체 (로그인 프로필과 운영자 등록은 남김)
   ===================================================================== */
import { App } from '@app/core/app.js';
import { $, OVERLAY, esc, fmt, squadLabel, bindModal, openModal } from '@app/core/state.js';
import { guard, store, toast } from '@app/core/store.js';
import { compute } from '@app/core/logic.js';
import { canOperate } from '@app/features/auth.js';
import { eventsOf } from '@app/core/boot.js';
import { summarize, renderHistory, setHistTab } from '@app/ui/history.js';
import { openSetup } from '@app/ui/setup.js';
import { render } from '@app/ui/render.js';

const WIPE_WORD = '초기화';
const WIPE_KIND = {
  history: {btn:'레이드 기록 지우기', done:'레이드 기록을 지웠습니다.'},
  raids:   {btn:'진행 중인 공략대 지우기', done:'진행 중인 공략대를 모두 지웠습니다.'},
  all:     {btn:'전체 초기화', done:'모든 레이드 데이터를 초기화했습니다.'}
};
const wipeKind = ()=>{ const r = document.querySelector('input[name="wipeKind"]:checked'); return r ? r.value : 'history'; };
function renderWipe(){
  const k = wipeKind();
  $('admWipeBtn').textContent = WIPE_KIND[k].btn;
  $('admWipeBtn').disabled = $('admWipeWord').value.trim() !== WIPE_WORD;
}
let endArm = '';

function renderAdminBtn(){
  const show = !OVERLAY && canOperate();
  $('adminBtn').hidden = !show;
  if(!show) $('adminModal').hidden = true;
  else if(!$('adminModal').hidden) renderAdminTools();
}

function renderAdminTools(){
  const ids = Object.keys(App.raids).sort((a,b)=>(App.raids[a].squad||0)-(App.raids[b].squad||0));
  $('admRaids').innerHTML = ids.length ? ids.map(rid=>{
    const r = App.raids[rid], s = compute(r, eventsOf(rid));
    const st = s.status === 'live' ? '진행 중' : s.status === 'clear' ? '성공' : '실패';
    const pct = s.maxHp ? Math.round(s.hp/s.maxHp*1000)/10 : 0;
    return `<li><div><b>${esc(squadLabel(r))}</b> ${esc(r.name || '이름 없는 보스')}<div class="hint">${st} · HP ${pct}% · 공략대원 ${s.members.length}명 · 기록 ${fmt(eventsOf(rid).length)}개</div></div>
      <button type="button" class="btn sm danger${endArm === rid ? ' solid' : ''}" data-endrid="${esc(rid)}">${endArm === rid ? '정말 종료' : '종료'}</button></li>`;
  }).join('') : '<li class="empty">진행 중인 공략대가 없습니다.</li>';
  renderWipe();
}

function endRaid(rid){
  const r = App.raids[rid]; if(!r) return;
  const evs = eventsOf(rid), sum = summarize(r, compute(r, evs), true, evs);
  guard(async()=>{
    await store.reset(sum);
    endArm = ''; App.openHist = sum.raidId; setHistTab('hist'); renderAdminTools();
    toast(`${sum.squadLabel} 레이드를 종료하고 레이드 기록에 보관했습니다.`);
  });
}

/* 처음 한 번 실행: 화면 이벤트 연결, 초기값 설정 (js/main.js 가 파일 순서대로 부름) */
export function init(){
  $('adminBtn').onclick = ()=>{ endArm = ''; $('admWipeWord').value = ''; document.querySelector('input[name="wipeKind"][value="history"]').checked = true; renderAdminTools(); openModal('adminModal', '#adminClose'); };
  bindModal('adminModal', 'adminClose', ()=>{ endArm = ''; });
  $('admRaids').addEventListener('click', e=>{
    const b = e.target.closest('[data-endrid]'); if(!b) return;
    if(!canOperate()){ toast('레이드 종료는 운영자만 할 수 있습니다.'); return; }
    const rid = b.dataset.endrid;
    if(endArm !== rid){ endArm = rid; renderAdminTools(); setTimeout(()=>{ if(endArm === rid){ endArm = ''; if(!$('adminModal').hidden) renderAdminTools(); } }, 5000); return; }
    endRaid(rid);
  });
  $('admWipeWord').addEventListener('input', renderWipe);
  document.querySelectorAll('input[name="wipeKind"]').forEach(r=>r.addEventListener('change', renderWipe));
  $('admWipeBtn').onclick = ()=>{
    if(!canOperate()){ toast('데이터 초기화는 운영자만 할 수 있습니다.'); return; }
    if($('admWipeWord').value.trim() !== WIPE_WORD) return;
    const k = wipeKind();
    guard(async()=>{
      await store.wipe(k);
      App.openHist = null; $('admWipeWord').value = ''; $('adminModal').hidden = true;
      renderHistory(); render();
      if(k !== 'history' && !OVERLAY) openSetup(true);
      toast(WIPE_KIND[k].done);
    });
  };
}

export { renderAdminBtn, renderAdminTools, WIPE_WORD };
