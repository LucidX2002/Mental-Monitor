import {
  bindThresholdControls,
  clearNode,
  createMetricRow,
  createNode,
  createSection,
  createStatusTag,
  fetchJson,
  getDefaultThresholds,
  getNumericQueryParam,
  getStoredApiBase,
  renderRadarChart,
  resetStoredApiBase,
  setPanelMessage,
  syncStatusCard,
  debounce,
  getThresholdQuery,
  caseStatusLabel,
  updateUrlQuery,
  downloadTextFile,
  openPrintReport,
  escapeHtml,
} from "./common.js";

const PROFILE_TABS = [
  { id: "overview", label: "总览" },
  { id: "risk", label: "风险与记录" },
  { id: "timeline", label: "趋势分析" },
  { id: "compare", label: "相似对比" },
  { id: "posts", label: "帖子样本" },
];

const requestedTab = new URLSearchParams(window.location.search).get("tab");
const initialTab = PROFILE_TABS.some((tab) => tab.id === requestedTab) ? requestedTab : "overview";

const state = {
  ...getDefaultThresholds(),
  apiBase: getStoredApiBase(),
  selectedUserId: getNumericQueryParam("user"),
  selectedComparisonUserId: null,
  activeProfileTab: initialTab,
  query: "",
  searchAbortController: null,
  detailAbortController: null,
  comparisonAbortController: null,
  timelineAbortController: null,
  searchRequestId: 0,
  detailRequestId: 0,
  comparisonRequestId: 0,
  timelineRequestId: 0,
  currentDetail: null,
  currentRecommendations: [],
  currentTimeline: null,
  expandedTimelineIndex: null,
  comparisonCache: new Map(),
};

const refs = {
  searchInput: document.querySelector("#search-input"),
  resultCount: document.querySelector("#result-count"),
  candidateList: document.querySelector("#candidate-list"),
  neuroSlider: document.querySelector("#neuro-slider"),
  extraSlider: document.querySelector("#extra-slider"),
  neuroValue: document.querySelector("#neuro-value"),
  extraValue: document.querySelector("#extra-value"),
  refreshButton: document.querySelector("#refresh-button"),
  exportReportButton: document.querySelector("#export-report-button"),
  resetApiButton: document.querySelector("#reset-api-button"),
  apiBaseValue: document.querySelector("#api-base-value"),
  backendStatus: document.querySelector("#backend-status"),
  detailRoot: document.querySelector("#detail-root"),
};

function syncExportButton() {
  refs.exportReportButton.disabled = !state.currentDetail;
}

function setActiveProfileTab(tabId) {
  state.activeProfileTab = tabId;
  updateUrlQuery({ user: state.selectedUserId, tab: tabId });
  if (state.currentDetail) {
    renderDetail(state.currentDetail, state.currentRecommendations);
    if (tabId === "compare" && state.selectedComparisonUserId) {
      loadComparisonDetail(state.selectedComparisonUserId);
    }
  }
}

function renderProfileTabBar() {
  const nav = createNode("div", { className: "profile-tab-bar" });
  PROFILE_TABS.forEach((tab) => {
    const button = createNode("button", {
      className: `profile-tab ${state.activeProfileTab === tab.id ? "active" : ""}`,
      text: tab.label,
      attrs: { type: "button" },
    });
    button.addEventListener("click", () => {
      setActiveProfileTab(tab.id);
    });
    nav.append(button);
  });
  return nav;
}

function renderTraits(traits) {
  const fragment = document.createDocumentFragment();
  Object.entries(traits).forEach(([label, value]) => {
    const row = createNode("div", { className: "trait-row" });
    const header = createNode("header");
    header.append(createNode("span", { text: label }), createNode("span", { text: value.toFixed(2) }));
    const bar = createNode("div", { className: "trait-bar" });
    const fill = createNode("span");
    fill.style.width = `${(value * 100).toFixed(1)}%`;
    bar.append(fill);
    row.append(header, bar);
    fragment.append(row);
  });
  return fragment;
}

