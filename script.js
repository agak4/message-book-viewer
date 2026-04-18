// =============================================================================
//
// [목차]
//   1. 설정 및 전역 상수/변수
//   2. 초기화 (Initialization)
//   3. 유틸리티 (Utilities)
//   4. 렌더링 (Rendering)
//   5. 인터랙티브 프레임 (Interactive Frames)
//   6. 페이지 네비게이션 (Navigation)
//   7. 페이지 플립 애니메이션 (Page Flip Animation)
//   8. UI 업데이트 (UI Update)
//   9. 입력 핸들러 (Input Handlers)
//  10. 이미지 프리로드 (Image Preload)
// =============================================================================


// =============================================================================
// 1. 설정 및 전역 상수/변수
// =============================================================================

/** 앱 전역 파라미터: 이미지 접두어, 총 이미지 수, 디렉토리 경로 및 확장자 설정 */
const AppParams = {
    imagePrefix: 'photo',
    totalImages: 284,
    webpDir: 'images/webp',
    imgDir: 'images/jpg',
    extension: 'webp',
    fallbackExtension: 'jpg'
};

/** 브라우저의 WebP 지원 여부 (null: 미확인, true/false: 확인 완료) */
let supportsWebP = null;

/** WebP 포맷 지원 여부를 런타임에 감지하는 즉시 실행 함수 */
(function detectWebP() {
    const img = new Image();
    img.onload = () => { console.log('detectWebP success'); supportsWebP = (img.width === 1); };
    img.onerror = () => { console.log('detectWebP failed'); supportsWebP = false; };
    img.src = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAkA4JZQCdAEO/gHOAAA=';
})();

/** 북마크 목록: 각 북마크의 페이지 번호, 레이블, 색상 정의 */
const BookmarkList = [
    { page: 2, label: "목차", color: "#F7E5FF" },
    { page: 4, label: "리코에게 빠진<br>입덕 계기", color: "#F7E5FF" },
    { page: 40, label: "리코를 생각하면<br>떠오르는 키워드", color: "#E4F0FE" },
    { page: 54, label: "치코라서 좋았던 점", color: "#E4F0FE" },
    { page: 72, label: "리코가 가장<br>빛났던 순간", color: "#FFE4EB" },
    { page: 108, label: "기억에 남은<br>리코의 노래", color: "#EFFFE5" },
    { page: 196, label: "리코에게 전하는 편지", color: "#F7E5FF" },
    { page: 256, label: "생일 축하 팬아트", color: "#E4F0FE" }
];

/** 현재 페이지 기준으로 즉시 로드할 이웃 페이지 범위 */
const EAGER_RADIUS = 5;
/** 동시에 처리할 최대 이미지 프리로드 수 */
const PRELOAD_CONCURRENCY = 4;
/** 모바일 레이아웃 전환 기준 너비(px) */
const MOBILE_BREAKPOINT = 768;

/** 앱의 현재 상태를 담는 전역 상태 객체 */
const state = {
    currentPageIndex: 0,
    prevPageIndex: 0,
    totalPages: Math.ceil(AppParams.totalImages / 2),
    mobileImageIndex: 0,
    isDragging: false,
    startX: 0,
    startTime: 0,
    isDraggingProgressBar: false,
    isAnimationEnabled: true,
    interactiveData: null,
    isInteractiveInitialized: false
};

/** 자주 사용하는 DOM 요소들의 참조를 담는 객체 */
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

/** 로드된 이미지 객체를 경로를 키로 캐싱하는 Map */
const imageCache = new Map();
/** 이미지 경로를 키로, 해당 경로를 data-src로 갖는 img 요소 목록을 값으로 저장하는 Map */
const pathToImgElements = new Map();

/** 프리로드 대기 중인 이미지 경로 목록 */
let preloadQueue = [];
/** 현재 진행 중인 이미지 로드 수 */
let activeLoads = 0;
/** 페이지별 진행 중인 setTimeout ID 집합을 저장하는 Map */
const pageTimeouts = new Map();
/** 각 페이지의 최종 목표 플립 상태(true: 뒤집힘, false: 원래 상태)를 저장하는 Map */
const pageTargetState = new Map();
/** 페이지 플립 애니메이션의 세대(generation) 번호를 저장하는 Map (이전 애니메이션 무효화에 사용) */
const pageFlipGeneration = new Map();

