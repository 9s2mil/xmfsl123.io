let moveCount = 0; 

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
    max: 1000,
    current: 1000,

    init() {
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
    console.log(`이동 횟수: ${moveCount}`);

    if (moveCount >= 3) {
        moveCount = 0;
        const board = getBoardState(); // ✅ 함수 이름 맞춤
        const matches = findMatches(board);
        if (matches.length > 0) {
            console.log("성공", matches);
            clearMatches(matches);
            // TODO: 이 다음에 중력/새로 채우기 로직 들어감
        }

    } else {
        console.log("매칭 탐색 보류 (3번째 이동 후 발동)");
    }

    // === 이동 끝나면 포커스 해제 ===
    if (focusedSlot) {
        resetSlotIcon(focusedSlot);
        focusedSlot.classList.remove("focused");
        focusedSlot = null;
    }
}

let focusedSlot = null;

// 슬롯 클릭 이벤트
document.querySelectorAll(".puzzle-slot").forEach(slot => {
    slot.addEventListener("click", (e) => {
        e.stopPropagation(); // 슬롯 클릭 시 document 클릭 이벤트로 버블링 방지

        // 이미 포커스된 슬롯이 있으면 처리
        if (focusedSlot) {
            if (areAdjacent(focusedSlot, slot)) {
                swapSlots(focusedSlot, slot);
            }
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

// 아이콘 변경 함수
// === 포커스 아이콘 교체 (배경이미지 방식) ===

function resetSlotIcon(slot) {
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
    const numRows = board.length;
    const numCols = board[0].length;

    // 방향 벡터: 가로, 세로, 대각선 ↘, 대각선 ↙
    const directions = [
        { dr: 0, dc: 1 },   // →
        { dr: 1, dc: 0 },   // ↓
        { dr: 1, dc: 1 },   // ↘
        { dr: 1, dc: -1 }   // ↙
    ];

    const visited = Array.from({ length: numRows }, () =>
        Array(numCols).fill(false)
    );

    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            const elem = board[r][c];
            if (!elem) continue;

            for (const { dr, dc } of directions) {
                const group = [[r, c]];
                let nr = r + dr;
                let nc = c + dc;

                while (
                    nr >= 0 &&
                    nr < numRows &&
                    nc >= 0 &&
                    nc < numCols &&
                    board[nr][nc] === elem
                ) {
                    group.push([nr, nc]);
                    nr += dr;
                    nc += dc;
                }

                if (group.length >= 3) {
                    matches.push(group);
                }
            }
        }
    }

    return matches;
}

// 퍼즐판을 2차원 배열로 구성하는 헬퍼 (dataset.element 기반)
function getBoardState() {
    const slots = document.querySelectorAll(".puzzle-slot");
    const rows = 6; // 세로
    const cols = 5; // 가로
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
// === 매칭된 칸 폭파 ===
function clearMatches(matches) {
    const slots = document.querySelectorAll(".puzzle-slot");
    const boardCols = 5; // 가로 5칸 고정

    for (let chain of matches) {
        for (let [r, c] of chain) {
            const index = r * boardCols + c;
            const slot = slots[index];

            // 데이터 제거
            slot.dataset.element = "";

            // 아이콘 제거
            slot.style.backgroundImage = "none";
        }
    }
}

function flattenMatches(matches) {
    const set = new Set();
    matches.forEach(group => {
        group.forEach(([r, c]) => set.add(`${r},${c}`));
    });
    return Array.from(set).map(str => str.split(",").map(Number));
}

