let moveCount = 0; 
let turnMovesMax = 3;       // 한 턴 최대 이동 횟수 (기본 3)
let turnMovesLeft = turnMovesMax;
let isResolving = false;
let turnDamageTotal = 0;   

function randomEnemyDelta() {
    return 500 + Math.floor(Math.random() * 11) * 1;  // 500..1500 여기 1을 100으로
}

// HP 상태 관리
const HP = {
    base: 0,
    max: 0,
    current: 0,

    init() {
        // 리더 포함 전원 합산 (slice(1) 쓰지 말 것)
        const alliesHp = allies.reduce((sum, u) => sum + (u ? u.maxHp : 0), 0);
        this.max = this.base + alliesHp;
        this.current = this.max;
        this.updateBar();
    },

    setHP(value) {
        const prev = this.current;                            // ★ 추가
        this.current = Math.max(0, Math.min(this.max, value));
        this.updateBar();
        if (prev > 0 && this.current === 0) onPartyDefeated(); // ★ 추가
    },


    changeHP(delta) {
        this.setHP(this.current + delta);
    },

    updateBar() {
        const percent = (this.current / this.max) * 100;
        const fill = document.querySelector(".hp-fill");
        const text = document.querySelector(".hp-text");
        if (fill) fill.style.width = percent + "%";
        if (text) text.textContent = `${this.current} / ${this.max}`;
    }
};

document.addEventListener("DOMContentLoaded", () => {
    HP.init();
});

function recalcTotalHP() {
    HP.max = allies.reduce((sum, u) => sum + (u.maxHp || 0), 0);
    HP.current = allies.reduce((sum, u) => sum + (u.hp || 0), 0);
    HP.updateBar();
}

/* === Enemy HP Manager & Rank/State Utils === */
const EnemyHP = {
    max: 1000,
    current: 1000,
    init(max = 1000) {
        this.max = max;
        this.current = max;
        this.updateBar();
    },
    updateBar() {
        const fill = document.querySelector('.enemy-hp-fill');
        const text = document.querySelector('.enemy-hp-text');
        const pct = (this.current / this.max) * 100;
        if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        if (text) text.textContent = `${this.current} / ${this.max}`;
    },
    damage(n) {
        const d = Math.max(0, Math.floor(n) || 0);
        this.current = Math.max(0, this.current - d);
        this.updateBar();
        if (this.current <= 0) onEnemyDefeated();
    }
};

// 500~1500 사이 100 단위 랜덤
function randomEnemyMaxHP() {
    const base = 500 + Math.floor(Math.random() * 11) * 100; // 500..1500
    return base;
}

// 헤더 랭크 즉시+영구 업데이트
function bumpRank() {
    const KEY = 'profileV1';
    let obj = {};
    try { obj = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { }

    const cur = Number(obj.rank || 1);
    obj.rank = cur + 1; // 랭크 상승
    localStorage.setItem(KEY, JSON.stringify(obj));

    // Profile 모듈이 있으면 상태도 갱신
    if (window.Profile && Profile.state) {
        Profile.state.rank = obj.rank;
    }

    // 헤더 즉시 반영
    const el = document.getElementById('headerRank');
    if (el) el.textContent = obj.rank;

    // ✅ 버튼에도 즉시 반영
    const rankBtn = document.getElementById('btnToggleFooterZ');
    if (rankBtn) rankBtn.textContent = `Rank ${obj.rank}`;

    // 프로필 렌더 요청(아래 3-C-2와 세트)
    window.dispatchEvent(new CustomEvent('profile:update'));
}


// 모험 상태 저장키
const ADV_LS_KEY = 'adventureV1';

// 보드(6×5) → 저장
function saveAdventureState() {
    try {
        const state = {
            board: getBoardState(),
            enemy: {
                current: EnemyHP.current,
                max: EnemyHP.max,
                codes: currentEnemy.codes,
                tiers: currentEnemy.tiers,
                attr: currentEnemy.attr
            },
            ally: { current: HP.current, max: HP.max },
            turnMovesLeft,
            allies: allies.map(a => ({
                id: a.id,
                hp: a.hp,
                maxHp: a.maxHp,
                attack: a.attack,
                heal: a.heal,
                cooldownLeft: a.cooldownLeft || 0,
                cooldownMax: a.cooldownMax || 5
            }))
        };
        localStorage.setItem(ADV_LS_KEY, JSON.stringify(state));
    } catch { }
}

// 저장본 → 보드/HP 복원
function applyBoardState(board) {
    const slots = document.querySelectorAll(".puzzle-slot");
    const rows = 5, cols = 6;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const slot = slots[idx];
            const el = board[r][c];
            slot.dataset.element = el;
            resetSlotIcon(slot);
        }
    }
}

function restoreAdventureState() {
    try {
        const raw = localStorage.getItem(ADV_LS_KEY);
        if (!raw) return false;
        const s = JSON.parse(raw);
        if (!s || !Array.isArray(s.board)) return false;

        // 🧩 퍼즐판 복원
        applyBoardState(s.board);

        // 🐉 적 상태 복원
        if (s.enemy && typeof s.enemy.current === "number" && typeof s.enemy.max === "number") {
            EnemyHP.max = s.enemy.max;
            EnemyHP.current = Math.max(0, Math.min(s.enemy.max, s.enemy.current));
            EnemyHP.updateBar();

            if (s.enemy.codes && s.enemy.tiers && s.enemy.attr) {
                ["left", "center", "right"].forEach((pos, i) => {
                    const img = document.querySelector(`#monster-${pos} img`);
                    if (img) img.src = `enemy/${s.enemy.codes[i]}${s.enemy.tiers[i]}${s.enemy.attr}.png`;
                });
                window.currentEnemy = {
                    codes: s.enemy.codes,
                    tiers: s.enemy.tiers,
                    attr: String(s.enemy.attr)
                };
            }
        } else {
            EnemyHP.init(1000);
        }

        // 🩸 아군 HP 복원
        if (s.ally) {
            HP.max = s.ally.max || HP.max;
            HP.current = Math.max(0, Math.min(HP.max, s.ally.current || HP.current));
            updateAllyHPBar();
        }

        // 🧭 턴 정보 복원
        if (typeof s.turnMovesLeft === "number") {
            turnMovesLeft = Math.max(0, Math.min(turnMovesMax, s.turnMovesLeft));
        }
        updateTurnGauge();

        // 🧩 아군 쿨타임 복원
        if (s.allies && Array.isArray(s.allies)) {
            s.allies.forEach(saved => {
                const a = allies.find(x => x.id === saved.id);
                if (a) {
                    a.hp = saved.hp;
                    a.maxHp = saved.maxHp;
                    a.attack = saved.attack;
                    a.heal = saved.heal;
                    a.cooldownLeft =
                        (saved.cooldownLeft !== undefined && saved.cooldownLeft > 0)
                            ? saved.cooldownLeft
                            : a.cooldownMax;
                    a.cooldownMax = saved.cooldownMax || 5;

                    if (a.cooldownLeft > a.cooldownMax) {
                        a.cooldownLeft = a.cooldownMax;
                    }
                }
            });
        }
        updateAllAllyUI?.();

        // 랭크/버튼 복원
        const profile = JSON.parse(localStorage.getItem("profileV1") || "{}") || {};
        const rank = Number(profile.rank || 1);
        const rankBtn = document.getElementById("btnToggleFooterZ");
        if (rankBtn) rankBtn.textContent = `Rank ${rank}`;
        const hdrRank = document.getElementById("headerRank");
        if (hdrRank) hdrRank.textContent = rank;

        return true;
    } catch (err) {
        console.warn("⚠️ restoreAdventureState 실패:", err);
        return false;
    }
}

function clearAdventureState() {
    try { localStorage.removeItem(ADV_LS_KEY); } catch { }
}

function onEnemyDefeated() {
    // ✅ 스테이지 증가
    const current = Number(localStorage.getItem('currentStage') || 1);
    localStorage.setItem('currentStage', current + 1);
    updateStageButtonText();

    // 🕒 랭크 업 먼저 처리
    bumpRank();

    // 💾 기존 모험 상태 지우기 전에 새 랭크용 세팅 준비
    const nextMax = EnemyHP.max + randomEnemyDelta();
    EnemyHP.init(nextMax);
    spawnEnemiesByStage();

    // 🩸 HP 및 스킬 쿨타임 완전 초기화
    allies.forEach(a => {
        if (a) {
            a.hp = a.maxHp;
            a.cooldownLeft = a.cooldownMax;
            a.skillReady = false;
        }
    });
    HP.current = HP.max;
    updateAllyHPBar();
    updateAllAllyUI?.();

    // 🔄 모험 상태 초기화 (이제 해도 됨)
    clearAdventureState();

    // 🧭 턴/보드 초기화
    initPuzzleBoard();
    turnMovesLeft = turnMovesMax;
    updateTurnGauge();

    // 💾 새 상태 저장
    saveAdventureState();
}

// 아군 전멸 → 퍼즐만 초기화
function onPartyDefeated() {
    clearAdventureState();
    initPuzzleBoard();                 // 새 퍼즐
    turnMovesLeft = turnMovesMax;
    allies.forEach(a => {
        if (a) {
            a.hp = a.maxHp;
            a.cooldownLeft = a.cooldownMax;
            a.skillReady = false;
        }
    });
    updateTurnGauge();
    saveAdventureState();
}

