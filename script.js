const AppParams = {
    imagePrefix: 'photo',
    totalImages: 127,
    webpDir: 'images/webp',
    imgDir: 'images/img',
    extension: 'webp',
    fallbackExtension: 'jpg'
};

let supportsWebP = null;

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

const state = {
    currentPageIndex: 0,
    prevPageIndex: 0,
    totalPages: Math.ceil((AppParams.totalImages + 1) / 2),
    mobileImageIndex: 0,
    isDragging: false,
    startX: 0,
    startTime: 0,
    isDraggingProgressBar: false,
    isAnimationEnabled: true
};

const dom = {
    book: document.getElementById('book'),
    progressBar: document.getElementById('progressBar'),
    progressFill: document.getElementById('progressFill'),
    pagePreview: document.getElementById('pagePreview'),
    previewImage: document.getElementById('previewImage'),
    previewText: document.getElementById('previewText'),
    pageCounter: document.getElementById('pageCounter'),
    mobileView: null,
    mobileImg: null,
    leftStatic: null,
    leftStaticImg: null
};

const imageCache = new Map();
const pathToImgElements = new Map();

let preloadQueue = [];
let activeLoads = 0;
const pageTimeouts = new Map();
const pageTargetState = new Map();
const pageFlipGeneration = new Map();

let leftStaticTimer = null;
let resizeTimer = null;
let wasMobileRef = false;

function registerImg(path, el) {
    if (!path || !el) return;
    if (!pathToImgElements.has(path)) pathToImgElements.set(path, []);
    pathToImgElements.get(path).push(el);
}

function init() {
    createMobileView();
    renderBook();
    initDrag();
    renderBookmarks();
    initProgressBar();
    createSideControlPanel();

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
    setupLayout();

    const startPreload = () => schedulePriority();
    if ('requestIdleCallback' in window) {
        requestIdleCallback(startPreload, { timeout: 500 });
    } else {
        setTimeout(startPreload, 200);
    }
}

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

function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const nowMobile = isMobile();

        if (wasMobileRef && !nowMobile) {
            const synced = Math.ceil(state.mobileImageIndex / 2);
            state.prevPageIndex = synced;
            state.currentPageIndex = synced;
            rebuildBookFlippedState();
        } else if (!wasMobileRef && nowMobile) {
            state.mobileImageIndex = state.currentPageIndex * 2;
        }

        wasMobileRef = nowMobile;
        setupLayout();
    }, 150);
}

function createMobileView() {
    const mv = document.createElement('div');
    mv.id = 'mobile-view';

    const img = document.createElement('img');
    img.id = 'mobile-img';
    img.alt = 'Page';
    mv.appendChild(img);

    document.querySelector('.book-viewport').appendChild(mv);

    dom.mobileView = mv;
    dom.mobileImg = img;
}

function renderBook() {
    pathToImgElements.clear();
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < state.totalPages; i++) {
        const page = document.createElement('div');
        page.className = 'page';
        page.id = `page-${i}`;

        const fi = i === 0 ? 0 : i * 2;
        const bi = i === 0 ? 1 : i * 2 + 1;
        const fpPath = getImagePath(fi);
        const bpPath = getImagePath(bi);

        const frontFace = document.createElement('div');
        frontFace.className = 'page-face front';
        const frontImg = document.createElement('img');
        frontImg.alt = `Page ${fi}`;
        const fCached = imageCache.get(fpPath);
        if (fCached) {
            frontImg.src = fCached.src;
        } else {
            frontImg.dataset.src = fpPath;
            registerImg(fpPath, frontImg);
        }
        frontFace.appendChild(frontImg);

        const backFace = document.createElement('div');
        backFace.className = 'page-face back';
        const backImg = document.createElement('img');
        backImg.alt = `Page ${bi}`;
        const bCached = imageCache.get(bpPath);
        if (bCached) {
            backImg.src = bCached.src;
        } else {
            backImg.dataset.src = bpPath;
            registerImg(bpPath, backImg);
        }
        backFace.appendChild(backImg);

        page.appendChild(frontFace);
        page.appendChild(backFace);
        page.style.zIndex = state.totalPages - i;
        fragment.appendChild(page);
    }

    dom.book.innerHTML = '';
    dom.book.appendChild(fragment);

    const ls = document.createElement('div');
    ls.id = 'left-static';
    const lsImg = document.createElement('img');
    lsImg.alt = '';
    ls.appendChild(lsImg);
    dom.book.appendChild(ls);
    dom.leftStatic = ls;
    dom.leftStaticImg = lsImg;
}

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

