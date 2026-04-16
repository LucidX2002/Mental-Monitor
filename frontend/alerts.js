import {
  addInteractiveSelection,
  bindThresholdControls,
  clearNode,
  createNode,
  fetchJson,
  getDefaultThresholds,
  getStoredApiBase,
  resetStoredApiBase,
  syncStatusCard,
  debounce,
  getThresholdQuery,
  caseStatusLabel,
  downloadTextFile,
  openPrintReport,
  escapeHtml,
  updateUrlQuery,
} from "./common.js";

const ALERT_TABS = [
  { id: "overview", label: "概览" },
  { id: "table", label: "预警名单" },
  { id: "cards", label: "卡片视图" },
];

const requestedTab = new URLSearchParams(window.location.search).get("tab");
const initialTab = ALERT_TABS.some((tab) => tab.id === requestedTab) ? requestedTab : "overview";

const state = {
  ...getDefaultThresholds(),
  apiBase: getStoredApiBase(),
  query: "",
  riskOnly: true,
  activeTab: initialTab,
  abortController: null,
  requestId: 0,
  lastItems: [],
};

const refs = {
  searchInput: document.querySelector("#search-input"),
  neuroSlider: document.querySelector("#neuro-slider"),
  extraSlider: document.querySelector("#extra-slider"),
  neuroValue: document.querySelector("#neuro-value"),
  extraValue: document.querySelector("#extra-value"),
  riskOnly: document.querySelector("#risk-only"),
  refreshButton: document.querySelector("#refresh-button"),
  exportAlertsButton: document.querySelector("#export-alerts-button"),
  printAlertsButton: document.querySelector("#print-alerts-button"),
  resetApiButton: document.querySelector("#reset-api-button"),
  apiBaseValue: document.querySelector("#api-base-value"),
  backendStatus: document.querySelector("#backend-status"),
  alertsTabBar: document.querySelector("#alerts-tab-bar"),
  alertsSummary: document.querySelector("#alerts-summary"),
  alertsOverviewSection: document.querySelector("#alerts-overview-section"),
  alertsTableSection: document.querySelector("#alerts-table-section"),
  alertsCardsSection: document.querySelector("#alerts-cards-section"),
  usersTable: document.querySelector("#users-table"),
  alertsCardList: document.querySelector("#alerts-card-list"),
};

function renderTabBar() {
  clearNode(refs.alertsTabBar);
  ALERT_TABS.forEach((tab) => {
    const button = createNode("button", {
      className: `profile-tab ${state.activeTab === tab.id ? "active" : ""}`,
      text: tab.label,
      attrs: { type: "button" },
    });
    button.addEventListener("click", () => {
      setActiveTab(tab.id);
    });
    refs.alertsTabBar.append(button);
  });
}

function renderActiveTab() {
  refs.alertsOverviewSection.hidden = state.activeTab !== "overview";
  refs.alertsTableSection.hidden = state.activeTab !== "table";
  refs.alertsCardsSection.hidden = state.activeTab !== "cards";
}

function setActiveTab(tabId) {
  state.activeTab = tabId;
  updateUrlQuery({ tab: tabId });
  renderTabBar();
  renderActiveTab();
}

function syncExportButton() {
  refs.exportAlertsButton.disabled = (state.lastItems || []).length === 0;
  refs.printAlertsButton.disabled = (state.lastItems || []).length === 0;
}

function renderSummary(users) {
  clearNode(refs.alertsSummary);
  const highRiskCount = users.filter((item) => item.is_at_risk).length;
  const observingCount = users.filter((item) => item.case_state?.status === "observing").length;
  const intervenedCount = users.filter((item) => item.case_state?.status === "intervened").length;
  const stats = [
    ["当前列表人数", users.length],
    ["高风险人数", highRiskCount],
    ["观察中", observingCount],
    ["已干预", intervenedCount],
  ];

  stats.forEach(([label, value]) => {
    const card = createNode("article", { className: "stat-card" });
    card.append(createNode("p", { text: label }), createNode("strong", { text: String(value) }));
    refs.alertsSummary.append(card);
  });
}

function renderUsers(users) {
  clearNode(refs.usersTable);
  clearNode(refs.alertsCardList);
  if (!users.length) {
    const row = createNode("tr");
    row.append(createNode("td", { text: "没有匹配用户。", attrs: { colspan: "7" } }));
    refs.usersTable.append(row);
    refs.alertsCardList.append(createNode("p", { className: "helper-text", text: "没有匹配用户。" }));
    return;
  }

  users.forEach((user) => {
    const row = createNode("tr");
    addInteractiveSelection(row, () => {
      window.location.href = `./profile.html?user=${user.sim_user_id}`;
    });

    [
      `#${user.sim_user_id}`,
      caseStatusLabel(user.case_state),
      user.dominant_trait,
      user.prob_neuroticism.toFixed(2),
      user.prob_extraversion.toFixed(2),
      String(user.post_count),
      (user.subreddits || []).join(" / "),
    ].forEach((value) => row.append(createNode("td", { text: value })));

    refs.usersTable.append(row);

    const card = createNode("button", { className: "alert-card", attrs: { type: "button" } });
    card.append(
      createNode("strong", { text: `#${user.sim_user_id} · ${user.dominant_trait}` }),
      createNode("p", { className: "helper-text", text: `状态：${caseStatusLabel(user.case_state)}` }),
      createNode("p", { className: "helper-text", text: `神经质 ${user.prob_neuroticism.toFixed(2)} / 外向性 ${user.prob_extraversion.toFixed(2)}` }),
      createNode("p", { className: "helper-text", text: `发帖数 ${user.post_count} · ${(user.subreddits || []).join(" / ")}` })
    );
    card.addEventListener("click", () => {
      window.location.href = `./profile.html?user=${user.sim_user_id}`;
    });
    refs.alertsCardList.append(card);
  });
}

