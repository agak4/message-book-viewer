const AppParams = {
    imagePrefix: 'photo',
    totalImages: 127,
    extension: 'jpg'
};

const BookmarkList = [
    { page: 2, label: "목차", color: "#F7E5FF" },
    { page: 4, label: "입덕 계기", color: "#E4F0FE" },
    { page: 10, label: "클리셰란<br>나에게", color: "#E4F0FE" },
    { page: 18, label: "좋았던 &<br>보고싶은 케미", color: "#FFE4EB" },
    { page: 36, label: "첫인상<br>현인상", color: "#EFFFE5" },
    { page: 78, label: "단체곡 &<br>데뷔곡 후기", color: "#F7E5FF" },
    { page: 104, label: "1주년<br>축하 메세지", color: "#E4F0FE" }
];

// 즉시 표시할 페이지 ±범위
const EAGER_RADIUS = 3;
// 백그라운드 동시 요청 수 (브라우저 연결 한도 고려)
const PRELOAD_CONCURRENCY = 4;

const state = {
    currentPageIndex: 0,
    prevPageIndex: 0,
    totalPages: Math.ceil((AppParams.totalImages + 1) / 2),
    isDragging: false,
    startX: 0,
    startTime: 0,
    isDraggingProgressBar: false
};

const dom = {
    book: document.getElementById('book'),
    progressBar: document.getElementById('progressBar'),
    progressFill: document.getElementById('progressFill'),
    pagePreview: document.getElementById('pagePreview'),
    previewImage: document.getElementById('previewImage'),
    previewText: document.getElementById('previewText'),
    pageCounter: document.getElementById('pageCounter')
};

// ── 이미지 캐시 & 우선순위 프리로더 ──────────────────────────────
const imageCache = new Map(); // path → HTMLImageElement
let preloadQueue = [];        // 대기 경로 배열 (앞 = 높은 우선순위)
let activeLoads = 0;

function getImagePath(num) {
    if (num < 0 || num >= AppParams.totalImages) return '';
    return `images/${AppParams.imagePrefix}${num.toString().padStart(3, '0')}.${AppParams.extension}`;
}

/**
 * 경로를 큐에 추가합니다.
 * urgent=true 이면 큐 맨 앞에 삽입(현재 페이지 주변 우선).
 */
function enqueue(path, urgent = false) {
    if (!path || imageCache.has(path)) return;

    // 이미 대기 중이면 위치만 조정
    const idx = preloadQueue.indexOf(path);
    if (idx !== -1) {
        if (urgent && idx !== 0) preloadQueue.splice(idx, 1);
        else return;
    }

    if (urgent) preloadQueue.unshift(path);
    else preloadQueue.push(path);

    drainQueue();
}

/** 동시 요청 수를 지키며 큐를 소진합니다. */
function drainQueue() {
    while (activeLoads < PRELOAD_CONCURRENCY && preloadQueue.length > 0) {
        const path = preloadQueue.shift();
        if (imageCache.has(path)) { drainQueue(); return; }

        activeLoads++;
        const img = new Image();
        img.onload = img.onerror = () => {
            activeLoads--;
            imageCache.set(path, img);
            applyToDOM(path, img.src);
            drainQueue();
        };
        img.src = path;
    }
}

/** 로드 완료된 이미지를 data-src 로 대기 중인 DOM 요소에 반영합니다. */
function applyToDOM(path, src) {
    dom.book.querySelectorAll(`img[data-src="${path}"]`).forEach(el => {
        el.src = src;
        el.removeAttribute('data-src');
    });
}

/**
 * 현재 페이지 기준으로 프리로드 우선순위를 재편합니다.
 *   1순위: 현재 ±EAGER_RADIUS → urgent 큐 앞 삽입
 *   2순위: 나머지 전체 → 일반 큐 (백그라운드, 이미 캐시된 건 자동 스킵)
 */
function schedulePriority() {
    const cur = state.currentPageIndex;

    // 1) 즉시 범위: urgent
    for (let i = Math.max(0, cur - EAGER_RADIUS); i <= Math.min(state.totalPages - 1, cur + EAGER_RADIUS); i++) {
        enqueue(getImagePath(i === 0 ? 0 : i * 2), true);
        enqueue(getImagePath(i === 0 ? 1 : i * 2 + 1), true);
    }

    // 2) 나머지 전체: 일반 큐
    for (let i = 0; i < state.totalPages; i++) {
        if (Math.abs(i - cur) <= EAGER_RADIUS) continue;
        enqueue(getImagePath(i === 0 ? 0 : i * 2));
        enqueue(getImagePath(i === 0 ? 1 : i * 2 + 1));
    }
}

