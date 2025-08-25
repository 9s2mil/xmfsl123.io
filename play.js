let moveCount = 0; 
let turnMovesMax = 3;       // 한 턴 최대 이동 횟수 (기본 3)
let turnMovesLeft = turnMovesMax;
let isResolving = false;
let turnDamageTotal = 0;   

function randomEnemyDelta() {
    return 500 + Math.floor(Math.random() * 11) * 100;  // 500..1500
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
    obj.rank = cur + 1;
    localStorage.setItem(KEY, JSON.stringify(obj));

    // Profile 모듈이 있으면 상태도 갱신
    if (window.Profile && Profile.state) {
        Profile.state.rank = obj.rank;
    }
    // 헤더 즉시 반영
    const el = document.getElementById('headerRank');
    if (el) el.textContent = obj.rank;

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
            enemy: { current: EnemyHP.current, max: EnemyHP.max },
            ally: { current: HP.current, max: HP.max },
            turnMovesLeft
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

        applyBoardState(s.board);

        if (s.enemy && typeof s.enemy.current === 'number' && typeof s.enemy.max === 'number') {
            EnemyHP.max = s.enemy.max;
            EnemyHP.current = Math.max(0, Math.min(s.enemy.max, s.enemy.current));
            EnemyHP.updateBar();
        } else {
            EnemyHP.init(randomEnemyMaxHP());
        }

        if (s.ally && typeof s.ally.current === 'number' && typeof s.ally.max === 'number') {
            HP.max = s.ally.max;
            HP.current = Math.max(0, Math.min(HP.max, s.ally.current));
            updateAllyHPBar();
        } else {
            updateAllyHPBar();
        }

        if (typeof s.turnMovesLeft === 'number') {
            turnMovesLeft = Math.max(0, Math.min(turnMovesMax, s.turnMovesLeft | 0));
        }
        updateTurnGauge();
        return true;
    } catch {
        return false;
    }
}

function clearAdventureState() {
    try { localStorage.removeItem(ADV_LS_KEY); } catch { }
}

// 적 처치 → 랭크 +1, 적 HP 랜덤 재설정, 퍼즐 초기화
function onEnemyDefeated() {
    // 1) 랭크 상승 즉시 반영
    bumpRank();  // 아래 3-C에서 즉시 반영되도록 고침

    // 2) 퍼즐 저장본 초기화
    clearAdventureState();

    // 3) 다음 적 HP = '이전 최대 HP' + '랜덤(500..1500, 100단위)'
    const nextMax = EnemyHP.max + randomEnemyDelta();
    EnemyHP.init(nextMax);

    // 4) 퍼즐도 새 판
    initPuzzleBoard();
    turnMovesLeft = turnMovesMax;
    updateTurnGauge();

    // 5) 새 상태 저장
    saveAdventureState();
}


// 아군 전멸 → 퍼즐만 초기화
function onPartyDefeated() {
    clearAdventureState();
    initPuzzleBoard();                 // 새 퍼즐
    turnMovesLeft = turnMovesMax;
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
        // 랜덤 원소 배정
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
    if (!slot) {
        return;
    }

    const element = slot.dataset.element;
    if (!element) {
        slot.style.backgroundImage = "none"; // element가 비었을 경우 확실히 제거
        return;
    }

    slot.style.backgroundImage = `url("icons/${element}.png")`;
    slot.style.backgroundSize = "cover";
}

// 초기화 실행
document.addEventListener("DOMContentLoaded", () => {
    // 적 HP 바 세팅(저장본 없으면 랜덤 초기화)
    if (!restoreAdventureState()) {
        EnemyHP.init(randomEnemyMaxHP());
        initPuzzleBoard();
        saveAdventureState();
    }
});


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

// 기존 resolveBoardStep 내부 수정
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

        moveCount = 0;

        // (있는 경우) 이번 턴 로그 출력/초기화
        combatLog.forEach(line => console.log(line));
        combatLog = [];

        // ✅ 이 턴에 '정확히 1번'만 스킬 쿨다운 진행
        if (typeof onTurnEnded_ForSkills === 'function') {
            onTurnEnded_ForSkills();
        }

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


