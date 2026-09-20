import * as THREE from "../vendor/three.module.min.js";
import { GLTFLoader } from "../vendor/GLTFLoader.js";

const MODEL_URLS = {
  room: "models/art_gallery.glb",
  earth: "models/planet_earth.glb",
  walk: "models/male_slow_walk_40_frames_loop.glb",
  jog: "models/male_jogging_30_frames_loop.glb"
};

const MODEL_WEIGHTS = {
  [MODEL_URLS.room]: 13586552,
  [MODEL_URLS.earth]: 6703016,
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
    this.clock = new THREE.Clock();
    this.cameraYaw = 0;
    this.cameraPitch = 0.22;
    this.cameraDistance = 3.7;
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

    const hemisphere = new THREE.HemisphereLight(0xdce8f4, 0x171b20, 0.82);
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

      const [room, earth, walk, jog] = await Promise.all([
        loadOne(MODEL_URLS.room),
        loadOne(MODEL_URLS.earth),
        loadOne(MODEL_URLS.walk),
        loadOne(MODEL_URLS.jog)
      ]);

      this.setupRoom(room.scene);
      this.setupEarth(earth);
      this.setupPlayer(walk, jog);
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

  setupRoom(room) {
    room.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(room);
    const size = box.getSize(new THREE.Vector3());
    const horizontalSize = Math.max(size.x, size.z, 1);
    room.scale.multiplyScalar(24 / horizontalSize);
    room.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(room);
    const center = box.getCenter(new THREE.Vector3());
    room.position.x -= center.x;
    room.position.z -= center.z;
    room.position.y -= box.min.y;
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
    this.roomBounds = new THREE.Box3().setFromObject(room);
    const roomSize = this.roomBounds.getSize(new THREE.Vector3());
    // The gallery asset contains foundation geometry below the visible floor.
    // Lift interactive objects to the finished floor surface instead of the raw bounding-box minimum.
    this.floorLevel = this.roomBounds.min.y + clamp(roomSize.y * 0.17, 0.72, 0.9);
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
    earth.position.set(-4.15, floor + 0.62, 0.35);
    earth.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.metalness = Math.min(0.42, child.material.metalness || 0);
        child.material.needsUpdate = true;
      }
    });
    this.scene.add(earth);
    this.earth = earth;
    this.earthMixer = new THREE.AnimationMixer(earth);
    if (gltf.animations[0]) this.earthMixer.clipAction(gltf.animations[0]).play();

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.65, 0.42, 48),
      new THREE.MeshStandardMaterial({ color: 0x111a20, metalness: 0.72, roughness: 0.28 })
    );
    pedestal.position.set(-4.15, floor + 0.21, 0.35);
    this.scene.add(pedestal);
    this.earthBlockerRadius = 2.05;
    this.earthPosition2D = new THREE.Vector2(-4.15, 0.35);
  }

  setupPlayer(walkGltf, jogGltf) {
    this.player = new THREE.Group();
    this.slowModel = normalizeModel(walkGltf.scene, 1.76);
    this.jogModel = normalizeModel(jogGltf.scene, 1.76);
    this.player.add(this.slowModel, this.jogModel);
    this.jogModel.visible = false;
    this.player.position.set(0.8, this.floorLevel + 0.40, 3.2);
    this.player.rotation.y = Math.PI;
    this.scene.add(this.player);

    this.walkMixer = new THREE.AnimationMixer(this.slowModel);
    this.jogMixer = new THREE.AnimationMixer(this.jogModel);
    this.walkAction = this.walkMixer.clipAction(walkGltf.animations[0]);
    this.jogAction = this.jogMixer.clipAction(jogGltf.animations[0]);
    this.walkAction.play();
    this.jogAction.play();
    this.walkAction.paused = true;
    this.currentMotion = "idle";
    this.updateCameraPosition(1);
  }

  createProjectFrames() {
    const bounds = this.roomBounds;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const frameWidth = clamp(size.x * 0.12, 2.35, 2.7);
    const frameHeight = frameWidth * 0.625;
    const displayCenterX = center.x + 1.65;
    // Keep the portfolio wall in front of the room model's internal partitions.
    // The imported gallery contains overlapping architectural shells near the
    // rear bound, which otherwise hide the lower row from the entrance view.
    const backWallZ = center.z + 1.0;
    const xSpacing = clamp(size.x * 0.15, 3.0, 3.45);
    const rowGap = frameHeight + 0.2;

    const displayWall = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(9.8, size.x * 0.66), 4.55, 0.14),
      new THREE.MeshStandardMaterial({
        color: 0x0b1319,
        metalness: 0.42,
        roughness: 0.46
      })
    );
    displayWall.position.set(displayCenterX, this.floorLevel + 2.2, backWallZ - 0.08);
    this.scene.add(displayWall);

    this.projects.forEach((project, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const group = new THREE.Group();
      group.position.set(
        displayCenterX + (column - 1) * xSpacing,
        this.floorLevel + 1.28 + row * rowGap,
        backWallZ + 0.02
      );

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

      const fromEarth = new THREE.Vector2(next.x, next.z).sub(this.earthPosition2D);
      if (fromEarth.length() < this.earthBlockerRadius) {
        fromEarth.setLength(this.earthBlockerRadius);
        next.x = this.earthPosition2D.x + fromEarth.x;
        next.z = this.earthPosition2D.y + fromEarth.y;
      }
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
    this.updateMovement(delta);
    this.updateCameraPosition(delta);
    this.earthMixer?.update(delta);
    if (this.earth && !this.earthMixer?._actions?.length) this.earth.rotation.y += delta * 0.08;
    this.updateProjectFocus();
    this.renderer.render(this.scene, this.camera);
  }
}
