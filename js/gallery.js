import * as THREE from "../vendor/three.module.min.js";
import { GLTFLoader } from "../vendor/GLTFLoader.js";

const MODEL_URLS = {
  room: "models/art_gallery.glb",
  roomAlt: "models/gallery_round_flatfloor_baked.glb",
  earth: "models/planet_earth.glb",
  greeting: "models/greeting_waving_110_frames_loop.glb",
  walk: "models/male_slow_walk_40_frames_loop.glb",
  jog: "models/male_jogging_30_frames_loop.glb"
};

const MODEL_WEIGHTS = {
  [MODEL_URLS.room]: 13586552,
  [MODEL_URLS.roomAlt]: 16409036,
  [MODEL_URLS.earth]: 6703016,
  [MODEL_URLS.greeting]: 348828,
  [MODEL_URLS.walk]: 348828,
  [MODEL_URLS.jog]: 331568
};

const CAMERA_MIN_DISTANCE = 2.55;
const CAMERA_MAX_DISTANCE = 4.15;

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
    this.frameMeshes = [];
    this.frameGroups = [];
    this.ringMode = false;
    this.isAltRoom = false;
    this.clock = new THREE.Clock();
    this.cameraYaw = 0;
    this.cameraPitch = 0;
    this.cameraDistance = 2;
    this.raycaster = new THREE.Raycaster();
    this.centerPointer = new THREE.Vector2(0, 0);
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
    if ((event.code === "KeyE" || event.code === "Enter") && this.hoveredProject) {
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
    if (this.dragDistance < 8 && this.hoveredProject) this.openProject(this.hoveredProject);
    this.canvas.releasePointerCapture?.(event.pointerId);
  }

  adjustCameraDistance(delta) {
    this.cameraDistance = clamp(
      this.cameraDistance + delta,
      CAMERA_MIN_DISTANCE,
      CAMERA_MAX_DISTANCE
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

      const [room, roomAlt, earth, greeting, walk, jog] = await Promise.all([
        loadOne(MODEL_URLS.room),
        loadOne(MODEL_URLS.roomAlt),
        loadOne(MODEL_URLS.earth),
        loadOne(MODEL_URLS.greeting),
        loadOne(MODEL_URLS.walk),
        loadOne(MODEL_URLS.jog)
      ]);

      this.setupRoom(room.scene);
      this.roomAlt = roomAlt.scene;
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

  setupRoom(room, { alternate = false, anchor = null } = {}) {
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
    if (!this.roomDefault) this.roomDefault = room;
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
    this.earthMixer = new THREE.AnimationMixer(earth);
    if (gltf.animations[0]) this.earthMixer.clipAction(gltf.animations[0]).play();
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

    // Default layout: all frames in a single horizontal row on the back wall.
    const frameWidth = clamp(size.x * 0.12, 1.4, 1.8);
    const frameHeight = frameWidth * 0.625;
    const spacing = frameWidth + 0.18;
    const totalWidth = (this.projects.length - 1) * spacing;
    const startX = center.x - totalWidth;
    const wallZ = (bounds.min.z + bounds.max.z) / 2 + size.z * 0.35;
    const frameY = floor + 1.55;

    const N = this.projects.length;
    this.projects.forEach((project, index) => {
      const group = new THREE.Group();
      const isLastTwo = index >= N - 2;
      const extraGap = index > 0 && index < N - 2 ? spacing * 0.1 * index : 0;
      group.position.set(
        startX + extraGap + (isLastTwo ? index - N + 2 : index) * spacing  + (index === N - 1 ? spacing * 0.5 : 0),
        frameY,
        isLastTwo ? wallZ - 0.8 : wallZ - 6.6
      );
      group.rotation.y = isLastTwo ? Math.PI : 0;

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

  switchScene() {
    if (!this.roomAlt) return;
    const playerAnchor = this.player.position.clone();
    this.isAltRoom = !this.isAltRoom;
    this.ringMode = this.isAltRoom;
    this.frameMeshes = [];
    this.frameGroups.forEach((group) => this.scene.remove(group));
    this.frameGroups = [];
    const toRemove = [];
    this.scene.traverse((child) => {
      if (child === this.room || child === this.roomAlt) toRemove.push(child);
    });
    toRemove.forEach((obj) => this.scene.remove(obj));
    this.setupRoom(this.isAltRoom ? this.roomAlt : this.roomDefault, {
      alternate: this.isAltRoom,
      anchor: this.isAltRoom ? playerAnchor : null
    });
    // Both rooms are authored for the same output transform. The alternate
    // room uses unlit baked materials, so changing lights or overexposing the
    // renderer cannot fix (and can wash out) its textures.
    this.renderer.toneMappingExposure = 0.92;
    this.createProjectFrames();
    if (this.isAltRoom) {
      this.player.position.copy(playerAnchor);
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
    this.canvas.style.cursor = "default";
    this.onFocusProject?.(null);
  }

  openProject(project) {
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
    const intersections = this.raycaster.intersectObjects(this.frameMeshes, false);
    const next = intersections.length && intersections[0].distance < 9 ? intersections[0].object.userData.project : null;
    if (next === this.hoveredProject) return;
    this.hoveredProject = next;
    this.frameMeshes.forEach((mesh) => {
      const focused = mesh.userData.project === next;
      mesh.scale.setScalar(focused ? 1.035 : 1);
      mesh.material.color.set(focused ? 0xffffff : 0xdce5ee);
    });
    this.canvas.style.cursor = next ? "pointer" : (this.dragging ? "grabbing" : "grab");
    this.onFocusProject?.(next);
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
    el.textContent = `x ${this.player.position.x.toFixed(2)} y ${this.player.position.y.toFixed(2)} z ${this.player.position.z.toFixed(2)}`;
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
