import * as THREE from "../vendor/three.module.min.js";

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
  constructor(host, projects, onMarkerPosition) {
    this.host = host;
    this.projects = projects;
    this.onMarkerPosition = onMarkerPosition;
    this.markerPositions = new Map();
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.selectedProject = null;
    this.cameraProgress = 0;
    this.targetCameraProgress = 0;
    this.targetRotation = 0;
    this.pointerPaused = false;
    this.elapsed = 0;
    this.lastTime = performance.now();
    this.animate = this.animate.bind(this);
    this.resize = this.resize.bind(this);
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

  updateCamera(delta) {
    const damping = this.reducedMotion ? 1 : 1 - Math.exp(-delta * 2.8);
    this.cameraProgress += (this.targetCameraProgress - this.cameraProgress) * damping;
    const progress = 1 - Math.pow(1 - Math.min(1, Math.max(0, this.cameraProgress)), 3);
    const mobile = window.innerWidth <= 900;
    const radius = mobile ? 6.5 : 5.55;
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
      this.planetGroup.scale.setScalar(mobile ? 0.78 : 1);
      this.planetGroup.position.y = mobile ? 0.92 : 0;
    }
  }

  animate(time) {
    const delta = Math.min(0.05, (time - this.lastTime) / 1000);
    this.lastTime = time;
    this.elapsed += delta;
    if (this.selectedProject) {
      const damping = this.reducedMotion ? 1 : 1 - Math.exp(-delta * 2.2);
      this.planetGroup.rotation.y += (this.targetRotation - this.planetGroup.rotation.y) * damping;
    } else if (!this.pointerPaused && !this.reducedMotion) {
      this.planetGroup.rotation.y += delta * 0.025;
      this.targetRotation = this.planetGroup.rotation.y;
    }
    this.planetGroup.rotation.z = Math.sin(this.elapsed * 0.18) * 0.012;
    this.pointCloud.material.opacity = 0.77 + Math.sin(this.elapsed * 1.3) * 0.09;
    this.starField.rotation.y = this.elapsed * 0.0025;
    this.updateCamera(delta);
    this.updateMarkers();
    this.renderer.render(this.scene, this.camera);
    window.requestAnimationFrame(this.animate);
  }
}