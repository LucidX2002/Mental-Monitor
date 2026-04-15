const state = {
  neuroticismMin: 0.7,
  extraversionMax: 0.35,
  query: "",
  riskOnly: false,
  selectedUserId: null,
};

const urlParams = new URLSearchParams(window.location.search);
const queryApiBase = urlParams.get("apiBase");
if (queryApiBase) {
  window.localStorage.setItem("mentalApiBase", queryApiBase);
}
const storedApiBase = window.localStorage.getItem("mentalApiBase");
const API_BASE =
  queryApiBase ||
  storedApiBase ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

const refs = {
  searchInput: document.querySelector("#search-input"),
  neuroSlider: document.querySelector("#neuro-slider"),
  extraSlider: document.querySelector("#extra-slider"),
  neuroValue: document.querySelector("#neuro-value"),
  extraValue: document.querySelector("#extra-value"),
  riskOnly: document.querySelector("#risk-only"),
  refreshButton: document.querySelector("#refresh-button"),
  backendStatus: document.querySelector("#backend-status"),
  statsGrid: document.querySelector("#stats-grid"),
  scatterRoot: document.querySelector("#scatter-root"),
  usersTable: document.querySelector("#users-table"),
  detailRoot: document.querySelector("#detail-root"),
};

function apiUrl(path, params = {}) {
  const url = new URL(path, API_BASE);
  Object.entries(params).forEach(([key, value]) => {
    if (value === "" || value === null || value === undefined) {
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function fetchJson(path, params = {}, options = {}) {
  const response = await fetch(apiUrl(path, params), {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "后端请求失败");
  }
  return payload;
}

function updateThresholdLabels() {
  refs.neuroValue.textContent = Number(state.neuroticismMin).toFixed(2);
  refs.extraValue.textContent = Number(state.extraversionMax).toFixed(2);
}

function statusTag(isAtRisk) {
  if (isAtRisk) {
    return `<span class="risk-tag">高风险</span>`;
  }
  return `<span class="safe-tag">安全</span>`;
}

function caseStatusLabel(caseState) {
  const status = caseState?.status || "pending";
  const labels = {
    pending: "待处理",
    observing: "观察中",
    intervened: "已干预",
    false_positive: "误报",
  };
  return labels[status] || status;
}

function renderStats(summary) {
  const cards = [
    ["总用户数", summary.total_users],
    ["高风险人数", summary.at_risk_users],
    ["平均神经质", summary.avg_neuroticism.toFixed(2)],
    ["平均外向性", summary.avg_extraversion.toFixed(2)],
  ];

  refs.statsGrid.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="stat-card">
          <p>${label}</p>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");
}

function renderScatter(points) {
  if (!points.length) {
    refs.scatterRoot.innerHTML = `<div class="empty-state">没有可显示的散点数据。</div>`;
    return;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = 1000;
  const height = 360;
  const padding = 30;

  const xScale = (value) =>
    padding + ((value - minX) / Math.max(maxX - minX, 1e-6)) * (width - padding * 2);
  const yScale = (value) =>
    height - padding - ((value - minY) / Math.max(maxY - minY, 1e-6)) * (height - padding * 2);

  refs.scatterRoot.innerHTML = `
    <svg class="scatter-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="20" fill="transparent" stroke="rgba(27,43,38,0.08)" />
      ${points
        .map((point) => {
          const activeClass = state.selectedUserId === point.sim_user_id ? "active" : "";
          return `
            <circle
              class="scatter-point ${activeClass}"
              data-user-id="${point.sim_user_id}"
              cx="${xScale(point.x).toFixed(2)}"
              cy="${yScale(point.y).toFixed(2)}"
              r="4.2"
              fill="${point.is_at_risk ? "#b42318" : "#2e8b57"}"
              opacity="${point.is_at_risk ? "0.9" : "0.65"}"
            >
              <title>用户 ${point.sim_user_id}</title>
            </circle>
          `;
        })
        .join("")}
    </svg>
  `;

  refs.scatterRoot.querySelectorAll("[data-user-id]").forEach((node) => {
    node.addEventListener("click", () => {
      selectUser(Number(node.dataset.userId));
    });
  });
}

function renderUsers(users) {
  if (!users.length) {
    refs.usersTable.innerHTML = `<tr><td colspan="6">没有匹配用户。</td></tr>`;
    return;
  }

  refs.usersTable.innerHTML = users
    .map((user) => {
      const activeClass = user.sim_user_id === state.selectedUserId ? "active" : "";
      return `
        <tr class="${activeClass}" data-user-id="${user.sim_user_id}">
          <td>#${user.sim_user_id}</td>
          <td>${caseStatusLabel(user.case_state)}</td>
          <td>${user.dominant_trait}</td>
          <td>${user.prob_neuroticism.toFixed(2)}</td>
          <td>${user.prob_extraversion.toFixed(2)}</td>
          <td>${user.post_count}</td>
        </tr>
      `;
    })
    .join("");

  refs.usersTable.querySelectorAll("[data-user-id]").forEach((node) => {
    node.addEventListener("click", () => {
      selectUser(Number(node.dataset.userId));
    });
  });
}

function renderTraits(traits) {
  return Object.entries(traits)
    .map(
      ([label, value]) => `
        <div class="trait-row">
          <header>
            <span>${label}</span>
            <span>${value.toFixed(2)}</span>
          </header>
          <div class="trait-bar"><span style="width:${(value * 100).toFixed(1)}%"></span></div>
        </div>
      `
    )
    .join("");
}

function renderBehavior(behavior) {
  return Object.entries({
    发帖总数: behavior.post_count,
    平均字数: behavior.avg_words.toFixed(1),
    平均字符数: behavior.avg_chars.toFixed(1),
    日均发帖: behavior.posts_per_day.toFixed(2),
    熬夜占比: behavior.night_ratio.toFixed(2),
    工作日占比: behavior.weekday_ratio.toFixed(2),
  })
    .map(
      ([label, value]) => `
        <div class="metric-row">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `
    )
    .join("");
}

function renderRecommendations(recommendations) {
  if (!recommendations.length) {
    return `<p class="helper-text">暂无推荐结果。</p>`;
  }

  return recommendations
    .map(
      (item) => `
        <article class="recommendation-card">
          <strong>#${item.sim_user_id} · ${item.dominant_trait}</strong>
          <div class="metric-row"><span>相似度</span><span>${item.score.toFixed(3)}</span></div>
          <div class="metric-row"><span>神经质</span><span>${item.prob_neuroticism.toFixed(2)}</span></div>
          <div class="metric-row"><span>外向性</span><span>${item.prob_extraversion.toFixed(2)}</span></div>
        </article>
      `
    )
    .join("");
}

function renderPosts(posts, dates, subreddits) {
  if (!posts.length) {
    return `<p class="helper-text">暂无帖子样本。</p>`;
  }

  return posts
    .slice(0, 4)
    .map((post, index) => {
      const date = dates[index] || "未知时间";
      const subreddit = subreddits[index] || subreddits[0] || "unknown";
      return `
        <article class="post-card">
          <strong>${subreddit} · ${date.slice(0, 10)}</strong>
          <div>${post}</div>
        </article>
      `;
    })
    .join("");
}

function renderDetail(detail, recommendations) {
  refs.detailRoot.classList.remove("empty-state");
  refs.detailRoot.innerHTML = `
    <section class="detail-hero">
      <div>
        <h3>用户 #${detail.sim_user_id}</h3>
        <p class="detail-sub">
          ${detail.dominant_trait} · 主导分数 ${detail.dominant_score.toFixed(2)}
        </p>
      </div>
      <div>${statusTag(detail.is_at_risk)}</div>
    </section>

    <section class="section-block">
      <h4>处置状态</h4>
      <form id="case-form" class="case-form">
        <select id="case-status">
          <option value="pending">待处理</option>
          <option value="observing">观察中</option>
          <option value="intervened">已干预</option>
          <option value="false_positive">误报</option>
        </select>
        <textarea id="case-note" placeholder="补充说明、干预备注或误报原因。"></textarea>
        <div class="inline-actions">
          <button class="button primary" type="submit">保存状态</button>
          <span class="helper-text">当前状态：${caseStatusLabel(detail.case_state)}</span>
        </div>
      </form>
    </section>

    <section class="section-block">
      <h4>人格画像</h4>
      <div class="trait-list">${renderTraits(detail.traits)}</div>
    </section>

    <section class="section-block">
      <h4>行为摘要</h4>
      <div class="metric-list">${renderBehavior(detail.behavior)}</div>
    </section>

    <section class="section-block">
      <h4>Subreddit 分布</h4>
      <div class="subreddit-list">
        ${detail.subreddits.map((item) => `<span class="subreddit-chip">${item}</span>`).join("")}
      </div>
    </section>

    <section class="section-block">
      <h4>相似用户推荐</h4>
      <div class="recommendation-list">${renderRecommendations(recommendations)}</div>
    </section>

    <section class="section-block">
      <h4>帖子样本</h4>
      <div class="post-list">${renderPosts(detail.posts, detail.dates, detail.subreddits)}</div>
    </section>
  `;

  const statusSelect = refs.detailRoot.querySelector("#case-status");
  const noteInput = refs.detailRoot.querySelector("#case-note");
  statusSelect.value = detail.case_state?.status || "pending";

  refs.detailRoot.querySelector("#case-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await fetchJson(
      `/api/users/${detail.sim_user_id}/case-state`,
      {},
      {
        method: "POST",
        body: JSON.stringify({
          status: statusSelect.value,
          note: noteInput.value,
        }),
      }
    );
    noteInput.value = "";
    await refresh();
  });
}

async function loadDetail(userId) {
  const [detail, recommendations] = await Promise.all([
    fetchJson(`/api/users/${userId}`, {
      neuroticism_min: state.neuroticismMin,
      extraversion_max: state.extraversionMax,
    }),
    fetchJson(`/api/users/${userId}/recommendations`, { k: 5 }),
  ]);
  renderDetail(detail, recommendations);
}

async function selectUser(userId) {
  state.selectedUserId = userId;
  await refresh(false);
}

async function refresh(resetSelection = true) {
  refs.backendStatus.textContent = `正在同步后端数据… ${API_BASE}`;
  try {
    const [summary, scatter, usersPayload] = await Promise.all([
      fetchJson("/api/summary", {
        neuroticism_min: state.neuroticismMin,
        extraversion_max: state.extraversionMax,
      }),
      fetchJson("/api/scatter", {
        limit: 700,
        neuroticism_min: state.neuroticismMin,
        extraversion_max: state.extraversionMax,
      }),
      fetchJson("/api/users", {
        limit: 40,
        q: state.query,
        risk_only: state.riskOnly,
        neuroticism_min: state.neuroticismMin,
        extraversion_max: state.extraversionMax,
      }),
    ]);

    renderStats(summary);
    renderScatter(scatter.points);
    renderUsers(usersPayload.items);

    if (resetSelection || !usersPayload.items.some((item) => item.sim_user_id === state.selectedUserId)) {
      state.selectedUserId = usersPayload.items[0]?.sim_user_id ?? null;
    }

    if (state.selectedUserId !== null) {
      await loadDetail(state.selectedUserId);
    } else {
      refs.detailRoot.classList.add("empty-state");
      refs.detailRoot.innerHTML = "没有可展示的用户详情。";
    }

    refs.backendStatus.textContent = `后端连接正常：${API_BASE}`;
  } catch (error) {
    refs.backendStatus.textContent = error.message;
    refs.detailRoot.classList.add("empty-state");
    refs.detailRoot.innerHTML = `
      <div>
        <strong>无法加载数据</strong>
        <p class="helper-text">请先运行 <code>python -m backend --port 8000</code>，或用 <code>?apiBase=http://host:port</code> 指定接口地址。</p>
      </div>
    `;
  }
}

function bindControls() {
  refs.neuroSlider.addEventListener("input", (event) => {
    state.neuroticismMin = Number(event.target.value);
    updateThresholdLabels();
  });

  refs.extraSlider.addEventListener("input", (event) => {
    state.extraversionMax = Number(event.target.value);
    updateThresholdLabels();
  });

  refs.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
  });

  refs.riskOnly.addEventListener("change", (event) => {
    state.riskOnly = event.target.checked;
  });

  refs.refreshButton.addEventListener("click", () => {
    refresh();
  });
}

bindControls();
updateThresholdLabels();
refresh();
