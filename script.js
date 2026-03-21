const AppParams = {
    imagePrefix: 'photo',
    totalImages: 127,
    webpDir: 'images/webp',
    imgDir: 'images/img',
    extension: 'webp',
    fallbackExtension: 'jpg'
};

// ── WebP 지원 여부 감지 (비동기, 결과는 즉시 캐싱) ───────────────
// 구형 브라우저(iOS 13 이하 등)에서는 jpg 로 폴백합니다.
let supportsWebP = null; // null = 감지 중, true/false = 확정

(function detectWebP() {
    const img = new Image();
    img.onload = () => { supportsWebP = (img.width === 1); };
    img.onerror = () => { supportsWebP = false; };
    img.src = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAkA4JZQCdAEO/gHOAAA=';
})();

const BookmarkList = [
    { page: 2, label: "목차", color: "#F7E5FF" },
    { page: 4, label: "입덕 계기", color: "#E4F0FE" },
    { page: 10, label: "클리셰란<br>나에게", color: "#E4F0FE" },
    { page: 18, label: "좋았던 &<br>보고싶은 케미", color: "#FFE4EB" },
    { page: 36, label: "첫인상<br>현인상", color: "#EFFFE5" },
    { page: 78, label: "단체곡 &<br>데뷔곡 후기", color: "#F7E5FF" },
    { page: 104, label: "1주년<br>축하 메세지", color: "#E4F0FE" }
];

const EAGER_RADIUS = 3;
const PRELOAD_CONCURRENCY = 4;
const MOBILE_BREAKPOINT = 768;

// ── 상태 ──────────────────────────────────────────────────────────
const state = {
    // 데스크탑: 스프레드 인덱스 (0 ~ totalPages-1)
    currentPageIndex: 0,
    prevPageIndex: 0,
    totalPages: Math.ceil((AppParams.totalImages + 1) / 2),

    // 모바일: 개별 이미지 인덱스 (0 ~ totalImages-1)
    mobileImageIndex: 0,

    isDragging: false,
    startX: 0,
    startTime: 0,
    isDraggingProgressBar: false
};

// ── DOM 참조 ──────────────────────────────────────────────────────
const dom = {
    book: document.getElementById('book'),
    progressBar: document.getElementById('progressBar'),
    progressFill: document.getElementById('progressFill'),
    pagePreview: document.getElementById('pagePreview'),
    previewImage: document.getElementById('previewImage'),
    previewText: document.getElementById('previewText'),
    pageCounter: document.getElementById('pageCounter'),
    // #mobile-view 는 init() 에서 동적 생성 후 할당
    mobileView: null,
    mobileImg: null
};

// ── 유틸 ──────────────────────────────────────────────────────────
function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
}

function getImagePath(num) {
    if (num < 0 || num >= AppParams.totalImages) return '';
    const filename = AppParams.imagePrefix + num.toString().padStart(3, '0');
    if (supportsWebP === false) {
        return `${AppParams.imgDir}/${filename}.${AppParams.fallbackExtension}`;
    }
    return `${AppParams.webpDir}/${filename}.${AppParams.extension}`;
}

// ── 이미지 캐시 & 우선순위 프리로더 ──────────────────────────────
const imageCache = new Map(); // path → HTMLImageElement
let preloadQueue = [];
let activeLoads = 0;

function enqueue(path, urgent = false) {
    if (!path || imageCache.has(path)) return;

    const idx = preloadQueue.indexOf(path);
    if (idx !== -1) {
        if (urgent && idx !== 0) preloadQueue.splice(idx, 1);
        else return;
    }

    if (urgent) preloadQueue.unshift(path);
    else preloadQueue.push(path);

    drainQueue();
}

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

/** 로드 완료 시 book 내 data-src 요소와 모바일 뷰를 함께 업데이트 */
function applyToDOM(path, src) {
    dom.book.querySelectorAll(`img[data-src="${path}"]`).forEach(el => {
        el.src = src;
        el.removeAttribute('data-src');
    });

    // 모바일에서 현재 보고 있는 이미지가 방금 로드됐으면 교체
    if (dom.mobileImg && dom.mobileImg.dataset.pending === path) {
        dom.mobileImg.src = src;
        dom.mobileImg.classList.remove('loading');
        delete dom.mobileImg.dataset.pending;
    }
}

