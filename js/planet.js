import * as THREE from "../vendor/three.module.min.js";

const SHANGHAI = { lat: 31.2304, lon: 121.4737 };
const FRONT_VECTOR = new THREE.Vector3(0, 0, 1);

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function sphericalPosition(lat, lon, radius = 1.52) {
  const phi = THREE.MathUtils.degToRad(lat);
  const theta = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    radius * Math.cos(phi) * Math.sin(theta),
    radius * Math.sin(phi),
    radius * Math.cos(phi) * Math.cos(theta)
  );
}

function seededRandom(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export class DigitalPlanet {
  constructor(host, projects, onMarkerPosition, onPortalPosition) {
    this.host = host;
    this.projects = projects;
    this.onMarkerPosition = onMarkerPosition;
    this.onPortalPosition = onPortalPosition;
    this.markerPositions = new Map();
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.selectedProject = null;
    this.cameraProgress = 0;
    this.targetCameraProgress = 0;
    this.targetRotation = 0;
    this.targetRotationX = 0;
    this.cameraZoom = 1;
    this.targetCameraZoom = 1;
    this.pointerPaused = false;
    this.draggingPlanet = false;
    this.planetDragDistance = 0;
    this.elapsed = 0;
    this.active = true;
    this.portalMode = false;
    this.portalProgress = 0;
    this.portalCallback = null;
    this.basePlanetScale = 1;
    this.lastTime = performance.now();
    this.animate = this.animate.bind(this);
    this.resize = this.resize.bind(this);
    this.handlePlanetPointerDown = this.handlePlanetPointerDown.bind(this);
    this.handlePlanetPointerMove = this.handlePlanetPointerMove.bind(this);
    this.handlePlanetPointerUp = this.handlePlanetPointerUp.bind(this);
    this.handlePlanetWheel = this.handlePlanetWheel.bind(this);
    this.handlePlanetKeyDown = this.handlePlanetKeyDown.bind(this);
  }

  initialize() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(39, window.innerWidth / window.innerHeight, 0.1, 60);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cursor = "grab";
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.addEventListener("pointerdown", this.handlePlanetPointerDown);
    window.addEventListener("pointermove", this.handlePlanetPointerMove);
    window.addEventListener("pointerup", this.handlePlanetPointerUp);
    window.addEventListener("pointercancel", this.handlePlanetPointerUp);
    this.renderer.domElement.addEventListener("wheel", this.handlePlanetWheel, { passive: false });
    window.addEventListener("keydown", this.handlePlanetKeyDown);

    this.scene.add(new THREE.HemisphereLight(0x83f3f7, 0x010407, 1.15));
    const keyLight = new THREE.DirectionalLight(0x77eff5, 2.8);
    keyLight.position.set(-3, 4, 5);
    this.scene.add(keyLight);
    const warmLight = new THREE.PointLight(0xff8d3e, 2.4, 8);
    warmLight.position.set(-1.8, -1.4, 3.6);
    this.scene.add(warmLight);

    this.createStars();
    this.createPlanet();
    this.resize();
    window.addEventListener("resize", this.resize, { passive: true });
    window.requestAnimationFrame(this.animate);
  }

  createStars() {
    const positions = [];
    const colors = [];
    const color = new THREE.Color();
    for (let index = 0; index < 900; index += 1) {
      const radius = 8 + seededRandom(index) * 15;
      const theta = seededRandom(index + 1400) * Math.PI * 2;
      const phi = Math.acos(2 * seededRandom(index + 2900) - 1);
      positions.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
      color.set(index % 11 === 0 ? 0xffb06b : 0x8deff4);
      colors.push(color.r, color.g, color.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    this.starField = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 0.018,
      transparent: true,
      opacity: 0.58,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    this.scene.add(this.starField);
  }

  createPlanet() {
    this.planetGroup = new THREE.Group();
    this.scene.add(this.planetGroup);
    this.projects.forEach((project) => {
      this.markerPositions.set(project.id, sphericalPosition(project.lat, project.lon));
    });

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1.46, 72, 72),
      new THREE.MeshPhongMaterial({
        color: 0x061722,
        emissive: 0x04131c,
        shininess: 42,
        transparent: true,
        opacity: 0.98
      })
    );
    this.planetGroup.add(core);

    this.planetGroup.add(new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.475, 5),
      new THREE.MeshBasicMaterial({
        color: 0x4fced7,
        wireframe: true,
        transparent: true,
        opacity: 0.055,
        depthWrite: false
      })
    ));

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.61, 64, 64),
      new THREE.ShaderMaterial({
        uniforms: { glowColor: { value: new THREE.Color(0x54e8f2) } },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * vec4(vPosition, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 glowColor;
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
            float rim = pow(0.72 - dot(vNormal, normalize(-vPosition)), 2.25);
            gl_FragColor = vec4(glowColor, rim * 0.52);
          }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false
      })
    );
    this.planetGroup.add(atmosphere);
    this.createGridLines();
    this.createSurfacePoints();
    this.createArcs();
    this.createShanghaiPortal();

    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(1.95, 0.004, 6, 180),
      new THREE.MeshBasicMaterial({ color: 0x55dbe4, transparent: true, opacity: 0.06, depthWrite: false })
    );
    orbit.rotation.x = Math.PI / 2.7;
    orbit.rotation.y = Math.PI / 5;
    this.planetGroup.add(orbit);
  }

  createGridLines() {
    const material = new THREE.LineBasicMaterial({
      color: 0x56dce5,
      transparent: true,
      opacity: 0.1,
      depthWrite: false
    });
    [-60, -30, 0, 30, 60].forEach((latitude) => {
      const points = [];
      for (let index = 0; index <= 128; index += 1) {
        points.push(sphericalPosition(latitude, index / 128 * 360 - 180, 1.485));
      }
      this.planetGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    });
    for (let longitude = 0; longitude < 180; longitude += 30) {
      const points = [];
      for (let index = 0; index <= 128; index += 1) {
        points.push(sphericalPosition(index / 128 * 180 - 90, longitude, 1.487));
      }
      this.planetGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    }
  }

  createSurfacePoints() {
    const positions = [];
    const colors = [];
    const color = new THREE.Color();
    const count = window.innerWidth < 700 ? 1300 : 2600;
    for (let index = 0; index < count * 2; index += 1) {
      if (positions.length / 3 >= count) break;
      const y = 1 - (index / (count * 2 - 1)) * 2;
      const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = Math.PI * (3 - Math.sqrt(5)) * index;
      const lon = Math.atan2(Math.cos(theta) * ringRadius, Math.sin(theta) * ringRadius);
      const lat = Math.asin(y);
      const mask = Math.sin(lon * 3.1 + Math.sin(lat * 5.2)) + Math.sin(lat * 7.3 - lon * 1.7) + Math.cos(lon * 8.4) * 0.45;
      if (mask < -0.25 && index % 4 !== 0) continue;
      const radius = 1.505 + seededRandom(index + 6200) * 0.018;
      positions.push(
        Math.sin(theta) * ringRadius * radius,
        y * radius,
        Math.cos(theta) * ringRadius * radius
      );
      color.set(mask > 1.1 ? 0xffa65a : 0x7ef5fa);
      const intensity = 0.55 + seededRandom(index + 8700) * 0.45;
      colors.push(color.r * intensity, color.g * intensity, color.b * intensity);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    this.pointCloud = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: window.innerWidth < 700 ? 0.016 : 0.013,
      transparent: true,
      opacity: 0.86,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    this.planetGroup.add(this.pointCloud);
  }

  createArcs() {
    const pairs = [[0, 1], [1, 2], [0, 4], [4, 3], [3, 5], [5, 2], [0, 3]];
    const material = new THREE.LineBasicMaterial({
      color: 0x4ee8f1,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    pairs.forEach(([fromIndex, toIndex]) => {
      const start = this.markerPositions.get(this.projects[fromIndex].id).clone();
      const end = this.markerPositions.get(this.projects[toIndex].id).clone();
      const middle = start.clone().add(end).normalize().multiplyScalar(1.72);
      const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
      this.planetGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
        material
      ));
    });
  }

  createShanghaiPortal() {
    const surfaceNormal = sphericalPosition(SHANGHAI.lat, SHANGHAI.lon, 1).normalize();
    const surfacePoint = surfaceNormal.clone().multiplyScalar(1.515);
    const height = 0.84;
    this.portalAnchor = surfaceNormal.clone().multiplyScalar(2.08);
    this.portalGroup = new THREE.Group();
    this.portalGroup.position.copy(surfacePoint.clone().addScaledVector(surfaceNormal, height * 0.5));
    this.portalGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), surfaceNormal);

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, height, 48, 1, true),
      new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          silverA: { value: new THREE.Color(0xffffff) },
          silverB: { value: new THREE.Color(0x8e9fb5) }
        },
        vertexShader: `
          varying float vHeight;
          varying vec3 vWorldPosition;
          void main() {
            vHeight = clamp(0.5 - position.y / ${height.toFixed(2)}, 0.0, 1.0);
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorldPosition = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: `
          uniform float time;
          uniform vec3 silverA;
          uniform vec3 silverB;
          varying float vHeight;
          varying vec3 vWorldPosition;
          void main() {
            float shimmer = 0.82 + sin(time * 2.4 + vWorldPosition.y * 12.0) * 0.18;
            float edgeFade = smoothstep(1.0, 0.05, vHeight);
            vec3 color = mix(silverA, silverB, vHeight * 0.72) * shimmer;
            float alpha = mix(0.78, 0.08, vHeight) * (0.72 + edgeFade * 0.28);
            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      })
    );
    this.portalCone = cone;
    this.portalGroup.add(cone);

    const beamCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.035, height * 1.05, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xf8fbff,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.portalGroup.add(beamCore);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xe8effa,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    this.portalRings = [];
    [0.16, 0.25].forEach((radius, index) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.82, radius, 48), ringMaterial.clone());
      ring.position.copy(surfacePoint.clone().addScaledVector(surfaceNormal, 0.012 + index * 0.008));
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), surfaceNormal);
      ring.userData.phase = index * Math.PI;
      this.portalRings.push(ring);
      this.planetGroup.add(ring);
    });
    this.planetGroup.add(this.portalGroup);
  }

  select(project) {
    this.selectedProject = project;
    this.targetCameraProgress = 1;
    this.targetRotation = -THREE.MathUtils.degToRad(project.lon);
  }

  clearSelection() {
    this.selectedProject = null;
    this.targetCameraProgress = 0;
  }

  setPointerPaused(paused) {
    this.pointerPaused = paused;
  }

  handlePlanetWheel(event) {
    if (!this.active || this.portalMode) return;
    event.preventDefault();
    this.targetCameraZoom = THREE.MathUtils.clamp(
      this.targetCameraZoom + event.deltaY * 0.0007,
      0.78,
      1.28
    );
  }

  handlePlanetKeyDown(event) {
    if (!this.active || this.portalMode) return;
    let zoomDelta = 0;
    if (["Equal", "NumpadAdd"].includes(event.code)) zoomDelta = -0.08;
    if (["Minus", "NumpadSubtract"].includes(event.code)) zoomDelta = 0.08;
    if (!zoomDelta) return;
    event.preventDefault();
    this.targetCameraZoom = THREE.MathUtils.clamp(
      this.targetCameraZoom + zoomDelta,
      0.78,
      1.28
    );
  }

  handlePlanetPointerDown(event) {
    if (!this.active || this.portalMode || this.selectedProject || event.button > 0) return;
    this.draggingPlanet = true;
    this.planetDragDistance = 0;
    this.lastPlanetPointer = { x: event.clientX, y: event.clientY };
    this.renderer.domElement.style.cursor = "grabbing";
    this.renderer.domElement.setPointerCapture?.(event.pointerId);
  }

  handlePlanetPointerMove(event) {
    if (!this.draggingPlanet || !this.lastPlanetPointer) return;
    const dx = event.clientX - this.lastPlanetPointer.x;
    const dy = event.clientY - this.lastPlanetPointer.y;
    this.planetDragDistance += Math.abs(dx) + Math.abs(dy);
    this.targetRotation += dx * 0.0062;
    this.targetRotationX = THREE.MathUtils.clamp(this.targetRotationX + dy * 0.0048, -0.9, 0.9);
    this.lastPlanetPointer = { x: event.clientX, y: event.clientY };
  }

  handlePlanetPointerUp(event) {
    if (!this.draggingPlanet) return;
    this.draggingPlanet = false;
    this.lastPlanetPointer = null;
    this.renderer.domElement.style.cursor = "grab";
    this.renderer.domElement.releasePointerCapture?.(event.pointerId);
  }

  setActive(active) {
    this.active = active;
    this.renderer.domElement.style.cursor = active ? "grab" : "default";
  }

  enterPortal(onComplete) {
    if (this.portalMode) return;
    this.selectedProject = null;
    this.portalMode = true;
    this.portalProgress = 0;
    this.portalStart = this.elapsed;
    this.portalStartQuaternion = this.planetGroup.quaternion.clone();
    const localNormal = sphericalPosition(SHANGHAI.lat, SHANGHAI.lon, 1).normalize();
    this.portalTargetQuaternion = new THREE.Quaternion().setFromUnitVectors(localNormal, FRONT_VECTOR);
    this.portalCallback = onComplete;
  }

  resetPortal() {
    this.portalMode = false;
    this.portalProgress = 0;
    this.portalCallback = null;
    this.cameraProgress = 0;
    this.targetCameraProgress = 0;
    this.planetGroup.scale.setScalar(this.basePlanetScale);
    this.planetGroup.rotation.set(0, this.targetRotation, 0);
    this.targetRotationX = 0;
    this.host.style.opacity = "1";
    this.setActive(true);
  }

  updateCamera(delta) {
    const zoomDamping = this.reducedMotion ? 1 : 1 - Math.exp(-delta * 10);
    this.cameraZoom += (this.targetCameraZoom - this.cameraZoom) * zoomDamping;
    if (this.portalMode) {
      const progress = easeInOutCubic(this.portalProgress);
      const mobile = window.innerWidth <= 900;
      const startRadius = (mobile ? 6.5 : 5.55) * this.cameraZoom;
      const radius = THREE.MathUtils.lerp(startRadius, mobile ? 2.2 : 2.0, progress);
      const orbitAngle = Math.sin(progress * Math.PI) * THREE.MathUtils.degToRad(mobile ? 9 : 24);
      this.camera.position.set(Math.sin(orbitAngle) * radius, THREE.MathUtils.lerp(mobile ? 0.72 : 0.05, 0.15, progress), Math.cos(orbitAngle) * radius);
      this.camera.lookAt(0, 0, 0);
      return;
    }
    const damping = this.reducedMotion ? 1 : 1 - Math.exp(-delta * 2.8);
    this.cameraProgress += (this.targetCameraProgress - this.cameraProgress) * damping;
    const progress = 1 - Math.pow(1 - Math.min(1, Math.max(0, this.cameraProgress)), 3);
    const mobile = window.innerWidth <= 900;
    const radius = (mobile ? 6.5 : 5.55) * this.cameraZoom;
    const angle = mobile ? 0 : THREE.MathUtils.degToRad(20) * progress;
    this.camera.position.set(Math.sin(angle) * radius, mobile ? 0.72 : 0.05, Math.cos(angle) * radius);
    this.camera.lookAt(mobile ? 0 : 1.1 * progress, mobile ? 0.45 : 0, 0);
  }

  updateMarkers() {
    this.planetGroup.updateMatrixWorld(true);
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.projects.forEach((project) => {
      const world = this.markerPositions.get(project.id).clone().applyMatrix4(this.planetGroup.matrixWorld);
      const visibility = world.clone().normalize().dot(this.camera.position.clone().sub(world).normalize());
      const projected = world.clone().project(this.camera);
      this.onMarkerPosition(project.id, {
        x: (projected.x * 0.5 + 0.5) * width,
        y: (-projected.y * 0.5 + 0.5) * height,
        visibility,
        inView: visibility > -0.02 && projected.z < 1
      });
    });
    if (this.portalAnchor && this.onPortalPosition) {
      const world = this.portalAnchor.clone().applyMatrix4(this.planetGroup.matrixWorld);
      const visibility = world.clone().normalize().dot(this.camera.position.clone().sub(world).normalize());
      const projected = world.clone().project(this.camera);
      this.onPortalPosition({
        x: (projected.x * 0.5 + 0.5) * width,
        y: (-projected.y * 0.5 + 0.5) * height,
        visibility,
        inView: visibility > -0.02 && projected.z < 1 && !this.portalMode
      });
    }
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 700 ? 1.35 : 1.8));
    this.renderer.setSize(width, height);
    if (this.planetGroup) {
      const mobile = width <= 900;
      this.basePlanetScale = mobile ? 0.78 : 1;
      if (!this.portalMode) this.planetGroup.scale.setScalar(this.basePlanetScale);
      this.planetGroup.position.y = mobile ? 0.92 : 0;
    }
  }

  animate(time) {
    const delta = Math.min(0.05, (time - this.lastTime) / 1000);
    this.lastTime = time;
    this.elapsed += delta;
    if (this.portalMode) {
      const duration = this.reducedMotion ? 0.7 : 3.35;
      this.portalProgress = Math.min(1, (this.elapsed - this.portalStart) / duration);
      const eased = easeInOutCubic(this.portalProgress);
      this.planetGroup.quaternion.slerpQuaternions(this.portalStartQuaternion, this.portalTargetQuaternion, eased);
      this.planetGroup.scale.setScalar(this.basePlanetScale * THREE.MathUtils.lerp(1, 2.85, eased));
      if (this.portalProgress >= 1 && this.portalCallback) {
        const callback = this.portalCallback;
        this.portalCallback = null;
        callback();
      }
    } else if (this.selectedProject) {
      const damping = this.reducedMotion ? 1 : 1 - Math.exp(-delta * 2.2);
      this.planetGroup.rotation.y += (this.targetRotation - this.planetGroup.rotation.y) * damping;
    } else if (!this.pointerPaused && !this.draggingPlanet && !this.reducedMotion) {
      this.planetGroup.rotation.y += delta * 0.025;
      this.targetRotation = this.planetGroup.rotation.y;
    }
    if (!this.portalMode && !this.selectedProject) {
      const dragDamping = this.reducedMotion ? 1 : 1 - Math.exp(-delta * 12);
      this.planetGroup.rotation.y += (this.targetRotation - this.planetGroup.rotation.y) * dragDamping;
      this.planetGroup.rotation.x += (this.targetRotationX - this.planetGroup.rotation.x) * dragDamping;
      this.planetGroup.rotation.z = Math.sin(this.elapsed * 0.18) * 0.012;
    }
    this.pointCloud.material.opacity = 0.77 + Math.sin(this.elapsed * 1.3) * 0.09;
    this.starField.rotation.y = this.elapsed * 0.0025;
    if (this.portalCone) {
      this.portalCone.material.uniforms.time.value = this.elapsed;
      this.portalRings.forEach((ring, index) => {
        const pulse = 0.86 + ((Math.sin(this.elapsed * 2 + ring.userData.phase) + 1) * 0.14);
        ring.scale.setScalar(pulse);
        ring.material.opacity = 0.32 + (1 - index * 0.12) * (Math.sin(this.elapsed * 1.7 + ring.userData.phase) + 1) * 0.18;
      });
    }
    this.updateCamera(delta);
    this.updateMarkers();
    if (this.active) this.renderer.render(this.scene, this.camera);
    window.requestAnimationFrame(this.animate);
  }
}