function renderBehavior(behavior) {
  const fragment = document.createDocumentFragment();
  [
    ["发帖总数", behavior.post_count],
    ["平均字数", behavior.avg_words.toFixed(1)],
    ["平均字符数", behavior.avg_chars.toFixed(1)],
    ["日均发帖", behavior.posts_per_day.toFixed(2)],
    ["熬夜占比", behavior.night_ratio.toFixed(2)],
    ["工作日占比", behavior.weekday_ratio.toFixed(2)],
  ].forEach(([label, value]) => {
    fragment.append(createMetricRow(label, value, "strong"));
  });
  return fragment;
}

function renderRecommendations(recommendations) {
  if (!recommendations.length) {
    return createNode("p", { className: "helper-text", text: "暂无推荐结果。" });
  }

  const fragment = document.createDocumentFragment();
  recommendations.forEach((item) => {
    const card = createNode("button", {
      className: `recommendation-card ${item.sim_user_id === state.selectedComparisonUserId ? "active" : ""}`,
      attrs: { type: "button" },
    });
    card.append(
      createNode("strong", { text: `#${item.sim_user_id} · ${item.dominant_trait}` }),
      createNode("p", { className: "helper-text", text: item.comparison_hint || "该用户在融合空间中与当前用户更接近。" })
    );
    card.append(
      createMetricRow("相似度", item.score.toFixed(3)),
      createMetricRow("神经质", item.prob_neuroticism.toFixed(2)),
      createMetricRow("外向性", item.prob_extraversion.toFixed(2))
    );
    if ((item.subreddits || []).length > 0) {
      const subredditLine = createNode("div", { className: "subreddit-list compact" });
      item.subreddits.forEach((subreddit) => {
        subredditLine.append(createNode("span", { className: "subreddit-chip", text: subreddit }));
      });
      card.append(subredditLine);
    }
    if ((item.post_preview || []).length > 0) {
      const previewBlock = createNode("div", { className: "preview-list" });
      item.post_preview.forEach((preview, index) => {
        const previewCard = createNode("div", { className: "preview-card" });
        previewCard.append(
          createNode("strong", { text: `发帖摘录 ${index + 1}` }),
          createNode("p", { className: "helper-text", text: preview })
        );
        previewBlock.append(previewCard);
      });
      card.append(previewBlock);
    }
    card.addEventListener("click", () => {
      selectComparisonUser(item.sim_user_id);
    });
    fragment.append(card);
  });
  return fragment;
}

function renderRecommendationSection(recommendations) {
  const section = createSection("相似用户推荐");
  section.classList.add("recommendation-anchor");
  const recommendationList = createNode("div", { className: "recommendation-list" });
  recommendationList.append(renderRecommendations(recommendations));
  section.append(recommendationList);
  return section;
}

function renderPosts(posts, dates, subreddits) {
  if (!posts.length) {
    return createNode("p", { className: "helper-text", text: "暂无帖子样本。" });
  }

  const fragment = document.createDocumentFragment();
  posts.slice(0, 4).forEach((post, index) => {
    const date = dates[index] || "未知时间";
    const subreddit = subreddits[index] || subreddits[0] || "unknown";
    const card = createNode("article", { className: "post-card" });
    card.append(
      createNode("strong", { text: `${subreddit} · ${String(date).slice(0, 10)}` }),
      createNode("div", { text: post })
    );
    fragment.append(card);
  });
  return fragment;
}

function renderCompactPosts(posts, dates, subreddits, limit = 2) {
  if (!posts.length) {
    return createNode("p", { className: "helper-text", text: "暂无可比较的帖子内容。" });
  }

  const fragment = document.createDocumentFragment();
  posts.slice(0, limit).forEach((post, index) => {
    const date = dates[index] || "未知时间";
    const subreddit = subreddits[index] || subreddits[0] || "unknown";
    const card = createNode("div", { className: "preview-card" });
    card.append(
      createNode("strong", { text: `${subreddit} · ${String(date).slice(0, 10)}` }),
      createNode("p", { className: "helper-text", text: post })
    );
    fragment.append(card);
  });
  return fragment;
}

