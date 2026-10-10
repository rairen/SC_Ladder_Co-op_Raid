/* =====================================================================
   logic.js — 게임 규칙 계산: 기록(events)을 처음부터 다시 계산해 보스 HP, 분노, 공략대 상태를 만듦
   ===================================================================== */
/* ---------- Game logic ---------- */
import { App } from '@app/core/app.js';
import { BOSS_SETS, DEFAULT_GAUGE, DEFAULT_GEAR_ROLL, DEFAULT_ROLE_SKILLS, DEFAULT_SETTINGS, GEAR, GEAR_GRADES, GEAR_SLOT, ITEM, PARTY_HP, PENDING_LABEL, POTIONS, REVIVE_HP, ROLES } from '@app/core/game-data.js';
import { esc, fmt } from '@app/core/state.js';

function cfgOf(r){ return r && r.cfg ? {bonus:0, rageRate:0.5, ...r.cfg} : {hp:220, bonus:20, rage:80, rageRate:0.5, rec:40}; }
/* 보스 HP = 1인당 HP × 인원 + 인원당 추가 HP × (인원 − 1) */
function bossHpOf(cfg, n){ return n > 0 ? n*cfg.hp + (Number(cfg.bonus)||0)*(n-1) : 0; }

function bossSkillsOf(r){ return (r && Array.isArray(r.bossSkills) && r.bossSkills.length) ? r.bossSkills : BOSS_SETS.mixed; }

function roleSkillsOf(r){ const o = {}; for(const k in DEFAULT_ROLE_SKILLS) o[k] = {...DEFAULT_ROLE_SKILLS[k], ...((r && r.roleSkills && r.roleSkills[k]) || {})}; return o; }

function gaugeOf(r){ return {...DEFAULT_GAUGE, ...((r && r.gauge) || {})}; }

function pickTier(list, fee){ let t = list[0]; for(const x of list) if(fee >= x.min) t = x; return t; }
function gearRollList(S){ return Object.keys(DEFAULT_GEAR_ROLL).map(k=>({key:k, w: Math.max(0, Number(S.gearRoll[k])||0)})); }
function gearItemName(S, key, grade){ if(!key || key === 'none') return '꽝'; const [sl,i] = key.split(':'); const g = grade && gradeOf(S, grade); return S.gear[sl][+i].name + (g && g.label ? ` [${g.label}]` : ''); }
/* 장비 등급: 등급 정보 (없으면 예전 기록 → 내구도 없음) */
function gradeOf(S, id){
  const i = GEAR_GRADES.findIndex(g=>g.id===id);
  if(i < 0) return {id:'', label:'', rank:-1, dur:Infinity, stat:1, repair:0, salvage:10};
  const x = (S.grades && S.grades[i]) || GEAR_GRADES[i];
  return {id, label:GEAR_GRADES[i].label, rank:i, w:Math.max(0, Number(x.w)||0), dur:Math.max(1, Math.round(Number(x.dur)||1)), stat:Math.max(0, Number(x.stat)||1), repair:Math.max(0, Math.round(Number(x.repair ?? GEAR_GRADES[i].repair)||0)), salvage:Math.max(0, Math.round(Number(x.salvage ?? GEAR_GRADES[i].salvage)||0))};
}
/* 장비 하나 만들기: 등급 배율을 적용한 수치와 내구도 */
function makeItem(S, id, key, gradeId){
  const [slot, iStr] = key.split(':'), idx = +iStr, base = S.gear[slot][idx], g = gradeOf(S, gradeId);
  let v = base.v;
  if(slot === 'armor') v = Math.round(base.v * g.stat);
  else if(slot === 'weapon' || (slot === 'accessory' && idx === 1)) v = Math.round(base.v * g.stat * 100) / 100;
  const immortal = slot === 'accessory' && idx === 2;
  const dur = immortal ? 1 : g.dur;
  return {id, key, slot, idx, grade:g.id, gradeLabel:g.label, rank:g.rank, name:base.name, v, revive: immortal ? Math.round(REVIVE_HP * g.stat) : 0, dur, maxDur:dur, broken:false};
}
/* 자동 장착 비교: 장비 단계 → 등급 → 남은 내구도 */
const itemScore = it => it ? it.idx*10000 + (it.rank+1)*100 + Math.min(99, it.dur === Infinity ? 99 : it.dur) : 0;