/** 왼쪽 고정 이미지 표시를 지연시키기 위한 타이머 ID */
let leftStaticTimer = null;
/** 리사이즈 이벤트 디바운스용 타이머 ID */
let resizeTimer = null;
/** 직전 렌더링 시점의 모바일 여부를 기록 (레이아웃 전환 감지용) */
let wasMobileRef = false;


// =============================================================================
// 2. 초기화 (Initialization)
// =============================================================================

/**
 * 앱 진입점: DOM 준비 후 전체 초기화를 수행한다.
 * - 모바일 뷰, 책 DOM, 드래그, 북마크, 프로그레스 바, 사이드 패널, 인터랙티브 프레임을 초기화한다.
 * - 키보드 및 리사이즈 이벤트 리스너를 등록한다.
 * - 애니메이션 비활성화 클래스를 제거하고, 이미지 프리로드를 시작한다.
 */
function init() {
    document.body.classList.add('disable-animation');

    createMobileView();
    renderBook();
    initDrag();
    renderBookmarks();
    initProgressBar();
    createSideControlPanel();
    initInteractiveFrames();
    loadInteractiveData();

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

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (state.isAnimationEnabled) {
                document.body.classList.remove('disable-animation');
            }
        });
    });

    const startPreload = () => schedulePriority();
    if ('requestIdleCallback' in window) {
        requestIdleCallback(startPreload, { timeout: 500 });
    } else {
        setTimeout(startPreload, 200);
    }
}

/**
 * 현재 뷰포트가 모바일인지 여부에 따라 레이아웃을 전환한다.
 * - 모바일: 책 숨김, 모바일 뷰 표시 및 갱신
 * - 데스크톱: 모바일 뷰 숨김, 책 표시 및 UI·중앙 정렬 갱신
 */
function setupLayout() {
    if (isMobile()) {
        dom.book.style.display = 'none';
        dom.mobileView.style.display = 'flex';
        updateMobileView();
    } else {
        dom.book.style.display = '';
        dom.mobileView.style.display = 'none';
        updateUI();
        updateCenterAlign();
    }
}


// =============================================================================
// 3. 유틸리티 (Utilities)
// =============================================================================

/**
 * 현재 뷰포트 너비가 MOBILE_BREAKPOINT 이하인지 확인하여 모바일 여부를 반환한다.
 * @returns {boolean} 모바일이면 true, 데스크톱이면 false
 */
function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
}

/**
 * 이미지 인덱스를 받아 실제 이미지 파일 경로를 반환한다.
 * WebP 지원 여부에 따라 webp 또는 jpg 경로를 선택한다.
 * @param {number} num - 이미지 번호 (0-based)
 * @returns {string} 이미지 파일 경로, 범위를 벗어나면 빈 문자열
 */
function getImagePath(num) {
    if (num < 0 || num >= AppParams.totalImages) return '';
    const filename = AppParams.imagePrefix + num.toString().padStart(3, '0');
    if (supportsWebP === false) {
        return `${AppParams.imgDir}/${filename}.${AppParams.fallbackExtension}`;
    }
    return `${AppParams.webpDir}/${filename}.${AppParams.extension}`;
}

/**
 * 특정 이미지 경로에 연결된 img 요소를 pathToImgElements Map에 등록한다.
 * 이미지가 로드된 후 DOM에 자동 반영하기 위해 사용된다.
 * @param {string} path - 이미지 파일 경로
 * @param {HTMLImageElement} el - 등록할 img 요소
 */
function registerImg(path, el) {
    if (!path || !el) return;
    if (!pathToImgElements.has(path)) pathToImgElements.set(path, []);
    pathToImgElements.get(path).push(el);
}


// =============================================================================
// 4. 렌더링 (Rendering)
// =============================================================================

/**
 * 모바일 전용 뷰 컨테이너와 이미지 요소를 동적으로 생성하여 DOM에 추가한다.
 * 생성된 요소는 dom.mobileView, dom.mobileImg에 저장된다.
 */
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

/**
 * 전체 페이지 수만큼 page 요소를 생성하여 책(#book) DOM을 구성한다.
 * 각 페이지는 front/back face를 가지며, 이미지는 캐시에서 즉시 로드하거나 지연 로드를 예약한다.
 * 마지막으로 왼쪽 고정 이미지 패널(left-static)도 함께 생성한다.
 */
