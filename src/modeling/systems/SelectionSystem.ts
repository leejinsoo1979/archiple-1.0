/**
 * Selection System - Manages mesh selection state
 */

import {
  Scene,
  Mesh,
  Color3,
  StandardMaterial,
  HighlightLayer,
} from '@babylonjs/core';
import { ISelectionSystem, SelectionInfo, SelectionMode } from '../types';

type SelectionChangeCallback = (selection: SelectionInfo) => void;

export class SelectionSystem implements ISelectionSystem {
  private scene: Scene;
  private selectedMeshes: Set<Mesh> = new Set();
  private highlightLayer: HighlightLayer | null = null;
  private callbacks: SelectionChangeCallback[] = [];

  // Box selection state
  private boxSelectStart: { x: number; y: number } | null = null;
  private boxSelectCurrent: { x: number; y: number } | null = null;

  // Original materials for restoration
  private originalMaterials: Map<Mesh, StandardMaterial | null> = new Map();

  // Selection colors
  private readonly SELECTION_COLOR = Color3.FromHexString('#00A8FF');
  private readonly HIGHLIGHT_COLOR = Color3.FromHexString('#FFFF00');

  constructor(scene: Scene) {
    this.scene = scene;
    this.initHighlightLayer();
  }

  private initHighlightLayer(): void {
    this.highlightLayer = new HighlightLayer('selectionHighlight', this.scene);
    this.highlightLayer.outerGlow = true;
    this.highlightLayer.innerGlow = false;
    this.highlightLayer.blurHorizontalSize = 0.5;
    this.highlightLayer.blurVerticalSize = 0.5;
  }

  dispose(): void {
    this.clear();
    this.highlightLayer?.dispose();
    this.highlightLayer = null;
    this.callbacks = [];
  }

  // ============================================
  // Selection Operations
  // ============================================

  select(mesh: Mesh, mode: SelectionMode = 'single'): void {
    switch (mode) {
      case 'single':
        this.clear();
        this.addToSelection(mesh);
        break;
      case 'multiple':
      case 'add':
        this.addToSelection(mesh);
        break;
      case 'subtract':
        this.removeFromSelection(mesh);
        break;
    }

    this.notifyChange();
  }

  deselect(mesh: Mesh): void {
    this.removeFromSelection(mesh);
    this.notifyChange();
  }

  clear(): void {
    for (const mesh of this.selectedMeshes) {
      this.unhighlightMesh(mesh);
    }
    this.selectedMeshes.clear();
    this.originalMaterials.clear();
    this.notifyChange();
  }

  toggle(mesh: Mesh): void {
    if (this.isSelected(mesh)) {
      this.removeFromSelection(mesh);
    } else {
      this.addToSelection(mesh);
    }
    this.notifyChange();
  }

  // ============================================
  // Selection Queries
  // ============================================

  getSelection(): SelectionInfo {
    const meshes = Array.from(this.selectedMeshes);

    return {
      meshes,
      faces: meshes.filter(m => m.metadata?.type === 'face'),
      edges: meshes.filter(m => m.metadata?.type === 'edge'),
      vertices: [], // Vertices are not directly selectable as meshes
    };
  }

  isSelected(mesh: Mesh): boolean {
    return this.selectedMeshes.has(mesh);
  }

  hasSelection(): boolean {
    return this.selectedMeshes.size > 0;
  }

  getSelectedCount(): number {
    return this.selectedMeshes.size;
  }

  // ============================================
  // Box Selection
  // ============================================

  startBoxSelect(startPoint: { x: number; y: number }): void {
    this.boxSelectStart = startPoint;
    this.boxSelectCurrent = startPoint;
  }

  updateBoxSelect(currentPoint: { x: number; y: number }): void {
    this.boxSelectCurrent = currentPoint;
  }

