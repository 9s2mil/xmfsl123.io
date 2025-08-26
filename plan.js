const TaskStore = {
    KEY: 'tasksV1',
    data: { popup1: [], popup2: [], popup3: [], popup4: [] },

    init() {
        try {
            const raw = localStorage.getItem(this.KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                this.data = { popup1: [], popup2: [], popup3: [], popup4: [], ...parsed };
            } else {
                this.persist();
            }
        } catch {
            this.persist();
        }
    },
    persist() {
        localStorage.setItem(this.KEY, JSON.stringify(this.data));
    },
    add(origin, task) {
        if (!this.data[origin]) this.data[origin] = [];
        this.data[origin].push(task);
        this.persist();
    },
    update(origin, id, patch) {
        const list = this.data[origin] || [];
        const i = list.findIndex(x => x.id === id);
        if (i >= 0) { this.data[origin][i] = { ...this.data[origin][i], ...patch }; this.persist(); }
    },
    toggleDone(origin, id) {
        const t = (this.data[origin] || []).find(x => x.id === id);
        if (t) { t.done = !t.done; this.persist(); }
    },
    markDone(origin, id) {
        const t = (this.data[origin] || []).find(x => x.id === id);
        if (t && !t.done) { t.done = true; this.persist(); }
    },
    resetDoneForPopups(popups = ['popup1', 'popup2']) {
        popups.forEach(pid => {
            const list = this.data[pid] || [];
            list.forEach(t => { t.done = false; });
        });
        this.persist();
    },
    remove(origin, id) {
        const list = this.data[origin] || [];
        this.data[origin] = list.filter(t => t.id !== id);
        this.persist();
    }
};

function bindLongPress(el, onLongPress, ms = 3000) {
    let timer = null;

    const isFromActionBtn = (target) =>
        !!target.closest('.btn') || !!target.closest('.btn-check') || !!target.closest('.btn-edit');

    const start = (e) => {
        // 마우스 우클릭/휠클릭 무시
        if (e.type === 'mousedown' && e.button !== 0) return;
        // 카드 내부의 확인/수정 버튼에서 시작되면 롱프레스 무시
        if (isFromActionBtn(e.target)) return;

        timer = setTimeout(() => {
            timer = null;
            onLongPress(e);
        }, ms);
    };

    const cancel = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    el.addEventListener('mousedown', start);
    el.addEventListener('touchstart', start, { passive: true });
    ['mouseup', 'mouseleave', 'mouseout', 'touchend', 'touchcancel'].forEach((evt) =>
        el.addEventListener(evt, cancel)
    );
}

