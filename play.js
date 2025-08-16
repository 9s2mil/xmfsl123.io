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
        slot.dataset.focused = "false"; // 포커스 상태 기본 false
        slot.style.backgroundImage = `url("icons/${element}.png")`;
        slot.style.backgroundSize = "cover";
    });
}

let focusedSlot = null;

// 슬롯 클릭 이벤트
document.querySelectorAll(".puzzle-slot").forEach(slot => {
    slot.addEventListener("click", (e) => {
        e.stopPropagation(); // 이벤트 버블링 막기

        // 기존 포커스 해제
        if (focusedSlot && focusedSlot !== slot) {
            resetSlotIcon(focusedSlot);
            focusedSlot.classList.remove("focused");
        }

        // 새 포커스 적용
        if (focusedSlot === slot) {
            // 같은 걸 다시 누르면 해제
            resetSlotIcon(slot);
            slot.classList.remove("focused");
            focusedSlot = null;
        } else {
            setFocusIcon(slot);
            slot.classList.add("focused");
            focusedSlot = slot;
        }
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
function setFocusIcon(slot) {
    const element = slot.querySelector("img");
    if (element) {
        const src = element.getAttribute("src");
        element.setAttribute("src", src.replace(".png", "p.png"));
    }
}

function resetSlotIcon(slot) {
    const element = slot.querySelector("img");
    if (element) {
        const src = element.getAttribute("src");
        element.setAttribute("src", src.replace("p.png", ".png"));
    }
}


// 초기화 실행
document.addEventListener("DOMContentLoaded", () => {
    initPuzzleBoard();
});

