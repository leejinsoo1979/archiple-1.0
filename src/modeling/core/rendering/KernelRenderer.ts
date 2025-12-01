/**
 * KernelRenderer - Visualizes HalfEdgeMesh topology in Babylon.js scene
 *
 * Watches the geometry kernel and efficiently updates 3D meshes.
 * Supports edge rendering, optional vertex debug spheres, and face rendering.
 */

import {
  Scene,
  Mesh,
  MeshBuilder,
  LinesMesh,
  Vector3,
  Color3,
  Color4,
  StandardMaterial,
  VertexData,
} from '@babylonjs/core';
import { HalfEdgeMesh, HVertex, HEdge, HFace, VertexID, EdgeID, FaceID } from '../kernel';

// ============================================
// Types
// ============================================

export interface KernelRendererOptions {
  /** Show debug spheres at vertices */
  showVertices?: boolean;
  /** Vertex sphere radius */
  vertexRadius?: number;
  /** Default edge color */
  edgeColor?: Color3;
  /** Edge line width (for thick lines) */
  edgeWidth?: number;
  /** Default face color */
  faceColor?: Color4;
  /** Face opacity */
  faceOpacity?: number;
  /** Show face normals as debug lines */
  showNormals?: boolean;
  /** Normal line length */
  normalLength?: number;
}

const DEFAULT_OPTIONS: Required<KernelRendererOptions> = {
  showVertices: false,
  vertexRadius: 0.02,
  edgeColor: Color3.Black(),
  edgeWidth: 1,
  faceColor: new Color4(0.8, 0.8, 0.8, 1.0),
  faceOpacity: 1.0,
  showNormals: false,
  normalLength: 0.1,
};

// ============================================
// KernelRenderer Class
// ============================================

export class KernelRenderer {
  private scene: Scene;
  private kernel: HalfEdgeMesh;
  private options: Required<KernelRendererOptions>;

  // Mesh caches
  private edgeMesh: LinesMesh | null = null;
  private vertexMeshMap: Map<VertexID, Mesh> = new Map();
  private faceMeshMap: Map<FaceID, Mesh> = new Map();
  private normalLines: LinesMesh | null = null;

  // Materials
  private edgeMaterial: StandardMaterial | null = null;
  private vertexMaterial: StandardMaterial | null = null;
  private faceMaterial: StandardMaterial | null = null;

  // State tracking
  private isDirty: boolean = true;
  private unsubscribe: (() => void) | null = null;

  constructor(scene: Scene, kernel: HalfEdgeMesh, options?: KernelRendererOptions) {
    this.scene = scene;
    this.kernel = kernel;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.initMaterials();
    this.subscribeToKernel();
  }

  // ============================================
  // Initialization
  // ============================================

  private initMaterials(): void {
    // Edge material
    this.edgeMaterial = new StandardMaterial('kernelEdgeMat', this.scene);
    this.edgeMaterial.emissiveColor = this.options.edgeColor;
    this.edgeMaterial.disableLighting = true;

    // Vertex material (for debug spheres)
    this.vertexMaterial = new StandardMaterial('kernelVertexMat', this.scene);
    this.vertexMaterial.diffuseColor = Color3.Red();
    this.vertexMaterial.emissiveColor = new Color3(0.5, 0, 0);

    // Face material
    this.faceMaterial = new StandardMaterial('kernelFaceMat', this.scene);
    this.faceMaterial.diffuseColor = new Color3(
      this.options.faceColor.r,
      this.options.faceColor.g,
      this.options.faceColor.b
    );
    this.faceMaterial.alpha = this.options.faceOpacity;
    this.faceMaterial.backFaceCulling = false;
  }

  private subscribeToKernel(): void {
    // Listen to all topology changes
    this.unsubscribe = this.kernel.on('topology:changed', () => {
      this.isDirty = true;
    });
  }

  // ============================================
  // Main Render Methods
  // ============================================

  /**
   * Main render method - call this each frame or after changes
   */
  render(): void {
    if (!this.isDirty) return;

    this.renderEdges();

    if (this.options.showVertices) {
      this.renderVertices();
    }

    this.renderFaces();

    if (this.options.showNormals) {
      this.renderNormals();
    }

    this.isDirty = false;
  }

