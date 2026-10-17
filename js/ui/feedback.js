/* =====================================================================
   feedback.js — 건의 · 문의
   ---------------------------------------------------------------------
   로그인한 사람은 건의·문의를 남기고, 자기가 남긴 내역(상태·운영자 답변)만 봅니다.
   운영자는 모든 사람의 건의·문의를 보고 상태를 바꾸거나 답변을 남깁니다.
     feedback/<uid>/<id>  {kind:'suggest'|'ask', title, body, name, t, status:'new'|'seen'|'done', reply, replyT}
   규칙: 본인은 새로 쓰기와 자기 것 읽기만, 운영자는 전체 읽기·쓰기 (database.rules.json)
   브라우저 저장 모드에서는 이 브라우저(localStorage)에만 저장됩니다.
   ===================================================================== */
import { App } from '@app/core/app.js';
import { $, OVERLAY, esc, bindModal, openModal, now } from '@app/core/state.js';
import { guard, toast } from '@app/core/store.js';
import { isAdmin, login, profileName, useAuth } from '@app/features/auth.js';
import { fmtDate } from '@app/ui/history.js';

const KIND = {suggest:'건의', ask:'문의'};
const STATUS = {new:'접수됨', seen:'확인함', done:'답변 완료'};
const LS_KEY = 'sc-boss-raid:feedback';
let tab = 'write', mine = [], all = [], unsub = null;

const lsGet = () => { try{ return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }catch(_){ return {}; } };
const lsSet = v => { try{ localStorage.setItem(LS_KEY, JSON.stringify(v)); }catch(_){} };
const uid = () => useAuth() ? (App.authUser && App.authUser.uid) : 'local';
const admin = () => useAuth() ? isAdmin() : true;
const toList = (obj, owner) => Object.entries(obj || {}).map(([id, x])=>({...x, id, owner}));

/* 데이터 구독: 운영자는 전체, 그 외에는 내 것만 */
function watch(){
  stop();
  if(!useAuth()){
    const d = lsGet();
    mine = toList(d.local, 'local'); all = mine; render(); return;
  }
  const me = uid(); if(!me) return;
  const ref = admin() ? App.db.ref('feedback') : App.db.ref('feedback/' + me);
  const h = snap=>{
    const v = snap.val() || {};
    if(admin()){ all = Object.entries(v).flatMap(([u, items])=>toList(items, u)); mine = all.filter(x=>x.owner === me); }
    else { mine = toList(v, me); all = []; }
    render();
  };
  ref.on('value', h, ()=>{ toast('건의·문의를 불러오지 못했습니다. (Firebase 규칙 게시가 필요할 수 있습니다)'); });
  unsub = ()=>ref.off('value', h);
}
function stop(){ if(unsub){ unsub(); unsub = null; } }

function card(x, forAdmin){
  const st = x.status || 'new';
  const head = `<header class="fb-head"><span class="fb-kind ${x.kind === 'ask' ? 'ask' : ''}">${esc(KIND[x.kind] || '건의')}</span><b class="fb-title">${esc(x.title || '(제목 없음)')}</b>
    <span class="fb-st st-${st}">${STATUS[st]}</span></header>
    <div class="fb-meta hint">${forAdmin ? `<b>${esc(x.name || '이름 없음')}</b> · ` : ''}${fmtDate(x.t)}</div>`;
  const body = `<div class="fb-body">${esc(x.body || '').replace(/\n/g,'<br>')}</div>`;
  const reply = x.reply ? `<div class="fb-reply"><span class="label" style="margin:0">운영자 답변</span>${esc(x.reply).replace(/\n/g,'<br>')}<span class="hint">${fmtDate(x.replyT)}</span></div>` : '';
  const ctl = forAdmin ? `<div class="fb-ctl" data-fbo="${esc(x.owner)}" data-fbi="${esc(x.id)}">
      <div class="seg small">${Object.entries(STATUS).map(([k,l])=>`<button type="button" data-fbst="${k}" aria-pressed="${st===k}">${l}</button>`).join('')}</div>
      <textarea rows="2" maxlength="1000" placeholder="답변 (선택 · 남긴 사람에게 보입니다)" data-fbreply>${esc(x.reply || '')}</textarea>
      <button type="button" class="btn sm primary" data-fbsave>답변 저장</button></div>` : '';
  return `<article class="fb-card">${head}${body}${reply}${ctl}</article>`;
}