function createSideControlPanel() {
    const panel = document.createElement('div');
    panel.className = 'side-control-panel show-initial';

    setTimeout(() => {
        panel.classList.remove('show-initial');
    }, 6000);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'side-control-btn toggle-anim-btn';
    toggleBtn.title = '플립 애니메이션 ON/OFF';

    const iconOn = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    const iconOff = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12"></rect></svg>';

    toggleBtn.innerHTML = iconOn;

    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'side-control-btn fullscreen-btn';
    fullscreenBtn.title = '전체 화면 전환';

    const iconEnterFS = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>';
    const iconExitFS = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>';

    fullscreenBtn.innerHTML = document.fullscreenElement ? iconExitFS : iconEnterFS;

    const prevBtn = document.createElement('button');
    prevBtn.className = 'side-control-btn prev-page-btn';
    prevBtn.title = '이전 페이지';
    prevBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';

    const nextBtn = document.createElement('button');
    nextBtn.className = 'side-control-btn next-page-btn';
    nextBtn.title = '다음 페이지';
    nextBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

    panel.appendChild(toggleBtn);
    panel.appendChild(fullscreenBtn);
    panel.appendChild(prevBtn);
    panel.appendChild(nextBtn);
    document.body.appendChild(panel);

    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((err) => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });

    document.addEventListener('fullscreenchange', () => {
        fullscreenBtn.innerHTML = document.fullscreenElement ? iconExitFS : iconEnterFS;
        fullscreenBtn.title = document.fullscreenElement ? '전체 화면 종료' : '전체 화면 전환';
    });

    toggleBtn.addEventListener('click', () => {
        state.isAnimationEnabled = !state.isAnimationEnabled;
        if (state.isAnimationEnabled) {
            document.body.classList.remove('disable-animation');
            toggleBtn.classList.remove('off');
            toggleBtn.innerHTML = iconOn;
        } else {
            document.body.classList.add('disable-animation');
            toggleBtn.classList.add('off');
            toggleBtn.innerHTML = iconOff;
            rebuildBookFlippedState();
        }
    });

    prevBtn.addEventListener('click', () => {
        if (isMobile()) navigateMobile(state.mobileImageIndex - 1);
        else flipToPage(state.currentPageIndex - 1);
    });

    nextBtn.addEventListener('click', () => {
        if (isMobile()) navigateMobile(state.mobileImageIndex + 1);
        else flipToPage(state.currentPageIndex + 1);
    });
}

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