async function loadAlerts() {
  if (state.abortController) {
    state.abortController.abort();
  }

  const requestId = ++state.requestId;
  const controller = new AbortController();
  state.abortController = controller;

  refs.refreshButton.disabled = true;
  refs.refreshButton.textContent = "正在刷新…";
  syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `正在同步预警列表 · ${state.apiBase}`, "loading");

  try {
    const payload = await fetchJson(
      state.apiBase,
      "/api/users",
      {
        ...getThresholdQuery(state),
        limit: 80,
        q: state.query,
        risk_only: state.riskOnly,
      },
      { signal: controller.signal }
    );

    if (requestId !== state.requestId) {
      return;
    }

    renderSummary(payload.items || []);
    renderUsers(payload.items || []);
    state.lastItems = payload.items || [];
    syncExportButton();
    syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `预警列表已更新 · ${state.apiBase}`, "ok");
  } catch (error) {
    if (error.name !== "AbortError") {
      clearNode(refs.alertsSummary);
      renderUsers([]);
      state.lastItems = [];
      syncExportButton();
      syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `预警列表加载失败 · ${error.message}`, "error");
    }
  } finally {
    if (requestId === state.requestId) {
      refs.refreshButton.disabled = false;
      refs.refreshButton.textContent = "刷新数据";
    }
  }
}

const debouncedRefresh = debounce(loadAlerts, 240);

bindThresholdControls({
  neuroSlider: refs.neuroSlider,
  extraSlider: refs.extraSlider,
  neuroValue: refs.neuroValue,
  extraValue: refs.extraValue,
  state,
  onChange: debouncedRefresh,
});

refs.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  debouncedRefresh();
});

refs.riskOnly.addEventListener("change", (event) => {
  state.riskOnly = event.target.checked;
  loadAlerts();
});

refs.refreshButton.addEventListener("click", () => {
  loadAlerts();
});

refs.exportAlertsButton.addEventListener("click", () => {
  if (!(state.lastItems || []).length) {
    return;
  }
  const rows = (state.lastItems || []).map((item) =>
    [
      item.sim_user_id,
      caseStatusLabel(item.case_state),
      item.dominant_trait,
      item.prob_neuroticism.toFixed(2),
      item.prob_extraversion.toFixed(2),
      item.post_count,
      `"${(item.subreddits || []).join(" / ")}"`,
    ].join(",")
  );
  const header = "sim_user_id,case_status,dominant_trait,prob_neuroticism,prob_extraversion,post_count,subreddits";
  downloadTextFile(
    `alerts-export-${new Date().toISOString().slice(0, 10)}.csv`,
    [header, ...rows].join("\n"),
    "text/csv;charset=utf-8"
  );
});

refs.printAlertsButton.addEventListener("click", () => {
  if (!(state.lastItems || []).length) {
    return;
  }
  const bodyHtml = `
    <div class="section">
      <h1>风险预警报告</h1>
      <div class="meta">导出时间：${escapeHtml(new Date().toLocaleString("zh-CN"))}</div>
      <p>当前共导出 ${state.lastItems.length} 名用户，以下为当前筛选条件下的预警名单。</p>
    </div>
    <div class="section">
      <table>
        <thead>
          <tr>
            <th>用户</th>
            <th>工单状态</th>
            <th>主导人格</th>
            <th>神经质</th>
            <th>外向性</th>
            <th>发帖数</th>
            <th>社区板块</th>
          </tr>
        </thead>
        <tbody>
          ${state.lastItems
            .map(
              (item) => `
                <tr>
                  <td>#${item.sim_user_id}</td>
                  <td>${escapeHtml(caseStatusLabel(item.case_state))}</td>
                  <td>${escapeHtml(item.dominant_trait)}</td>
                  <td>${item.prob_neuroticism.toFixed(2)}</td>
                  <td>${item.prob_extraversion.toFixed(2)}</td>
                  <td>${item.post_count}</td>
                  <td>${escapeHtml((item.subreddits || []).join(" / "))}</td>
                </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  openPrintReport({ title: "风险预警报告", bodyHtml });
});

refs.resetApiButton.addEventListener("click", () => {
  state.apiBase = resetStoredApiBase();
  syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, `已恢复默认接口 · ${state.apiBase}`, "loading");
  loadAlerts();
});

syncStatusCard(refs.apiBaseValue, refs.backendStatus, state.apiBase, "正在准备预警页面…", "loading");
renderTabBar();
renderActiveTab();
syncExportButton();
loadAlerts();