const Renderer = {
    ensureListContainer(popupId) {
        const popup = document.getElementById(popupId);
        if (!popup) return null;
        let list = popup.querySelector('.taskList');
        if (!list) {
            const content = popup.querySelector('.popupContent') || popup;
            list = document.createElement('div');
            list.className = 'taskList';
            list.dataset.for = popupId;
            content.appendChild(list);
        }
        return list;
    },

    starsTxt(n) {
        const max = 4;
        return '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));
    },
    renderTags(strOrArr) {
        const arr = Array.isArray(strOrArr)
            ? strOrArr
            : (strOrArr || '').split(/\s+/).filter(Boolean).map(t => t.replace(/^#*/, '#'));
        return arr.map(tag => `<span class="tag">${tag}</span>`).join(' ');
    },

    cardHTML(t) {
        const tags = this.renderTags(t.tags);
        const date = t.date ? `<span class="date">${t.date}</span>` : '';
        const diff = `<span class="difficulty">${this.starsTxt(t.difficulty)}</span>`;
        const desc = t.desc ? `<div class="desc">${t.desc}</div>` : '';
        return `
      <div class="task-info">
        <div class="title">${t.title || '(제목 없음)'}</div>
        ${desc}
        <div class="meta">
          ${diff}
          ${date}
          ${tags}
        </div>
      </div>
      <div class="task-actions">
        <button type="button" class="btn btn-check">확인</button>
        <button type="button" class="btn btn-edit">수정</button>
      </div>
    `;
    },

    renderList(popupId) {
        const list = this.ensureListContainer(popupId);
        if (!list) return;
        list.innerHTML = '';
        const items = TaskStore.data[popupId] || [];
        items.forEach(t => {
            const card = document.createElement('div');
            card.className = 'task-card' + (t.done ? ' done' : '');
            card.dataset.id = t.id;
            card.dataset.origin = popupId;
            card.innerHTML = this.cardHTML(t);

            const btnCheck = card.querySelector('.btn-check');
            const btnEdit = card.querySelector('.btn-edit');

            if (t.done) btnCheck.disabled = true;

            btnCheck.addEventListener('click', () => {
                if (t.done) return;                    // 이미 완료면 무시
                TaskStore.markDone(popupId, t.id);     // 되돌리기 없이 완료로 고정
                t.done = true;                         // 메모리 상 반영
                card.classList.add('done');            // 취소선 적용
                btnCheck.disabled = true;              // 버튼 비활성화

                Rewards.grantPoints(t.difficulty || 1); // ★ 난이도만큼 포인트 지급(1~4)
            });

            btnEdit.addEventListener('click', () => {
                if (window.enterEditMode) window.enterEditMode(popupId, t.id);
            });

            bindLongPress(card, () => {
                if (confirm('삭제하시겠습니까?')) {
                    const origin = card.dataset.origin; // 'popup1' 등
                    const id = card.dataset.id;
                    TaskStore.remove(origin, id);       // LocalStorage에서 삭제
                    Renderer.renderList(origin);        // 해당 팝업만 리렌더
                }
            });

            list.appendChild(card);
        });
    },

    renderAll() {
        ['popup1', 'popup2', 'popup3', 'popup4'].forEach(id => this.renderList(id));
    }
};

// ================== DOM 로직 ==================
document.addEventListener('DOMContentLoaded', () => {
    const popups = document.querySelectorAll('.popup');
    const footerButtons = document.querySelectorAll('footer button, #btnOpenSummon');
    let activePopup = null;

    function openPopupById(popupId) {
        const targetPopup = document.getElementById(popupId);
        if (!targetPopup) return;

        popups.forEach(p => p.classList.remove('show'));
        targetPopup.classList.add('show');
        activePopup = targetPopup;
        document.body.classList.add('no-scroll');
    }

    function closePopup(popupEl) {
        popupEl.classList.remove('show');
        document.body.classList.remove('no-scroll');
        activePopup = null;
    }

    footerButtons.forEach(button => {
        button.addEventListener('click', () => {
            const popupId = button.getAttribute('data-popup');
            if (!popupId) return;

            const targetPopup = document.getElementById(popupId);
            if (!targetPopup) return;

            if (activePopup === targetPopup) {
                closePopup(targetPopup);
            } else {
                openPopupById(popupId);
            }
        });
    });
    // ----- 홈 버튼 기능 -----
    const homeBtn = document.querySelector("#adventureScreen .btn-home");

    if (homeBtn) {
        homeBtn.addEventListener("click", () => {
            // 현재 열린 팝업 전부 닫기
            document.querySelectorAll(".popup.show").forEach(p => {
                p.classList.remove("show");
            });

            // 모험 화면 닫기
            const adventureScreen = document.getElementById("adventureScreen");
            if (adventureScreen) {
                adventureScreen.style.display = "none";
            }

            // 상태 초기화
            activePopup = null;
            document.body.classList.remove("no-scroll");
        });
    }

    // ================== 모험 팝업 연결 ==================
    const btnAdventure = document.getElementById('btnAdventure');
    const adventureScreen = document.getElementById('adventureScreen');

    if (btnAdventure && adventureScreen) {
        btnAdventure.addEventListener('click', () => {
            adventureScreen.style.display = 'block';
        });
    }

    btnAdventure.addEventListener('click', () => {
        adventureScreen.style.display = 'block';
        // 추가: 모험 진입 시 슬롯 아이콘 재적용
        if (window.applyCustomAllyIconsToSlots) window.applyCustomAllyIconsToSlots();
    });

    // ================== 카드 팝업 연결 ==================
    const btnCardTeam = document.getElementById('btnCardTeam');
    const btnCardList = document.getElementById('btnCardList');

    btnCardTeam?.addEventListener('click', () => {
        document.querySelectorAll('.popup').forEach(p => p.classList.remove('show'));
        document.getElementById('CardTeam')?.classList.add('show');
    });
    btnCardList?.addEventListener('click', () => {
        document.querySelectorAll('.popup').forEach(p => p.classList.remove('show'));
        document.getElementById('CardList')?.classList.add('show');
    });

    // === 소환 메인 내부 게이트 버튼 → 각 팝업 열기 ===
    document.getElementById('btnGateKerei')?.addEventListener('click', () => {
        openPopupById('GateKerei');
    });
    document.getElementById('btnGateRoseKerei')?.addEventListener('click', () => {
        openPopupById('GateRoseKerei');
    });
    document.getElementById('btnGateGoldKerei')?.addEventListener('click', () => {
        openPopupById('GateGoldKerei');
    });

    // ----- 스크린(오버레이) 참조 -----
    const screenEl = document.getElementById('taskScreen');
    const formEl = document.getElementById('taskForm');
    const screenCloseBtn = document.querySelector('.screen-close');
    const screenCancelBtn = document.getElementById('screenCancel');
    const backdropEl = screenEl ? screenEl.querySelector('.screen-backdrop') : null;

    // ===== 난이도(hidden input 보장 + 버튼 바인딩) =====
    let inputDiff = formEl?.elements['difficulty'];
    if (!inputDiff) {
        // hidden input이 폼에 없다면 생성
        inputDiff = document.createElement('input');
        inputDiff.type = 'hidden';
        inputDiff.name = 'difficulty';
        inputDiff.value = '1';
        formEl.appendChild(inputDiff);
    }

    // 폼 안에 있는 난이도 버튼들만 대상으로 지정(충돌 방지)
    const starButtons = Array.from(document.querySelectorAll('#taskForm .star'));

    function setStar(n) {
        inputDiff.value = String(n);
        starButtons.forEach(b =>
            b.classList.toggle('active', Number(b.dataset.star) === n)
        );
    }

    // 클릭 시 hidden input 갱신 + UI 반영
    starButtons.forEach(b => {
        b.addEventListener('click', () => {
            const n = Number(b.dataset.star || '1');
            setStar(n);
        });
    });

    // 스크린 열고 닫기
    function openScreen() {
        if (!screenEl) return;
        screenEl.classList.add('show');
        screenEl.setAttribute('aria-hidden', 'false');
        // setStar는 모드별로 호출 지점에서 결정
        formEl?.elements['title']?.focus();
    }
    function closeScreen() {
        if (!screenEl) return;
        screenEl.classList.remove('show');
        screenEl.setAttribute('aria-hidden', 'true');
    }

    // 닫기류
    screenCloseBtn?.addEventListener('click', closeScreen);
    screenCancelBtn?.addEventListener('click', closeScreen);
    backdropEl?.addEventListener('click', closeScreen);

    // ----- 편집 유틸 & 모드 전환 -----
    const inputMode = formEl?.elements['mode'];     // 'create' | 'edit'  (hidden)
    const inputEditId = formEl?.elements['editId'];   // 편집 대상 id       (hidden)

    function getTask(origin, id) {
        const list = TaskStore.data[origin] || [];
        return list.find(t => t.id === id) || null;
    }
    function fillFormFromTask(t) {
        formEl.elements['title'].value = t.title || '';
        formEl.elements['desc'].value = t.desc || '';
        formEl.elements['date'].value = t.date || '';
        formEl.elements['tags'].value = Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || '');
        setStar(Number(t.difficulty || 1));
    }

    function enterCreateMode(origin) {
        if (!formEl) return;
        if (inputMode) inputMode.value = 'create';
        if (inputEditId) inputEditId.value = '';
        screenEl.dataset.origin = origin || (screenEl.dataset.origin || '');
        formEl.reset();
        setStar(1);
        openScreen();
    }

    function enterEditMode(origin, id) {
        if (!formEl) return;
        const task = getTask(origin, id);
        if (!task) { alert('수정 대상이 없습니다.'); return; }
        if (inputMode) inputMode.value = 'edit';
        if (inputEditId) inputEditId.value = id;
        screenEl.dataset.origin = origin;
        formEl.reset();
        fillFormFromTask(task);
        setStar(Number(task.difficulty || 1));
        openScreen();
    }

    window.enterEditMode = enterEditMode; // ← 여기

    // ----- addbutton(🗡️) → 생성 모드 -----
    document.querySelectorAll('.addbutton').forEach(btn => {
        btn.addEventListener('click', () => {
            const num = (btn.id.match(/\d+/) || [null])[0];
            const origin = num ? `popup${num}` : btn.closest('.popup')?.id || '';
            enterCreateMode(origin);
        });
    });

    // ----- 제출(생성/수정) -----
    formEl?.addEventListener('submit', (e) => {
        e.preventDefault();

        const origin = screenEl.dataset.origin || '';
        if (!origin) { alert('대상 팝업 식별 실패'); return; }

        const payload = {
            title: formEl.elements['title'].value.trim(),
            desc: formEl.elements['desc'].value.trim(),
            difficulty: Number(formEl.elements['difficulty'].value || '1'), 
            date: formEl.elements['date'].value || '',
            tags: (formEl.elements['tags'].value.trim() || '')
                .split(/\s+/).filter(Boolean).map(t => t.replace(/^#*/, '#'))
        };

        if ((inputMode?.value || 'create') === 'edit') {
            const id = inputEditId?.value;
            if (!id) return;
            TaskStore.update(origin, id, payload);
            Renderer.renderList(origin);
        } else {
            const task = {
                id: 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                ...payload,
                done: false,
                createdAt: Date.now()
            };
            TaskStore.add(origin, task);
            Renderer.renderList(origin);
        }

        formEl.reset();
        setStar(1);
        closeScreen();
    });

    // 한국시간(Asia/Seoul) 기준 'YYYY-MM-DD'
    function todayKey() {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Seoul',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date()); // en-CA: 2025-08-14 형태
    }

    // 한국시간 다음 자정까지 남은 ms
    function msUntilNextMidnight() {
        const KST_OFFSET = 9 * 60 * 60 * 1000;         // 한국은 연중 UTC+9 (서머타임 없음)
        const nowUtcMs = Date.now();
        const kstNow = new Date(nowUtcMs + KST_OFFSET);
        const nextMidnightKstUtcMs =
            Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() + 1, 0, 0, 0, 0) - KST_OFFSET;
        return nextMidnightKstUtcMs - nowUtcMs;
    }


    function dailyResetIfNeeded() {
        const last = localStorage.getItem('tasksV1_lastReset') || '';
        const today = todayKey();
        if (last !== today) {
            TaskStore.resetDoneForPopups(['popup1', 'popup2']);
            localStorage.setItem('tasksV1_lastReset', today);
            Renderer.renderList('popup1');
            Renderer.renderList('popup2');
        }
    }

    function scheduleMidnightReset() {
        setTimeout(function run() {
            TaskStore.resetDoneForPopups(['popup1', 'popup2']);
            localStorage.setItem('tasksV1_lastReset', todayKey());
            Renderer.renderList('popup1');
            Renderer.renderList('popup2');
            // 다음 자정 예약
            setTimeout(run, 24 * 60 * 60 * 1000);
        }, msUntilNextMidnight());
    }

    // ----- 초기화 -----
    TaskStore.init();
    Renderer.renderAll();
    dailyResetIfNeeded();   // 앱 로드시 날짜 바뀌었으면 초기화
    scheduleMidnightReset(); // 다음 자정에 자동 초기화
});

// ================== Rewards (popup4) ==================
const Rewards = (() => {
    const LS_KEY = 'rewardsV1';
    const state = {
        points: 0,
        roseTotal: 0,
        silverTotal: 0,
        goldTotal: 0,
        roseCycle: 0,    // 로즈 해금 카운터(0~10, 10에서 정지)
        silverCycle: 0   // 골드 해금 카운터(0~10, 10에서 정지)
    };

    // ---- 로컬스토리지 ----
    function load() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                Object.assign(state, data);
            } else {
                save();
            }
        } catch {
            save();
        }
        try {
            const legacy = localStorage.getItem('roseKeyCount');
            if (legacy != null) {
                const n = Math.max(0, Number(legacy) || 0);
                if (!state.roseTotal && n > 0) {
                    state.roseTotal = n;
                    save();
                }
                localStorage.removeItem('roseKeyCount');
            }
        } catch { }
    }
    function save() {
        localStorage.setItem(LS_KEY, JSON.stringify(state));
    }

    // ★ 추가: 로컬스토리지 → 메모리(state) 재하이드레이터
    function refreshFromStorage() {
        try {
            const obj = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
            // 숫자 필드만 엄격히 병합
            const keys = ['points', 'roseTotal', 'silverTotal', 'goldTotal', 'roseCycle', 'silverCycle'];
            for (const k of keys) {
                if (obj[k] != null && !Number.isNaN(Number(obj[k]))) {
                    state[k] = Number(obj[k]);
                }
            }
        } catch { /* noop */ }
    }

    // ---- DOM 훅 ----
    let scope, pointsValueEl, pointsButtonEl, btnRose, btnSilver, btnGold;

    function cacheElements() {
        scope = document.getElementById('popup4');
        if (!scope) return;

        // h2 옆 포인트 버튼(.addbutton) + 내부 숫자(#pointsValue)
        pointsButtonEl = scope.querySelector('.addbutton');
        pointsValueEl = scope.querySelector('#pointsValue');

        // 구매/받기 버튼들
        btnRose = scope.querySelector('#buyRoseBtn');
        btnSilver = scope.querySelector('#buySilverBtn');
        btnGold = scope.querySelector('#buyGoldBtn');
    }

    // ---- UI 갱신 ----
    function updateUI() {
        if (pointsValueEl) pointsValueEl.textContent = state.points;
        // if (pointsButtonEl) pointsButtonEl.textContent = `${state.points}`;

        // 활성/비활성
        if (btnRose) btnRose.disabled = !(state.points >= 1);
        if (btnSilver) btnSilver.disabled = !(state.roseCycle === 10);
        if (btnGold) btnGold.disabled = !(state.silverCycle === 10);
    }

    // ---- 규칙 함수 ----
    function grantPoints(n) {
        refreshFromStorage(); // ★ 저장 전에 최신 LS → 메모리 동기화
        const v = Math.max(0, Number(n) || 0);
        if (!v) return;
        state.points += v;
        save(); updateUI();
        window.dispatchEvent(new CustomEvent('rewards:update'));
    }

    function buyRose() {
        refreshFromStorage();  
        if (state.points < 1) return;
        state.points -= 1;
        state.roseTotal += 1;
        state.roseCycle = Math.min(10, state.roseCycle + 1);
        save(); updateUI();
        window.dispatchEvent(new CustomEvent('rewards:update'));
    }

    function claimSilver() {
        refreshFromStorage();  
        if (state.roseCycle !== 10) return;
        state.silverTotal += 1;
        state.roseCycle = 0; // 초기화
        state.silverCycle = Math.min(10, state.silverCycle + 1);
        save(); updateUI();
        window.dispatchEvent(new CustomEvent('rewards:update'));
    }

    function claimGold() {
        refreshFromStorage();  
        if (state.silverCycle !== 10) return;
        state.goldTotal += 1;
        state.silverCycle = 0; // 초기화
        save(); updateUI();
        window.dispatchEvent(new CustomEvent('rewards:update'));
    }

    // ---- 이벤트 바인딩 ----
    function bind() {
        btnRose?.addEventListener('click', buyRose);
        btnSilver?.addEventListener('click', claimSilver);
        btnGold?.addEventListener('click', claimGold);
    }

    function init() {
        load();
        cacheElements();
        bind();
        updateUI();
        window.addEventListener('rewards:update', () => {
            refreshFromStorage();
            updateUI();
        });
    }

    function getRose() {
        return state.roseTotal;
    }
    function setRose(n) {
        state.roseTotal = Math.max(0, Number(n) || 0);
        save(); updateUI();
        window.dispatchEvent(new CustomEvent('rewards:update'));
    }
    function consumeRose(n = 1) {
        refreshFromStorage();  // ★ 추가
        const v = Math.max(0, Number(n) || 0);
        if (state.roseTotal < v) return false;
        state.roseTotal -= v;
        save(); updateUI();
        window.dispatchEvent(new CustomEvent('rewards:update'));
        return true;
    }

    return {
        init,
        grantPoints,    
        getRose, setRose, consumeRose, 
        _state: state,
        _save: save, _updateUI: updateUI
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    Rewards.init();
});

