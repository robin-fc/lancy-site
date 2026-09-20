import { projects } from "./projects.js";
import { DigitalPlanet } from "./planet.js";

const app = document.querySelector("#app");
const projectStage = document.querySelector("#project-stage");
const markersHost = document.querySelector("#markers");
const indexHost = document.querySelector("#lab-index");
const fallback = document.querySelector("#preview-fallback");
const enterLink = document.querySelector("#enter-project");
const title = document.querySelector("#project-title");
const kicker = document.querySelector("#project-kicker");
const coordinate = document.querySelector("#project-coordinate");
const description = document.querySelector("#project-description");
const capabilities = document.querySelector("#capability-list");
const clock = document.querySelector("#clock");
const portalButton = document.querySelector("#portal-entry");
const portalTransition = document.querySelector("#portal-transition");
const portalStatus = document.querySelector("#portal-status");
const portalProgressBar = document.querySelector("#portal-progress-bar");
const portalPercent = document.querySelector("#portal-percent");
const galleryUi = document.querySelector("#gallery-ui");
const galleryFocus = document.querySelector("#gallery-focus");
const galleryFocusLab = document.querySelector("#gallery-focus-lab");
const galleryFocusTitle = document.querySelector("#gallery-focus-title");
const galleryFocusAction = document.querySelector("#gallery-focus-action");
const galleryError = document.querySelector("#gallery-error");
const galleryErrorCopy = document.querySelector("#gallery-error-copy");
const markerElements = new Map();
const indexElements = new Map();
let selectedProject = null;
let planet;
let gallery;
let galleryCreationPromise;
let galleryReady = false;
let portalJourneyComplete = false;
let currentLoadProgress = 0;
let galleryRevealPending = false;

function updateMarkerPosition(id, position) {
  const marker = markerElements.get(id);
  if (!marker) return;
  marker.style.setProperty("--marker-x", `${position.x.toFixed(1)}px`);
  marker.style.setProperty("--marker-y", `${position.y.toFixed(1)}px`);
  marker.style.opacity = position.inView ? String(Math.min(1, 0.2 + position.visibility * 1.2)) : "0";
  marker.style.pointerEvents = position.visibility > 0.08 ? "auto" : "none";
  marker.style.setProperty("--depth-scale", String(0.78 + Math.max(0, position.visibility) * 0.22));
  marker.style.zIndex = String(Math.round(10 + position.visibility * 10));
}

function updatePortalPosition(position) {
  if (!portalButton) return;
  portalButton.style.setProperty("--portal-x", `${position.x.toFixed(1)}px`);
  portalButton.style.setProperty("--portal-y", `${position.y.toFixed(1)}px`);
  portalButton.style.setProperty("--portal-depth", String(0.82 + Math.max(0, position.visibility) * 0.18));
  portalButton.classList.toggle("is-visible", position.inView && position.visibility > 0.08 && app.dataset.state === "idle");
}

function createInterface() {
  projects.forEach((project) => {
    const marker = document.createElement("button");
    marker.className = "location-marker";
    marker.type = "button";
    marker.style.setProperty("--marker-size", `${project.size}px`);
    marker.setAttribute("aria-label", `打开 ${project.title}`);
    marker.setAttribute("aria-pressed", "false");
    marker.innerHTML = `
      <span class="marker-ring" aria-hidden="true"></span>
      <span class="marker-core" aria-hidden="true"></span>
      <span class="marker-label">${project.lab} / ${project.short}</span>
    `;
    marker.addEventListener("click", () => selectProject(project.id));
    marker.addEventListener("mouseenter", () => planet?.setPointerPaused(true));
    marker.addEventListener("mouseleave", () => planet?.setPointerPaused(false));
    markersHost.appendChild(marker);
    markerElements.set(project.id, marker);

    const indexButton = document.createElement("button");
    indexButton.className = "index-button";
    indexButton.type = "button";
    indexButton.innerHTML = `<b>${project.lab}</b><span>${project.short}</span>`;
    indexButton.setAttribute("aria-label", `选择 ${project.title}`);
    indexButton.addEventListener("click", () => selectProject(project.id));
    indexHost.appendChild(indexButton);
    indexElements.set(project.id, indexButton);
  });
}

