/**
 * GameBuilder - 에디터 데이터를 게임 데이터로 컴파일
 *
 * Unity의 Build 과정처럼 에디터 데이터를 최적화된 게임 런타임 데이터로 변환
 */

import { Vector3 } from '@babylonjs/core';
import {
  GameData,
  GameFloor,
  GameWall,
  GameCeiling,
  GameFurniture,
  GameDoor,
  GameWindow,
  GameLight,
  GameSpawnPoint,
  BuildProgress,
  WallOpening,
} from './types';

export type BuildProgressCallback = (progress: BuildProgress) => void;

export class GameBuilder {
  private onProgress?: BuildProgressCallback;

  constructor(onProgress?: BuildProgressCallback) {
    this.onProgress = onProgress;
  }

  /**
   * 에디터의 floorplanData를 게임 데이터로 빌드
   */
  async build(floorplanData: any): Promise<GameData> {
    const startTime = performance.now();

    try {
      // Stage 1: Parsing
      this.reportProgress('parsing', 0, 'Parsing editor data...');
      await this.delay(50); // UI 업데이트를 위한 미세 딜레이

      const rooms = floorplanData.rooms || [];
      const walls = floorplanData.walls || [];
      const furniture = floorplanData.furniture || [];
      const doors = floorplanData.doors || [];
      const windows = floorplanData.windows || [];
      const lights = floorplanData.lights || [];

      this.reportProgress('parsing', 20, `Found ${rooms.length} rooms, ${walls.length} walls`);

      // Stage 2: Geometry
      this.reportProgress('geometry', 25, 'Building floor geometry...');
      const gameFloors = this.buildFloors(rooms);

      this.reportProgress('geometry', 40, 'Building wall geometry...');
      const gameWalls = this.buildWalls(walls, doors, windows);

      this.reportProgress('geometry', 55, 'Building ceiling geometry...');
      const gameCeilings = this.buildCeilings(rooms);

      // Stage 3: Objects
      this.reportProgress('materials', 60, 'Processing furniture...');
      const gameFurniture = this.buildFurniture(furniture);

      this.reportProgress('materials', 70, 'Processing doors and windows...');
      const gameDoors = this.buildDoors(doors);
      const gameWindows = this.buildWindows(windows);

      // Stage 4: Lighting
      this.reportProgress('lighting', 80, 'Setting up lights...');
      const gameLights = this.buildLights(lights);

      // Stage 5: Physics
      this.reportProgress('physics', 90, 'Configuring collision meshes...');
      // 충돌 메시는 이미 각 빌드 함수에서 설정됨

      // Stage 6: Finalizing
      this.reportProgress('finalizing', 95, 'Finalizing game data...');

      // 스폰 포인트 계산 (첫 번째 방의 중심)
      const spawnPoint = this.calculateSpawnPoint(rooms);

      const buildTime = performance.now() - startTime;

      const gameData: GameData = {
        floors: gameFloors,
        walls: gameWalls,
        ceilings: gameCeilings,
        furniture: gameFurniture,
        doors: gameDoors,
        windows: gameWindows,
        lights: gameLights,
        spawnPoint,
        metadata: {
          name: floorplanData.name || 'Untitled',
          version: '1.0.0',
          buildTime,
          totalMeshes: gameFloors.length + gameWalls.length + gameCeilings.length + gameFurniture.length,
          totalLights: gameLights.length,
        },
      };

      this.reportProgress('finalizing', 100, `Build complete in ${Math.round(buildTime)}ms`);

      console.log('[GameBuilder] Build complete:', gameData.metadata);

      return gameData;
    } catch (error) {
      console.error('[GameBuilder] Build failed:', error);
      throw error;
    }
  }

  private buildFloors(rooms: any[]): GameFloor[] {
    return rooms.map((room, index) => {
      const points = room.points || [];
      const vertices = points.map((p: any) =>
        new Vector3(p.x / 1000, 0, p.y / 1000) // mm → m 변환
      );

      return {
        id: `floor_${room.id || index}`,
        vertices,
        materialId: room.floorMaterial || 'default_floor',
        collisionEnabled: true,
      };
    });
  }

  private buildWalls(walls: any[], doors: any[], windows: any[]): GameWall[] {
    return walls.map((wall, index) => {
      const start = new Vector3(wall.start.x / 1000, 0, wall.start.y / 1000);
      const end = new Vector3(wall.end.x / 1000, 0, wall.end.y / 1000);
      const height = (wall.height || 2700) / 1000; // 기본 2.7m
      const thickness = (wall.thickness || 120) / 1000; // 기본 12cm

      // 이 벽에 속한 문/창문 찾기
      const openings = this.findWallOpenings(wall, doors, windows);

      return {
        id: `wall_${wall.id || index}`,
        start,
        end,
        height,
        thickness,
        materialId: wall.material || 'default_wall',
        hasCollision: true,
        openings,
      };
    });
  }