function buildRiskReasons(detail) {
  const reasons = [];
  const traits = detail.traits;
  const behavior = detail.behavior;

  if (traits.Neuroticism >= state.neuroticismMin) {
    reasons.push(`神经质得分 ${traits.Neuroticism.toFixed(2)} 高于当前阈值 ${state.neuroticismMin.toFixed(2)}。`);
  }
  if (traits.Extraversion <= state.extraversionMax) {
    reasons.push(`外向性得分 ${traits.Extraversion.toFixed(2)} 低于当前上限 ${state.extraversionMax.toFixed(2)}。`);
  }
  if (behavior.night_ratio >= 0.75) {
    reasons.push(`夜间活跃占比较高（${behavior.night_ratio.toFixed(2)}），存在作息异常或情绪波动风险。`);
  }
  if (behavior.posts_per_day >= 0.1) {
    reasons.push(`日均发帖频率较高（${behavior.posts_per_day.toFixed(2)}），建议结合文本内容继续观察。`);
  }
  if (reasons.length === 0) {
    reasons.push("当前用户暂未触发明显高风险规则，但仍建议结合历史趋势和文本内容综合判断。");
  }

  return reasons;
}

function renderRiskExplanation(detail) {
  const section = createSection("风险解释");
  const card = createNode("article", {
    className: `verdict-card ${detail.is_at_risk ? "verdict-danger" : "verdict-safe"}`,
  });
  card.append(
    createNode("strong", {
      text: detail.is_at_risk ? "当前用户已触发高风险规则" : "当前用户暂未触发高风险规则",
    })
  );
  const list = createNode("ul", { className: "reason-list" });
  buildRiskReasons(detail).forEach((reason) => {
    list.append(createNode("li", { text: reason }));
  });
  card.append(list);
  section.append(card);
  return section;
}

function renderComparisonCard(detail, title, subtitle) {
  const card = createNode("article", { className: "comparison-card detail-compare-card" });
  card.append(
    createNode("strong", { text: title }),
    createNode("p", { className: "helper-text", text: subtitle })
  );

  const metricList = createNode("div", { className: "metric-list compact" });
  [
    ["主导人格", detail.dominant_trait],
    ["主导分数", detail.dominant_score.toFixed(2)],
    ["神经质", detail.traits.Neuroticism.toFixed(2)],
    ["外向性", detail.traits.Extraversion.toFixed(2)],
    ["日均发帖", detail.behavior.posts_per_day.toFixed(2)],
    ["熬夜占比", detail.behavior.night_ratio.toFixed(2)],
  ].forEach(([label, value]) => {
    metricList.append(createMetricRow(label, value, "strong"));
  });

  const previews = createNode("div", { className: "preview-list" });
  previews.append(renderCompactPosts(detail.posts, detail.dates, detail.subreddits, 2));

  card.append(metricList, previews);
  return card;
}

function renderComparisonSection(currentDetail, comparisonDetail) {
  const section = createSection("相似用户对比");
  const helper = createNode("p", {
    className: "helper-text",
    text: "点击上方任一相似用户卡片，可切换下方对比对象，直接比较人格、行为和帖子摘要。",
  });
  const grid = createNode("div", { className: "detail-compare-grid" });
  grid.append(
    renderComparisonCard(
      currentDetail,
      `当前用户 #${currentDetail.sim_user_id}`,
      `${currentDetail.dominant_trait} · 主导分数 ${currentDetail.dominant_score.toFixed(2)}`
    ),
    renderComparisonCard(
      comparisonDetail,
      `相似用户 #${comparisonDetail.sim_user_id}`,
      `${comparisonDetail.dominant_trait} · 主导分数 ${comparisonDetail.dominant_score.toFixed(2)}`
    )
  );
  section.append(helper, grid);
  section.classList.add("comparison-anchor");
  return section;
}