// ── 책 렌더링 ─────────────────────────────────────────────────────
function renderBook() {
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < state.totalPages; i++) {
        const page = document.createElement('div');
        page.className = 'page';
        page.id = `page-${i}`;

        const fi = i === 0 ? 0 : i * 2;
        const bi = i === 0 ? 1 : i * 2 + 1;
        const fpPath = getImagePath(fi);
        const bpPath = getImagePath(bi);

        // 이미 캐시된 경우 src, 아직이면 data-src (프리로더가 채워줌)
        const fa = imageCache.has(fpPath) ? `src="${fpPath}"` : `data-src="${fpPath}"`;
        const ba = imageCache.has(bpPath) ? `src="${bpPath}"` : `data-src="${bpPath}"`;

        page.innerHTML = `
            <div class="page-face front">
                <img ${fa} alt="Page ${fi}">
            </div>
            <div class="page-face back">
                <img ${ba} alt="Page ${bi}">
            </div>
        `;

        page.style.zIndex = state.totalPages - i;
        fragment.appendChild(page);
    }

    dom.book.innerHTML = '';
    dom.book.appendChild(fragment);
}

// ── 북마크 ────────────────────────────────────────────────────────
function renderBookmarks() {
    const track = document.getElementById('bookmarkTrack');
    if (!track) return;

    const fragment = document.createDocumentFragment();
    const trackMax = AppParams.totalImages - 1;

    BookmarkList.forEach(bm => {
        const percent = (bm.page / trackMax) * 100;
        const bubble = document.createElement('div');
        bubble.className = 'progress-bookmark';
        bubble.style.setProperty('--bookmark-pos', `${percent}%`);
        bubble.style.setProperty('--bookmark-bg', bm.color);
        bubble.innerHTML = bm.label;

        const hitbox = document.createElement('div');
        hitbox.className = 'bookmark-hitbox';
        bubble.appendChild(hitbox);

        bubble.addEventListener('click', (e) => {
            e.stopPropagation();
            flipToPage(Math.ceil(bm.page / 2));
        });

        fragment.appendChild(bubble);
    });

    track.innerHTML = '';
    track.appendChild(fragment);
}

// ── 페이지 이동 ───────────────────────────────────────────────────
function flipToPage(index) {
    const clamped = Math.max(0, Math.min(index, state.totalPages - 1));
    if (clamped === state.currentPageIndex) return;

    state.prevPageIndex = state.currentPageIndex;
    state.currentPageIndex = clamped;
    updateBookState();
}

/** 변경된 범위 페이지만 클래스/z-index 업데이트 (O(|delta|)) */
function updateBookState() {
    const prev = state.prevPageIndex;
    const curr = state.currentPageIndex;

    if (prev < curr) {
        for (let i = prev; i < curr; i++) {
            const page = document.getElementById(`page-${i}`);
            if (!page) continue;
            page.classList.add('flipped');
            page.style.zIndex = i;
        }
    } else {
        for (let i = curr; i < prev; i++) {
            const page = document.getElementById(`page-${i}`);
            if (!page) continue;
            page.classList.remove('flipped');
            page.style.zIndex = state.totalPages - i;
        }
    }

    schedulePriority(); // 새 위치 기준으로 로딩 우선순위 재편
    updateMobileTransform();
    updateUI();
}

function updateMobileTransform() {
    if (window.innerWidth <= 768) {
        dom.book.style.transform = state.currentPageIndex > 0 ? 'translateX(45vw)' : 'translateX(-45vw)';
    } else {
        dom.book.style.transform = 'none';
    }
}

function updateUI() {
    let currentDisp = state.currentPageIndex * 2;
    if (currentDisp === 0) currentDisp = 1;

    dom.pageCounter.textContent = `Page ${currentDisp} / ${AppParams.totalImages - 1}`;

    if (!state.isDraggingProgressBar) {
        const trackMax = AppParams.totalImages - 1;
        const currentTrack = Math.min(state.currentPageIndex * 2, trackMax);
        const progressVal = (currentTrack / trackMax) * 100;
        dom.progressBar.value = progressVal * 100;
        dom.progressFill.style.width = `${progressVal}%`;
    }
}

