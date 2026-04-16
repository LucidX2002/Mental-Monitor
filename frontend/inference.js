import {
  bindThresholdControls,
  clearNode,
  createNode,
  createStatusTag,
  fetchJson,
  getDefaultThresholds,
  getStoredApiBase,
  renderRadarChart,
  resetStoredApiBase,
  setPanelMessage,
  syncStatusCard,
  setupPresentationMode,
} from "./common.js";

const state = {
  ...getDefaultThresholds(),
  apiBase: getStoredApiBase(),
  currentResult: null,
  selectedReferenceUserId: null,
  referenceAbortController: null,
  referenceRequestId: 0,
  referenceCache: new Map(),
};

const refs = {
  neuroSlider: document.querySelector("#neuro-slider"),
  extraSlider: document.querySelector("#extra-slider"),
  neuroValue: document.querySelector("#neuro-value"),
  extraValue: document.querySelector("#extra-value"),
  textInput: document.querySelector("#text-input"),
  analyzeButton: document.querySelector("#analyze-button"),
  sampleButton: document.querySelector("#sample-button"),
  clearButton: document.querySelector("#clear-button"),
  presentationToggleButton: document.querySelector("#presentation-toggle-button"),
  presentationToggleButtonInline: document.querySelector("#presentation-toggle-button-inline"),
  resetApiButton: document.querySelector("#reset-api-button"),
  apiBaseValue: document.querySelector("#api-base-value"),
  backendStatus: document.querySelector("#backend-status"),
  radarRoot: document.querySelector("#radar-root"),
  verdictRoot: document.querySelector("#verdict-root"),
};

const SAMPLE_TEXT =
  "最近总是觉得很累，晚上也睡不好，和别人交流的时候会下意识回避。我明明知道应该去做作业和准备考试，但就是提不起劲，总担心自己做不好，也越来越不想和同学说话。";

function renderVerdict(result) {
  clearNode(refs.verdictRoot);
  refs.verdictRoot.classList.remove("empty-state");
  state.currentResult = result;

  const summary = createNode("article", {
    className: `verdict-card ${result.is_flagged ? "verdict-danger" : "verdict-safe"}`,
  });
  summary.append(
    createNode("strong", { text: result.risk_label }),
    createNode("p", {
      className: "helper-text",
      text: `主导人格：${result.dominant_trait} · 主导分数：${result.dominant_score.toFixed(2)}`,
    }),
    createNode("p", {
      className: "helper-text",
      text:
        result.inference_mode === "nearest_neighbor_fallback"
          ? "当前模式：本地文本编码器 + 相似用户近邻协同推断"
          : "当前模式：人格分类模型直接推断",
    }),
    createNode("p", {
      className: "helper-text",
      text: `估计词数：${result.token_count_estimate} · 当前阈值：神经质 >= ${result.thresholds.neuroticism_min.toFixed(2)}，外向性 <= ${result.thresholds.extraversion_max.toFixed(2)}`,
    })
  );

  const reasonSection = createNode("article", { className: "verdict-card" });
  reasonSection.append(createNode("strong", { text: "辅助解释" }));
  if ((result.reasons || []).length === 0) {
    reasonSection.append(createNode("p", { className: "helper-text", text: "当前文本暂未触发额外解释项。" }));
  } else {
    const list = createNode("ul", { className: "reason-list" });
    result.reasons.forEach((reason) => {
      list.append(createNode("li", { text: reason }));
    });
    reasonSection.append(list);
  }

  if ((result.neighbor_examples || []).length > 0) {
    const neighborSection = createNode("article", { className: "verdict-card" });
    neighborSection.append(createNode("strong", { text: "相似用户参考" }));
    const list = createNode("div", { className: "reference-user-list" });
    result.neighbor_examples.forEach((item) => {
      const card = createNode("button", {
        className: `reference-user-card ${state.selectedReferenceUserId === item.sim_user_id ? "active" : ""}`,
        text: `用户 #${item.sim_user_id} · 相似度 ${item.score.toFixed(3)}`,
        attrs: { type: "button" },
      });
      card.addEventListener("click", () => {
        loadReferenceUser(item.sim_user_id);
      });
      list.append(card);
    });
    neighborSection.append(list);
    const previewSection = createNode("article", { className: "verdict-card reference-preview-anchor" });
    previewSection.append(
      createNode("strong", { text: "参考用户详情" }),
      createNode("p", { className: "helper-text", text: "点击上方相似用户后，可在此查看其画像摘要与帖子内容。" })
    );
    refs.verdictRoot.append(summary, reasonSection, neighborSection, previewSection);
    return;
  }

  refs.verdictRoot.append(summary, reasonSection);
}