// 초기 진입 시 적 HP 바 세팅
document.addEventListener('DOMContentLoaded', () => {
    EnemyHP.init(1000);   // ← 시작값. 필요시 랭크/스테이지에 따라 조정
});

// === 퍼즐 초기화 ===
const elements = ["l", "m", "n", "e", "w", "s"];

function initPuzzleBoard() {
    const slots = document.querySelectorAll(".puzzle-slot");
    slots.forEach(slot => {
        const element = elements[Math.floor(Math.random() * elements.length)];
        slot.dataset.element = element;
        slot.style.backgroundImage = `url("icons/${element}.png")`;
        slot.style.backgroundSize = "cover";
    });
}

// === 퍼즐 유틸 함수 ===
function areAdjacent(slot1, slot2) {
    const slots = Array.from(document.querySelectorAll(".puzzle-slot"));
    const index1 = slots.indexOf(slot1);
    const index2 = slots.indexOf(slot2);

    const cols = 6; // 6열
    const row1 = Math.floor(index1 / cols), col1 = index1 % cols;
    const row2 = Math.floor(index2 / cols), col2 = index2 % cols;

    //대각선 허용return Math.abs(row1 - row2) <= 1 && Math.abs(col1 - col2) <= 1;
    return (
        (row1 === row2 && Math.abs(col1 - col2) === 1) || // 좌우
        (col1 === col2 && Math.abs(row1 - row2) === 1)    // 상하
    );
}

function swapSlots(slot1, slot2) {
    const elem1 = slot1.dataset.element;
    const elem2 = slot2.dataset.element;

    // 턴 시작: 키가 0이면 시작 자체 차단 (차감은 턴 종료 시)
    if (turnMovesLeft === turnMovesMax) {
        if (getRoseTotalNow() <= 0) {
            return;
        }
    }

    // === 데이터 교환 ===
    slot1.dataset.element = elem2;
    slot2.dataset.element = elem1;
    resetSlotIcon(slot1);
    resetSlotIcon(slot2);

    moveCount++;
    turnMovesLeft--;
    updateTurnGauge();

    // ✅ 기존: 마지막 이동 후 턴 종료 시도
    if (turnMovesLeft <= 0) {
        if (!isResolving) {
            isResolving = true;
            turnDamageTotal = 0;  // ✅ 이번 턴 합계 초기화
            resolveBoard();
        }
    }

    // 매칭 검사
    const board = getBoardState();
    const matches = findMatches(board);
    if (matches.length > 0) {
        applyHighlight(flattenMatches(matches));
    }
}

function getRoseTotalNow() {
    if (window.Rewards && window.Rewards._state) {
        return Number(window.Rewards._state.roseTotal || 0);
    }
    try {
        const obj = JSON.parse(localStorage.getItem('rewardsV1') || '{}') || {};
        return Number(obj.roseTotal || 0);
    } catch { return 0; }
}

let focusedSlot = null;

// 슬롯 클릭 이벤트
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".puzzle-slot").forEach(slot => {
        slot.addEventListener("click", (e) => {
            e.stopPropagation();

            if (focusedSlot) {
                if (areAdjacent(focusedSlot, slot)) {
                    swapSlots(focusedSlot, slot);
                    resetSlotIcon(focusedSlot);
                    focusedSlot.classList.remove("focused");
                    focusedSlot = null;
                    return;
                }
                resetSlotIcon(focusedSlot);
                focusedSlot.classList.remove("focused");
            }

            focusedSlot = slot;
            focusedSlot.classList.add("focused");
        });
    });
});



// 바깥 클릭 시 포커스 해제
document.addEventListener("click", () => {
    if (focusedSlot) {
        resetSlotIcon(focusedSlot);
        focusedSlot.classList.remove("focused");
        focusedSlot = null;
    }
});

function resetSlotIcon(slot) {
    if (!slot) return;

    const element = slot.dataset.element;
    if (!element || element === "undefined") {
        slot.style.backgroundImage = "none";
        return;
    }

    slot.style.backgroundImage = `url("icons/${element}.png")`;
    slot.style.backgroundSize = "cover";
}

// 상, 하, 좌, 우, ↘, ↖, ↙, ↗
const directions = [
    [0, 1], [0, -1], [1, 0], [-1, 0],
    [1, 1], [-1, -1], [1, -1], [-1, 1]
];

// 매칭 탐색 함수
function findMatches(board) {
    const matches = [];
    const rows = 5, cols = 6;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const element = board[r][c];
            if (!element) continue;

            directions.forEach(([dr, dc]) => {
                let group = [[r, c]];

                // 가로(0,1), 세로(1,0)는 3개 검사
                let required = (dr === 0 || dc === 0) ? 3 : 4;
                for (let i = 1; i < required; i++) {
                    const nr = r + dr * i, nc = c + dc * i;
                    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break;
                    if (board[nr][nc] === element) {
                        group.push([nr, nc]);
                    } else break;
                }

                // 방향별로 다른 기준 적용
                if ((dr === 0 || dc === 0) && group.length >= 3) {
                    matches.push(group);
                }
                if ((dr !== 0 && dc !== 0) && group.length >= 4) {
                    matches.push(group);
                }
            });
        }
    }
    return matches;
}

// 퍼즐판을 2차원 배열로 구성하는 헬퍼 (dataset.element 기반)
function getBoardState() {
    const slots = document.querySelectorAll(".puzzle-slot");
    const rows = 5; // 세로 고정
    const cols = 6; // 가로 고정
    const board = [];

    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            row.push(slots[idx].dataset.element);
        }
        board.push(row);
    }
    return board;
}

function flattenMatches(matches) {
    const set = new Set();
    matches.forEach(group => {
        group.forEach(([r, c]) => set.add(`${r},${c}`));
    });
    return Array.from(set).map(str => str.split(",").map(Number));
}

// 매칭된 칸에 하이라이트 클래스 부여
function applyHighlight(matches) {
    const allSlots = document.querySelectorAll(".puzzle-slot");

    if (matches.length === 0) {
        return; // 기존 highlight 유지
    }

    // 기존 하이라이트 제거 후 다시 적용
    allSlots.forEach(slot => slot.classList.remove("highlight"));

    matches.forEach(([r, c]) => {
        const idx = r * 6 + c; // 6열 기준 인덱스
        const slot = allSlots[idx];
        if (slot) slot.classList.add("highlight");
    });
}

const board = getBoardState();
const matches = findMatches(board);
applyHighlight(flattenMatches(matches));

window.addEventListener("load", () => {
    const board = getBoardState();
    const matches = findMatches(board);
    applyHighlight(flattenMatches(matches));
});

function clearMatches(matches) {
    const allSlots = document.querySelectorAll(".puzzle-slot");

    matches.forEach(([r, c]) => {
        const idx = r * 6 + c;
        const slot = allSlots[idx];
        if (slot) {
            // 데이터와 아이콘 비움
            slot.dataset.element = "";
            slot.style.backgroundImage = "none";
            slot.classList.remove("highlight");
        }
    });
}

function applyGravity() {
    const rows = 5;
    const cols = 6;
    const allSlots = document.querySelectorAll(".puzzle-slot");

    for (let c = 0; c < cols; c++) {
        // 🔽 1) 현재 열의 블록들을 아래로 압축
        const stack = [];
        for (let r = 0; r < rows; r++) {
            const idx = r * cols + c;
            const slot = allSlots[idx];
            if (slot.dataset.element) {
                stack.push(slot.dataset.element);
            }
        }

        // 🔽 2) 아래 행부터 다시 채움
        for (let r = rows - 1; r >= 0; r--) {
            const idx = r * cols + c;
            const slot = allSlots[idx];

            if (stack.length > 0) {
                const elem = stack.pop();
                slot.dataset.element = elem;
                slot.style.backgroundImage = `url("icons/${elem}.png")`;
                slot.style.backgroundSize = "cover";
            } else {
                // 비었으면 새 랜덤 생성
                const newElem = getRandomElement();
                slot.dataset.element = newElem;
                slot.style.backgroundImage = `url("icons/${newElem}.png")`;
                slot.style.backgroundSize = "cover";
            }
        }
    }
}

function getRandomElement() {
    const elements = ["l", "s", "m", "w", "e", "n"]; // 원소 종류
    const rand = Math.floor(Math.random() * elements.length);
    return elements[rand];
}
function refillTopRow() {
    const cols = 6; // 0~5
    const allSlots = document.querySelectorAll(".puzzle-slot");

    for (let c = 0; c < cols; c++) {
        const idx = 0 * cols + c;
        const slot = allSlots[idx];

        if (!slot.dataset.element) { // 비어있으면 랜덤 원소 투입
            const newElem = getRandomElement();
            slot.dataset.element = newElem;
            slot.style.backgroundImage = `url("icons/${newElem}.png")`;
        }
    }
}