function renderHistorySection(detail) {
  const section = createSection("处置记录时间线");
  const history = detail.case_state?.history || [];
  if (!history.length) {
    section.append(createNode("p", { className: "helper-text", text: "当前还没有处置记录。" }));
    return section;
  }

  const timeline = createNode("div", { className: "timeline-mini" });
  [...history]
    .reverse()
    .forEach((entry) => {
      const item = createNode("article", { className: "timeline-mini-item" });
      item.append(
        createNode("strong", {
          text: `${entry.status} · ${String(entry.ts).slice(0, 19).replace("T", " ")}`,
        }),
        createNode("p", { className: "helper-text", text: entry.note || "无备注" })
      );
      timeline.append(item);
    });
  section.append(timeline);
  return section;
}

function renderTimelineSection(timeline) {
  const section = createSection("单用户趋势分析");
  section.classList.add("timeline-anchor");
  if (!timeline || !(timeline.events || []).length) {
    section.append(createNode("p", { className: "helper-text", text: "当前用户缺少可用于趋势分析的时间序列数据。" }));
    return section;
  }

  const summaryGrid = createNode("div", { className: "profile-trend-summary" });
  [
    ["发帖条数", timeline.summary.post_count],
    ["平均情绪风险值", timeline.summary.avg_emotion_score.toFixed(2)],
    ["最高情绪风险值", timeline.summary.max_emotion_score.toFixed(2)],
    ["最近发帖日期", timeline.summary.latest_date],
  ].forEach(([label, value]) => {
    const card = createNode("article", { className: "mini-stat-card" });
    card.append(createNode("p", { text: label }), createNode("strong", { text: String(value) }));
    summaryGrid.append(card);
  });

  const timelineList = createNode("div", { className: "timeline-list" });
  const maxScore = Math.max(...timeline.events.map((item) => item.emotion_score), 1e-6);
  timeline.events.forEach((event, index) => {
    const row = createNode("button", {
      className: `timeline-row ${state.expandedTimelineIndex === index ? "expanded" : ""}`,
      attrs: { type: "button" },
    });
    const head = createNode("div", { className: "timeline-row-head" });
    head.append(
      createNode("strong", { text: `${event.date} · ${event.subreddit}` }),
      createNode("span", { className: "helper-text", text: `情绪风险值 ${event.emotion_score.toFixed(2)}` })
    );
    const track = createNode("div", { className: "timeline-track" });
    const fill = createNode("div", { className: `timeline-fill ${event.emotion_score >= 0.65 ? "risk" : ""}` });
    fill.style.width = `${(event.emotion_score / maxScore) * 100}%`;
    track.append(fill);
    row.append(
      head,
      track,
      createNode("p", { className: "helper-text", text: event.post_preview }),
      createNode("p", {
        className: "helper-text timeline-tip",
        text: state.expandedTimelineIndex === index ? "再次点击可收起完整帖子" : "点击查看完整帖子内容",
      })
    );
    if (state.expandedTimelineIndex === index) {
      row.append(createNode("div", { className: "timeline-full-post", text: event.post_full || event.post_preview }));
    }
    row.addEventListener("click", () => {
      state.expandedTimelineIndex = state.expandedTimelineIndex === index ? null : index;
      replaceTimelineSection();
    });
    timelineList.append(row);
  });

  section.append(summaryGrid, timelineList);
  return section;
}

function replaceSection(selector, nextSection) {
  const existing = refs.detailRoot.querySelector(selector);
  if (existing) {
    existing.replaceWith(nextSection);
  }
}

function replaceTimelineSection() {
  replaceSection(".timeline-anchor", renderTimelineSection(state.currentTimeline));
}

