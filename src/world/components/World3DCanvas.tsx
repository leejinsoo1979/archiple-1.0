import React, { useEffect, useRef, useState } from 'react';
import {
    Engine,
    Scene,
    Vector3,
    Color3,
    Color4,
    HemisphericLight,
    DirectionalLight,
    ArcRotateCamera,
    MeshBuilder,
    StandardMaterial,
    Texture,
    CubeTexture
} from '@babylonjs/core';
import '@babylonjs/loaders'; // Import loaders for GLB/GLTF

interface World3DCanvasProps {
    onSceneReady?: (scene: Scene) => void;
    viewMode?: '2D' | '3D';
}

export const World3DCanvas: React.FC<World3DCanvasProps> = ({
    onSceneReady,
    viewMode = '3D'
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const sceneRef = useRef<Scene | null>(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        // Initialize Engine and Scene
        const engine = new Engine(canvasRef.current, true, {
            preserveDrawingBuffer: true,
            stencil: true,
        });
        engineRef.current = engine;

        const scene = new Scene(engine);
        sceneRef.current = scene;

        // Clear color (Sky blue-ish for world editor)
        scene.clearColor = new Color4(0.8, 0.9, 1, 1);

        // --- Lighting ---
        // Hemispheric light (Ambient)
        const hemiLight = new HemisphericLight("hemiLight", new Vector3(0, 1, 0), scene);
        hemiLight.intensity = 0.6;
        hemiLight.groundColor = new Color3(0.2, 0.2, 0.2); // Darker ground ambient

        // Directional light (Sun)
        const sunLight = new DirectionalLight("sunLight", new Vector3(-1, -2, -1), scene);
        sunLight.intensity = 1.5;
        sunLight.position = new Vector3(100, 200, 100);

        // Shadows (Basic)
        // const shadowGenerator = new ShadowGenerator(2048, sunLight);
        // shadowGenerator.useBlurExponentialShadowMap = true;

        // --- Camera ---
        // ArcRotateCamera for World Editor (Orbiting a target point on the ground)
        const camera = new ArcRotateCamera(
            "WorldCamera",
            0,
            Math.PI / 3,
            100, // Distance (Zoom)
            Vector3.Zero(),
            scene
        );
        camera.attachControl(canvasRef.current, true);
        camera.lowerRadiusLimit = 10;
        camera.upperRadiusLimit = 1000; // Allow zooming out far for city view
        camera.wheelPrecision = 50; // Faster zoom
        camera.panningSensibility = 50; // Faster panning

        // --- Environment ---
        // 1. Large Ground Plane (Infinite-like)
        const ground = MeshBuilder.CreateGround("worldGround", { width: 2000, height: 2000 }, scene);
        const groundMat = new StandardMaterial("groundMat", scene);
        groundMat.diffuseColor = new Color3(0.3, 0.35, 0.3); // Grass green-ish
        groundMat.specularColor = new Color3(0, 0, 0); // No shine
        // Add a grid texture if possible, or just a color for now
        ground.material = groundMat;
        ground.receiveShadows = true;

        // 2. Skybox
        const skybox = MeshBuilder.CreateBox("skyBox", { size: 2000.0 }, scene);
        const skyboxMaterial = new StandardMaterial("skyBox", scene);
        skyboxMaterial.backFaceCulling = false;
        skyboxMaterial.reflectionTexture = new CubeTexture("https://playground.babylonjs.com/textures/skybox", scene);
        skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
        skyboxMaterial.diffuseColor = new Color3(0, 0, 0);
        skyboxMaterial.specularColor = new Color3(0, 0, 0);
        skybox.material = skyboxMaterial;

        // --- Render Loop ---
        engine.runRenderLoop(() => {
            scene.render();
        });

        // --- Resize Handling ---
        const handleResize = () => {
            engine.resize();
        };
        window.addEventListener('resize', handleResize);

        // Notify parent
        if (onSceneReady) {
            onSceneReady(scene);
        }

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            scene.dispose();
            engine.dispose();
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', outline: 'none' }}
        />
    );
};