function renderReferenceUserPreview(detail) {
  const previewSection = createNode("article", { className: "verdict-card reference-preview-anchor" });
  const statusRow = createNode("div", { className: "inline-actions" });
  statusRow.append(
    createNode("strong", { text: `参考用户 #${detail.sim_user_id}` }),
    createStatusTag(detail.is_at_risk)
  );
  previewSection.append(
    statusRow,
    createNode("p", {
      className: "helper-text",
      text: `${detail.dominant_trait} · 主导分数 ${detail.dominant_score.toFixed(2)} · ${detail.is_at_risk ? "当前触发高风险规则" : "当前未触发高风险规则"}`,
    })
  );

  const metrics = createNode("div", { className: "metric-list compact" });
  [
    ["神经质", detail.traits.Neuroticism.toFixed(2)],
    ["外向性", detail.traits.Extraversion.toFixed(2)],
    ["发帖总数", detail.behavior.post_count],
    ["日均发帖", detail.behavior.posts_per_day.toFixed(2)],
  ].forEach(([label, value]) => {
    const row = createNode("div", { className: "metric-row" });
    row.append(
      createNode("span", { text: label }),
      createNode("strong", { text: String(value) })
    );
    metrics.append(row);
  });

  const chips = createNode("div", { className: "subreddit-list compact" });
  (detail.subreddits || []).slice(0, 4).forEach((subreddit) => {
    chips.append(createNode("span", { className: "subreddit-chip", text: subreddit }));
  });

  const previews = createNode("div", { className: "preview-list" });
  (detail.posts || []).slice(0, 2).forEach((post, index) => {
    const preview = createNode("div", { className: "preview-card" });
    preview.append(
      createNode("strong", { text: `发帖内容 ${index + 1}` }),
      createNode("p", { className: "helper-text", text: post })
    );
    previews.append(preview);
  });

  const openButton = createNode("button", {
    className: "button subtle",
    text: "进入个体画像页查看完整信息",
    attrs: { type: "button" },
  });
  openButton.addEventListener("click", () => {
    window.location.href = `./profile.html?user=${detail.sim_user_id}`;
  });

  previewSection.append(metrics, chips, previews, openButton);
  const existing = refs.verdictRoot.querySelector(".reference-preview-anchor");
  if (existing) {
    existing.replaceWith(previewSection);
  } else {
    refs.verdictRoot.append(previewSection);
  }
}

