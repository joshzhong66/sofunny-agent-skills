#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DEFAULT_SERVICE_URL = process.env.HAPPYHORSE_SERVICE_URL || 'http://10.20.3.69:3001';
const DEFAULT_POLL_INTERVAL_MS = Number(process.env.HAPPYHORSE_POLL_INTERVAL_MS || 3000);
const DEFAULT_TIMEOUT_SECONDS = Number(process.env.HAPPYHORSE_TIMEOUT_SECONDS || 600);
const DEFAULT_DOWNLOAD_DIR = process.env.HAPPYHORSE_DOWNLOAD_DIR || 'happyhorse-downloads';
const DEFAULT_DURATION = 5;
const DEFAULT_SIZE = '1280*720';
const DEFAULT_MODEL = 'happyhorse-1.1-t2v';
const SUCCESS_STATES = new Set(['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'DONE']);
const ACTIVE_STATES = new Set(['NOT_START', 'PENDING', 'IN_PROGRESS', 'RUNNING', 'PROCESSING', 'QUEUED', 'SUBMITTED']);

// 模型能力说明
const MODEL_CAPABILITIES = {
  'happyhorse-1.1-t2v': { type: 't2v', name: '文生视频 1.1', requires: ['prompt'] },
  'happyhorse-1.0-t2v': { type: 't2v', name: '文生视频 1.0', requires: ['prompt'] },
  'happyhorse-1.1-i2v': { type: 'i2v', name: '图生视频 1.1', requires: ['prompt', 'imageUrl'] },
  'happyhorse-1.0-i2v': { type: 'i2v', name: '图生视频 1.0', requires: ['prompt', 'imageUrl'] },
  'happyhorse-1.1-r2v': { type: 'r2v', name: '参考生视频 1.1', requires: ['prompt', 'imageUrl|videoUrl'] },
  'happyhorse-1.0-r2v': { type: 'r2v', name: '参考生视频 1.0', requires: ['prompt', 'imageUrl|videoUrl'] },
  'happyhorse-1.0-edit': { type: 'edit', name: '视频编辑', requires: ['prompt', 'videoUrl'] }
};

function printUsage() {
  const lines = [
    'Usage:',
    '  node generate-video.js --api-key <key> --prompt <text> [options]',
    '',
    'Options:',
    '  --service-url <url>      Seedance Studio service URL',
    '  --api-url <url>          Upstream NewAPI base URL override',
    '  --model <id>             Model id (see below)',
    '  --duration <seconds>     Video duration (3-15), default 5',
    '  --size <WxH>             Resolution, default 1280*720',
    '  --image-url <url>        Reference image URL (for i2v/r2v)',
    '  --video-url <url>        Reference video URL (for r2v/edit)',
    '  --download-dir <path>    Project-local download directory',
    '  --timeout-seconds <n>    Poll timeout, default 600',
    '  --poll-interval-ms <n>   Poll interval, default 3000',
    '  --skip-project-download  Skip the default local project copy',
    '  --list-models            List available models and exit',
    '  --help                   Show this help',
    '',
    'Available Models:',
    '  happyhorse-1.1-t2v    Text to Video (v1.1) - prompt only',
    '  happyhorse-1.0-t2v    Text to Video (v1.0) - prompt only',
    '  happyhorse-1.1-i2v    Image to Video (v1.1) - prompt + image-url',
    '  happyhorse-1.0-i2v    Image to Video (v1.0) - prompt + image-url',
    '  happyhorse-1.1-r2v    Reference to Video (v1.1) - prompt + image-url or video-url',
    '  happyhorse-1.0-r2v    Reference to Video (v1.0) - prompt + image-url or video-url',
    '  happyhorse-1.0-edit   Video Editing - prompt + video-url',
    '',
    'Environment fallbacks:',
    '  HAPPYHORSE_API_KEY',
    '  HAPPYHORSE_PROMPT',
    '  HAPPYHORSE_SERVICE_URL',
    '  HAPPYHORSE_API_URL',
    '  HAPPYHORSE_MODEL',
    '  HAPPYHORSE_DURATION',
    '  HAPPYHORSE_SIZE',
    '  HAPPYHORSE_IMAGE_URL',
    '  HAPPYHORSE_VIDEO_URL',
    '  HAPPYHORSE_DOWNLOAD_DIR',
    '  HAPPYHORSE_TIMEOUT_SECONDS',
    '  HAPPYHORSE_POLL_INTERVAL_MS',
    '  HAPPYHORSE_SKIP_PROJECT_DOWNLOAD'
  ];
  console.log(lines.join('\n'));
}

function listModels() {
  console.log('\nHappyHorse 视频生成模型列表：\n');
  console.log('模型 ID                    | 能力           | 输入要求');
  console.log('---------------------------|---------------|---------------------------');
  for (const [id, cap] of Object.entries(MODEL_CAPABILITIES)) {
    const requires = cap.requires.join(', ');
    console.log(`${id.padEnd(27)}| ${cap.name.padEnd(14)}| ${requires}`);
  }
  console.log('\n示例:');
  console.log('  # 文生视频');
  console.log('  node generate-video.js --api-key sk-xxx --prompt "一匹小马在奔跑"');
  console.log('');
  console.log('  # 图生视频');
  console.log('  node generate-video.js --api-key sk-xxx --prompt "让图片动起来" --model happyhorse-1.1-i2v --image-url https://example.com/image.jpg');
  console.log('');
  console.log('  # 参考生视频');
  console.log('  node generate-video.js --api-key sk-xxx --prompt "类似风格的视频" --model happyhorse-1.1-r2v --image-url https://example.com/ref.jpg');
  console.log('');
  console.log('  # 视频编辑');
  console.log('  node generate-video.js --api-key sk-xxx --prompt "添加夕阳效果" --model happyhorse-1.0-edit --video-url https://example.com/video.mp4');
}

function parseArgs(argv) {
  const args = {};
  const flagKeys = new Set(['help', 'skip-project-download', 'list-models']);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    if (flagKeys.has(key)) {
      args[key] = true;
      continue;
    }

    const value = argv[i + 1];
    if (value == null || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = value;
    i += 1;
  }
  return args;
}

function toPositiveNumber(value, fallback, label, min, max) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  if (min !== undefined && parsed < min) {
    throw new Error(`${label} must be at least ${min}`);
  }
  if (max !== undefined && parsed > max) {
    throw new Error(`${label} must be at most ${max}`);
  }
  return parsed;
}

function normalizeStatus(raw) {
  return String(raw || '').trim().toUpperCase();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function parseBooleanEnv(value) {
  if (value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function isInteractiveTerminal() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function askQuestion(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function promptText(rl, label, options = {}) {
  const defaultValue = options.defaultValue == null ? '' : String(options.defaultValue);
  const required = Boolean(options.required);
  const optionalHint = options.optionalHint || '';

  while (true) {
    const hintParts = [];
    if (defaultValue) {
      hintParts.push(`default: ${defaultValue}`);
    } else if (!required && optionalHint) {
      hintParts.push(optionalHint);
    }

    const suffix = hintParts.length ? ` [${hintParts.join(', ')}]` : '';
    const answer = (await askQuestion(rl, `${label}${suffix}: `)).trim();

    if (answer) {
      return answer;
    }

    if (defaultValue) {
      return defaultValue;
    }

    if (!required) {
      return '';
    }

    console.log(`${label} is required.`);
  }
}

async function promptPositiveNumber(rl, label, defaultValue, numericLabel, min, max) {
  while (true) {
    const answer = await promptText(rl, label, { defaultValue: String(defaultValue) });
    try {
      return toPositiveNumber(answer, defaultValue, numericLabel, min, max);
    } catch (error) {
      console.log(error.message);
    }
  }
}

async function promptForMissingFields(rawConfig) {
  if (!isInteractiveTerminal()) {
    return rawConfig;
  }

  const modelCap = MODEL_CAPABILITIES[rawConfig.model || DEFAULT_MODEL];
  const needsImageUrl = modelCap && (modelCap.type === 'i2v' || modelCap.type === 'r2v');
  const needsVideoUrl = modelCap && (modelCap.type === 'r2v' || modelCap.type === 'edit');

  const fieldsToPrompt = [
    !rawConfig.apiKey && 'apiKey',
    !rawConfig.prompt && 'prompt',
    !rawConfig.apiUrl && 'apiUrl',
    !rawConfig.model && 'model',
    !rawConfig.duration && 'duration',
    !rawConfig.size && 'size',
    needsImageUrl && !rawConfig.imageUrl && 'imageUrl',
    needsVideoUrl && !rawConfig.videoUrl && 'videoUrl'
  ].filter(Boolean);

  if (!fieldsToPrompt.length) {
    return rawConfig;
  }

  console.log('Missing values detected. Starting interactive prompts...');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    if (!rawConfig.apiKey) {
      rawConfig.apiKey = await promptText(rl, 'API key', { required: true });
    }

    if (!rawConfig.prompt) {
      rawConfig.prompt = await promptText(rl, 'Prompt', { required: true });
    }

    if (!rawConfig.apiUrl) {
      rawConfig.apiUrl = await promptText(rl, 'Upstream apiUrl', {
        optionalHint: 'press Enter to use the server default upstream'
      });
    }

    if (!rawConfig.model) {
      rawConfig.model = await promptText(rl, 'Model', { defaultValue: DEFAULT_MODEL });
    }

    if (!rawConfig.duration) {
      rawConfig.duration = String(
        await promptPositiveNumber(rl, 'Duration seconds (3-15)', DEFAULT_DURATION, 'duration', 3, 15)
      );
    }

    if (!rawConfig.size) {
      rawConfig.size = await promptText(rl, 'Resolution (WxH)', { defaultValue: DEFAULT_SIZE });
    }

    // 根据模型类型询问 imageUrl 或 videoUrl
    const selectedModelCap = MODEL_CAPABILITIES[rawConfig.model || DEFAULT_MODEL];
    if (selectedModelCap) {
      if ((selectedModelCap.type === 'i2v' || selectedModelCap.type === 'r2v') && !rawConfig.imageUrl) {
        rawConfig.imageUrl = await promptText(rl, 'Image URL (for i2v/r2v)', {
          optionalHint: 'URL or data:image/... base64'
        });
      }
      if ((selectedModelCap.type === 'r2v' || selectedModelCap.type === 'edit') && !rawConfig.videoUrl) {
        rawConfig.videoUrl = await promptText(rl, 'Video URL (for r2v/edit)', {
          optionalHint: 'URL or data:video/... base64'
        });
      }
    }
  } finally {
    rl.close();
  }

  return rawConfig;
}

function extractErrorMessage(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return (
      value.message ||
      value.error?.message ||
      value.error ||
      value.detail ||
      JSON.stringify(value)
    );
  }
  return String(value);
}

function sanitizeFilenamePart(value, fallback) {
  return String(value || fallback || 'happyhorse')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) || fallback;
}

function guessFileExtension(url, contentType) {
  const pathname = (() => {
    try {
      return new URL(url).pathname || '';
    } catch {
      return '';
    }
  })();
  const ext = path.extname(pathname).toLowerCase();
  if (ext) return ext;

  const type = (contentType || '').toLowerCase();
  if (type.includes('video/mp4')) return '.mp4';
  if (type.includes('video/webm')) return '.webm';
  if (type.includes('video/quicktime')) return '.mov';
  return '.mp4';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const error = new Error(`Expected JSON from ${url} but received: ${text.slice(0, 160)}`);
      error.status = response.status;
      throw error;
    }
  }

  if (!response.ok) {
    const message =
      extractErrorMessage(data?.error) ||
      extractErrorMessage(data?.message) ||
      `Request failed with HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.body = data;
    throw error;
  }

  return data;
}

function buildTaskUrl(serviceUrl, taskId, apiKey, apiUrl) {
  const url = new URL(`/api/task/${encodeURIComponent(taskId)}`, serviceUrl);
  url.searchParams.set('apiKey', apiKey);
  if (apiUrl) {
    url.searchParams.set('apiUrl', apiUrl);
  }
  return url.toString();
}

function buildHistoryUrl(serviceUrl, taskId) {
  return new URL(`/api/history/${encodeURIComponent(taskId)}`, serviceUrl).toString();
}

function buildTaskDebugUrl(serviceUrl, taskId, apiKey, apiUrl) {
  const url = new URL(`/api/task-debug/${encodeURIComponent(taskId)}`, serviceUrl);
  url.searchParams.set('apiKey', apiKey);
  if (apiUrl) {
    url.searchParams.set('apiUrl', apiUrl);
  }
  return url.toString();
}

function extractTaskId(payload) {
  return payload?.task_id || payload?.taskId || payload?.id || payload?.data?.task_id || null;
}

function extractTaskPayload(payload) {
  return payload?.data || payload || {};
}

function extractRemoteUrl(taskPayload, rootPayload) {
  return (
    taskPayload?.result_url ||
    taskPayload?.video_url ||
    taskPayload?.output?.video_url ||
    taskPayload?.results?.[0]?.url ||
    rootPayload?.result_url ||
    rootPayload?.video_url ||
    rootPayload?.output?.video_url ||
    rootPayload?.results?.[0]?.url ||
    null
  );
}

function resolveDownloadUrl(serviceUrl, candidate) {
  if (!candidate) return null;
  if (/^https?:\/\//i.test(candidate)) {
    return candidate;
  }
  return new URL(candidate, serviceUrl).toString();
}

async function saveProjectCopy(config, result) {
  if (config.skipProjectDownload) {
    return null;
  }

  const sourceUrl =
    resolveDownloadUrl(config.serviceUrl, result.localUrl) ||
    resolveDownloadUrl(config.serviceUrl, result.remoteUrl);
  if (!sourceUrl) {
    return null;
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download local project copy. HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const extension = guessFileExtension(sourceUrl, contentType);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const modelPart = sanitizeFilenamePart(
    result.historyRecord?.model || config.model || 'happyhorse',
    'happyhorse'
  );
  const taskPart = sanitizeFilenamePart(result.taskId, 'task');
  const fileName = `${timestamp}_${modelPart}_${taskPart}${extension}`;
  const targetDir = path.resolve(process.cwd(), config.downloadDir);
  const absPath = path.join(targetDir, fileName);
  const buffer = Buffer.from(await response.arrayBuffer());

  await fs.promises.mkdir(targetDir, { recursive: true });
  await fs.promises.writeFile(absPath, buffer);

  return absPath;
}

async function fetchHistoryRecord(serviceUrl, taskId) {
  try {
    return await requestJson(buildHistoryUrl(serviceUrl, taskId));
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function waitForHistoryRecord(serviceUrl, taskId, attempts, delayMs) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const record = await fetchHistoryRecord(serviceUrl, taskId);
    if (record?.localUrl) {
      return record;
    }
    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }
  return null;
}

async function createTask(config) {
  const payload = {
    apiKey: config.apiKey,
    prompt: config.prompt,
    duration: config.duration,
    aspectRatio: '16:9',
    resolution: config.resolution || '1080p',
    model: config.model
  };

  // 添加可选的 imageUrl 和 videoUrl
  if (config.imageUrl) {
    payload.imageUrl = config.imageUrl;
  }
  if (config.videoUrl) {
    payload.videoUrl = config.videoUrl;
  }

  if (config.apiUrl) payload.apiUrl = config.apiUrl;

  return requestJson(new URL('/api/generate', config.serviceUrl).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function fetchTask(config, taskId) {
  return requestJson(buildTaskUrl(config.serviceUrl, taskId, config.apiKey, config.apiUrl));
}

async function fetchTaskDebug(config, taskId) {
  try {
    return await requestJson(buildTaskDebugUrl(config.serviceUrl, taskId, config.apiKey, config.apiUrl));
  } catch (error) {
    return {
      error: error.message,
      status: error.status || null,
      body: error.body || null
    };
  }
}

function buildResult(taskId, status, taskPayload, rootPayload, historyRecord) {
  const localUrl = taskPayload?.local_result_url || historyRecord?.localUrl || null;
  const ftpUrl = taskPayload?.ftp_result_url || historyRecord?.ftpUrl || null;
  const ftpPath = taskPayload?.ftp_result_path || historyRecord?.ftpPath || null;
  const remoteUrl = extractRemoteUrl(taskPayload, rootPayload);

  return {
    taskId,
    status,
    downloadUrl: localUrl || remoteUrl || null,
    localUrl,
    ftpUrl,
    ftpPath,
    remoteUrl,
    historyRecord: historyRecord || null,
    projectFile: null,
    projectDownloadError: null
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  
  if (args.help) {
    printUsage();
    return;
  }

  if (args['list-models']) {
    listModels();
    return;
  }

  const rawConfig = await promptForMissingFields({
    apiKey: firstNonEmpty(args['api-key'], process.env.HAPPYHORSE_API_KEY),
    prompt: firstNonEmpty(args.prompt, process.env.HAPPYHORSE_PROMPT),
    serviceUrl: firstNonEmpty(
      args['service-url'],
      process.env.HAPPYHORSE_SERVICE_URL,
      DEFAULT_SERVICE_URL
    ),
    apiUrl: firstNonEmpty(
      args['api-url'],
      process.env.HAPPYHORSE_API_URL,
      process.env.NEWAPI_BASE_URL
    ),
    model: firstNonEmpty(
      args.model,
      process.env.HAPPYHORSE_MODEL,
      DEFAULT_MODEL
    ),
    duration: firstNonEmpty(args.duration, process.env.HAPPYHORSE_DURATION),
    size: firstNonEmpty(args.size, process.env.HAPPYHORSE_SIZE),
    imageUrl: firstNonEmpty(args['image-url'], process.env.HAPPYHORSE_IMAGE_URL),
    videoUrl: firstNonEmpty(args['video-url'], process.env.HAPPYHORSE_VIDEO_URL),
    downloadDir: firstNonEmpty(
      args['download-dir'],
      process.env.HAPPYHORSE_DOWNLOAD_DIR,
      DEFAULT_DOWNLOAD_DIR
    ),
    skipProjectDownload: Boolean(args['skip-project-download']) ||
      parseBooleanEnv(process.env.HAPPYHORSE_SKIP_PROJECT_DOWNLOAD),
    timeoutSeconds: firstNonEmpty(
      args['timeout-seconds'],
      process.env.HAPPYHORSE_TIMEOUT_SECONDS
    ),
    pollIntervalMs: firstNonEmpty(
      args['poll-interval-ms'],
      process.env.HAPPYHORSE_POLL_INTERVAL_MS
    )
  });

  const config = {
    apiKey: rawConfig.apiKey,
    prompt: rawConfig.prompt,
    serviceUrl: rawConfig.serviceUrl,
    apiUrl: rawConfig.apiUrl,
    model: rawConfig.model || DEFAULT_MODEL,
    duration: toPositiveNumber(rawConfig.duration, DEFAULT_DURATION, 'duration', 3, 15),
    size: rawConfig.size || DEFAULT_SIZE,
    imageUrl: rawConfig.imageUrl,
    videoUrl: rawConfig.videoUrl,
    downloadDir: rawConfig.downloadDir,
    skipProjectDownload: Boolean(rawConfig.skipProjectDownload),
    timeoutSeconds: toPositiveNumber(
      rawConfig.timeoutSeconds,
      DEFAULT_TIMEOUT_SECONDS,
      'timeout-seconds'
    ),
    pollIntervalMs: toPositiveNumber(
      rawConfig.pollIntervalMs,
      DEFAULT_POLL_INTERVAL_MS,
      'poll-interval-ms'
    )
  };

  if (!config.apiKey) {
    throw new Error(
      'Missing api key. Pass --api-key, set HAPPYHORSE_API_KEY, or run in an interactive terminal.'
    );
  }

  if (!config.prompt) {
    throw new Error(
      'Missing prompt. Pass --prompt, set HAPPYHORSE_PROMPT, or run in an interactive terminal.'
    );
  }

  // 验证模型参数
  const modelCap = MODEL_CAPABILITIES[config.model];
  if (!modelCap) {
    console.warn(`Warning: Unknown model "${config.model}". Proceeding anyway.`);
  } else {
    if (modelCap.type === 'i2v' && !config.imageUrl) {
      throw new Error(`Model ${config.model} (图生视频) requires --image-url parameter.`);
    }
    if (modelCap.type === 'edit' && !config.videoUrl) {
      throw new Error(`Model ${config.model} (视频编辑) requires --video-url parameter.`);
    }
    if (modelCap.type === 'r2v' && !config.imageUrl && !config.videoUrl) {
      throw new Error(`Model ${config.model} (参考生视频) requires --image-url or --video-url parameter.`);
    }
  }

  console.log(`\n🎬 Submitting video generation task...`);
  console.log(`  Service: ${config.serviceUrl}`);
  console.log(`  Model: ${config.model} (${modelCap?.name || 'Unknown'})`);
  console.log(`  Prompt: ${config.prompt.slice(0, 80)}${config.prompt.length > 80 ? '...' : ''}`);
  console.log(`  Duration: ${config.duration}s`);
  if (config.imageUrl) console.log(`  Image URL: ${config.imageUrl.slice(0, 60)}...`);
  if (config.videoUrl) console.log(`  Video URL: ${config.videoUrl.slice(0, 60)}...`);

  const submitted = await createTask(config);
  const taskId = extractTaskId(submitted);
  if (!taskId) {
    throw new Error('No task id returned from /api/generate');
  }

  console.log(`\n✅ Task submitted. task_id: ${taskId}`);
  console.log(`\n⏳ Polling for results...`);

  const deadline = Date.now() + config.timeoutSeconds * 1000;
  let lastPayload = null;
  let lastTaskPayload = null;
  let lastStatus = '';

  while (Date.now() <= deadline) {
    await sleep(config.pollIntervalMs);
    const payload = await fetchTask(config, taskId);
    const taskPayload = extractTaskPayload(payload);
    const status = normalizeStatus(taskPayload.status || payload?.status || payload?.state);

    lastPayload = payload;
    lastTaskPayload = taskPayload;
    lastStatus = status;

    const progress = taskPayload.progress || payload?.progress || '';
    console.log(`  Status: ${status}${progress ? ` (${progress})` : ''}`);

    if (ACTIVE_STATES.has(status)) {
      continue;
    }

    if (SUCCESS_STATES.has(status)) {
      const historyRecord = await waitForHistoryRecord(config.serviceUrl, taskId, 5, 1500);
      const result = buildResult(taskId, status, taskPayload, payload, historyRecord);
      try {
        result.projectFile = await saveProjectCopy(config, result);
      } catch (error) {
        result.projectDownloadError = error.message;
      }
      console.log('\n✅ Video generation completed!\n');
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const historyRecord = await fetchHistoryRecord(config.serviceUrl, taskId);
    const error = new Error(`Task ${taskId} finished with status ${status || 'UNKNOWN'}`);
    error.taskId = taskId;
    error.statusText = status || 'UNKNOWN';
    error.historyRecord = historyRecord;
    error.payload = payload;
    throw error;
  }

  const historyRecord = await fetchHistoryRecord(config.serviceUrl, taskId);
  if (historyRecord?.localUrl) {
    const result = buildResult(taskId, lastStatus || 'TIMEOUT_RECOVERED', lastTaskPayload || {}, lastPayload || {}, historyRecord);
    try {
      result.projectFile = await saveProjectCopy(config, result);
    } catch (error) {
      result.projectDownloadError = error.message;
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const debugPayload = await fetchTaskDebug(config, taskId);
  const timeoutError = new Error(`Timed out waiting for task ${taskId}`);
  timeoutError.taskId = taskId;
  timeoutError.statusText = lastStatus || 'TIMEOUT';
  timeoutError.historyRecord = historyRecord;
  timeoutError.debugPayload = debugPayload;
  timeoutError.payload = lastPayload;
  throw timeoutError;
}

run().catch((error) => {
  const details = {
    error: error.message,
    taskId: error.taskId || null,
    status: error.statusText || null,
    historyRecord: error.historyRecord || null,
    debug: error.debugPayload || null,
    payload: error.payload || error.body || null
  };
  console.error('\n❌ Error:');
  console.error(JSON.stringify(details, null, 2));
  process.exit(1);
});