/**
 * 현재 위치 기준 우선순위 재편
 *   - 모바일: mobileImageIndex 기준 ±EAGER_RADIUS 스프레드
 *   - 데스크탑: currentPageIndex 기준 ±EAGER_RADIUS 스프레드
 */
function schedulePriority() {
    const centerSpread = isMobile()
        ? Math.ceil(state.mobileImageIndex / 2)
        : state.currentPageIndex;

    for (let i = Math.max(0, centerSpread - EAGER_RADIUS);
        i <= Math.min(state.totalPages - 1, centerSpread + EAGER_RADIUS); i++) {
        enqueue(getImagePath(i === 0 ? 0 : i * 2), true);
        enqueue(getImagePath(i === 0 ? 1 : i * 2 + 1), true);
    }
    for (let i = 0; i < state.totalPages; i++) {
        if (Math.abs(i - centerSpread) <= EAGER_RADIUS) continue;
        enqueue(getImagePath(i === 0 ? 0 : i * 2));
        enqueue(getImagePath(i === 0 ? 1 : i * 2 + 1));
    }
}

// ── 모바일 뷰 ─────────────────────────────────────────────────────
function createMobileView() {
    const mv = document.createElement('div');
    mv.id = 'mobile-view';

    const img = document.createElement('img');
    img.id = 'mobile-img';
    img.alt = 'Page';
    mv.appendChild(img);

    // book-viewport 안에 삽입
    document.querySelector('.book-viewport').appendChild(mv);

    dom.mobileView = mv;
    dom.mobileImg = img;
}

/** 모바일 이미지 표시 업데이트 */
function updateMobileView() {
    const path = getImagePath(state.mobileImageIndex);
    const cached = imageCache.get(path);

    if (cached) {
        dom.mobileImg.src = cached.src;
        dom.mobileImg.classList.remove('loading');
        delete dom.mobileImg.dataset.pending;
    } else {
        dom.mobileImg.classList.add('loading');
        dom.mobileImg.src = path;
        dom.mobileImg.dataset.pending = path;
    }

    schedulePriority();
    updateUI();
}

/** 모바일 단일 이미지 이동 */
function navigateMobile(imgIndex) {
    const clamped = Math.max(0, Math.min(imgIndex, AppParams.totalImages - 1));
    if (clamped === state.mobileImageIndex) return;
    state.mobileImageIndex = clamped;
    updateMobileView();
}