async function loadReferenceUser(userId) {
  state.selectedReferenceUserId = userId;
  if (state.currentResult) {
    renderVerdict(state.currentResult);
  }

  if (state.referenceCache.has(userId)) {
    renderReferenceUserPreview(state.referenceCache.get(userId));
    return;
  }

  if (state.referenceAbortController) {
    state.referenceAbortController.abort();
  }

  const requestId = ++state.referenceRequestId;
  const controller = new AbortController();
  state.referenceAbortController = controller;

  const loadingSection = createNode("article", { className: "verdict-card reference-preview-anchor" });
  loadingSection.append(
    createNode("strong", { text: `参考用户 #${userId}` }),
    createNode("p", { className: "helper-text", text: "正在读取该用户的详细信息…" })
  );
  const existing = refs.verdictRoot.querySelector(".reference-preview-anchor");
  if (existing) {
    existing.replaceWith(loadingSection);
  } else {
    refs.verdictRoot.append(loadingSection);
  }

  try {
    const detail = await fetchJson(
      state.apiBase,
      `/api/users/${userId}`,
      {
        neuroticism_min: state.neuroticismMin,
        extraversion_max: state.extraversionMax,
      },
      { signal: controller.signal }
    );
    if (requestId !== state.referenceRequestId) {
      return;
    }
    state.referenceCache.set(userId, detail);
    renderReferenceUserPreview(detail);
  } catch (error) {
    if (error.name !== "AbortError") {
      const errorSection = createNode("article", { className: "verdict-card reference-preview-anchor" });
      errorSection.append(
        createNode("strong", { text: `参考用户 #${userId}` }),
        createNode("p", { className: "helper-text", text: `读取失败：${error.message}` })
      );
      const current = refs.verdictRoot.querySelector(".reference-preview-anchor");
      if (current) {
        current.replaceWith(errorSection);
      }
    }
  }
}

async function analyzeText() {
  const text = refs.textInput.value.trim();
  if (!text) {
    setPanelMessage(refs.radarRoot, "缺少文本", "请输入需要研判的帖子或评论内容。");
    setPanelMessage(refs.verdictRoot, "缺少文本", "请输入需要研判的帖子或评论内容。");
    return;
  }

  refs.analyzeButton.disabled = true;
  refs.analyzeButton.textContent = "正在研判…";
  syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `正在执行文本研判 · ${state.apiBase}`, "loading");

  try {
    const result = await fetchJson(
      state.apiBase,
      "/api/analyze-text",
      {},
      {
        method: "POST",
        body: JSON.stringify({
          text,
          neuroticism_min: state.neuroticismMin,
          extraversion_max: state.extraversionMax,
        }),
      }
    );

    renderRadarChart(refs.radarRoot, result.traits, { title: "五维人格雷达图" });
    state.selectedReferenceUserId = null;
    renderVerdict(result);
    syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `文本研判完成 · ${state.apiBase}`, "ok");
  } catch (error) {
    setPanelMessage(refs.radarRoot, "研判失败", error.message);
    setPanelMessage(refs.verdictRoot, "研判失败", error.message);
    syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `文本研判失败 · ${error.message}`, "error");
  } finally {
    refs.analyzeButton.disabled = false;
    refs.analyzeButton.textContent = "开始研判";
  }
}

bindThresholdControls({
  neuroSlider: refs.neuroSlider,
  extraSlider: refs.extraSlider,
  neuroValue: refs.neuroValue,
  extraValue: refs.extraValue,
  state,
  onChange: () => {},
});

refs.analyzeButton.addEventListener("click", () => {
  analyzeText();
});

refs.sampleButton.addEventListener("click", () => {
  refs.textInput.value = SAMPLE_TEXT;
  refs.textInput.focus();
});

refs.clearButton.addEventListener("click", () => {
  refs.textInput.value = "";
  state.currentResult = null;
  state.selectedReferenceUserId = null;
  setPanelMessage(refs.radarRoot, "等待输入", "请输入文本后开始研判。");
  setPanelMessage(refs.verdictRoot, "等待结果", "等待模型输出结果。");
  refs.textInput.focus();
});

refs.textInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    analyzeText();
  }
});

refs.resetApiButton.addEventListener("click", () => {
  state.apiBase = resetStoredApiBase();
  syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `已恢复默认接口 · ${state.apiBase}`, "loading");
});

syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, "等待输入文本开始研判…", "ok");
setupPresentationMode({
  toggleButton: refs.presentationToggleButton,
  pageClass: "page-inference",
});
setupPresentationMode({
  toggleButton: refs.presentationToggleButtonInline,
  pageClass: "page-inference",
});