function buildCapabilities(project) {
  const items = project.capabilities.map((capability, index) => {
    const item = document.createElement("li");
    const number = document.createElement("b");
    number.textContent = String(index + 1).padStart(2, "0");
    item.append(number, capability);
    return item;
  });
  capabilities.replaceChildren(...items);
}

function selectProject(id) {
  const project = projects.find((item) => item.id === id);
  if (!project) return;
  selectedProject = project;
  app.scrollLeft = 0;
  planet.select(project);
  app.dataset.state = "active";
  projectStage.setAttribute("aria-hidden", "false");
  coordinate.textContent = `LAB COORDINATE ${project.lab}`;
  title.textContent = project.title;
  kicker.textContent = project.kicker;
  description.textContent = project.description;
  fallback.src = project.image;
  enterLink.href = project.url;
  buildCapabilities(project);

  markerElements.forEach((element, markerId) => {
    const active = markerId === id;
    element.classList.toggle("is-selected", active);
    element.setAttribute("aria-pressed", String(active));
  });
  indexElements.forEach((element, markerId) => {
    element.classList.toggle("is-selected", markerId === id);
  });

}

function closeProject() {
  app.dataset.state = "idle";
  projectStage.setAttribute("aria-hidden", "true");
  selectedProject = null;
  app.scrollLeft = 0;
  planet.clearSelection();
  markerElements.forEach((element) => {
    element.classList.remove("is-selected");
    element.setAttribute("aria-pressed", "false");
  });
  indexElements.forEach((element) => element.classList.remove("is-selected"));
}

function updateGalleryFocus(project) {
  const hasProject = Boolean(project);
  galleryFocus.classList.toggle("is-project", hasProject);
  galleryFocusLab.textContent = hasProject ? `LAB ${project.lab} / ${project.short}` : "探索空间";
  galleryFocusTitle.textContent = hasProject ? project.title : "靠近墙面作品并点击查看";
  galleryFocusAction.textContent = hasProject ? "点击或按 E 打开作品" : "WASD 移动 · 鼠标环视 · Shift 慢跑";
}

function updateGalleryProgress(progress) {
  currentLoadProgress = Math.max(currentLoadProgress, progress);
  const percent = Math.round(currentLoadProgress * 100);
  portalProgressBar.style.width = `${percent}%`;
  portalPercent.textContent = `${String(percent).padStart(2, "0")}%`;
  if (percent < 14) portalStatus.textContent = "建立空间连接";
  else if (percent < 72) portalStatus.textContent = "载入艺术空间";
  else if (percent < 94) portalStatus.textContent = "唤醒空间角色";
  else portalStatus.textContent = "准备漫游";
}

async function createGallery() {
  if (gallery) return gallery;
  if (!galleryCreationPromise) {
    galleryCreationPromise = import("./gallery.js").then(({ GalleryExperience }) => {
      gallery = new GalleryExperience({
        renderer: planet.renderer,
        projects,
        onFocusProject: updateGalleryFocus,
        onExit: returnToPlanet,
        mobileStick: document.querySelector("#mobile-stick"),
        mobileKnob: document.querySelector("#mobile-stick-knob"),
        mobileRunButton: document.querySelector("#mobile-run")
      });
      return gallery;
    }).catch((error) => {
      galleryCreationPromise = null;
      throw error;
    });
  }
  return galleryCreationPromise;
}

async function ensureGalleryLoaded() {
  if (galleryReady) return gallery;
  const experience = await createGallery();
  await experience.load(updateGalleryProgress);
  galleryReady = true;
  revealGalleryWhenReady();
  return experience;
}

function revealGalleryWhenReady() {
  if (!galleryReady || !portalJourneyComplete || galleryRevealPending) return;
  galleryRevealPending = true;
  portalStatus.textContent = "空间已就绪";
  portalProgressBar.style.width = "100%";
  portalPercent.textContent = "100%";
  app.dataset.state = "portal-blackout";

  // Finish the planet shot in a true black frame, switch renderers while the
  // frame is covered, then reveal the gallery from black.
  window.setTimeout(() => {
    planet.setActive(false);
    gallery.activate();
    app.dataset.state = "gallery-reveal";
    galleryUi.setAttribute("aria-hidden", "false");
    window.setTimeout(() => {
      app.dataset.state = "gallery";
      portalTransition.setAttribute("aria-hidden", "true");
      galleryRevealPending = false;
    }, 100);
  }, 420);
}