function settingsOf(r){
  const x = (r && r.settings) || {};
  const out = {
    win: {...DEFAULT_SETTINGS.win, ...(x.win || {})},
    chain: x.chain ?? DEFAULT_SETTINGS.chain,
    gearCost: x.gearCost ?? DEFAULT_SETTINGS.gearCost,
    lossDmg: x.lossDmg ?? DEFAULT_SETTINGS.lossDmg,
    gearRoll: {...DEFAULT_SETTINGS.gearRoll, ...(x.gearRoll || {})},
    roulette: {...DEFAULT_SETTINGS.roulette, ...(x.roulette || {})},
    gear: {}
  };
  for(const k in GEAR){
    const src = x.gear && Array.isArray(x.gear[k]) && x.gear[k].length === GEAR[k].length ? x.gear[k] : DEFAULT_SETTINGS.gear[k];
    out.gear[k] = GEAR[k].map((g,i)=>({name:g.name, min: Math.max(0, Number(src[i].min)||0), v: Number(src[i].v)||0}));
  }
  out.grades = GEAR_GRADES.map((g,i)=>({...DEFAULT_SETTINGS.grades[i], ...((x.grades && x.grades[i]) || {})}));
  out.potions = {};
  for(const k in POTIONS){ const p = {...DEFAULT_SETTINGS.potions[k], ...((x.potions && x.potions[k]) || {})}; out.potions[k] = {name: POTIONS[k].name, unit: POTIONS[k].unit, cost: Math.max(0, Number(p.cost)||0), v: Math.max(0, Number(p.v)||0)}; }
  return out;
}
/* 수리 비용: 등급별 (등급 없는 예전 장비·기본 장비는 수리 없음) */
function repairCost(S, it){ if(!it || it.base || it.maxDur === Infinity || !it.grade) return 0; return gradeOf(S, it.grade).repair; }
/* 분해하면 돌려받는 지참금: 등급별 값, 상위 장비 1.5배, 파괴된 장비 절반 */
function salvageValue(S, it){ if(!it || it.base) return 0; const v = gradeOf(S, it.grade).salvage * (it.idx === 2 ? 1.5 : 1); return Math.round(it.broken ? v / 2 : v); }
const listOf = v => Array.isArray(v) ? v.filter(Boolean) : (v && typeof v === 'object' ? Object.values(v) : []);
/* 레이드가 끝날 때 남기는 공략대원 가방 (장비 + 소모품). 다음 레이드에 참가할 때 그대로 가져옴 */
function bagsOf(s){
  const out = {};
  for(const m of s.members){
    const eqm = (s.eq && s.eq[m]) || {};
    out[m] = {
      items: ((s.inv && s.inv[m]) || []).map(it=>({id: it.id, key: it.key, grade: it.grade || '', dur: it.dur === Infinity ? null : it.dur, eq: eqm[it.slot] === it.id})),
      pots: {...((s.pots && s.pots[m]) || {})},
      money: Math.max(0, (s.fee[m] || 0) - (s.spent[m] || 0)),
      log: ((s.money && s.money[m]) || []).slice()
    };
  }
  return out;
}
const rosterKey = name => String(name).replace(/[.#$\[\]\/]/g, '_');
function rosterOf(r, name){ const x = (r && r.roster && r.roster[rosterKey(name)]) || {}; return {role: ROLES[x.role] ? x.role : 'dealer', fee: Math.max(0, Number(x.fee)||0), ladder: String(x.ladder||''), gw: Number(x.gw)||30, bag: x.bag || null}; }

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
  /* 중간 합류: 첫 래더 결과가 나온 뒤에 참가한 공략대원은 시작 HP 에 넣지 않고, 합류하는 순간 보스 HP 를 늘림 */
  const liveEvs = (evs||[]).filter(e=>!e.undone);
  const firstGameT = Math.min(Infinity, ...liveEvs.filter(e=>e.type==='game').map(e=>e.t||0));
  const lateJoin = new Map();
  for(const e of liveEvs) if(e.type==='party' && e.action==='join' && (e.t||0) > firstGameT && members.includes(e.member) && !lateJoin.has(e.member)) lateJoin.set(e.member, e);
  const n0 = Math.max(n > 0 ? 1 : 0, n - lateJoin.size);
  /* 분노: 보스가 받은 데미지 × 상승률만큼 오르고, 최대치는 인원과 상관없이 고정 */
  let maxHp = bossHpOf(cfg, n0); const maxRage = n > 0 ? Math.max(1, Number(cfg.rage)||100) : 0, rageRate = Math.max(0, Number(cfg.rageRate) || 0), rec = cfg.rec/100;
  let hp = maxHp, rage = 0, status = 'live', chain = [], barrier = 0, rally = 0, taunt = null, skillN = 0, lastSkill = null;
  const stats = {}, pending = {}, curse = {}, log = [], mhp = {}, maxH = {}, gauge = {}, needG = {}, gear = {}, role = {}, immUsed = {}, fee = {}, fund = {}, spent = {}, pots = {}, carry = {}, money = {};
  const inv = {}, eq = {};   // 인벤토리(얻은 장비 전부)와 슬롯별 착용 장비
  const itemOf = (m, id) => id ? inv[m].find(x=>x.id===id) : null;
  /* 착용 장비로 능력치 계산 (빈 슬롯은 기본 장비) */
  function buildGear(m){
    const w = itemOf(m, eq[m].weapon), a = itemOf(m, eq[m].armor), c = itemOf(m, eq[m].accessory);
    const base = sl => ({...S.gear[sl][0], base:true});
    const weapon = w || base('weapon'), armor = a || base('armor'), accessory = c || base('accessory');
    return {weapon, armor, accessory, dmg: w ? w.v : 0, hp: a ? a.v : 0, rageCut: c && c.idx === 1 ? c.v : 0, immortal: !!(c && c.idx === 2), revive: c && c.idx === 2 ? c.revive : 0};
  }
  /* 장착 (갑옷이 바뀌면 최대 체력도 바뀜) */
  function equip(m, slot, item){
    const before = gear[m];
    eq[m][slot] = item ? item.id : null;
    gear[m] = buildGear(m);
    if(slot === 'armor'){ const d = gear[m].hp - before.hp; maxH[m] = PARTY_HP + gear[m].hp; if(mhp[m] > 0) mhp[m] = Math.max(1, Math.min(maxH[m], mhp[m] + d)); }
  }
  /* 인벤토리에서 그 슬롯의 가장 좋은 장비 */
  const bestOf = (m, slot) => inv[m].filter(x=>x.slot===slot && !x.broken).sort((a,b)=>itemScore(b)-itemScore(a))[0] || null;
  /* 내구도 1 감소, 0 이 되면 부서지고 다음 장비 자동 착용 */
  function wear(m, slot, entry){
    const it = itemOf(m, eq[m][slot]); if(!it || it.dur === Infinity) return;
    it.dur = Math.max(0, it.dur - 1);
    if(it.dur <= 0){
      it.broken = true;
      const next = bestOf(m, slot);
      equip(m, slot, next);
      entry.notes.push(`${m} ${it.name}${it.gradeLabel?`[${it.gradeLabel}]`:''} 파괴${next ? ` → ${next.name}${next.gradeLabel?`[${next.gradeLabel}]`:''} 착용` : ''}`);
    }
  }
  const st = m => {
    if(!(m in mhp)){
      const ro = rosterOf(r, m);
      inv[m] = []; eq[m] = {weapon:null, armor:null, accessory:null}; pots[m] = {};
      /* 지난 레이드에서 가져온 가방: 장비(내구도 그대로)와 소모품 */
      const bag = ro.bag;
      if(bag){
        for(const b of listOf(bag.items)){
          if(!b || !b.key || !b.id || !S.gear[String(b.key).split(':')[0]]) continue;
          const it = makeItem(S, String(b.id), b.key, b.grade);
          if(b.dur != null && it.dur !== Infinity){ it.dur = Math.max(0, Math.min(it.maxDur, Math.round(Number(b.dur)||0))); it.broken = it.dur <= 0; }
          it.carried = true;
          inv[m].push(it);
          if(b.eq && !it.broken) eq[m][it.slot] = it.id;
        }
        for(const k in POTIONS) pots[m][k] = Math.max(0, Math.round(Number(bag.pots && bag.pots[k])||0));
      }
      /* 지참금 = 지난 레이드에서 이월된 잔액 + 이번 레이드에 가져온 지참금 */
      carry[m] = Math.max(0, Math.round(Number(bag && bag.money) || 0));
      const g = gear[m] = buildGear(m); role[m] = ro.role; fee[m] = carry[m] + ro.fee; spent[m] = 0;
      money[m] = [];
      const t0 = (r && r.startedAt) || 0;
      if(carry[m]) money[m].push({t: t0, k:'carry', a: carry[m], b: carry[m]});
      if(ro.fee) money[m].push({t: t0, k:'deposit', a: ro.fee, b: fee[m]});
      maxH[m] = PARTY_HP + g.hp; mhp[m] = maxH[m];
      needG[m] = G.max;
      gauge[m] = Math.min(needG[m], G.start);
    }
    return stats[m] || (stats[m] = {w:0,l:0,dmg:0,rage:0,best:0,skills:0,used:0});
  };
  /* 지참금 내역 한 줄 (잔액 포함) */
  const ledger = (m, t, k, a, note) => { money[m].push({t: t || 0, k, a, b: fee[m] - spent[m], ...(note ? {n: note} : {})}); };
  members.forEach(st);
  const alive = () => Object.keys(mhp).filter(m=>mhp[m] > 0);
  const addGauge = (m, v) => { if(mhp[m] > 0) gauge[m] = Math.min(needG[m], gauge[m] + v); };
  const hurt = (m, d, entry) => {
    const before = mhp[m];
    let after = Math.max(0, before - d);
    if(after === 0 && gear[m].immortal){ immUsed[m] = true; after = gear[m].revive || REVIVE_HP; entry.notes.push(`${m} ${gear[m].accessory.name} 발동 · 체력 ${after}`); wear(m, 'accessory', entry); }
    mhp[m] = after;
    if(eq[m] && eq[m].armor) wear(m, 'armor', entry);
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
      case 'barrier': { barrier = Math.max(barrier, Math.round(v)); out.text = `공략대의 다음 승리 ${Math.round(v)}번 데미지 절반`; break; }
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
    if(ev.type === 'party'){
      entry.party0 = true;
      if(lateJoin.get(m) === ev && n0 < n){
        /* 보스 최대 HP 는 1인분(1인당 HP + 인원당 추가 HP)만큼 늘고, 지금 HP 는 남은 비율만큼만 늘어 HP% 는 그대로 */
        const inc = (Number(cfg.hp)||0) + (Number(cfg.bonus)||0), before = maxHp;
        maxHp += inc; const add = before > 0 ? Math.round(inc * hp / before) : inc; hp += add; entry.dHp += add;
        entry.late = true; entry.notes.push(`중간 합류 · 보스 최대 HP +${fmt(inc)}, 현재 HP +${fmt(add)}`);
      }
      continue;
    }
    if(m && !members.includes(m)){ entry.ignored = true; entry.notes.push('공략대에 없는 공략대원 · 반영 안 됨'); continue; }
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
          if(d > 0){ wear(m, 'weapon', entry); if(gear[m].rageCut) wear(m, 'accessory', entry); }
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
        if(pend === 'shield'){ entry.notes.push('패배 보호 발동 · 피해·보스 회복 없음'); }
        else{
          if(pend) entry.notes.push(PENDING_LABEL[pend]+' 소멸');
          /* 패배 = 보스에게 맞음: 잃은 점수 × 패배 피해 배율만큼 그 공략대원 체력 감소 */
          const ld = Math.round(a0 * (Number(S.lossDmg) || 0));
          if(ld > 0 && mhp[m] > 0){ hurt(m, ld, entry); entry.notes.push(`패배 피해 ${m} 체력 −${fmt(ld)}`); }
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
      if(fee[m] - spent[m] < cost){ entry.ignored = true; entry.notes.push(`지참금 부족 (남은 ${fmt(fee[m]-spent[m])} / 필요 ${fmt(cost)}) · 반영 안 됨`); continue; }
      spent[m] += cost;
      entry.gear = {key: ev.item, name: gearItemName(S, ev.item || 'none', ev.grade), grade: ev.grade || '', cost};
      if(cost) ledger(m, ev.t, 'gear', -cost, entry.gear.name);
      if(!ev.item || ev.item === 'none'){ entry.notes.push(`지참금 −${fmt(cost)} · 꽝`); }
      else {
        const it = makeItem(S, ev._id || seedBase, ev.item, ev.grade);
        inv[m].push(it);
        const cur = itemOf(m, eq[m][it.slot]);
        if(itemScore(it) > itemScore(cur)){
          equip(m, it.slot, it);
          entry.notes.push(`지참금 −${fmt(cost)} · ${GEAR_SLOT[it.slot]} ${entry.gear.name} 장착`);
        } else entry.notes.push(`지참금 −${fmt(cost)} · ${entry.gear.name} 인벤토리에 보관`);
      }
    } else if(ev.type === 'equip'){
      st(m);
      const [mode, slotOff] = String(ev.item||'').split(':');
      if(mode === 'off' && GEAR_SLOT[slotOff]){
        if(eq[m][slotOff]){ const it = itemOf(m, eq[m][slotOff]); equip(m, slotOff, null); entry.notes.push(`${it.name} 해제 · 인벤토리에 보관`); }
        else { entry.ignored = true; entry.notes.push('해제할 장비 없음'); }
      } else {
        const it = itemOf(m, ev.item);
        if(!it || it.broken){ entry.ignored = true; entry.notes.push('부서졌거나 없는 장비 · 반영 안 됨'); }
        else { equip(m, it.slot, it); entry.notes.push(`${GEAR_SLOT[it.slot]} ${it.name}${it.gradeLabel?`[${it.gradeLabel}]`:''} 장착 (내구 ${it.dur === Infinity ? '∞' : it.dur+'/'+it.maxDur})`); }
      }
      entry.equip = true;
    } else if(ev.type === 'repair'){
      /* 내구도 수리: 등급별 비용을 지참금에서 내고 내구도를 최대로. 파괴된 장비도 고침 */
      st(m);
      const it = itemOf(m, ev.item), cost = repairCost(S, it);
      entry.repair = it ? {name: it.name, gradeLabel: it.gradeLabel, grade: it.grade} : null;
      if(!it || !cost){ entry.ignored = true; entry.notes.push('수리할 수 없는 장비 · 반영 안 됨'); continue; }
      if(it.dur >= it.maxDur){ entry.ignored = true; entry.notes.push('이미 내구도가 가득 참 · 반영 안 됨'); continue; }
      if(fee[m] - spent[m] < cost){ entry.ignored = true; entry.notes.push(`지참금 부족 (남은 ${fmt(fee[m]-spent[m])} / 필요 ${fmt(cost)}) · 반영 안 됨`); continue; }
      spent[m] += cost;
      ledger(m, ev.t, 'repair', -cost, it.name + (it.gradeLabel ? ` [${it.gradeLabel}]` : ''));
      const wasBroken = it.broken; it.dur = it.maxDur; it.broken = false;
      if(it.slot === 'accessory' && it.idx === 2) delete immUsed[m];
      entry.notes.push(`지참금 −${fmt(cost)} · 내구도 ${it.maxDur}/${it.maxDur}${wasBroken ? ' · 파괴 복구' : ''}`);
      const cur = itemOf(m, eq[m][it.slot]);
      if(itemScore(it) > itemScore(cur)){ equip(m, it.slot, it); entry.notes.push('착용'); }
      else if(cur === it) gear[m] = buildGear(m);
    } else if(ev.type === 'drop'){
      /* 장비 버리기·분해: 인벤토리에서 없앰. 분해는 지참금을 돌려받음. 착용 중인 장비는 먼저 해제해야 함 */
      st(m);
      const it = itemOf(m, ev.item);
      entry.drop = it ? {name: it.name, gradeLabel: it.gradeLabel, grade: it.grade, salvage: !!ev.salvage} : {salvage: !!ev.salvage};
      if(!it){ entry.ignored = true; entry.notes.push('없는 장비 · 반영 안 됨'); continue; }
      if(eq[m][it.slot] === it.id){ entry.ignored = true; entry.notes.push('착용 중인 장비 · 반영 안 됨'); continue; }
      const val = ev.salvage ? salvageValue(S, it) : 0;
      inv[m].splice(inv[m].indexOf(it), 1);
      if(val){ fee[m] += val; ledger(m, ev.t, 'salvage', val, it.name + (it.gradeLabel ? ` [${it.gradeLabel}]` : '')); entry.notes.push(`지참금 +${fmt(val)}`); }
      else entry.notes.push('버림');
    } else if(ev.type === 'buy'){
      st(m);
      const p = S.potions[ev.item];
      if(!p){ entry.ignored = true; continue; }
      entry.pot = {name: p.name};
      if(fee[m] - spent[m] < p.cost){ entry.ignored = true; entry.notes.push(`지참금 부족 (남은 ${fmt(fee[m]-spent[m])} / 필요 ${fmt(p.cost)}) · 반영 안 됨`); continue; }
      spent[m] += p.cost; pots[m][ev.item] = (pots[m][ev.item] || 0) + 1;
      ledger(m, ev.t, 'buy', -p.cost, p.name);
      entry.notes.push(`지참금 −${fmt(p.cost)} · 보유 ${pots[m][ev.item]}개`);
    } else if(ev.type === 'use'){
      st(m);
      const p = S.potions[ev.item];
      if(!p){ entry.ignored = true; continue; }
      entry.pot = {name: p.name, use: true};
      if(!(pots[m][ev.item] > 0)){ entry.ignored = true; entry.notes.push('가진 소모품이 없음 · 반영 안 됨'); continue; }
      if(mhp[m] <= 0){ entry.ignored = true; entry.notes.push('전투불능이라 쓸 수 없음 · 반영 안 됨'); continue; }
      if(ev.item === 'hp' ? mhp[m] >= maxH[m] : gauge[m] >= needG[m]){ entry.ignored = true; entry.notes.push(`${ev.item === 'hp' ? '체력' : '스킬 게이지'}이 이미 가득 참 · 반영 안 됨`); continue; }
      pots[m][ev.item]--;
      if(ev.item === 'hp'){ const before = mhp[m]; mhp[m] = Math.min(maxH[m], mhp[m] + p.v); entry.healed = mhp[m] - before; entry.notes.push(`${m} 체력 +${fmt(mhp[m] - before)} (${mhp[m]}/${maxH[m]})`); }
      else { const before = gauge[m]; gauge[m] = Math.min(needG[m], gauge[m] + p.v); entry.notes.push(`${m} 스킬 게이지 +${fmt(Math.round((gauge[m]-before)*10)/10)} (${gauge[m]}/${needG[m]})`); }
      entry.notes.push(`남은 ${p.name} ${pots[m][ev.item]}개`);
    } else if(ev.type === 'fund'){
      /* 추가 지원금: 장비 룰렛에 쓸 지참금만 늘어남 (역할 스킬 필요 게이지는 초기 지참금 기준 그대로) */
      st(m);
      const a = Math.max(0, Math.round(Number(ev.amount) || 0));
      fee[m] += a; fund[m] = (fund[m] || 0) + a;
      ledger(m, ev.t, 'fund', a);
      entry.notes.push(`남은 지참금 ${fmt(fee[m] - spent[m])}`);
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
          entry.notes.push(`공략대 체력 +${fmt(healed)}${revived.length ? ' · 부활: '+revived.join(', ') : ''}`); break;
        }
        case 'taunt': { taunt = {m, v}; entry.notes.push(`다음 보스 공격을 ${m}가 대신 받음 (피해 ${v}% 감소)`); break; }
        case 'rally': { rally = Math.max(rally, Math.round(v)); const cleared = Object.keys(curse).length; for(const k in curse) delete curse[k]; entry.notes.push(`다음 승리 ${Math.round(v)}번 데미지 ×1.5${cleared ? ' · 저주 해제' : ''}`); break; }
      }
    }
    if(entry.rageSaved) entry.notes.push(`평온의 부적 분노 −${fmt(Math.round(entry.rageSaved*10)/10)}`);
    if(hp <= 0){ hp = 0; status = 'clear'; entry.notes.push('보스 처치!'); }
    else {
      checkRage(entry, seedBase);
      if(Object.keys(mhp).length && !alive().length){ status = 'fail'; entry.notes.push('공략대 전멸 · 레이드 실패'); }
    }
  }
  return {maxHp, maxRage, hp, rage, status, stats, pending, curse, barrier, rally, taunt, mhp, maxH, gauge, needG, gear, inv, eq, immUsed, fee, fund, spent, pots, carry, money, role, G, BS, RS, S, lastSkill,
          log, chain, enraged: maxHp > 0 && hp <= maxHp*0.5, cfg, members};
}

