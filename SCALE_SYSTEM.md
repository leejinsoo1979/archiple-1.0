# Archiple Scale System

## 통합 스케일 시스템 (Unified Scale System)

### 기본 원칙
- **2D Canvas**: 1 pixel = 1mm (밀리미터 단위)
- **3D Babylon**: 1 Babylon unit = 1 meter (미터 단위)
- **변환**: 2D → 3D 시 0.001 곱하기 (mm → m)

### 왜 이 방식인가?

**Blueprint.js/Architect3D 분석 결과**:
- 이들도 2D는 픽셀 단위, 3D는 미터 단위 사용
- 변환은 렌더링 시점에만 발생
- 2D에서 1mm 정밀도 확보 (1px = 1mm)

### 스케일 상수

```typescript
// 2D Canvas (mm 단위)
const PIXEL_TO_MM = 1; // 1 pixel = 1mm
const DEFAULT_WALL_THICKNESS = 200; // 200mm = 20cm
const DEFAULT_WALL_HEIGHT = 2800; // 2800mm = 2.8m

// 3D Babylon (m 단위로 변환)
const MM_TO_METERS = 0.001; // 1mm = 0.001m
const PIXELS_TO_METERS = 0.001; // 1px (1mm) = 0.001m
```

### 데이터 흐름

1. **사용자 입력** (마우스 클릭)
   - Canvas 좌표: pixels
   - 내부 저장: mm (1:1 매핑)

2. **2D 렌더링**
   - 저장된 mm 값을 그대로 사용
   - Canvas에 1:1로 그리기

3. **3D 렌더링**
   - mm 값에 0.001 곱하기
   - Babylon units (meters)로 변환

### 예시

```typescript
// 사용자가 (1000, 500) 클릭
const clickX = 1000; // pixels
const clickY = 500;  // pixels

// 2D 저장 (mm)
const point = {
  x: 1000, // 1000mm = 1m
  y: 500   // 500mm = 0.5m
};

// 2D 렌더링
ctx.arc(point.x, point.y, 5, 0, Math.PI * 2); // 그대로 사용

// 3D 렌더링
const mesh = CreateSphere('point', {}, scene);
mesh.position.set(
  point.x * 0.001,  // 1.0m
  0,
  point.y * 0.001   // 0.5m
);
```

### 주의사항

1. **절대 픽셀 단위를 버리지 말 것**
   - 2D는 항상 mm = pixels
   - 변환은 3D 렌더링 시에만

2. **그리드 스냅 비활성화**
   - 1mm 정밀도를 위해 grid snap 끄기
   - Point snap만 사용

3. **린터 설정**
   - PIXELS_TO_METERS = 0.001 유지
   - MM_TO_METERS = 0.001 유지
   - 이것이 올바른 값임!

## Blueprint.js vs Archiple

| 항목 | Blueprint.js | Archiple |
|------|--------------|----------|
| 2D 단위 | pixels (cmPerPixel = 2.032) | mm (1px = 1mm) |
| 3D 단위 | meters | meters |
| 정밀도 | ~2cm | 1mm (20배 더 정밀) |
| 변환 | 픽셀 → cm → m | mm → m (직접) |

우리가 더 정밀합니다!