// ── 드래그 / 스와이프 ─────────────────────────────────────────────
function initDrag() {
    const handleStart = (e) => {
        state.isDragging = true;
        state.startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        state.startTime = Date.now();
    };

    const handleEnd = (e) => {
        if (!state.isDragging) return;
        state.isDragging = false;

        const endX = e.type.includes('touch') ? e.changedTouches[0].clientX : e.clientX;
        const diffX = endX - state.startX;
        const timeElapsed = Date.now() - state.startTime;

        if (Math.abs(diffX) > 60) {
            if (diffX < 0) flipToPage(state.currentPageIndex + 1);
            else flipToPage(state.currentPageIndex - 1);
        } else if (Math.abs(diffX) < 10 && timeElapsed < 400) {
            if (e.target.closest('.book')) {
                if (endX > window.innerWidth / 2) flipToPage(state.currentPageIndex + 1);
                else flipToPage(state.currentPageIndex - 1);
            }
        }
    };

    const vp = document.querySelector('.book-viewport');
    vp.addEventListener('mousedown', handleStart);
    window.addEventListener('mouseup', handleEnd);
    vp.addEventListener('touchstart', handleStart, { passive: true });
    window.addEventListener('touchend', handleEnd);
}

// ── 진행바 ────────────────────────────────────────────────────────
function initProgressBar() {
    dom.progressBar.max = 10000;

    const pbStart = () => { state.isDraggingProgressBar = true; };
    const pbEnd = () => {
        if (state.isDraggingProgressBar) {
            state.isDraggingProgressBar = false;
            updateUI();
        }
    };

    dom.progressBar.addEventListener('mousedown', pbStart);
    dom.progressBar.addEventListener('touchstart', pbStart, { passive: true });
    window.addEventListener('mouseup', pbEnd);
    window.addEventListener('touchend', pbEnd);

    dom.progressBar.addEventListener('input', (e) => {
        const percent = e.target.value / 10000;
        dom.progressFill.style.width = `${percent * 100}%`;

        const trackMax = AppParams.totalImages - 1;
        const targetPage = Math.round(percent * trackMax);
        flipToPage(Math.ceil(targetPage / 2));
    });

    dom.progressBar.addEventListener('mousemove', (e) => {
        const rect = dom.progressBar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const trackMax = AppParams.totalImages - 1;
        const hoverPage = Math.round(percent * trackMax);
        const previewWidth = 110;

        let previewX = e.clientX;
        if (previewX < previewWidth / 2 + 10) previewX = previewWidth / 2 + 10;
        if (previewX > window.innerWidth - previewWidth / 2 - 10) previewX = window.innerWidth - previewWidth / 2 - 10;

        dom.pagePreview.style.left = `${previewX}px`;
        dom.previewText.innerHTML = `Page ${hoverPage === 0 ? 1 : hoverPage}`;

        // 캐시에 있으면 캐시 이미지, 아직이면 직접 요청
        const path = getImagePath(hoverPage);
        const cached = imageCache.get(path);
        dom.previewImage.src = cached ? cached.src : path;

        dom.pagePreview.classList.add('active');
    });

    dom.progressBar.addEventListener('mouseleave', () => {
        dom.pagePreview.classList.remove('active');
    });
}

// ── resize 디바운스 ───────────────────────────────────────────────
let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateMobileTransform, 150);
});

// ── 초기화 ────────────────────────────────────────────────────────
function init() {
    renderBook();
    initDrag();
    renderBookmarks();
    initProgressBar();

    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') flipToPage(state.currentPageIndex + 1);
        if (e.key === 'ArrowLeft') flipToPage(state.currentPageIndex - 1);
    });

    updateMobileTransform();
    updateUI();

    // 첫 화면 페인트 이후 백그라운드 프리로드 시작
    // requestIdleCallback: 브라우저 유휴 시간에 실행 (없으면 200ms 지연)
    const startPreload = () => schedulePriority();
    if ('requestIdleCallback' in window) {
        requestIdleCallback(startPreload, { timeout: 500 });
    } else {
        setTimeout(startPreload, 200);
    }
}

document.addEventListener('DOMContentLoaded', init);