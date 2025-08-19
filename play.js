let moveCount = 0; 
let turnMovesMax = 3;       // 한 턴 최대 이동 횟수 (기본 3)
let turnMovesLeft = turnMovesMax;

// ===== Summon popups =====
(function () {
    const popup_IDS = ['summonMain', 'GateKerei', 'GateRoseKerei', 'GateGoldKerei'];
    let current = null;

    const $ = (sel) => document.querySelector(sel);
    const byId = (id) => document.getElementById(id);

    function hideAll() {
        popup_IDS.forEach(id => {
            const el = byId(id);
            if (el) el.style.display = 'none';
        });
        current = null;
    }

    function show(id) {
        hideAll();
        const el = byId(id);
        if (!el) return;
        el.style.display = 'block';
        current = id;
    }

    // --- 트리거 바인딩 ---
    function bind() {
        // 1) 메인 탭의 "소환" 버튼: id 또는 class 중 하나만 달아두면 됩니다.
        //    예: <button id="btnOpenSummon">소환</button>
        //        또는 <button class="open-summon">소환</button>
        const openSummonBtn = $('#btnOpenSummon') || $('.open-summon');
        openSummonBtn?.addEventListener('click', () => show('summonMain'));

        // 2) 소환 메인에서 게이트 3개로 진입 (이전 HTML 예시의 id 사용)
        byId('btnGateKerei')?.addEventListener('click', () => show('GateKerei'));
        byId('btnGateRoseKerei')?.addEventListener('click', () => show('GateRoseKerei'));
        byId('btnGateGoldKerei')?.addEventListener('click', () => show('GateGoldKerei'));

        // 3) 각 레이어의 빈 배경 클릭 시 뒤로가기:
        //    - 게이트 레이어면 → summonMain으로
        //    - summonMain이면 → 모두 닫기
        popup_IDS.forEach(id => {
            const popup = byId(id);
            if (!popup) return;
            popup.addEventListener('click', (e) => {
                if (e.target === popup) {
                    if (id !== 'summonMain') show('summonMain');
                    else hideAll();
                }
            });
        });

        // 4) ESC 키: 게이트 → summonMain, summonMain → 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !current) return;
            if (current !== 'summonMain') show('summonMain');
            else hideAll();
        });

        // 5) (선택) 공통 뒤로가기 버튼 지원: 레이어 안에 .btn-back 달면 동작
        document.addEventListener('click', (e) => {
            const el = e.target;
            if (!(el instanceof Element)) return;
            if (el.closest('.btn-back')) {
                if (current && current !== 'summonMain') show('summonMain');
                else hideAll();
            }
            // data-popup-target="#GateKerei" 같은 형태도 지원
            const targetSel = el.getAttribute('data-popup-target');
            if (targetSel) {
                const id = targetSel.replace(/^#/, '');
                show(id);
            }
        });
    }

    // 초기화는 필요할 때만 호출하세요. 예) 소환 버튼이 있는 페이지에서만
    document.addEventListener('DOMContentLoaded', bind);
})();

// HP 상태 관리
const HP = {
    base: 1000,  // 고정 기본값
    max: 1000,
    current: 1000,

    init() {
        // 아군 전체 체력 합산 후 반영
        const alliesHp = allies.slice(1).reduce((sum, u) => sum + (u ? u.maxHp : 0), 0);
        this.max = this.base + alliesHp;
        this.current = this.base + alliesHp;

        this.updateBar();
    },

    setHP(value) {
        this.current = Math.max(0, Math.min(this.max, value));
        this.updateBar();
    },

    changeHP(delta) {
        this.setHP(this.current + delta);
    },

    updateBar() {
        const percent = (this.current / this.max) * 100;
        const fill = document.querySelector(".hp-fill");
        const text = document.querySelector(".hp-text");

        if (fill) {
            fill.style.width = percent + "%";
        }
        if (text) {
            text.textContent = `${this.current} / ${this.max}`;
        }
    }
};

document.addEventListener("DOMContentLoaded", () => {
    HP.init();
});