// ================== Profile(헤더) ==================
const Profile = (() => {
    const LS_KEY = 'profileV1';
    const state = { nickname: '익명', rank: 1, keray: 0 };

    // DOM
    let elNick, elEditBtn, elNickInput, elRank, elRose, elSilver, elGold, elKeray;

    function load() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) { Object.assign(state, JSON.parse(raw)); }
            else save();
        } catch { save(); }
    }
    function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }

    function cache() {
        elNick = document.getElementById('headerNickname');
        elEditBtn = document.getElementById('btnEditNick');
        elNickInput = document.getElementById('nickInput');
        elRank = document.getElementById('headerRank');
        elRose = document.getElementById('hdrRose');
        elSilver = document.getElementById('hdrSilver');
        elGold = document.getElementById('hdrGold');
        elKeray = document.getElementById('hdrKeray');
    }

    function render() {
        if (elNick) elNick.textContent = state.nickname;
        if (elRank) elRank.textContent = state.rank;
        if (elKeray) elKeray.textContent = state.keray;

        // Rewards 연동(있으면)
        const R = (window.Rewards && window.Rewards._state) ? window.Rewards._state : null;
        if (R) {
            if (elRose) elRose.textContent = R.roseTotal ?? 0;
            if (elSilver) elSilver.textContent = R.silverTotal ?? 0;
            if (elGold) elGold.textContent = R.goldTotal ?? 0;
        }
    }

    function startEdit() {
        if (!elNick || !elNickInput) return;
        elNick.style.display = 'none';
        elNickInput.style.display = 'inline-block';
        elNickInput.value = state.nickname;
        elNickInput.focus();
        elNickInput.select();
    }
    function commitEdit() {
        if (!elNick || !elNickInput) return;
        const v = (elNickInput.value || '').trim();
        if (v.length > 0 && v.length <= 20) {
            state.nickname = v;
            save();
        }
        elNickInput.style.display = 'none';
        elNick.style.display = '';
        render();
    }

    function bind() {
        elNick?.addEventListener('click', startEdit);

        elNickInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') commitEdit(); });
        elNickInput?.addEventListener('blur', commitEdit);

        window.addEventListener('rewards:update', render);
        window.addEventListener('profile:update', render);
    }

    function init() {
        load(); cache(); bind(); render();
    }

    return { init, state };
})();

