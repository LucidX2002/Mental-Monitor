const DEFAULT_NEUROTICISM_MIN = 0.7;
const DEFAULT_EXTRAVERSION_MAX = 0.35;

export function getDefaultThresholds() {
  return {
    neuroticismMin: DEFAULT_NEUROTICISM_MIN,
    extraversionMax: DEFAULT_EXTRAVERSION_MAX,
  };
}

export function getDefaultApiBase() {
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export function normalizeApiBase(candidate) {
  if (!candidate) {
    return getDefaultApiBase();
  }
  try {
    return new URL(candidate).toString().replace(/\/$/, "");
  } catch {
    return getDefaultApiBase();
  }
}

export function getStoredApiBase() {
  const urlParams = new URLSearchParams(window.location.search);
  const queryApiBase = urlParams.get("apiBase");
  if (queryApiBase) {
    window.localStorage.setItem("mentalApiBase", queryApiBase);
  }
  return normalizeApiBase(queryApiBase || window.localStorage.getItem("mentalApiBase"));
}

export function resetStoredApiBase() {
  window.localStorage.removeItem("mentalApiBase");
  return getDefaultApiBase();
}

export function apiUrl(apiBase, path, params = {}) {
  const url = new URL(path, apiBase);
  Object.entries(params).forEach(([key, value]) => {
    if (value === "" || value === null || value === undefined) {
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

export async function fetchJson(apiBase, path, params = {}, options = {}) {
  let response;
  try {
    response = await fetch(apiUrl(apiBase, path, params), {
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw error;
    }
    throw new Error("网络连接失败，请确认后端服务已启动。");
  }

  const contentType = response.headers.get("content-type") || "";
  let payload = null;

  if (contentType.includes("application/json")) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  } else {
    const rawText = await response.text();
    payload = { error: rawText || response.statusText };
  }

  if (!response.ok) {
    throw new Error(payload?.error || `请求失败（${response.status}）`);
  }

  return payload ?? {};
}

export function clearNode(node) {
  node.replaceChildren();
}

export function createNode(tag, { className = "", text = "", attrs = {}, dataset = {} } = {}) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== "") {
    node.textContent = text;
  }
  Object.entries(attrs).forEach(([key, value]) => {
    node.setAttribute(key, value);
  });
  Object.entries(dataset).forEach(([key, value]) => {
    node.dataset[key] = String(value);
  });
  return node;
}

export function createMetricRow(label, value, valueTag = "span") {
  const row = createNode("div", { className: "metric-row" });
  row.append(createNode("span", { text: label }), createNode(valueTag, { text: String(value) }));
  return row;
}

export function addInteractiveSelection(node, handler) {
  node.setAttribute("tabindex", "0");
  node.setAttribute("role", "button");
  node.addEventListener("click", handler);
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  });
}

export function caseStatusLabel(caseState) {
  const status = caseState?.status || "pending";
  const labels = {
    pending: "待处理",
    observing: "观察中",
    intervened: "已干预",
    false_positive: "误报",
  };
  return labels[status] || status;
}

export function createStatusTag(isAtRisk) {
  return createNode("span", {
    className: isAtRisk ? "risk-tag" : "safe-tag",
    text: isAtRisk ? "高风险" : "安全",
  });
}

export function createSection(title) {
  const section = createNode("section", { className: "section-block" });
  section.append(createNode("h4", { text: title }));
  return section;
}

export function setStatusLine(node, kind, text) {
  node.textContent = text;
  node.classList.remove("is-loading", "is-ok", "is-error");
  if (kind === "loading") {
    node.classList.add("is-loading");
  }
  if (kind === "ok") {
    node.classList.add("is-ok");
  }
  if (kind === "error") {
    node.classList.add("is-error");
  }
}

export function syncStatusCard(apiBaseNode, statusNode, apiBase, text, kind = "ok") {
  apiBaseNode.textContent = apiBase;
  setStatusLine(statusNode, kind, text);
}

export function bindThresholdControls({ neuroSlider, extraSlider, neuroValue, extraValue, state, onChange }) {
  function syncLabels() {
    neuroValue.textContent = Number(state.neuroticismMin).toFixed(2);
    extraValue.textContent = Number(state.extraversionMax).toFixed(2);
  }

  neuroSlider.value = String(state.neuroticismMin);
  extraSlider.value = String(state.extraversionMax);
  syncLabels();

  neuroSlider.addEventListener("input", (event) => {
    state.neuroticismMin = Number(event.target.value);
    syncLabels();
    onChange();
  });

  extraSlider.addEventListener("input", (event) => {
    state.extraversionMax = Number(event.target.value);
    syncLabels();
    onChange();
  });
}

export function debounce(fn, delay = 260) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

export function getThresholdQuery(state) {
  return {
    neuroticism_min: state.neuroticismMin,
    extraversion_max: state.extraversionMax,
  };
}

export function getNumericQueryParam(name) {
  const raw = new URLSearchParams(window.location.search).get(name);
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function updateUrlQuery(params) {
  const url = new URL(window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  });
  window.history.replaceState({}, "", url.toString());
}

export function setupPresentationMode({ toggleButton, pageClass }) {
  if (pageClass) {
    document.body.classList.add(pageClass);
  }

  function isPresentMode() {
    return new URLSearchParams(window.location.search).get("mode") === "present";
  }

  function syncModeUi() {
    const present = isPresentMode();
    document.body.classList.toggle("mode-present", present);
    if (toggleButton) {
      toggleButton.textContent = present ? "退出展示模式" : "答辩展示模式";
    }
  }

  syncModeUi();

  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      const url = new URL(window.location.href);
      if (isPresentMode()) {
        url.searchParams.delete("mode");
      } else {
        url.searchParams.set("mode", "present");
      }
      window.history.replaceState({}, "", url.toString());
      syncModeUi();
    });
  }
}

