import { Scene, AbstractMesh, Mesh, Vector3, Color3, LinesMesh } from '@babylonjs/core';

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'toggle';

export class SelectionManager {
    private scene: Scene;
    private selectedIds: Set<string> = new Set();
    private onSelectionChanged: ((selectedIds: string[]) => void) | null = null;

    constructor(scene: Scene, onSelectionChanged?: (selectedIds: string[]) => void) {
        this.scene = scene;
        this.onSelectionChanged = onSelectionChanged || null;
    }

    public getSelectedIds(): string[] {
        return Array.from(this.selectedIds);
    }

    public isSelected(id: string): boolean {
        return this.selectedIds.has(id);
    }

    public clear() {
        this.selectedIds.clear();
        this.notifySelectionChanged();
    }

    public select(id: string, mode: SelectionMode = 'replace') {
        this.selectIds([id], mode);
    }

    public selectIds(ids: string[], mode: SelectionMode = 'replace') {
        if (mode === 'replace') {
            this.selectedIds.clear();
            ids.forEach(id => this.selectedIds.add(id));
        } else if (mode === 'add') {
            ids.forEach(id => this.selectedIds.add(id));
        } else if (mode === 'subtract') {
            ids.forEach(id => this.selectedIds.delete(id));
        } else if (mode === 'toggle') {
            ids.forEach(id => {
                if (this.selectedIds.has(id)) {
                    this.selectedIds.delete(id);
                } else {
                    this.selectedIds.add(id);
                }
            });
        }
        this.notifySelectionChanged();
    }

    public invertSelection(allIds: string[]) {
        const newSelection = new Set<string>();
        allIds.forEach(id => {
            if (!this.selectedIds.has(id)) {
                newSelection.add(id);
            }
        });
        this.selectedIds = newSelection;
        this.notifySelectionChanged();
    }

    // --- Advanced Selection Logic ---

    public getConnectedGeometry(startId: string, level: 'face-edges' | 'edge-faces' | 'all'): string[] {
        const startMesh = this.scene.getMeshByID(startId);
        if (!startMesh) return [];

        const connectedIds = new Set<string>();
        connectedIds.add(startId);

        if (level === 'face-edges') {
            // If face, get bounding edges
            if (startMesh.metadata?.type === 'face' && startMesh.metadata.edgeIds) {
                (startMesh.metadata.edgeIds as string[]).forEach(id => connectedIds.add(id));
            }
        } else if (level === 'edge-faces') {
            // If edge, get connected faces
            if (startMesh.metadata?.type === 'edge' && startMesh.metadata.parentFaceId) {
                connectedIds.add(startMesh.metadata.parentFaceId);
                // Also check if this edge is shared by other faces (requires searching or better data structure)
                // For now, simple parent link
            }
        } else if (level === 'all') {
            // BFS to find all connected geometry
            const queue = [startId];
            const visited = new Set<string>();
            visited.add(startId);

            while (queue.length > 0) {
                const currentId = queue.shift()!;
                const currentMesh = this.scene.getMeshByID(currentId);

                if (currentMesh) {
                    // Find neighbors based on metadata links
                    const neighbors: string[] = [];

                    if (currentMesh.metadata?.type === 'face') {
                        // Face -> Edges
                        if (currentMesh.metadata.edgeIds) {
                            neighbors.push(...(currentMesh.metadata.edgeIds as string[]));
                        }
                    } else if (currentMesh.metadata?.type === 'edge') {
                        // Edge -> Faces
                        if (currentMesh.metadata.connectedFaceIds) {
                            neighbors.push(...(currentMesh.metadata.connectedFaceIds as string[]));
                        } else if (currentMesh.metadata.parentFaceId) {
                            // Backward compatibility
                            neighbors.push(currentMesh.metadata.parentFaceId);
                        }
                        // Edge -> Connected Edges (via shared vertices - requires more complex check or graph)
                        // For this simple implementation, we rely on face-edge-face traversal
                    }

                    neighbors.forEach(neighborId => {
                        if (!visited.has(neighborId)) {
                            visited.add(neighborId);
                            connectedIds.add(neighborId);
                            queue.push(neighborId);
                        }
                    });
                }
            }
        }

        return Array.from(connectedIds);
    }

    public getEntitiesWithSameMaterial(materialId: string): string[] {
        const result: string[] = [];
        this.scene.meshes.forEach(mesh => {
            if (mesh.material && mesh.material.id === materialId) {
                result.push(mesh.id);
            }
        });
        return result;
    }

    public getEntitiesWithSameTag(tag: string): string[] {
        // Assuming tag is stored in metadata or distinct property
        const result: string[] = [];
        this.scene.meshes.forEach(mesh => {
            if (mesh.metadata?.tag === tag) {
                result.push(mesh.id);
            }
        });
        return result;
    }

    private notifySelectionChanged() {
        if (this.onSelectionChanged) {
            this.onSelectionChanged(Array.from(this.selectedIds));
        }
        this.updateVisuals();
    }

    private updateVisuals() {
        // Update highlights, wireframes, etc.
        this.scene.meshes.forEach(mesh => {
            if (this.selectedIds.has(mesh.id)) {
                // Apply selection style
                if (mesh.metadata?.type === 'edge') {
                    // Edge: check if it's a LinesMesh (has .color property) or Tube mesh
                    mesh.renderOverlay = false;
                    if ('color' in mesh) {
                        // LinesMesh - use direct color property
                        (mesh as LinesMesh).color = new Color3(0.39, 0.4, 0.95);
                    } else if (mesh.material && 'diffuseColor' in mesh.material) {
                        // Tube mesh - use material color
                        (mesh.material as any).diffuseColor = new Color3(0.39, 0.4, 0.95);
                        (mesh.material as any).emissiveColor = new Color3(0.39, 0.4, 0.95);
                    }
                } else {
                    // Face/solid: use overlay
                    mesh.renderOverlay = true;
                    mesh.overlayColor = new Color3(0.39, 0.4, 0.95); // Indigo
                    mesh.overlayAlpha = 0.3;
                }
            } else {
                // Reset style
                mesh.renderOverlay = false;

                if (mesh.metadata?.type === 'edge') {
                    // Edge: restore original color
                    if ('color' in mesh) {
                        // LinesMesh - restore dark gray
                        (mesh as LinesMesh).color = new Color3(0.15, 0.15, 0.15);
                    } else if (mesh.material && 'diffuseColor' in mesh.material) {
                        // Tube mesh - restore material color
                        (mesh.material as any).diffuseColor = new Color3(0.15, 0.15, 0.15);
                        (mesh.material as any).emissiveColor = new Color3(0.15, 0.15, 0.15);
                    }
                }
            }
        });
    }
}