  /**
   * Force a full re-render
   */
  forceRender(): void {
    this.isDirty = true;
    this.render();
  }

  // ============================================
  // Edge Rendering
  // ============================================

  private renderEdges(): void {
    // Dispose old edge mesh
    if (this.edgeMesh) {
      this.edgeMesh.dispose();
      this.edgeMesh = null;
    }

    const edges = this.kernel.getAllEdges();
    if (edges.length === 0) return;

    // Collect line segments (only process each edge once, skip twins)
    const processedEdges = new Set<EdgeID>();
    const points: Vector3[] = [];

    for (const edge of edges) {
      // Skip if already processed (via twin)
      if (processedEdges.has(edge.id)) continue;
      if (edge.twin && processedEdges.has(edge.twin)) continue;

      // Mark this edge (and its twin) as processed
      processedEdges.add(edge.id);
      if (edge.twin) {
        processedEdges.add(edge.twin);
      }

      // Get vertices
      const originVertex = this.kernel.getVertex(edge.origin);
      const destVertex = this.getDestinationVertex(edge);

      if (!originVertex || !destVertex) continue;

      // Add line segment (each segment needs 2 points)
      points.push(originVertex.position.clone());
      points.push(destVertex.position.clone());
    }

    if (points.length < 2) return;

    // Create LineSystem for multiple disconnected lines
    this.edgeMesh = MeshBuilder.CreateLineSystem(
      'kernelEdges',
      {
        lines: this.pointsToLineSegments(points),
        updatable: true,
      },
      this.scene
    );

    this.edgeMesh.color = this.options.edgeColor;
    this.edgeMesh.isPickable = false;
  }

  private getDestinationVertex(edge: HEdge): HVertex | null {
    // Destination is the origin of the next half-edge
    if (edge.next) {
      const nextEdge = this.kernel.getEdge(edge.next);
      if (nextEdge) {
        return this.kernel.getVertex(nextEdge.origin);
      }
    }

    // Fallback: use twin's origin
    if (edge.twin) {
      const twinEdge = this.kernel.getEdge(edge.twin);
      if (twinEdge) {
        return this.kernel.getVertex(twinEdge.origin);
      }
    }

    return null;
  }

  private pointsToLineSegments(points: Vector3[]): Vector3[][] {
    const segments: Vector3[][] = [];
    for (let i = 0; i < points.length; i += 2) {
      if (i + 1 < points.length) {
        segments.push([points[i], points[i + 1]]);
      }
    }
    return segments;
  }

  // ============================================
  // Vertex Rendering (Debug)
  // ============================================

  private renderVertices(): void {
    const vertices = this.kernel.getAllVertices();
    const currentIds = new Set<VertexID>();

    for (const vertex of vertices) {
      currentIds.add(vertex.id);

      if (this.vertexMeshMap.has(vertex.id)) {
        // Update existing sphere position
        const mesh = this.vertexMeshMap.get(vertex.id)!;
        mesh.position = vertex.position.clone();
      } else {
        // Create new sphere
        const sphere = MeshBuilder.CreateSphere(
          `kernelVertex_${vertex.id}`,
          { diameter: this.options.vertexRadius * 2 },
          this.scene
        );
        sphere.position = vertex.position.clone();
        sphere.material = this.vertexMaterial;
        sphere.isPickable = false;
        this.vertexMeshMap.set(vertex.id, sphere);
      }
    }

    // Remove spheres for deleted vertices
    for (const [id, mesh] of this.vertexMeshMap) {
      if (!currentIds.has(id)) {
        mesh.dispose();
        this.vertexMeshMap.delete(id);
      }
    }
  }

  // ============================================
  // Face Rendering
  // ============================================