export function createBarList(items, { emptyText = "暂无数据", valueFormatter = (value) => String(value) } = {}) {
  if (!items.length) {
    return createNode("p", { className: "helper-text", text: emptyText });
  }

  const fragment = document.createDocumentFragment();
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  items.forEach((item) => {
    const row = createNode("div", { className: "bar-row" });
    const head = createNode("div", { className: "bar-row-head" });
    head.append(createNode("span", { text: item.label }), createNode("span", { text: valueFormatter(item.value) }));
    const track = createNode("div", { className: "bar-track" });
    const fill = createNode("div", { className: "bar-fill" });
    fill.style.width = `${(item.value / maxValue) * 100}%`;
    track.append(fill);
    row.append(head, track);
    fragment.append(row);
  });

  return fragment;
}

export function setPanelMessage(root, title, message) {
  root.classList.add("empty-state");
  clearNode(root);
  const wrapper = createNode("div");
  wrapper.append(createNode("strong", { text: title }), createNode("p", { className: "helper-text", text: message }));
  root.append(wrapper);
}

export function downloadTextFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function openPrintReport({ title, bodyHtml }) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=1024,height=900");
  if (!popup) {
    throw new Error("浏览器阻止了打印窗口，请允许弹窗后重试。");
  }

  popup.document.write(`<!DOCTYPE html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(title)}</title>
      <style>
        body {
          margin: 0;
          padding: 32px;
          color: #241f17;
          background: #f8f4ee;
          font-family: "IBM Plex Sans", "PingFang SC", "Noto Sans SC", sans-serif;
        }
        .report-shell {
          max-width: 960px;
          margin: 0 auto;
          background: #fffaf3;
          border: 1px solid rgba(36, 31, 23, 0.1);
          border-radius: 20px;
          padding: 28px;
        }
        h1, h2, h3 {
          margin-top: 0;
          font-family: "Iowan Old Style", "Noto Serif SC", serif;
        }
        .meta {
          margin-bottom: 24px;
          color: #6e665b;
          font-size: 14px;
        }
        .section {
          margin-bottom: 24px;
          padding-bottom: 18px;
          border-bottom: 1px solid rgba(36, 31, 23, 0.08);
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          padding: 10px 8px;
          text-align: left;
          border-bottom: 1px solid rgba(36, 31, 23, 0.1);
          font-size: 14px;
          vertical-align: top;
        }
        .chip {
          display: inline-block;
          margin: 0 6px 6px 0;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(176, 97, 56, 0.12);
          font-size: 12px;
        }
        .preview {
          margin: 8px 0;
          padding: 10px 12px;
          border: 1px solid rgba(36, 31, 23, 0.08);
          border-radius: 12px;
          background: rgba(36, 31, 23, 0.03);
          line-height: 1.6;
        }
        @media print {
          body { background: #fff; padding: 0; }
          .report-shell { border: 0; border-radius: 0; padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="report-shell">${bodyHtml}</div>
      <script>
        window.onload = () => setTimeout(() => window.print(), 120);
      </script>
    </body>
  </html>`);
  popup.document.close();
}

