/* =====================================================================
   게임 데이터
   ---------------------------------------------------------------------
   난이도, 스킬, 장비, 룰렛 같은 "수치"는 모두 이 파일에 있습니다.
   기능 코드를 몰라도 여기 숫자와 이름만 바꾸면 게임 밸런스가 바뀝니다.

   - 진행 중인 레이드에는 영향이 없고, 새로 여는 레이드부터 적용됩니다.
   - 레이드를 열 때 "수치 설정"에서 바꾼 값이 이 기본값보다 우선합니다.
   - 수정 후에는 브라우저에서 Ctrl+F5 로 새로고침해 확인하세요.

   값의 의미
   - w  : 비중. 같은 목록 안에서 w 합계 대비 비율이 확률이 됩니다.
          (예: 30, 20, 50 이면 각각 30%, 20%, 50%)
   - v  : 수치. 항목마다 의미가 다르니 각 항목 주석을 보세요.

   주의
   - id, type, 영어 키(light, zerg, weapon 등)는 코드가 찾는 이름이라 바꾸면 안 됩니다.
   - 이름(label, name)과 숫자는 자유롭게 바꿔도 됩니다.
   ===================================================================== */


/* ---------- 난이도 ----------
   보스 HP   = hp × 인원 + bonus × (인원 − 1)
   hp       : 1인당 보스 HP
   bonus    : 인원이 한 명 늘 때마다 붙는 추가 HP
   rage     : 분노 최대치 (인원과 무관). 가득 차면 보스 스킬 1회
   rageRate : 보스가 받은 데미지 1당 오르는 분노 (0.5 = 20 데미지에 분노 +10)
   rec      : 보스 HP 50% 이하일 때 패배하면, 잃은 점수의 rec% 만큼 보스 회복 */
import { App } from '@app/core/app.js';

const PRESETS = {
  light: {label:'라이트', hp:150, bonus:10, rage:100, rageRate:0.5, rec:25, desc:'가볍게'},
  normal:{label:'노멀',   hp:275, bonus:20, rage:85,  rageRate:0.5, rec:40, desc:'보통'},
  hard:  {label:'하드',   hp:350, bonus:30, rage:70,  rageRate:0.5, rec:60, desc:'어렵게'},
  custom:{label:'커스텀', desc:'직접 입력'}
};


/* ---------- 룰렛 결과 ----------
   tier : 등급 (아래 TIERS 중 하나)
   w    : 비중
   next : true 면 "룰렛을 돌린 공략대원의 다음 래더 결과"에 적용, 없으면 즉시 적용
   효과 자체는 js/logic.js 의 roulette 부분에서 id 로 처리합니다. */
const ITEMS = [
  {id:'none',    tier:'꽝',   w:30,  name:'꽝'},
  {id:'hp2',     tier:'일반', w:20,  name:'보스 HP 2% 감소'},
  {id:'rage5',   tier:'일반', w:20,  name:'분노 게이지 5% 감소'},
  {id:'double',  tier:'희귀', w:10,  name:'다음 판 데미지 2배', next:true},
  {id:'shield',  tier:'희귀', w:10,  name:'다음 판 패배 보호 (보스 회복 없음)', next:true},
  {id:'hp7',     tier:'전설', w:2.5, name:'보스 HP 7% 감소'},
  {id:'mission', tier:'전설', w:2.5, name:'도전 미션 (유닛 1종 금지, 승리 시 3배)', next:true},
  {id:'heal4',   tier:'함정', w:2.5, name:'보스 HP 4% 회복'},
  {id:'rage7',   tier:'함정', w:2.5, name:'분노 게이지 7% 증가'}
];
const ITEM = Object.fromEntries(ITEMS.map(i=>[i.id,i]));
/* 다음 판 효과가 대기 중일 때 화면에 보이는 짧은 이름 */
const PENDING_LABEL = {double:'데미지 2배', shield:'패배 보호', mission:'도전 미션 3배'};
/* 룰렛 등급 표시 순서 */
const TIERS = ['꽝','일반','희귀','전설','함정'];


