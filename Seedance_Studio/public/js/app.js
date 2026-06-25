(function () {
  'use strict';

  const ACTIVE_TASK_STORAGE_KEY = 'seedance_active_task';
  const DEFAULT_POLL_TIMEOUT_MS = 15 * 60 * 1000;
  const HISTORY_RECOVERY_ATTEMPTS = 8;
  const HISTORY_RECOVERY_DELAY_MS = 1500;

  const ACTIVE_STATUSES = new Set(['PENDING', 'IN_PROGRESS', 'RUNNING', 'PROCESSING', 'QUEUED', 'SUBMITTED']);
  const SUCCESS_STATUSES = new Set(['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'DONE']);
  const FAILED_STATUSES = new Set(['FAILED', 'ERROR', 'CANCELLED', 'REJECTED', 'FAILURE']);

  const STYLE_LABELS = {
    cinematic: '电影感',
    anime: '动漫',
    ugc: 'UGC',
    ad: '广告',
    meme: 'meme'
  };

  const STYLE_TEMPLATES = {
    cinematic: '电影感画面，浅景深，柔和自然光，胶片颗粒，人物动作细腻，8K 超清。',
    anime: '日系动画风格，色彩通透，镜头流畅，角色表情自然，画面层次分明。',
    ugc: '真实 UGC 短视频风格，手持感镜头，自然光线，生活化场景，节奏轻快。',
    ad: '高级商业广告质感，产品与人物特写，干净布光，细节锐利，镜头有设计感。',
    meme: '轻松搞笑短片风格，夸张表情和反差节奏，色彩鲜明，适合传播。'
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const state = {
    apiKey: localStorage.getItem('seedance_api_key') || '',
    style: 'cinematic',
    aspectRatio: '16:9',
    duration: 5,
    resolution: '720p',
    imageUrl: null,
    videoUrl: null,
    generating: false,
    taskId: null,
    taskStartedAt: 0,
    pollTimer: null,
    retryMode: 'generate',
    templates: [],
    history: [],
    settings: {
      apiUrl: localStorage.getItem('seedance_api_url') || '',
      seedanceModel: localStorage.getItem('seedance_model') || 'ep-20260618182255-cxtc2',
      llmModel: localStorage.getItem('seedance_llm_model') || 'deepseek-v4-pro'
    }
  };

  const dom = {
    promptInput: $('#promptInput'),
    templateHint: $('#templateHint'),
    btnExpand: $('#btnExpand'),
    btnGallery: $('#btnGallery'),
    styleTags: $('#styleTags'),
    aspectGroup: $('#aspectGroup'),
    durationGroup: $('#durationGroup'),
    resolutionSelect: $('#resolutionSelect'),
    uploadRow: $('#uploadRow'),
    previewRow: $('#previewRow'),
    imageSlot: $('#imageSlot'),
    videoSlot: $('#videoSlot'),
    previewIdle: $('#previewIdle'),
    previewLoading: $('#previewLoading'),
    previewResult: $('#previewResult'),
    previewError: $('#previewError'),
    loadingText: $('#loadingText'),
    progressFill: $('#progressFill'),
    errorText: $('#errorText'),
    resultVideo: $('#resultVideo'),
    btnGenerate: $('#btnGenerate'),
    btnRetry: $('#btnRetry'),
    costHint: $('#costHint'),
    timerText: $('#timerText'),
    vfTimer: $('#vfTimer'),
    galleryModal: $('#galleryModal'),
    modalClose: $('#modalClose'),
    gallerySearch: $('#gallerySearch'),
    galleryFilter: $('#galleryFilter'),
    galleryBody: $('#galleryBody'),
    historyList: $('#historyList'),
    btnHistoryRefresh: $('#btnHistoryRefresh'),
    btnSettings: $('#btnSettings'),
    settingsModal: $('#settingsModal'),
    settingsClose: $('#settingsClose'),
    settingsApiUrl: $('#settingsApiUrl'),
    settingsApiKey: $('#settingsApiKey'),
    settingsSeedanceModel: $('#settingsSeedanceModel'),
    settingsLlmModel: $('#settingsLlmModel'),
    btnSettingsSave: $('#btnSettingsSave'),
    btnSettingsReset: $('#btnSettingsReset')
  };

  let timerInterval = null;
  let timerSeconds = 0;
  let toastTimer = null;

  function init() {
    bindEvents();
    syncControlsFromState();
    loadSettings();
    updateCostHint();
    renderPreviewThumbs();
    updateRetryButton();
    loadTemplates();
    loadHistory();
    restoreActiveTask();
  }

  function bindEvents() {
    dom.promptInput.addEventListener('input', () => {
      dom.templateHint.textContent = '';
    });

    dom.btnExpand.addEventListener('click', onExpandPrompt);
    dom.btnGenerate.addEventListener('click', onGenerate);
    dom.btnRetry.addEventListener('click', onRetry);

    dom.styleTags.addEventListener('click', (event) => {
      const button = event.target.closest('.tag');
      if (!button) return;

      const { style } = button.dataset;
      if (style === 'more') {
        openGallery();
        return;
      }

      state.style = style;
      updateStyleButtons();
      applyStyleTemplate(style);
    });

    dom.aspectGroup.addEventListener('click', (event) => {
      const button = event.target.closest('.param-btn');
      if (!button) return;

      state.aspectRatio = button.dataset.value;
      updateAspectButtons();
    });

    dom.durationGroup.addEventListener('click', (event) => {
      const button = event.target.closest('.param-btn');
      if (!button) return;

      state.duration = Number(button.dataset.value) || 5;
      updateDurationButtons();
      updateCostHint();
    });

    dom.resolutionSelect.addEventListener('change', (event) => {
      state.resolution = event.target.value || '720p';
    });

    dom.imageSlot.addEventListener('click', () => triggerUpload('image'));
    dom.videoSlot.addEventListener('click', () => triggerUpload('video'));

    dom.btnGallery.addEventListener('click', openGallery);
    dom.modalClose.addEventListener('click', closeGallery);
    dom.galleryModal.addEventListener('click', (event) => {
      if (event.target === dom.galleryModal) {
        closeGallery();
      }
    });
    dom.gallerySearch.addEventListener('input', debounce(renderGallery, 200));
    dom.galleryFilter.addEventListener('click', (event) => {
      const button = event.target.closest('.filter-btn');
      if (!button) return;

      $$('#galleryFilter .filter-btn').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      renderGallery();
    });

    dom.btnHistoryRefresh.addEventListener('click', () => {
      loadHistory(true);
    });

    dom.btnSettings.addEventListener('click', openSettings);
    dom.settingsClose.addEventListener('click', closeSettings);
    dom.settingsModal.addEventListener('click', (event) => {
      if (event.target === dom.settingsModal) {
        closeSettings();
      }
    });
    dom.btnSettingsSave.addEventListener('click', saveSettings);
    dom.btnSettingsReset.addEventListener('click', resetSettings);
  }

  function syncControlsFromState() {
    updateStyleButtons();
    updateAspectButtons();
    updateDurationButtons();
    dom.resolutionSelect.value = state.resolution;
  }

  function updateStyleButtons() {
    $$('#styleTags .tag').forEach((button) => {
      button.classList.toggle('active', button.dataset.style === state.style);
    });
  }

  function updateAspectButtons() {
    $$('#aspectGroup .param-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.value === state.aspectRatio);
    });
  }

  function updateDurationButtons() {
    $$('#durationGroup .param-btn').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.value) === state.duration);
    });
  }

  function triggerUpload(type) {
    const slot = type === 'image' ? dom.imageSlot : dom.videoSlot;
    const input = slot.querySelector('input[type="file"]');
    if (!input) return;

    input.onchange = (event) => {
      const file = event.target.files && event.target.files[0];
      input.value = '';
      if (!file) return;
      uploadFile(file, type);
    };

    input.click();
  }

  async function uploadFile(file, type) {
    toast('正在上传...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '上传失败');
      }

      if (type === 'image') {
        state.imageUrl = data.dataUrl;
      } else {
        state.videoUrl = data.dataUrl;
      }

      renderPreviewThumbs();
      toast('上传成功');
    } catch (error) {
      toast(`上传失败：${normalizeApiError(error)}`, true);
    }
  }

  function renderPreviewThumbs() {
    dom.previewRow.innerHTML = '';

    const items = [];
    if (state.imageUrl) {
      items.push(createThumb(state.imageUrl, 'image', () => {
        state.imageUrl = null;
        renderPreviewThumbs();
      }));
    }
    if (state.videoUrl) {
      items.push(createThumb(state.videoUrl, 'video', () => {
        state.videoUrl = null;
        renderPreviewThumbs();
      }));
    }

    items.forEach((item) => dom.previewRow.appendChild(item));
    const hasItems = items.length > 0;
    dom.previewRow.style.display = hasItems ? 'flex' : 'none';
    dom.uploadRow.style.display = hasItems ? 'none' : 'flex';
  }

  function createThumb(src, type, onRemove) {
    const wrapper = document.createElement('div');
    wrapper.className = 'preview-thumb';

    if (type === 'image') {
      const image = document.createElement('img');
      image.src = src;
      wrapper.appendChild(image);
    } else {
      const video = document.createElement('video');
      video.src = src;
      video.muted = true;
      video.playsInline = true;
      wrapper.appendChild(video);
    }

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-btn';
    removeButton.innerHTML = '<i class="ti ti-x"></i>';
    removeButton.addEventListener('click', onRemove);
    wrapper.appendChild(removeButton);

    return wrapper;
  }

  function applyStyleTemplate(style) {
    const template = STYLE_TEMPLATES[style];
    if (!template) return;

    dom.promptInput.value = template;
    dom.templateHint.textContent = `模板：${STYLE_LABELS[style] || style}`;
  }

  async function onExpandPrompt() {
    const prompt = dom.promptInput.value.trim();
    if (!prompt) return toast('请先输入提示词', true);
    if (!state.apiKey) return toast('请先填写 API Key', true);

    const originalHtml = dom.btnExpand.innerHTML;
    dom.btnExpand.disabled = true;
    dom.btnExpand.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 0.8s linear infinite"></i> 扩写中...';

    try {
      const response = await fetch('/api/expand-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: state.apiKey,
          prompt,
          style: state.style,
          apiUrl: state.settings.apiUrl,
          model: state.settings.llmModel
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '扩写失败');
      }

      if (data.expanded) {
        dom.promptInput.value = data.expanded;
        dom.templateHint.textContent = '已由 AI 扩写';
        toast('提示词扩写完成');
      }
    } catch (error) {
      toast(`扩写失败：${normalizeApiError(error)}`, true);
    } finally {
      dom.btnExpand.disabled = false;
      dom.btnExpand.innerHTML = originalHtml;
    }
  }

  async function onGenerate() {
    if (state.generating) return;

    const prompt = dom.promptInput.value.trim();
    if (!prompt) return toast('请输入提示词', true);
    if (!state.apiKey) return toast('请先填写 API Key', true);

    state.generating = true;
    state.retryMode = 'generate';
    updateRetryButton();
    clearPollTimer();
    setPreviewState('loading');
    dom.btnGenerate.disabled = true;
    startTimer();

    try {
      const payload = {
        apiKey: state.apiKey,
        prompt,
        duration: state.duration,
        aspectRatio: state.aspectRatio,
        resolution: state.resolution,
        apiUrl: state.settings.apiUrl,
        model: state.settings.seedanceModel
      };

      if (state.imageUrl) payload.imageUrl = state.imageUrl;
      if (state.videoUrl) payload.videoUrl = state.videoUrl;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '生成失败');
      }

      const taskId = data.task_id || data.taskId || data.data?.task_id || data.id;
      if (!taskId) {
        throw new Error('未获取到任务 ID');
      }

      beginTaskTracking({
        taskId,
        prompt,
        duration: state.duration,
        aspectRatio: state.aspectRatio,
        resolution: state.resolution,
        apiUrl: state.settings.apiUrl,
        model: state.settings.seedanceModel,
        startedAt: Date.now()
      });

      pollTask(taskId, { startedAt: state.taskStartedAt });
    } catch (error) {
      clearTaskTracking();
      state.generating = false;
      state.retryMode = 'generate';
      updateRetryButton();
      dom.btnGenerate.disabled = false;
      stopTimer();
      setPreviewState('error', normalizeApiError(error));
    }
  }

  function onRetry() {
    if (state.retryMode === 'resume' && state.taskId) {
      resumeTask(state.taskId);
      return;
    }

    onGenerate();
  }

  function resumeTask(taskId) {
    state.generating = true;
    state.retryMode = 'resume';
    updateRetryButton();
    dom.btnGenerate.disabled = true;
    setPreviewState('loading');
    dom.loadingText.textContent = '正在恢复任务进度...';
    resumeTimer(state.taskStartedAt || Date.now());
    pollTask(taskId, { startedAt: state.taskStartedAt || Date.now() });
  }

  async function pollTask(taskId, options = {}) {
    clearPollTimer();

    const startedAt = options.startedAt || state.taskStartedAt || Date.now();
    const maxDurationMs = options.maxDurationMs || DEFAULT_POLL_TIMEOUT_MS;
    let lastStatus = 'PENDING';
    let lastError = '';

    const step = async () => {
      if (!state.generating || state.taskId !== taskId) {
        return;
      }

      if (Date.now() - startedAt >= maxDurationMs) {
        const historyRecord = await waitForHistoryRecord(taskId);
        if (historyRecord?.localUrl) {
          finish('success', null, historyRecord.localUrl);
          return;
        }

        state.retryMode = 'resume';
        updateRetryButton();
        const message = lastError
          ? `生成等待超时，最后一次查询失败：${lastError}`
          : `生成等待超时，最后状态：${lastStatus || 'UNKNOWN'}。点击“继续查询”可恢复轮询。`;
        finish('error', message, null, { keepTask: true });
        return;
      }

      try {
        const payload = await fetchTaskPayload(taskId);
        const taskData = payload.data || payload;
        const normalizedStatus = normalizeTaskStatus(taskData.status || payload.status || payload.state);
        lastStatus = normalizedStatus || 'PENDING';
        lastError = '';

        updateProgress(taskData.progress || payload.progress || 0, startedAt);

        if (SUCCESS_STATUSES.has(normalizedStatus)) {
          const videoUrl = extractVideoUrl(taskData, payload);
          if (videoUrl) {
            finish('success', null, videoUrl);
            return;
          }

          const historyRecord = await waitForHistoryRecord(taskId);
          if (historyRecord?.localUrl) {
            finish('success', null, historyRecord.localUrl);
            return;
          }

          state.retryMode = 'resume';
          updateRetryButton();
          finish('error', '任务已成功，但本地视频链接还未返回。点击“继续查询”即可恢复。', null, { keepTask: true });
          return;
        }

        if (FAILED_STATUSES.has(normalizedStatus)) {
          const errorMessage = taskData.fail_reason || payload.error?.message || payload.message || '生成失败';
          finish('error', errorMessage);
          return;
        }

        scheduleNextPoll(step, ACTIVE_STATUSES.has(normalizedStatus) ? 1000 : 2000);
      } catch (error) {
        lastError = normalizeApiError(error);
        const retryable = !error.status || error.status === 429 || error.status >= 500;
        if (!retryable) {
          finish('error', lastError);
          return;
        }
        scheduleNextPoll(step, 2000);
      }
    };

    step();
  }

  function finish(type, errorMsg, videoUrl, options = {}) {
    clearPollTimer();
    state.generating = false;
    dom.btnGenerate.disabled = false;
    stopTimer();

    if (type === 'success') {
      clearTaskTracking();
      state.retryMode = 'generate';
      updateRetryButton();
      setPreviewState('result');
      dom.resultVideo.src = videoUrl;
      dom.resultVideo.load();
      dom.progressFill.style.width = '100%';
      dom.loadingText.textContent = '完成';
      loadHistory();
      toast('视频生成完成');
      return;
    }

    if (!options.keepTask) {
      clearTaskTracking();
      state.retryMode = 'generate';
    } else {
      state.retryMode = 'resume';
    }

    updateRetryButton();
    setPreviewState('error', errorMsg || '生成失败');
  }

  function setPreviewState(nextState, errorMsg) {
    dom.previewIdle.style.display = 'none';
    dom.previewLoading.style.display = 'none';
    dom.previewResult.style.display = 'none';
    dom.previewError.style.display = 'none';

    if (nextState === 'idle') {
      dom.previewIdle.style.display = 'flex';
      return;
    }

    if (nextState === 'loading') {
      dom.previewLoading.style.display = 'flex';
      dom.progressFill.style.width = '0%';
      dom.loadingText.textContent = '生成中...';
      return;
    }

    if (nextState === 'result') {
      dom.previewResult.style.display = 'flex';
      return;
    }

    dom.previewError.style.display = 'flex';
    dom.errorText.textContent = errorMsg || '生成失败';
  }

  function startTimer() {
    stopTimer();
    timerSeconds = 0;
    dom.vfTimer.classList.add('recording');
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      timerSeconds += 1;
      updateTimerDisplay();
    }, 1000);
  }

  function resumeTimer(startedAt) {
    stopTimer();
    timerSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    dom.vfTimer.classList.add('recording');
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      timerSeconds += 1;
      updateTimerDisplay();
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    dom.vfTimer.classList.remove('recording');
  }

  function updateTimerDisplay() {
    const hours = String(Math.floor(timerSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((timerSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(timerSeconds % 60).padStart(2, '0');
    dom.timerText.textContent = `${hours}:${minutes}:${seconds}`;
  }

  function updateCostHint() {
    const costs = { 5: 12, 10: 24, 15: 36 };
    dom.costHint.textContent = `预计消耗约 ${costs[state.duration] || 12} 积分`;
  }

  async function loadTemplates() {
    try {
      const response = await fetch('/api/templates');
      state.templates = await response.json();
    } catch {
      state.templates = [];
    }
  }

  async function loadHistory(showToast) {
    try {
      const response = await fetch('/api/history');
      const data = await response.json();
      state.history = Array.isArray(data) ? data : [];
      renderHistory();
      if (showToast) {
        toast('历史记录已刷新');
      }
    } catch {
      state.history = [];
      renderHistory();
      if (showToast) {
        toast('历史记录刷新失败', true);
      }
    }
  }

  function renderHistory() {
    if (!state.history.length) {
      dom.historyList.innerHTML = '<div class="history-empty">还没有历史记录</div>';
      return;
    }

    dom.historyList.innerHTML = state.history.map((item) => {
      const chips = [
        item.duration ? `${item.duration}s` : '',
        item.aspectRatio || '',
        item.resolution || '',
        item.taskId ? `任务 ${item.taskId}` : ''
      ]
        .filter(Boolean)
        .map((chip) => `<span class="history-chip">${escapeHtml(chip)}</span>`)
        .join('');

      const localUrl = item.localUrl ? escapeHtml(item.localUrl) : '';
      const ftpUrl = item.ftpUrl ? escapeHtml(item.ftpUrl) : '';
      const remoteUrl = item.remoteUrl ? escapeHtml(item.remoteUrl) : '';

      return `
        <div class="history-item">
          <div class="history-item-top">
            <div class="history-item-title">${escapeHtml(item.model || 'Seedance 视频')}</div>
            <div class="history-item-time">${escapeHtml(formatDateTime(item.createdAt))}</div>
          </div>
          <div class="history-item-prompt">${escapeHtml(item.prompt || '无提示词记录')}</div>
          <div class="history-item-meta">${chips}</div>
          <div class="history-item-actions">
            ${localUrl ? `<button class="history-open" type="button" data-action="preview" data-url="${localUrl}"><i class="ti ti-player-play"></i>打开预览</button>` : ''}
            ${localUrl ? `<a class="history-link" href="${localUrl}" target="_blank" rel="noopener noreferrer"><i class="ti ti-download"></i>本地文件</a>` : ''}
            ${ftpUrl ? `<a class="history-open" href="${ftpUrl}" target="_blank" rel="noopener noreferrer"><i class="ti ti-server"></i>FTP 下载</a>` : ''}
            ${remoteUrl ? `<a class="history-open" href="${remoteUrl}" target="_blank" rel="noopener noreferrer"><i class="ti ti-link"></i>上游链接</a>` : ''}
          </div>
        </div>
      `;
    }).join('');

    dom.historyList.querySelectorAll('[data-action="preview"]').forEach((button) => {
      button.addEventListener('click', () => {
        const { url } = button.dataset;
        if (url) {
          openHistoryVideo(url);
        }
      });
    });
  }

  function openHistoryVideo(url) {
    setPreviewState('result');
    dom.resultVideo.src = url;
    dom.resultVideo.load();
    toast('已打开历史视频');
  }

  function openGallery() {
    dom.galleryModal.style.display = 'flex';
    renderGallery();
  }

  function closeGallery() {
    dom.galleryModal.style.display = 'none';
  }

  function renderGallery() {
    const keyword = dom.gallerySearch.value.trim().toLowerCase();
    const activeCategory = $('#galleryFilter .filter-btn.active')?.dataset.cat || 'all';

    let items = state.templates.slice();

    if (activeCategory !== 'all') {
      items = items.filter((item) => item.category === activeCategory);
    }

    if (keyword) {
      items = items.filter((item) => {
        const haystack = [item.title, item.desc, item.prompt].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(keyword);
      });
    }

    if (!items.length) {
      dom.galleryBody.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px 0;">暂无匹配的提示词</p>';
      return;
    }

    dom.galleryBody.innerHTML = items.slice(0, 50).map((item) => `
      <div class="gallery-card" data-prompt="${escapeHtml(item.prompt || '')}">
        <div class="gallery-card-title">
          ${escapeHtml(item.title || '未命名模板')}
          ${item.featured ? '<span class="badge">精选</span>' : ''}
        </div>
        ${item.desc ? `<div class="gallery-card-desc">${escapeHtml(item.desc)}</div>` : ''}
        <div class="gallery-card-prompt">${escapeHtml(item.prompt || '')}</div>
        <div class="gallery-card-meta">
          ${item.style ? `<span>${escapeHtml(item.style)}</span>` : ''}
          ${item.duration ? `<span>${item.duration}s</span>` : ''}
          ${item.author ? `<span>by ${escapeHtml(item.author)}</span>` : ''}
        </div>
      </div>
    `).join('');

    dom.galleryBody.querySelectorAll('.gallery-card').forEach((card) => {
      card.addEventListener('click', () => {
        const prompt = card.dataset.prompt || '';
        dom.promptInput.value = prompt;
        dom.templateHint.textContent = '来自提示词库';
        closeGallery();
        toast('已套用提示词模板');
      });
    });
  }

  function toast(message, isError) {
    let node = document.querySelector('.toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'toast';
      document.body.appendChild(node);
    }

    node.textContent = message;
    node.className = `toast${isError ? ' error' : ''}`;
    clearTimeout(toastTimer);

    requestAnimationFrame(() => {
      node.classList.add('show');
      toastTimer = setTimeout(() => {
        node.classList.remove('show');
      }, 3000);
    });
  }

  function debounce(fn, delayMs) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delayMs);
    };
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDateTime(value) {
    if (!value) return '未知时间';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function normalizeApiError(error) {
    const message = error && error.message ? error.message : String(error || '未知错误');

    if (message.includes("Unexpected token '<'")) {
      return '接口返回了 HTML 而不是 JSON，通常是 NewAPI 地址错误，或上游服务返回了网页错误页。';
    }

    if (/No available channel|无可用渠道|model_not_found/i.test(message)) {
      return '当前 API Key 所在分组没有可用的视频渠道，或模型映射未生效。请在 NewAPI 检查该 key 对应分组、模型挂载和渠道状态。';
    }

    return message;
  }

  function loadSettings() {
    dom.settingsApiUrl.value = state.settings.apiUrl;
    dom.settingsApiKey.value = state.apiKey;
    dom.settingsSeedanceModel.value = state.settings.seedanceModel;
    dom.settingsLlmModel.value = state.settings.llmModel;
  }

  function openSettings() {
    loadSettings();
    dom.settingsModal.style.display = 'flex';
  }

  function closeSettings() {
    dom.settingsModal.style.display = 'none';
  }

  function saveSettings() {
    const apiUrl = dom.settingsApiUrl.value.trim();
    const apiKey = dom.settingsApiKey.value.trim();
    const seedanceModel = dom.settingsSeedanceModel.value.trim() || 'ep-20260618182255-cxtc2';
    const llmModel = dom.settingsLlmModel.value.trim() || 'deepseek-v4-pro';

    state.settings.apiUrl = apiUrl;
    state.settings.seedanceModel = seedanceModel;
    state.settings.llmModel = llmModel;
    state.apiKey = apiKey;

    localStorage.setItem('seedance_api_url', apiUrl);
    localStorage.setItem('seedance_model', seedanceModel);
    localStorage.setItem('seedance_llm_model', llmModel);
    localStorage.setItem('seedance_api_key', apiKey);

    toast('设置已保存');
    closeSettings();
  }

  function resetSettings() {
    dom.settingsApiUrl.value = '';
    dom.settingsApiKey.value = '';
    dom.settingsSeedanceModel.value = 'ep-20260618182255-cxtc2';
    dom.settingsLlmModel.value = 'deepseek-v4-pro';
  }

  function persistActiveTask(meta) {
    try {
      localStorage.setItem(ACTIVE_TASK_STORAGE_KEY, JSON.stringify(meta));
    } catch {}
  }

  function readActiveTask() {
    try {
      const raw = localStorage.getItem(ACTIVE_TASK_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function beginTaskTracking(meta) {
    state.taskId = meta.taskId;
    state.taskStartedAt = meta.startedAt || Date.now();
    persistActiveTask({
      ...meta,
      startedAt: state.taskStartedAt
    });
  }

  function clearTaskTracking() {
    state.taskId = null;
    state.taskStartedAt = 0;
    try {
      localStorage.removeItem(ACTIVE_TASK_STORAGE_KEY);
    } catch {}
  }

  function clearPollTimer() {
    if (state.pollTimer) {
      clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function scheduleNextPoll(callback, delayMs) {
    clearPollTimer();
    state.pollTimer = setTimeout(callback, delayMs);
  }

  function updateRetryButton() {
    dom.btnRetry.textContent = state.retryMode === 'resume' ? '继续查询' : '重试';
  }

  async function restoreActiveTask() {
    const activeTask = readActiveTask();
    if (!activeTask?.taskId || !state.apiKey) {
      return;
    }

    if (!dom.promptInput.value && activeTask.prompt) {
      dom.promptInput.value = activeTask.prompt;
      dom.templateHint.textContent = '已恢复上次生成任务';
    }

    if (activeTask.duration) {
      state.duration = activeTask.duration;
    }
    if (activeTask.aspectRatio) {
      state.aspectRatio = activeTask.aspectRatio;
    }
    if (activeTask.resolution) {
      state.resolution = activeTask.resolution;
    }
    if (activeTask.apiUrl && !state.settings.apiUrl) {
      state.settings.apiUrl = activeTask.apiUrl;
      localStorage.setItem('seedance_api_url', activeTask.apiUrl);
    }
    if (activeTask.model && !state.settings.seedanceModel) {
      state.settings.seedanceModel = activeTask.model;
      localStorage.setItem('seedance_model', activeTask.model);
    }

    syncControlsFromState();
    loadSettings();

    state.taskId = activeTask.taskId;
    state.taskStartedAt = activeTask.startedAt || Date.now();
    state.retryMode = 'resume';
    updateRetryButton();
    resumeTask(activeTask.taskId);
    toast('检测到未完成任务，已自动恢复查询');
  }

  function normalizeTaskStatus(status) {
    return String(status || '').trim().toUpperCase();
  }

  function extractVideoUrl(taskData, payload) {
    return (
      taskData?.local_result_url ||
      taskData?.result_url ||
      taskData?.video_url ||
      taskData?.content?.video_url ||
      taskData?.output?.video_url ||
      taskData?.results?.[0]?.url ||
      taskData?.data?.video_url ||
      taskData?.data?.content?.video_url ||
      taskData?.data?.output?.video_url ||
      taskData?.data?.results?.[0]?.url ||
      payload?.local_result_url ||
      payload?.result_url ||
      payload?.video_url ||
      payload?.content?.video_url ||
      payload?.output?.video_url ||
      payload?.results?.[0]?.url ||
      payload?.data?.video_url ||
      payload?.data?.content?.video_url ||
      payload?.data?.output?.video_url ||
      payload?.data?.results?.[0]?.url ||
      null
    );
  }

  async function fetchTaskPayload(taskId) {
    const activeTask = readActiveTask();
    const apiUrl = state.settings.apiUrl || activeTask?.apiUrl || '';
    const apiUrlParam = apiUrl ? `&apiUrl=${encodeURIComponent(apiUrl)}` : '';
    const response = await fetch(`/api/task/${taskId}?apiKey=${encodeURIComponent(state.apiKey)}${apiUrlParam}`);
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || data.message || `任务查询失败 (HTTP ${response.status})`);
      error.status = response.status;
      throw error;
    }

    return data;
  }

  async function fetchHistoryRecord(taskId) {
    const response = await fetch(`/api/history/${taskId}`);
    if (response.status === 404) {
      return null;
    }

    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || data.message || `历史记录查询失败 (HTTP ${response.status})`);
      error.status = response.status;
      throw error;
    }

    return data;
  }

  async function waitForHistoryRecord(taskId, attempts = HISTORY_RECOVERY_ATTEMPTS, delayMs = HISTORY_RECOVERY_DELAY_MS) {
    for (let index = 0; index < attempts; index += 1) {
      const record = await fetchHistoryRecord(taskId);
      if (record?.localUrl) {
        return record;
      }

      if (index < attempts - 1) {
        await sleep(delayMs);
      }
    }

    return null;
  }

  function updateProgress(progressValue, startedAt) {
    const numericProgress = typeof progressValue === 'string' ? parseInt(progressValue, 10) : progressValue;

    if (Number.isFinite(numericProgress) && numericProgress > 0) {
      dom.progressFill.style.width = `${Math.min(numericProgress, 100)}%`;
      dom.loadingText.textContent = `生成中 ${Math.round(numericProgress)}%`;
      return;
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const simulatedProgress = Math.min(12 + elapsedSeconds * 1.5, 92);
    dom.progressFill.style.width = `${simulatedProgress}%`;
    dom.loadingText.textContent = '生成中...';
  }

  function sleep(delayMs) {
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