function renderBook() {
    pathToImgElements.clear();
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < state.totalPages; i++) {
        const page = document.createElement('div');
        page.className = 'page';
        page.id = `page-${i}`;

        const fi = i * 2;
        const bi = i * 2 + 1;
        const fpPath = getImagePath(fi);
        const bpPath = getImagePath(bi);

        const frontFace = document.createElement('div');
        frontFace.className = 'page-face front';

        if (i === 0) {
            const coverShadow = document.createElement('div');
            coverShadow.className = 'cover_shadow side';
            const border = document.createElement('div');
            border.className = 'normal_left_border';
            coverShadow.appendChild(border);
            frontFace.appendChild(coverShadow);
        }

        const rightShadow = document.createElement('div');
        rightShadow.className = 'midShadow rightShadow';
        frontFace.appendChild(rightShadow);

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

        const leftShadow = document.createElement('div');
        leftShadow.className = 'midShadow leftShadow';
        backFace.appendChild(leftShadow);

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
        page.style.zIndex = state.totalPages - i + 1;
        fragment.appendChild(page);
    }

    dom.book.innerHTML = '';
    dom.book.appendChild(fragment);

    const ls = document.createElement('div');
    ls.id = 'left-static';

    const leftShadow = document.createElement('div');
    leftShadow.className = 'midShadow leftShadow';
    ls.appendChild(leftShadow);

    const lsImg = document.createElement('img');
    lsImg.alt = '';
    ls.appendChild(lsImg);
    dom.book.appendChild(ls);
    dom.leftStatic = ls;
    dom.leftStaticImg = lsImg;
}

/**
 * BookmarkList 데이터를 기반으로 진행 바 트랙에 북마크 버블 요소를 렌더링한다.
 * 각 북마크 클릭 시 해당 페이지로 이동한다.
 */
function renderBookmarks() {
    const track = document.getElementById('bookmarkTrack');
    if (!track) return;

    const fragment = document.createDocumentFragment();
    const trackMax = AppParams.totalImages - 1;

    BookmarkList.forEach(bm => {
        const percent = (bm.page / trackMax) * 100;
        const bubble = document.createElement('div');
        bubble.className = 'progress-bookmark';
        bubble.dataset.bookmarkPercent = percent;
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

    requestAnimationFrame(() => clampBookmarkPositions());
}

function clampBookmarkPositions() {
    const track = document.getElementById('bookmarkTrack');
    if (!track) return;
    const trackWidth = window.innerWidth;
    const MARGIN = 12;

    track.querySelectorAll('.progress-bookmark').forEach(bm => {
        const percent = parseFloat(bm.dataset.bookmarkPercent) / 100;
        const halfW = bm.offsetWidth / 2;
        const idealLeft = percent * trackWidth;
        const clampedLeft = Math.max(halfW + MARGIN, Math.min(trackWidth - halfW - MARGIN, idealLeft));

        const offset = idealLeft - clampedLeft;

        bm.style.left = `${clampedLeft}px`;
        bm.style.setProperty('--stem-left', `calc(50% + ${offset}px - 1px)`);
        bm.style.setProperty('--stem-center', `calc(50% + ${offset}px)`);
    });
}

/**
 * 화면 우측에 고정되는 사이드 컨트롤 패널을 동적으로 생성하고 이벤트를 등록한다.
 * - 애니메이션 ON/OFF 토글 버튼
 * - 전체 화면 전환 버튼
 * - 이전/다음 페이지 이동 버튼
 * 패널은 초기 6초간 표시 후 자동으로 숨겨진다.
 */
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


// =============================================================================
// 5. 인터랙티브 프레임 (Interactive Frames)
// =============================================================================

/** 인터랙티브 프레임의 position 값을 CSS 클래스명으로 매핑하는 상수 */
const InteractivePositionMap = {
    '1': 'pos-top-left',
    '2': 'pos-top-right',
    '3': 'pos-middle-left',
    '4': 'pos-bottom-right'
};

/**
 * CSV 파일(data/interactive_metadata.csv)에서 인터랙티브 이미지 메타데이터를 비동기로 로드한다.
 * 파싱된 데이터를 state.interactiveData에 저장하고, 프레임 렌더링 및 배경 업데이트를 실행한다.
 */
async function loadInteractiveData() {
    try {
        const response = await fetch('data/interactive_metadata.csv');
        const text = await response.text();
        const lines = text.trim().split('\n');
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length >= 4) {
                data.push({
                    id: i,
                    filename: cols[0].trim(),
                    author: cols[1].trim(),
                    start_page: parseInt(cols[2].trim(), 10),
                    position: cols[3].trim()
                });
            }
        }
        state.interactiveData = data;
        renderInteractiveFrames(data);
        updateInteractiveBackgrounds(state.currentPageIndex);
    } catch (e) {
        console.error('Failed to load interactive metadata', e);
    }
}

