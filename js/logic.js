/* =====================================================================
   logic.js — 게임 규칙 계산: 기록(events)을 처음부터 다시 계산해 보스 HP, 분노, 파티 상태를 만듦
   ===================================================================== */
/* ---------- Game logic ---------- */
function cfgOf(r){ return r && r.cfg ? {bonus:0, rageRate:0.5, ...r.cfg} : {hp:220, bonus:20, rage:80, rageRate:0.5, rec:40}; }
/* 보스 HP = 1인당 HP × 인원 + 인원당 추가 HP × (인원 − 1) */
function bossHpOf(cfg, n){ return n > 0 ? n*cfg.hp + (Number(cfg.bonus)||0)*(n-1) : 0; }

function bossSkillsOf(r){ return (r && Array.isArray(r.bossSkills) && r.bossSkills.length) ? r.bossSkills : BOSS_SETS.mixed; }

function roleSkillsOf(r){ const o = {}; for(const k in DEFAULT_ROLE_SKILLS) o[k] = {...DEFAULT_ROLE_SKILLS[k], ...((r && r.roleSkills && r.roleSkills[k]) || {})}; return o; }

function gaugeOf(r){ return {...DEFAULT_GAUGE, ...((r && r.gauge) || {})}; }

function pickTier(list, fee){ let t = list[0]; for(const x of list) if(fee >= x.min) t = x; return t; }
function gearRollList(S){ return Object.keys(DEFAULT_GEAR_ROLL).map(k=>({key:k, w: Math.max(0, Number(S.gearRoll[k])||0)})); }
function gearItemName(S, key){ if(key === 'none') return '꽝'; const [sl,i] = key.split(':'); return S.gear[sl][+i].name; }

