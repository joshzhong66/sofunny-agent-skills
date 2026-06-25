(function () {
  const API_TOKEN_STORAGE_KEY = "signalflow.apify.apiToken";
  const DEFAULT_ACTOR_ID = "sUXx8U35FLlaweCWO";
  const noteFields = [
    { label: "操作类型", key: "operation", width: 150 },
    { label: "序号", key: "item_index", width: 110 },
    { label: "搜索关键词", key: "query_keyword", width: 150 },
    { label: "笔记 ID", key: "note_id", width: 220 },
    { label: "笔记链接", key: "note_url", width: 110, type: "link" },
    { label: "笔记类型", key: "note_type", width: 100, type: "noteType" },
    { label: "标题", key: "title", width: 240 },
    { label: "摘要", key: "summary", width: 360 },
    { label: "作者用户 ID", key: "author_user_id", width: 240 },
    { label: "作者昵称", key: "author_name", width: 160 },
    { label: "点赞数", key: "like_count", width: 120, align: "right" },
    { label: "收藏数", key: "collect_count", width: 120, align: "right" },
    { label: "评论数", key: "comment_count", width: 120, align: "right" },
    { label: "请求页码", key: "page_request_index", width: 130, align: "right" },
    { label: "页面条数", key: "page_item_count", width: 130, align: "right" },
    { label: "是否有更多", key: "page_has_more", width: 130 },
  ];

  function emptyNotesState() {
    return {
      run_ref: "",
      run_id: "",
      dataset_id: null,
      operation: "",
      status: "",
      query_label: "",
      item_count: 0,
      updated_at: null,
      items: [],
      fields: [],
      has_history: false,
    };
  }

  const state = {
    initialized: false,
    route: normalizeRoute(location.pathname),
    notes: emptyNotesState(),
    runHistory: [],
    selectedRunRef: "",
    keyword: "",
    errorMessage: "",
    successMessage: "",
    config: null,
    apiToken: "",
    selectedActorId: DEFAULT_ACTOR_ID,
    actorForm: null,
    actorFormState: { operation: "search_notes" },
    actorRunResult: null,
    importToNotes: true,
    importToComments: true,
    isImporting: false,
    isLoadingActorForm: false,
    isRunningActor: false,
    activeNote: null,
    isCollectingComments: false,
    commentError: "",
    comments: {
      note_id: "",
      item_count: 0,
      page_comment_count: null,
      warnings: [],
      items: [],
    },
  };

  const app = document.getElementById("app");

  function normalizeRoute(pathname) {
    if (pathname === "/" || pathname === "") return "/apify/config";
    return pathname;
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(data && data.detail ? data.detail : "请求失败");
    }
    return data;
  }

  function formatCellValue(value) {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
  }

  function formatUpdatedAt(value) {
    if (!value) return "尚未导入";
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("zh-CN").format(value || 0);
  }

  function formatNoteType(value) {
    if (value === "video") return "视频";
    if (value === "image") return "图文";
    return formatCellValue(value);
  }

  function formatRunLabel(run) {
    if (!run) return "未选择采集结果";
    return run.query_label || run.dataset_id || run.run_id || "未命名采集结果";
  }

  function matchesKeyword(item, keyword) {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return true;
    return ["title", "summary", "author_name", "query_keyword", "note_id"].some((key) => {
      return formatCellValue(item[key]).toLowerCase().includes(normalized);
    });
  }

  function filteredItems() {
    return state.notes.items.filter((item) => matchesKeyword(item, state.keyword));
  }

  function sumField(key) {
    return filteredItems().reduce((total, item) => {
      const value = Number(item[key]);
      return Number.isFinite(value) ? total + value : total;
    }, 0);
  }

  function summaryStats() {
    const items = filteredItems();
    const imageCount = items.filter((item) => item.note_type === "image").length;
    const videoCount = items.filter((item) => item.note_type === "video").length;
    return [
      { label: "笔记", value: formatNumber(items.length), hint: `共 ${formatNumber(state.notes.item_count)} 条` },
      { label: "点赞", value: formatNumber(sumField("like_count")), hint: "当前筛选合计" },
      { label: "评论", value: formatNumber(sumField("comment_count")), hint: "点击明细可查看" },
      { label: "内容结构", value: `${imageCount}/${videoCount}`, hint: "图文 / 视频" },
    ];
  }

  function getVisibleFields() {
    const operation = state.actorFormState.operation || "search_notes";
    return (state.actorForm && state.actorForm.fields ? state.actorForm.fields : []).filter((field) => {
      if (field.key === "operation") return true;
      if (!field.visible_for || !field.visible_for.length) return true;
      return field.visible_for.includes(operation);
    });
  }

  function isFieldRequired(field) {
    const operation = state.actorFormState.operation || "search_notes";
    if (field.required) return true;
    return Boolean(field.required_for && field.required_for.includes(operation));
  }

  function buildFieldSections() {
    const sections = [];
    for (const field of getVisibleFields()) {
      const title = field.section || "运行参数";
      let section = sections.find((item) => item.title === title);
      if (!section) {
        section = { title, fields: [] };
        sections.push(section);
      }
      section.fields.push(field);
    }
    return sections;
  }

  function buildInitialActorFormState(fields) {
    return (fields || []).reduce((result, field) => {
      if (field.default !== undefined && field.default !== null) {
        result[field.key] = field.default;
      } else if (field.type === "boolean") {
        result[field.key] = false;
      } else {
        result[field.key] = "";
      }
      return result;
    }, {});
  }

  function normalizeActorInput() {
    const operation = state.actorFormState.operation || "search_notes";
    const payload = {};
    for (const field of state.actorForm.fields || []) {
      const visible = field.key === "operation" || !field.visible_for || !field.visible_for.length || field.visible_for.includes(operation);
      if (!visible) continue;
      const value = state.actorFormState[field.key];
      if (field.type === "number") {
        if (value === "" || value === null || value === undefined) continue;
        payload[field.key] = Number(value);
        continue;
      }
      if (field.type === "boolean") {
        payload[field.key] = Boolean(value);
        continue;
      }
      if (typeof value === "string") {
        if (!value.trim()) continue;
        payload[field.key] = value.trim();
        continue;
      }
      if (value !== null && value !== undefined && value !== "") {
        payload[field.key] = value;
      }
    }
    return payload;
  }

  function validateActorInput() {
    const operation = state.actorFormState.operation || "search_notes";
    const current = normalizeActorInput();
    const errors = [];
    for (const field of state.actorForm.fields || []) {
      if (!isFieldRequired(field)) continue;
      const value = current[field.key];
      const missing = value === undefined || value === null || value === "" || (field.type === "number" && Number.isNaN(value));
      if (missing) errors.push(`请填写“${field.label}”`);
    }
    if ((operation === "get_note_detail" || operation === "get_note_comments") && !current.note_id && !current.note_url) {
      errors.push("请至少填写“笔记 ID”或“笔记链接”");
    }
    if ((operation === "get_user_info" || operation === "list_user_notes") && !current.user_id && !current.profile_url) {
      errors.push("请至少填写“用户 ID”或“主页链接”");
    }
    if (operation === "get_note_sub_comments" && (!current.note_id || !current.comment_id)) {
      errors.push("评论回复需要同时填写“笔记 ID”和“一级评论 ID”");
    }
    return errors;
  }

  function setRoute(path) {
    state.route = normalizeRoute(path);
    history.pushState({}, "", state.route);
    render();
  }

  async function initialize() {
    if (state.initialized) return;
    state.initialized = true;
    state.apiToken = localStorage.getItem(API_TOKEN_STORAGE_KEY) || "";
    await Promise.all([loadConfig(), loadActorForm(), loadLatestRun()]);
    await refreshResults();
    render();
  }

  async function loadConfig() {
    const config = await requestJson("/api/config");
    state.config = config;
    if (!state.apiToken && state.config && state.config.apify_api_token && state.config.apify_api_token !== "") {
      state.apiToken = "";
    }
    if (config && config.apify_actor_id) state.selectedActorId = config.apify_actor_id;
  }

  async function saveConfig() {
    state.errorMessage = "";
    state.successMessage = "";
    const payload = {
      apify_api_token: state.apiToken.trim() || (state.config ? state.config.apify_api_token : ""),
      apify_actor_id: state.selectedActorId.trim() || DEFAULT_ACTOR_ID,
      apify_api_base: state.config ? state.config.apify_api_base : "https://api.apify.com/v2",
      apify_default_dataset_id: state.config ? state.config.apify_default_dataset_id : "",
      wait_for_finish: state.config ? state.config.wait_for_finish : 180,
      output_dir: state.config ? state.config.output_dir : "outputs",
    };
    await requestJson("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    localStorage.setItem(API_TOKEN_STORAGE_KEY, state.apiToken.trim());
    state.successMessage = "配置已保存到 skill 内部 config.json";
    await loadConfig();
    await loadActorForm();
    render();
  }

  async function loadRunHistory() {
    const data = await requestJson("/api/run-history");
    state.runHistory = data && Array.isArray(data.items) ? data.items : [];
  }

  async function loadNotes(runRef = state.selectedRunRef) {
    const suffix = runRef ? `?run=${encodeURIComponent(runRef)}` : "";
    state.notes = await requestJson(`/api/run-details${suffix}`);
    state.selectedRunRef = state.notes && state.notes.run_ref ? state.notes.run_ref : "";
    render();
  }

  async function refreshResults(preferredRunId = "") {
    state.errorMessage = "";
    try {
      await loadRunHistory();
      let nextRunRef = "";
      if (preferredRunId) {
        const preferred = state.runHistory.find((item) => item.run_id === preferredRunId);
        if (preferred) nextRunRef = preferred.run_ref;
      }
      if (!nextRunRef && state.selectedRunRef) {
        const selected = state.runHistory.find((item) => item.run_ref === state.selectedRunRef);
        if (selected) nextRunRef = selected.run_ref;
      }
      if (!nextRunRef && state.runHistory.length) {
        nextRunRef = state.runHistory[0].run_ref;
      }
      await loadNotes(nextRunRef);
    } catch (error) {
      state.errorMessage = error.message;
      state.notes = emptyNotesState();
      state.runHistory = [];
      render();
    }
  }

  async function selectRun(runRef) {
    state.errorMessage = "";
    try {
      state.selectedRunRef = runRef || "";
      state.keyword = "";
      await loadNotes(state.selectedRunRef);
    } catch (error) {
      state.errorMessage = error.message;
      render();
    }
  }

  async function importDataset() {
    state.isImporting = true;
    state.errorMessage = "";
    state.successMessage = "";
    render();
    try {
      await requestJson("/api/apify/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await refreshResults();
      state.successMessage = "默认 Dataset 已导入";
    } catch (error) {
      state.errorMessage = error.message;
    } finally {
      state.isImporting = false;
      render();
    }
  }

  async function loadActorForm() {
    state.isLoadingActorForm = true;
    render();
    try {
      state.actorForm = await requestJson(`/api/apify/actors/${encodeURIComponent(state.selectedActorId.trim() || DEFAULT_ACTOR_ID)}/form`);
      state.actorFormState = buildInitialActorFormState(state.actorForm.fields);
      if (!state.actorFormState.operation) state.actorFormState.operation = "search_notes";
    } catch (error) {
      state.errorMessage = error.message;
    } finally {
      state.isLoadingActorForm = false;
      render();
    }
  }

  async function loadLatestRun() {
    try {
      const data = await requestJson("/api/latest-run");
      state.actorRunResult = data || null;
    } catch (_error) {
      state.actorRunResult = null;
    }
  }

  async function runActor() {
    if (!state.actorForm || !state.actorForm.fields) {
      state.errorMessage = "请先读取 SocialDataX 字段";
      render();
      return;
    }
    const errors = validateActorInput();
    if (errors.length) {
      state.errorMessage = errors[0];
      render();
      return;
    }
    state.isRunningActor = true;
    state.errorMessage = "";
    state.successMessage = "";
    render();
    try {
      const payload = {
        actor_id: state.selectedActorId.trim(),
        input: normalizeActorInput(),
        import_to_notes: state.importToNotes,
        import_to_comments: state.importToComments,
      };
      state.actorRunResult = await requestJson("/api/apify/actors/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await refreshResults(state.actorRunResult && state.actorRunResult.run_id ? state.actorRunResult.run_id : "");
      state.successMessage = "采集已完成";
    } catch (error) {
      state.errorMessage = error.message;
    } finally {
      state.isRunningActor = false;
      render();
    }
  }

  async function openComments(note) {
    state.activeNote = note;
    state.commentError = "";
    render();
    await loadComments();
  }

  function closeComments() {
    state.activeNote = null;
    state.commentError = "";
    render();
  }

  async function loadComments() {
    if (!state.activeNote || !state.activeNote.note_id) return;
    try {
      state.comments = await requestJson(`/api/notes/${encodeURIComponent(state.activeNote.note_id)}/comments`);
    } catch (error) {
      state.commentError = error.message;
    }
    render();
  }

  async function collectComments(includeReplies) {
    if (!state.activeNote || !state.activeNote.note_id) return;
    state.isCollectingComments = true;
    state.commentError = "";
    render();
    try {
      state.comments = await requestJson(`/api/notes/${encodeURIComponent(state.activeNote.note_id)}/comments/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_items: 20, continue_from_existing: true, include_replies: Boolean(includeReplies) }),
      });
      await loadNotes();
    } catch (error) {
      state.commentError = error.message;
    } finally {
      state.isCollectingComments = false;
      render();
    }
  }

  async function collectReplies() {
    if (!state.activeNote || !state.activeNote.note_id) return;
    state.isCollectingComments = true;
    state.commentError = "";
    render();
    try {
      state.comments = await requestJson(`/api/notes/${encodeURIComponent(state.activeNote.note_id)}/comments/replies/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_items: 20 }),
      });
    } catch (error) {
      state.commentError = error.message;
    } finally {
      state.isCollectingComments = false;
      render();
    }
  }

  function activateNav() {
    document.querySelectorAll("[data-route-link]").forEach((node) => {
      const route = node.getAttribute("data-route-link");
      node.classList.toggle("is-active", route === state.route);
    });
  }

  function renderAlertPanels() {
    const parts = [];
    if (state.errorMessage) {
      parts.push(`<section class="error-panel">${escapeHtml(state.errorMessage)}</section>`);
    }
    if (state.successMessage) {
      parts.push(`<section class="success-panel">${escapeHtml(state.successMessage)}</section>`);
    }
    return parts.join("");
  }

  function renderConfigPage() {
    const hasToken = Boolean(state.apiToken.trim() || (state.config && state.config.apify_api_token));
    return `
      <section class="route-page">
        <header class="route-header">
          <div>
            <span class="section-kicker">Apify API 方案</span>
            <h2>配置 Apify</h2>
          </div>
          <button class="secondary-button" data-action="go-search">进入搜索与采集</button>
        </header>
        ${renderAlertPanels()}
        <div class="config-grid">
          <section class="settings-panel">
            <header class="panel-title">
              <h3>API 连接</h3>
              <span class="status-pill ${hasToken ? "is-ready" : ""}">${hasToken ? "已配置" : "未配置"}</span>
            </header>

            <label class="form-block">
              <span>Apify API Token</span>
              <input id="api-token-input" class="text-input" type="password" placeholder="apify_api_xxx" value="${escapeAttr(state.apiToken)}" />
            </label>

            <div class="setting-list">
              <div>
                <span>API 地址</span>
                <strong>${escapeHtml(state.config ? state.config.apify_api_base : "https://api.apify.com/v2")}</strong>
              </div>
              <div>
                <span>输出目录</span>
                <strong>${escapeHtml(state.config ? state.config.output_dir : "outputs")}</strong>
              </div>
            </div>

            <div class="page-actions">
              <button class="secondary-button" data-action="refresh-notes">刷新本地数据</button>
              <button class="primary-button" data-action="import-dataset" ${state.isImporting ? "disabled" : ""}>${state.isImporting ? "导入中..." : "导入默认 Dataset"}</button>
            </div>
          </section>

          <section class="settings-panel">
            <header class="panel-title">
              <h3>插件绑定</h3>
              <span class="status-pill ${state.actorForm ? "is-ready" : ""}">${state.actorForm ? "已读取" : "未读取"}</span>
            </header>

            <label class="form-block">
              <span>SocialDataX XHS Data API Actor ID</span>
              <input id="actor-id-input" class="text-input" type="text" value="${escapeAttr(state.selectedActorId)}" />
            </label>

            <div class="page-actions">
              <button class="secondary-button" data-action="reset-actor">使用默认插件</button>
              <button class="secondary-button" data-action="load-actor-form" ${state.isLoadingActorForm ? "disabled" : ""}>${state.isLoadingActorForm ? "读取中..." : "读取插件字段"}</button>
              <button class="primary-button" data-action="save-config">保存配置</button>
            </div>

            ${state.actorForm ? `
              <article class="plugin-summary">
                <span class="section-kicker">当前插件</span>
                <h4>${escapeHtml(state.actorForm.actor_title)}</h4>
                <p>${escapeHtml(state.actorForm.actor_description || "")}</p>
              </article>` : ""}
          </section>
        </div>
      </section>
    `;
  }

  function renderField(field) {
    const value = state.actorFormState[field.key] === undefined || state.actorFormState[field.key] === null ? "" : state.actorFormState[field.key];
    const required = isFieldRequired(field) ? `<small>必填</small>` : "";
    let control = "";
    if (field.type === "select") {
      control = `<select data-field="${field.key}">${(field.options || []).map((option) => `<option value="${escapeAttr(option.value)}" ${String(option.value) === String(value) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select>`;
    } else if (field.type === "number") {
      control = `<input data-field="${field.key}" class="text-input" type="number" value="${escapeAttr(value)}" ${field.min !== undefined ? `min="${field.min}"` : ""} ${field.max !== undefined ? `max="${field.max}"` : ""} />`;
    } else if (field.type === "boolean") {
      control = `<label class="checkbox-row"><input data-field="${field.key}" type="checkbox" ${value ? "checked" : ""} /><span>${value ? "已开启" : "未开启"}</span></label>`;
    } else if (field.key === "note_url" || field.key === "profile_url") {
      control = `<textarea data-field="${field.key}" rows="2">${escapeHtml(value)}</textarea>`;
    } else {
      control = `<input data-field="${field.key}" class="text-input" type="text" value="${escapeAttr(value)}" />`;
    }
    return `
      <label class="form-block">
        <span>${escapeHtml(field.label)} ${required}</span>
        ${control}
        ${field.help_text ? `<small class="field-help">${escapeHtml(field.help_text)}</small>` : ""}
      </label>
    `;
  }

  function renderSearchPage() {
    const sections = buildFieldSections();
    const latest = state.actorRunResult;
    return `
      <section class="route-page">
        <header class="route-header">
          <div>
            <span class="section-kicker">SocialDataX XHS Data API</span>
            <h2>搜索参数和采集</h2>
          </div>
          <button class="secondary-button" data-action="go-results">查看采集结果</button>
        </header>
        ${renderAlertPanels()}

        <section class="settings-panel collect-panel">
          <header class="panel-title">
            <div>
              <h3>搜索参数</h3>
              <p>${escapeHtml(state.actorForm ? state.actorForm.actor_title : "SocialDataX XHS Data API")}</p>
            </div>
            <button class="secondary-button" data-action="load-actor-form" ${state.isLoadingActorForm ? "disabled" : ""}>${state.isLoadingActorForm ? "读取中..." : "刷新字段"}</button>
          </header>

          ${sections.length ? `
            <div class="dynamic-fields">
              ${sections.map((section) => `
                <section class="field-section">
                  <h4>${escapeHtml(section.title)}</h4>
                  ${section.fields.map(renderField).join("")}
                </section>
              `).join("")}
            </div>` : `
            <div class="empty-state">
              <p>尚未读取插件字段。</p>
              <button class="primary-button" data-action="load-actor-form">读取 SocialDataX 字段</button>
            </div>`}
        </section>

        <section class="settings-panel run-panel">
          <header class="panel-title">
            <h3>采集设置</h3>
          </header>

          <div class="toggle-grid">
            <label class="checkbox-row">
              <input id="import-to-notes" type="checkbox" ${state.importToNotes ? "checked" : ""} />
              <span>笔记结果导入采集结果页</span>
            </label>
            <label class="checkbox-row">
              <input id="import-to-comments" type="checkbox" ${state.importToComments ? "checked" : ""} />
              <span>评论结果写入本地评论缓存</span>
            </label>
          </div>

          <div class="page-actions">
            <button class="primary-button" data-action="run-actor" ${state.isRunningActor ? "disabled" : ""}>${state.isRunningActor ? "采集中..." : "开始采集"}</button>
            <button class="secondary-button" data-action="go-config">配置 Apify</button>
          </div>
        </section>

        ${latest ? `
          <section class="settings-panel run-summary">
            <header class="panel-title">
              <h3>最近一次采集</h3>
              <span class="status-pill is-ready">${escapeHtml(latest.status || "-")}</span>
            </header>

            <div class="summary-grid">
              <div><span>Run ID</span><strong>${escapeHtml(latest.run_id || "-")}</strong></div>
              <div><span>Dataset</span><strong>${escapeHtml(latest.dataset_id || "-")}</strong></div>
              <div><span>结果数</span><strong>${escapeHtml(String(latest.item_count || 0))}</strong></div>
              <div><span>操作</span><strong>${escapeHtml(latest.operation || "-")}</strong></div>
            </div>

            <div class="page-actions">
              <button class="primary-button" data-action="go-results">打开采集结果</button>
            </div>
          </section>` : ""}
      </section>
    `;
  }

  function renderResultsPage() {
    const items = filteredItems();
    const stats = summaryStats();
    return `
      <section class="route-page">
        <header class="route-header">
          <div>
            <span class="section-kicker">SocialDataX XHS Data API</span>
            <h2>采集结果</h2>
          </div>
          <div class="page-actions header-actions">
            <button class="secondary-button" data-action="go-search">返回搜索与采集</button>
            <button class="primary-button" data-action="refresh-notes">刷新结果</button>
          </div>
        </header>
        ${renderAlertPanels()}

        <section class="results-header">
          <div>
            <span class="section-kicker">Dataset</span>
            <h3>${escapeHtml(state.notes.dataset_id || "尚未导入 Dataset")}</h3>
          </div>

          <label class="search-field">
            <span>搜索</span>
            <input id="keyword-input" class="search-input" placeholder="标题、摘要、作者、关键词" type="search" value="${escapeAttr(state.keyword)}" />
          </label>
        </section>

        <section class="stats-grid" aria-label="数据概览">
          ${stats.map((stat) => `
            <article class="metric-tile">
              <span>${escapeHtml(stat.label)}</span>
              <strong>${escapeHtml(stat.value)}</strong>
              <small>${escapeHtml(stat.hint)}</small>
            </article>
          `).join("")}
        </section>

        <section class="dataset-bar">
          <span>Rows: ${items.length} / ${state.notes.item_count}</span>
          <span>Updated: ${escapeHtml(formatUpdatedAt(state.notes.updated_at))}</span>
          <span>Actor: SocialDataX XHS Data API</span>
        </section>

        <section class="table-panel">
          <header class="table-toolbar">
            <div>
              <h3>结果明细</h3>
              <p>评论数字可点击打开本地评论缓存。</p>
            </div>
            <span class="result-count">${items.length} 条</span>
          </header>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th class="row-number">#</th>
                  ${noteFields.map((field) => `<th style="min-width:${field.width}px"><span>${escapeHtml(field.label)}</span><small>${escapeHtml(field.key)}</small></th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${items.length ? items.map((item, index) => `
                  <tr>
                    <td class="row-number">${index + 1}</td>
                    ${noteFields.map((field) => renderCell(item, field)).join("")}
                  </tr>
                `).join("") : `<tr><td class="empty-cell" colspan="${noteFields.length + 1}">暂无采集结果。</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    `;
  }

  function renderRunHistoryList() {
    if (!state.runHistory.length) {
      return `<div class="run-history-empty">暂无已保存的采集结果。</div>`;
    }
    return state.runHistory.map((run) => {
      const isActive = run.run_ref === state.selectedRunRef;
      return `
        <button class="run-history-item ${isActive ? "is-active" : ""}" data-select-run="${escapeAttr(run.run_ref)}">
          <span class="run-history-time">${escapeHtml(formatUpdatedAt(run.created_at))}</span>
          <strong>${escapeHtml(formatRunLabel(run))}</strong>
          <span class="run-history-meta">${escapeHtml(run.operation || "-")} / ${escapeHtml(String(run.item_count || 0))} 条</span>
        </button>
      `;
    }).join("");
  }

  function renderResultsPage() {
    const items = filteredItems();
    const stats = summaryStats();
    return `
      <section class="route-page">
        <header class="route-header">
          <div>
            <span class="section-kicker">SocialDataX XHS Data API</span>
            <h2>采集结果</h2>
          </div>
          <div class="page-actions header-actions">
            <button class="secondary-button" data-action="go-search">返回搜索与采集</button>
            <button class="primary-button" data-action="refresh-notes">刷新结果</button>
          </div>
        </header>
        ${renderAlertPanels()}

        <section class="results-layout">
          <aside class="run-history-panel">
            <header class="run-history-header">
              <div>
                <span class="section-kicker">历史结果</span>
                <h3>${state.runHistory.length} 份</h3>
              </div>
              <p>按时间保存。点击后在右侧查看该次采集详情。</p>
            </header>
            <div class="run-history-list">
              ${renderRunHistoryList()}
            </div>
          </aside>

          <div class="results-main">
            <section class="results-header">
              <div>
                <span class="section-kicker">当前结果</span>
                <h3>${escapeHtml(formatRunLabel(state.notes))}</h3>
                <p>${escapeHtml(state.notes.run_id ? `Run ${state.notes.run_id}` : "尚未选择采集结果")}</p>
              </div>

              <label class="search-field">
                <span>搜索</span>
                <input id="keyword-input" class="search-input" placeholder="标题、摘要、作者、关键词" type="search" value="${escapeAttr(state.keyword)}" />
              </label>
            </section>

            <section class="stats-grid" aria-label="数据概览">
              ${stats.map((stat) => `
                <article class="metric-tile">
                  <span>${escapeHtml(stat.label)}</span>
                  <strong>${escapeHtml(stat.value)}</strong>
                  <small>${escapeHtml(stat.hint)}</small>
                </article>
              `).join("")}
            </section>

            <section class="dataset-bar">
              <span>关键词: ${escapeHtml(state.notes.query_label || "-")}</span>
              <span>Dataset: ${escapeHtml(state.notes.dataset_id || "-")}</span>
              <span>Updated: ${escapeHtml(formatUpdatedAt(state.notes.updated_at))}</span>
            </section>

            <section class="table-panel">
              <header class="table-toolbar">
                <div>
                  <h3>结果明细</h3>
                  <p>评论数字可点击打开本地评论缓存。</p>
                </div>
                <span class="result-count">${items.length} 条</span>
              </header>

              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th class="row-number">#</th>
                      ${noteFields.map((field) => `<th style="min-width:${field.width}px"><span>${escapeHtml(field.label)}</span><small>${escapeHtml(field.key)}</small></th>`).join("")}
                    </tr>
                  </thead>
                  <tbody>
                    ${items.length ? items.map((item, index) => `
                      <tr>
                        <td class="row-number">${index + 1}</td>
                        ${noteFields.map((field) => renderCell(item, field)).join("")}
                      </tr>
                    `).join("") : `<tr><td class="empty-cell" colspan="${noteFields.length + 1}">暂无采集结果。</td></tr>`}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      </section>
    `;
  }

  function renderCell(item, field) {
    const value = item[field.key];
    const className = field.align === "right" ? "numeric" : "";
    if (field.key === "comment_count") {
      return `<td class="${className}"><button class="count-link" data-open-comments="${escapeAttr(item.note_id || "")}">${escapeHtml(formatCellValue(value))}</button></td>`;
    }
    if (field.type === "link" && value) {
      return `<td class="${className}"><a href="${escapeAttr(value)}" target="_blank" rel="noreferrer">打开笔记</a></td>`;
    }
    if (field.type === "noteType") {
      return `<td class="${className}"><span class="type-badge">${escapeHtml(formatNoteType(value))}</span></td>`;
    }
    return `<td class="${className}"><span class="cell-text" title="${escapeAttr(formatCellValue(value))}">${escapeHtml(formatCellValue(value))}</span></td>`;
  }

  function renderCommentsModal() {
    if (!state.activeNote) return "";
    const comments = state.comments || { items: [], warnings: [] };
    const missingReplyCount = Math.max((comments.page_comment_count || 0) - (comments.item_count || 0), 0);
    return `
      <div class="modal-backdrop" data-modal-backdrop>
        <section class="comment-modal" role="dialog" aria-modal="true">
          <header class="comment-header">
            <div>
              <span class="section-kicker">评论</span>
              <h2>笔记评论</h2>
              <p>${escapeHtml(state.activeNote.title || state.activeNote.note_id || "")}</p>
            </div>
            <button class="icon-button" data-action="close-comments">×</button>
          </header>

          <div class="comment-actions">
            <div class="comment-meta">
              <span>已采集 ${comments.item_count || 0} 条</span>
              ${comments.page_comment_count !== null && comments.page_comment_count !== undefined ? `<span>平台评论 ${comments.page_comment_count} 条</span>` : ""}
              ${missingReplyCount > 0 ? `<span class="reply-hint">${missingReplyCount} 条回复待采集</span>` : ""}
            </div>
            <div class="comment-buttons">
              <button class="secondary-button" data-action="refresh-comments">刷新</button>
              <button class="secondary-button" data-action="collect-replies" ${state.isCollectingComments || missingReplyCount <= 0 ? "disabled" : ""}>采集回复</button>
              <button class="primary-button" data-action="collect-comments" ${state.isCollectingComments ? "disabled" : ""}>${state.isCollectingComments ? "采集中..." : (comments.item_count ? "继续采集" : "采集评论")}</button>
            </div>
          </div>

          ${state.commentError ? `<div class="modal-error">${escapeHtml(state.commentError)}</div>` : ""}
          ${(comments.warnings || []).map((warning) => `<div class="modal-warning">${escapeHtml(warning)}</div>`).join("")}

          <div class="comment-list">
            ${(comments.items || []).length ? comments.items.map(renderCommentItem).join("") : `<div class="empty-comments">暂无本地评论。点击“采集评论”从 Apify 拉取。</div>`}
          </div>
        </section>
      </div>
    `;
  }

  function renderCommentItem(comment) {
    const fallbackAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' rx='40' fill='%23e5e7eb'/><circle cx='40' cy='32' r='13' fill='%239ca3af'/><path d='M18 68c4-15 16-23 22-23s18 8 22 23' fill='%239ca3af'/></svg>";
    return `
      <article class="comment-item">
        <img class="avatar" src="${escapeAttr(comment.author_avatar_url || fallbackAvatar)}" alt="" />
        <div class="comment-body">
          <div class="comment-topline">
            <span class="author-name">${escapeHtml(comment.author_name || "未知用户")}</span>
            ${comment.is_author_comment ? `<span class="author-badge">作者</span>` : ""}
            ${comment.is_pinned ? `<span class="pinned-badge">置顶评论</span>` : ""}
          </div>
          <p class="comment-content">${escapeHtml(comment.content || "-")}</p>
          <div class="comment-foot">
            <span>${escapeHtml(formatPublishTime(comment.publish_time))}</span>
            ${comment.ip_location ? `<span>${escapeHtml(comment.ip_location)}</span>` : ""}
            <span>赞 ${escapeHtml(String(comment.like_count || 0))}</span>
            ${comment.reply_count ? `<span>回复 ${escapeHtml(String(comment.reply_count))}</span>` : ""}
          </div>
          ${comment.replies && comment.replies.length ? `
            <div class="reply-list">
              ${comment.replies.map((reply) => `
                <article class="reply-item">
                  <img class="reply-avatar" src="${escapeAttr(reply.author_avatar_url || fallbackAvatar)}" alt="" />
                  <div>
                    <div class="comment-topline">
                      <span class="author-name">${escapeHtml(reply.author_name || "未知用户")}</span>
                      ${reply.is_author_comment ? `<span class="author-badge">作者</span>` : ""}
                    </div>
                    <p class="comment-content">${escapeHtml(reply.content || "-")}</p>
                    <div class="comment-foot">
                      <span>${escapeHtml(formatPublishTime(reply.publish_time))}</span>
                      ${reply.ip_location ? `<span>${escapeHtml(reply.ip_location)}</span>` : ""}
                      <span>赞 ${escapeHtml(String(reply.like_count || 0))}</span>
                    </div>
                  </div>
                </article>
              `).join("")}
            </div>` : ""}
        </div>
      </article>
    `;
  }

  function formatPublishTime(timestamp) {
    if (!timestamp) return "";
    return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp * 1000));
  }

  function render() {
    let content = "";
    if (state.route === "/apify/socialdatax-xhs/search") {
      content = renderSearchPage();
    } else if (state.route === "/apify/socialdatax-xhs/results") {
      content = renderResultsPage();
    } else {
      content = renderConfigPage();
    }
    app.innerHTML = content + renderCommentsModal();
    activateNav();
    bindEvents();
  }

  function bindEvents() {
    document.querySelectorAll("[data-route-link]").forEach((node) => {
      node.addEventListener("click", async (event) => {
        event.preventDefault();
        const route = node.getAttribute("data-route-link");
        setRoute(route);
        if (route === "/apify/socialdatax-xhs/results") {
          await refreshResults();
        }
      });
    });

    const apiTokenInput = document.getElementById("api-token-input");
    if (apiTokenInput) {
      apiTokenInput.addEventListener("input", (event) => {
        state.apiToken = event.target.value;
      });
    }

    const actorIdInput = document.getElementById("actor-id-input");
    if (actorIdInput) {
      actorIdInput.addEventListener("input", (event) => {
        state.selectedActorId = event.target.value;
      });
    }

    document.querySelectorAll("[data-field]").forEach((node) => {
      const key = node.getAttribute("data-field");
      const type = node.getAttribute("type");
      const eventName = node.tagName === "SELECT" || type === "checkbox" ? "change" : "input";
      node.addEventListener(eventName, (event) => {
        if (type === "checkbox") {
          state.actorFormState[key] = event.target.checked;
        } else {
          state.actorFormState[key] = event.target.value;
        }
        render();
      });
    });

    const keywordInput = document.getElementById("keyword-input");
    if (keywordInput) {
      keywordInput.addEventListener("input", (event) => {
        state.keyword = event.target.value;
        render();
      });
    }

    const importToNotes = document.getElementById("import-to-notes");
    if (importToNotes) {
      importToNotes.addEventListener("change", (event) => {
        state.importToNotes = event.target.checked;
      });
    }

    const importToComments = document.getElementById("import-to-comments");
    if (importToComments) {
      importToComments.addEventListener("change", (event) => {
        state.importToComments = event.target.checked;
      });
    }

    document.querySelectorAll("[data-open-comments]").forEach((node) => {
      node.addEventListener("click", async () => {
        const noteId = node.getAttribute("data-open-comments");
        const note = state.notes.items.find((item) => item.note_id === noteId);
        if (note) await openComments(note);
      });
    });

    document.querySelectorAll("[data-select-run]").forEach((node) => {
      node.addEventListener("click", async () => {
        const runRef = node.getAttribute("data-select-run");
        if (runRef) await selectRun(runRef);
      });
    });

    document.querySelectorAll("[data-action]").forEach((node) => {
      const action = node.getAttribute("data-action");
      node.addEventListener("click", async (event) => {
        if (node.disabled) return;
        event.preventDefault();
        switch (action) {
          case "go-config":
            setRoute("/apify/config");
            break;
          case "go-search":
            setRoute("/apify/socialdatax-xhs/search");
            break;
          case "go-results":
            setRoute("/apify/socialdatax-xhs/results");
            await refreshResults(state.actorRunResult && state.actorRunResult.run_id ? state.actorRunResult.run_id : "");
            break;
          case "refresh-notes":
            await refreshResults();
            break;
          case "import-dataset":
            await importDataset();
            break;
          case "reset-actor":
            state.selectedActorId = DEFAULT_ACTOR_ID;
            render();
            break;
          case "load-actor-form":
            await loadActorForm();
            break;
          case "save-config":
            await saveConfig();
            break;
          case "run-actor":
            await runActor();
            break;
          case "close-comments":
            closeComments();
            break;
          case "refresh-comments":
            await loadComments();
            break;
          case "collect-comments":
            await collectComments(false);
            break;
          case "collect-replies":
            await collectReplies();
            break;
          default:
            break;
        }
      });
    });

    // Backdrop click to close modal
    const backdrop = document.querySelector("[data-modal-backdrop]");
    if (backdrop) {
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) {
          closeComments();
        }
      });
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value == null ? "" : String(value));
  }

  window.addEventListener("popstate", async () => {
    state.route = normalizeRoute(location.pathname);
    if (state.route === "/apify/socialdatax-xhs/results") {
      await refreshResults();
      return;
    }
    render();
  });

  initialize().catch((error) => {
    state.errorMessage = error.message;
    render();
  });
})();