document.addEventListener('DOMContentLoaded', () => {
    Profile.init();
});

// ===== Header Key Counters (로즈/실버/골드) =====
(function HeaderKeys() {
    const LS_KEY = 'rewardsV1';

    // 헤더 칩 요소 캐시
    const elRose = document.getElementById('hdrRose');
    const elSilver = document.getElementById('hdrSilver');
    const elGold = document.getElementById('hdrGold');

    function readFromLS() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return { roseTotal: 0, silverTotal: 0, goldTotal: 0 };
            const obj = JSON.parse(raw);
            return {
                roseTotal: Number(obj.roseTotal ?? 0),
                silverTotal: Number(obj.silverTotal ?? 0),
                goldTotal: Number(obj.goldTotal ?? 0),
            };
        } catch {
            return { roseTotal: 0, silverTotal: 0, goldTotal: 0 };
        }
    }

    function currentState() {
        // Rewards 모듈이 있으면 그 상태를 우선 사용
        if (window.Rewards && Rewards._state) return Rewards._state;
        // 없으면 LocalStorage에서 읽음
        return readFromLS();
    }

    function render() {
        const s = currentState();
        if (elRose) elRose.textContent = s.roseTotal ?? 0;
        if (elSilver) elSilver.textContent = s.silverTotal ?? 0;
        if (elGold) elGold.textContent = s.goldTotal ?? 0;
    }

    // 초기 1회 렌더
    render();

    // Rewards 모듈에서 변경 이벤트를 쏴주면 즉시 반영
    window.addEventListener('rewards:update', render);

    // 혹시 사용자가 다른 탭에서 조작한 뒤 돌아올 때 동기화
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') render();
    });
})();