  private findWallOpenings(wall: any, doors: any[], windows: any[]): WallOpening[] {
    const openings: WallOpening[] = [];

    // 벽의 시작/끝 좌표
    const wallStart = { x: wall.start.x, y: wall.start.y };
    const wallEnd = { x: wall.end.x, y: wall.end.y };
    const wallLength = Math.sqrt(
      Math.pow(wallEnd.x - wallStart.x, 2) + Math.pow(wallEnd.y - wallStart.y, 2)
    );

    // 문 검색
    for (const door of doors) {
      if (door.wallId === wall.id) {
        openings.push({
          type: 'door',
          position: door.position || 0.5,
          width: (door.width || 900) / 1000,
          height: (door.height || 2100) / 1000,
          elevation: 0,
        });
      }
    }

    // 창문 검색
    for (const window of windows) {
      if (window.wallId === wall.id) {
        openings.push({
          type: 'window',
          position: window.position || 0.5,
          width: (window.width || 1200) / 1000,
          height: (window.height || 1200) / 1000,
          elevation: (window.elevation || 900) / 1000,
        });
      }
    }

    return openings;
  }

  private buildCeilings(rooms: any[]): GameCeiling[] {
    return rooms.map((room, index) => {
      const points = room.points || [];
      const height = (room.ceilingHeight || 2700) / 1000;
      const vertices = points.map((p: any) =>
        new Vector3(p.x / 1000, height, p.y / 1000)
      );

      return {
        id: `ceiling_${room.id || index}`,
        vertices,
        height,
        materialId: room.ceilingMaterial || 'default_ceiling',
      };
    });
  }

  private buildFurniture(furniture: any[]): GameFurniture[] {
    return furniture.map((item, index) => ({
      id: `furniture_${item.id || index}`,
      modelUrl: item.modelUrl || item.glbUrl || '',
      position: new Vector3(
        (item.position?.x || 0) / 1000,
        (item.position?.y || 0) / 1000,
        (item.position?.z || 0) / 1000
      ),
      rotation: new Vector3(
        item.rotation?.x || 0,
        item.rotation?.y || 0,
        item.rotation?.z || 0
      ),
      scale: new Vector3(
        item.scale?.x || 1,
        item.scale?.y || 1,
        item.scale?.z || 1
      ),
      hasCollision: item.hasCollision !== false,
      isInteractable: item.isInteractable || false,
      interactionType: item.interactionType,
    }));
  }

  private buildDoors(doors: any[]): GameDoor[] {
    return doors.map((door, index) => ({
      id: `door_${door.id || index}`,
      position: new Vector3(
        (door.x || 0) / 1000,
        0,
        (door.y || 0) / 1000
      ),
      rotation: door.rotation || 0,
      width: (door.width || 900) / 1000,
      height: (door.height || 2100) / 1000,
      isOpen: false,
      isLocked: door.isLocked || false,
      opensInward: door.opensInward !== false,
    }));
  }

  private buildWindows(windows: any[]): GameWindow[] {
    return windows.map((window, index) => ({
      id: `window_${window.id || index}`,
      position: new Vector3(
        (window.x || 0) / 1000,
        (window.elevation || 900) / 1000,
        (window.y || 0) / 1000
      ),
      rotation: window.rotation || 0,
      width: (window.width || 1200) / 1000,
      height: (window.height || 1200) / 1000,
      isOpenable: window.isOpenable || false,
      isOpen: false,
    }));
  }

  private buildLights(lights: any[]): GameLight[] {
    return lights.map((light, index) => ({
      id: `light_${light.id || index}`,
      type: light.type || 'point',
      position: new Vector3(
        (light.position?.x || 0) / 1000,
        (light.position?.y || 2500) / 1000,
        (light.position?.z || 0) / 1000
      ),
      direction: light.direction
        ? new Vector3(light.direction.x, light.direction.y, light.direction.z)
        : undefined,
      color: light.color || { r: 1, g: 1, b: 1 },
      intensity: light.intensity || 1,
      range: light.range ? light.range / 1000 : undefined,
      castShadows: light.castShadows !== false,
    }));
  }

  private calculateSpawnPoint(rooms: any[]): GameSpawnPoint {
    if (rooms.length === 0) {
      return {
        position: new Vector3(0, 1.7, 0),
        rotation: 0,
      };
    }

    // 첫 번째 방의 중심 계산
    const firstRoom = rooms[0];
    const points = firstRoom.points || [];

    if (points.length === 0) {
      return {
        position: new Vector3(0, 1.7, 0),
        rotation: 0,
      };
    }

    let centerX = 0;
    let centerZ = 0;
    for (const p of points) {
      centerX += p.x / 1000;
      centerZ += p.y / 1000;
    }
    centerX /= points.length;
    centerZ /= points.length;

    return {
      position: new Vector3(centerX, 1.7, centerZ), // 눈높이 1.7m
      rotation: 0,
    };
  }

  private reportProgress(
    stage: BuildProgress['stage'],
    percent: number,
    message: string
  ): void {
    if (this.onProgress) {
      this.onProgress({ stage, percent, message });
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
