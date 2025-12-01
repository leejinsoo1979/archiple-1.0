/**
 * Tool Manager - Manages tool lifecycle and switching
 */

import { Scene, ArcRotateCamera, PointerInfo, PointerEventTypes } from '@babylonjs/core';
import { BaseTool } from '../tools/BaseTool';
import { ToolType, ToolContext, PickResultInfo, ISnapSystem, ISelectionSystem } from '../types';

export class ToolManager {
  private tools: Map<ToolType, BaseTool> = new Map();
  private currentTool: BaseTool | null = null;
  private context: ToolContext | null = null;

  private scene: Scene | null = null;
  private camera: ArcRotateCamera | null = null;
  private canvas: HTMLCanvasElement | null = null;

  private pointerObserver: any = null;
  private keyDownHandler: ((e: KeyboardEvent) => void) | null = null;
  private keyUpHandler: ((e: KeyboardEvent) => void) | null = null;

  // ============================================
  // Initialization
  // ============================================

  initialize(
    scene: Scene,
    camera: ArcRotateCamera,
    canvas: HTMLCanvasElement,
    snapSystem: ISnapSystem,
    selectionSystem: ISelectionSystem,
    callbacks: Partial<ToolContext>
  ): void {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;

    // Build context
    this.context = {
      scene,
      camera,
      canvas,
      snapSystem,
      selectionSystem,
      getAllMeshes: callbacks.getAllMeshes ?? (() => []),
      getAllFaces: callbacks.getAllFaces ?? (() => []),
      getAllEdges: callbacks.getAllEdges ?? (() => []),
      getAllSolids: callbacks.getAllSolids ?? (() => []),
      setStatusText: callbacks.setStatusText ?? (() => {}),
      showSnapIndicator: callbacks.showSnapIndicator ?? (() => {}),
      hideSnapIndicator: callbacks.hideSnapIndicator ?? (() => {}),
      setInputValue: callbacks.setInputValue ?? (() => {}),
      createFace: callbacks.createFace ?? (() => null),
      createEdge: callbacks.createEdge ?? (() => null),
      createSolid: callbacks.createSolid ?? (() => null),
      deleteMesh: callbacks.deleteMesh ?? (() => {}),
      updateMesh: callbacks.updateMesh ?? (() => {}),
    };

    this.setupEventListeners();
  }

  dispose(): void {
    this.removeEventListeners();
    this.deactivateCurrentTool();
    this.tools.clear();
    this.context = null;
  }

  // ============================================
  // Tool Registration
  // ============================================

  registerTool(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  unregisterTool(toolName: ToolType): void {
    if (this.currentTool?.name === toolName) {
      this.deactivateCurrentTool();
    }
    this.tools.delete(toolName);
  }

  getTool(toolName: ToolType): BaseTool | undefined {
    return this.tools.get(toolName);
  }

  // ============================================
  // Tool Switching
  // ============================================

  activateTool(toolName: ToolType): boolean {
    const tool = this.tools.get(toolName);
    if (!tool || !this.context) {
      console.warn(`Tool "${toolName}" not found or context not initialized`);
      return false;
    }

    // Deactivate current tool
    this.deactivateCurrentTool();

    // Activate new tool
    this.currentTool = tool;
    tool.activate(this.context);

    // Update cursor
    if (this.canvas) {
      this.canvas.style.cursor = tool.cursor;
    }

    console.log(`[ToolManager] Activated: ${toolName}`);
    return true;
  }

  deactivateCurrentTool(): void {
    if (this.currentTool) {
      this.currentTool.deactivate();
      console.log(`[ToolManager] Deactivated: ${this.currentTool.name}`);
      this.currentTool = null;
    }
  }

  resetCurrentTool(): void {
    this.currentTool?.reset();
  }

  getCurrentTool(): BaseTool | null {
    return this.currentTool;
  }

  getCurrentToolName(): ToolType | null {
    return this.currentTool?.name ?? null;
  }

  // ============================================
  // Value Input
  // ============================================

  handleValueInput(value: string): boolean {
    return this.currentTool?.onValueInput(value) ?? false;
  }

  // ============================================
  // Event Listeners
  // ============================================

  private setupEventListeners(): void {
    if (!this.scene || !this.canvas) return;

    // Pointer events
    this.pointerObserver = this.scene.onPointerObservable.add((info: PointerInfo) => {
      if (!this.currentTool) return;

      const pickResult = this.createPickResult(info);

      switch (info.type) {
        case PointerEventTypes.POINTERDOWN:
          this.currentTool.onPointerDown(info, pickResult);
          break;
        case PointerEventTypes.POINTERMOVE:
          this.currentTool.onPointerMove(info, pickResult);
          break;
        case PointerEventTypes.POINTERUP:
          this.currentTool.onPointerUp(info, pickResult);
          break;
      }
    });

    // Keyboard events
    this.keyDownHandler = (e: KeyboardEvent) => {
      this.currentTool?.onKeyDown(e);
    };
    this.keyUpHandler = (e: KeyboardEvent) => {
      this.currentTool?.onKeyUp(e);
    };

    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);
  }

  private removeEventListeners(): void {
    if (this.pointerObserver && this.scene) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
    }

    if (this.keyDownHandler) {
      window.removeEventListener('keydown', this.keyDownHandler);
      this.keyDownHandler = null;
    }
    if (this.keyUpHandler) {
      window.removeEventListener('keyup', this.keyUpHandler);
      this.keyUpHandler = null;
    }
  }

  private createPickResult(info: PointerInfo): PickResultInfo {
    const pickInfo = info.pickInfo;

    // Basic pick result
    const result: PickResultInfo = {
      hit: pickInfo?.hit ?? false,
      pickedPoint: pickInfo?.pickedPoint ?? null,
      pickedMesh: (pickInfo?.pickedMesh as any) ?? null,
      faceId: pickInfo?.faceId,
      distance: pickInfo?.distance,
      snapped: false,
      snapType: null,
      snapPoint: null,
    };

    // Apply snap if we have a point and snap system
    if (result.pickedPoint && this.context?.snapSystem) {
      const snapResult = this.context.snapSystem.snap(result.pickedPoint);
      if (snapResult.snapped) {
        result.snapped = true;
        result.snapType = snapResult.type;
        result.snapPoint = snapResult.point;
      }
    }

    return result;
  }
}

// Singleton export
export const toolManager = new ToolManager();