  endBoxSelect(): Mesh[] {
    if (!this.boxSelectStart || !this.boxSelectCurrent) {
      return [];
    }

    const minX = Math.min(this.boxSelectStart.x, this.boxSelectCurrent.x);
    const maxX = Math.max(this.boxSelectStart.x, this.boxSelectCurrent.x);
    const minY = Math.min(this.boxSelectStart.y, this.boxSelectCurrent.y);
    const maxY = Math.max(this.boxSelectStart.y, this.boxSelectCurrent.y);

    const selectedInBox: Mesh[] = [];

    // Find all meshes within the box
    for (const mesh of this.scene.meshes) {
      if (!mesh.metadata?.type) continue;
      if (!mesh.isEnabled() || !mesh.isVisible) continue;

      // Project mesh position to screen
      const screenPos = this.projectToScreen(mesh.position);
      if (!screenPos) continue;

      if (screenPos.x >= minX && screenPos.x <= maxX &&
          screenPos.y >= minY && screenPos.y <= maxY) {
        selectedInBox.push(mesh as Mesh);
      }
    }

    // Reset box selection state
    this.boxSelectStart = null;
    this.boxSelectCurrent = null;

    return selectedInBox;
  }

  getBoxSelectRect(): { x: number; y: number; width: number; height: number } | null {
    if (!this.boxSelectStart || !this.boxSelectCurrent) return null;

    return {
      x: Math.min(this.boxSelectStart.x, this.boxSelectCurrent.x),
      y: Math.min(this.boxSelectStart.y, this.boxSelectCurrent.y),
      width: Math.abs(this.boxSelectCurrent.x - this.boxSelectStart.x),
      height: Math.abs(this.boxSelectCurrent.y - this.boxSelectStart.y),
    };
  }

  // ============================================
  // Event Handling
  // ============================================

  onSelectionChange(callback: SelectionChangeCallback): () => void {
    this.callbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index !== -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  private addToSelection(mesh: Mesh): void {
    if (this.selectedMeshes.has(mesh)) return;

    this.selectedMeshes.add(mesh);
    this.highlightMesh(mesh);
  }

  private removeFromSelection(mesh: Mesh): void {
    if (!this.selectedMeshes.has(mesh)) return;

    this.selectedMeshes.delete(mesh);
    this.unhighlightMesh(mesh);
  }

  private highlightMesh(mesh: Mesh): void {
    // Store original material
    this.originalMaterials.set(mesh, mesh.material as StandardMaterial | null);

    // Add to highlight layer
    if (this.highlightLayer) {
      this.highlightLayer.addMesh(mesh, this.SELECTION_COLOR);
    }

    // Optionally change material
    // const selectedMaterial = new StandardMaterial('selectedMat', this.scene);
    // selectedMaterial.diffuseColor = this.SELECTION_COLOR;
    // selectedMaterial.emissiveColor = this.SELECTION_COLOR.scale(0.3);
    // mesh.material = selectedMaterial;
  }

  private unhighlightMesh(mesh: Mesh): void {
    // Remove from highlight layer
    if (this.highlightLayer) {
      this.highlightLayer.removeMesh(mesh);
    }

    // Restore original material
    const originalMaterial = this.originalMaterials.get(mesh);
    if (originalMaterial !== undefined) {
      mesh.material = originalMaterial;
      this.originalMaterials.delete(mesh);
    }
  }

  private notifyChange(): void {
    const selection = this.getSelection();
    for (const callback of this.callbacks) {
      callback(selection);
    }
  }

  private projectToScreen(position: any): { x: number; y: number } | null {
    const engine = this.scene.getEngine();
    const camera = this.scene.activeCamera;

    if (!camera) return null;

    const projected = (position as any).project(
      camera.getWorldMatrix(),
      camera.getTransformationMatrix(),
      camera.viewport
    );

    return {
      x: projected.x * engine.getRenderWidth(),
      y: projected.y * engine.getRenderHeight(),
    };
  }
}