document.addEventListener("DOMContentLoaded", () => {
    HP.init();
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

    // 데이터 교환
    slot1.dataset.element = elem2;
    slot2.dataset.element = elem1;

    // 아이콘 갱신
    resetSlotIcon(slot1);
    resetSlotIcon(slot2);

    // 이동 카운트 증가
    moveCount++;

    // 턴 게이지 감소
    turnMovesLeft--;
    updateTurnGauge();

    // 턴 소모 처리
    if (turnMovesLeft <= 0) {
        resolveBoard();  // 1턴 종료 후 처리
        turnMovesLeft = turnMovesMax; // 턴 리셋
        setTimeout(() => {
            updateTurnGauge();
        }, 1000);
    }

    // 매칭 검사 (항상 실행)
    const board = getBoardState();
    const matches = findMatches(board);
    if (matches.length > 0) {
        applyHighlight(flattenMatches(matches));
    } else { }

    // 3번째 이동 후 → resolveBoard 전체 실행
    if (moveCount >= 3) {
        resolveBoard();   // 여기서 한 번만 처리
    }
}

let focusedSlot = null;

// 슬롯 클릭 이벤트
document.querySelectorAll(".puzzle-slot").forEach(slot => {
    slot.addEventListener("click", (e) => {
        e.stopPropagation();

        if (focusedSlot) {
            if (areAdjacent(focusedSlot, slot)) {
                swapSlots(focusedSlot, slot);

                // ✅ 이동이 발생했을 때만 포커스 해제
                resetSlotIcon(focusedSlot);
                focusedSlot.classList.remove("focused");
                focusedSlot = null;
                return; // 여기서 끝냄 → 새 포커스 지정 안 함
            }

            // 인접하지 않으면 기존 포커스 해제
            resetSlotIcon(focusedSlot);
            focusedSlot.classList.remove("focused");
        }

        // 새 포커스 적용
        focusedSlot = slot;
        focusedSlot.classList.add("focused");
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
    initPuzzleBoard();
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
        moveCount = 0;

        // 콘솔에 이번 턴 로그 출력
        // console.log("=== 전투 로그 ===");
        combatLog.forEach(line => console.log(line));

        // 로그 초기화 (턴마다 새로 기록 시작)
        combatLog = [];
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
    const totalHp = allies.slice(1).reduce((sum, u) => sum + u.hp, 0);
    const totalMaxHp = allies.slice(1).reduce((sum, u) => sum + u.maxHp, 0);
    const percent = (totalHp / totalMaxHp) * 100;

    const fill = document.querySelector(".hp-fill");
    const text = document.querySelector(".hp-text");

    if (fill) fill.style.width = percent + "%";
    if (text) text.textContent = `${totalHp} / ${totalMaxHp}`;
}

// ===== 전투 처리 =====
// function applyCombatResults(matches) {
//     console.log("=== 전투 로그 ===");
//     let totalDamage = 0;
//     let totalHeal = 0;

//     for (const [element, count] of Object.entries(matches)) {
//         if (!count) continue;

//         if (element === "l") {
//             // 생 = 회복
//             const heal = allies.slice(1).reduce((sum, u) => sum + (u ? u.heal * count : 0), 0);
//             totalHeal += heal;
//             console.log(`💚 생(${count}) → 아군 전체 ${heal} 회복`);
//             HP.changeHP(heal);
//         } else {
//             // 속성 공격
//             const idx = elementMap[element];
//             const unit = allies[idx];
//             if (unit) {
//                 const dmg = unit.atk * count;
//                 totalDamage += dmg;
//                 console.log(`⚔️ ${unit.name} ${element.toUpperCase()}(${count}) → ${dmg} 데미지`);
//             }
//         }
//     }

//     console.log(`총합 ▶ 💚회복: ${totalHeal}, ⚔️공격: ${totalDamage}`);
// }

// function applyCombatResults(matches) {
//     console.log("=== 전투 로그 ===");

//     let totalDamage = 0;
//     let totalHeal = 0;
//     let totalIntendedHeal = 0;
//     const effects = [];

//     for (const [element, count] of Object.entries(matches)) {
//         if (!count) continue;

//         if (element === "l") {
//             allies.slice(1).forEach((u) => {
//                 if (!u) return;

//                 const intendedHeal = u.heal * count;
//                 const actualHeal = Math.min(intendedHeal, u.maxHp - u.hp);

//                 totalIntendedHeal += intendedHeal;
//                 if (actualHeal > 0) {
//                     u.hp += actualHeal;
//                     totalHeal += actualHeal;
//                 }
//             });

//             HP.changeHP(totalHeal);
//             combatLog.push(`💖 총 회복 ${totalHeal}`);
//         } else {
//             const ally = allies.find(u => u && u.element === element);
//             if (!ally) continue;

//             const damage = ally.attack * count;
//             totalDamage += damage;
//             combatLog.push(`⚔️ ${ally.name} → ${damage} 공격`);
//             effects.push(() => showCombatEffect(ally.id, damage, false));
//         }
//     }

//     updateAllyHPBar();

//     // 힐 이펙트 한 번만 표시
//     if (totalIntendedHeal > 0) {
//         requestAnimationFrame(() => {
//             showHealTotalEffect(totalIntendedHeal);
//         });
//     }

//     // 공격 이펙트 표시
//     requestAnimationFrame(() => {
//         effects.forEach(fn => fn());
//     });
// }
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
    const baseHp = 1000;
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
