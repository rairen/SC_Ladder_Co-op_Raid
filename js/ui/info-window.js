/* =====================================================================
   info-window.js — 정보 창(보스 스킬, 역할 스킬, 장비, 룰렛, 규칙)과 시작 전 수치 설정
   ===================================================================== */
/* ---------- Skill list window ---------- */
/* 정보 창은 두 가지로 열립니다.
   info  : 보스 영역의 정보 버튼. 진행 중인 레이드 값을 보여주기만 함
   setup : 새 레이드 만들기의 '수치 설정'. 시작 전 값만 고칠 수 있고, 레이드를 시작하면 잠김 */
import { App } from '@app/core/app.js';
import { BOSS_BY_RACE, BOSS_SETS, DEFAULT_GAUGE, DEFAULT_GEAR_ROLL, DEFAULT_ROLE_SKILLS, GEAR_GRADES, ITEMS, PARTY_HP, PARTY_SKILL_PLAN, PRESETS, RACES, REVIVE_HP, ROLES, ROULETTE_PLAN, SKILL_TYPES, TIERS } from '@app/core/game-data.js';
import { $, OVERLAY, esc, fmt } from '@app/core/state.js';
import { guard, toast } from '@app/core/store.js';
import { bossHpOf, bossSkillsOf, gaugeOf, gearRollList, roleSkillsOf, settingsOf } from '@app/core/logic.js';
import { updateSetupPreview } from '@app/ui/setup.js';
import { rouletteWeights } from '@app/features/actions.js';

