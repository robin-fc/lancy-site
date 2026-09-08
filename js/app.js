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
const markerElements = new Map();
const indexElements = new Map();
let selectedProject = null;
let planet;

function updateMarkerPosition(id, position) {
  const marker = markerElements.get(id);
  if (!marker) return;
  marker.style.left = `${position.x}px`;
  marker.style.top = `${position.y}px`;
  marker.style.opacity = position.inView ? String(Math.min(1, 0.2 + position.visibility * 1.2)) : "0";
  marker.style.pointerEvents = position.visibility > 0.08 ? "auto" : "none";
  marker.style.setProperty("--depth-scale", String(0.78 + Math.max(0, position.visibility) * 0.22));
  marker.style.zIndex = String(Math.round(10 + position.visibility * 10));
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
    planet = new DigitalPlanet(document.querySelector("#scene"), projects, updateMarkerPosition);
    planet.initialize();
    window.setTimeout(() => app.classList.add("is-ready"), 650);
  } catch (error) {
    showWebGlFallback(error);
  }

  document.querySelector("#close-project").addEventListener("click", closeProject);
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