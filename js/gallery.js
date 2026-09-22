import * as THREE from "../vendor/three.module.min.js";
import { GLTFLoader } from "../vendor/GLTFLoader.js";

const MODEL_URLS = {
  room: "models/art_gallery.glb",
  roomAlt: "models/gallery_round_flatfloor_baked.glb",
  roomDiorama: "models/room_diorama_model.glb",
  diningRoom: "models/dining_room__kichen_baked.glb",
  earth: "models/planet_earth.glb",
  greeting: "models/greeting_waving_110_frames_loop.glb",
  walk: "models/male_slow_walk_40_frames_loop.glb",
  jog: "models/male_jogging_30_frames_loop.glb"
};

const MODEL_WEIGHTS = {
  [MODEL_URLS.room]: 13586552,
  [MODEL_URLS.roomAlt]: 16409036,
  [MODEL_URLS.roomDiorama]: 5305888,
  [MODEL_URLS.diningRoom]: 27052900,
  [MODEL_URLS.earth]: 6703016,
  [MODEL_URLS.greeting]: 435796,
  [MODEL_URLS.walk]: 348828,
  [MODEL_URLS.jog]: 331568
};

const CAMERA_MIN_DISTANCE = 2.55;
const CAMERA_MAX_DISTANCE = 4.15;
const ACTION_INTERACTION_DISTANCE = 34;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeModel(model, targetHeight) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const height = Math.max(0.001, size.y);
  const scale = targetHeight / height;
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = scaledBox.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= scaledBox.min.y;
  model.updateMatrixWorld(true);
  return model;
}

function hasMaterialNamed(object, name) {
  if (!object?.material) return false;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.some((material) => material?.name === name);
}

function getVisibleMeshBounds(object) {
  const bounds = new THREE.Box3();
  const meshBounds = new THREE.Box3();

  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if (!child.isMesh || !child.visible || !child.geometry) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    if (!child.geometry.boundingBox) return;
    meshBounds.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
    bounds.union(meshBounds);
  });

  return bounds;
}

function getMaterialBounds(object, materialName) {
  const bounds = new THREE.Box3();

  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if (!child.isMesh || !child.visible || !child.geometry || !hasMaterialNamed(child, materialName)) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    if (!child.geometry.boundingBox) return;
    bounds.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
  });

  return bounds;
}

function makeLabelTexture(project) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 640;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const draw = (image) => {
    const gradient = context.createLinearGradient(0, 0, 1024, 640);
    gradient.addColorStop(0, "#061722");
    gradient.addColorStop(1, "#02070b");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 640);

    if (image) {
      const imageRatio = image.width / image.height;
      const targetRatio = 1024 / 640;
      let sx = 0;
      let sy = 0;
      let sw = image.width;
      let sh = image.height;
      if (imageRatio > targetRatio) {
        sw = image.height * targetRatio;
        sx = (image.width - sw) * 0.5;
      } else {
        sh = image.width / targetRatio;
        sy = (image.height - sh) * 0.5;
      }
      context.globalAlpha = 0.46;
      context.drawImage(image, sx, sy, sw, sh, 0, 0, 1024, 640);
      context.globalAlpha = 1;
      context.fillStyle = "rgba(1, 7, 11, 0.56)";
      context.fillRect(0, 0, 1024, 640);
    }

    context.strokeStyle = "rgba(217, 233, 248, 0.75)";
    context.lineWidth = 3;
    context.strokeRect(28, 28, 968, 584);
    context.strokeStyle = "rgba(88, 222, 234, 0.36)";
    context.lineWidth = 1;
    context.strokeRect(44, 44, 936, 552);

    context.fillStyle = "#91a8bb";
    context.font = "500 24px Bahnschrift, sans-serif";
    context.letterSpacing = "8px";
    context.fillText(`LAB ${project.lab} / ${project.short}`, 72, 106);

    context.fillStyle = "#f2f8ff";
    context.font = "300 58px Microsoft YaHei UI, sans-serif";
    context.fillText(project.title, 72, 334);

    context.fillStyle = "#75e7ef";
    context.font = "400 20px Bahnschrift, sans-serif";
    context.fillText(project.kicker, 74, 382);

    context.fillStyle = "rgba(215, 229, 241, 0.72)";
    context.font = "400 22px Microsoft YaHei UI, sans-serif";
    context.fillText("靠近并点击进入作品", 74, 540);

    context.fillStyle = "#f0a35f";
    context.fillRect(72, 570, 128, 3);
    texture.needsUpdate = true;
  };

  draw(null);
  const image = new Image();
  image.onload = () => draw(image);
  image.src = project.image;
  return texture;
}

function makeActionLabel(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  context.fillStyle = "rgba(2, 8, 12, 0.76)";
  context.strokeStyle = color;
  context.lineWidth = 2;
  const x = 24;
  const y = 32;
  const width = 464;
  const height = 84;
  const radius = 24;
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = color;
  context.font = "600 34px Microsoft YaHei UI, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 74);

  texture.needsUpdate = true;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  }));
  label.scale.set(1.18, 0.37, 1);
  label.renderOrder = 100;
  return label;
}

