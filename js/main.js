/* =====================================================================
   main.js — 시작점
   ---------------------------------------------------------------------
   1) 모든 모듈을 불러오고  2) 각 모듈의 init() 을 아래 순서대로 한 번씩 부릅니다.
   init() 은 그 파일의 버튼 연결, 초기값 설정 같은 "처음 한 번" 할 일입니다.
   새 파일을 만들면: 아래 import 와 modules 배열에 한 줄씩 추가하고, index.html 의 importmap 에도 경로를 넣으세요.
   ===================================================================== */
import { App } from '@app/core/app.js';
import * as m0 from '@app/core/game-data.js';
import * as m1 from '@app/core/state.js';
import * as m2 from '@app/core/store.js';
import * as m3 from '@app/core/logic.js';
import * as m4 from '@app/ui/render.js';
import * as m5 from '@app/ui/setup.js';
import * as m6 from '@app/features/actions.js';
import * as m7 from '@app/features/gear-roulette.js';
import * as m8 from '@app/ui/overlay.js';
import * as m9 from '@app/features/role-skill.js';
import * as m10 from '@app/ui/info-window.js';
import * as m11 from '@app/features/ladder.js';
import * as m12 from '@app/features/party.js';
import * as m13 from '@app/features/ladder-browser.js';
import * as m14 from '@app/features/auth.js';
import * as m15 from '@app/ui/history.js';
import * as m16 from '@app/ui/dungeon.js';
import * as m17 from '@app/core/boot.js';
import * as m18 from '@app/ui/me-info.js';
import * as m19 from '@app/ui/admin-tools.js';
import * as m20 from '@app/ui/player-raids.js';

const modules = [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15, m16, m18, m19, m20, m17];

/* 개발용: 내 PC(localhost)에서 열면 브라우저 콘솔에서 raid, events, compute() 등을 바로 쓸 수 있게 전역으로 꺼내 둡니다.
   실제 사이트(github.io)에서는 하지 않습니다. */
if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)){
  for(const m of modules) for(const [k, v] of Object.entries(m)) if(k !== 'init' && !(k in window)) window[k] = v;
  for(const k of Object.keys(App)) if(!(k in window)) Object.defineProperty(window, k, {get: ()=>App[k], set: v=>{ App[k] = v; }, configurable: true});
  window.App = App;
}

/* 파일 순서대로 init() 실행 */
for(const m of modules) if(typeof m.init === 'function') m.init();