/**
 * 인터랙티브 프레임 컨테이너에 전역 클릭 리스너를 등록한다.
 * 프레임 외부 클릭 시 열려 있는 모든 확장 프레임을 닫는다.
 */
function initInteractiveFrames() {
    window.addEventListener('click', () => {
        document.querySelectorAll('.interactive-img-frame').forEach(f => f.classList.remove('is-expanded'));
    });
}

/**
 * 인터랙티브 메타데이터 배열을 받아 각 항목에 대한 이미지 프레임 DOM을 생성하고 컨테이너에 추가한다.
 * - 이미지 가로/세로 비율에 따라 is-landscape 클래스를 추가한다.
 * - 프레임 클릭 시 확장/축소 토글 동작을 처리한다.
 * @param {Array} dataList - 인터랙티브 이미지 메타데이터 배열
 */
function renderInteractiveFrames(dataList) {
    const container = document.getElementById('interactive-container');
    if (!container) return;

    container.innerHTML = '';
    dataList.forEach(data => {
        const className = InteractivePositionMap[data.position] || 'pos-top-right';
        const frame = document.createElement('div');
        frame.className = `interactive-img-frame ${className} is-hidden`;
        frame.dataset.id = data.id;
        frame.dataset.filename = data.filename;
        frame.dataset.author = data.author;

        const img = document.createElement('img');
        img.src = `images/interactive/${data.filename}`;
        img.alt = 'Background Illustration';
        img.onload = () => {
            if (img.naturalWidth > img.naturalHeight) {
                frame.classList.add('is-landscape');
            }
        };
        frame.appendChild(img);

        const authorTag = document.createElement('div');
        authorTag.className = 'author-tag';
        authorTag.textContent = data.author;
        frame.appendChild(authorTag);

        frame.addEventListener('click', (e) => {
            e.stopPropagation();
            const wasExpanded = frame.classList.contains('is-expanded');
            document.querySelectorAll('.interactive-img-frame').forEach(f => f.classList.remove('is-expanded'));
            if (!wasExpanded) frame.classList.add('is-expanded');
        });

        container.appendChild(frame);
    });
}

/**
 * 현재 페이지 인덱스를 기반으로 활성화할 인터랙티브 프레임을 결정하고 표시/숨김을 업데이트한다.
 * 현재 페이지 이하의 start_page 중 가장 큰 값을 가진 프레임 그룹을 활성화한다.
 * @param {number} pageIndex - 현재 책 페이지 인덱스 (스프레드 기준)
 */
function updateInteractiveBackgrounds(pageIndex) {
    if (!state.interactiveData) return;

    const actualPageNumber = pageIndex * 2;

    const validPages = state.interactiveData
        .map(d => d.start_page)
        .filter(sp => sp <= actualPageNumber);

    if (validPages.length === 0) return;
    const maxStartPage = Math.max(...validPages);

    const activeIds = new Set(
        state.interactiveData
            .filter(d => d.start_page === maxStartPage)
            .map(d => d.id)
    );

    const container = document.getElementById('interactive-container');
    if (!container) return;

    const isFirstTime = !state.isInteractiveInitialized && !document.body.classList.contains('is-front-cover');

    Array.from(container.children).forEach(frame => {
        const frameId = parseInt(frame.dataset.id, 10);
        if (activeIds.has(frameId)) {
            if (frame.classList.contains('is-hidden')) {
                frame.style.animationDelay = isFirstTime ? '3.0s' : '0s';
                frame.classList.remove('is-hidden');
            }
        } else {
            frame.classList.add('is-hidden');
        }
    });

    if (activeIds.size > 0 && isFirstTime) {
        state.isInteractiveInitialized = true;
    }
}


// =============================================================================
// 6. 페이지 네비게이션 (Navigation)
// =============================================================================

/**
 * 지정한 페이지 인덱스로 이동한다. (데스크톱 전용)
 * 범위를 벗어나지 않도록 클램핑 후, 상태를 업데이트하고 책·인터랙티브 배경을 갱신한다.
 * @param {number} index - 이동할 페이지 인덱스 (스프레드 기준)
 */