function resolveBoard() {
    let boardChanged = true;

    while (boardChanged) {
        const board = getBoardState();
        const matches = findMatches(board);
        const flat = flattenMatches(matches);

        if (flat.length > 0) {
            clearMatches(flat);     // 제거
            applyGravity();         // 중력
            refillTopRow();         // 리필
        } else {
            boardChanged = false;   // 매칭 없으면 반복 종료
        }
    }

    // 모든 연쇄 끝난 후 카운터 초기화
    moveCount = 0;
}

function resolveBoardStep() {
    const board = getBoardState();
    const matches = findMatches(board);
    const flat = flattenMatches(matches);

    if (flat.length > 0) {
        // 1) 하이라이트 표시
        applyHighlight(flat);

        // ✅ 2) 원소별 매칭 개수 계산
        const matchResults = {};
        flat.forEach(([r, c]) => {
            const idx = r * 6 + c;
            const slot = document.querySelectorAll(".puzzle-slot")[idx];
            const elem = slot.dataset.element;
            if (!elem) return;
            matchResults[elem] = (matchResults[elem] || 0) + 1;
        });

        // ✅ 3) 전투 처리 함수 호출
        applyCombatResults(matchResults);

        // 4) 잠깐 보여준 뒤 폭파
        setTimeout(() => {
            clearMatches(flat);

            // 5) 중력 적용
            setTimeout(() => {
                applyGravity();

                // 6) 리필 후 재스캔
                setTimeout(() => {
                    resolveBoardStep();
                }, 300);
            }, 500);
        }, 300);
    } else {
        // 모든 연쇄 종료

        // 🔻 여기에서 한 턴 소비 처리 (정확히 1회)
        if (!consumeTurnKey()) {
            // 키가 모자라면 다음 턴 시작 불가하게 안내 (원하면 추가 처리)
            console.warn('로즈키 부족: 다음 턴 시작 불가');
        }

        // ✅ 이번 턴 총 데미지를 적에게 적용
        if (turnDamageTotal > 0) {
            EnemyHP.damage(turnDamageTotal);
            turnDamageTotal = 0;   // 다음 턴 대비 초기화
        }

        handleTurnAdvance();  
        moveCount = 0;

        // (있는 경우) 이번 턴 로그 출력/초기화
        combatLog.forEach(line => console.log(line));
        combatLog = [];



        // ✅ 다음 턴 준비: 게이지/표시 리셋
        turnMovesLeft = turnMovesMax;
        updateTurnGauge();

        // ✅ 이번 턴 총 데미지를 적에게 적용
        if (turnDamageTotal > 0) {
            EnemyHP.damage(turnDamageTotal);
            turnDamageTotal = 0;
        }

        // ✅ 연쇄/정산이 끝난 '안정 상태'에서 저장
        saveAdventureState();

        // ✅ resolveBoard 재진입 가능 상태로 복귀
        isResolving = false;
    }
}

function consumeTurnKey() {
    // Rewards가 준비된 정상 경로
    if (window.Rewards && typeof window.Rewards.consumeRose === 'function') {
        const ok = window.Rewards.consumeRose(1);
        if (!ok) {
            return false;
        }
        const roseUI = document.getElementById('roseKeyCount');
        if (roseUI) roseUI.textContent = window.Rewards._state.roseTotal;
        return true;
    }

    // 🔁 Fallback: Rewards 미초기화 시에도 'rewardsV1'만 수정 (단일 소스 유지)
    try {
        const obj = JSON.parse(localStorage.getItem('rewardsV1') || '{}') || {};
        const cur = Number(obj.roseTotal || 0);
        if (cur <= 0) {
            return false;
        }
        obj.roseTotal = cur - 1;
        localStorage.setItem('rewardsV1', JSON.stringify(obj));
        // 전역 UI 동기화(헤더/모험 동시 반영)
        window.dispatchEvent(new CustomEvent('rewards:update'));
        const roseUI = document.getElementById('roseKeyCount');
        if (roseUI) roseUI.textContent = obj.roseTotal;
        return true;
    } catch {
        alert('로즈키 차감 중 오류');
        return false;
    }
}


// 기존 resolveBoard 호출부에서 이 함수로 교체
function resolveBoard() {
    resolveBoardStep();
}


// 아군 팀 데이터 밸런스
const allies = [
    { id: 1, name: "리더", element: "", attack: 50, heal: 5, maxHp: 1000, hp: 1000 },
    { id: 2, name: "현무", element: "n", attack: 10, heal: 5, maxHp: 100, hp: 100 },
    { id: 3, name: "주작", element: "s", attack: 10, heal: 5, maxHp: 100, hp: 100 },
    { id: 4, name: "청룡", element: "e", attack: 10, heal: 5, maxHp: 100, hp: 100 },
    { id: 5, name: "백호", element: "w", attack: 10, heal: 5, maxHp: 100, hp: 100 },
    { id: 6, name: "기린", element: "m", attack: 10, heal: 5, maxHp: 100, hp: 100 }
];

// 전투 로그 관리
let combatLog = [];

function getTotalHP() {
    return allies.slice(1).reduce((sum, u) => sum + u.hp, 0);
}

// ===== 아군 HP바 업데이트 =====
function updateAllyHPBar() {
    const fill = document.querySelector(".hp-fill");
    const text = document.querySelector(".hp-text");
    const percent = (HP.current / HP.max) * 100;

    if (fill) fill.style.width = percent + "%";
    if (text) text.textContent = `${HP.current} / ${HP.max}`;
}

window.addEventListener('DOMContentLoaded', () => {
    const roseUI = document.getElementById('roseKeyCount');
    let val = 0;
    if (window.Rewards && window.Rewards._state) {
        val = Number(window.Rewards._state.roseTotal || 0);
    } else {
        try { val = Number(JSON.parse(localStorage.getItem('rewardsV1') || '{}').roseTotal || 0); }
        catch { val = 0; }
    }
    if (roseUI) roseUI.textContent = val;
});

// ====================== 속성 상성 (아군 기준, 상대등 지정 원본 유지) ======================
const ELEMENT_MULTIPLIER = {
    n: { m: 2, n: 0.5, default: 1 },
    s: { w: 2, e: 0.5, default: 1 },
    e: { s: 2, w: 0.5, default: 1 },
    w: { e: 2, s: 0.5, default: 1 },
    m: { n: 2, m: 0.5, default: 1 }
};

// ====================== 숫자 → 문자 매핑 ======================
const ATTR_NUM_TO_LETTER = {
    '1': 'n', // 어둠(현무)
    '2': 's', // 불(주작)
    '3': 'e', // 물(청룡)
    '4': 'w', // 바람(백호)
    '5': 'm'  // 빛(기린)
};

// ====================== 배율 계산 함수 ======================
function getDamageMultiplier(allyAttr, enemyAttr) {
    const table = ELEMENT_MULTIPLIER[allyAttr];
    if (!table) return 1;
    return table[enemyAttr] || table.default;
}

// ====================== 전투 결과 처리 ======================
function applyCombatResults(matches) {
    let totalDamage = 0;
    let totalHeal = 0;
    let totalIntendedHeal = 0;
    const effects = [];

    let totalMatchCount = 0;

    // 🧭 적 속성 정규화 (숫자 → 문자)
    let enemyAttr = window.currentEnemy?.attr ?? 'n';
    if (typeof enemyAttr === 'number' || /^\d+$/.test(String(enemyAttr))) {
        const key = String(enemyAttr);
        enemyAttr = ATTR_NUM_TO_LETTER[key] || String(enemyAttr);
    } else {
        enemyAttr = String(enemyAttr);
    }

    console.log('🎯 [DEBUG] enemyAttr(normalized):', enemyAttr);

    for (const [element, count] of Object.entries(matches)) {
        if (!count) continue;

        // 💖 회복 속성
        if (element === "l") {
            allies.slice(1).forEach((u) => {
                const intendedHeal = u.heal * count;
                const actualHeal = Math.min(intendedHeal, u.maxHp - u.hp);
                totalIntendedHeal += intendedHeal;
                if (actualHeal > 0) {
                    u.hp += actualHeal;
                    totalHeal += actualHeal;
                }
            });
            HP.changeHP(totalHeal);
        }

        // ⚔️ 공격 속성
        else {
            const ally = allies.find(u => u && u.element === element);
            if (ally) {
                // ✅ 아군 기준 상성 적용
                const mult = getDamageMultiplier(ally.element, enemyAttr);
                const baseDamage = ally.attack * count;
                const damage = Math.round(baseDamage * mult);

                totalDamage += damage;
                effects.push(() => showCombatEffect(ally.id, damage, false));

                console.log(`⚔️ [${ally.name}] → attr:${ally.element}, enemy:${enemyAttr}, count:${count}, mult:${mult}, dmg:${damage}`);
            }
            totalMatchCount += count;
        }
    }

    // 👑 리더(무속성)
    const leader = allies.find(u => u && !u.element);
    if (leader && totalMatchCount > 0) {
        const damage = leader.attack * totalMatchCount;
        totalDamage += damage;
        effects.push(() => showCombatEffect(leader.id, damage, false));
    }

    // ✅ 누적 피해만 기록 (즉시 반영 금지)
    turnDamageTotal += totalDamage;

    // ❤️ 회복 이펙트
    if (totalIntendedHeal > 0) {
        requestAnimationFrame(() => showHealTotalEffect(totalIntendedHeal));
    }

    // ✨ 공격 이펙트
    requestAnimationFrame(() => effects.forEach(fn => fn()));

    // UI 갱신
    updateAllyHPBar();
}