// 확대 제스처 차단(iOS Safari)
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('gestureend', e => e.preventDefault());

// 더블클릭 확대 방지
document.addEventListener('dblclick', e => e.preventDefault());

// ===== 로즈키 카운트 동기화 =====
(function RoseKeySync() {
    const roseKeyCount = document.getElementById('roseKeyCount');

    function getState() {
        if (window.Rewards && window.Rewards._state) return window.Rewards._state;
        try { return JSON.parse(localStorage.getItem('rewardsV1') || '{}') || {}; }
        catch { return {}; }
    }

    function sync() {
        if (!roseKeyCount) return;
        const s = getState();
        const val = Number(s.roseTotal || 0);
        roseKeyCount.textContent = val;
    }

    sync();
    window.addEventListener('rewards:update', sync);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') sync();
    });
})();


function applyHighlight(matches) {
    // 모든 슬롯에서 하이라이트 제거
    document.querySelectorAll(".puzzle-slot").forEach(slot => {
        slot.classList.remove("highlight");
    });

    // 매칭된 좌표에 다시 하이라이트 부여
    matches.forEach(([r, c]) => {
        const idx = r * 6 + c; // cols=6
        const slot = document.querySelectorAll(".puzzle-slot")[idx];
        if (slot) slot.classList.add("highlight");
    });
}