export function renderRadarChart(root, traits, { title = "五维人格分布" } = {}) {
  clearNode(root);
  root.classList.remove("empty-state");

  const entries = Object.entries(traits);
  if (!entries.length) {
    setPanelMessage(root, "暂无图形", "当前没有可绘制的五维特征数据。");
    return;
  }

  const labelsMap = {
    Agreeableness: "宜人性",
    Conscientiousness: "尽责性",
    Extraversion: "外向性",
    Neuroticism: "神经质",
    Openness: "开放性",
  };

  const size = 360;
  const center = size / 2;
  const radius = 112;
  const levels = 4;
  const svgNs = "http://www.w3.org/2000/svg";

  const wrapper = createNode("div", { className: "radar-card" });
  wrapper.append(createNode("strong", { text: title }));

  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("class", "radar-svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const toPoint = (value, index, scale = 1) => {
    const angle = (-Math.PI / 2) + (index / entries.length) * Math.PI * 2;
    const distance = value * radius * scale;
    return {
      x: center + Math.cos(angle) * distance,
      y: center + Math.sin(angle) * distance,
    };
  };

  for (let level = levels; level >= 1; level -= 1) {
    const scale = level / levels;
    const polygon = document.createElementNS(svgNs, "polygon");
    polygon.setAttribute(
      "points",
      entries
        .map((_, index) => {
          const point = toPoint(1, index, scale);
          return `${point.x},${point.y}`;
        })
        .join(" ")
    );
    polygon.setAttribute("fill", level === levels ? "rgba(176,97,56,0.04)" : "transparent");
    polygon.setAttribute("stroke", "rgba(36,31,23,0.12)");
    polygon.setAttribute("stroke-width", "1");
    svg.append(polygon);
  }

  entries.forEach(([label], index) => {
    const axisEnd = toPoint(1, index, 1.08);
    const axis = document.createElementNS(svgNs, "line");
    axis.setAttribute("x1", String(center));
    axis.setAttribute("y1", String(center));
    axis.setAttribute("x2", String(axisEnd.x));
    axis.setAttribute("y2", String(axisEnd.y));
    axis.setAttribute("stroke", "rgba(36,31,23,0.15)");
    axis.setAttribute("stroke-width", "1");
    svg.append(axis);

    const textPoint = toPoint(1, index, 1.22);
    const text = document.createElementNS(svgNs, "text");
    text.textContent = labelsMap[label] || label;
    text.setAttribute("x", String(textPoint.x));
    text.setAttribute("y", String(textPoint.y));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("class", "radar-label");
    svg.append(text);
  });

  const dataPolygon = document.createElementNS(svgNs, "polygon");
  dataPolygon.setAttribute(
    "points",
    entries
      .map(([, value], index) => {
        const point = toPoint(value, index);
        return `${point.x},${point.y}`;
      })
      .join(" ")
  );
  dataPolygon.setAttribute("fill", "rgba(176,97,56,0.16)");
  dataPolygon.setAttribute("stroke", "#b06138");
  dataPolygon.setAttribute("stroke-width", "2.5");
  svg.append(dataPolygon);

  entries.forEach(([, value], index) => {
    const point = toPoint(value, index);
    const dot = document.createElementNS(svgNs, "circle");
    dot.setAttribute("cx", String(point.x));
    dot.setAttribute("cy", String(point.y));
    dot.setAttribute("r", "4");
    dot.setAttribute("fill", "#8f4a26");
    svg.append(dot);
  });

  wrapper.append(svg);

  const list = createNode("div", { className: "radar-value-list" });
  entries.forEach(([label, value]) => {
    const row = createNode("div", { className: "radar-value-row" });
    row.append(
      createNode("span", { text: labelsMap[label] || label }),
      createNode("strong", { text: value.toFixed(2) })
    );
    list.append(row);
  });
  wrapper.append(list);
  root.append(wrapper);
}