function SRC(){ return App.modalMode === 'setup' ? App.setupSrc : App.raid; }
function freshSetupSrc(){
  const race = $('bossRace').value || 'mixed';
  return {name: $('raidName').value.trim() || '새 보스', race, bossSkills: BOSS_SETS[race].map(x=>({...x})), roleSkills:null, gauge:null, settings:null, customBoss:false};
}
async function saveSrc(patch){
  if(App.modalMode !== 'setup' || !App.setupSrc) return;
  if(patch.bossSkills) App.setupSrc.customBoss = true;
  Object.assign(App.setupSrc, patch);
}
function canEditSkills(){ return App.modalMode === 'setup' && !!App.setupSrc && !App.readOnly && !OVERLAY; }
function pct(w, list){ const t = list.reduce((a,x)=>a+Math.max(0,Number(x.w)||0),0); return t ? Math.round(Math.max(0,Number(w)||0)/t*1000)/10 : 0; }
function openSkillModal(mode, tab){
  App.modalMode = mode || 'info';
  if(App.modalMode === 'setup' && !App.setupSrc) App.setupSrc = freshSetupSrc();
  App.skDirty = false; App.setDirty = false; App.bsDraft = App.rsDraft = App.gDraft = App.setDraft = null;
  $('skillModalTitle').textContent = App.modalMode === 'setup' ? '레이드 수치 설정 (시작 전)' : (App.raid ? '레이드 정보' : '기본 정보');
  $('skillModal').querySelector('[data-sktab="settings"]').textContent = App.modalMode === 'setup' ? '승리·룰렛 설정' : '승리·룰렛 수치';
  $('skillModal').hidden = false;
  const tb = $('skillModal').querySelector(`[data-sktab="${tab || (App.modalMode === 'setup' ? 'boss' : App.skTab)}"]`);
  if(tb) tb.click(); else renderSkillModal();
  $('skillClose').focus();
}
function closeSkillModal(){ $('skillModal').hidden = true; App.skDirty = false; }
function clearTime(p, c){
  const n = Math.max(1, c.n), perHr = 60 / Math.max(1, c.min), wr = c.wr/100;
  const hpT = bossHpOf(p, n);
  const g = n * perHr * wr * c.pts * c.mult;
  const h = g - n * perHr * (1-wr) * c.loss * (p.rec/100);
  if(g <= 0 || h <= 0) return {hp:hpT, time:null, skills:null};
  const t = hpT/2/g + hpT/2/h;
  return {hp:hpT, time:t, skills: g * t * (p.rageRate ?? 0.5) / p.rage};
}
function fmtHours(t){ if(t == null) return '클리어 어려움'; const m = Math.round(t*60); return m >= 60 ? `${Math.floor(m/60)}시간 ${m%60}분` : `${m}분`; }
function renderRulesTab(){
  const box = $('skTabRules'); if(box.hidden) return;
  const G = gaugeOf(SRC()), S = settingsOf(SRC());
  const rows = ['light','normal','hard'].map(k=>{ const p = PRESETS[k], r = clearTime(p, App.calcIn);
    return `<tr><td><b>${p.label}</b></td><td class="r num">${p.hp}</td><td class="r num">${p.bonus}</td><td class="r num">${p.rage}</td><td class="r num">${p.rageRate}</td><td class="r num">${p.rec}%</td>
      <td class="r num hl">${fmt(r.hp)}</td><td class="r hl">${fmtHours(r.time)}</td><td class="r num">${r.skills==null?'-':(Math.round(r.skills*10)/10)+'회'}</td></tr>`; }).join('');
  const inp = (k,label,step,suffix) => `<div class="field"><label class="label" for="ci_${k}">${label}</label><input type="number" id="ci_${k}" data-ci="${k}" min="0" step="${step}" value="${App.calcIn[k]}">${suffix?`<span class="hint">${suffix}</span>`:''}</div>`;
  const perHr = 60/Math.max(1,App.calcIn.min), avgG = (G.win*App.calcIn.wr + G.loss*(100-App.calcIn.wr))/100;
  box.innerHTML = `<p class="sk-note">보스 HP = 1인당 HP × 인원 + 인원당 추가 HP × (인원 − 1). 분노는 보스가 받은 데미지 × 상승률만큼 오르고, 최대치에 닿으면 보스 스킬이 나갑니다.</p>
    <h3 class="label" style="margin:4px 0 0">클리어 시간 계산 가정 (이 화면에서만 쓰는 값)</h3>
    <div class="calc-in">${inp('n','공략대 인원',1,'')}${inp('min','한 판 시간(분)',1,'')}${inp('wr','승률(%)',5,'')}${inp('pts','평균 승리 점수',1,'')}${inp('loss','평균 패배 점수',1,'')}${inp('mult','승리 보너스 배율',0.1,'')}</div>
    <div class="tbl-wrap"><table class="sk-table"><thead><tr><th>난이도</th><th class="r">1인당 HP</th><th class="r">인원당 추가</th><th class="r">분노 최대</th><th class="r">분노 상승률</th><th class="r">보스 회복률</th><th class="r">보스 총 HP</th><th class="r">예상 클리어</th><th class="r">예상 보스 스킬</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="sk-note">룰렛, 체인 보너스, 역할 스킬 때문에 실제로는 조금 더 빨리 끝납니다. 역할 스킬은 평균 ${Math.round(G.max / Math.max(1,avgG) * 10)/10}판(약 ${fmtHours(G.max/Math.max(1,avgG)/perHr)})에 한 번 쓸 수 있습니다.</p>
    <h3 class="label" style="margin:4px 0 0">기본 규칙 수치</h3>
    <div class="tbl-wrap"><table class="sk-table"><tbody>
      <tr><td><b>공략대원 기본 체력</b></td><td class="r num">${PARTY_HP}</td><td class="desc">갑옷 보너스가 더해짐. 0이 되면 전투불능</td></tr>
      <tr><td><b>부활 체력</b></td><td class="r num">${REVIVE_HP}</td><td class="desc">전투불능 상태에서 승리하거나 불사의 목걸이 발동 시</td></tr>
      <tr><td><b>보스 회복 시작</b></td><td class="r num">50%</td><td class="desc">보스 HP가 이 아래면 패배 점수 × 회복률만큼 보스 회복</td></tr>
      <tr><td><b>체인 보너스</b></td><td class="r num">${S.chain}%</td><td class="desc">서로 다른 3명 연속 승리 시 보스 최대 HP 대비 추가 데미지</td></tr>
      <tr><td><b>역할 스킬 게이지</b></td><td class="r num">${G.max}</td><td class="desc">시작 ${G.start}, 승리 +${G.win}, 패배 +${G.loss}, 마나 포션 +${S.potions.mp.v}</td></tr>
      <tr><td><b>성공 / 실패</b></td><td class="r">-</td><td class="desc">보스 HP 0 / 공략대 전원 전투불능</td></tr>
    </tbody></table></div>
    <h3 class="label" style="margin:4px 0 0">보스 이름과 종족</h3>
    <div class="tbl-wrap"><table class="sk-table"><thead><tr><th>종족</th><th>보스 이름</th><th>스킬 세트</th></tr></thead><tbody>
      ${Object.entries(BOSS_BY_RACE).map(([k,list])=>`<tr><td><b>${RACES[k]}</b></td><td>${list.map(esc).join(', ')}</td><td class="desc">${BOSS_SETS[k].map(x=>esc(x.name)).join(', ')}</td></tr>`).join('')}
      <tr><td><b>${RACES.mixed}</b></td><td class="desc">목록에 없는 이름</td><td class="desc">${BOSS_SETS.mixed.map(x=>esc(x.name)).join(', ')}</td></tr>
    </tbody></table></div>`;
}

/* ---------- 룰렛 탭 ---------- */
function renderRouletteTab(){
  const box = $('skTabRoulette'); if(box.hidden) return;
  const ws = rouletteWeights(settingsOf(SRC())), tot = ws.reduce((a,x)=>a+x.w,0) || 1;
  box.innerHTML = `<p class="sk-note">룰렛 결과입니다. 확률은 레이드 설정 탭의 비중으로 정해집니다. "다음 판" 효과는 룰렛을 돌린 공략대원의 다음 래더 결과에 적용되고, 겹치면 마지막 것만 남습니다.</p>
    <div class="tbl-wrap"><table class="sk-table"><thead><tr><th>등급</th><th>결과</th><th>적용</th><th class="r">확률</th></tr></thead><tbody>
      ${ws.map(x=>`<tr><td class="tier-${x.it.tier}" style="color:var(--tc)"><b>${x.it.tier}</b></td><td>${esc(x.it.name)}</td><td class="desc">${x.it.next ? '다음 판' : '즉시'}</td><td class="r num">${Math.round(x.w/tot*1000)/10}%</td></tr>`).join('')}
    </tbody></table></div>`;
}