function showGalleryError(error) {
  console.error("Unable to initialize the gallery.", error);
  app.dataset.state = "gallery-error";
  planet.setActive(false);
  gallery?.deactivate();
  galleryError.hidden = false;
  galleryErrorCopy.textContent = "模型暂时无法载入，请检查网络连接后重试。";
}

function enterGallery() {
  if (!["idle", "active"].includes(app.dataset.state)) return;
  if (selectedProject) closeProject();
  currentLoadProgress = 0;
  portalJourneyComplete = false;
  galleryRevealPending = false;
  galleryError.hidden = true;
  updateGalleryProgress(galleryReady ? 1 : 0.01);
  app.dataset.state = "portal";
  portalTransition.setAttribute("aria-hidden", "false");
  portalButton.classList.remove("is-visible");

  ensureGalleryLoaded().catch(showGalleryError);
  planet.enterPortal(() => {
    portalJourneyComplete = true;
    if (!galleryReady) app.dataset.state = "gallery-loading";
    revealGalleryWhenReady();
  });
}

function returnToPlanet() {
  if (!gallery) return;
  gallery.deactivate();
  galleryUi.setAttribute("aria-hidden", "true");
  galleryError.hidden = true;
  app.dataset.state = "portal";
  portalTransition.setAttribute("aria-hidden", "false");
  planet.renderer.setClearColor(0x000000, 0);
  planet.renderer.toneMappingExposure = 1.15;
  planet.resetPortal();
  window.setTimeout(() => {
    app.dataset.state = "idle";
    portalTransition.setAttribute("aria-hidden", "true");
  }, 720);
}

function updateClock() {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  clock.textContent = `UTC+8 / ${formatter.format(new Date())}`;
}

function showWebGlFallback(error) {
  console.error("Unable to initialize the digital planet.", error);
  app.classList.add("is-ready", "no-webgl");
  const notice = document.createElement("p");
  notice.className = "webgl-notice";
  notice.textContent = "当前浏览器无法启动 WebGL，请通过页面索引访问项目。";
  document.body.appendChild(notice);
}

function initialize() {
  createInterface();
  updateClock();
  window.setInterval(updateClock, 1000);

  try {
    planet = new DigitalPlanet(document.querySelector("#scene"), projects, updateMarkerPosition, updatePortalPosition);
    planet.initialize();
    window.setTimeout(() => app.classList.add("is-ready"), 650);
  } catch (error) {
    showWebGlFallback(error);
  }

  document.querySelector("#close-project").addEventListener("click", closeProject);
  portalButton.addEventListener("click", enterGallery);
  portalButton.addEventListener("mouseenter", () => {
    planet?.setPointerPaused(true);
    createGallery().catch((error) => console.warn("Unable to preload the gallery.", error));
  });
  portalButton.addEventListener("mouseleave", () => planet?.setPointerPaused(false));
  portalButton.addEventListener("focus", () => {
    createGallery().catch((error) => console.warn("Unable to preload the gallery.", error));
  });
  document.querySelector("#gallery-switch").addEventListener("click", () => gallery?.switchScene());
  document.querySelector("#gallery-back").addEventListener("click", returnToPlanet);
  document.querySelector("#gallery-error-back").addEventListener("click", returnToPlanet);
  document.querySelector("#gallery-retry").addEventListener("click", () => {
    galleryError.hidden = true;
    app.dataset.state = "gallery-loading";
    currentLoadProgress = 0;
    ensureGalleryLoaded().catch(showGalleryError);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selectedProject) {
      closeProject();
      return;
    }
    if (!selectedProject || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const current = projects.findIndex((project) => project.id === selectedProject.id);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    selectProject(projects[(current + direction + projects.length) % projects.length].id);
  });
}

initialize();