// 아군 팀 데이터
const allies = [
    { id: 1, name: "리더", element: "", attack: 1, heal: 5, maxHp: 1000, hp: 1000 },
    { id: 2, name: "현무", element: "n", attack: 20, heal: 5, maxHp: 100, hp: 100 },
    { id: 3, name: "주작", element: "s", attack: 30, heal: 5, maxHp: 100, hp: 100 },
    { id: 4, name: "청룡", element: "e", attack: 25, heal: 5, maxHp: 100, hp: 100 },
    { id: 5, name: "백호", element: "w", attack: 28, heal: 5, maxHp: 100, hp: 100 },
    { id: 6, name: "기린", element: "m", attack: 35, heal: 5, maxHp: 100, hp: 100 }
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

function applyCombatResults(matches) {
    let totalDamage = 0;
    let totalHeal = 0;
    let totalIntendedHeal = 0;
    const effects = [];

    let totalMatchCount = 0;

    for (const [element, count] of Object.entries(matches)) {
        if (!count) continue;

        if (element === "l") {
            allies.slice(1).forEach((u) => {
                if (!u) return;

                const intendedHeal = u.heal * count;
                const actualHeal = Math.min(intendedHeal, u.maxHp - u.hp);

                totalIntendedHeal += intendedHeal;
                if (actualHeal > 0) {
                    u.hp += actualHeal;
                    totalHeal += actualHeal;
                }
            });

            HP.changeHP(totalHeal);
            // combatLog.push(`💖 총 회복 ${totalHeal}`);
        } else {
            const ally = allies.find(u => u && u.element === element);
            if (ally) {
                const damage = ally.attack * count;
                totalDamage += damage;
                // combatLog.push(`⚔️ ${ally.name} → ${damage} 공격`);
                effects.push(() => showCombatEffect(ally.id, damage, false));
            }

            totalMatchCount += count;
        }
    }

    // 리더 캐릭터는 모든 속성 매칭 합산 공격
    const leader = allies.find(u => u && u.element === "");
    if (leader && totalMatchCount > 0) {
        const damage = leader.attack * totalMatchCount;
        totalDamage += damage;
        // combatLog.push(`⚔️ ${leader.name} → ${damage} 공격`);
        effects.push(() => showCombatEffect(leader.id, damage, false));
    }
    turnDamageTotal += totalDamage;
    updateAllyHPBar();

    if (totalIntendedHeal > 0) {
        requestAnimationFrame(() => {
            showHealTotalEffect(totalIntendedHeal);
        });
    }

    requestAnimationFrame(() => {
        effects.forEach(fn => fn());
    });
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


/* ======================= Allies: Skill Cooldown Fields ======================= */
/* 각 캐릭터에 스킬 쿨타임(최대/남은), 준비 여부, 잠금 여부 필드 부여 */
const SKILL_COOLDOWN_DEFAULTS = {
    1: 2,   // 리더: 스킬 없음
    2: 2,   // 현무: 2턴
    3: 3,   // 주작: 3턴
    4: 4,   // 청룡: 4턴 
    5: 5,   // 백호: 5턴
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
        if (a.locked || a.cooldownMax <= 0) return;
        if (a.skillReady) return; // 이미 준비완료면 유지
        a.cooldownLeft = Math.max(0, a.cooldownLeft - 1);
        if (a.cooldownLeft === 0) a.skillReady = true;
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
function openSkillWindow(ally) {
    // TODO: 스킬창 열기 → 사용 확정 시 consumeSkill(ally) 호출
    console.log(`[스킬창] ${ally.name} 스킬 사용 가능!`);
    // 예시: 사용 즉시 소비하려면 아래 한 줄
    // consumeSkill(ally);
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

/* ======================= 팝업 구현체 ======================= */
function openStatusWindow(ally) {
  const modal = document.getElementById('ally-status-modal');
  if (!modal) return;

  const portraitEl = document.getElementById('allyStatusPortrait');
  const titleEl = modal.querySelector('.ally-modal__title');
  const contentEl = document.getElementById('ally-status-content');

  // Inject ally portrait
    if (portraitEl) {
        const fallback = ally.element ? `icons/${ally.element}l.png` : `icons/ll.png`;
        portraitEl.src = fallback;
        portraitEl.alt = ally.name;
    }


  // Update title
  if (titleEl) {
    titleEl.textContent = ally.name;
  }

  // Update content one-to-one
  if (contentEl) {
    contentEl.innerHTML = `
      <p><strong>HP:</strong> ${ally.hp} / ${ally.maxHp}</p>
      <p><strong>Attack:</strong> ${ally.attack}</p>
      <p><strong>Heal:</strong> ${ally.heal}</p>
      <p><strong>Cooldown:</strong> ${ally.cooldownLeft} / ${ally.cooldownMax}</p>
    `;
  }

  showModal(modal, true);

    const changeBtn = modal.querySelector('.ally-modal__footer .ally-modal__ok:not(#enhance-button):not([data-close])');
    if (changeBtn) {
        changeBtn.onclick = () => startChangeIconFlow(ally);
    }
}
let _skillTarget = null;
function openSkillWindow(ally) {
    if (!(ally && ally.skillReady)) { // 안전장치
        openStatusWindow(ally);
        return;
    }
    _skillTarget = ally;

    const modal = document.getElementById('ally-skill-modal');
    const content = document.getElementById('ally-skill-content');
    const useBtn = document.getElementById('btn-skill-use');
    if (!modal || !content || !useBtn) return;

    // 내용 구성(스킬 설명은 추후 교체)
    content.innerHTML = `
    <div><strong>${ally.name}</strong>의 스킬을 사용하시겠습니까?</div>
    <div style="opacity:.8; margin-top:6px;">쿨타임: ${ally.cooldownMax}턴 (사용 시 초기화)</div>
  `;

    useBtn.onclick = () => {
        // 실제 스킬 효과 적용은 여기서 호출
        consumeSkill(_skillTarget);      // 쿨타임 리셋
        // TODO: 스킬 실제 효과 로직 호출(데미지/버프 등)
        showModal(modal, false);
    };

    bindModalClose(modal);
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
        });
    }
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