function replaceRecommendationSection() {
  replaceSection(".recommendation-anchor", renderRecommendationSection(state.currentRecommendations));
}

function exportCurrentProfileReport() {
  if (!state.currentDetail) {
    return;
  }

  const detail = state.currentDetail;
  const historyRows = (detail.case_state?.history || [])
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(String(entry.ts).slice(0, 19).replace("T", " "))}</td>
          <td>${escapeHtml(entry.status)}</td>
          <td>${escapeHtml(entry.note || "无备注")}</td>
        </tr>`
    )
    .join("");

  const postBlocks = (detail.posts || [])
    .slice(0, 3)
    .map((post, index) => `<div class="preview"><strong>摘录 ${index + 1}</strong><div>${escapeHtml(post)}</div></div>`)
    .join("");

  const bodyHtml = `
    <div class="section">
      <h1>用户画像报告</h1>
      <div class="meta">用户 #${detail.sim_user_id} · 导出时间：${escapeHtml(new Date().toLocaleString("zh-CN"))}</div>
      <p>主导人格：${escapeHtml(detail.dominant_trait)} · 主导分数：${detail.dominant_score.toFixed(2)}</p>
    </div>
    <div class="section">
      <h2>核心指标</h2>
      <table>
        <tbody>
          <tr><td>神经质</td><td>${detail.traits.Neuroticism.toFixed(2)}</td></tr>
          <tr><td>外向性</td><td>${detail.traits.Extraversion.toFixed(2)}</td></tr>
          <tr><td>发帖总数</td><td>${detail.behavior.post_count}</td></tr>
          <tr><td>日均发帖</td><td>${detail.behavior.posts_per_day.toFixed(2)}</td></tr>
          <tr><td>熬夜占比</td><td>${detail.behavior.night_ratio.toFixed(2)}</td></tr>
          <tr><td>当前状态</td><td>${escapeHtml(caseStatusLabel(detail.case_state))}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="section">
      <h2>社区板块</h2>
      <div>${(detail.subreddits || []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}</div>
    </div>
    <div class="section">
      <h2>帖子摘录</h2>
      ${postBlocks || "<p>暂无帖子摘录。</p>"}
    </div>
    <div class="section">
      <h2>处置记录</h2>
      <table>
        <thead><tr><th>时间</th><th>状态</th><th>备注</th></tr></thead>
        <tbody>${historyRows || '<tr><td colspan=\"3\">暂无处置记录</td></tr>'}</tbody>
      </table>
    </div>
  `;

  openPrintReport({
    title: `用户画像报告 #${detail.sim_user_id}`,
    bodyHtml,
  });
}

