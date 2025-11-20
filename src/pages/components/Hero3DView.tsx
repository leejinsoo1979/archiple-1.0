import React, { useEffect, useRef } from 'react';
import * as BABYLON from '@babylonjs/core';


const Hero3DView: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        const engine = new BABYLON.Engine(canvasRef.current, true, { preserveDrawingBuffer: true, stencil: true });
        const scene = new BABYLON.Scene(engine);

        // Transparent background
        scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);

        // Camera
        const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 10, new BABYLON.Vector3(0, 0, 0), scene);
        camera.attachControl(canvasRef.current, true);
        camera.wheelPrecision = 50;
        camera.lowerRadiusLimit = 8;
        camera.upperRadiusLimit = 20;

        // Auto-rotate
        scene.registerBeforeRender(() => {
            camera.alpha += 0.002;
        });

        // Lighting
        const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
        light.intensity = 0.8;

        const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), scene);
        dirLight.position = new BABYLON.Vector3(20, 40, 20);
        dirLight.intensity = 0.7;

        // Materials
        const wallMat = new BABYLON.PBRMaterial("wallMat", scene);
        wallMat.albedoColor = new BABYLON.Color3(0.1, 0.1, 0.12);
        wallMat.metallic = 0.1;
        wallMat.roughness = 0.6;

        const floorMat = new BABYLON.PBRMaterial("floorMat", scene);
        floorMat.albedoColor = new BABYLON.Color3(0.05, 0.05, 0.06);
        floorMat.metallic = 0.2;
        floorMat.roughness = 0.5;

        const accentMat = new BABYLON.PBRMaterial("accentMat", scene);
        accentMat.albedoColor = BABYLON.Color3.FromHexString("#3dbc58");
        accentMat.metallic = 0.1;
        accentMat.roughness = 0.3;
        accentMat.emissiveColor = BABYLON.Color3.FromHexString("#3dbc58").scale(0.2);

        // Geometry - Simple Room
        const floor = BABYLON.MeshBuilder.CreateBox("floor", { width: 8, height: 0.2, depth: 8 }, scene);
        floor.position.y = -0.1;
        floor.material = floorMat;

        const wall1 = BABYLON.MeshBuilder.CreateBox("wall1", { width: 8, height: 4, depth: 0.2 }, scene);
        wall1.position.z = 4;
        wall1.position.y = 2;
        wall1.material = wallMat;

        const wall2 = BABYLON.MeshBuilder.CreateBox("wall2", { width: 0.2, height: 4, depth: 8 }, scene);
        wall2.position.x = -4;
        wall2.position.y = 2;
        wall2.material = wallMat;

        // Abstract Furniture
        const tableTop = BABYLON.MeshBuilder.CreateBox("tableTop", { width: 3, height: 0.1, depth: 1.5 }, scene);
        tableTop.position.y = 1.2;
        tableTop.material = accentMat;

        const leg1 = BABYLON.MeshBuilder.CreateCylinder("leg1", { height: 1.2, diameter: 0.1 }, scene);
        leg1.position = new BABYLON.Vector3(-1.2, 0.6, -0.5);
        leg1.material = wallMat;

        const leg2 = BABYLON.MeshBuilder.CreateCylinder("leg2", { height: 1.2, diameter: 0.1 }, scene);
        leg2.position = new BABYLON.Vector3(1.2, 0.6, -0.5);
        leg2.material = wallMat;

        const leg3 = BABYLON.MeshBuilder.CreateCylinder("leg3", { height: 1.2, diameter: 0.1 }, scene);
        leg3.position = new BABYLON.Vector3(-1.2, 0.6, 0.5);
        leg3.material = wallMat;

        const leg4 = BABYLON.MeshBuilder.CreateCylinder("leg4", { height: 1.2, diameter: 0.1 }, scene);
        leg4.position = new BABYLON.Vector3(1.2, 0.6, 0.5);
        leg4.material = wallMat;

        // Glow Layer
        const gl = new BABYLON.GlowLayer("glow", scene);
        gl.intensity = 0.6;

        engine.runRenderLoop(() => {
            scene.render();
        });

        const handleResize = () => {
            engine.resize();
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            scene.dispose();
            engine.dispose();
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: '100%',
                height: '100%',
                outline: 'none',
                cursor: 'grab'
            }}
        />
    );
};

export default Hero3DView;