export class GalleryExperience {
  constructor(options) {
    this.renderer = options.renderer;
    this.canvas = this.renderer.domElement;
    this.projects = options.projects;
    this.onFocusProject = options.onFocusProject;
    this.onExit = options.onExit;
    this.mobileStick = options.mobileStick;
    this.mobileKnob = options.mobileKnob;
    this.mobileRunButton = options.mobileRunButton;
    this.active = false;
    this.loaded = false;
    this.loadingPromise = null;
    this.keys = new Set();
    this.joystick = new THREE.Vector2();
    this.mobileRunning = false;
    this.dragging = false;
    this.dragDistance = 0;
    this.hoveredProject = null;
    this.hoveredAction = null;
    this.frameMeshes = [];
    this.frameGroups = [];
    this.actionMeshes = [];
    this.ringMode = false;
    this.roomScenes = [];
    this.roomSceneIndex = 0;
    this.currentRoomConfig = null;
    this.desktopProjectIndex = 0;
    this.clock = new THREE.Clock();
    this.cameraYaw = 0;
    this.cameraPitch = 0;
    this.cameraDistance = 2;
    this.cameraDistanceLimits = {
      min: CAMERA_MIN_DISTANCE,
      max: CAMERA_MAX_DISTANCE
    };
    this.raycaster = new THREE.Raycaster();
    this.centerPointer = new THREE.Vector2(0, 0);
    this.pointer = new THREE.Vector2();
    this.animate = this.animate.bind(this);
    this.resize = this.resize.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.initializeScene();
    this.bindControls();
    window.requestAnimationFrame(this.animate);
  }

  initializeScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06090d);
    this.scene.fog = new THREE.FogExp2(0x080b0f, 0.022);
    this.camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.05, 180);

    const hemisphere = new THREE.HemisphereLight(0xdce8f4, 0x171b20, 1.15);
    this.scene.add(hemisphere);
    const key = new THREE.DirectionalLight(0xf5f0e8, 1.35);
    key.position.set(4, 9, 7);
    this.scene.add(key);
    const coolFill = new THREE.PointLight(0x77d9e8, 4.8, 18, 2);
    coolFill.position.set(-5, 3.2, 1);
    this.scene.add(coolFill);
    const warmFill = new THREE.PointLight(0xffb06c, 3.6, 16, 2);
    warmFill.position.set(5, 2.8, -3);
    this.scene.add(warmFill);
  }

  bindControls() {
    window.addEventListener("resize", this.resize, { passive: true });
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("wheel", (event) => {
      if (!this.active) return;
      event.preventDefault();
      this.adjustCameraDistance(event.deltaY * 0.0024);
    }, { passive: false });
    this.bindMobileControls();
  }

  bindMobileControls() {
    if (!this.mobileStick || !this.mobileKnob) return;
    let pointerId = null;
    const updateStick = (event) => {
      const rect = this.mobileStick.getBoundingClientRect();
      const x = event.clientX - (rect.left + rect.width * 0.5);
      const y = event.clientY - (rect.top + rect.height * 0.5);
      const max = rect.width * 0.34;
      const length = Math.hypot(x, y) || 1;
      const scale = Math.min(1, max / length);
      const px = x * scale;
      const py = y * scale;
      this.mobileKnob.style.transform = `translate(${px}px, ${py}px)`;
      this.joystick.set(px / max, -py / max);
    };
    this.mobileStick.addEventListener("pointerdown", (event) => {
      if (!this.active) return;
      if (this.greetingActive) this.switchFromGreeting();
      pointerId = event.pointerId;
      this.mobileStick.setPointerCapture(pointerId);
      updateStick(event);
    });
    this.mobileStick.addEventListener("pointermove", (event) => {
      if (event.pointerId === pointerId) updateStick(event);
    });
    const release = (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      this.joystick.set(0, 0);
      this.mobileKnob.style.transform = "translate(0, 0)";
    };
    this.mobileStick.addEventListener("pointerup", release);
    this.mobileStick.addEventListener("pointercancel", release);
    this.mobileRunButton?.addEventListener("click", () => {
      this.mobileRunning = !this.mobileRunning;
      this.mobileRunButton.setAttribute("aria-pressed", String(this.mobileRunning));
    });
  }

  handleKeyDown(event) {
    if (!this.active) return;
    if (this.greetingActive) this.switchFromGreeting();
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(event.code)) {
      this.keys.add(event.code);
      event.preventDefault();
    }
    if (["Equal", "NumpadAdd"].includes(event.code)) {
      event.preventDefault();
      this.adjustCameraDistance(-0.22);
    }
    if (["Minus", "NumpadSubtract"].includes(event.code)) {
      event.preventDefault();
      this.adjustCameraDistance(0.22);
    }
    if ((event.code === "KeyE" || event.code === "Enter") && this.hoveredAction === "nextDesktopProject") {
      event.preventDefault();
      this.showNextDesktopProject();
    } else if ((event.code === "KeyE" || event.code === "Enter") && this.hoveredAction === "openDesktopProject") {
      event.preventDefault();
      this.openProject(this.getActiveDesktopProject());
    } else if ((event.code === "KeyE" || event.code === "Enter") && this.hoveredProject) {
      event.preventDefault();
      this.openProject(this.hoveredProject);
    }
    if (event.code === "Escape") this.onExit?.();
  }

  handleKeyUp(event) {
    this.keys.delete(event.code);
  }

  handlePointerDown(event) {
    if (!this.active || event.pointerType === "touch" || event.button !== 0) return;
    if (this.greetingActive) this.switchFromGreeting();
    this.dragging = true;
    this.dragDistance = 0;
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.canvas.setPointerCapture?.(event.pointerId);
  }

  handlePointerMove(event) {
    if (!this.active || !this.dragging || !this.lastPointer) return;
    const dx = event.clientX - this.lastPointer.x;
    const dy = event.clientY - this.lastPointer.y;
    this.dragDistance += Math.abs(dx) + Math.abs(dy);
    this.cameraYaw -= dx * 0.0042;
    this.cameraPitch = clamp(this.cameraPitch + dy * 0.003, 0.08, 0.78);
    this.lastPointer = { x: event.clientX, y: event.clientY };
  }

  handlePointerUp(event) {
    if (!this.active || !this.dragging) return;
    this.dragging = false;
    if (this.dragDistance < 8) {
      const clickedAction = this.getPointerAction(event);
      const action = clickedAction || this.hoveredAction;
      if (action === "nextDesktopProject") {
        this.showNextDesktopProject();
      } else if (action === "openDesktopProject") {
        this.openProject(this.getActiveDesktopProject());
      } else if (this.hoveredProject) {
        this.openProject(this.hoveredProject);
      }
    }
    this.canvas.releasePointerCapture?.(event.pointerId);
  }

  getPointerAction(event) {
    if (!this.actionMeshes.length) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.actionMeshes, false);
    return intersections.length && intersections[0].distance < ACTION_INTERACTION_DISTANCE
      ? intersections[0].object.userData.action
      : null;
  }

  adjustCameraDistance(delta) {
    this.cameraDistance = clamp(
      this.cameraDistance + delta,
      this.cameraDistanceLimits.min,
      this.cameraDistanceLimits.max
    );
  }

  async load(onProgress) {
    if (this.loaded) {
      onProgress?.(1);
      return this;
    }
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      onProgress?.(0.02);
      const loader = new GLTFLoader();
      const progressByUrl = {};
      const totalBytes = Object.values(MODEL_WEIGHTS).reduce((sum, value) => sum + value, 0);

      const report = () => {
        const loadedBytes = Object.entries(MODEL_WEIGHTS).reduce((sum, [url, weight]) => {
          return sum + weight * (progressByUrl[url] || 0);
        }, 0);
        onProgress?.(clamp(loadedBytes / totalBytes, 0.02, 0.99));
      };

      const loadOne = (url) => new Promise((resolve, reject) => {
        loader.load(url, (gltf) => {
          progressByUrl[url] = 1;
          report();
          resolve(gltf);
        }, (event) => {
          progressByUrl[url] = event.total ? event.loaded / event.total : Math.min(0.9, event.loaded / MODEL_WEIGHTS[url]);
          report();
        }, reject);
      });

      const [room, roomAlt, roomDiorama, diningRoom, earth, greeting, walk, jog] = await Promise.all([
        loadOne(MODEL_URLS.room),
        loadOne(MODEL_URLS.roomAlt),
        loadOne(MODEL_URLS.roomDiorama),
        loadOne(MODEL_URLS.diningRoom),
        loadOne(MODEL_URLS.earth),
        loadOne(MODEL_URLS.greeting),
        loadOne(MODEL_URLS.walk),
        loadOne(MODEL_URLS.jog)
      ]);

      this.roomScenes = [
        { scene: room.scene, alternate: false, ringMode: false, preservePlayer: false, playerScale: 0.7 },
        { scene: roomAlt.scene, alternate: true, ringMode: true, preservePlayer: true, anchorToPlayer: true, playerScale: 0.7 },
        {
          scene: roomDiorama.scene,
          alternate: false,
          ringMode: false,
          desktopMode: true,
          preservePlayer: false,
          scaleMultiplier: 0.6,
          playerScale: 3.0,
          playerPosition: new THREE.Vector3(-2, 0.5, -0.52),
          playerRotationY: Math.PI * 0.2,
          cameraYaw: 0.78,
          cameraPitch: 0.28,
          cameraDistance: 20.12,
          cameraDistanceLimits: {
            min: 0.35,
            max: 80
          },
          earthPosition: new THREE.Vector3(-4.8, 0, -3.28),
          earthFloorOffset: 0.74,
          earthScale: 1.05
        },
        {
          scene: diningRoom.scene,
          alternate: false,
          ringMode: false,
          preservePlayer: false,
          scaleMultiplier: 0.8,
          projectFrameLayout: {
            zOffset: -13,
            lastTwoZOffset: -1.2,
            lastTwoRotationY: Math.PI * 0.5,
            xOffsetFrameWidthFactor: 0.5,
            firstFourXOffsetFrameWidthFactor: 0.5,
            lastTwoAxis: "z",
            lastTwoZSpacingFactor: 1.15
          },
          playerScale: 1.4,
          playerPosition: new THREE.Vector3(0.6, 0, 3.64),
          earthPosition: new THREE.Vector3(4, 0, -4.82),
          cameraYaw: 0.51,
          cameraPitch: 0.27,
          cameraDistance: 4.15,
          cameraDistanceLimits: {
            min: 0.35,
            max: 6.3
          }
        }
      ];
      this.roomSceneIndex = 0;
      this.currentRoomConfig = this.roomScenes[this.roomSceneIndex];
      this.setupRoom(this.roomScenes[this.roomSceneIndex].scene, this.roomScenes[this.roomSceneIndex]);
      this.setupEarth(earth);
      this.setupPlayer(walk, jog, greeting);
      this.createProjectFrames();
      this.loaded = true;
      onProgress?.(1);
      return this;
    })();

    try {
      return await this.loadingPromise;
    } catch (error) {
      this.loadingPromise = null;
      throw error;
    }
  }

  setupRoom(room, { alternate = false, anchor = null, scaleMultiplier = 1 } = {}) {
    if (!room.userData.lancySourceTransform) {
      room.userData.lancySourceTransform = {
        position: room.position.toArray(),
        scale: room.scale.toArray()
      };
    }
    room.position.fromArray(room.userData.lancySourceTransform.position);
    room.scale.fromArray(room.userData.lancySourceTransform.scale);

    if (alternate) {
      // The alternate asset ships with a large, very dark baked sky sphere.
      // It is decorative in the original viewer, but here it blocks the camera
      // and also corrupts the room dimensions used for scaling and navigation.
      room.traverse((child) => {
        if (hasMaterialNamed(child, "Skybox")) child.visible = false;
      });
    }

    room.updateMatrixWorld(true);
    let box = getVisibleMeshBounds(room);
    if (alternate) {
      room.scale.multiplyScalar(3);
    } else {
      const size = box.getSize(new THREE.Vector3());
      const horizontalSize = Math.max(size.x, size.z, 1);
      room.scale.multiplyScalar(24 / horizontalSize);
    }
    room.scale.multiplyScalar(scaleMultiplier);
    room.updateMatrixWorld(true);
    box = getVisibleMeshBounds(room);
    const roomAnchor = anchor || new THREE.Vector3(0, 0, 0);
    // The alternate model contains decorative geometry far outside the actual
    // gallery, so its full bounding-box center is not the room's usable center.
    // Anchor against the baked floor instead, placing the player in the room.
    const floorAnchorBounds = alternate ? getMaterialBounds(room, "Floor_baked") : box;
    const anchorBounds = floorAnchorBounds.isEmpty() ? box : floorAnchorBounds;
    const center = anchorBounds.getCenter(new THREE.Vector3());
    room.position.x += roomAnchor.x - center.x;
    room.position.z += roomAnchor.z - center.z;
    room.position.y += roomAnchor.y - (alternate ? anchorBounds.max.y : anchorBounds.min.y);
    room.updateMatrixWorld(true);

    room.traverse((child) => {
      if (!child.isMesh) return;
      child.receiveShadow = false;
      child.castShadow = false;
      if (child.material) {
        child.material.side = THREE.DoubleSide;
        child.material.needsUpdate = true;
      }
    });
    this.scene.add(room);
    this.room = room;
    this.roomBounds = getVisibleMeshBounds(room);
    const roomSize = this.roomBounds.getSize(new THREE.Vector3());
    if (alternate) {
      const floorBounds = getMaterialBounds(room, "Floor_baked");
      // The switched model is intentionally anchored by its bottom center to
      // the player's standing point, which is also the interaction floor.
      this.floorLevel = anchor ? anchor.y : (floorBounds.isEmpty() ? this.roomBounds.min.y : floorBounds.max.y);
    } else {
      // The default gallery asset contains foundation geometry below the visible floor.
      this.floorLevel = this.roomBounds.min.y + clamp(roomSize.y * 0.17, 0.72, 0.9);
    }
    this.walkBounds = {
      minX: this.roomBounds.min.x + Math.min(1.4, roomSize.x * 0.08),
      maxX: this.roomBounds.max.x - Math.min(1.4, roomSize.x * 0.08),
      minZ: this.roomBounds.min.z + Math.min(1.4, roomSize.z * 0.08),
      maxZ: this.roomBounds.max.z - Math.min(1.4, roomSize.z * 0.08)
    };
    window.__lancyGalleryBounds = {
      min: this.roomBounds.min.toArray(),
      max: this.roomBounds.max.toArray(),
      size: roomSize.toArray()
    };
  }

  setupEarth(gltf) {
    const earth = normalizeModel(gltf.scene, 2.45);
    const floor = this.floorLevel;
    earth.scale.multiplyScalar(2);
    earth.position.set(0, 0, 0);
    earth.updateMatrixWorld(true);
    const earthBounds = new THREE.Box3().setFromObject(earth);
    const earthCenter = earthBounds.getCenter(new THREE.Vector3());
    earth.position.set(-earthCenter.x, floor + 0.42 - earthBounds.min.y, -earthCenter.z);
    earth.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.metalness = Math.min(0.42, child.material.metalness || 0);
        // 提升模型亮度：设置基础自发光
        child.material.emissive = new THREE.Color(0x3c3c3c);
        child.material.emissiveIntensity = 1.5;
        child.material.needsUpdate = true;

        // 隐藏模型自带的扁平底座/圆盘
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        const size = child.geometry.boundingBox.getSize(new THREE.Vector3());
        const heightRatio = size.y / Math.max(size.x, size.z, 0.001);
        if (heightRatio < 0.15 && size.y < 0.1) {
          child.visible = false;
        }
      }
    });
    // 为地球增加专用补光，集中在模型位置
    const earthFillLight = new THREE.PointLight(0xddeeff, 12, 10, 2);
    earthFillLight.position.set(2, 3, 2);
    earth.add(earthFillLight);
    this.scene.add(earth);
    this.earth = earth;
    this.earthBaseTransform = {
      position: earth.position.clone(),
      scale: earth.scale.clone()
    };
    this.earthMixer = new THREE.AnimationMixer(earth);
    if (gltf.animations[0]) this.earthMixer.clipAction(gltf.animations[0]).play();
  }

  applyEarthPlacement(roomConfig = this.currentRoomConfig) {
    if (!this.earth || !this.earthBaseTransform) return;
    if (roomConfig?.earthPosition) {
      this.earth.position.copy(roomConfig.earthPosition);
      this.earth.position.y = this.floorLevel + (roomConfig.earthFloorOffset ?? 0.42);
      this.earth.scale.copy(this.earthBaseTransform.scale).multiplyScalar(roomConfig.earthScale || 1);
      return;
    }
    this.earth.position.copy(this.earthBaseTransform.position);
    this.earth.scale.copy(this.earthBaseTransform.scale);
  }

  setupPlayer(walkGltf, jogGltf, greetingGltf) {
    this.player = new THREE.Group();
    this.greetingModel = normalizeModel(greetingGltf.scene, 1.76);
    this.slowModel = normalizeModel(walkGltf.scene, 1.76);
    this.jogModel = normalizeModel(jogGltf.scene, 1.76);
    this.player.add(this.greetingModel, this.slowModel, this.jogModel);
    this.player.scale.set(0.7, 0.7, 0.7);
    this.greetingModel.visible = true;
    this.slowModel.visible = false;
    this.jogModel.visible = false;
    this.player.position.set(-7.15, 1.12, 3.36);
    this.scene.add(this.player);

    this.greetingMixer = new THREE.AnimationMixer(this.greetingModel);
    this.walkMixer = new THREE.AnimationMixer(this.slowModel);
    this.jogMixer = new THREE.AnimationMixer(this.jogModel);
    this.greetingAction = this.greetingMixer.clipAction(greetingGltf.animations[0]);
    this.walkAction = this.walkMixer.clipAction(walkGltf.animations[0]);
    this.jogAction = this.jogMixer.clipAction(jogGltf.animations[0]);
    this.greetingAction.play();
    this.walkAction.play();
    this.jogAction.play();
    this.walkAction.paused = true;
    this.jogAction.paused = true;
    this.currentMotion = "idle";
    this.greetingActive = true;
    this._showGreetingDialog();
    this.updateCameraPosition(1);
  }

  createProjectFrames() {
    const bounds = this.roomBounds;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const floor = this.floorLevel;

    if (this.ringMode) {
      this.createProjectFramesRing(bounds, floor);
      return;
    }

    if (this.currentRoomConfig?.desktopMode) {
      this.createProjectFramesDesktop(floor);
      return;
    }

    // Default layout: all frames in a single horizontal row on the back wall.
    const frameWidth = clamp(size.x * 0.12, 1.4, 1.8);
    const frameHeight = frameWidth * 0.625;
    const spacing = frameWidth + 0.18;
    const totalWidth = (this.projects.length - 1) * spacing;
    const startX = center.x - totalWidth;
    const wallZ = (bounds.min.z + bounds.max.z) / 2 + size.z * 0.35;
    const frameY = floor + 1.55;
    const layout = this.currentRoomConfig?.projectFrameLayout || {};
    const defaultZOffset = layout.zOffset ?? -6.6;
    const lastTwoZOffset = layout.lastTwoZOffset + layout.zOffset/2 ?? -0.8;
    const lastTwoRotationY = layout.lastTwoRotationY ?? Math.PI;
    const xOffset = frameWidth * (layout.xOffsetFrameWidthFactor ?? 0);
    const firstFourXOffset = frameWidth * (layout.firstFourXOffsetFrameWidthFactor ?? 0);
    const lastTwoAxis = layout.lastTwoAxis || "x";
    const lastTwoZSpacing = spacing * (layout.lastTwoZSpacingFactor ?? 1);

    const N = this.projects.length;
    this.projects.forEach((project, index) => {
      const group = new THREE.Group();
      const isLastTwo = index >= N - 2;
      const extraGap = index > 0 && index < N - 2 ? spacing * 0.1 * index : 0;
      let frameX = startX + extraGap + (isLastTwo ? index - N + 2 : index) * spacing  + (index === N - 1 ? spacing * 0.5 : 0) + xOffset;
      let frameZ = wallZ + (isLastTwo ? lastTwoZOffset : defaultZOffset);
      if (!isLastTwo) frameX += firstFourXOffset;

      if (isLastTwo && lastTwoAxis === "z") {
        const lastTwoIndex = index - (N - 2);
        frameX = startX + xOffset;
        frameZ = wallZ + lastTwoZOffset + (lastTwoIndex - 0.5) * lastTwoZSpacing;
      }

      group.position.set(
        frameX,
        frameY,
        frameZ
      );
      group.rotation.y = isLastTwo ? lastTwoRotationY : 0;

      const backing = new THREE.Mesh(
        new THREE.BoxGeometry(frameWidth + 0.18, frameHeight + 0.18, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xb9c6d3, metalness: 0.8, roughness: 0.24 })
      );
      backing.position.z = -0.045;
      group.add(backing);

      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(frameWidth, frameHeight),
        new THREE.MeshBasicMaterial({ map: makeLabelTexture(project), color: 0xffffff, toneMapped: false })
      );
      screen.position.z = 0.012;
      screen.userData.project = project;
      screen.userData.baseScale = 1;
      group.add(screen);
      this.scene.add(group);
      this.frameMeshes.push(screen);
      this.frameGroups.push(group);
    });
  }

  createProjectFramesDesktop(floor) {
    const frameWidth = 2;
    const frameHeight = frameWidth * 0.52;
    const screenBase = new THREE.Vector3(0.34, floor + 3.6, -5.02);
    const activeIndex = this.desktopProjectIndex % this.projects.length;

    this.projects.forEach((project, offset) => {
      const index = (activeIndex + offset) % this.projects.length;
      const stackedProject = this.projects[index];
      const group = new THREE.Group();
      const depth = this.projects.length - offset;
      group.position.set(
        screenBase.x + offset * 0.035,
        screenBase.y + offset * 0.026,
        screenBase.z - offset * 0.018
      );
      group.scale.setScalar(1 - offset * 0.035);
      group.renderOrder = depth;

      const backing = new THREE.Mesh(
        new THREE.BoxGeometry(frameWidth + 0.14, frameHeight + 0.14, 0.045),
        new THREE.MeshStandardMaterial({
          color: offset === 0 ? 0x9eb8c9 : 0x415363,
          metalness: 0.72,
          roughness: 0.28
        })
      );
      backing.position.z = -0.035;
      group.add(backing);

      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(frameWidth, frameHeight),
        new THREE.MeshBasicMaterial({
          map: makeLabelTexture(stackedProject),
          color: offset === 0 ? 0xffffff : 0x9fb0bb,
          toneMapped: false,
          transparent: true,
          opacity: offset === 0 ? 1 : 0.48
        })
      );
      screen.position.z = 0.012;
      screen.renderOrder = depth + 1;
      screen.userData.project = offset === 0 ? stackedProject : null;
      group.add(screen);

      this.scene.add(group);
      this.frameGroups.push(group);
      if (offset === 0) this.frameMeshes.push(screen);
    });

    const indicator = new THREE.Group();
    indicator.position.set(1.5, floor + 2.75, -3.75);
    indicator.rotation.x = -Math.PI * 0.5;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.016, 12, 48),
      new THREE.MeshBasicMaterial({ color: 0x75e7ef, toneMapped: false })
    );
    ring.userData.action = "nextDesktopProject";
    indicator.add(ring);

    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.055, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.82,
        toneMapped: false
      })
    );
    dot.position.z = 0.004;
    dot.userData.action = "nextDesktopProject";
    indicator.add(dot);

    const hitArea = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 36),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    hitArea.position.z = 0.008;
    hitArea.userData.action = "nextDesktopProject";
    indicator.add(hitArea);

    this.scene.add(indicator);
    this.frameGroups.push(indicator);
    this.actionMeshes.push(ring, dot, hitArea);

    const switchLabel = makeActionLabel("切换子网站", "rgba(117, 231, 239, 0.92)");
    switchLabel.position.set(indicator.position.x, indicator.position.y + 0.2, indicator.position.z - 0.46);
    this.scene.add(switchLabel);
    this.frameGroups.push(switchLabel);

    const openIndicator = new THREE.Group();
    openIndicator.position.set(screenBase.x + 1.22, screenBase.y + 0.58, screenBase.z + 0.1);

    const openRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.012, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0xffb06c, toneMapped: false })
    );
    openRing.userData.action = "openDesktopProject";
    openIndicator.add(openRing);

    const openDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.038, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        toneMapped: false
      })
    );
    openDot.position.z = 0.004;
    openDot.userData.action = "openDesktopProject";
    openIndicator.add(openDot);

    const openHitArea = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 40),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    openHitArea.position.z = 0.02;
    openHitArea.userData.action = "openDesktopProject";
    openIndicator.add(openHitArea);

    this.scene.add(openIndicator);
    this.frameGroups.push(openIndicator);
    this.actionMeshes.push(openRing, openDot, openHitArea);

    const openLabel = makeActionLabel("打开当前网站", "rgba(255, 176, 108, 0.95)");
    openLabel.position.set(openIndicator.position.x + 0.18, openIndicator.position.y + 0.25, openIndicator.position.z + 0.02);
    this.scene.add(openLabel);
    this.frameGroups.push(openLabel);
  }

  showNextDesktopProject() {
    if (!this.currentRoomConfig?.desktopMode) return;
    this.desktopProjectIndex = (this.desktopProjectIndex + 1) % this.projects.length;
    this.hoveredProject = null;
    this.frameMeshes = [];
    this.actionMeshes = [];
    this.frameGroups.forEach((group) => this.scene.remove(group));
    this.frameGroups = [];
    this.createProjectFrames();
    this.updateProjectFocus();
  }

  getActiveDesktopProject() {
    if (!this.projects.length) return null;
    return this.projects[this.desktopProjectIndex % this.projects.length];
  }

  switchScene(targetIndex = null) {
    if (!this.roomScenes.length) return;
    const nextIndex = Number.isInteger(targetIndex)
      ? clamp(targetIndex, 0, this.roomScenes.length - 1)
      : (this.roomSceneIndex + 1) % this.roomScenes.length;
    if (nextIndex === this.roomSceneIndex) return;
    const playerAnchor = this.player.position.clone();
    this.roomSceneIndex = nextIndex;
    const nextRoom = this.roomScenes[this.roomSceneIndex];
    this.currentRoomConfig = nextRoom;
    this.ringMode = Boolean(nextRoom.ringMode);
    this.frameMeshes = [];
    this.actionMeshes = [];
    this.hoveredAction = null;
    this.frameGroups.forEach((group) => this.scene.remove(group));
    this.frameGroups = [];
    const toRemove = [];
    this.scene.traverse((child) => {
      if (this.roomScenes.some((roomScene) => child === roomScene.scene)) toRemove.push(child);
    });
    toRemove.forEach((obj) => this.scene.remove(obj));
    this.setupRoom(nextRoom.scene, {
      alternate: nextRoom.alternate,
      anchor: nextRoom.anchorToPlayer ? playerAnchor : null,
      scaleMultiplier: nextRoom.scaleMultiplier
    });
    // Both rooms are authored for the same output transform. The alternate
    // room uses unlit baked materials, so changing lights or overexposing the
    // renderer cannot fix (and can wash out) its textures.
    this.renderer.toneMappingExposure = 0.92;
    this.createProjectFrames();
    this.applyEarthPlacement(nextRoom);
    this.cameraDistanceLimits = nextRoom.cameraDistanceLimits || {
      min: CAMERA_MIN_DISTANCE,
      max: CAMERA_MAX_DISTANCE
    };
    if (typeof nextRoom.cameraYaw === "number") this.cameraYaw = nextRoom.cameraYaw;
    if (typeof nextRoom.cameraPitch === "number") this.cameraPitch = nextRoom.cameraPitch;
    this.cameraDistance = clamp(
      nextRoom.cameraDistance ?? this.cameraDistance,
      this.cameraDistanceLimits.min,
      this.cameraDistanceLimits.max
    );
    this.player.scale.setScalar(nextRoom.playerScale || 0.7);
    this.player.rotation.y = nextRoom.playerRotationY ?? 0;
    if (nextRoom.preservePlayer) {
      this.player.position.copy(playerAnchor);
    } else if (nextRoom.playerPosition) {
      this.player.position.copy(nextRoom.playerPosition);
    } else {
      this.player.position.set(
        clamp(-7.15, this.walkBounds.minX, this.walkBounds.maxX),
        this.floorLevel + 0.4,
        clamp(3.36, this.walkBounds.minZ, this.walkBounds.maxZ)
      );
    }
    this.updateCameraPosition(1);
  }

  createProjectFramesRing(bounds, floor) {
    // Use the circular floor rather than the full model bounds. The imported
    // asset contains decorative geometry outside the room, which otherwise
    // pushes the project frames beyond the wall.
    const floorBounds = getMaterialBounds(this.room, "Floor_baked");
    const layoutBounds = floorBounds.isEmpty() ? bounds : floorBounds;
    const size = layoutBounds.getSize(new THREE.Vector3());
    const center = layoutBounds.getCenter(new THREE.Vector3());
    const roomRadius = Math.min(size.x, size.z) * 0.5;
    // The alternate room is shown at 3x its source scale. Keep the posters
    // proportionate to that space so they remain legible from the entrance.
    const frameWidth = clamp(roomRadius * 0.18, 3.2, 4.6);
    const frameHeight = frameWidth * 0.625;
    // Pull the posters far enough inside the wall to avoid being hidden by the
    // baked wall/frame geometry while still reading as a wall-side display.
    const radius = Math.max(frameWidth, roomRadius * 0.5);
    const arcCenter = Math.PI;
    const arcSpan = Math.PI * 0.62;
    const facingTarget = this.player?.position || center;

    this.projects.forEach((project, index) => {
      const group = new THREE.Group();
      const progress = this.projects.length > 1 ? index / (this.projects.length - 1) : 0.5;
      const angle = arcCenter - arcSpan * 0.5 + progress * arcSpan;
      const posX = center.x + Math.sin(angle) * radius;
      const posZ = center.z + Math.cos(angle) * radius;
      group.position.set(posX, floor + 1.55, posZ);
      group.lookAt(facingTarget.x, group.position.y, facingTarget.z);

      const backing = new THREE.Mesh(
        new THREE.BoxGeometry(frameWidth + 0.18, frameHeight + 0.18, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xb9c6d3, metalness: 0.8, roughness: 0.24 })
      );
      backing.position.z = -0.045;
      group.add(backing);

      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(frameWidth, frameHeight),
        new THREE.MeshBasicMaterial({
          map: makeLabelTexture(project),
          color: 0xffffff,
          side: THREE.DoubleSide,
          toneMapped: false
        })
      );
      screen.position.z = 0.012;
      screen.userData.project = project;
      screen.userData.baseScale = 1;
      group.add(screen);
      this.scene.add(group);
      this.frameMeshes.push(screen);
      this.frameGroups.push(group);
    });
  }

  activate() {
    if (!this.loaded) return;
    this.active = true;
    this.clock.start();
    this.resize();
    this.renderer.setClearColor(0x06090d, 1);
    this.renderer.toneMappingExposure = 0.92;
    this.canvas.style.cursor = "grab";
  }

  deactivate() {
    this.active = false;
    this.keys.clear();
    this.joystick.set(0, 0);
    this.hoveredProject = null;
    this.hoveredAction = null;
    this.canvas.style.cursor = "default";
    this.onFocusProject?.(null);
  }

  openProject(project) {
    if (!project?.url) return;
    window.open(project.url, "_blank", "noopener,noreferrer");
  }

  _showGreetingDialog() {
    const el = document.getElementById("gallery-greeting");
    if (!el) return;
    this._greetingTimer && clearTimeout(this._greetingTimer);
    el.classList.add("is-visible");
    this._greetingTimer = setTimeout(() => this._hideGreetingDialog(), 10000);
  }

  _hideGreetingDialog() {
    const el = document.getElementById("gallery-greeting");
    if (!el) return;
    this._greetingTimer && clearTimeout(this._greetingTimer);
    el.classList.remove("is-visible");
  }

  switchFromGreeting() {
    if (!this.greetingActive) return;
    this.greetingActive = false;
    this.greetingAction.paused = true;
    this.greetingModel.visible = false;
    this.slowModel.visible = true;
    this.walkAction.paused = true;
    this.walkMixer.update(0);
    this._hideGreetingDialog();
  }

  setMotion(moving, running) {
    const next = moving ? (running ? "jog" : "walk") : "idle";
    if (next === this.currentMotion) return;
    this.currentMotion = next;
    if (next === "jog") {
      this.slowModel.visible = false;
      this.jogModel.visible = true;
      this.jogAction.paused = false;
    } else {
      this.slowModel.visible = true;
      this.jogModel.visible = false;
      this.walkAction.paused = next === "idle";
      if (next === "idle") {
        this.walkAction.reset().play();
        this.walkAction.paused = true;
      }
    }
  }

  updateMovement(delta) {
    if (!this.player) return;
    const input = new THREE.Vector2(
      (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0) + this.joystick.x,
      (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0) + this.joystick.y
    );
    if (input.lengthSq() > 1) input.normalize();
    const moving = input.lengthSq() > 0.012;
    const running = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.mobileRunning;

    this.setMotion(moving, running);

    if (moving) {
      const forward = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
      const right = new THREE.Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));
      const direction = forward.multiplyScalar(input.y).add(right.multiplyScalar(input.x)).normalize();
      const speed = running ? 4.15 : 2.15;
      const next = this.player.position.clone().addScaledVector(direction, speed * delta);
      next.x = clamp(next.x, this.walkBounds.minX, this.walkBounds.maxX);
      next.z = clamp(next.z, this.walkBounds.minZ, this.walkBounds.maxZ);

      this.player.position.copy(next);
      const targetYaw = Math.atan2(direction.x, direction.z);
      let angleDifference = targetYaw - this.player.rotation.y;
      angleDifference = Math.atan2(Math.sin(angleDifference), Math.cos(angleDifference));
      this.player.rotation.y += angleDifference * Math.min(1, delta * 10);
    }

    if (!this.walkAction.paused) this.walkMixer.update(delta);
    if (this.jogModel.visible) this.jogMixer.update(delta);
  }

  updateCameraPosition(delta) {
    if (!this.player) return;
    const target = this.player.position.clone().add(new THREE.Vector3(0, 1.62, 0));
    const horizontalDistance = Math.cos(this.cameraPitch) * this.cameraDistance;
    const desired = target.clone().add(new THREE.Vector3(
      Math.sin(this.cameraYaw) * horizontalDistance,
      Math.sin(this.cameraPitch) * this.cameraDistance + 0.35,
      Math.cos(this.cameraYaw) * horizontalDistance
    ));
    const damping = 1 - Math.exp(-Math.max(0.001, delta) * 8);
    this.camera.position.lerp(desired, damping);
    this.camera.lookAt(target);
  }

  updateProjectFocus() {
    this.raycaster.setFromCamera(this.centerPointer, this.camera);
    const actionIntersections = this.raycaster.intersectObjects(this.actionMeshes, false);
    const nextAction = actionIntersections.length && actionIntersections[0].distance < ACTION_INTERACTION_DISTANCE
      ? actionIntersections[0].object.userData.action
      : null;
    const intersections = this.raycaster.intersectObjects(this.frameMeshes, false);
    const next = !nextAction && intersections.length && intersections[0].distance < 9
      ? intersections[0].object.userData.project
      : null;
    const focusProject = next || (nextAction === "openDesktopProject" ? this.getActiveDesktopProject() : null);
    if (next === this.hoveredProject && nextAction === this.hoveredAction) return;
    this.hoveredProject = next;
    this.hoveredAction = nextAction;
    this.frameMeshes.forEach((mesh) => {
      const focused = mesh.userData.project === next;
      mesh.scale.setScalar(focused ? 1.035 : 1);
      mesh.material.color.set(focused ? 0xffffff : 0xdce5ee);
    });
    this.actionMeshes.forEach((mesh) => {
      const focused = mesh.userData.action === nextAction;
      mesh.scale.setScalar(focused ? 1.22 : 1);
      if (mesh.material?.color) mesh.material.color.set(focused ? 0xffffff : 0x75e7ef);
    });
    this.canvas.style.cursor = next || nextAction ? "pointer" : (this.dragging ? "grabbing" : "grab");
    this.onFocusProject?.(focusProject);
  }

  resize() {
    if (!this.camera) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    if (this.active) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1.25 : 1.65));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  animate() {
    window.requestAnimationFrame(this.animate);
    if (!this.active || !this.loaded) return;
    const delta = Math.min(0.05, this.clock.getDelta());
    if (this.greetingActive) this.greetingMixer.update(delta);
    this.updateMovement(delta);
    this.updateCameraPosition(delta);
    this.earthMixer?.update(delta);
    if (this.earth && !this.earthMixer?._actions?.length) this.earth.rotation.y += delta * 0.08;
    this.updateProjectFocus();
    this.updateCoords();
    this.updateGreetingDialogPosition();
    this.renderer.render(this.scene, this.camera);
  }

  updateCoords() {
    const el = document.getElementById("gallery-coords");
    if (!el || !this.player) return;
    const formatVec = (label, vector) => {
      return `${label} x ${vector.x.toFixed(2)} y ${vector.y.toFixed(2)} z ${vector.z.toFixed(2)}`;
    };
    const playerScale = this.player.scale.x.toFixed(2);
    el.textContent = [
      `scene ${this.roomSceneIndex + 1} / ${this.roomScenes.length}`,
      formatVec("player", this.player.position),
      formatVec("camera", this.camera.position),
      `yaw ${this.cameraYaw.toFixed(2)} pitch ${this.cameraPitch.toFixed(2)}`,
      `zoom ${this.cameraDistance.toFixed(2)} min ${this.cameraDistanceLimits.min.toFixed(2)} max ${this.cameraDistanceLimits.max.toFixed(2)}`,
      `playerScale ${playerScale}`
    ].join("\n");
  }

  updateGreetingDialogPosition() {
    const el = document.getElementById("gallery-greeting");
    if (!el || !this.greetingActive || !this.player) return;
    const worldPos = new THREE.Vector3();
    this.player.getWorldPosition(worldPos);
    worldPos.y += 1.0;
    const projected = worldPos.clone().project(this.camera);
    const w = this.canvas.offsetWidth;
    const h = this.canvas.offsetHeight;
    const sx = (projected.x * 0.5 + 0.5) * w;
    const sy = (-projected.y * 0.5 + 0.5) * h;
    if (projected.z > 1 || sx < -80 || sx > w + 80 || sy < -40 || sy > h + 40) {
      el.classList.remove("is-visible");
      return;
    }
    el.style.left = `${sx + 24}px`;
    el.style.top = `${sy - 24}px`;
    el.style.right = "auto";
    el.style.transform = "translateY(-50%)";
    if (!el.classList.contains("is-visible")) el.classList.add("is-visible");
  }
}