/* ---------- 공략대원 체력 ----------
   PARTY_HP  : 기본 체력 (갑옷 수치가 더해짐). 0 이 되면 전투불능
   REVIVE_HP : 전투불능 상태에서 승리하거나 불사의 목걸이가 발동할 때의 체력 */
const PARTY_HP = 100, REVIVE_HP = 30;


/* ---------- 보스 스킬 종류 ----------
   보스 스킬의 type 은 아래 5가지 중 하나이고, v 의 의미가 다릅니다. */
const SKILL_TYPES = {
  regen:  {label:'보스 회복', unit:'%',  desc:v=>`보스 HP ${v}% 회복`},             // v = 최대 HP 대비 %
  smash:  {label:'단일 공격', unit:'',   desc:v=>`공략대원 1명 체력 −${v}`},          // v = 체력 감소량
  flame:  {label:'광역 공격', unit:'',   desc:v=>`생존 공략대원 전원 체력 −${v}`},    // v = 1인당 체력 감소량
  curse:  {label:'저주',      unit:'배', desc:v=>`공략대원 1명 다음 승리 데미지 ×${v}`}, // v = 데미지 배율
  barrier:{label:'보호막',    unit:'회', desc:v=>`공략대의 다음 승리 ${v}번 데미지 절반`} // v = 횟수
};


/* ---------- 종족별 보스 스킬 ----------
   보스 이름으로 종족이 정해지고, 그 종족 세트가 레이드에 복사됩니다.
   name : 화면에 보이는 스킬 이름
   type : 위 SKILL_TYPES 중 하나
   w    : 그 종족 안에서의 비중
   v    : 수치 (type 별 의미는 위 참고) */
const RACES = {zerg:'저그', protoss:'프로토스', terran:'테란', mixed:'혼합'};
const BOSS_SETS = {
  zerg: [
    {name:'급속 재생', type:'regen', w:30, v:10},
    {name:'산성 침',   type:'smash', w:30, v:50},
    {name:'감염 확산', type:'flame', w:25, v:25},
    {name:'기생',      type:'curse', w:15, v:0.5}
  ],
  protoss: [
    {name:'보호막 충전',   type:'barrier', w:30, v:2},
    {name:'사이오닉 스톰', type:'flame',   w:25, v:30},
    {name:'정신 지배',     type:'curse',   w:20, v:0.5},
    {name:'차원 재생',     type:'regen',   w:25, v:6}
  ],
  terran: [
    {name:'긴급 수리',     type:'regen',   w:25, v:8},
    {name:'야마토 포',     type:'smash',   w:30, v:60},
    {name:'핵 공격',       type:'flame',   w:20, v:35},
    {name:'방어 매트릭스', type:'barrier', w:25, v:2}
  ],
  mixed: [  // 목록에 없는 보스 이름일 때
    {name:'재생',      type:'regen',   w:25, v:8},
    {name:'강타',      type:'smash',   w:25, v:50},
    {name:'광역 화염', type:'flame',   w:20, v:25},
    {name:'저주',      type:'curse',   w:15, v:0.5},
    {name:'보호막',    type:'barrier', w:15, v:2}
  ]
};


/* ---------- 보스 이름 (종족별) ----------
   새 레이드를 열면 이 목록에서 무작위로 하나가 들어갑니다. 이름을 추가·변경해도 됩니다. */
const BOSS_BY_RACE = {
  zerg:    ['군락의 심장 하이브', '광폭한 울트라리스크', '산성 둥지의 퀸', '독안개의 디파일러', '망각의 오버로드', '무한 증식 저글링 군락'],
  protoss: ['그림자 속의 다크 아칸', '사이오닉 폭풍의 하이 템플러', '영원의 아비터', '차원의 캐리어 함대', '섬광의 리버', '침묵의 다크 템플러'],
  terran:  ['붕괴하는 배틀크루저', '핵을 품은 고스트', '철벽의 시즈탱크 포대', '불타는 벙커 요새']
};