// ── 레이아웃 전환 (모바일 ↔ 데스크탑) ────────────────────────────
function setupLayout() {
    if (isMobile()) {
        dom.book.style.display = 'none';
        dom.mobileView.style.display = 'flex';
        updateMobileView();
    } else {
        dom.book.style.display = '';
        dom.mobileView.style.display = 'none';
        updateUI();
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

        const fa = imageCache.has(fpPath) ? `src="${fpPath}"` : `data-src="${fpPath}"`;
        const ba = imageCache.has(bpPath) ? `src="${bpPath}"` : `data-src="${bpPath}"`;

        page.innerHTML = `
            <div class="page-face front"><img ${fa} alt="Page ${fi}"></div>
            <div class="page-face back"><img ${ba} alt="Page ${bi}"></div>
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

// ── 데스크탑 페이지 이동 ──────────────────────────────────────────
const pageTimeouts = new Map();
const pageTargetState = new Map();

function applyPageFlip(i, flip, delay, zIndexDuringFlip, duration) {
    const p = document.getElementById(`page-${i}`);
    if (!p) return;

    // 1. 기존 진행 중인 타이머가 있다면 즉시 취소 (초기화)
    if (pageTimeouts.has(i)) {
        pageTimeouts.get(i).forEach(clearTimeout);
        pageTimeouts.delete(i);
    }

    const timeouts = new Set();
    const addTimer = (time, fn) => {
        const tid = setTimeout(() => {
            fn();
            timeouts.delete(tid);
            // 모든 예약 작업이 끝났다면 맵에서 제거하여 메모리 관리
            if (timeouts.size === 0 && pageTimeouts.get(i) === timeouts) {
                pageTimeouts.delete(i);
            }
        }, time);
        timeouts.add(tid);
    };
    pageTimeouts.set(i, timeouts);

    addTimer(delay, () => {
        p.style.transitionDuration = `${duration}ms`;
        p.style.zIndex = zIndexDuringFlip;
        
        void p.offsetWidth; // 엔진 리플로우 강제

        if (flip) {
            p.classList.add('flipped');
            addTimer(duration, () => {
                p.style.zIndex = i;
                p.style.transitionDuration = '';
            });
        } else {
            p.classList.remove('flipped');
            addTimer(duration, () => {
                p.style.zIndex = state.totalPages - i;
                p.style.transitionDuration = '';
            });
        }
    });
}

function flipToPage(index) {
    const clamped = Math.max(0, Math.min(index, state.totalPages - 1));
    if (clamped === state.currentPageIndex) return;

    state.prevPageIndex = state.currentPageIndex;
    state.currentPageIndex = clamped;
    updateBookState();
}

/** 변경 범위 페이지만 z-index 관리하며 순차적 페이지 전환 효과 */
function updateBookState() {
    const curr = state.currentPageIndex;

    const toFlip = [];
    const toUnflip = [];

    for (let i = 0; i < state.totalPages; i++) {
        const shouldBeFlipped = i < curr;
        const currentTarget = pageTargetState.has(i) ? pageTargetState.get(i) : false;

        if (shouldBeFlipped !== currentTarget) {
            pageTargetState.set(i, shouldBeFlipped);
            if (shouldBeFlipped) toFlip.push(i);
            else toUnflip.push(i);
        }
    }

    toFlip.sort((a, b) => a - b);
    toUnflip.sort((a, b) => b - a);

    const totalFlips = toFlip.length + toUnflip.length;
    let duration = 1200;
    let staggerDelay = 120;

    if (totalFlips > 1) {
        duration = Math.max(400, 1000 - totalFlips * 20);
        staggerDelay = (1000 - duration) / (totalFlips - 1);
        if (staggerDelay < 5) staggerDelay = 5;
    }

    let baseDelay = 0;

    toFlip.forEach(i => {
        const zIndexDuring = 1000 + i;
        applyPageFlip(i, true, baseDelay, zIndexDuring, duration);
        baseDelay += staggerDelay;
    });

    toUnflip.forEach(i => {
        const zIndexDuring = 1000 + (state.totalPages - i);
        applyPageFlip(i, false, baseDelay, zIndexDuring, duration);
        baseDelay += staggerDelay;
    });

    schedulePriority();
    updateUI();
}

/**
 * 모바일 → 데스크탑 전환 시 책의 모든 flipped 상태를 currentPageIndex 기준으로 재구성
 * (리사이즈 직후 스프레드가 엇나가지 않도록)
 */
function rebuildBookFlippedState() {
    for (let i = 0; i < state.totalPages; i++) {
        const p = document.getElementById(`page-${i}`);
        if (!p) continue;
        const shouldBeFlipped = i < state.currentPageIndex;

        if (shouldBeFlipped) {
            p.classList.add('flipped');
            p.style.zIndex = i;
        } else {
            p.classList.remove('flipped');
            p.style.zIndex = state.totalPages - i;
        }

        pageTargetState.set(i, shouldBeFlipped);
        if (pageTimeouts.has(i)) {
            pageTimeouts.get(i).forEach(clearTimeout);
            pageTimeouts.delete(i);
        }
    }
}

// ── UI 업데이트 ───────────────────────────────────────────────────
function updateUI() {
    const trackMax = AppParams.totalImages - 1;

    if (isMobile()) {
        const imgIdx = state.mobileImageIndex;
        dom.pageCounter.textContent = `Page ${Math.max(1, imgIdx)} / ${trackMax}`;
        if (!state.isDraggingProgressBar) {
            const pct = (imgIdx / trackMax) * 100;
            dom.progressBar.value = pct * 100;
            dom.progressFill.style.width = `${pct}%`;
        }
    } else {
        let disp = state.currentPageIndex * 2;
        if (disp === 0) disp = 1;
        dom.pageCounter.textContent = `Page ${disp} / ${trackMax}`;
        if (!state.isDraggingProgressBar) {
            const track = Math.min(state.currentPageIndex * 2, trackMax);
            const pct = (track / trackMax) * 100;
            dom.progressBar.value = pct * 100;
            dom.progressFill.style.width = `${pct}%`;
        }
    }
}

// ── 드래그 / 탭 / 스와이프 ───────────────────────────────────────
function initDrag() {
    const handleStart = (e) => {
        if (e.target.closest('.progress-container')) return;
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

        if (isMobile()) {
            // ── 모바일: 스와이프 or 탭 → 개별 이미지 이동 ──
            if (Math.abs(diffX) > 40) {
                // 스와이프
                if (diffX < 0) navigateMobile(state.mobileImageIndex + 1);
                else navigateMobile(state.mobileImageIndex - 1);
            } else if (Math.abs(diffX) < 10 && timeElapsed < 400) {
                // 탭: 화면 중앙 기준 오른쪽 → 다음, 왼쪽 → 이전
                if (endX > window.innerWidth / 2) navigateMobile(state.mobileImageIndex + 1);
                else navigateMobile(state.mobileImageIndex - 1);
            }
        } else {
            // ── 데스크탑: 기존 스프레드 이동 ──
            if (Math.abs(diffX) > 60) {
                if (diffX < 0) flipToPage(state.currentPageIndex + 1);
                else flipToPage(state.currentPageIndex - 1);
            } else if (Math.abs(diffX) < 10 && timeElapsed < 400) {
                if (e.target.closest('.book')) {
                    if (endX > window.innerWidth / 2) flipToPage(state.currentPageIndex + 1);
                    else flipToPage(state.currentPageIndex - 1);
                }
            }
        }
    };

    const vp = document.querySelector('.book-viewport');
    vp.addEventListener('mousedown', handleStart);
    vp.addEventListener('touchstart', handleStart, { passive: true });
    window.addEventListener('mouseup', handleEnd);
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
        const targetImgIdx = Math.round(percent * trackMax);

        if (isMobile()) {
            navigateMobile(targetImgIdx);
        } else {
            flipToPage(Math.ceil(targetImgIdx / 2));
        }
    });

    // 호버 미리보기 (데스크탑 전용)
    dom.progressBar.addEventListener('mousemove', (e) => {
        if (isMobile()) return;

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

        const path = getImagePath(hoverPage);
        const cached = imageCache.get(path);
        dom.previewImage.src = cached ? cached.src : path;

        dom.pagePreview.classList.add('active');
    });

    dom.progressBar.addEventListener('mouseleave', () => {
        dom.pagePreview.classList.remove('active');
    });
}

// ── 리사이즈 ─────────────────────────────────────────────────────
let resizeTimer = null;
let wasMobileRef = false; // 이전 렌더링 시 모바일 여부 기억

function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const nowMobile = isMobile();

        if (wasMobileRef && !nowMobile) {
            // 모바일 → 데스크탑: mobileImageIndex → currentPageIndex 동기화
            const synced = Math.ceil(state.mobileImageIndex / 2);
            state.prevPageIndex = synced;
            state.currentPageIndex = synced;
            rebuildBookFlippedState();
        } else if (!wasMobileRef && nowMobile) {
            // 데스크탑 → 모바일: currentPageIndex → mobileImageIndex 동기화
            state.mobileImageIndex = state.currentPageIndex * 2;
        }

        wasMobileRef = nowMobile;
        setupLayout();
    }, 150);
}

// ── 초기화 ────────────────────────────────────────────────────────
function init() {
    createMobileView();
    renderBook();
    initDrag();
    renderBookmarks();
    initProgressBar();

    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') {
            if (isMobile()) navigateMobile(state.mobileImageIndex + 1);
            else flipToPage(state.currentPageIndex + 1);
        }
        if (e.key === 'ArrowLeft') {
            if (isMobile()) navigateMobile(state.mobileImageIndex - 1);
            else flipToPage(state.currentPageIndex - 1);
        }
    });

    window.addEventListener('resize', onResize);

    wasMobileRef = isMobile();
    setupLayout(); // 초기 레이아웃 결정

    // 첫 페인트 이후 백그라운드 프리로드 시작
    const startPreload = () => schedulePriority();
    if ('requestIdleCallback' in window) {
        requestIdleCallback(startPreload, { timeout: 500 });
    } else {
        setTimeout(startPreload, 200);
    }
}

document.addEventListener('DOMContentLoaded', init);