async function saveCaseState(userId, status, note, button) {
  button.disabled = true;
  button.textContent = "保存中…";
  try {
    await fetchJson(
      state.apiBase,
      `/api/users/${userId}/case-state`,
      {},
      {
        method: "POST",
        body: JSON.stringify({ status, note }),
      }
    );
    await Promise.all([loadCandidates(), loadDetail(userId)]);
    syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `画像状态已更新 · ${state.apiBase}`, "ok");
  } catch (error) {
    syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `状态保存失败 · ${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = "保存状态";
  }
}

function renderDetail(detail, recommendations) {
  refs.detailRoot.classList.remove("empty-state");
  clearNode(refs.detailRoot);

  const hero = createNode("section", { className: "detail-hero" });
  const heroText = createNode("div");
  heroText.append(
    createNode("h3", { text: `用户 #${detail.sim_user_id}` }),
    createNode("p", {
      className: "detail-sub",
      text: `${detail.dominant_trait} · 主导分数 ${detail.dominant_score.toFixed(2)}`,
    })
  );
  const heroStatus = createNode("div");
  heroStatus.append(createStatusTag(detail.is_at_risk));
  hero.append(heroText, heroStatus);

  const overviewSection = createSection("人格画像总览");
  const overviewGrid = createNode("div", { className: "profile-overview-grid" });
  const radarPane = createNode("div", { className: "profile-radar-pane radar-shell" });
  renderRadarChart(radarPane, detail.traits, { title: "五维人格雷达图" });
  const scorePane = createNode("div", { className: "profile-score-pane" });
  scorePane.append(
    createNode("strong", { text: "五维具体得分" }),
    createNode("p", {
      className: "helper-text",
      text: "左侧雷达图展示整体形状，右侧分数更适合逐项比对与答辩讲解。",
    })
  );
  const traitList = createNode("div", { className: "trait-list" });
  traitList.append(renderTraits(detail.traits));
  scorePane.append(traitList);
  overviewGrid.append(radarPane, scorePane);
  overviewSection.append(overviewGrid);

  const caseSection = createSection("处置状态");
  const caseForm = createNode("form", { className: "case-form" });
  const statusSelect = createNode("select");
  [
    ["pending", "待处理"],
    ["observing", "观察中"],
    ["intervened", "已干预"],
    ["false_positive", "误报"],
  ].forEach(([value, label]) => {
    statusSelect.append(createNode("option", { text: label, attrs: { value } }));
  });
  statusSelect.value = detail.case_state?.status || "pending";

  const noteInput = createNode("textarea", {
    attrs: { placeholder: "补充干预记录、跟踪说明或误报原因。" },
  });
  const actionRow = createNode("div", { className: "inline-actions" });
  const submitButton = createNode("button", {
    className: "button primary",
    text: "保存状态",
    attrs: { type: "submit" },
  });
  actionRow.append(
    submitButton,
    createNode("span", {
      className: "helper-text",
      text: `当前状态：${caseStatusLabel(detail.case_state)}`,
    })
  );
  caseForm.append(statusSelect, noteInput, actionRow);
  caseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveCaseState(detail.sim_user_id, statusSelect.value, noteInput.value.trim(), submitButton);
    noteInput.value = "";
  });
  caseSection.append(caseForm);

  const behaviorSection = createSection("行为摘要");
  const metricList = createNode("div", { className: "metric-list" });
  metricList.append(renderBehavior(detail.behavior));
  behaviorSection.append(metricList);

  const subredditSection = createSection("社区板块分布");
  const subredditList = createNode("div", { className: "subreddit-list" });
  detail.subreddits.forEach((item) => {
    subredditList.append(createNode("span", { className: "subreddit-chip", text: item }));
  });
  subredditSection.append(subredditList);

  const recommendationSection = renderRecommendationSection(recommendations);
  const comparisonPlaceholder = createNode("div", { className: "comparison-anchor" });

  const riskExplanationSection = renderRiskExplanation(detail);
  const historySection = renderHistorySection(detail);
  const timelineSection = renderTimelineSection(state.currentTimeline);

  const postsSection = createSection("帖子样本");
  const postList = createNode("div", { className: "post-list" });
  postList.append(renderPosts(detail.posts, detail.dates, detail.subreddits));
  postsSection.append(postList);

  const tabBar = renderProfileTabBar();
  const tabPanel = createNode("div", { className: "profile-tab-panel" });

  if (state.activeProfileTab === "overview") {
    tabPanel.append(overviewSection, behaviorSection, subredditSection);
  } else if (state.activeProfileTab === "risk") {
    tabPanel.append(caseSection, historySection, riskExplanationSection);
  } else if (state.activeProfileTab === "timeline") {
    tabPanel.append(timelineSection);
  } else if (state.activeProfileTab === "compare") {
    tabPanel.append(recommendationSection, comparisonPlaceholder);
  } else if (state.activeProfileTab === "posts") {
    tabPanel.append(postsSection);
  } else {
    tabPanel.append(overviewSection, behaviorSection, subredditSection);
  }

  refs.detailRoot.append(hero, tabBar, tabPanel);
}

function setDetailLoading() {
  setPanelMessage(refs.detailRoot, "加载中", "正在读取用户详细画像。");
}

