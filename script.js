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

const state = {
    currentPageIndex: 0,
    totalPages: Math.ceil((AppParams.totalImages + 1) / 2),
    isDragging: false,
    startX: 0,
    currentX: 0,
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

function getImagePath(num) {
    if (num < 0 || num >= AppParams.totalImages) return '';
    return `images/${AppParams.imagePrefix}${num.toString().padStart(3, '0')}.${AppParams.extension}`;
}

function renderBook() {
    dom.book.innerHTML = '';

    for (let i = 0; i < state.totalPages; i++) {
        const page = document.createElement('div');
        page.className = 'page';
        page.id = `page-${i}`;

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
            e.stopPropagation();
            flipToPage(Math.ceil(bm.page / 2));
        });

        track.appendChild(bubble);
    });
}

function flipToPage(index) {
    state.currentPageIndex = Math.max(0, Math.min(index, state.totalPages - 1));
    updateBookState();
}

function updateBookState() {
    for (let i = 0; i < state.totalPages; i++) {
        const page = document.getElementById(`page-${i}`);
        if (!page) continue;

        if (i < state.currentPageIndex) {
            page.classList.add('flipped');
            page.style.zIndex = i;
        } else {
            page.classList.remove('flipped');
            page.style.zIndex = state.totalPages - i;
        }
    }

    updateMobileTransform();
    updateUI();
}

function updateMobileTransform() {
    if (window.innerWidth <= 768) {
        const shiftX = state.currentPageIndex > 0 ? '45vw' : '-45vw';
        dom.book.style.transform = `translateX(${shiftX})`;
    } else {
        dom.book.style.transform = 'none';
    }
}

function updateUI() {
    let currentDisp = state.currentPageIndex * 2;
    if (currentDisp === 0) currentDisp = 1;

    dom.pageCounter.innerHTML = `Page ${currentDisp} / ${AppParams.totalImages - 1}`;

    const trackMax = AppParams.totalImages - 1;
    const currentTrackVal = Math.min(state.currentPageIndex * 2, trackMax);
    const progressVal = (currentTrackVal / trackMax) * 100;

    if (!state.isDraggingProgressBar) {
        dom.progressBar.value = progressVal * 100;
        dom.progressFill.style.width = `${progressVal}%`;
    }
}

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

        if (Math.abs(diffX) > 60) {
            if (diffX < 0) flipToPage(state.currentPageIndex + 1);
            else flipToPage(state.currentPageIndex - 1);
        }
        else if (Math.abs(diffX) < 10 && timeElapsed < 400) {
            if (e.target.closest('.book')) {
                if (endX > window.innerWidth / 2) {
                    flipToPage(state.currentPageIndex + 1);
                } else {
                    flipToPage(state.currentPageIndex - 1);
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

function init() {
    renderBook();
    initDrag();
    renderBookmarks();

    dom.progressBar.max = 10000;

    const pbStart = () => state.isDraggingProgressBar = true;
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
        const hoverExactPage = Math.round(percent * trackMax);

        let previewX = e.clientX;
        const previewWidth = 110;

        if (previewX < previewWidth / 2 + 10) previewX = previewWidth / 2 + 10;
        if (previewX > window.innerWidth - previewWidth / 2 - 10) previewX = window.innerWidth - previewWidth / 2 - 10;

        dom.pagePreview.style.left = `${previewX}px`;

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