function flipToPage(index) {
    const clamped = Math.max(0, Math.min(index, state.totalPages));

    if (clamped === state.currentPageIndex) return;

    state.prevPageIndex = state.currentPageIndex;
    state.currentPageIndex = clamped;
    updateBookState();
    updateCenterAlign();
    updateInteractiveBackgrounds(clamped);
}

/**
 * 모바일 뷰에서 지정한 이미지 인덱스로 이동한다.
 * 범위를 벗어나지 않도록 클램핑하며, 변화가 없으면 조기 반환한다.
 * @param {number} imgIndex - 이동할 이미지 인덱스 (0-based)
 */
function navigateMobile(imgIndex) {
    const clamped = Math.max(0, Math.min(imgIndex, AppParams.totalImages - 1));
    if (clamped === state.mobileImageIndex) return;
    state.mobileImageIndex = clamped;
    updateMobileView();
}

/**
 * 윈도우 리사이즈 이벤트 핸들러. 150ms 디바운스를 적용한다.
 * 모바일 ↔ 데스크톱 전환 시 현재 페이지 인덱스를 양방향으로 동기화하고 레이아웃을 재설정한다.
 */
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
        clampBookmarkPositions();
    }, 150);
}


// =============================================================================
// 7. 페이지 플립 애니메이션 (Page Flip Animation)
// =============================================================================

/**
 * 페이지가 정지 상태일 때의 z-index를 계산한다.
 * - 뒤집힌 상태: 페이지 번호가 클수록 위로 쌓인다.
 * - 뒤집히지 않은 상태: 페이지 번호가 작을수록 위로 쌓인다.
 * @param {number|string} id - 페이지 인덱스
 * @param {boolean} flipped - 페이지가 뒤집힌 상태인지 여부
 * @returns {number} 계산된 z-index 값
 */
function getRestingZIndex(id, flipped) {
    const i = parseInt(id, 10);
    return flipped ? i + 1 : state.totalPages - i + 1;
}

/**
 * 특정 페이지에 플립 애니메이션을 적용한다.
 * - delay가 0이면 즉시 CSS 클래스를 변경하고, 그렇지 않으면 타이머로 지연 처리한다.
 * - 세대(generation) 번호로 이전 애니메이션을 무효화하여 중복 실행을 방지한다.
 * @param {number} i - 페이지 인덱스
 * @param {boolean} flip - true면 플립, false면 언플립
 * @param {number} delay - 애니메이션 시작 전 대기 시간(ms)
 * @param {number} zIndexDuringFlip - 애니메이션 중 적용할 z-index
 * @param {number} duration - 애니메이션 지속 시간(ms)
 */
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
            p.style.zIndex = getRestingZIndex(i, true);
        } else {
            p.classList.remove('flipped');
            p.style.zIndex = getRestingZIndex(i, false);
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
                        p.style.zIndex = getRestingZIndex(i, true);
                        p.style.transitionDuration = '';
                        p.style.willChange = 'auto';
                    });
                } else {
                    p.classList.remove('flipped');
                    addTimer(duration, () => {
                        if (pageFlipGeneration.get(i) !== gen) return;
                        p.style.zIndex = getRestingZIndex(i, false);
                        p.style.transitionDuration = '';
                        p.style.willChange = 'auto';
                    });
                }
            });
        });
    });
}