async function loadDetail(userId) {
  if (!userId) {
    setPanelMessage(refs.detailRoot, "等待选择", "请先在左侧候选列表中选择一个用户。");
    return;
  }

  if (state.detailAbortController) {
    state.detailAbortController.abort();
  }
  if (state.timelineAbortController) {
    state.timelineAbortController.abort();
  }

  const requestId = ++state.detailRequestId;
  const controller = new AbortController();
  state.detailAbortController = controller;
  const timelineRequestId = ++state.timelineRequestId;
  const timelineController = new AbortController();
  state.timelineAbortController = timelineController;
  state.selectedUserId = userId;
  updateUrlQuery({ user: userId, tab: state.activeProfileTab });
  setDetailLoading();

  try {
    const [detail, recommendations, timeline] = await Promise.all([
      fetchJson(state.apiBase, `/api/users/${userId}`, getThresholdQuery(state), { signal: controller.signal }),
      fetchJson(state.apiBase, `/api/users/${userId}/recommendations`, { k: 5 }, { signal: controller.signal }),
      fetchJson(state.apiBase, `/api/users/${userId}/timeline`, {}, { signal: timelineController.signal }),
    ]);

    if (requestId !== state.detailRequestId || timelineRequestId !== state.timelineRequestId) {
      return;
    }

    state.currentDetail = detail;
    state.currentRecommendations = recommendations;
    state.currentTimeline = timeline;
    state.expandedTimelineIndex = null;
    syncExportButton();
    if (
      recommendations.length > 0 &&
      (!state.selectedComparisonUserId || !recommendations.some((item) => item.sim_user_id === state.selectedComparisonUserId))
    ) {
      state.selectedComparisonUserId = recommendations[0].sim_user_id;
    }

    renderDetail(detail, recommendations);
    if (state.selectedComparisonUserId) {
      await loadComparisonDetail(state.selectedComparisonUserId);
    }
    syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `已读取用户 #${userId} 的画像 · ${state.apiBase}`, "ok");
  } catch (error) {
    if (error.name !== "AbortError") {
      state.currentDetail = null;
      syncExportButton();
      setPanelMessage(refs.detailRoot, "加载失败", error.message);
      syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `个体画像加载失败 · ${error.message}`, "error");
    }
  }
}

async function loadComparisonDetail(userId) {
  if (!state.currentDetail) {
    return;
  }

  if (state.comparisonCache.has(userId)) {
    const comparisonSection = renderComparisonSection(state.currentDetail, state.comparisonCache.get(userId));
    const existing = refs.detailRoot.querySelector(".comparison-anchor");
    if (existing) {
      existing.replaceWith(comparisonSection);
    }
    return;
  }

  if (state.comparisonAbortController) {
    state.comparisonAbortController.abort();
  }

  const requestId = ++state.comparisonRequestId;
  const controller = new AbortController();
  state.comparisonAbortController = controller;

  try {
    const comparisonDetail = await fetchJson(
      state.apiBase,
      `/api/users/${userId}`,
      getThresholdQuery(state),
      { signal: controller.signal }
    );

    if (requestId !== state.comparisonRequestId) {
      return;
    }

    state.comparisonCache.set(userId, comparisonDetail);
    const comparisonSection = renderComparisonSection(state.currentDetail, comparisonDetail);
    const existing = refs.detailRoot.querySelector(".comparison-anchor");
    if (existing) {
      existing.replaceWith(comparisonSection);
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `相似用户对比加载失败 · ${error.message}`, "error");
    }
  }
}

function selectComparisonUser(userId) {
  state.selectedComparisonUserId = userId;
  if (state.currentDetail) {
    replaceRecommendationSection();
    loadComparisonDetail(userId);
  }
}