function renderSkillModal(){
  const edit = canEditSkills();
  $('skTabBoss').hidden = App.skTab !== 'boss'; $('skTabRole').hidden = App.skTab !== 'role'; $('skTabGear').hidden = App.skTab !== 'gear'; $('skTabSettings').hidden = App.skTab !== 'settings'; $('skTabRules').hidden = App.skTab !== 'rules'; $('skTabRoulette').hidden = App.skTab !== 'roulette';
  renderRulesTab(); renderRouletteTab();
  const race = (SRC() && SRC().race) || 'mixed';
  // 보스 스킬
  const list = App.bsDraft || bossSkillsOf(SRC()).map(x=>({...x}));
  const typeOpts = v => Object.entries(SKILL_TYPES).map(([k,t])=>`<option value="${k}"${k===v?' selected':''}>${t.label}</option>`).join('');
  $('skTabBoss').innerHTML = `<p class="sk-note">${SRC() ? `<b>${esc(SRC().name)}</b> (${RACES[race]})의 스킬입니다. ` : '레이드를 시작하면 보스 종족에 맞는 스킬 세트가 들어갑니다. 아래는 혼합 세트입니다. '}분노 게이지가 가득 차면 비중에 따라 하나가 무작위로 발동합니다.</p>
    <div class="tbl-wrap"><table class="sk-table"><thead><tr><th>스킬 이름</th><th>종류</th><th class="r">비중</th><th class="r">확률</th><th class="r">수치</th><th>효과</th>${edit?'<th></th>':''}</tr></thead><tbody>
    ${list.map((x,i)=> edit
      ? `<tr><td><input type="text" maxlength="16" value="${esc(x.name)}" data-bs="${i}" data-k="name" aria-label="스킬 이름"></td>
          <td><select data-bs="${i}" data-k="type" aria-label="종류">${typeOpts(x.type)}</select></td>
          <td class="r"><input type="number" min="0" step="1" value="${x.w}" data-bs="${i}" data-k="w" aria-label="비중"></td>
          <td class="r num">${pct(x.w, list)}%</td>
          <td class="r"><input type="number" min="0" step="${x.type==='curse'?'0.1':'1'}" value="${x.v}" data-bs="${i}" data-k="v" aria-label="수치"></td>
          <td class="desc">${esc((SKILL_TYPES[x.type]||SKILL_TYPES.smash).desc(x.v))}</td>
          <td><button type="button" class="btn danger" data-bsdel="${i}" aria-label="${esc(x.name)} 삭제">삭제</button></td></tr>`
      : `<tr><td><b>${esc(x.name)}</b></td><td>${esc((SKILL_TYPES[x.type]||{label:'-'}).label)}</td><td class="r num">${x.w}</td><td class="r num">${pct(x.w, list)}%</td><td class="r num">${x.v}</td><td class="desc">${esc((SKILL_TYPES[x.type]||SKILL_TYPES.smash).desc(x.v))}</td></tr>`
    ).join('')}</tbody></table></div>
    ${edit ? `<div class="sk-actions"><button type="button" class="btn" id="bsAdd">스킬 추가</button>
      <select id="bsPreset" aria-label="기본 세트">${Object.entries(RACES).map(([k,v])=>`<option value="${k}"${k===race?' selected':''}>${v} 기본 세트</option>`).join('')}</select>
      <button type="button" class="btn" id="bsReset">이 세트로 되돌리기</button>
      <span style="flex:1"></span><button type="button" class="btn primary" id="bsSave"${App.skDirty?'':' disabled'}>적용</button></div>
      <p class="sk-note">적용한 값은 레이드를 시작할 때 들어가고, 시작한 뒤에는 바꿀 수 없습니다.</p>`
      : '<p class="lock-note">수치는 새 레이드 만들기의 <b>수치 설정</b>에서 시작 전에만 바꿀 수 있습니다.</p>'}`;
  // 역할 스킬
  const rs = App.rsDraft || roleSkillsOf(SRC()), G = App.gDraft || gaugeOf(SRC());
  $('skTabRole').innerHTML = `<p class="sk-note">공략대원은 역할마다 스킬 하나를 가집니다. 스킬 게이지가 가득 차면 <b>스킬 사용</b>으로 씁니다. 게이지는 승리·패배할 때마다 찹니다. 지참금을 많이 받을수록 필요 게이지가 줄어듭니다 (필요 게이지 = 최대 − 지참금 × 계수, 계수는 레이드 설정 탭).</p>
    <div class="tbl-wrap"><table class="sk-table"><thead><tr><th>역할</th><th>스킬 이름</th><th class="r">수치</th><th>효과</th></tr></thead><tbody>
    ${Object.entries(ROLES).map(([k,R])=> edit
      ? `<tr><td><span class="role-tag ${k}">${R.short}</span>${R.label}</td><td><input type="text" maxlength="16" value="${esc(rs[k].name)}" data-rs="${k}" data-k="name" aria-label="${R.label} 스킬 이름"></td>
          <td class="r"><input type="number" min="0" step="1" value="${rs[k].v}" data-rs="${k}" data-k="v" aria-label="${R.label} 수치"></td><td class="desc">${esc(R.desc(rs[k].v))}</td></tr>`
      : `<tr><td><span class="role-tag ${k}">${R.short}</span>${R.label}</td><td><b>${esc(rs[k].name)}</b></td><td class="r num">${rs[k].v}</td><td class="desc">${esc(R.desc(rs[k].v))}</td></tr>`).join('')}
    </tbody></table></div>
    <h3 class="label" style="margin:6px 0 0">스킬 게이지</h3>
    <div class="tbl-wrap"><table class="sk-table"><thead><tr><th>최대</th><th>기본 시작값</th><th>승리 시 충전</th><th>패배 시 충전</th></tr></thead><tbody><tr>
    ${['max','start','win','loss'].map(k=> edit ? `<td><input type="number" min="0" step="5" value="${G[k]}" data-g="${k}" aria-label="게이지 ${k}"></td>` : `<td class="num">${G[k]}</td>`).join('')}
    </tr></tbody></table></div>
    ${edit ? `<div class="sk-actions"><button type="button" class="btn" id="rsReset">기본값으로 되돌리기</button><span style="flex:1"></span><button type="button" class="btn primary" id="rsSave"${App.skDirty?'':' disabled'}>적용</button></div>` : ''}`;
  // 지참금·장비
  // 지참금·장비 (설정값 사용, 운영자는 수정)
  const SD = App.setDraft || settingsOf(SRC());
  const gearInfo = {
    weapon:   {title:'무기',   unit:'%', show:v=> v ? `승리 데미지 +${Math.round(v*100)}%` : '기본', pctv:true},
    armor:    {title:'갑옷',   unit:'',  show:v=> v ? `최대 체력 +${v}` : '기본'},
    accessory:{title:'장신구', unit:'%', show:(v,i)=> i===1 ? `내 공격으로 오르는 분노 −${Math.round(v*100)}%` : i===2 ? `1회용, 쓰러질 때 체력 ${REVIVE_HP}(등급 배율 적용)으로 버팀` : '-', pctv:true}
  };
  $('skTabGear').innerHTML = `<p class="sk-note"><b>초기 지참금</b>은 참가할 때 가져온 별풍선이고, 레이드 중에 받은 별풍선은 내 정보의 <b>추가 지원금</b>으로 더합니다. 지참금은 장비 룰렛, 장비 수리, 소모품 구매에 씁니다. <b>장비와 남은 소모품은 레이드가 끝나도 계속 가지고</b> 다음 레이드에 참가할 때 그대로 가져갑니다(내구도 포함). 장비는 <b>장비 룰렛</b>으로 얻습니다. 한 번 돌릴 때마다 남은 지참금에서 비용을 내고, 아래 확률로 장비 하나와 <b>등급</b>이 나옵니다. 얻은 장비는 인벤토리에 쌓이고, 지금 것보다 좋으면 바로 장착합니다. 등급이 높을수록 능력치가 조금 높고 내구도가 깁니다. 무기·평온의 부적은 내 승리 공격마다, 갑옷은 보스에게 맞을 때마다 내구도가 1씩 줄고, 불사의 목걸이는 한 번 발동하면 부서집니다. 부서지면 인벤토리의 다음 장비를 자동으로 착용합니다.${edit ? ' 비용, 확률 비중, 수치를 고친 뒤 저장하면 이 레이드에 바로 적용됩니다.' : ''}</p>
    ${(()=>{ const gl = gearRollList(SD), gt = gl.reduce((a,x)=>a+x.w,0) || 1; return `<div class="tbl-wrap"><table class="sk-table"><tbody><tr><td><b>장비 룰렛 1회 비용</b></td><td class="r">${edit ? `<input type="number" min="0" step="10" value="${SD.gearCost}" data-sp="gearCost" aria-label="장비 룰렛 비용">` : `<span class="num">${fmt(SD.gearCost)}개</span>`}</td><td class="desc">남은 지참금에서 빠집니다</td></tr><tr><td><b>꽝</b></td><td class="r">${edit ? `<input type="number" min="0" step="1" value="${SD.gearRoll.none}" data-gr="none" aria-label="꽝 비중">` : `<span class="num">${SD.gearRoll.none}</span>`}</td><td class="desc" data-grp="none">${Math.round((gl.find(x=>x.key==='none').w)/gt*1000)/10}%</td></tr></tbody></table></div>`; })()}
    ${(()=>{ const gs = GEAR_GRADES.map((g,i)=>({...g, ...SD.grades[i]})), gt = gs.reduce((a,x)=>a+(Number(x.w)||0),0) || 1;
      const inp = (i,k,val,step,label) => edit ? `<input type="number" min="0" step="${step}" value="${val}" data-gd="${i}" data-gk="${k}" aria-label="${label}">` : `<span class="num">${val}</span>`;
      return `<div class="tbl-wrap"><table class="sk-table"><thead><tr><th>등급</th><th class="r">확률 비중</th><th class="r">내구도</th><th class="r">능력치 (%)</th><th class="r">수리 비용</th><th>예시</th></tr></thead><tbody>
      ${gs.map((g,i)=>`<tr><td class="gr-${g.id}"><b>${g.label}</b></td><td class="r">${inp(i,'w',g.w,1,g.label+' 비중')} <span class="hint" data-gdp="${i}">${Math.round((Number(g.w)||0)/gt*1000)/10}%</span></td><td class="r">${inp(i,'dur',g.dur,1,g.label+' 내구도')}</td><td class="r">${inp(i,'stat',Math.round(g.stat*100),1,g.label+' 능력치')}</td><td class="r">${inp(i,'repair',g.repair ?? GEAR_GRADES[i].repair,5,g.label+' 수리 비용')}</td><td class="desc">강철 검 +${Math.round(SD.gear.weapon[1].v*g.stat*100)}% · 사슬 갑옷 +${Math.round(SD.gear.armor[1].v*g.stat)} · ${g.dur}회</td></tr>`).join('')}
      </tbody></table></div>`; })()}
    <h3 class="label" style="margin:4px 0 0">소모품</h3>
    <div class="tbl-wrap"><table class="sk-table"><thead><tr><th>소모품</th><th class="r">가격</th><th>효과</th></tr></thead><tbody>
      ${Object.values(SD.potions).map(p=>`<tr><td><b>${esc(p.name)}</b></td><td class="r num">${fmt(p.cost)}</td><td class="desc">${esc(p.unit)} +${fmt(p.v)} · 내 정보에서 사서 아무 때나 사용 (전투불능일 때는 못 씀)</td></tr>`).join('')}
    </tbody></table></div>
    ${Object.entries(gearInfo).map(([k,info])=>`<div class="tbl-wrap"><table class="sk-table"><thead><tr><th>${info.title}</th><th class="r">확률 비중</th><th class="r">수치${info.unit?' ('+info.unit+')':''}</th><th>효과</th></tr></thead><tbody>
      ${SD.gear[k].map((x,i)=>{
        const fixedV = (k==='accessory' && i!==1) || (i===0 && k!=='gauge');
        const vShown = info.pctv ? Math.round(x.v*100) : x.v;
        return `<tr><td><b>${esc(x.name || (k==='gauge' ? (i===0?'기본':'단계 '+i) : ''))}</b></td>
          <td class="r">${i===0 ? '<span class="hint">기본 장비</span>' : (edit ? `<input type="number" min="0" step="1" value="${SD.gearRoll[k+':'+i]}" data-gr="${k}:${i}" aria-label="${info.title} 확률 비중">` : `<span class="num">${SD.gearRoll[k+':'+i]}</span>`) + ` <span class="hint" data-grp="${k}:${i}">${(()=>{ const gl = gearRollList(SD), gt = gl.reduce((a,y)=>a+y.w,0) || 1; return Math.round((Number(SD.gearRoll[k+':'+i])||0)/gt*1000)/10; })()}%</span>`}</td>
          <td class="r">${edit && !fixedV ? `<input type="number" min="0" step="1" value="${vShown}" data-gs="${k}" data-gi="${i}" data-gk="v" aria-label="${info.title} 수치">` : `<span class="num">${fixedV && k==='accessory' ? '-' : vShown}</span>`}</td>
          <td class="desc">${esc(info.show(x.v, i))}</td></tr>`; }).join('')}
    </tbody></table></div>`).join('')}
    ${edit ? `<div class="sk-actions"><button type="button" class="btn" data-setreset="gear">기본값으로 되돌리기</button><span style="flex:1"></span><button type="button" class="btn primary" data-setsave="1"${App.setDirty?'':' disabled'}>적용</button></div>` : ''}`;
  // 레이드 설정: 체인 보너스, 지참금 게이지, 룰렛 비중
  const ws = ITEMS.map(it=>({it, w: Math.max(0, Number(SD.roulette[it.id])||0)})), wt = ws.reduce((a,x)=>a+x.w,0) || 1;
  const num = (path, val, step, label) => edit ? `<input type="number" min="0" step="${step}" value="${val}" data-sp="${path}" aria-label="${label}">` : `<span class="num">${val}</span>`;
  $('skTabSettings').innerHTML = `<p class="sk-note">${edit ? '이번 레이드에 쓸 값입니다. 적용한 뒤 레이드를 시작하면 고정됩니다.' : (App.raid ? '이 레이드에 고정된 값입니다. 다음 레이드의 수치 설정에서 바꿀 수 있습니다.' : '기본값입니다. 새 레이드 만들기의 수치 설정에서 바꿀 수 있습니다.')}</p>
    <h3 class="label" style="margin:4px 0 0">체인 보너스</h3>
    <div class="tbl-wrap"><table class="sk-table"><tbody><tr><td><b>서로 다른 3명 연속 승리</b></td><td class="r">${num('chain', SD.chain, 0.5, '체인 보너스')}</td><td class="desc">보스 최대 HP의 % 만큼 추가 데미지</td></tr></tbody></table></div>
    <h3 class="label" style="margin:4px 0 0">패배 피해</h3>
    <div class="tbl-wrap"><table class="sk-table"><tbody><tr><td><b>패배 피해 배율</b></td><td class="r">${num('lossDmg', SD.lossDmg, 0.1, '패배 피해 배율')}</td><td class="desc">래더에서 지면 잃은 점수 × 이 값만큼 그 공략대원 체력이 줄어듭니다. 예: −20점 × ${SD.lossDmg} = 체력 −${Math.round(20*SD.lossDmg)}. 0이면 피해 없음</td></tr></tbody></table></div>
    <h3 class="label" style="margin:4px 0 0">룰렛 확률</h3>
    <div class="tbl-wrap"><table class="sk-table"><thead><tr><th>등급</th><th>결과</th><th class="r">비중</th><th class="r">확률</th></tr></thead><tbody>
      ${ws.map(x=>`<tr><td class="tier-${x.it.tier}" style="color:var(--tc)"><b>${x.it.tier}</b></td><td>${esc(x.it.name)}</td><td class="r">${num('roulette.'+x.it.id, x.w, 0.5, x.it.name+' 비중')}</td><td class="r num" data-rp="${x.it.id}">${Math.round(x.w/wt*1000)/10}%</td></tr>`).join('')}
    </tbody></table></div>
    ${edit ? `<div class="sk-actions"><button type="button" class="btn" data-setreset="settings">기본값으로 되돌리기</button><span style="flex:1"></span><button type="button" class="btn primary" data-setsave="1"${App.setDirty?'':' disabled'}>적용</button></div>` : ''}`;
}