function resetAllLocalStorage() {
    localStorage.clear();
    location.reload(); // 필요 시 페이지 새로고침으로 상태 초기화
}

// 아이콘 기본 복구: 슬롯 6칸(h1~h6)만 기본 아이콘으로 되돌림
function resetAllyIconsToDefault() {
    try {
        // 1) 커스텀 아이콘 제거
        for (let i = 1; i <= 6; i++) {
            localStorage.removeItem(`allyIcon:${i}`);
        }

        // 2) DOM의 슬롯 이미지 즉시 기본 경로로 복원
        for (let i = 1; i <= 6; i++) {
            const slot = document.getElementById('h' + i);
            if (!slot) continue;
            const img = slot.querySelector('img');
            if (!img) continue;
            img.src = `icons/h${i}.png`; // 기본 아이콘 파일명 규칙
            img.alt = `ally ${i}`;
        }

        // 3) (선택) 크롭 모달이 열려 있을 수도 있으니 닫기만
        const cropModal = document.getElementById('iconCropModal');
        if (cropModal && typeof showModal === 'function') {
            showModal(cropModal, false);
        }

        // 4) 필요 시, 다른 화면에서도 6칸 아이콘을 다시 적용하도록 이벤트 브로드캐스트
        window.dispatchEvent(new CustomEvent('allyIcon:reset'));
    } catch (e) {
        alert('아이콘 복구 중 오류가 발생했습니다.');
        console.error(e);
    }
}
// ===== 적도감(간단) =====
(function(){
  const btnOpen = document.getElementById('btnBestiary');
  const popup = document.getElementById('BestiaryPopup');
  const grid = document.getElementById('bestGrid');
  const bestAttr = document.getElementById('bestAttr');
  const bestClose = document.getElementById('bestClose');

  const detail = document.getElementById('bestDetail');
  const bestIcon = document.getElementById('bestIcon');
  const bestMotifName = document.getElementById('bestMotifName');
  const bestAttrView = document.getElementById('bestAttrView');

  const bossPrev = document.getElementById('bestBossPrev');
  const elitePrev = document.getElementById('bestElitePrev');
  const bossURL = document.getElementById('bestBossURL');
  const bossFile = document.getElementById('bestBossFile');
  const bossClear = document.getElementById('bestBossClear');
  const eliteURL = document.getElementById('bestEliteURL');
  const eliteFile = document.getElementById('bestEliteFile');
  const eliteClear = document.getElementById('bestEliteClear');
  const fileInput = document.getElementById('bestFileInput');

  if (!btnOpen || !popup || !grid) return;

  // 모티프(하드코딩 목록) - 필요 시 텍스트만 바꾸면 됨
  const MOTIFS = [
    { key:'myo', name:'묘(토끼)' }, { key:'seo', name:'서(쥐)' }, { key:'yang', name:'양(양)' },
    { key:'won', name:'원(원숭이)' }, { key:'jeo', name:'저(돼지)' }, { key:'rang', name:'랑(늑대)' },
    { key:'gu', name:'구(개)' }, { key:'u', name:'우(소)' }, { key:'sang', name:'상(코끼리)' },
    { key:'ho', name:'호(호랑이)' }, { key:'pyo', name:'표(표범)' }, { key:'jo', name:'조(새)' },
    { key:'rok', name:'록(사슴)' }, { key:'ma', name:'마(말)' }, { key:'eo', name:'어(물고기)' },
    { key:'gwi', name:'귀(거북이)' }, { key:'gyo', name:'교(상어)' },
  ];
  const ATTR_LABEL = { s:'S(적)', m:'M(백)', e:'E', w:'W', n:'N', l:'L' };

  // 저장소 키(딱 2개만 씀)
  const LS_BOSS  = 'bestiaryBossIllustV1';
  const LS_ELITE = 'bestiaryEliteIllustV1';
  const key = (attr, motif) => `${motif}|${attr}`;

  // 기본 경로(하드코딩). 파일명 규칙에 맞춰 두시면 됩니다.
  const defaultBoss  = (attr, motif)=> `enemies/boss/${motif}_${attr}.png`;
  const defaultElite = (attr, motif)=> `enemies/elite/${motif}_${attr}.png`;

  const loadMap = (lsKey)=> { try{ return JSON.parse(localStorage.getItem(lsKey)||'{}')||{} }catch{ return {} } };
  const saveMap = (lsKey, obj)=> { try{ localStorage.setItem(lsKey, JSON.stringify(obj)); }catch{} };

  // 전역 리졸버(모험 탭이 쓸 수 있게)
  window.getBossIllustURL  = (attr, motif)=> (loadMap(LS_BOSS)[key(attr,motif)]  || defaultBoss(attr,motif));
  window.getEliteIllustURL = (attr, motif)=> (loadMap(LS_ELITE)[key(attr,motif)] || defaultElite(attr,motif));

  // 팝업 열기/닫기
  btnOpen.addEventListener('click', ()=>{ popup.style.display='block'; renderGrid(); });
  bestClose?.addEventListener('click', ()=>{ popup.style.display='none'; detail.hidden=true; });
  bestAttr?.addEventListener('change', ()=> { renderDetail(); });

  // 그리드 생성(가시적으로 보기 쉽게)
  function renderGrid(){
    grid.innerHTML = '';
    MOTIFS.forEach(m=>{
      const card = document.createElement('div');
      card.className = 'bestiary-card';
      const img = document.createElement('img');
      img.src = `icons/mon/${m.key}.png`;
      img.onerror = ()=>{ img.src='icons/m2.png'; };
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = m.name;
      card.appendChild(img);
      card.appendChild(name);
      card.addEventListener('click', ()=> openDetail(m));
      grid.appendChild(card);
    });
  }

  let currentMotif = null;
  function openDetail(m){
    currentMotif = m;
    detail.hidden = false;
    bestIcon.src = `icons/mon/${m.key}.png`;
    bestIcon.onerror = ()=>{ bestIcon.src='icons/m2.png'; };
    bestMotifName.textContent = m.name;
    renderDetail();
  }

  function renderDetail(){
    if(!currentMotif) return;
    const a = bestAttr.value || 's';
    bestAttrView.textContent = ATTR_LABEL[a] || a;

    // 프리뷰는 저장된 값(있으면 DataURL/URL) → 없으면 기본 경로
    bossPrev.src  = window.getBossIllustURL(a,  currentMotif.key);
    elitePrev.src = window.getEliteIllustURL(a, currentMotif.key);
  }

  // URL 입력 처리(간단)
  bossURL?.addEventListener('click', ()=>{
    if(!currentMotif) return;
    const a = bestAttr.value || 's';
    const url = prompt('보스 일러스트 URL을 입력하세요 (또는 취소로 무시)');
    if(!url) return;
    const map = loadMap(LS_BOSS); map[key(a,currentMotif.key)] = url; saveMap(LS_BOSS, map);
    renderDetail();
  });
  eliteURL?.addEventListener('click', ()=>{
    if(!currentMotif) return;
    const a = bestAttr.value || 's';
    const url = prompt('엘리트 보스 일러스트 URL을 입력하세요 (또는 취소로 무시)');
    if(!url) return;
    const map = loadMap(LS_ELITE); map[key(a,currentMotif.key)] = url; saveMap(LS_ELITE, map);
    renderDetail();
  });

  // 파일 업로드 → DataURL 저장(크롭 없음, 가장 단순)
  bossFile?.addEventListener('click', ()=>{ fileInput?.click(); fileInput._target='boss'; });
  eliteFile?.addEventListener('click', ()=>{ fileInput?.click(); fileInput._target='elite'; });

  fileInput?.addEventListener('change', (e)=>{
    const f = e.target.files?.[0]; if(!f || !currentMotif) return;
    const a = bestAttr.value || 's';
    const reader = new FileReader();
    reader.onload = ()=>{
      const dataURL = reader.result; // 그대로 저장
      if (fileInput._target==='boss'){
        const map = loadMap(LS_BOSS); map[key(a,currentMotif.key)] = dataURL; saveMap(LS_BOSS, map);
      } else {
        const map = loadMap(LS_ELITE); map[key(a,currentMotif.key)] = dataURL; saveMap(LS_ELITE, map);
      }
      renderDetail();
      fileInput.value='';
      fileInput._target='';
      // 모험 탭이 보고 있다면 즉시 반영하도록 이벤트 송출(선택)
      window.dispatchEvent(new CustomEvent('bestiary:update', { detail:{ attr:a, motif:currentMotif.key } }));
    };
    reader.readAsDataURL(f);
  });

  // 기본 복구(삭제)
  bossClear?.addEventListener('click', ()=>{
    if(!currentMotif) return;
    const a = bestAttr.value || 's';
    const map = loadMap(LS_BOSS); delete map[key(a,currentMotif.key)]; saveMap(LS_BOSS, map);
    renderDetail();
  });
  eliteClear?.addEventListener('click', ()=>{
    if(!currentMotif) return;
    const a = bestAttr.value || 's';
    const map = loadMap(LS_ELITE); delete map[key(a,currentMotif.key)]; saveMap(LS_ELITE, map);
    renderDetail();
  });
})();