function showHealTotalEffect(value) {
    const hpBar = document.querySelector(".hp-bar");
    if (!hpBar) return;

    const indicator = document.createElement("div");
    indicator.className = "heal-indicator-bar";
    indicator.textContent = `+${value}`;

    // 🌟 body에 직접 붙임
    document.body.appendChild(indicator);

    // 🌟 위치 계산 (힐바의 중앙 위)
    const rect = hpBar.getBoundingClientRect();
    indicator.style.left = `${rect.left + rect.width / 2}px`;
    indicator.style.top = `${rect.top - 24}px`;

    setTimeout(() => {
        indicator.remove();
    }, 1200);
}


// 원소 → 아군 슬롯 매핑
const elementMap = {
    l: null, // life = 회복 전용 (캐릭터 없음)
    m: 6,    // mid = 기린 (일) → 6번 슬롯
    n: 2,    // north = 현무 (월) → 2번 슬롯
    e: 4,    // east = 청룡 (수) → 4번 슬롯
    w: 5,    // west = 백호 (목) → 5번 슬롯
    s: 3     // south = 주작 (화) → 3번 슬롯
};
// 아군 총 HP 계산
function sumAlliesHp() {
    if (!Array.isArray(allies)) return 0;
    return allies.reduce((sum, ally) => {
        if (!ally || typeof ally.hp !== "number") return sum;
        return sum + ally.hp;
    }, 0);
}

// 초기 세팅
document.addEventListener("DOMContentLoaded", () => {
    const baseHp = 0;
    const alliesHp = sumAlliesHp();
    HP.max = baseHp + alliesHp;
    HP.current = HP.max; // 시작 시 풀체력
    HP.updateBar();
});

function updateTurnGauge() {
    const segments = document.querySelectorAll(".skill-segment");
    segments.forEach((seg, index) => {
        // turnMovesLeft 만큼 왼쪽부터 켜짐
        if (index < turnMovesLeft) {
            seg.classList.add("active");
        } else {
            seg.classList.remove("active");
        }
    });
}
updateTurnGauge();

function showCombatEffect(index, value, isHeal = false) {
    const slots = document.querySelectorAll(".ally-slot");
    const target = slots[index - 1];
    if (!target) return;

    const indicator = document.createElement("div");
    indicator.className = isHeal ? "heal-indicator" : "damage-indicator";
    indicator.textContent = `${isHeal ? '+' : ''}${value}`;
    target.appendChild(indicator);

    // 애니메이션 후 제거
    setTimeout(() => {
        indicator.remove();
    }, 2500);
}

// 전역에 이미 있으면 생략 가능
let isDefeated = false;

