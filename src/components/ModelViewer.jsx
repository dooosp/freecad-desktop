import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

function disposeMaterial(material) {
  if (!material) return;
  const mats = Array.isArray(material) ? material : [material];
  for (const mat of mats) {
    for (const value of Object.values(mat)) {
      if (value && typeof value === 'object' && typeof value.dispose === 'function') {
        value.dispose();
      }
    }
    mat.dispose?.();
  }
}

function disposeMesh(mesh, scene) {
  if (!mesh) return;
  scene?.remove(mesh);
  mesh.geometry?.dispose?.();
  disposeMaterial(mesh.material);
}

export default function ModelViewer({ stlPath }) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const meshRef = useRef(null);
  const frameRef = useRef(null);
  const [wireframe, setWireframe] = useState(false);
  const [info, setInfo] = useState(null);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      10000
    );
    camera.position.set(100, 100, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Lighting
    const ambient = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(100, 200, 100);
    scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0x8888ff, 0.5);
    backLight.position.set(-100, -100, -100);
    scene.add(backLight);

    // Grid
    const grid = new THREE.GridHelper(200, 20, 0x444466, 0x333355);
    scene.add(grid);

    // Animation loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', handleResize);
      if (typeof controlsRef.current?.dispose === 'function') {
        controlsRef.current.dispose();
      }
      disposeMesh(meshRef.current, scene);
      meshRef.current = null;
      if (typeof scene?.traverse === 'function') {
        scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.geometry?.dispose?.();
            disposeMaterial(obj.material);
          }
        });
      }
      renderer.renderLists?.dispose?.();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Load STL model
  useEffect(() => {
    if (!stlPath || !sceneRef.current) return;

    // Remove previous mesh
    if (meshRef.current) {
      disposeMesh(meshRef.current, sceneRef.current);
      meshRef.current = null;
    }

    const loader = new STLLoader();
    // Convert Windows path to artifact URL
    const url = `/artifacts/${stlPath.split(/[\\/]/).pop()}`;

    loader.load(url, (geometry) => {
      geometry.computeBoundingBox();
      geometry.center();

      const material = new THREE.MeshPhongMaterial({
        color: 0x6699cc,
        specular: 0x111111,
        shininess: 80,
        wireframe: wireframe,
      });
      const mesh = new THREE.Mesh(geometry, material);
      sceneRef.current.add(mesh);
      meshRef.current = mesh;

      // Auto-fit camera
      const box = geometry.boundingBox;
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const cam = cameraRef.current;
      cam.position.set(maxDim * 1.5, maxDim * 1.2, maxDim * 1.5);
      cam.lookAt(0, 0, 0);
      controlsRef.current.target.set(0, 0, 0);

      // Bounding box info
      setInfo({
        dimensions: `${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} mm`,
        faces: geometry.attributes.position.count / 3,
      });
    }, undefined, (err) => {
      console.error('STL load error:', err);
    });
  }, [stlPath]);

  // Update wireframe
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.material.wireframe = wireframe;
    }
  }, [wireframe]);

  return (
    <div className="model-viewer">
      <div className="viewer-toolbar">
        <button
          className={`btn-icon ${wireframe ? 'active' : ''}`}
          onClick={() => setWireframe(!wireframe)}
          title="Wireframe"
        >
          &#9637;
        </button>
        <button
          className="btn-icon"
          onClick={() => {
            if (cameraRef.current && meshRef.current) {
              const box = meshRef.current.geometry.boundingBox;
              const size = new THREE.Vector3();
              box.getSize(size);
              const maxDim = Math.max(size.x, size.y, size.z);
              cameraRef.current.position.set(maxDim * 1.5, maxDim * 1.2, maxDim * 1.5);
              controlsRef.current.target.set(0, 0, 0);
            }
          }}
          title="Reset View"
        >
          &#8634;
        </button>
      </div>
      <div ref={containerRef} className="viewer-canvas" />
      {info && (
        <div className="viewer-info">
          <span>{info.dimensions}</span>
          <span>{info.faces.toLocaleString()} faces</span>
        </div>
      )}
      {!stlPath && (
        <div className="viewer-placeholder">
          <p>Load a config and run analysis to view the 3D model</p>
        </div>
      )}
    </div>
  );
}