  private renderFaces(): void {
    const faces = this.kernel.getAllFaces();
    const currentIds = new Set<FaceID>();

    for (const face of faces) {
      currentIds.add(face.id);

      // Get face vertices
      const vertices = this.getFaceVertices(face);
      if (vertices.length < 3) continue;

      if (this.faceMeshMap.has(face.id)) {
        // Update existing mesh
        this.updateFaceMesh(face.id, vertices, face.normal);
      } else {
        // Create new mesh
        this.createFaceMesh(face, vertices);
      }
    }

    // Remove meshes for deleted faces
    for (const [id, mesh] of this.faceMeshMap) {
      if (!currentIds.has(id)) {
        mesh.dispose();
        this.faceMeshMap.delete(id);
      }
    }
  }

  private getFaceVertices(face: HFace): Vector3[] {
    const vertices: Vector3[] = [];

    if (!face.outer) return vertices;

    let currentEdgeId: EdgeID | null = face.outer;
    const startEdgeId = currentEdgeId;
    let safety = 0;
    const maxIterations = 100;

    do {
      const edge = this.kernel.getEdge(currentEdgeId!);
      if (!edge) break;

      const vertex = this.kernel.getVertex(edge.origin);
      if (vertex) {
        vertices.push(vertex.position.clone());
      }

      currentEdgeId = edge.next;
      safety++;
    } while (currentEdgeId && currentEdgeId !== startEdgeId && safety < maxIterations);

    return vertices;
  }

  private createFaceMesh(face: HFace, vertices: Vector3[]): void {
    const mesh = new Mesh(`kernelFace_${face.id}`, this.scene);
    mesh.material = this.faceMaterial;

    this.updateFaceMesh(face.id, vertices, face.normal, mesh);
    this.faceMeshMap.set(face.id, mesh);
  }

  private updateFaceMesh(
    faceId: FaceID,
    vertices: Vector3[],
    normal: Vector3,
    mesh?: Mesh
  ): void {
    const targetMesh = mesh || this.faceMeshMap.get(faceId);
    if (!targetMesh || vertices.length < 3) return;

    // Triangulate the polygon (fan triangulation for convex polygons)
    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];

    // Add all vertices
    for (const v of vertices) {
      positions.push(v.x, v.y, v.z);
      normals.push(normal.x, normal.y, normal.z);
    }

