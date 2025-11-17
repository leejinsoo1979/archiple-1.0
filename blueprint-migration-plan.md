# Blueprint3D → Archiple 재구현 계획

## 1. 목표
- 2D/3D 플로어플랜 로직을 furnishup/blueprint3d 아키텍처(코너/벽/룸/half-edge/DCEL) 기반으로 재구현한다.
- 모든 좌표는 mm 단위를 사용하고, 3D 렌더링 시 0.001을 곱해 m 단위로 변환한다.
- 기존 SceneManager/ObjectManager/WallTool/Renderer 구조를 완전히 교체한다.

## 2. 핵심 모듈 포팅 (위치: src/floorplan/blueprint/)
1. **utils.ts**
   - 거리, 라인 교차, GUID, 각도 계산 등 blueprint3d Core Utils를 TypeScript로 포팅.
2. **callbacks.ts**
   - jQuery Callbacks 대신 간단한 CallbackList 구현.
3. **corner.ts**
   - Corner 클래스: 벽 연결 관리, 이동/스냅/삭제 콜백.
4. **wall.ts**
   - Wall 클래스: 두께/높이, 거리 계산, 삭제 콜백.
5. **half_edge.ts**
   - Room에서 사용하는 HalfEdge/DCEL 구조.
6. **room.ts**
   - 방 정의 및 interior corners, half-edge 구축.
7. **floorplan.ts**
   - Corner/Wall/Room 전체를 관리하고, 이벤트/로드/저장을 담당.

## 3. Scene/Tool/Renderer 교체
1. **SceneManager/Core**
   - ObjectManager 대신 blueprint Floorplan 인스턴스를 보유하게 변경.
   - 기존 Map 기반 저장 로직 제거.
2. **Tools**
   - WallTool, RectangleTool을 blueprint의 floorplanner처럼 재작성.
   - 연속 클릭으로 벽을 추가하고, 방이 닫히면 Room 생성.
3. **Services**
   - Snap/RoomDetection을 Floorplan 내부 로직으로 통합하거나, blueprint 메서드에 맞춰 래핑.
4. **Renderer**
   - Canvas2DRenderer와 각 Layer(Grid/Wall/Room/Guide)를 blueprint 데이터에 맞춰 재작성.
   - mm 단위에서 바로 그리도록 하고, 프리뷰/확정 라인이 동일 스케일 유지.

## 4. Babylon 3D 동기화
1. 2D에서 전달되는 mm 좌표를 3D에서 `* 0.001`로 변환.
2. 벽 높이 2800mm → 2.8m, 두께 200mm → 0.2m로 정확히 렌더.
3. Floorplan 중심을 기준으로 카메라/그라운드/그리드를 설정.

## 5. 검증 체크리스트
- 2D에서 mm 단위 치수·면적이 정확히 표시되는지.
- 방을 닫으면 Room이 자동 생성되고, HalfEdge/DCEL이 정상 작동하는지.
- Babylon 3D에서 벽 모서리가 계단식으로 깨지지 않고 2D와 동일한 스케일인지.
- 프리뷰·확정선 두께, 그리드, 스냅 등이 blueprint 수준으로 일관되게 동작하는지.

이 계획에 따라 현재 `/src/floorplan/blueprint/`에 Corner/Wall/Room/HalfEdge/Floorplan 모듈을 추가해 두었고, SceneManager/Tools/Renderer/Babylon 3D를 차례대로 교체할 예정입니다.
