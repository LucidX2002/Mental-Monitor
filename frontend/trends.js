import {
  bindThresholdControls,
  clearNode,
  createBarList,
  createNode,
  fetchJson,
  getDefaultThresholds,
  getStoredApiBase,
  resetStoredApiBase,
  setPanelMessage,
  syncStatusCard,
  debounce,
  getThresholdQuery,
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
  refreshButton: document.querySelector("#refresh-button"),
  resetApiButton: document.querySelector("#reset-api-button"),
  apiBaseValue: document.querySelector("#api-base-value"),
  backendStatus: document.querySelector("#backend-status"),
  timelineChart: document.querySelector("#timeline-chart"),
  groupComparison: document.querySelector("#group-comparison"),
};

function renderTimeline(points) {
  clearNode(refs.timelineChart);
  refs.timelineChart.classList.remove("empty-state");
  if (!points.length) {
    setPanelMessage(refs.timelineChart, "暂无趋势数据", "当前数据中没有可用于趋势分析的时间记录。");
    return;
  }

  const wrapper = createNode("div", { className: "timeline-list" });
  const maxPosts = Math.max(...points.map((item) => item.post_count), 1);

  points.forEach((item) => {
    const row = createNode("article", { className: "timeline-row" });
    const head = createNode("div", { className: "timeline-row-head" });
    head.append(
      createNode("strong", { text: item.month }),
      createNode("span", {
        className: "helper-text",
        text: `总发帖 ${item.post_count} · 高风险发帖 ${item.risk_post_count} · 活跃用户 ${item.active_user_count}`,
      })
    );

    const track = createNode("div", { className: "timeline-track" });
    const totalBar = createNode("div", { className: "timeline-fill" });
    totalBar.style.width = `${(item.post_count / maxPosts) * 100}%`;
    const riskBar = createNode("div", { className: "timeline-fill risk" });
    riskBar.style.width = `${(item.risk_post_count / maxPosts) * 100}%`;
    track.append(totalBar, riskBar);
    row.append(head, track);
    wrapper.append(row);
  });

  refs.timelineChart.append(wrapper);
}

function renderGroupComparison(groups) {
  clearNode(refs.groupComparison);
  const mapping = [
    ["high_risk", "高风险群体"],
    ["stable", "相对稳定群体"],
    ["overall", "总体样本"],
  ];

  mapping.forEach(([key, label]) => {
    const data = groups[key];
    const card = createNode("article", { className: "comparison-card" });
    card.append(createNode("strong", { text: label }));
    card.append(
      createNode("p", { className: "helper-text", text: `用户数：${data.user_count}` }),
      createNode("p", { className: "helper-text", text: `平均日发帖：${data.avg_posts_per_day.toFixed(2)}` }),
      createNode("p", { className: "helper-text", text: `平均夜间活跃占比：${data.avg_night_ratio.toFixed(2)}` }),
      createNode("p", { className: "helper-text", text: `平均发帖总数：${data.avg_post_count.toFixed(2)}` })
    );
    refs.groupComparison.append(card);
  });
}

async function loadTrends() {
  if (state.abortController) {
    state.abortController.abort();
  }

  const requestId = ++state.requestId;
  const controller = new AbortController();
  state.abortController = controller;

  refs.refreshButton.disabled = true;
  refs.refreshButton.textContent = "正在刷新…";
  syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `正在同步趋势数据 · ${state.apiBase}`, "loading");

  try {
    const payload = await fetchJson(
      state.apiBase,
      "/api/trends",
      getThresholdQuery(state),
      { signal: controller.signal }
    );

    if (requestId !== state.requestId) {
      return;
    }

    renderTimeline(payload.monthly_activity || []);
    renderGroupComparison(payload.group_comparison || {});
    syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `趋势分析已更新 · ${state.apiBase}`, "ok");
  } catch (error) {
    if (error.name !== "AbortError") {
      setPanelMessage(refs.timelineChart, "加载失败", error.message);
      clearNode(refs.groupComparison);
      syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `趋势分析加载失败 · ${error.message}`, "error");
    }
  } finally {
    if (requestId === state.requestId) {
      refs.refreshButton.disabled = false;
      refs.refreshButton.textContent = "刷新趋势";
    }
  }
}

const debouncedRefresh = debounce(loadTrends, 180);

bindThresholdControls({
  neuroSlider: refs.neuroSlider,
  extraSlider: refs.extraSlider,
  neuroValue: refs.neuroValue,
  extraValue: refs.extraValue,
  state,
  onChange: debouncedRefresh,
});

refs.refreshButton.addEventListener("click", () => {
  loadTrends();
});

refs.resetApiButton.addEventListener("click", () => {
  state.apiBase = resetStoredApiBase();
  syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `已恢复默认接口 · ${state.apiBase}`, "loading");
  loadTrends();
});

syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, "正在准备趋势分析页面…", "loading");
loadTrends();