/* ---------- 공략대 역할과 역할 스킬 ----------
   ROLES 의 type 은 코드가 효과를 고르는 키라 바꾸면 안 됩니다.
   DEFAULT_ROLE_SKILLS 의 이름과 v 는 자유롭게 바꿔도 됩니다.
   - 탱커 v : 대신 받는 피해 감소 %
   - 딜러 v : 보스 최대 HP 대비 %
   - 힐러 v : 회복량
   - 서포터 v : 데미지 ×1.5 가 적용되는 승리 횟수 */
const ROLES = {
  tank:   {label:'탱커',   short:'T', type:'taunt', desc:v=>`다음 보스 공격(단일·광역)을 혼자 받고 피해 ${v}% 감소`},
  dealer: {label:'딜러',   short:'D', type:'nuke',  desc:v=>`보스 HP ${v}% 즉시 감소`},
  healer: {label:'힐러',   short:'H', type:'heal',  desc:v=>`공략대원 전원 체력 +${v} (전투불능도 부활)`},
  support:{label:'서포터', short:'S', type:'rally', desc:v=>`공략대의 다음 승리 ${v}번 데미지 ×1.5, 저주 해제`}
};
const DEFAULT_ROLE_SKILLS = {
  tank:   {name:'도발',      v:50},
  dealer: {name:'집중 포화', v:5},
  healer: {name:'치유의 빛', v:30},
  support:{name:'전투 자극', v:2}
};


/* ---------- 역할 스킬 게이지 ----------
   max   : 최대 게이지. 가득 차면 역할 스킬 사용
   start : 레이드 시작 시 게이지
   win   : 승리할 때 충전량
   loss  : 패배할 때 충전량 */
const DEFAULT_GAUGE = {max:100, start:20, win:25, loss:15};


/* ---------- 장비 ----------
   슬롯마다 [0]=기본 장비, [1], [2] 순서로 좋아집니다. 장비 룰렛으로 얻습니다.
   무기   v : 승리 데미지 증가 비율 (0.10 = +10%)
   갑옷   v : 최대 체력 증가량
   장신구   : [1] 평온의 부적 v = 내 공격으로 오르는 분노 감소 비율 (0.10 = −10%)
              [2] 불사의 목걸이 = 쓰러질 때 체력 REVIVE_HP 로 버티고 부서짐 (1회용) */
const GEAR = {
  weapon:   [{name:'낡은 검', v:0}, {name:'강철 검',     v:0.10}, {name:'마력 검',       v:0.25}],
  armor:    [{name:'천 옷',   v:0}, {name:'사슬 갑옷',   v:20},   {name:'판금 갑옷',     v:50}],
  accessory:[{name:'없음',    v:0}, {name:'평온의 부적', v:0.10}, {name:'불사의 목걸이', v:1}]
};
const GEAR_SLOT = {weapon:'무기', armor:'갑옷', accessory:'장신구'};


/* ---------- 장비 등급과 내구도 ----------
   장비 룰렛에서 장비가 나오면 등급도 함께 정해집니다.
   w    : 등급 확률 비중
   dur  : 내구도 (사용 횟수)
          무기·평온의 부적  내 래더 승리 공격 1번마다 1씩 닳음
          갑옷             보스에게 공격받을 때마다 1씩 닳음
          불사의 목걸이     등급과 상관없이 한 번 발동하면 부서짐
          0 이 되면 부서지고, 인벤토리에서 같은 종류의 가장 좋은 장비를 자동으로 착용합니다.
   stat : 능력치 배율 (일반 = 1). 예: 강철 검 +10% → 전설 +13%
          불사의 목걸이는 버티는 체력(REVIVE_HP)에 곱합니다.
   repair : 내구도 수리 비용 (지참금에서 빠짐). 내구도를 최대로 되돌리고, 파괴된 장비도 고칩니다.
   salvage: 분해하면 돌려받는 지참금. 상위 장비(마력 검·판금 갑옷·불사의 목걸이)는 1.5배, 파괴된 장비는 절반 */
const GEAR_GRADES = [
  {id:'common', label:'일반', w:50, dur:5,  stat:1.00, repair:50,  salvage:20},
  {id:'rare',   label:'고급', w:30, dur:9,  stat:1.10, repair:75,  salvage:30},
  {id:'epic',   label:'희귀', w:15, dur:15, stat:1.20, repair:100, salvage:50},
  {id:'legend', label:'전설', w:5,  dur:24, stat:1.30, repair:150, salvage:80}
];


