import {
  addInteractiveSelection,
  bindThresholdControls,
  clearNode,
  createBarList,
  createNode,
  fetchJson,
  getDefaultThresholds,
  getStoredApiBase,
  resetStoredApiBase,
  setPanelMessage,
  setStatusLine,
  syncStatusCard,
  debounce,
  getThresholdQuery,
  setupPresentationMode,
} from "./common.js";

const state = {
  ...getDefaultThresholds(),
  apiBase: getStoredApiBase(),
  abortController: null,
  requestId: 0,
};

const refs = {
  neuroSlider: document.querySelector("#neuro-slider"),
  extraSlider: document.querySelector("#extra-slider"),
  neuroValue: document.querySelector("#neuro-value"),
  extraValue: document.querySelector("#extra-value"),
  jumpUserInput: document.querySelector("#jump-user-input"),
  jumpUserButton: document.querySelector("#jump-user-button"),
  refreshButton: document.querySelector("#refresh-button"),
  presentationToggleButton: document.querySelector("#presentation-toggle-button"),
  presentationToggleButtonInline: document.querySelector("#presentation-toggle-button-inline"),
  resetApiButton: document.querySelector("#reset-api-button"),
  apiBaseValue: document.querySelector("#api-base-value"),
  backendStatus: document.querySelector("#backend-status"),
  statsGrid: document.querySelector("#stats-grid"),
  scatterRoot: document.querySelector("#scatter-root"),
  traitDistribution: document.querySelector("#trait-distribution"),
  riskBandDistribution: document.querySelector("#risk-band-distribution"),
  subredditDistribution: document.querySelector("#subreddit-distribution"),
};

function renderStats(summary) {
  clearNode(refs.statsGrid);
  const cards = [
    ["总用户数", summary.total_users],
    ["高风险人数", summary.at_risk_users],
    ["平均神经质", summary.avg_neuroticism.toFixed(2)],
    ["平均外向性", summary.avg_extraversion.toFixed(2)],
  ];

  cards.forEach(([label, value]) => {
    const card = createNode("article", { className: "stat-card" });
    card.append(createNode("p", { text: label }), createNode("strong", { text: String(value) }));
    refs.statsGrid.append(card);
  });
}

function renderScatter(points) {
  clearNode(refs.scatterRoot);
  refs.scatterRoot.classList.remove("empty-state");
  if (!points.length) {
    setPanelMessage(refs.scatterRoot, "暂无数据", "当前条件下没有可展示的用户画像分布。");
    return;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = 1180;
  const height = 500;
  const padding = 34;

  const xScale = (value) =>
    padding + ((value - minX) / Math.max(maxX - minX, 1e-6)) * (width - padding * 2);
  const yScale = (value) =>
    height - padding - ((value - minY) / Math.max(maxY - minY, 1e-6)) * (height - padding * 2);

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("class", "scatter-svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");

  const border = document.createElementNS(svgNs, "rect");
  border.setAttribute("x", "1");
  border.setAttribute("y", "1");
  border.setAttribute("width", String(width - 2));
  border.setAttribute("height", String(height - 2));
  border.setAttribute("rx", "24");
  border.setAttribute("fill", "transparent");
  border.setAttribute("stroke", "rgba(36,31,23,0.08)");
  svg.append(border);

  points.forEach((point) => {
    const circle = document.createElementNS(svgNs, "circle");
    circle.setAttribute("class", "scatter-point");
    circle.setAttribute("cx", xScale(point.x).toFixed(2));
    circle.setAttribute("cy", yScale(point.y).toFixed(2));
    circle.setAttribute("r", "4.5");
    circle.setAttribute("fill", point.is_at_risk ? "#b3402f" : "#2f7d63");
    circle.setAttribute("opacity", point.is_at_risk ? "0.92" : "0.68");
    circle.setAttribute("tabindex", "0");

    addInteractiveSelection(circle, () => {
      window.location.href = `./profile.html?user=${point.sim_user_id}`;
    });

    const title = document.createElementNS(svgNs, "title");
    title.textContent = `用户 ${point.sim_user_id}`;
    circle.append(title);
    svg.append(circle);
  });

  refs.scatterRoot.append(svg);
}

function renderDistribution(root, items, emptyText) {
  clearNode(root);
  root.append(
    createBarList(items, {
      emptyText,
      valueFormatter: (value) => `${value}`,
    })
  );
}

async function loadDashboard() {
  if (state.abortController) {
    state.abortController.abort();
  }

  const requestId = ++state.requestId;
  const controller = new AbortController();
  state.abortController = controller;

  refs.refreshButton.disabled = true;
  refs.refreshButton.textContent = "正在刷新…";
  syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `正在同步总览大屏 · ${state.apiBase}`, "loading");

  try {
    const payload = await fetchJson(
      state.apiBase,
      "/api/dashboard",
      { ...getThresholdQuery(state), scatter_limit: 900 },
      { signal: controller.signal }
    );

    if (requestId !== state.requestId) {
      return;
    }

    renderStats(payload.summary);
    renderScatter(payload.scatter.points || []);
    renderDistribution(
      refs.traitDistribution,
      Object.entries(payload.dominant_traits || {}).map(([label, value]) => ({ label, value })),
      "暂无人格分布数据。"
    );
    renderDistribution(
      refs.riskBandDistribution,
      Object.entries(payload.risk_bands || {}).map(([label, value]) => ({ label, value })),
      "暂无风险分层数据。"
    );
    renderDistribution(
      refs.subredditDistribution,
      (payload.top_subreddits || []).map((item) => ({ label: item.name, value: item.count })),
      "暂无社区板块分布。"
    );

    syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `大屏数据已更新 · ${state.apiBase}`, "ok");
  } catch (error) {
    if (error.name !== "AbortError") {
      setPanelMessage(refs.scatterRoot, "加载失败", error.message);
      clearNode(refs.traitDistribution);
      clearNode(refs.riskBandDistribution);
      clearNode(refs.subredditDistribution);
      syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `总览大屏加载失败 · ${error.message}`, "error");
    }
  } finally {
    if (requestId === state.requestId) {
      refs.refreshButton.disabled = false;
      refs.refreshButton.textContent = "刷新数据";
    }
  }
}

const debouncedRefresh = debounce(loadDashboard, 180);

bindThresholdControls({
  neuroSlider: refs.neuroSlider,
  extraSlider: refs.extraSlider,
  neuroValue: refs.neuroValue,
  extraValue: refs.extraValue,
  state,
  onChange: debouncedRefresh,
});

refs.refreshButton.addEventListener("click", () => {
  loadDashboard();
});

refs.resetApiButton.addEventListener("click", () => {
  state.apiBase = resetStoredApiBase();
  syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `已恢复默认接口 · ${state.apiBase}`, "loading");
  loadDashboard();
});

refs.jumpUserButton.addEventListener("click", () => {
  const userId = refs.jumpUserInput.value.trim();
  if (!userId) {
    return;
  }
  window.location.href = `./profile.html?user=${encodeURIComponent(userId)}`;
});

refs.jumpUserInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    refs.jumpUserButton.click();
  }
});

syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, "正在准备总览大屏…", "loading");
setupPresentationMode({
  toggleButton: refs.presentationToggleButton,
  pageClass: "page-dashboard",
});
setupPresentationMode({
  toggleButton: refs.presentationToggleButtonInline,
  pageClass: "page-dashboard",
});
loadDashboard();
