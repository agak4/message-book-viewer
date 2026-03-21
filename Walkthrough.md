# Walkthrough - Resolution Issue Fix

## 목표 (Objective)
- 데스크탑 스프레드 뷰에서 왼쪽 페이지(뒤집힌 페이지)의 이미지가 오른쪽 페이지에 비해 해상도가 떨어져 보이거나 흐릿하게 출력되는 현상을 해결.

## 작업 내역 (Changes Made)
1. **이미지 렌더링 품질 개선 (`styles.css`)**
   - `.page-face img` 요소에 `image-rendering: -webkit-optimize-contrast` 속성을 추가하여 WebKit 기반 브라우저에서 이미지의 경계선을 더 선명하게 렌더링하도록 설정했습니다.
   - `transform: translateZ(0)`를 적용하여 이미지를 하드웨어 가속 레이어(GPU 가속)로 강제 승격시켰습니다. 이를 통해 3D 변환 시 발생할 수 있는 래스터화 흐림 현상을 방지합니다.
   - `transform-style: preserve-3d`와 `backface-visibility: hidden` 속성을 이미지 자체에도 명시하여 3D 공간 내에서 정확하고 선명하게 렌더링되도록 보강했습니다.

## 테스트 및 검증 방향 (Verification Plan)
- 책을 넘긴 후 왼쪽 페이지와 오른쪽 페이지의 이미지를 육안으로 비교하여 선명도 차이가 사라졌는지 확인.
- 다양한 페이지를 넘겨보며 애니메이션 도중이나 정지 시 이미지의 해상도가 일정하게 유지되는지 확인.
- 브라우저 크기 조절 시에도 이미지가 깨지거나 흐려지지 않는지 점검.