function settingsOf(r){
  const x = (r && r.settings) || {};
  const out = {
    win: {...DEFAULT_SETTINGS.win, ...(x.win || {})},
    chain: x.chain ?? DEFAULT_SETTINGS.chain,
    feeGauge: x.feeGauge ?? DEFAULT_SETTINGS.feeGauge,
    gearCost: x.gearCost ?? DEFAULT_SETTINGS.gearCost,
    gearRoll: {...DEFAULT_SETTINGS.gearRoll, ...(x.gearRoll || {})},
    roulette: {...DEFAULT_SETTINGS.roulette, ...(x.roulette || {})},
    gear: {}
  };
  for(const k in GEAR){
    const src = x.gear && Array.isArray(x.gear[k]) && x.gear[k].length === GEAR[k].length ? x.gear[k] : DEFAULT_SETTINGS.gear[k];
    out.gear[k] = GEAR[k].map((g,i)=>({name:g.name, min: Math.max(0, Number(src[i].min)||0), v: Number(src[i].v)||0}));
  }
  return out;
}
/* 슬롯별 장비 번호(0 = 기본)로 장비 정보를 만듭니다 */
function gearFromIdx(idx, S){
  S = S || settingsOf(null);
  const G2 = S.gear, w = G2.weapon[idx.weapon||0], a = G2.armor[idx.armor||0], c = G2.accessory[idx.accessory||0], ci = idx.accessory||0;
  return {idx:{...idx}, weapon:w, armor:a, accessory:c, dmg:w.v, hp:a.v, rageCut: ci === 1 ? c.v : 0, immortal: ci === 2};
}
const rosterKey = name => String(name).replace(/[.#$\[\]\/]/g, '_');
function rosterOf(r, name){ const x = (r && r.roster && r.roster[rosterKey(name)]) || {}; return {role: ROLES[x.role] ? x.role : 'dealer', fee: Math.max(0, Number(x.fee)||0), ladder: String(x.ladder||''), gw: Number(x.gw)||30}; }

/* 같은 기록이면 어느 화면에서 계산해도 같은 결과가 나오는 난수 */
function seeded(str){
  let h = 2166136261;
  for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 2246822507); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function compute(r, evs){
  const members = (r && r.members) || [];
  const cfg = cfgOf(r), G = gaugeOf(r), BS = bossSkillsOf(r), RS = roleSkillsOf(r), S = settingsOf(r);
  const n = members.length;
  /* 분노: 보스가 받은 데미지 × 상승률만큼 오르고, 최대치는 인원과 상관없이 고정 */
  const maxHp = bossHpOf(cfg, n), maxRage = n > 0 ? Math.max(1, Number(cfg.rage)||100) : 0, rageRate = Math.max(0, Number(cfg.rageRate) || 0), rec = cfg.rec/100;
  let hp = maxHp, rage = 0, status = 'live', chain = [], barrier = 0, rally = 0, taunt = null, skillN = 0, lastSkill = null;
  const stats = {}, pending = {}, curse = {}, log = [], mhp = {}, maxH = {}, gauge = {}, needG = {}, gear = {}, role = {}, immUsed = {}, fee = {}, spent = {};
  const st = m => {
    if(!(m in mhp)){
      const ro = rosterOf(r, m), g = gearFromIdx({weapon:0, armor:0, accessory:0}, S);
      gear[m] = g; role[m] = ro.role; fee[m] = ro.fee; spent[m] = 0;
      maxH[m] = PARTY_HP + g.hp; mhp[m] = maxH[m];
      /* 필요 게이지 = 최대 게이지 − 입장료 × 계수 (예: 100 − 1000 × 0.001 = 99) */
      needG[m] = Math.max(1, Math.round((G.max - ro.fee * (Number(S.feeGauge)||0)) * 10) / 10);
      gauge[m] = Math.min(needG[m], G.start);
    }
    return stats[m] || (stats[m] = {w:0,l:0,dmg:0,rage:0,best:0,skills:0,used:0});
  };
  members.forEach(st);
  const alive = () => Object.keys(mhp).filter(m=>mhp[m] > 0);
  const addGauge = (m, v) => { if(mhp[m] > 0) gauge[m] = Math.min(needG[m], gauge[m] + v); };
  const hurt = (m, d, entry) => {
    const before = mhp[m];
    let after = Math.max(0, before - d);
    if(after === 0 && gear[m].immortal && !immUsed[m]){ immUsed[m] = true; after = REVIVE_HP; entry.notes.push(`${m} 불사의 목걸이 발동 · 체력 ${REVIVE_HP}`); }
    mhp[m] = after;
    stats[m].skills += Math.max(0, before - after);
    entry.party.push({m, d: Math.max(0, before - after), down: after === 0});
  };

  /* 보스에게 데미지를 주고, 그만큼 분노를 올림 */
  const hit = (m, d, entry) => {
    if(d <= 0) return;
    hp -= d; entry.dHp -= d;
    if(stats[m]){ stats[m].dmg += d; }
    let r = d * rageRate;
    const cut = gear[m] && gear[m].rageCut;
    if(cut){ const r0 = r; r = r * (1 - cut); entry.rageSaved = (entry.rageSaved||0) + (r0 - r); }
    r = Math.round(r * 10) / 10;
    rage += r; entry.dRage += r; if(stats[m]) stats[m].rage += r;
  };
  function bossSkill(entry, seedBase){
    const roll = seeded(seedBase + '|' + skillN), roll2 = seeded(seedBase + '|t|' + skillN);
    skillN++;
    const total = BS.reduce((a,x)=>a + Math.max(0, Number(x.w)||0), 0) || 1;
    let acc = 0, sk = BS[BS.length-1];
    for(const x of BS){ acc += Math.max(0, Number(x.w)||0); if(roll*total < acc){ sk = x; break; } }
    const v = Number(sk.v)||0;
    const live = alive(), target = live.length ? live[Math.floor(roll2 * live.length)] : null;
    const out = {name:sk.name, type:sk.type, target:null};
    const tauntOn = taunt && mhp[taunt.m] > 0 && (sk.type === 'smash' || sk.type === 'flame');
    switch(sk.type){
      case 'regen': { const h = Math.min(Math.round(maxHp*v/100), maxHp-hp); hp += h; entry.dHp += h; out.text = h ? `보스 HP +${fmt(h)} 회복` : '보스 HP가 가득 차 있어 효과 없음'; break; }
      case 'smash':
      case 'flame': {
        if(tauntOn){
          const d = Math.round(v * (1 - taunt.v/100));
          hurt(taunt.m, d, entry); out.target = taunt.m; out.text = `${taunt.m}가 도발로 대신 받음 · 체력 −${d}`; taunt = null;
        } else if(sk.type === 'smash'){
          if(target){ hurt(target, v, entry); out.target = target; out.text = `${target} 체력 −${v}`; } else out.text = '대상 없음';
        } else { live.forEach(m=>hurt(m, v, entry)); out.text = `생존자 ${live.length}명 체력 −${v}`; }
        break;
      }
      case 'curse': { if(target){ curse[target] = v; out.target = target; out.text = `${target} 다음 승리 데미지 ×${v}`; } else out.text = '대상 없음'; break; }
      case 'barrier': { barrier = Math.max(barrier, Math.round(v)); out.text = `파티의 다음 승리 ${Math.round(v)}번 데미지 절반`; break; }
      default: out.text = '알 수 없는 스킬';
    }
    lastSkill = sk.name;
    entry.skills.push(out);
  }
  function checkRage(entry, seedBase){
    while(maxRage > 0 && rage >= maxRage && alive().length && hp > 0){
      rage -= maxRage;
      bossSkill(entry, seedBase);
    }
  }

  const sorted = evs.slice().sort((a,b)=> (a.t-b.t) || String(a._id).localeCompare(String(b._id)));
  for(const ev of sorted){
    const entry = {ev, notes:[], dHp:0, dRage:0, skills:[], party:[]};
    log.push(entry);
    if(ev.undone){ entry.undone = true; continue; }
    if(status !== 'live'){ entry.ignored = true; entry.notes.push('레이드 종료 후 기록 · 반영 안 됨'); continue; }
    const enraged = hp <= maxHp*0.5;
    const m = ev.member;
    const seedBase = `${ev.t}|${m}|${ev.type}|${ev.points ?? ev.item ?? ''}`;
    if(ev.type === 'game'){
      const s = st(m);
      const pend = pending[m]; delete pending[m];
      const p = Number(ev.points)||0;
      if(p > 0){
        s.w++;
        if(mhp[m] <= 0){
          mhp[m] = REVIVE_HP; entry.revived = true; chain = [];
          entry.notes.push(`전투불능에서 부활 · 체력 ${REVIVE_HP} · 데미지 없음`);
          if(pend) pending[m] = pend;
        } else if(ev.banned && !S.win.banned){ entry.notes.push('금지 빌드 · 데미지 0'); if(pend) entry.notes.push(PENDING_LABEL[pend]+' 소멸'); chain = []; }
        else{
          let mult = 1;
          if(gear[m].dmg){ mult *= 1 + gear[m].dmg; entry.notes.push(`${gear[m].weapon.name} ×${(1+gear[m].dmg).toFixed(2).replace(/0$/,'')}`); }
          if(ev.multi){ mult *= S.win.multi; entry.notes.push(`멀티 확보 ×${S.win.multi}`); }
          if(ev.same){ mult *= S.win.same; entry.notes.push(`같은 빌드 연속 ×${S.win.same}`); }
          if(ev.banned){ mult *= S.win.banned; entry.notes.push(`초반 올인 ×${S.win.banned}`); }
          if(pend === 'double'){ mult *= 2; entry.notes.push('룰렛 2배'); }
          if(pend === 'mission'){ mult *= 3; entry.notes.push('도전 미션 ×3'); }
          if(pend === 'shield') entry.notes.push('패배 보호 미사용 소멸');
          if(curse[m]){ mult *= curse[m]; entry.notes.push(`저주 ×${curse[m]}`); delete curse[m]; }
          if(barrier > 0){ mult *= 0.5; barrier--; entry.notes.push('보스 보호막 ×0.5'); }
          if(rally > 0){ mult *= 1.5; rally--; entry.notes.push('전투 자극 ×1.5'); }
          const d = Math.round(p*mult);
          hit(m, d, entry); if(d > s.best) s.best = d;
          if(chain.includes(m)) chain = [m]; else chain.push(m);
          if(chain.length >= 3){
            const b = Math.round(maxHp*S.chain/100);
            hit(m, b, entry); entry.notes.push('체인 보너스 '+fmt(b)); chain = [];
          }
        }
        addGauge(m, G.win);
      } else if(p < 0){
        s.l++; chain = [];
        const a0 = Math.abs(p);
        if(pend === 'shield'){ entry.notes.push('패배 보호 발동 · 보스 회복 없음'); }
        else{
          if(pend) entry.notes.push(PENDING_LABEL[pend]+' 소멸');
          if(enraged && rec > 0){
            const h = Math.min(Math.round(a0*rec), maxHp-hp);
            if(h > 0){ hp += h; entry.dHp += h; entry.notes.push('보스 회복 '+fmt(h)); }
          }
        }
        addGauge(m, G.loss);
      } else {
        entry.notes.push('점수 변동 없음');
        if(pend) pending[m] = pend;
      }
    } else if(ev.type === 'roulette'){
      const it = ITEM[ev.item] || ITEM.none;
      entry.item = it;
      st(m);
      switch(it.id){
        case 'hp2': { hit(m, Math.round(maxHp*0.02), entry); break; }
        case 'hp7': { hit(m, Math.round(maxHp*0.07), entry); break; }
        case 'rage5': { const d = Math.min(Math.round(maxRage*0.05), rage); rage -= d; entry.dRage -= d; break; }
        case 'heal4': { const h = Math.min(Math.round(maxHp*0.04), maxHp-hp); hp += h; entry.dHp += h; break; }
        case 'rage7': { const d = Math.round(maxRage*0.07); rage += d; entry.dRage += d; break; }
        default:
          if(it.next){ if(pending[m] && pending[m] !== it.id) entry.notes.push(PENDING_LABEL[pending[m]]+' → 교체'); pending[m] = it.id; }
      }
    } else if(ev.type === 'gear'){
      st(m);
      const cost = Math.max(0, Number(ev.cost ?? S.gearCost) || 0);
      if(fee[m] - spent[m] < cost){ entry.ignored = true; entry.notes.push(`입장료 부족 (남은 ${fmt(fee[m]-spent[m])} / 필요 ${fmt(cost)}) · 반영 안 됨`); continue; }
      spent[m] += cost;
      entry.gear = {key: ev.item, name: gearItemName(S, ev.item || 'none'), cost};
      if(!ev.item || ev.item === 'none'){ entry.notes.push(`입장료 −${fmt(cost)} · 꽝`); }
      else {
        const [sl, iStr] = ev.item.split(':'), ni = +iStr, cur = gear[m].idx[sl] || 0;
        if(ni > cur){
          const before = gear[m];
          gear[m] = gearFromIdx({...before.idx, [sl]: ni}, S);
          if(sl === 'armor'){ const d = gear[m].hp - before.hp; maxH[m] += d; if(mhp[m] > 0) mhp[m] += d; }
          entry.notes.push(`입장료 −${fmt(cost)} · ${GEAR_SLOT[sl]} ${entry.gear.name} 장착`);
        } else entry.notes.push(`입장료 −${fmt(cost)} · ${entry.gear.name} (이미 같거나 더 좋은 ${GEAR_SLOT[sl]} 착용 중)`);
      }
    } else if(ev.type === 'role'){
      st(m);
      const rk = role[m], sk = RS[rk], v = Number(sk.v)||0;
      entry.role = {key:rk, name:sk.name};
      if(mhp[m] <= 0){ entry.ignored = true; entry.notes.push('전투불능이라 스킬을 쓸 수 없음 · 반영 안 됨'); continue; }
      if(gauge[m] < needG[m]){ entry.ignored = true; entry.notes.push(`게이지 부족 (${gauge[m]}/${needG[m]}) · 반영 안 됨`); continue; }
      gauge[m] = 0; stats[m].used++;
      switch(ROLES[rk].type){
        case 'nuke': { hit(m, Math.round(maxHp*v/100), entry); entry.notes.push(`보스 HP ${v}% 감소`); break; }
        case 'heal': {
          let healed = 0, revived = [];
          for(const x of Object.keys(mhp)){ const before = mhp[x]; mhp[x] = Math.min(maxH[x], mhp[x] + v); healed += mhp[x]-before; if(before <= 0 && mhp[x] > 0) revived.push(x); }
          entry.healed = healed;
          entry.notes.push(`파티 체력 +${fmt(healed)}${revived.length ? ' · 부활: '+revived.join(', ') : ''}`); break;
        }
        case 'taunt': { taunt = {m, v}; entry.notes.push(`다음 보스 공격을 ${m}가 대신 받음 (피해 ${v}% 감소)`); break; }
        case 'rally': { rally = Math.max(rally, Math.round(v)); const cleared = Object.keys(curse).length; for(const k in curse) delete curse[k]; entry.notes.push(`다음 승리 ${Math.round(v)}번 데미지 ×1.5${cleared ? ' · 저주 해제' : ''}`); break; }
      }
    }
    if(entry.rageSaved) entry.notes.push(`평온의 부적 분노 −${fmt(Math.round(entry.rageSaved*10)/10)}`);
    if(hp <= 0){ hp = 0; status = 'clear'; entry.notes.push('보스 처치!'); }
    else {
      checkRage(entry, seedBase);
      if(Object.keys(mhp).length && !alive().length){ status = 'fail'; entry.notes.push('파티 전멸 · 레이드 실패'); }
    }
  }
  return {maxHp, maxRage, hp, rage, status, stats, pending, curse, barrier, rally, taunt, mhp, maxH, gauge, needG, gear, immUsed, fee, spent, role, G, BS, RS, S, lastSkill,
          log, chain, enraged: maxHp > 0 && hp <= maxHp*0.5, cfg, members};
}

function whatHtml(e){
  const ev = e.ev;
  if(ev.type==='game'){ const p = Number(ev.points)||0; const wt = ev.multi?'운영 승리':ev.same?'빌드 반복':ev.banned?'초반 올인':''; return `<b>${esc(ev.member)}</b> ${p>0?'승리':p<0?'패배':'무승부'} <span class="num">${p>0?'+':''}${p}</span>점${ev.games>1?` <span class="wt-tag">${ev.games}판 합산</span>`:''}${wt && !e.wtEdit?`<span class="wt-tag">${wt}</span>`:''}${ev.auto?'<span class="auto-tag" title="래더 자동 수집으로 들어온 기록">자동</span>':''}`; }
  if(ev.type==='gear'){ const g0 = e.gear || {name:'장비'}; return `<b>${esc(ev.member)}</b> 장비 룰렛 · <b>${esc(g0.name)}</b>`; }
  if(ev.type==='role'){ const r0 = e.role || {key:'dealer', name:'역할 스킬'}; return `<b>${esc(ev.member)}</b> <span class="role-tag ${r0.key}">${ROLES[r0.key].short}</span>역할 스킬 <b style="color:#ffd34d">${esc(r0.name)}</b>`; }
  const it = ITEM[ev.item] || ITEM.none;
  return `<b>${esc(ev.member)}</b> 룰렛 · <span class="tier-${it.tier}" style="color:var(--tc)">[${it.tier}]</span> ${esc(it.name)}`;
}
function skillHtml(e){
  if(!e.skills || !e.skills.length) return '';
  const downs = (e.party||[]).filter(x=>x.down).map(x=>x.m);
  return e.skills.map(k=>`<div class="skill">보스 스킬 <b>${esc(k.name)}</b> · ${esc(k.text)}</div>`).join('') + (downs.length ? `<div class="skill">전투불능: <b>${esc(downs.join(', '))}</b></div>` : '');
}
function gearHtml(s, m){
  const g = s.gear[m]; if(!g) return '';
  const S = s.S, wv = g.weapon.v, av = g.armor.v, ci = S.gear.accessory.findIndex(x=>x.name===g.accessory.name);
  const w = `<span class="w${wv?'':' base'}" title="무기 · ${wv ? '승리 데미지 +'+Math.round(wv*100)+'%' : '기본'}">${esc(g.weapon.name)}${wv ? ' +'+Math.round(wv*100)+'%' : ''}</span>`;
  const a = `<span class="a${av?'':' base'}" title="갑옷 · ${av ? '최대 체력 +'+av : '기본'}">${esc(g.armor.name)}${av ? ' +'+av : ''}</span>`;
  const cTitle = ci===1 ? `내 공격으로 오르는 분노 −${Math.round(g.accessory.v*100)}%` : ci===2 ? `레이드당 1회 쓰러질 때 체력 ${REVIVE_HP}` : '장신구 없음';
  const used = ci===2 && s.immUsed && s.immUsed[m];
  const c = `<span class="c${ci>0?'':' base'}${used?' used':''}" title="장신구 · ${cTitle}${used?' (사용함)':''}">${esc(g.accessory.name)}</span>`;
  return `<span class="gear">${w}${a}${c}</span>`;
}
function statusTags(s, m){
  const t = [];
  if((s.mhp[m] ?? 1) <= 0) t.push('<span class="d-hp">전투불능</span>');
  if(s.curse[m]) t.push('<span style="color:var(--legend)">저주</span>');
  if(s.pending[m]) t.push(esc(PENDING_LABEL[s.pending[m]]));
  return t.join(' · ');
}
