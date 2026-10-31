## v6.6
- 프로필 사이의 턴 안내 텍스트를 숨기고 ROUND n / 5만 표시합니다.
- 프로필 포커스 및 턴 상태 갱신 로직은 유지합니다.

<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI FORTRESS</title><link rel="stylesheet" href="style.css?v=5.6"></head><body><main class="app"><header><div><h1>AI FORTRESS</h1><p>랜덤 지형에서 AI와 겨루는 포격 게임</p></div><div class="top"><button id="new">대전 설정 / 새 게임</button></div></header><section class="hud" data-active-player="none"><div class="hp" id="p1hud"><div class="name">🔵 <span id="p1name">1P 사용자</span></div><div class="hp-details"><span>HP</span><span><span id="php">100</span> / 100</span></div><div class="bar" role="progressbar" aria-label="1P HP" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" id="p1hpMeter"><div id="pbar"></div></div></div><div class="center"><strong id="turn">플레이어 턴</strong><span id="round">ROUND 1</span></div><div class="hp" id="p2hud"><div class="name">🔴 <span id="p2name">AI Player</span></div><div class="hp-details"><span>HP</span><span><span id="ahp">100</span> / 100</span></div><div class="bar" role="progressbar" aria-label="2P HP" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" id="p2hpMeter"><div id="abar" class="red"></div></div></div></section><div class="stage"><div id="setup" class="setup-overlay"><div class="setup-card"><h2>대전 설정</h2><p>사용자(2P) 또는 AI Player를 선택하세요.</p><div class="setup-players"><label>🔵 1P<select id="p1type"><option value="human" selected>사용자</option><option value="physics">AI Player</option></select></label><label>🔴 2P<select id="p2type"><option value="human">사용자</option><option value="physics" selected>AI Player</option></select></label></div><label class="jev-toggle"><input id="useJev" type="checkbox"> <span><b>Jev AI 사용</b><small>활성화하면 Jev가 공격 전략을 선택합니다.</small></span></label><button id="startGame">게임 시작</button><small>Jev OFF: Physics Bot · Jev ON: Jev 전략 판단 + 물리 포격 계산</small></div></div><canvas id="game" width="960" height="500" aria-label="포격 게임 화면"></canvas><div id="overlay" class="overlay hidden"><div class="modal"><h2 id="resultTitle"></h2><div class="buttons"><button id="again">다시 플레이</button></div></div></div></div><section class="controls"><input id="angle" type="hidden" value="45"><div class="control power-control"><label>발사 파워 <b id="powerValue">0%</b></label><div id="powerMeter" class="power-meter" role="progressbar" aria-label="발사 파워" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="powerFill" class="power-fill" style="width:0%"></div><div id="powerReference" class="power-reference" aria-hidden="true" hidden></div></div></div></section><section id="touchControls" class="touch-controls" aria-label="모바일 터치 조작"><div class="touch-dpad" aria-label="이동 및 각도"><button type="button" class="dpad-up" data-control="up" aria-label="각도 높이기">▲</button><button type="button" class="dpad-left" data-control="left" aria-label="왼쪽 이동">◀</button><button type="button" class="dpad-down" data-control="down" aria-label="각도 낮추기">▼</button><button type="button" class="dpad-right" data-control="right" aria-label="오른쪽 이동">▶</button></div><button type="button" class="touch-space" data-control="fire" aria-label="길게 눌러 파워 충전, 떼면 발사">SPACE · FIRE</button><small class="touch-hint">길게 눌러 파워 충전 · 떼면 발사</small></section><section id="decisionPanel" class="decision-panel hidden"><div class="decision-heading"><h2>🧠 JEV DECISION</h2><span id="jevStatus">연결 대기</span></div><p id="decisionContext">Jev가 판단할 때 현재 상황을 표시합니다.</p><div class="strategy-grid"><div data-strategy="direct_attack"><b>A. 직접 공격</b><small>상대 탱크에 직접 데미지</small><span class="probability">—</span></div><div data-strategy="terrain_destroy"><b>B. 지형 파괴</b><small>장애물 제거로 다음 공격 준비</small><span class="probability">—</span></div><div data-strategy="fall_attack"><b>C. 낙하 유도</b><small>상대 탱크 아래 지형 파괴</small><span class="probability">—</span></div></div><p id="decisionResult">실제 Jev의 선택을 기다리는 중입니다. 확률은 API가 제공하는 경우에만 표시됩니다.</p></section></main><script type="module" src="game.js?v=5.6"></script></body></html>


## v5.6
- HUD current-turn highlight derives from the same `state.currentActor` as the tank badge.
- HUD parent receives `data-active-player` and CSS applies the active card outline directly.
- Updated cache-busting query strings.


### v5.7 지형 렌더링
- 모든 지형에 기존 낮 테마 초록색(`#7cab70`)과 테두리(`#568b50`)를 동일하게 적용합니다.
- 2D 충돌 마스크는 유지하며, 렌더링 경계에만 평활화를 적용합니다.
- 화면에 표시되는 Canvas의 백킹 해상도를 CSS 표시 폭 및 DPR에 맞춰 최대 3.5배까지 높여 최종 확대 단계의 계단 현상을 완화합니다.


## v5.8
- 시작 즉시 현재 턴 프로필 강조를 적용하고 data-current-turn 속성 값을 명시적으로 true로 설정합니다.
- 다음 애니메이션 프레임에서 같은 턴 상태로 강조를 다시 동기화합니다.


## v5.9: 턴 강조 진단

게임 URL 끝에 `?debugTurn=1`을 붙여 접속하고 개발자 도구 Console을 열어주세요.
대전 설정에서 게임 시작을 누르면 `[FORTRESS:TURN]` 로그가 출력됩니다.
특히 `startGame:after-newGame` 및 `newGame:first-frame` 항목의 `gameStarted`, `currentActor`, `hudActivePlayer`, `cards`를 확인해 주세요.
로그에는 API Key가 포함되지 않습니다.

파워 충전 막대의 둥근 끝을 직선으로 변경하여 이전 파워 기준선과 시각적으로 일치시켰습니다.


## v6.0 startup fix
Removed a stale `#log` DOM access from `newGame()`. The log panel was removed from HTML earlier, so calling `replaceChildren()` on null interrupted game initialization. The optional `?debugTurn=1` diagnostics remain available.

### v6.2
- 발사 파워 게이지 트랙과 충전 막대 양쪽 모서리를 모두 직각으로 변경 (`border-radius: 0`).
- 흰색 이전 파워 기준선 및 기존 게임 로직 유지.

### v6.5
- HUD 중앙의 숨겨진 라운드 표시 복원. 현재 라운드 / 전체 5라운드 표시.


v6.7: 모바일 전용 HUD/상단/파워 영역 간격 축소, 활성 프로필 중복 테두리 제거, 방향키와 FIRE 버튼 나란히 배치. 게임 로직 변경 없음.