function render(){
  const box = $('fbBody'); if(!box || $('fbModal').hidden) return;
  const isAdm = admin(), tabs = [['write','작성'], ['mine', `내 내역${mine.length ? ' '+mine.length : ''}`]].concat(isAdm && useAuth() ? [['all', `전체 ${all.length}${(n=>n ? ` · 새 ${n}` : '')(all.filter(x=>(x.status||'new')==='new').length)}`]] : []);
  if(!tabs.some(([k])=>k === tab)) tab = 'write';
  $('fbTabs').innerHTML = tabs.map(([k,l])=>`<button type="button" data-fbtab="${k}" aria-pressed="${tab===k}">${l}</button>`).join('');
  // 입력 중이면(답변 작성 등) 목록을 다시 그리지 않음 — 쓰던 글이 지워지지 않게
  if(box.contains(document.activeElement) && /TEXTAREA|INPUT/.test(document.activeElement.tagName)) return;
  if(tab === 'write'){
    box.innerHTML = `<p class="hint" style="margin:0">남긴 내용은 <b>운영자만</b> 볼 수 있습니다. 내가 남긴 건의·문의와 답변은 <b>내 내역</b>에서 확인합니다.</p>
      <div class="fb-form">
        <div class="seg" role="radiogroup" aria-label="종류"><button type="button" data-fbkind="suggest" aria-pressed="true">건의</button><button type="button" data-fbkind="ask" aria-pressed="false">문의</button></div>
        <input type="text" id="fbTitle" maxlength="60" placeholder="제목">
        <textarea id="fbText" rows="6" maxlength="1000" placeholder="내용 (최대 1000자)"></textarea>
        <div class="form-actions" style="margin:0"><button type="button" class="btn primary" id="fbSend">보내기</button><span class="hint" id="fbCount">0 / 1000</span></div>
      </div>`;
    return;
  }
  const list = (tab === 'all' ? all : mine).slice().sort((a,b)=>(b.t||0)-(a.t||0));
  box.innerHTML = list.length ? list.map(x=>card(x, tab === 'all')).join('') : `<p class="empty">${tab === 'all' ? '아직 들어온 건의·문의가 없습니다.' : '아직 남긴 건의·문의가 없습니다.'}</p>`;
}

function send(){
  const kind = (document.querySelector('[data-fbkind][aria-pressed="true"]') || {}).dataset?.fbkind || 'suggest';
  const title = String($('fbTitle').value || '').trim().slice(0, 60), body = String($('fbText').value || '').trim().slice(0, 1000);
  if(!body){ toast('내용을 입력하세요.'); $('fbText').focus(); return; }
  const item = {kind, title, body, t: now(), status: 'new', name: (useAuth() ? profileName() : App.meName) || '이름 없음'};
  guard(async()=>{
    if(!useAuth()){ const d = lsGet(); d.local = d.local || {}; d.local['l' + now().toString(36)] = item; lsSet(d); watch(); }
    else await App.db.ref('feedback/' + uid()).push(item);
    tab = 'mine'; render(); toast(`${KIND[kind]}을 보냈습니다. 운영자가 확인하면 내 내역에 상태가 바뀝니다.`);
  });
}

async function update(owner, id, patch){
  if(!useAuth()){ const d = lsGet(); if(d[owner] && d[owner][id]){ Object.assign(d[owner][id], patch); lsSet(d); watch(); } return; }
  await App.db.ref(`feedback/${owner}/${id}`).update(patch);
}

function open(){
  if(useAuth() && !App.authUser){ toast('로그인하면 건의·문의를 남길 수 있습니다.'); login(); return; }
  tab = 'write';
  openModal('fbModal', '#fbClose');
  watch(); render();
}
function renderFbBtn(){ const b = $('fbBtn'); if(b) b.hidden = OVERLAY; }

/* 처음 한 번 실행 (js/main.js 가 파일 순서대로 부름) */
export function init(){
  renderFbBtn();
  $('fbBtn').onclick = open;
  bindModal('fbModal', 'fbClose', stop);
  $('fbModal').addEventListener('click', e=>{
    const t = e.target.closest('[data-fbtab]'); if(t){ tab = t.dataset.fbtab; if(document.activeElement) document.activeElement.blur(); render(); return; }
    const k = e.target.closest('[data-fbkind]'); if(k){ document.querySelectorAll('[data-fbkind]').forEach(b=>b.setAttribute('aria-pressed', b === k)); return; }
    if(e.target.id === 'fbSend'){ send(); return; }
    const ctl = e.target.closest('.fb-ctl'); if(!ctl) return;
    const owner = ctl.dataset.fbo, id = ctl.dataset.fbi;
    const st = e.target.closest('[data-fbst]');
    if(st){ guard(()=>update(owner, id, {status: st.dataset.fbst})); return; }
    if(e.target.closest('[data-fbsave]')){
      const reply = String(ctl.querySelector('[data-fbreply]').value || '').trim().slice(0, 1000);
      guard(async()=>{ await update(owner, id, reply ? {reply, replyT: now(), status: 'done'} : {reply: null, replyT: null}); toast(reply ? '답변을 저장했습니다.' : '답변을 지웠습니다.'); });
    }
  });
  $('fbModal').addEventListener('input', e=>{ if(e.target.id === 'fbText') $('fbCount').textContent = `${e.target.value.length} / 1000`; });
}

export { open as openFeedback };