/* 처음 한 번 실행: 화면 이벤트 연결, 초기값 설정 (js/main.js 가 파일 순서대로 부름) */
export function init(){

  App.modalMode = 'info'; App.setupSrc = null;
  App.skTab = 'boss'; App.skDirty = false; App.bsDraft = null; App.rsDraft = null; App.gDraft = null; App.setDraft = null; App.setDirty = false;
  document.addEventListener('click', e=>{ const b = e.target.closest('[data-info]'); if(b) openSkillModal('info', b.dataset.info); });
  $('setupNums').onclick = ()=>openSkillModal('setup', 'boss');
  $('skillClose').onclick = closeSkillModal;
  $('skillModal').addEventListener('click', e=>{ if(e.target.id === 'skillModal') closeSkillModal(); });
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && !$('skillModal').hidden) closeSkillModal(); });
  $('skillModal').querySelector('[role=tablist]').addEventListener('click', e=>{
    const b = e.target.closest('[data-sktab]'); if(!b) return;
    App.skTab = b.dataset.sktab;
    $('skillModal').querySelectorAll('[data-sktab]').forEach(x=>x.setAttribute('aria-pressed', x===b));
    renderSkillModal();
  });
  /* ---------- 규칙·난이도 탭 (구글 시트 내용) ---------- */
  App.calcIn = {min:20, wr:50, pts:20, loss:20, mult:1.2, n:2};
  try{ Object.assign(App.calcIn, JSON.parse(localStorage.getItem('sc-boss-raid:calc') || '{}')); }catch(_){}
  $('skillModal').addEventListener('input', e=>{
    const k = e.target.dataset && e.target.dataset.ci; if(!k) return;
    App.calcIn[k] = Math.max(0, Number(e.target.value)||0);
    try{ localStorage.setItem('sc-boss-raid:calc', JSON.stringify(App.calcIn)); }catch(_){}
    const id = e.target.id, pos = e.target.selectionStart; renderRulesTab();
    const el = $(id); if(el){ el.focus(); try{ el.setSelectionRange(pos,pos); }catch(_){} }
  });
  $('skillModal').addEventListener('input', e=>{
    const t = e.target;
    if(t.dataset.gr !== undefined){
      App.setDraft = App.setDraft || JSON.parse(JSON.stringify(settingsOf(SRC())));
      App.setDraft.gearRoll[t.dataset.gr] = Math.max(0, Number(t.value)||0);
      const tot = Object.values(App.setDraft.gearRoll).reduce((a,b)=>a+(Number(b)||0),0) || 1;
      $('skTabGear').querySelectorAll('[data-grp]').forEach(c=>{ c.textContent = Math.round((Number(App.setDraft.gearRoll[c.dataset.grp])||0)/tot*1000)/10 + '%'; });
      App.setDirty = true; $('skillModal').querySelectorAll('[data-setsave]').forEach(b=>b.disabled = false);
      return;
    }
    if(t.dataset.gd !== undefined){
      App.setDraft = App.setDraft || JSON.parse(JSON.stringify(settingsOf(SRC())));
      const row = App.setDraft.grades[+t.dataset.gd], val = Math.max(0, Number(t.value)||0);
      if(t.dataset.gk === 'stat') row.stat = val/100; else if(t.dataset.gk === 'dur') row.dur = Math.max(1, Math.round(val)); else if(t.dataset.gk === 'repair') row.repair = Math.round(val); else row.w = val;
      const tot = App.setDraft.grades.reduce((a,x)=>a+(Number(x.w)||0),0) || 1;
      $('skTabGear').querySelectorAll('[data-gdp]').forEach(c=>{ c.textContent = Math.round((Number(App.setDraft.grades[+c.dataset.gdp].w)||0)/tot*1000)/10 + '%'; });
      App.setDirty = true; $('skillModal').querySelectorAll('[data-setsave]').forEach(b=>b.disabled = false);
      return;
    }
    if(t.dataset.sp !== undefined || t.dataset.gs !== undefined){
      App.setDraft = App.setDraft || JSON.parse(JSON.stringify(settingsOf(SRC())));
      const val = Math.max(0, Number(t.value)||0);
      if(t.dataset.sp){
        const [a,b] = t.dataset.sp.split('.');
        if(b) App.setDraft[a][b] = val; else App.setDraft[a] = val;
        if(a === 'roulette'){ const tot = Object.values(App.setDraft.roulette).reduce((x,y)=>x+(Number(y)||0),0) || 1; $('skTabSettings').querySelectorAll('[data-rp]').forEach(c=>{ c.textContent = Math.round((Number(App.setDraft.roulette[c.dataset.rp])||0)/tot*1000)/10 + '%'; }); }
      } else {
        const row = App.setDraft.gear[t.dataset.gs][+t.dataset.gi];
        if(t.dataset.gk === 'min') row.min = Math.round(val);
        else row.v = (t.dataset.gs === 'weapon' || t.dataset.gs === 'accessory') ? val/100 : Math.round(val);
      }
      App.setDirty = true;
      $('skillModal').querySelectorAll('[data-setsave]').forEach(b=>b.disabled = false);
      return;
    }
    if(t.dataset.bs !== undefined){
      App.bsDraft = App.bsDraft || bossSkillsOf(SRC()).map(x=>({...x}));
      const row = App.bsDraft[+t.dataset.bs], k = t.dataset.k;
      row[k] = (k==='w' || k==='v') ? Math.max(0, Number(t.value)||0) : t.value;
      App.skDirty = true;
      const tr = t.closest('tr');
      tr.querySelector('.desc').textContent = (SKILL_TYPES[row.type]||SKILL_TYPES.smash).desc(row.v);
      $('skTabBoss').querySelectorAll('tbody tr').forEach((r,i)=>{ const c = r.children[3]; if(c) c.textContent = pct(App.bsDraft[i].w, App.bsDraft)+'%'; });
      $('bsSave').disabled = false;
    } else if(t.dataset.rs !== undefined){
      App.rsDraft = App.rsDraft || roleSkillsOf(SRC());
      const k = t.dataset.k; App.rsDraft[t.dataset.rs][k] = k==='v' ? Math.max(0, Number(t.value)||0) : t.value;
      t.closest('tr').querySelector('.desc').textContent = ROLES[t.dataset.rs].desc(App.rsDraft[t.dataset.rs].v);
      App.skDirty = true; $('rsSave').disabled = false;
    } else if(t.dataset.g !== undefined){
      App.gDraft = App.gDraft || gaugeOf(SRC()); App.gDraft[t.dataset.g] = Math.max(0, Math.round(Number(t.value)||0));
      App.skDirty = true; $('rsSave').disabled = false;
    }
  });
  $('skillModal').addEventListener('change', e=>{ if(e.target.dataset.k === 'type'){ renderSkillModal(); } });
  $('skillModal').addEventListener('click', e=>{
    const id = e.target.id;
    const sr = e.target.closest('[data-setreset]');
    if(sr){
      App.setDraft = App.setDraft || JSON.parse(JSON.stringify(settingsOf(SRC())));
      const D = JSON.parse(JSON.stringify(settingsOf(null)));
      if(sr.dataset.setreset === 'gear'){ App.setDraft.gear = D.gear; App.setDraft.gearRoll = D.gearRoll; App.setDraft.gearCost = D.gearCost; App.setDraft.grades = D.grades; } else { App.setDraft.win = D.win; App.setDraft.chain = D.chain; App.setDraft.lossDmg = D.lossDmg; App.setDraft.roulette = D.roulette; }
      App.setDirty = true; renderSkillModal(); return;
    }
    if(e.target.closest('[data-setsave]') && App.setDraft){
      const g = {}; for(const k in App.setDraft.gear) g[k] = App.setDraft.gear[k].map(x=>({min: Math.max(0, Math.round(Number(x.min)||0)), v: Math.max(0, Number(x.v)||0)}));
      const roulette = {}; for(const it of ITEMS) roulette[it.id] = Math.max(0, Number(App.setDraft.roulette[it.id])||0);
      if(!Object.values(roulette).some(v=>v>0)){ toast('룰렛 비중이 하나 이상은 0보다 커야 합니다.'); return; }
      const settings = {win:{multi:+App.setDraft.win.multi||0, same:+App.setDraft.win.same||0, banned:+App.setDraft.win.banned||0}, chain:+App.setDraft.chain||0, lossDmg: Math.max(0, +App.setDraft.lossDmg||0), gearCost: Math.max(0, Math.round(+App.setDraft.gearCost||0)), gearRoll: Object.fromEntries(Object.keys(DEFAULT_GEAR_ROLL).map(k=>[k, Math.max(0, +App.setDraft.gearRoll[k]||0)])), roulette, gear:g, grades: App.setDraft.grades.map(x=>({w: Math.max(0, +x.w||0), dur: Math.max(1, Math.round(+x.dur||1)), stat: Math.max(0, +x.stat||0), repair: Math.max(0, Math.round(+x.repair||0))})), potions: JSON.parse(JSON.stringify(settingsOf(null).potions))};
      guard(async()=>{ await saveSrc({settings}); App.setDraft = null; App.setDirty = false; renderSkillModal(); updateSetupPreview(); toast('수치를 적용했습니다. 레이드 시작 시 반영됩니다.'); });
      return;
    }
    const del = e.target.closest('[data-bsdel]');
    if(del){ App.bsDraft = App.bsDraft || bossSkillsOf(SRC()).map(x=>({...x})); if(App.bsDraft.length <= 1){ toast('보스 스킬은 하나 이상 있어야 합니다.'); return; } App.bsDraft.splice(+del.dataset.bsdel, 1); App.skDirty = true; renderSkillModal(); return; }
    if(id === 'bsAdd'){ App.bsDraft = App.bsDraft || bossSkillsOf(SRC()).map(x=>({...x})); if(App.bsDraft.length >= 10){ toast('보스 스킬은 10개까지 넣을 수 있습니다.'); return; } App.bsDraft.push({name:'새 스킬', type:'smash', w:10, v:30}); App.skDirty = true; renderSkillModal(); return; }
    if(id === 'bsReset'){ App.bsDraft = BOSS_SETS[$('bsPreset').value].map(x=>({...x})); App.skDirty = true; renderSkillModal(); return; }
    if(id === 'bsSave' && App.bsDraft){
      const clean = App.bsDraft.map(x=>({name: String(x.name||'스킬').trim().slice(0,16) || '스킬', type: SKILL_TYPES[x.type] ? x.type : 'smash', w: Math.max(0, Number(x.w)||0), v: Math.max(0, Number(x.v)||0)}));
      if(!clean.some(x=>x.w > 0)){ toast('비중이 0보다 큰 스킬이 하나 이상 있어야 합니다.'); return; }
      guard(async()=>{ await saveSrc({bossSkills: clean}); App.bsDraft = null; App.skDirty = false; renderSkillModal(); updateSetupPreview(); toast('보스 스킬을 적용했습니다. 레이드 시작 시 반영됩니다.'); });
      return;
    }
    if(id === 'rsReset'){ App.rsDraft = JSON.parse(JSON.stringify(DEFAULT_ROLE_SKILLS)); App.gDraft = {...DEFAULT_GAUGE}; App.skDirty = true; renderSkillModal(); return; }
    if(id === 'rsSave'){
      const rs = App.rsDraft || roleSkillsOf(SRC()), G = App.gDraft || gaugeOf(SRC());
      if(!(G.max > 0)){ toast('게이지 최대값은 0보다 커야 합니다.'); return; }
      const roleSkills = {}; for(const k in ROLES) roleSkills[k] = {name: String(rs[k].name||'스킬').trim().slice(0,16) || '스킬', v: Math.max(0, Number(rs[k].v)||0)};
      guard(async()=>{ await saveSrc({roleSkills, gauge: G}); App.rsDraft = App.gDraft = null; App.skDirty = false; renderSkillModal(); updateSetupPreview(); toast('역할 스킬을 적용했습니다. 레이드 시작 시 반영됩니다.'); });
    }
  });
}


export { SRC, freshSetupSrc, saveSrc, canEditSkills, pct, openSkillModal, closeSkillModal, clearTime, fmtHours, renderRulesTab, renderRouletteTab, renderSkillModal };
