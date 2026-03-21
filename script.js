/**
 * 클리셰 1주년 팬 메세지북 - Full Overhaul Logic
 */

const AppParams = {
    imagePrefix: 'photo',
    totalImages: 127, // 0~126
    extension: 'jpg'
};

// 진행바 위에 말풍선으로 띄울 북마크 지점 데이터 리스트
// (하드코딩 금지 규칙에 따라, 위치와 내용을 데이터 객체 형태로 분리 관리)
const BookmarkList = [
    { page: 2, label: "목차", color: "#F7E5FF" },
    { page: 4, label: "입덕 계기", color: "#E4F0FE" },
    { page: 10, label: "클리셰란<br>나에게", color: "#E4F0FE" },
    { page: 18, label: "좋았던 &<br>보고싶은케미", color: "#FFE4EB" },
    { page: 36, label: "첫인상<br>현인상", color: "#EFFFE5" },
    { page: 78, label: "단체곡 &<br>데뷔곡후기", color: "#F7E5FF" },
    { page: 104, label: "1주년<br>축하 메세지", color: "#E4F0FE" }
];

// Application State
const state = {
    currentPageIndex: 0,
    totalPages: Math.ceil((AppParams.totalImages + 1) / 2),
    isDragging: false,
    startX: 0,
    currentX: 0,
    isDraggingProgressBar: false
};

// Required DOM references
const dom = {
    book: document.getElementById('book'),
    progressBar: document.getElementById('progressBar'),
    progressFill: document.getElementById('progressFill'),
    pagePreview: document.getElementById('pagePreview'),
    previewImage: document.getElementById('previewImage'),
    previewText: document.getElementById('previewText'),
    pageCounter: document.getElementById('pageCounter')
};

// 유틸: 사진 인덱스 기반 경로 포맷팅
function getImagePath(num) {
    if (num < 0 || num >= AppParams.totalImages) return '';
    return `images/${AppParams.imagePrefix}${num.toString().padStart(3, '0')}.${AppParams.extension}`;
}

// 1. 책을 물리적 단위(Page/Leaf)로 생성
function renderBook() {
    dom.book.innerHTML = '';

    for (let i = 0; i < state.totalPages; i++) {
        const page = document.createElement('div');
        page.className = 'page';
        page.id = `page-${i}`;

        // 인덱싱 로직: Cover는 0, 그 후 1/2, 3/4...
        const frontImgIndex = i === 0 ? 0 : (i * 2);
        const backImgIndex = i === 0 ? 1 : (i * 2 + 1);

        page.innerHTML = `
            <div class="page-face front">
                <img src="${getImagePath(frontImgIndex)}" alt="Page ${frontImgIndex}">
            </div>
            <div class="page-face back">
                <img src="${getImagePath(backImgIndex)}" alt="Page ${backImgIndex}">
            </div>
        `;

        dom.book.appendChild(page);
    }

    updateBookState();
}

// 2.5 단일 북마크(말풍선) 마커 동적 렌더링 로직
function renderBookmarks() {
    const track = document.getElementById('bookmarkTrack');
    if (!track) return;
    track.innerHTML = '';

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
            e.stopPropagation(); // 아래쪽 드래그 레이어랑 겹침 방지
            flipToPage(Math.ceil(bm.page / 2));
        });

        track.appendChild(bubble);
    });
}

// 3. 네비게이션 트리거
function flipToPage(index) {
    state.currentPageIndex = Math.max(0, Math.min(index, state.totalPages - 1));
    updateBookState();
}

// 4. 상태 렌더러 (z-index 관리와 CSS Class 부여)
function updateBookState() {
    for (let i = 0; i < state.totalPages; i++) {
        const page = document.getElementById(`page-${i}`);
        if (!page) continue;

        if (i < state.currentPageIndex) {
            // 과거 페이지: 왼쪽으로 넘어감
            page.classList.add('flipped');
            page.style.zIndex = i;
        } else {
            // 현재/미래 페이지: 오른쪽에 대기
            page.classList.remove('flipped');
            page.style.zIndex = state.totalPages - i;
        }
    }

    updateMobileTransform();
    updateUI();
}

// 5. 모바일 뷰 렌더 브릿지
function updateMobileTransform() {
    if (window.innerWidth <= 768) {
        // 모바일 화면에서는 책이 화면 폭(vw)보다 크므로(180vw), 
        // Focus 할 섹션(좌측/우측)을 중앙화 시켜줍니다.
        // currentPageIndex > 0 일 땐 넘겨진 페이지를 보기 위해 우측 시프트
        const shiftX = state.currentPageIndex > 0 ? '45vw' : '-45vw';
        dom.book.style.transform = `translateX(${shiftX})`;
    } else {
        dom.book.style.transform = 'none';
    }
}

// 6. UI 동기화 (진행바, 텍스트, 북마크 탭)
function updateUI() {
    let currentDisp = state.currentPageIndex * 2;
    if (currentDisp === 0) currentDisp = 1;

    dom.pageCounter.innerHTML = `Page ${currentDisp} / ${AppParams.totalImages - 1}`;

    // 진행바 게이지 효과 업데이트 (부드러운 애니메이션 적용)
    const trackMax = AppParams.totalImages - 1;
    const currentTrackVal = Math.min(state.currentPageIndex * 2, trackMax);
    const progressVal = (currentTrackVal / trackMax) * 100;

    // 드래그 중이 아닐 때만 실제 페이지 오프셋으로 시각적 스냅을 적용
    if (!state.isDraggingProgressBar) {
        dom.progressBar.value = progressVal * 100;
        dom.progressFill.style.width = `${progressVal}%`;
    }
}

