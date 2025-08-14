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

function bindLongPress(el, onLongPress, ms = 700) {
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
    // ----- 팝업 토글(footer 버튼) -----
    const popups = document.querySelectorAll('.popup');
    const footerButtons = document.querySelectorAll('footer button');
    let activePopup = null;

    footerButtons.forEach(button => {
        button.addEventListener('click', () => {
            const popupId = button.getAttribute('data-popup');
            const targetPopup = document.getElementById(popupId);
            if (!targetPopup) return;

            if (activePopup === targetPopup) {
                targetPopup.classList.remove('show');
                activePopup = null;
                return;
            }
            popups.forEach(p => p.classList.remove('show'));
            targetPopup.classList.add('show');
            activePopup = targetPopup;
        });
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