/* 공략대 구성 기록 문구 */
function partyText(ev){
  const rl = ROLES[ev.role] ? ROLES[ev.role].label : '';
  if(ev.action === 'join') return `공략대 참가${rl ? ' · '+rl : ''}${ev.fee ? ' · 지참금 '+fmt(ev.fee) : ''}`;
  if(ev.action === 'kick') return '공략대에서 내보냄';
  if(ev.action === 'role') return `역할 변경 → ${rl}`;
  if(ev.action === 'fee') return `지참금 ${fmt(ev.fee||0)}(으)로 변경`;
  return '공략대 변경';
}
function whatHtml(e){
  const ev = e.ev;
  if(ev.type==='game'){ const p = Number(ev.points)||0; return `<b>${esc(ev.member)}</b> ${p>0?'승리':p<0?'패배':'무승부'} <span class="num">${p>0?'+':''}${p}</span>점${ev.games>1?` <span class="wt-tag">${ev.games}판 합산</span>`:''}${ev.auto?'<span class="auto-tag" title="래더 자동 수집으로 들어온 기록">자동</span>':''}`; }
  if(ev.type==='gear'){ const g0 = e.gear || {name:'장비'}; return `<b>${esc(ev.member)}</b> 장비 룰렛 · <b class="${g0.grade?'gr-'+g0.grade:''}">${esc(g0.name)}</b>`; }
  if(ev.type==='equip'){ return `<b>${esc(ev.member)}</b> 장비 교체`; }
  if(ev.type==='repair'){ const r0 = e.repair || {name:'장비'}; return `<b>${esc(ev.member)}</b> 장비 수리 · <b class="${r0.grade?'gr-'+r0.grade:''}">${esc(r0.name)}${r0.gradeLabel?` [${r0.gradeLabel}]`:''}</b>`; }
  if(ev.type==='drop'){ const d = e.drop || {}; return `<b>${esc(ev.member)}</b> 장비 ${ev.salvage ? '분해' : '버리기'}${d.name ? ` · <b class="${d.grade?'gr-'+d.grade:''}">${esc(d.name)}${d.gradeLabel?` [${d.gradeLabel}]`:''}</b>` : ''}`; }
  if(ev.type==='buy'){ return `<b>${esc(ev.member)}</b> 소모품 구매 · ${esc((e.pot && e.pot.name) || '소모품')}`; }
  if(ev.type==='use'){ return `<b>${esc(ev.member)}</b> <b class="${ev.item==='hp'?'d-heal':'pot-mp'}">${esc((e.pot && e.pot.name) || '소모품')}</b> 사용`; }
  if(ev.type==='fund'){ return `<b>${esc(ev.member)}</b> 추가 지원금 <b class="d-heal">+${fmt(Number(ev.amount)||0)}</b>`; }
  if(ev.type==='party'){ return `<b>${esc(ev.member)}</b> ${partyText(ev)}`; }
  if(ev.type==='role'){ const r0 = e.role || {key:'dealer', name:'역할 스킬'}; return `<b>${esc(ev.member)}</b> <span class="role-tag ${r0.key}">${ROLES[r0.key].short}</span>역할 스킬 <b style="color:#ffd34d">${esc(r0.name)}</b>`; }
  const it = ITEM[ev.item] || ITEM.none;
  return `<b>${esc(ev.member)}</b> 룰렛 · <span class="tier-${it.tier}" style="color:var(--tc)">[${it.tier}]</span> ${esc(it.name)}`;
}
function skillHtml(e){
  if(!e.skills || !e.skills.length) return '';
  const downs = (e.party||[]).filter(x=>x.down).map(x=>x.m);
  return e.skills.map(k=>`<div class="skill">보스 스킬 <b>${esc(k.name)}</b> · ${esc(k.text)}</div>`).join('') + (downs.length ? `<div class="skill">전투불능: <b>${esc(downs.join(', '))}</b></div>` : '');
}
/* 착용 장비 칸 (무기·갑옷·장신구). 등급 색 테두리, 내구도 눈금 */
const SLOT_ICON = {
  weapon:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4l-10.5 10.5"/><path d="M20 4h-3M20 4v3"/><path d="M6.5 11.5l6 6"/><path d="M8.5 15.5L4 20"/></svg>',
  armor:    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 2.8v5.4c0 4.6-3 8-7 9.8-4-1.8-7-5.2-7-9.8V5.8z"/><path d="M12 7v10"/></svg>',
  accessory:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="14.5" r="5.5"/><path d="M12 3.5l2.2 2.2L12 8 9.8 5.7z"/></svg>'
};
function gearHtml(s, m){
  const g = s.gear[m]; if(!g) return '';
  const one = (slot, it) => {
    const used = slot === 'accessory' && it.idx === 2 && s.immUsed && s.immUsed[m];
    const stat = it.base ? '기본' : slot === 'weapon' ? `공격 +${Math.round(it.v*100)}%` : slot === 'armor' ? `체력 +${it.v}` : it.idx === 1 ? `분노 −${Math.round(it.v*100)}%` : `부활 ${it.revive || REVIVE_HP}`;
    const hasDur = !it.base && it.dur !== Infinity && it.maxDur;
    const dura = hasDur ? `<span class="dura${it.dur <= Math.ceil(it.maxDur/4) ? ' low' : ''}" style="--seg:${Math.min(it.maxDur, 20)}"><i style="width:${Math.round(it.dur/it.maxDur*100)}%"></i></span><span class="dura-n num">${it.dur}/${it.maxDur}</span>` : '';
    const title = `${GEAR_SLOT[slot]} · ${it.name}${it.gradeLabel ? ' ['+it.gradeLabel+']' : ''} · ${stat}${hasDur ? ` · 내구도 ${it.dur}/${it.maxDur}` : ''}${used ? ' · 사용함' : ''}`;
    return `<span class="slot ${slot}${it.base ? ' base' : ''}${it.grade ? ' gr-'+it.grade : ''}${used ? ' used' : ''}" title="${esc(title)}">
      <span class="slot-ic">${SLOT_ICON[slot]}</span>
      <span class="slot-tx"><span class="slot-nm">${esc(it.name)}</span><span class="slot-st">${it.gradeLabel && !it.base ? `<em>${it.gradeLabel}</em> ` : ''}${stat}</span>${dura ? `<span class="slot-du">${dura}</span>` : ''}</span></span>`;
  };
  return `<span class="gear">${one('weapon', g.weapon)}${one('armor', g.armor)}${one('accessory', g.accessory)}</span>`;
}
function statusTags(s, m){
  const t = [];
  if((s.mhp[m] ?? 1) <= 0) t.push('<span class="d-hp">전투불능</span>');
  if(s.curse[m]) t.push('<span style="color:var(--legend)">저주</span>');
  if(s.pending[m]) t.push(esc(PENDING_LABEL[s.pending[m]]));
  return t.join(' · ');
}

export { cfgOf, bossHpOf, bossSkillsOf, roleSkillsOf, gaugeOf, pickTier, gearRollList, gearItemName, gradeOf, makeItem, settingsOf, rosterOf, seeded, compute, partyText, whatHtml, skillHtml, gearHtml, statusTags, itemScore, rosterKey, SLOT_ICON, repairCost, salvageValue, bagsOf, listOf };