function initDrag() {
    const handleStart = (e) => {
        if (e.target.closest('.progress-container')) return;
        state.isDragging = true;
        state.startX = e.clientX;
        state.startTime = Date.now();
        dom.progressFill.classList.add('dragging');
    };

    const handleEnd = (e) => {
        if (!state.isDragging) return;
        state.isDragging = false;
        dom.progressFill.classList.remove('dragging');

        const endX = e.clientX;
        const diffX = endX - state.startX;
        const timeElapsed = Date.now() - state.startTime;

        if (isMobile()) {
            if (Math.abs(diffX) > 40) {
                if (diffX < 0) navigateMobile(state.mobileImageIndex + 1);
                else navigateMobile(state.mobileImageIndex - 1);
            } else if (Math.abs(diffX) < 10 && timeElapsed < 400) {
                if (endX > window.innerWidth / 2) navigateMobile(state.mobileImageIndex + 1);
                else navigateMobile(state.mobileImageIndex - 1);
            }
        } else {
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
    vp.addEventListener('pointerdown', handleStart);
    window.addEventListener('pointerup', handleEnd);
}

function initProgressBar() {
    dom.progressBar.max = 10000;

    const pbStart = () => {
        state.isDraggingProgressBar = true;
        dom.progressFill.classList.add('dragging');
    };
    const pbEnd = () => {
        if (state.isDraggingProgressBar) {
            state.isDraggingProgressBar = false;
            updateUI();

            requestAnimationFrame(() => {
                dom.progressFill.classList.remove('dragging');
            });
        }
    };

    dom.progressBar.addEventListener('pointerdown', pbStart);
    window.addEventListener('pointerup', pbEnd);

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

function flipToPage(index) {
    const clamped = Math.max(0, Math.min(index, state.totalPages - 1));
    if (clamped === state.currentPageIndex) return;

    state.prevPageIndex = state.currentPageIndex;
    state.currentPageIndex = clamped;
    updateBookState();
}

function applyPageFlip(i, flip, delay, zIndexDuringFlip, duration) {
    const p = document.getElementById(`page-${i}`);
    if (!p) return;

    if (pageTimeouts.has(i)) {
        pageTimeouts.get(i).forEach(clearTimeout);
        pageTimeouts.delete(i);
    }

    const gen = (pageFlipGeneration.get(i) || 0) + 1;
    pageFlipGeneration.set(i, gen);

    if (duration === 0 && delay === 0) {
        p.style.transitionDuration = '0ms';
        p.style.willChange = 'auto';
        if (flip) {
            p.classList.add('flipped');
            p.style.zIndex = i;
        } else {
            p.classList.remove('flipped');
            p.style.zIndex = state.totalPages - i;
        }
        return;
    }

    const timeouts = new Set();
    const addTimer = (time, fn) => {
        const tid = setTimeout(() => {
            fn();
            timeouts.delete(tid);
            if (timeouts.size === 0 && pageTimeouts.get(i) === timeouts) {
                pageTimeouts.delete(i);
            }
        }, time);
        timeouts.add(tid);
    };
    pageTimeouts.set(i, timeouts);

    addTimer(delay, () => {
        p.style.willChange = 'transform';
        p.style.transitionDuration = `${duration}ms`;
        p.style.zIndex = zIndexDuringFlip;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (pageFlipGeneration.get(i) !== gen) return;

                if (flip) {
                    p.classList.add('flipped');
                    addTimer(duration, () => {
                        if (pageFlipGeneration.get(i) !== gen) return;
                        p.style.zIndex = i;
                        p.style.transitionDuration = '';
                        p.style.willChange = 'auto';
                    });
                } else {
                    p.classList.remove('flipped');
                    addTimer(duration, () => {
                        if (pageFlipGeneration.get(i) !== gen) return;
                        p.style.zIndex = state.totalPages - i;
                        p.style.transitionDuration = '';
                        p.style.willChange = 'auto';
                    });
                }
            });
        });
    });
}

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

    if (!state.isAnimationEnabled) {
        duration = 0;
        staggerDelay = 0;
    } else if (totalFlips > 1) {
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

    if (dom.leftStatic && state.currentPageIndex > 0) {
        const imgIdx = (state.currentPageIndex - 1) * 2 + 1;
        const path = getImagePath(imgIdx);
        const cached = imageCache.get(path);
        if (cached) {
            dom.leftStaticImg.src = cached.src;
        } else {
            enqueue(path, true);
        }
    }

    if (dom.leftStatic) dom.leftStatic.style.display = 'none';
    clearTimeout(leftStaticTimer);
    const showDelay = totalFlips === 0 ? 0 : baseDelay + duration + 80;
    leftStaticTimer = setTimeout(updateLeftStatic, showDelay);

    schedulePriority();
    updateUI();
}

function updateLeftStatic() {
    if (!dom.leftStatic) return;
    if (state.currentPageIndex === 0) {
        dom.leftStatic.style.display = 'none';
        return;
    }
    const imgIdx = (state.currentPageIndex - 1) * 2 + 1;
    const path = getImagePath(imgIdx);
    const cached = imageCache.get(path);

    if (cached) {
        dom.leftStaticImg.src = cached.src;
        dom.leftStatic.style.display = 'block';
    } else {
        dom.leftStaticImg.onload = () => {
            dom.leftStatic.style.display = 'block';
            dom.leftStaticImg.onload = null;
        };
        dom.leftStaticImg.src = path;
    }
}

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

        p.style.willChange = 'auto';

        pageTargetState.set(i, shouldBeFlipped);
        pageFlipGeneration.set(i, (pageFlipGeneration.get(i) || 0) + 1);

        if (pageTimeouts.has(i)) {
            pageTimeouts.get(i).forEach(clearTimeout);
            pageTimeouts.delete(i);
        }
    }

    updateLeftStatic();
}

function navigateMobile(imgIndex) {
    const clamped = Math.max(0, Math.min(imgIndex, AppParams.totalImages - 1));
    if (clamped === state.mobileImageIndex) return;
    state.mobileImageIndex = clamped;
    updateMobileView();
}

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

function applyToDOM(path, src) {
    const els = pathToImgElements.get(path);
    if (els) {
        for (const el of els) {
            if (el.dataset.src === path) {
                el.src = src;
                delete el.dataset.src;
            }
        }
        pathToImgElements.delete(path);
    }

    if (dom.mobileImg && dom.mobileImg.dataset.pending === path) {
        dom.mobileImg.src = src;
        dom.mobileImg.classList.remove('loading');
        delete dom.mobileImg.dataset.pending;
    }
}

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

document.addEventListener('DOMContentLoaded', init);