// ===== Summon popups =====
(function () {
    const popup_IDS = ['summonMain', 'gateKerei', 'gateRoseKerei', 'gateGoldKerei'];
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
        byId('btnGateKerei')?.addEventListener('click', () => show('gateKerei'));
        byId('btnGateRoseKerei')?.addEventListener('click', () => show('gateRoseKerei'));
        byId('btnGateGoldKerei')?.addEventListener('click', () => show('gateGoldKerei'));

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
            // data-popup-target="#gateKerei" 같은 형태도 지원
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