function applyEnemyAttack(damageValue) {
    // 🛡️ 무적 판정 (가장 먼저 수행)
    if (window.nextTurnInvincible > 0) {
        console.log("🛡️ 월광수호 발동! 이번 턴 피해 0");
        // ① 이번 턴 공격은 무시 하고
        // ② 턴 이 끝난 뒤(즉 handleTurnAdvance에서) 감소시키게 한다
        return;
    }

    // ⚔️ 실제 데미지 적용
    HP.current = Math.max(0, HP.current - damageValue);
    HP.updateBar();

    // 💥 시각 효과
    const hpText = document.querySelector(".hp-text");
    if (hpText) {
        const indicator = document.createElement("div");
        indicator.className = "damage-indicator total";
        indicator.textContent = `-${damageValue}`;
        hpText.appendChild(indicator);
        setTimeout(() => indicator.remove(), 2000);
    }

    // 💀 전멸 판정
    if (!isDefeated && HP.current <= 0) {
        isDefeated = true;
        setTimeout(() => {
            if (confirm("💀 아군이 전멸했습니다!")) {
                const KEY = 'profileV1';
                let profile = {};
                try { profile = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { }
                const curRank = Number(profile.rank || 1);
                profile.rank = curRank > 3 ? curRank - 3 : 1;
                localStorage.setItem(KEY, JSON.stringify(profile));

                // 체력 완전 회복
                HP.current = HP.max;
                HP.updateBar();
                EnemyHP.current = EnemyHP.max;
                EnemyHP.updateBar();

                const rankBtn = document.getElementById('btnToggleFooterZ');
                if (rankBtn) rankBtn.textContent = `Rank ${profile.rank}`;

                if (typeof saveAdventureState === 'function') saveAdventureState();
                isDefeated = false;
            }
        }, 500);
    }
}

/* ======================= Allies: Skill Cooldown Fields ======================= */
/* 각 캐릭터에 스킬 쿨타임(최대/남은), 준비 여부, 잠금 여부 필드 부여 */
const SKILL_COOLDOWN_DEFAULTS = {
    1: 7,   // 리더: 7턴
    2: 3,   // 현무: 3턴
    3: 4,   // 주작: 4턴
    4: 5,   // 청룡: 5턴 
    5: 6,   // 백호: 6턴
    6: 7    // 기린: 7턴
};

allies.forEach(a => {
    const max = SKILL_COOLDOWN_DEFAULTS[a.id] ?? 0;
    a.cooldownMax = max;
    a.cooldownLeft = max > 0 ? max : 0;
    a.skillReady = false;
    a.locked = false;   // 잠금/봉인 상태 기본 false
});

/* ======================= Ally UI Overlays & Main Click ======================= */
/* ally-slot 위에 2개의 오버레이를 동적으로 부착:
   - LockOverlay: 잠금 시 아이콘 가림/클릭 차단
   - SkillHalo: 스킬 준비 시 메카블루 테두리(시각 전용, 포인터 통과)
   메인 클릭: 잠금이면 무시, 준비면 스킬창, 아니면 상태창 */

function initAllyOverlays() {
    const slots = document.querySelectorAll(".ally-slot");
    slots.forEach((slot, idx) => {
        const ally = allies[idx]; if (!ally) return;

        // 잠금 오버레이
        let lock = slot.querySelector(".ally-lock-overlay");
        if (!lock) {
            lock = document.createElement("div");
            lock.className = "ally-lock-overlay";
            Object.assign(lock.style, {
                position: "absolute", inset: "0", background: "rgba(0,0,0,0.65)",
                display: "none", zIndex: "3", backdropFilter: "blur(1px)",
                pointerEvents: "auto" // 잠금 시 클릭 차단
            });
            // 잠금 아이콘(간단)
            const icon = document.createElement("div");
            Object.assign(icon.style, {
                position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
                fontSize: "20px", color: "#ddd"
            });
            icon.textContent = "🔒";
            lock.appendChild(icon);
            slot.style.position = slot.style.position || "relative";
            slot.appendChild(lock);
        }

        // 스킬 준비 테두리
        let halo = slot.querySelector(".ally-skill-halo");
        if (!halo) {
            halo = document.createElement("div");
            halo.className = "ally-skill-halo";
            Object.assign(halo.style, {
                position: "absolute", inset: "0", border: "2px solid #00B8FF",
                borderRadius: "10px", boxShadow: "0 0 12px #00B8FF",
                display: "none", zIndex: "2", pointerEvents: "none" // 클릭 통과
            });
            slot.style.position = slot.style.position || "relative";
            slot.appendChild(halo);
        }

        // 메인 클릭(버튼 역할)
        slot.addEventListener("click", () => {
            if (ally.locked) return; // 봉인 시 무시
            if (ally.cooldownMax > 0 && ally.skillReady) {
                openSkillWindow(ally); // 스킬창
            } else {
                openStatusWindow(ally); // 상태창
            }
        });
    });

    updateAllAllyUI();
}

/* ======================= UI State Updates ======================= */
function updateAllAllyUI() {
    const slots = document.querySelectorAll(".ally-slot");
    slots.forEach((slot, idx) => updateAllyUI(slot, allies[idx]));
}

function updateAllyUI(slot, ally) {
    if (!slot || !ally) return;
    const lock = slot.querySelector(".ally-lock-overlay");
    const halo = slot.querySelector(".ally-skill-halo");

    // 잠금 표시
    if (lock) lock.style.display = ally.locked ? "block" : "none";

    // 스킬 준비 표시(깜빡임)
    if (halo) {
        if (ally.skillReady) {
            halo.style.display = "block";
            halo.style.animation = "allyHaloPulse 1s infinite";
        } else {
            halo.style.display = "none";
            halo.style.animation = "none";
        }
    }
}

/* ======================= Cooldown Progress & Skill Use ======================= */
/* 턴 종료 시 호출: 쿨타임 진행 & 준비 상태 갱신 */
function progressSkillCooldowns() {
    allies.forEach(a => {
        if (!a || a.locked || a.cooldownMax <= 0) return;
        if (a.cooldownLeft > 0) {
            a.cooldownLeft--;
            if (a.cooldownLeft === 0) a.skillReady = true;
        }
    });
    updateAllAllyUI();
}

/* 스킬 사용 시 호출: 쿨타임 리셋 */
function consumeSkill(ally) {
    if (!ally || ally.cooldownMax <= 0) return;
    ally.skillReady = false;
    ally.cooldownLeft = ally.cooldownMax;
    updateAllAllyUI();
}

/* 잠금/봉인 토글(외부 시스템에서 호출) */
function setAllyLocked(allyId, locked) {
    const a = allies.find(x => x && x.id === allyId); if (!a) return;
    a.locked = !!locked;
    updateAllAllyUI();
}

/* 쿨타임 수동 설정(필요시) */
function setAllyCooldown(allyId, max, left = max) {
    const a = allies.find(x => x && x.id === allyId); if (!a) return;
    a.cooldownMax = Math.max(0, max | 0);
    a.cooldownLeft = Math.max(0, Math.min(a.cooldownMax, left | 0));
    a.skillReady = (a.cooldownMax > 0 && a.cooldownLeft === 0);
    updateAllAllyUI();
}

/* ======================= Hooks (초기화 & 턴 종료 연동) ======================= */
document.addEventListener("DOMContentLoaded", () => {
    initAllyOverlays();
});

/* ★ 턴 종료 시점에 아래 함수를 반드시 호출하세요.
   - 예) resolveBoard() 마지막(연쇄 종료 후)에서 progressSkillCooldowns()
*/
function onTurnEnded_ForSkills() {
    progressSkillCooldowns();
}

/* ======================= Stubs: 창 오픈 함수 ======================= */
/* 실제 UI 연동부는 프로젝트 규칙에 맞게 교체 */
function openStatusWindow(ally) {
    // TODO: 상태창 열기 (이름/공격/체력/쿨타임 등 표시)
    console.log(`[상태창] ${ally.name} HP:${ally.hp}/${ally.maxHp} CD:${ally.cooldownLeft}/${ally.cooldownMax}`);
}

/* ======================= Inline Keyframes (JS 삽입) ======================= */
(function injectHaloKeyframes() {
    const id = "allyHaloPulseKeyframes";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
  @keyframes allyHaloPulse {
    0% { box-shadow: 0 0 6px #00B8FF; transform: scale(1.00); }
    50%{ box-shadow: 0 0 16px #00B8FF; transform: scale(1.02); }
    100%{ box-shadow: 0 0 6px #00B8FF; transform: scale(1.00); }
  }`;
    document.head.appendChild(style);
})();

/* ======================= Modal Helpers ======================= */
function showBackdrop(show) {
    const bd = document.getElementById('modal-backdrop');
    if (!bd) return;
    bd.style.display = show ? 'block' : 'none';
}
function showModal(el, show) {
    if (!el) return;
    el.style.display = show ? 'flex' : 'none';
    showBackdrop(show);
}
function bindModalClose(container) {
    container.querySelectorAll('[data-close]').forEach(btn => {
        btn.onclick = () => showModal(container, false);
    });
}


//* ======================= 팝업 구현체 ======================= */
function openStatusWindow(ally) {
    const modal = document.getElementById('ally-status-modal');
    if (!modal) return;

    const portraitEl = document.getElementById('allyStatusPortrait');
    const titleEl = modal.querySelector('.ally-modal__title');
    const contentEl = document.getElementById('ally-status-content');

    // 🖼️ 캐릭터 초상 표시
    if (portraitEl) {
        const fallback = ally.element ? `icons/${ally.element}l.png` : `icons/ll.png`;
        portraitEl.src = fallback;
        portraitEl.alt = ally.name;
    }

    // 🏷️ 이름 표시
    if (titleEl) titleEl.textContent = ally.name;

    // 📊 능력치 표시
    if (contentEl) {
        contentEl.innerHTML = `
      <p><strong>HP:</strong> ${ally.hp} / ${ally.maxHp}</p>
      <p><strong>Attack:</strong> ${ally.attack}</p>
      <p><strong>Heal:</strong> ${ally.heal}</p>
      <p><strong>Cooldown:</strong> ${ally.cooldownLeft} / ${ally.cooldownMax}</p>
    `;
    }

    // 모달 표시
    showModal(modal, true);

    // 🎨 아이콘 변경 버튼
    const changeBtn = modal.querySelector('.ally-modal__footer .ally-modal__ok:not(#enhance-button):not([data-close])');
    if (changeBtn) {
        changeBtn.onclick = () => startChangeIconFlow(ally);
    }

    // 🩹 복구 버튼 (현재 캐릭터만 초기화)
    const restoreBtn = modal.querySelector('#restore-button');
    if (restoreBtn) {
        restoreBtn.onclick = () => {
            try {
                // ally.id가 1~6 숫자라고 가정 (h1~h6)
                const slot = document.getElementById('h' + ally.id);
                if (!slot) {
                    alert('⚠️ 복구할 슬롯을 찾을 수 없습니다.');
                    return;
                }

                const img = slot.querySelector('img');
                if (!img) {
                    alert('⚠️ 해당 슬롯의 이미지 요소가 없습니다.');
                    return;
                }

                // 기본 아이콘 경로 재설정
                const path = `icons/h${ally.id}.png`;
                img.src = path;
                img.alt = `ally ${ally.id}`;

                // 로컬스토리지 갱신
                localStorage.setItem(`allyIcon:${ally.id}`, path);

                // 필요 시 브로드캐스트 (다른 화면 반영용)
                window.dispatchEvent(new CustomEvent('allyIcon:resetOne', { detail: ally.id }));

            } catch (e) {
                console.error(e);
            }
        };
    }

}
// ======================= 강화 로직 (실버키 / 골드키 분리형 + 즉시 반영형) =======================
function enhanceCharacter(target) {
    if (!target || !target.id) return;

    // 🔹 Rewards 미정의 시 복구 시도
    if (!window.Rewards || !window.Rewards._state) {
        try {
            const saved = JSON.parse(localStorage.getItem("rewardsV1") || "{}");
            window.Rewards = { _state: saved };
            console.warn("⚠️ Rewards 복구 시도:", saved);
        } catch {
            alert("보상 시스템이 초기화되지 않았습니다!");
            return;
        }
    }

    const R = window.Rewards?._state;
    if (!R) { alert("보상 시스템이 초기화되지 않았습니다!"); return; }

    // 🥇 리더 전용 (골드키)
    if (target.id === 1) {
        if (R.goldTotal <= 0) {
            alert("⚠️ 골드키가 부족합니다!");
            return;
        }

        target.attack += 500;
        target.maxHp += 1000;
        target.heal += 200;
        target.hp = target.maxHp;

        R.goldTotal--;
        alert(`👑 ${target.name} 강화 완료! (골드키 -1)`);
    }

    // 🥈 일반 아군 전용 (실버키)
    else {
        if (R.silverTotal <= 0) {
            alert("⚠️ 실버키가 부족합니다!");
            return;
        }

        target.attack += 100;
        target.maxHp += 250;
        target.heal += 100;
        target.hp = Math.min(target.hp + 250, target.maxHp);

        R.silverTotal--;
        alert(`🛡️ ${target.name} 강화 완료! (실버키 -1)`);
    }

    // 💾 키 상태 저장 및 헤더 UI 갱신
    localStorage.setItem("rewardsV1", JSON.stringify(R));
    window.dispatchEvent(new CustomEvent('rewards:update'));

    // 🩸 HP 및 아군 UI 갱신 (즉시 반영)
    recalcTotalHP();           // 파티 전체 HP바 재계산
    updateAllAllyUI?.();       // 아군 전체 UI 갱신
    updateAllyHPBar?.();       // 개별 HP바 갱신

    // ⚙️ 상태창(열린 경우) 즉시 갱신
    const contentEl = document.getElementById('ally-status-content');
    if (contentEl) {
        contentEl.innerHTML = `
            <p><strong>HP:</strong> ${target.hp} / ${target.maxHp}</p>
            <p><strong>Attack:</strong> ${target.attack}</p>
            <p><strong>Heal:</strong> ${target.heal}</p>
            <p><strong>Cooldown:</strong> ${target.cooldownLeft} / ${target.cooldownMax}</p>
        `;
    }

    // ✅ 강화된 아군 정보도 저장 (새로고침 후에도 유지)
    try {
        const advData = JSON.parse(localStorage.getItem(ADV_LS_KEY) || "{}");
        advData.allies = allies.map(a => ({
            id: a.id,
            name: a.name,
            element: a.element,
            attack: a.attack,
            heal: a.heal,
            maxHp: a.maxHp,
            hp: a.hp,
            cooldownLeft: a.cooldownLeft,
            cooldownMax: a.cooldownMax,
            skillReady: a.skillReady
        }));
        // 🩸 파티 전체 HP값도 함께 저장
        advData.ally = {
            max: HP.max,
            current: HP.current
        };
        localStorage.setItem(ADV_LS_KEY, JSON.stringify(advData));
    } catch (e) {
        console.warn("⚠️ 강화 데이터 저장 중 오류:", e);
    }

    console.log(`💪 강화 완료: ${target.name} (ATK:${target.attack}, HP:${target.maxHp}, HEAL:${target.heal})`);
}


// ======================= 강화 버튼 이벤트 =======================
document.addEventListener('DOMContentLoaded', () => {
    const enhanceBtn = document.getElementById('enhance-button');
    if (!enhanceBtn) return;

    enhanceBtn.addEventListener('click', () => {
        const modal = document.getElementById('ally-status-modal');
        if (!modal || modal.style.display === 'none') return;

        // 현재 열린 캐릭터
        const name = modal.querySelector('.ally-modal__title')?.textContent?.trim();
        const ally = allies.find(a => a.name === name);
        if (!ally) {
            alert('강화할 대상을 찾을 수 없습니다.');
            return;
        }

        // 강화 실행
        enhanceCharacter(ally);
    });
});

// ====================== 스킬 정보 정의 ======================
const SKILLS = {
    n: {
        name: "월광수호(月光守護)",
        desc: "퍼즐판의 월(N) 속성을 전부 파괴하고, 다음 턴에 받는 데미지를 0으로 만든다.",
        effect() {
            const slots = document.querySelectorAll(".puzzle-slot");
            slots.forEach(slot => {
                if (slot.dataset.element === "n") {
                    slot.dataset.element = "";
                    slot.style.backgroundImage = "none";
                }
            });
            window.nextTurnInvincible = 1;
            console.log("🌕 현무 - 월광수호 발동!");
        }
    },
    s: {
        name: "화수변(火水變)",
        desc: "퍼즐판의 수(E) 속성을 전부 화(S) 속성으로 바꾸고, 바뀐 퍼즐 하나당 HP 50 회복.",
        effect() {
            const slots = document.querySelectorAll(".puzzle-slot");
            let converted = 0;
            slots.forEach(slot => {
                if (slot.dataset.element === "e") {
                    slot.dataset.element = "s";
                    slot.style.backgroundImage = `url('icons/s.png')`;
                    converted++;
                }
            });
            const heal = converted * 50;
            HP.changeHP(heal);
            showHealTotalEffect(heal);
            console.log(`🔥 주작 - 화수변 발동! ${converted}개 변환, ${heal} 회복`);
        }
    },
    e: {
        name: "수룡탄(水龍彈)",
        desc: "이번 턴 동안 청룡의 공격력을 2배로 올린다.",
        effect() {
            const ally = allies.find(a => a.element === "e");
            if (ally) {
                ally.attack *= 2;
                setTimeout(() => (ally.attack /= 2), 10000);
            }
            console.log("🌊 청룡 - 수룡탄 발동! 공격력 2배");
        }
    },
    w: {
        name: "서목창(西木槍)",
        desc: "퍼즐판의 목(W) 속성 퍼즐 하나당 적에게 100의 데미지를 준다.",
        effect() {
            const slots = document.querySelectorAll(".puzzle-slot");
            let count = 0;
            slots.forEach(slot => {
                if (slot.dataset.element === "w") count++;
            });
            const dmg = count * 100;
            EnemyHP.damage(dmg);
            console.log(`🐯 백호 - 서목창 발동! ${count}개 → ${dmg} 피해`);
        }
    },
    m: {
        name: "생월일변(生月日變)",
        desc: "퍼즐판의 생명(L), 월(N) 속성을 전부 일(M) 속성으로 바꾼다.",
        effect() {
            const slots = document.querySelectorAll(".puzzle-slot");
            let changed = 0;
            slots.forEach(slot => {
                if (slot.dataset.element === "l" || slot.dataset.element === "n") {
                    slot.dataset.element = "m";
                    slot.style.backgroundImage = `url('icons/m.png')`;
                    changed++;
                }
            });
            console.log(`🦌 기린 - 생월일변 발동! ${changed}개 변환`);
        }
    },
    leader: {
        name: "천변일격(天變一擊)",
        desc: "현재 퍼즐판에서 가장 많은 속성의 돌을 전부 파괴하고, 그 개수 × 100 데미지를 준다.",
        effect() {
            const slots = document.querySelectorAll(".puzzle-slot");
            const countMap = {};

            // 1️⃣ 각 속성별 개수 세기
            slots.forEach(slot => {
                const el = slot.dataset.element;
                if (!el) return;
                countMap[el] = (countMap[el] || 0) + 1;
            });

            // 2️⃣ 가장 많은 속성 찾기
            let topElement = null;
            let topCount = 0;
            for (const [el, cnt] of Object.entries(countMap)) {
                if (cnt > topCount) {
                    topElement = el;
                    topCount = cnt;
                }
            }

            if (!topElement || topCount === 0) {
                console.log("⚠️ 파괴할 퍼즐이 없습니다.");
                return;
            }

            // 3️⃣ 해당 속성 퍼즐 전부 제거
            slots.forEach(slot => {
                if (slot.dataset.element === topElement) {
                    slot.dataset.element = "";
                    slot.style.backgroundImage = "none";
                }
            });

            // 4️⃣ 데미지 계산 및 적용
            const dmg = topCount * 100;
            EnemyHP.damage(dmg);
            console.log(`👑 리더 - 천변일격 발동! (${topElement}) ${topCount}개 파괴, ${dmg} 피해`);
        }
    }
};


let _skillTarget = null;
// ====================== 스킬창 표시 / 사용 로직 ======================
function openSkillWindow(ally) {
    const modal = document.getElementById("ally-skill-modal");
    if (!modal) return;

    const titleEl = modal.querySelector(".ally-modal__title");
    const descEl = document.getElementById("ally-skill-content");
    const useBtn = document.getElementById("btn-skill-use");
    const cancelBtn = modal.querySelector(".ally-modal__cancel");

    // 스킬 정보 가져오기 (리더 포함)
    let skill;
    if (ally.id === 1) {
        skill = SKILLS["leader"];
    } else {
        skill = SKILLS[ally.element];
    }
    if (!skill) {
        if (titleEl) titleEl.textContent = "스킬 없음";
        if (descEl) descEl.textContent = "이 아군은 스킬을 사용할 수 없습니다.";
        showModal(modal, true);
        return;
    }

    // 이름과 설명 세팅
    if (titleEl) titleEl.textContent = skill.name || "스킬";
    if (descEl) descEl.textContent = skill.desc || "설명이 없습니다.";

    // 버튼 이벤트 초기화
    if (useBtn) {
        useBtn.onclick = () => {
            try {
                // 스킬 효과 발동
                skill.effect();

                // 쿨타임 초기화
                ally.cooldownLeft = ally.cooldownMax;
                ally.skillReady = false;

                // 상태 갱신
                updateAllAllyUI?.();
                showModal(modal, false);

                console.log(`✅ ${ally.name} 스킬 "${skill.name}" 발동 완료`);
            } catch (err) {
                console.error("스킬 발동 중 오류:", err);
            }
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => showModal(modal, false);
    }

    // 모달 표시
    showModal(modal, true);
}

document.addEventListener("DOMContentLoaded", () => {
  // 상태창/스킬창 닫기 버튼 기능
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = btn.closest(".ally-modal");
      if (modal) {
        modal.style.display = "none";
        const backdrop = document.getElementById("modal-backdrop");
        if (backdrop) backdrop.style.display = "none";
      }
    });
  });

  // 백드롭 클릭 시 모달 닫기
  const backdrop = document.getElementById("modal-backdrop");
  if (backdrop) {
    backdrop.addEventListener("click", () => {
      document.querySelectorAll(".ally-modal").forEach((modal) => {
        modal.style.display = "none";
      });
      backdrop.style.display = "none";
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('btnToggleFooterZ');
    const footer = document.querySelector('footer');
    let footerZHigh = false;

    if (toggleBtn && footer) {
        toggleBtn.addEventListener('click', () => {
            footerZHigh = !footerZHigh;
            footer.style.zIndex = footerZHigh ? '6000' : '1000';

            // ✅ 푸터 닫힐 때, 팝업을 완전히 숨기지 않고 zIndex만 초기화
            if (!footerZHigh) {
                document.querySelectorAll('.popup.show').forEach(p => {
                    p.classList.remove('show');
                    // 팝업은 닫은 표시만, display는 그대로 둠
                });
            }
        });
    }
});



function updateStageButtonText() {
    const btnStage = document.getElementById('btnToggleFooterZ');
    if (!btnStage) return;

    const stage = localStorage.getItem('currentStage') || 1;
    btnStage.textContent = `Rank ${stage}`;
}

function startNextStage() {
    const next = Number(localStorage.getItem('currentStage') || 1) + 1;
    localStorage.setItem('currentStage', next);
    restoreAdventureState();
    updateStageButtonText();
}
document.addEventListener('DOMContentLoaded', () => {
    updateStageButtonText();
});

/* ======================= 아이콘 변경 (파일선택 + 크롭 + 저장) ======================= */
let _iconTargetAlly = null;
let _iconImg = null;
let _iconScale = 1, _iconMinScale = 1;
let _iconPos = { x: 0, y: 0 };
let _drag = { active: false, sx: 0, sy: 0 };

const $file = () => document.getElementById('iconFileInput');
const $cropModal = () => document.getElementById('iconCropModal');
const $canvas = () => document.getElementById('iconCropCanvas');
const $zoom = () => document.getElementById('iconZoom');

function startChangeIconFlow(ally) {
    _iconTargetAlly = ally;
    const fi = $file();
    if (!fi) return;
    fi.value = "";          // 같은 파일 재선택 허용
    fi.onchange = onIconFileSelected;
    fi.click();
}

function onIconFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
        _iconImg = img;
        openCropper();
    };
    img.onerror = () => alert("이미지를 불러오지 못했습니다.");
    const reader = new FileReader();
    reader.onload = ev => { img.src = ev.target.result; };
    reader.readAsDataURL(file);
}

function openCropper() {
    const modal = $cropModal();
    const cvs = $canvas();
    const z = $zoom();
    if (!modal || !cvs || !z || !_iconImg) return;

    // 초기 배치: 캔버스를 꽉 채우는 cover 스케일
    const cw = cvs.width, ch = cvs.height;
    const iw = _iconImg.width, ih = _iconImg.height;
    _iconMinScale = Math.max(cw / iw, ch / ih);
    _iconScale = Math.max(_iconMinScale, 1);   // 기본 1배 이상
    _iconPos.x = (cw - iw * _iconScale) / 2;
    _iconPos.y = (ch - ih * _iconScale) / 2;

    z.min = (_iconMinScale).toFixed(2);
    z.max = "3.00";
    z.step = "0.01";
    z.value = String(_iconScale);

    bindCropperEvents();
    drawCropper();
    showModal(modal, true);
}

function bindCropperEvents() {
    const cvs = $canvas();
    const z = $zoom();
    if (!cvs || !z) return;

    // 줌 슬라이더
    z.oninput = () => {
        const cw = cvs.width, ch = cvs.height;
        const iw = _iconImg.width, ih = _iconImg.height;

        // 중심 기준 확대/축소
        const prev = _iconScale;
        _iconScale = Math.max(_iconMinScale, Math.min(3, Number(z.value) || _iconScale));
        const scaleRatio = _iconScale / prev;

        // 확대 시 중심 유지
        const cx = cw / 2, cy = ch / 2;
        _iconPos.x = cx - (cx - _iconPos.x) * scaleRatio;
        _iconPos.y = cy - (cy - _iconPos.y) * scaleRatio;

        clampPosition();
        drawCropper();
    };

    // 드래그(마우스/터치)
    const start = (x, y) => { _drag = { active: true, sx: x, sy: y }; };
    const move = (x, y) => {
        if (!_drag.active) return;
        _iconPos.x += (x - _drag.sx);
        _iconPos.y += (y - _drag.sy);
        _drag.sx = x; _drag.sy = y;
        clampPosition();
        drawCropper();
    };
    const end = () => { _drag.active = false; };

    // Pointer 이벤트 통합
    cvs.onpointerdown = (ev) => { cvs.setPointerCapture(ev.pointerId); start(ev.clientX, ev.clientY); };
    cvs.onpointermove = (ev) => move(ev.clientX, ev.clientY);
    cvs.onpointerup = end;
    cvs.onpointercancel = end;

    // 저장 버튼
    const saveBtn = document.getElementById('iconCropSave');
    if (saveBtn) {
        saveBtn.onclick = saveCroppedIcon;
    }

    // 모달의 data-close 버튼은 기존 bindModalClose로 닫힘
}

function clampPosition() {
    const cvs = $canvas();
    const iw = _iconImg.width, ih = _iconImg.height;
    const cw = cvs.width, ch = cvs.height;
    const vw = iw * _iconScale, vh = ih * _iconScale;

    // 이미지는 캔버스를 완전히 덮어야 함 → 가장자리 빈틈 방지
    if (vw <= cw) {
        _iconPos.x = (cw - vw) / 2;
    } else {
        const minX = cw - vw, maxX = 0;
        _iconPos.x = Math.max(minX, Math.min(maxX, _iconPos.x));
    }
    if (vh <= ch) {
        _iconPos.y = (ch - vh) / 2;
    } else {
        const minY = ch - vh, maxY = 0;
        _iconPos.y = Math.max(minY, Math.min(maxY, _iconPos.y));
    }
}

function drawCropper() {
    const cvs = $canvas(); if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const cw = cvs.width, ch = cvs.height;

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cw, ch);

    if (_iconImg) {
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(_iconImg, _iconPos.x, _iconPos.y, _iconImg.width * _iconScale, _iconImg.height * _iconScale);
    }
}

function saveCroppedIcon() {
    const cvs = $canvas();
    const modal = $cropModal();
    if (!cvs || !_iconTargetAlly) return;

    const dataUrl = cvs.toDataURL('image/png'); // 512×512 PNG
    try {
        localStorage.setItem(`allyIcon:${_iconTargetAlly.id}`, dataUrl);
    } catch (e) {
        alert("저장 공간이 부족합니다. 다른 아이콘을 일부 삭제해주세요.");
        return;
    }

    // 저장 직후 즉시 반영 (수정본)
    const slot = document.getElementById('h' + _iconTargetAlly.id);
    if (slot) {
        const img = slot.querySelector('img');
        if (img) img.src = dataUrl;       // ← 모험 6칸 중 해당 칸 업데이트
    }

    showModal(modal, false);
    // 필요 시: 커스텀 이벤트로 다른 UI 리프레시
    window.dispatchEvent(new CustomEvent('allyIcon:updated', { detail: { id: _iconTargetAlly.id } }));
}

// 로컬스토리지의 커스텀 아이콘을 6칸 슬롯에 반영
function applyCustomAllyIconsToSlots() {
    for (let i = 1; i <= 6; i++) {
        const slot = document.getElementById('h' + i);
        if (!slot) continue;
        const img = slot.querySelector('img');
        if (!img) continue;

        const custom = localStorage.getItem(`allyIcon:${i}`);
        if (custom) img.src = custom;   // 저장된 게 있으면 data URL 적용
        // 저장이 없으면 index.html의 기본 src 유지(icons/h{i}.png)
    }
}


// 첫 로딩 때 한 번 적용
document.addEventListener('DOMContentLoaded', () => {
    applyCustomAllyIconsToSlots();
});

document.addEventListener('DOMContentLoaded', () => {
  const restoredEnemy = restoreEnemyFromLocal();
  const restoredAdventure = restoreAdventureState();

  // 완전 신규일 때만 새 적 생성
  if (!restoredEnemy && !restoredAdventure) {
    EnemyHP.init(1000);
    spawnEnemiesByStage(); // 새 적 랜덤 생성
    initPuzzleBoard();
    turnMovesLeft = turnMovesMax;
    updateTurnGauge();
    saveAdventureState();
  }
});


// ====== spawnEnemiesByStage (수정/대체) ======
function spawnEnemiesByStage() {
    const profile = JSON.parse(localStorage.getItem('profileV1') || '{}');
    const stage = Number(profile.rank || 1);
    const isElite = stage % 5 === 0;

    const attrs = ['1', '2', '3', '4', '5'];
    const attr = attrs[Math.floor(Math.random() * attrs.length)];

    const codes = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];

    let selected = [];
    let tiers = [];

    if (isElite) {
        const patterns = [
            [1, 3, 2],
            [2, 3, 1],
            [2, 3, 2],
            [1, 3, 1]
        ];
        tiers = patterns[Math.floor(Math.random() * patterns.length)];
        const bossCode = codes[Math.floor(Math.random() * codes.length)];
        selected = [bossCode, bossCode, bossCode];
    } else {
        tiers = [1, 2, 1];
        const baseCode = codes[Math.floor(Math.random() * codes.length)];
        selected = [baseCode, baseCode, baseCode];
    }

    // 이미지 적용 — 티어에 따라 전역 리졸버 우선 사용
    ['left', 'center', 'right'].forEach((pos, i) => {
        const img = document.querySelector(`#monster-${pos} img`);
        if (!img) return;

        let src;
        if (tiers[i] === 3 && typeof window.getEliteIllustURL === 'function') {
            src = window.getEliteIllustURL(attr, selected[i]);
        } else if (tiers[i] === 2 && typeof window.getBossIllustURL === 'function') {
            src = window.getBossIllustURL(attr, selected[i]);
        } else {
            src = `enemy/${selected[i]}${tiers[i]}${attr}.png`;
        }

        img.src = src;
        console.log(`⚔️ ${pos}: ${src}`);
    });

    window.currentEnemy = { codes: selected, tiers, attr };

    localStorage.setItem(
        'enemyStateV1',
        JSON.stringify({ codes: selected, tiers, attr, maxHp: EnemyHP.max, currentHp: EnemyHP.current })
    );
    afterEnemySpawned();
}

// ====== restoreEnemyFromLocal (수정 / 복원시에도 리졸버 사용) ======
function restoreEnemyFromLocal() {
    const savedEnemy = localStorage.getItem('enemyStateV1');
    if (!savedEnemy) return false;

    try {
        const e = JSON.parse(savedEnemy);
        if (e.codes && e.tiers && e.attr) {
            EnemyHP.max = e.maxHp || 1000;
            EnemyHP.current = e.currentHp ?? EnemyHP.max;
            EnemyHP.updateBar();

            ['left', 'center', 'right'].forEach((pos, i) => {
                const img = document.querySelector(`#monster-${pos} img`);
                if (!img) return;
                let src;
                if (e.tiers[i] === 3 && typeof window.getEliteIllustURL === 'function') {
                    src = window.getEliteIllustURL(e.attr, e.codes[i]);
                } else if (e.tiers[i] === 2 && typeof window.getBossIllustURL === 'function') {
                    src = window.getBossIllustURL(e.attr, e.codes[i]);
                } else {
                    src = `enemy/${e.codes[i]}${e.tiers[i]}${e.attr}.png`;
                }
                img.src = src;
            });

            window.currentEnemy = { codes: e.codes, tiers: e.tiers, attr: e.attr };

            // ✅ 턴 UI 복원 추가
            initEnemyTurnUI();
            updateEnemyTurnUI();

            return true;
        }
    } catch (err) {
        console.warn('enemyStateV1 복원 실패', err);
    }
    return false;
}

// ====== 도감 변경 이벤트 수신 — 모험 중이면 즉시 갱신 ======
window.addEventListener('bestiary:update', (ev) => {
    try {
        const detail = ev?.detail || {};
        const changedAttr = String(detail.attr);   // 예: '1','2',... (도감에서 저장한 값)
        const changedMotif = String(detail.motif); // 예: 'a','b',...

        // 현재 전투 중인 적 정보가 없으면 무시
        if (!window.currentEnemy) return;

        // 현재 적과 속성이 같고, 코드(모티프)가 일치하며 해당 위치가 엘리트(티어 3)라면 업데이트
        const { codes, tiers, attr } = window.currentEnemy;
        if (!codes || !tiers) return;

        // attr 비교는 엄격하게 문자열로
        if (String(attr) !== String(changedAttr)) return;

        ['left', 'center', 'right'].forEach((pos, i) => {
            if (tiers[i] === 3 && String(codes[i]) === changedMotif) {
                const img = document.querySelector(`#monster-${pos} img`);
                if (!img) return;
                // 엘리트 이미지는 전역 리졸버로 가져옴
                if (typeof window.getEliteIllustURL === 'function') {
                    img.src = window.getEliteIllustURL(attr, codes[i]);
                }
            }
        });
    } catch (err) {
        console.warn('bestiary:update 처리 중 에러', err);
    }
});



const btnCardTeam = document.getElementById('btnCardTeam');
const cardTeam = document.getElementById('CardTeam');
const btnGoHome = document.getElementById('btnGoHome');

// 도감 버튼 클릭 → 도감 표시
btnCardTeam?.addEventListener('click', () => {
    cardTeam.classList.add('show');
});

// 홈 버튼 클릭 → 도감 닫기
btnGoHome?.addEventListener('click', () => {
    cardTeam.classList.remove('show');
});


// ✅ 안전한 네임스페이스로 변경
window.BESTIARY_DATA = {
    A: { 1: { atk: 100, turn: 2 }, 2: { atk: 200, turn: 3 }, 3: { atk: 300, turn: 1 } },
    B: { 1: { atk: 300, turn: 2 }, 2: { atk: 600, turn: 3 }, 3: { atk: 900, turn: 3 } },
    C: { 1: { atk: 400, turn: 2 }, 2: { atk: 800, turn: 3 }, 3: { atk: 1200, turn: 5 } },
    D: { 1: { atk: 100, turn: 2 }, 2: { atk: 200, turn: 3 }, 3: { atk: 300, turn: 1 } },
    E: { 1: { atk: 400, turn: 2 }, 2: { atk: 800, turn: 3 }, 3: { atk: 1200, turn: 5 } },
    F: { 1: { atk: 100, turn: 2 }, 2: { atk: 200, turn: 3 }, 3: { atk: 600, turn: 3 } },
    G: { 1: { atk: 300, turn: 2 }, 2: { atk: 400, turn: 3 }, 3: { atk: 500, turn: 1 } },
    H: { 1: { atk: 200, turn: 2 }, 2: { atk: 300, turn: 3 }, 3: { atk: 400, turn: 3 } },
    I: { 1: { atk: 100, turn: 2 }, 2: { atk: 200, turn: 3 }, 3: { atk: 300, turn: 1 } },
    J: { 1: { atk: 100, turn: 2 }, 2: { atk: 200, turn: 3 }, 3: { atk: 600, turn: 1 } },
    K: { 1: { atk: 200, turn: 2 }, 2: { atk: 400, turn: 3 }, 3: { atk: 1000, turn: 1 } },
    L: { 1: { atk: 100, turn: 2 }, 2: { atk: 200, turn: 3 }, 3: { atk: 400, turn: 5 } },
};

/* ===============================
   🎯 적 턴 UI (턴 수 시각화 개선 버전)
================================= */

// EnemyList가 전역에 없으면 생성
window.EnemyList = window.EnemyList || [];

// ===== 턴 갱신 =====
function updateEnemyTurnUI() {
    if (!window.EnemyList || !Array.isArray(EnemyList)) return;
    EnemyList.forEach(enemy => {
        const el = document.querySelector(`#monster-${enemy.id} .enemy-turn`);
        if (el) el.textContent = `${enemy.counter}t`;
    });
}

// ===== 턴 감소 함수 =====
function decreaseEnemyTurn(index) {
    if (!window.EnemyList || !EnemyList[index]) return;
    const enemy = EnemyList[index];
    enemy.counter -= 1;
    if (enemy.counter <= 0) {
        enemy.counter = enemy.turn; // 초기화
    }
    updateEnemyTurnUI();
}

// ===== 적 생성 직후 턴 데이터 초기화 =====
function initEnemyTurnUI() {
    // currentEnemy 정보가 없으면 복원 시도
    const enemyData = window.currentEnemy;
    if (!enemyData || !enemyData.codes) return;

    const profile = JSON.parse(localStorage.getItem('profileV1') || '{}');
    const stageLevel = Number(profile.rank || 1);

    EnemyList = []; // 새로 초기화

    ['left', 'center', 'right'].forEach((pos, i) => {
        const monster = document.querySelector(`#monster-${pos}`);
        if (!monster) return;

        // 적 코드, 티어, 속성 추출
        const code = enemyData.codes[i]?.toUpperCase?.() || 'A';
        const tier = enemyData.tiers[i] || 1;

        // ENEMY_TABLE의 턴값 가져오기
        const entry = window.BESTIARY_DATA?.[code]?.[tier] || { atk: 100, turn: 2 };
        const turnValue = entry.turn;

        // EnemyList에 추가
        EnemyList.push({
            id: pos,
            code,
            tier,
            turn: turnValue,
            counter: turnValue,
        });

        // 턴 텍스트 엘리먼트 생성
        let turnEl = monster.querySelector('.enemy-turn');
        if (!turnEl) {
            turnEl = document.createElement('div');
            turnEl.className = 'enemy-turn';
            Object.assign(turnEl.style, {
                position: 'absolute',
                right: '15%',
                top: '45%',
                fontWeight: '900',
                color: '#ff3b3b',
                fontSize: '1.8vw',
                textShadow: '0 0 4px #660000',
                zIndex: '9999',
                pointerEvents: 'none',
                userSelect: 'none',
            });
            monster.style.position = monster.style.position || 'relative';
            monster.appendChild(turnEl);
        }

        // 즉시 표시
        turnEl.textContent = `${turnValue}t`;
    });
}

// ===== 적 생성 완료 후 항상 호출 =====
function afterEnemySpawned() {
    initEnemyTurnUI();
    updateEnemyTurnUI();
}

function handleTurnAdvance() {
    // 턴 차감
    EnemyList.forEach((_, i) => decreaseEnemyTurn(i));

    // (선택) 턴 종료 시 추가 이펙트나 로그
    console.log("턴 진행 완료 ⚔️");

    // ✅ 적의 공격 턴 도래 시 데미지 적용
    EnemyList.forEach((enemy) => {
        if (enemy.counter === enemy.turn) { // 턴이 초기화된 적 = 공격 턴
            const entry = window.BESTIARY_DATA?.[enemy.code]?.[enemy.tier];
            const baseDmg = entry?.atk || 100;
            const profile = JSON.parse(localStorage.getItem('profileV1') || '{}');
            const stage = Number(profile.rank || 1);
            const damage = baseDmg + stage * 10; // 스테이지 보정
            applyEnemyAttack(damage);
        }
    });

    // 🕒 턴 종료 시 스킬 쿨타임 1 감소
    progressSkillCooldown();

    if (window.nextTurnInvincible > 0) {
        window.nextTurnInvincible--;
    }
}
// ====================== 턴 종료 시 쿨타임 감소 ======================
function progressSkillCooldown() {
    allies.forEach(a => {
        if (!a) return;
        if (a.cooldownMax <= 0) return; // 쿨타임 없는 캐릭터 제외
        if (a.skillReady) return;        // 이미 준비 완료면 스킵

        // 턴당 1씩 감소
        a.cooldownLeft = Math.max(0, (a.cooldownLeft || 0) - 1);
        if (a.cooldownLeft === 0) a.skillReady = true;
    });
    updateAllAllyUI?.();
}
// 전역 어딘가 (가장 위든 아래든 상관 없음)
Object.defineProperty(window, 'nextTurnInvincible', {
    set(v) {
        console.log('🧭 nextTurnInvincible 변경 →', v, new Error().stack.split('\n')[2]);
        this._nti = v;
    },
    get() { return this._nti || 0; }
});