/* ---------- 소모품 ----------
   지참금으로 사서 레이드 중 아무 때나 씁니다. 남은 소모품·장비·지참금은 레이드가 끝나도 그 공략대원이 계속 가집니다.
   cost : 1개 가격 (지참금에서 빠짐)
   v    : 효과량. hp = 체력 회복, mp = 역할 스킬 게이지 충전 (전투불능일 때는 못 씀) */
const POTIONS = {
  hp: {name:'힐링 포션', cost:50, v:30, unit:'체력'},
  mp: {name:'마나 포션', cost:50, v:30, unit:'스킬 게이지'}
};


/* ---------- 장비 룰렛 확률 ----------
   '슬롯:번호' 형식. 'none' 은 꽝. */
const DEFAULT_GEAR_ROLL = {
  'none':30,
  'weapon:1':15, 'weapon:2':5,
  'armor:1':20,  'armor:2':8,
  'accessory:1':15, 'accessory:2':7
};


/* ---------- 레이드 설정 기본값 ----------
   win        : (사용 안 함) 예전 승리 유형 배율. 예전 기록을 다시 계산할 때만 쓰임
   chain      : 서로 다른 3명 연속 승리 시 보스 최대 HP 대비 추가 데미지 %
   gearCost   : 장비 룰렛 1회 비용 (지참금에서 빠짐)
   roulette / gearRoll / gear : 위 목록의 값을 그대로 가져옴 */
const DEFAULT_SETTINGS = {
  win: {multi:1.5, same:0.5, banned:0},
  chain: 2,
  gearCost: 100,
  lossDmg: 0.5,  // 패배 피해 배율: 래더에서 진 점수 × 이 값만큼 그 공략대원 체력이 줄어듦 (0.5 = 잃은 점수의 50%, 0 이면 피해 없음)
  gearRoll: {...DEFAULT_GEAR_ROLL},
  roulette: Object.fromEntries(ITEMS.map(i=>[i.id, i.w])),
  gear: Object.fromEntries(Object.entries(GEAR).map(([k,list])=>[k, list.map(x=>({v:x.v}))])),
  grades: GEAR_GRADES.map(g=>({w:g.w, dur:g.dur, stat:g.stat, repair:g.repair, salvage:g.salvage})),
  potions: Object.fromEntries(Object.entries(POTIONS).map(([k,p])=>[k, {cost:p.cost, v:p.v}]))
};


/* ---------- 기획안 (정보 창 룰렛 탭에 표시만 됨, 아직 기능 없음) ---------- */
const ROULETTE_PLAN = [
  {name:'일반 룰렛', cost:100,  p:[30,40,20,5,5]},   // p = TIERS 순서의 확률 %
  {name:'고급 룰렛', cost:300,  p:[10,35,35,15,5]},
  {name:'전설 룰렛', cost:1000, p:[0,20,40,35,5]}
];
const PARTY_SKILL_PLAN = [
  {tier:'일반', name:'응급 치료',   desc:'룰렛을 돌린 공략대원 체력 +40'},
  {tier:'희귀', name:'부활',        desc:'전투불능 공략대원 1명 체력 50으로 부활'},
  {tier:'희귀', name:'저주 해제',   desc:'공략대 전체의 저주 해제'},
  {tier:'전설', name:'전체 치유',   desc:'공략대원 전원 체력 +30 (전투불능도 부활)'},
  {tier:'전설', name:'보호막 파괴', desc:'보스 보호막 제거, 분노 게이지 비우기'}
];

export { PRESETS, ITEMS, ITEM, PENDING_LABEL, TIERS, PARTY_HP, REVIVE_HP, SKILL_TYPES, RACES, BOSS_SETS, BOSS_BY_RACE, ROLES, DEFAULT_ROLE_SKILLS, DEFAULT_GAUGE, GEAR, GEAR_SLOT, GEAR_GRADES, DEFAULT_GEAR_ROLL, DEFAULT_SETTINGS, POTIONS, ROULETTE_PLAN, PARTY_SKILL_PLAN };