/**
 * currentPageIndex를 기준으로 전체 페이지의 플립 목표 상태를 계산하고,
 * 변경이 필요한 페이지에만 applyPageFlip을 호출하여 애니메이션을 실행한다.
 * 여러 페이지가 한 번에 넘겨질 경우 stagger 딜레이를 적용한다.
 * 애니메이션 완료 후 왼쪽 고정 이미지를 업데이트한다.
 */
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

    const orderScore = (val) => val;

    toFlip.sort((a, b) => orderScore(a) - orderScore(b));
    toUnflip.sort((a, b) => orderScore(b) - orderScore(a));

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

    if (dom.book) dom.book.style.transitionDuration = `${duration}ms`;

    let baseDelay = 0;

    toFlip.forEach(i => {
        const order = orderScore(i);
        const zIndexDuring = 1000 + order;
        applyPageFlip(i, true, baseDelay, zIndexDuring, duration);
        baseDelay += staggerDelay;
    });

    toUnflip.forEach(i => {
        const order = orderScore(i);
        const zIndexDuring = 1000 + (state.totalPages - order);
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

/**
 * 현재 페이지 기준으로 왼쪽 고정 이미지(left-static) 패널의 표시 여부와 이미지 소스를 갱신한다.
 * 캐시에 이미지가 있으면 즉시 표시하고, 없으면 onload 콜백으로 지연 표시한다.
 */
function updateLeftStatic() {
    if (!dom.leftStatic) return;

    if (state.currentPageIndex <= 0) {
        dom.leftStatic.style.display = 'none';
        dom.leftStaticImg.src = '';
        return;
    }

    const imgIdx = (state.currentPageIndex - 1) * 2 + 1;
    if (imgIdx < 0) {
        dom.leftStatic.style.display = 'none';
        return;
    }

    const path = getImagePath(imgIdx);
    const cached = imageCache.get(path);

    if (cached) {
        dom.leftStaticImg.src = cached.src;
        dom.leftStatic.style.display = 'block';
    } else {
        dom.leftStaticImg.onload = () => {
            if (state.currentPageIndex > 0) {
                dom.leftStatic.style.display = 'block';
            }
            dom.leftStaticImg.onload = null;
        };
        dom.leftStaticImg.src = path;
    }
}

/**
 * 모든 페이지의 flipped 클래스와 z-index를 currentPageIndex에 맞게 즉시(애니메이션 없이) 재구성한다.
 * 레이아웃 전환(모바일 ↔ 데스크톱) 또는 애니메이션 비활성화 시 호출된다.
 */
function rebuildBookFlippedState() {
    const list = [];
    for (let i = 0; i < state.totalPages; i++) list.push(i);

    list.forEach(i => {
        const p = document.getElementById(`page-${i}`);
        if (!p) return;

        const shouldBeFlipped = i < state.currentPageIndex;

        if (shouldBeFlipped) {
            p.classList.add('flipped');
            p.style.zIndex = getRestingZIndex(i, true);
        } else {
            p.classList.remove('flipped');
            p.style.zIndex = getRestingZIndex(i, false);
        }

        p.style.willChange = 'auto';

        pageTargetState.set(i, shouldBeFlipped);
        pageFlipGeneration.set(i, (pageFlipGeneration.get(i) || 0) + 1);

        if (pageTimeouts.has(i)) {
            pageTimeouts.get(i).forEach(clearTimeout);
            pageTimeouts.delete(i);
        }
    });

    updateLeftStatic();
    updateCenterAlign();
}


// =============================================================================
// 8. UI 업데이트 (UI Update)
// =============================================================================

/**
 * 페이지 카운터 텍스트와 프로그레스 바 값을 현재 상태에 맞게 갱신한다.
 * 모바일/데스크톱 여부에 따라 이미지 인덱스 또는 페이지 인덱스를 기준으로 계산한다.
 * 프로그레스 바 드래그 중에는 progress fill만 갱신하고 value는 건드리지 않는다.
 */
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
        if (disp < 0) disp = 0;
        if (disp === 0) disp = 1;
        if (disp > trackMax) disp = trackMax;
        dom.pageCounter.textContent = `Page ${disp} / ${trackMax}`;
        if (!state.isDraggingProgressBar) {
            const track = Math.min(Math.max(0, state.currentPageIndex * 2), trackMax);
            const pct = (track / trackMax) * 100;
            dom.progressBar.value = pct * 100;
            dom.progressFill.style.width = `${pct}%`;
        }
    }
    updateCenterAlign();
}

/**
 * 현재 페이지가 표지(첫 페이지) 또는 뒷표지(마지막 페이지)인지 확인하여
 * book 요소와 body에 적절한 CSS 클래스를 추가/제거한다.
 * 책의 중앙 정렬 및 커버 스타일 전환에 사용된다.
 */
function updateCenterAlign() {
    const isFront = isMobile() ? (state.mobileImageIndex === 0) : (state.currentPageIndex === 0);
    const isBack = isMobile() ? (state.mobileImageIndex === AppParams.totalImages - 1) : (state.currentPageIndex === state.totalPages);

    if (isFront) {
        dom.book.classList.add('closed-front');
        dom.book.classList.remove('closed-back');
        document.body.classList.add('is-front-cover');
    } else if (isBack) {
        dom.book.classList.add('closed-back');
        dom.book.classList.remove('closed-front');
        document.body.classList.remove('is-front-cover');
    } else {
        dom.book.classList.remove('closed-front', 'closed-back');
        document.body.classList.remove('is-front-cover');
    }
}

