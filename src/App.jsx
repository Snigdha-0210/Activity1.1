import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment";
import { PMREMGenerator } from "three";
import { MolecularViewSystem } from "./systems/MolecularViewSystem.js";
import Sidebar from "./components/Sidebar.jsx";
import "./components/Sidebar.css";
import "./App.css";

const CAMERA_POSITION = new THREE.Vector3(0, 10, 15);

function App() {
  const mountRef = useRef(null);
  const pointerHitRef = useRef(null);
  const sceneRef = useRef(null);
  const updatePointerHitRef = useRef(null);
  const envMapRef = useRef(null);
  
  // Experiment State
  // 0: Need Beaker, 1: Need Water, 2: Need Marker, 3: Need Salt, 4: Need Rod, 5: Done
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);
  const [tooltip, setTooltip] = useState("");
  const [isMolecularView, setIsMolecularView] = useState(false);

  const showTooltipMessage = (msg) => {
    setTooltip(msg);
    setTimeout(() => setTooltip(""), 8000);
  };

  const getObjectiveText = () => {
    switch (step) {
      case 0: return "Drag the Glass Beaker onto the table.";
      case 1: return "Click the 'Add Water' button to fill it halfway.";
      case 2: return "Click the 'Mark Level' button to mark the water height.";
      case 3: return "Drag the Salt into the beaker.";
      case 4: return "Drag the Rod into the beaker to stir the solution.";
      case 5: return "SUCCESS! The salt dissolved, filling the spaces between water particles. The water level did not rise!";
      default: return "";
    }
  };

  // Scene references
  const beakerGroupRef = useRef(null);
  const waterMeshRef = useRef(null);
  const saltMeshRef = useRef(null);
  const rodMeshRef = useRef(null);
  const beakerSizeRef = useRef(new THREE.Vector3(1,1,1));
  const molecularSystemRef = useRef(null);
  
  // Animation state
  const animStateRef = useRef({ type: 'IDLE', progress: 0 });

  useEffect(() => {
    if (!mountRef.current) return;
    while (mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f162e);
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
    const initialWidth = mountRef.current.clientWidth || window.innerWidth;
    const initialHeight = mountRef.current.clientHeight || window.innerHeight;
    renderer.setSize(initialWidth, initialHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mountRef.current.appendChild(renderer.domElement);

    const pmremGenerator = new PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    envMapRef.current = envTex;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(75, initialWidth / initialHeight, 0.1, 1000);
    camera.position.copy(CAMERA_POSITION);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2;
    controls.target.set(0, 0, 0);
    controls.update();

    const molecularSystem = new MolecularViewSystem(scene, camera, controls);
    molecularSystemRef.current = molecularSystem;

    const grid = new THREE.GridHelper(20, 20, 0x888888, 0x444444);
    grid.material.opacity = 0.5;
    grid.material.transparent = true;
    scene.add(grid);

    const dropPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    dropPlane.rotation.x = -Math.PI / 2;
    scene.add(dropPlane);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const updatePointerHit = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hit = raycaster.intersectObject(dropPlane, true)[0];
      if (hit) pointerHitRef.current = hit.point.clone();
    };

    updatePointerHitRef.current = updatePointerHit;
    renderer.domElement.addEventListener("pointermove", updatePointerHit);
    renderer.domElement.addEventListener("dragover", (e) => {
       e.preventDefault();
       e.dataTransfer.dropEffect = "copy";
       updatePointerHit(e);
    });

    const handleDrop = (e) => {
      e.preventDefault();
      updatePointerHit(e);
      const dropPoint = pointerHitRef.current;
      if (!dropPoint) return;
      try {
        const data = JSON.parse(e.dataTransfer.getData("component"));
        if (data?.type) attemptPlacement(data.type, dropPoint);
      } catch (err) {}
    };
    renderer.domElement.addEventListener("drop", handleDrop);

    const handleResize = () => {
      const width = mountRef.current?.clientWidth || window.innerWidth;
      const height = mountRef.current?.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", handleResize);

    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();

      // Stirring animation
      if (animStateRef.current.type === 'STIR' && rodMeshRef.current) {
         animStateRef.current.progress += 0.05;
         const p = animStateRef.current.progress;
         
         // Circular stirring motion
         const radius = beakerSizeRef.current.x * 0.15;
         rodMeshRef.current.position.x = Math.cos(p * 2) * radius;
         rodMeshRef.current.position.z = Math.sin(p * 2) * radius;
         rodMeshRef.current.rotation.x = Math.PI / 8; // slight tilt
         rodMeshRef.current.rotation.z = Math.sin(p * 2) * 0.2;
         rodMeshRef.current.rotation.y = -p * 2;
         
         // Fade out salt
         if (saltMeshRef.current) {
            saltMeshRef.current.scale.setScalar(Math.max(0, 1 - (p / 20)));
         }

         // Stop stirring after a while
         if (p > 20) {
             animStateRef.current.type = 'IDLE';
             if (saltMeshRef.current) {
                 beakerGroupRef.current.remove(saltMeshRef.current);
                 saltMeshRef.current = null;
             }
             setStep(5);
             setScore(s => s + 50);
             showTooltipMessage("Discovery: The salt ions slipped into the microscopic spaces between the water molecules! The water level didn't increase.");
         }
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointermove", updatePointerHit);
      renderer.domElement.removeEventListener("drop", handleDrop);
      molecularSystemRef.current?.dispose();
      sceneRef.current = null;
      controls.dispose();
      renderer.dispose();
      if (mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  const gltfLoaderRef = useRef(null);
  useEffect(() => {
    gltfLoaderRef.current = new GLTFLoader();
    return () => { gltfLoaderRef.current = null; };
  }, []);

  const setupMaterial = (mesh) => {
    if (mesh.material) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach(m => {
        m.envMap = envMapRef.current;
        m.envMapIntensity = 1.0;
        m.needsUpdate = true;
      });
    }
  };

  const attemptPlacement = (type, point) => {
      // Direct access to state via refs would be better, but we can just use the state variable `step` since this function is recreated (or we shouldn't recreate it, wait, it uses stale closure if we aren't careful. Let's use a function update for step, or just trust it since we only drop once per step).
      setStep(currentStep => {
          if (currentStep === 0 && type === 'glass_beaker') {
             loadModel('/glass_beaker.glb', type, point, currentStep);
             return 1;
          } else if (currentStep === 3 && type === 'salt') {
             loadModel('/Salt.glb', type, point, currentStep);
             return 4;
          } else if (currentStep === 4 && type === 'rod') {
             loadModel('/Rod.glb', type, point, currentStep);
             return 4; // Keep at 4 until animation finishes
          }
          return currentStep; // Ignore incorrect items
      });
  };

  const loadModel = (url, type, point, currentStep) => {
      const scene = sceneRef.current;
      if (!scene || !gltfLoaderRef.current) return;

      gltfLoaderRef.current.load(url, (gltf) => {
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          box.getSize(size);
          const center = new THREE.Vector3();
          box.getCenter(center);
          
          let scaleMultiplier = 1.0;
          if (type === 'glass_beaker') scaleMultiplier = 1.5;
          if (type === 'rod') scaleMultiplier = 1.5;
          if (type === 'salt') scaleMultiplier = 0.5;

          const maxDim = Math.max(size.x, size.y, size.z);
          const scaleFactor = (3.0 * scaleMultiplier) / maxDim;
          
          model.position.copy(center).negate().multiplyScalar(scaleFactor);
          model.scale.set(scaleFactor, scaleFactor, scaleFactor);
          
          if (type === 'rod') {
             model.rotation.x = Math.PI / 2; // Rotate the rod to be vertical
          }
          
          model.traverse(child => { if (child.isMesh) setupMaterial(child); });
          
          const group = new THREE.Group();
          group.add(model);
          
          if (type === 'glass_beaker') {
             group.position.copy(point);
             group.position.y = (size.y * scaleFactor) / 2;
             scene.add(group);
             beakerGroupRef.current = group;
             
             const scaledSize = new THREE.Vector3(size.x * scaleFactor, size.y * scaleFactor, size.z * scaleFactor);
             beakerSizeRef.current = scaledSize;
             setScore(s => s + 25);
          } else if (type === 'salt') {
             // Add inside the beaker
             group.position.set(0, -(beakerSizeRef.current.y * 0.4), 0);
             beakerGroupRef.current.add(group);
             saltMeshRef.current = group;
             setScore(s => s + 25);
             showTooltipMessage("Fact: Salt crystals are composed of sodium and chloride ions that break apart in water.");
          } else if (type === 'rod') {
             // Add inside the beaker, sticking out
             group.position.set(0, beakerSizeRef.current.y * 0.2, 0);
             beakerGroupRef.current.add(group);
             rodMeshRef.current = group;
             animStateRef.current = { type: 'STIR', progress: 0 };
             setScore(s => s + 25);
          }
      }, undefined, (error) => {
          console.error(`Error loading ${url}:`, error);
      });
  };

  const handleAddWater = () => {
      if (step !== 1 || !beakerGroupRef.current) return;
      
      const size = beakerSizeRef.current;
      // Procedural water inside beaker
      const waterHeight = size.y * 0.5; // halfway
      const waterRadius = size.x * 0.35; // approx inner radius
      
      const waterGeo = new THREE.CylinderGeometry(waterRadius, waterRadius, waterHeight, 32);
      const waterMat = new THREE.MeshPhysicalMaterial({
          color: 0x44aaff,
          transparent: true,
          opacity: 0.6,
          roughness: 0.1,
          transmission: 0.9,
      });
      const water = new THREE.Mesh(waterGeo, waterMat);
      
      // Position inside the beaker (bottom aligned)
      water.position.set(0, -(size.y / 2) + (waterHeight / 2) + 0.2, 0); // slight offset from bottom
      beakerGroupRef.current.add(water);
      waterMeshRef.current = water;
      
      setScore(s => s + 25);
      setStep(2);
  };

  const handleMarkLevel = () => {
      if (step !== 2 || !waterMeshRef.current || !beakerGroupRef.current) return;
      
      const size = beakerSizeRef.current;
      const waterHeight = size.y * 0.5;
      const waterRadius = size.x * 0.36; // Slightly larger than water to be visible on glass
      
      const markerGeo = new THREE.TorusGeometry(waterRadius, 0.05, 8, 32);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      
      // Position at the top of the water level
      marker.rotation.x = Math.PI / 2;
      marker.position.set(0, -(size.y / 2) + waterHeight + 0.2, 0);
      beakerGroupRef.current.add(marker);
      
      setScore(s => s + 25);
      setStep(3);
      showTooltipMessage("Concept Unlocked: We mark the level to establish a baseline for our volume measurement.");
  };

  const handleToggleMolecularView = () => {
      if (!molecularSystemRef.current || !beakerGroupRef.current) return;
      if (isMolecularView) {
          molecularSystemRef.current.exitMolecularView();
          setIsMolecularView(false);
      } else {
          molecularSystemRef.current.enterMolecularView('salt', beakerGroupRef.current.position, 50);
          setIsMolecularView(true);
      }
  };

  const handleDragStart = (e, componentData) => {
    e.dataTransfer.setData("component", JSON.stringify(componentData));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="app-shell">
      <Sidebar title="Lab Equipment" position="left">
        <div className="component-list">
          <div className="component-item" draggable onDragStart={(e) => handleDragStart(e, { type: "glass_beaker" })}>
            <span className="component-name"><span className="component-icon">🧪</span>Glass Beaker</span>
          </div>
          <div className="component-item" draggable onDragStart={(e) => handleDragStart(e, { type: "rod" })}>
            <span className="component-name"><span className="component-icon">🪄</span>Rod</span>
          </div>
          <div className="component-item" draggable onDragStart={(e) => handleDragStart(e, { type: "salt" })}>
            <span className="component-name"><span className="component-icon">🧂</span>Salt</span>
          </div>
        </div>
      </Sidebar>

      {/* Gamification Overlay */}
      <div className="gamification-overlay">
         <div className="progress-container">
            <div className="progress-bar" style={{ width: `${(step / 5) * 100}%` }}></div>
         </div>
         <div className="score-board">
            <h2>Score: <span className="score-value">{score}</span></h2>
         </div>
         <div className="objective-board">
            <h3>Step {step === 5 ? 'Completed' : step + 1}</h3>
            <p>{getObjectiveText()}</p>
         </div>

         <div className="controls-board">
            {step === 1 && (
               <button className="btn slow-btn" onClick={handleAddWater}>Fill Halfway with Water</button>
            )}
            {step === 2 && (
               <button className="btn flick-btn" onClick={handleMarkLevel}>Mark Water Level</button>
            )}
            {step === 5 && (
               <button className="btn action-btn molecular-btn" onClick={handleToggleMolecularView}>
                  {isMolecularView ? '🔙 Return to Normal View' : '🔬 Zoom to Molecular View'}
               </button>
            )}
         </div>
      </div>
      
      {/* Tooltip Overlay */}
      {tooltip && (
          <div className="concept-tooltip">
             <div className="tooltip-icon">💡</div>
             <div className="tooltip-text">{tooltip}</div>
          </div>
      )}

      <div ref={mountRef} className="canvas-shell" />
    </div>
  );
}

export default App;