function renderCandidateList(items) {
  clearNode(refs.candidateList);
  refs.candidateList.classList.remove("empty-state");
  refs.resultCount.textContent = `${items.length} 条`;

  if (!items.length) {
    refs.candidateList.append(createNode("p", { className: "helper-text", text: "没有匹配用户。" }));
    return;
  }

  items.forEach((item) => {
    const card = createNode("button", {
      className: `candidate-card ${item.sim_user_id === state.selectedUserId ? "active" : ""}`,
      attrs: { type: "button" },
    });
    card.append(
      createNode("strong", { text: `#${item.sim_user_id} · ${item.dominant_trait}` }),
      createNode("p", { className: "helper-text", text: `神经质 ${item.prob_neuroticism.toFixed(2)} / 外向性 ${item.prob_extraversion.toFixed(2)}` })
    );
    card.addEventListener("click", () => {
      state.selectedComparisonUserId = null;
      loadDetail(item.sim_user_id);
      renderCandidateList(items);
    });
    refs.candidateList.append(card);
  });
}

async function loadCandidates() {
  if (state.searchAbortController) {
    state.searchAbortController.abort();
  }

  const requestId = ++state.searchRequestId;
  const controller = new AbortController();
  state.searchAbortController = controller;

  syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `正在同步候选用户 · ${state.apiBase}`, "loading");

  try {
    const payload = await fetchJson(
      state.apiBase,
      "/api/users",
      {
        ...getThresholdQuery(state),
        limit: 12,
        q: state.query,
      },
      { signal: controller.signal }
    );

    if (requestId !== state.searchRequestId) {
      return;
    }

    const items = payload.items || [];
    renderCandidateList(items);

    if (!items.length) {
      state.selectedUserId = null;
      state.selectedComparisonUserId = null;
      state.currentDetail = null;
      state.currentRecommendations = [];
      state.currentTimeline = null;
      state.expandedTimelineIndex = null;
      syncExportButton();
      setPanelMessage(refs.detailRoot, "无匹配结果", "当前检索条件下没有匹配用户。");
    } else if (!state.selectedUserId && items[0]) {
      state.selectedComparisonUserId = null;
      loadDetail(items[0].sim_user_id);
    } else if (state.selectedUserId && !items.some((item) => item.sim_user_id === state.selectedUserId) && items[0]) {
      state.selectedComparisonUserId = null;
      loadDetail(items[0].sim_user_id);
    }

    syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `候选用户已更新 · ${state.apiBase}`, "ok");
  } catch (error) {
    if (error.name !== "AbortError") {
      clearNode(refs.candidateList);
      refs.candidateList.append(createNode("p", { className: "helper-text", text: "候选列表加载失败。" }));
      syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `候选用户加载失败 · ${error.message}`, "error");
    }
  }
}

const debouncedSearch = debounce(loadCandidates, 240);

bindThresholdControls({
  neuroSlider: refs.neuroSlider,
  extraSlider: refs.extraSlider,
  neuroValue: refs.neuroValue,
  extraValue: refs.extraValue,
  state,
  onChange: () => {
    loadCandidates();
    if (state.selectedUserId) {
      loadDetail(state.selectedUserId);
    }
  },
});

refs.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  debouncedSearch();
});

refs.refreshButton.addEventListener("click", () => {
  loadCandidates();
  if (state.selectedUserId) {
    loadDetail(state.selectedUserId);
  }
});

refs.exportReportButton.addEventListener("click", () => {
  exportCurrentProfileReport();
});

refs.resetApiButton.addEventListener("click", () => {
  state.apiBase = resetStoredApiBase();
  syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `已恢复默认接口 · ${state.apiBase}`, "loading");
  loadCandidates();
  if (state.selectedUserId) {
    loadDetail(state.selectedUserId);
  }
});

syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, "正在准备个体画像页面…", "loading");
setPanelMessage(refs.detailRoot, "等待选择", "请先在左侧候选列表中选择一个用户。");
syncExportButton();
loadCandidates();

if (state.selectedUserId) {
  loadDetail(state.selectedUserId);
}