// 7. 마우스/터치 드래그 인터랙션 (공간 분할 클릭 로직 병합)
function initDrag() {
    const handleStart = (e) => {
        state.isDragging = true;
        state.startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        state.startTime = Date.now();
    };

    const handleMove = (e) => {
        if (!state.isDragging) return;
    };

    const handleEnd = (e) => {
        if (!state.isDragging) return;
        state.isDragging = false;

        const endX = e.type.includes('touch') ? e.changedTouches[0].clientX : e.clientX;
        const diffX = endX - state.startX;
        const timeElapsed = Date.now() - state.startTime;

        // 60px 이상 움직인 경우: 드래그(스와이프)로 판정
        if (Math.abs(diffX) > 60) {
            if (diffX < 0) flipToPage(state.currentPageIndex + 1); // 좌측 스와이프
            else flipToPage(state.currentPageIndex - 1); // 우측 스와이프
        }
        // 움직임이 거의 없고 짧은 시간(400ms 내)에 손을 뗀 경우: 고정 클릭으로 판정
        else if (Math.abs(diffX) < 10 && timeElapsed < 400) {
            // 허공 여백 클릭은 무시하고, 실제 책(.book) 요소 위를 클릭했을 때만 처리
            if (e.target.closest('.book')) {
                if (endX > window.innerWidth / 2) {
                    flipToPage(state.currentPageIndex + 1); // 우측 화면 클릭
                } else {
                    flipToPage(state.currentPageIndex - 1); // 좌측 화면 클릭
                }
            }
        }
    };

    const vp = document.querySelector('.book-viewport');
    vp.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    vp.addEventListener('touchstart', handleStart);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);
}

// 애플리케이션 초기화
function init() {
    renderBook();
    initDrag();
    renderBookmarks(); // 북마크(말풍선) 엔진 기동

    // 진행바 초기화 및 기능 (시각적 부드러움과 실제 데이터의 분리)
    dom.progressBar.max = 10000; // 해상도를 10000으로 대폭 높여 마우스 트래킹을 스무스하게 구현

    // 드래그 상태 감지 로직
    const pbStart = () => state.isDraggingProgressBar = true;
    const pbEnd = () => {
        if (state.isDraggingProgressBar) {
            state.isDraggingProgressBar = false;
            updateUI(); // 드래그 종료 시 가장 가까운 실제 페이지 위치로 시각적 스냅
        }
    };

    dom.progressBar.addEventListener('mousedown', pbStart);
    dom.progressBar.addEventListener('touchstart', pbStart, { passive: true });
    window.addEventListener('mouseup', pbEnd);
    window.addEventListener('touchend', pbEnd);

    dom.progressBar.addEventListener('input', (e) => {
        const percent = e.target.value / 10000;

        // 드래그 중인 마우스 위치와 시각적 게이지바를 100% 완벽히 동기화
        dom.progressFill.style.width = `${percent * 100}%`;

        // 뒤에서는 퍼센티지에 비례하여 가장 근접한 실제 페이지를 넘김
        const trackMax = AppParams.totalImages - 1;
        const targetPage = Math.round(percent * trackMax);
        flipToPage(Math.ceil(targetPage / 2));
    });

    // 진행바 모서리 썸네일 (Hover Preview) 로직
    dom.progressBar.addEventListener('mousemove', (e) => {
        const rect = dom.progressBar.getBoundingClientRect();
        // 왼쪽에서부터 몇 퍼센트 지점인지 계산
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

        const trackMax = AppParams.totalImages - 1;
        const hoverExactPage = Math.round(percent * trackMax);

        let previewX = e.clientX;
        const previewWidth = 110; // CSS와 동일

        // 썸네일이 화면 밖으로 나가지 않도록 좌표 보정
        if (previewX < previewWidth / 2 + 10) previewX = previewWidth / 2 + 10;
        if (previewX > window.innerWidth - previewWidth / 2 - 10) previewX = window.innerWidth - previewWidth / 2 - 10;

        dom.pagePreview.style.left = `${previewX}px`;

        // 텍스트/이미지 데이터 동기화 (단일 페이지 단위)
        let displayPage = hoverExactPage;
        if (displayPage === 0) displayPage = 1;
        dom.previewText.innerHTML = `Page ${displayPage}`;

        dom.previewImage.src = getImagePath(hoverExactPage);

        dom.pagePreview.classList.add('active');
    });

    dom.progressBar.addEventListener('mouseleave', () => {
        dom.pagePreview.classList.remove('active');
    });



    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') flipToPage(state.currentPageIndex + 1);
        if (e.key === 'ArrowLeft') flipToPage(state.currentPageIndex - 1);
    });

    window.addEventListener('resize', () => {
        updateMobileTransform();
    });
}

document.addEventListener('DOMContentLoaded', init);