/**
 * 모바일 뷰의 이미지 소스를 현재 mobileImageIndex에 맞게 갱신한다.
 * 캐시 히트 시 즉시 표시하고, 미스 시 로딩 상태로 전환 후 이미지 로드를 시작한다.
 */
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


// =============================================================================
// 9. 입력 핸들러 (Input Handlers)
// =============================================================================

/**
 * 뷰포트 영역에 포인터 드래그(스와이프) 입력을 초기화한다.
 * - pointerdown: 드래그 시작점 및 시간 기록
 * - pointerup: 이동 거리와 시간을 분석하여 페이지 이동 또는 탭 동작을 실행한다.
 * 모바일/데스크톱 각각의 임계값을 적용한다.
 */
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
                    if (state.currentPageIndex === 0) {
                        flipToPage(state.currentPageIndex + 1);
                    } else if (state.currentPageIndex === state.totalPages) {
                        flipToPage(state.currentPageIndex - 1);
                    } else {
                        if (endX > window.innerWidth / 2) flipToPage(state.currentPageIndex + 1);
                        else flipToPage(state.currentPageIndex - 1);
                    }
                }
            }
        }
    };

    const vp = document.querySelector('.book-viewport');
    vp.addEventListener('pointerdown', handleStart);
    window.addEventListener('pointerup', handleEnd);
}

/**
 * 하단 프로그레스 바의 상호작용을 초기화한다.
 * - 드래그 시작/종료 시 isDraggingProgressBar 상태를 관리한다.
 * - input 이벤트: 슬라이더 값에 비례하여 페이지를 이동시킨다.
 * - mousemove 이벤트: 호버 위치의 페이지 미리보기 툴팁을 표시한다.
 * - mouseleave 이벤트: 페이지 미리보기 툴팁을 숨긴다.
 */
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


// =============================================================================
// 10. 이미지 프리로드 (Image Preload)
// =============================================================================

/**
 * 이미지 경로를 프리로드 큐에 추가한다.
 * - 이미 캐시된 이미지는 무시한다.
 * - urgent가 true이면 큐의 맨 앞에 삽입하고, 그렇지 않으면 맨 뒤에 추가한다.
 * - 큐 추가 후 drainQueue를 호출하여 즉시 처리를 시작한다.
 * @param {string} path - 로드할 이미지 파일 경로
 * @param {boolean} [urgent=false] - true이면 우선 처리
 */
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

/**
 * 프리로드 큐를 순차적으로 소비하여 PRELOAD_CONCURRENCY 한도 내에서 이미지를 병렬 로드한다.
 * 로드 완료(성공/실패) 시 imageCache에 저장하고, DOM에 반영한 뒤 재귀적으로 큐를 처리한다.
 */
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

/**
 * 이미지가 로드된 후 해당 경로를 참조하는 모든 img 요소의 src를 업데이트한다.
 * - pathToImgElements에 등록된 요소들의 data-src를 실제 src로 교체한다.
 * - 모바일 뷰의 pending 이미지도 함께 처리한다.
 * @param {string} path - 로드된 이미지 파일 경로
 * @param {string} src - 실제 img.src 값 (오류 시에도 img.src를 사용)
 */
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

/**
 * 현재 보이는 페이지를 중심으로 EAGER_RADIUS 범위 내 이미지를 우선(urgent) 큐에 넣고,
 * 그 외 페이지는 일반 큐에 추가하여 백그라운드에서 전체 이미지를 순차 프리로드한다.
 */
function schedulePriority() {
    const centerSpread = isMobile()
        ? Math.ceil(state.mobileImageIndex / 2)
        : state.currentPageIndex;

    for (let i = Math.max(0, centerSpread - EAGER_RADIUS);
        i <= Math.min(state.totalPages - 1, centerSpread + EAGER_RADIUS); i++) {
        enqueue(getImagePath(i * 2), true);
        enqueue(getImagePath(i * 2 + 1), true);
    }
}


// =============================================================================
// 엔트리 포인트
// =============================================================================

/** DOM이 완전히 파싱된 후 앱 초기화 함수를 실행한다. */
document.addEventListener('DOMContentLoaded', init);