    // Fan triangulation (works for convex polygons)
    for (let i = 1; i < vertices.length - 1; i++) {
      indices.push(0, i, i + 1);
    }

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.applyToMesh(targetMesh);
  }

  // ============================================
  // Normal Rendering (Debug)
  // ============================================

  private renderNormals(): void {
    if (this.normalLines) {
      this.normalLines.dispose();
      this.normalLines = null;
    }

    const faces = this.kernel.getAllFaces();
    if (faces.length === 0) return;

    const lines: Vector3[][] = [];

    for (const face of faces) {
      const vertices = this.getFaceVertices(face);
      if (vertices.length < 3) continue;

      // Calculate centroid
      const centroid = Vector3.Zero();
      for (const v of vertices) {
        centroid.addInPlace(v);
      }
      centroid.scaleInPlace(1 / vertices.length);

      // Normal line from centroid
      const normalEnd = centroid.add(face.normal.scale(this.options.normalLength));
      lines.push([centroid, normalEnd]);
    }

    if (lines.length === 0) return;

    this.normalLines = MeshBuilder.CreateLineSystem(
      'kernelNormals',
      { lines },
      this.scene
    );
    this.normalLines.color = Color3.Blue();
    this.normalLines.isPickable = false;
  }

  // ============================================
  // Options & Configuration
  // ============================================

  setOptions(options: Partial<KernelRendererOptions>): void {
    this.options = { ...this.options, ...options };

    // Update materials if colors changed
    if (options.edgeColor && this.edgeMaterial) {
      this.edgeMaterial.emissiveColor = options.edgeColor;
    }
    if (options.faceColor && this.faceMaterial) {
      this.faceMaterial.diffuseColor = new Color3(
        options.faceColor.r,
        options.faceColor.g,
        options.faceColor.b
      );
    }
    if (options.faceOpacity !== undefined && this.faceMaterial) {
      this.faceMaterial.alpha = options.faceOpacity;
    }

    this.forceRender();
  }

  setShowVertices(show: boolean): void {
    this.options.showVertices = show;
    if (!show) {
      // Dispose all vertex spheres
      for (const mesh of this.vertexMeshMap.values()) {
        mesh.dispose();
      }
      this.vertexMeshMap.clear();
    }
    this.forceRender();
  }

  setShowNormals(show: boolean): void {
    this.options.showNormals = show;
    if (!show && this.normalLines) {
      this.normalLines.dispose();
      this.normalLines = null;
    }
    this.forceRender();
  }

  // ============================================
  // Highlighting & Selection
  // ============================================

  highlightEdge(edgeId: EdgeID, color: Color3): void {
    // For individual edge highlighting, create a separate mesh
    const edge = this.kernel.getEdge(edgeId);
    if (!edge) return;

    const originVertex = this.kernel.getVertex(edge.origin);
    const destVertex = this.getDestinationVertex(edge);
    if (!originVertex || !destVertex) return;

    const highlightMesh = MeshBuilder.CreateLines(
      `highlight_${edgeId}`,
      { points: [originVertex.position, destVertex.position] },
      this.scene
    );
    highlightMesh.color = color;
    highlightMesh.isPickable = false;

    // Auto-dispose after a delay (or store for manual cleanup)
    setTimeout(() => highlightMesh.dispose(), 2000);
  }

  highlightVertex(vertexId: VertexID, color: Color3): void {
    const vertex = this.kernel.getVertex(vertexId);
    if (!vertex) return;

    const material = new StandardMaterial(`highlight_mat_${vertexId}`, this.scene);
    material.emissiveColor = color;
    material.disableLighting = true;

    const sphere = MeshBuilder.CreateSphere(
      `highlight_${vertexId}`,
      { diameter: this.options.vertexRadius * 3 },
      this.scene
    );
    sphere.position = vertex.position.clone();
    sphere.material = material;
    sphere.isPickable = false;

    // Auto-dispose
    setTimeout(() => {
      sphere.dispose();
      material.dispose();
    }, 2000);
  }

  highlightFace(faceId: FaceID, color: Color3): void {
    const face = this.kernel.getFace(faceId);
    if (!face) return;

    const vertices = this.getFaceVertices(face);
    if (vertices.length < 3) return;

    const material = new StandardMaterial(`highlight_face_mat_${faceId}`, this.scene);
    material.emissiveColor = color;
    material.alpha = 0.5;
    material.backFaceCulling = false;

    const mesh = new Mesh(`highlight_face_${faceId}`, this.scene);
    mesh.material = material;
    this.updateFaceMesh(faceId, vertices, face.normal, mesh);
    mesh.isPickable = false;

    // Auto-dispose
    setTimeout(() => {
      mesh.dispose();
      material.dispose();
    }, 2000);
  }

  // ============================================
  // Cleanup
  // ============================================

  dispose(): void {
    // Unsubscribe from kernel events
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Dispose edge mesh
    if (this.edgeMesh) {
      this.edgeMesh.dispose();
      this.edgeMesh = null;
    }

    // Dispose vertex meshes
    for (const mesh of this.vertexMeshMap.values()) {
      mesh.dispose();
    }
    this.vertexMeshMap.clear();

    // Dispose face meshes
    for (const mesh of this.faceMeshMap.values()) {
      mesh.dispose();
    }
    this.faceMeshMap.clear();

    // Dispose normal lines
    if (this.normalLines) {
      this.normalLines.dispose();
      this.normalLines = null;
    }

    // Dispose materials
    if (this.edgeMaterial) {
      this.edgeMaterial.dispose();
      this.edgeMaterial = null;
    }
    if (this.vertexMaterial) {
      this.vertexMaterial.dispose();
      this.vertexMaterial = null;
    }
    if (this.faceMaterial) {
      this.faceMaterial.dispose();
      this.faceMaterial = null;
    }
  }

  // ============================================
  // Getters
  // ============================================

  get dirty(): boolean {
    return this.isDirty;
  }

  getEdgeMesh(): LinesMesh | null {
    return this.edgeMesh;
  }

  getFaceMeshes(): Map<FaceID, Mesh> {
    return new Map(this.faceMeshMap);
  }

  getVertexMeshes(): Map<VertexID, Mesh> {
    return new Map(this.vertexMeshMap);
  }
}
