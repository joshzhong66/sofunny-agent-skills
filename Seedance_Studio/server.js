require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const HISTORY_DIR = path.join(__dirname, 'history');
const HISTORY_VIDEOS_DIR = path.join(HISTORY_DIR, 'videos');
const HISTORY_FILE = path.join(HISTORY_DIR, 'records.json');
const FTP_MIRROR_DIR = (process.env.FTP_MIRROR_DIR || '').trim();
const FTP_PUBLIC_BASE_URL = (process.env.FTP_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
const pendingHistorySaves = new Set();
const pendingTaskMeta = new Map();

// NewAPI configuration
const NEWAPI_BASE_URL = process.env.NEWAPI_BASE_URL || 'https://api.newapi.com';
const SEEDANCE_MODEL = process.env.SEEDANCE_MODEL || 'seedance-2.0';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

console.log('Environment variables loaded:');
console.log('NEWAPI_BASE_URL:', NEWAPI_BASE_URL);
console.log('SEEDANCE_MODEL:', SEEDANCE_MODEL);
console.log('LLM_MODEL:', LLM_MODEL);
console.log('FTP_MIRROR_DIR:', FTP_MIRROR_DIR || '(disabled)');
console.log('FTP_PUBLIC_BASE_URL:', FTP_PUBLIC_BASE_URL || '(disabled)');

function resolveBaseUrl(overrideUrl) {
  const baseUrl = (overrideUrl || NEWAPI_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    const err = new Error('NewAPI base URL is not configured');
    err.status = 500;
    throw err;
  }

  try {
    new URL(baseUrl);
  } catch {
    const err = new Error(`Invalid apiUrl: ${baseUrl}`);
    err.status = 400;
    throw err;
  }

  return baseUrl;
}

function ensureHistoryStorage() {
  fs.mkdirSync(HISTORY_VIDEOS_DIR, { recursive: true });
  if (FTP_MIRROR_DIR) {
    fs.mkdirSync(FTP_MIRROR_DIR, { recursive: true });
  }
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, '[]', 'utf8');
  }
}

function buildFtpPublicUrl(fileName) {
  if (!FTP_PUBLIC_BASE_URL) return null;
  return `${FTP_PUBLIC_BASE_URL}/${fileName}`;
}

function readHistoryRecords() {
  ensureHistoryStorage();
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeHistoryRecords(records) {
  ensureHistoryStorage();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(records, null, 2), 'utf8');
}

function sanitizeFilenamePart(value, fallback) {
  return String(value || fallback || 'seedance')
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

async function downloadVideoToHistory(videoUrl, options) {
  ensureHistoryStorage();

  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download generated video. HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const extension = guessFileExtension(videoUrl, contentType);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const modelPart = sanitizeFilenamePart(options.model, 'seedance');
  const taskPart = sanitizeFilenamePart(options.taskId, 'task');
  const fileName = `${timestamp}_${modelPart}_${taskPart}${extension}`;
  const absPath = path.join(HISTORY_VIDEOS_DIR, fileName);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(absPath, buffer);

  let ftpPath = null;
  let ftpUrl = null;
  if (FTP_MIRROR_DIR) {
    ftpPath = path.join(FTP_MIRROR_DIR, fileName);
    fs.writeFileSync(ftpPath, buffer);
    ftpUrl = buildFtpPublicUrl(fileName);
  }

  const relativePath = path.join('history', 'videos', fileName).replace(/\\/g, '/');
  return {
    fileName,
    absPath,
    relativePath,
    publicUrl: `/${relativePath}`,
    ftpPath,
    ftpUrl
  };
}

function createHistoryRecord(payload) {
  const records = readHistoryRecords();
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    prompt: payload.prompt || '',
    duration: payload.duration || null,
    aspectRatio: payload.aspectRatio || null,
    resolution: payload.resolution || null,
    model: payload.model || null,
    taskId: payload.taskId || null,
    remoteUrl: payload.remoteUrl || null,
    localUrl: payload.localUrl || null,
    localPath: payload.localPath || null,
    ftpUrl: payload.ftpUrl || null,
    ftpPath: payload.ftpPath || null
  };

  records.unshift(record);
  writeHistoryRecords(records.slice(0, 100));
  return record;
}

function attachResultUrls(payload, record) {
  if (!record) return;

  if (payload?.data) {
    payload.data.local_result_url = record.localUrl;
    payload.data.ftp_result_url = record.ftpUrl;
    payload.data.ftp_result_path = record.ftpPath;
  } else if (payload) {
    payload.local_result_url = record.localUrl;
    payload.ftp_result_url = record.ftpUrl;
    payload.ftp_result_path = record.ftpPath;
  }
}

async function persistHistoryForTask(taskId, remoteUrl, fallbackModel) {
  if (!taskId || !remoteUrl) return null;

  const records = readHistoryRecords();
  const existing = records.find((item) => item.taskId === taskId);
  if (existing) return existing;

  const meta = pendingTaskMeta.get(taskId) || {};
  const downloaded = await downloadVideoToHistory(remoteUrl, {
    model: meta.model || fallbackModel || SEEDANCE_MODEL,
    taskId
  });

  const record = createHistoryRecord({
    prompt: meta.prompt || '',
    duration: meta.duration || null,
    aspectRatio: meta.aspectRatio || null,
    resolution: meta.resolution || null,
    model: meta.model || fallbackModel || SEEDANCE_MODEL,
    taskId,
    remoteUrl,
    localUrl: downloaded.publicUrl,
    localPath: downloaded.relativePath,
    ftpUrl: downloaded.ftpUrl,
    ftpPath: downloaded.ftpPath
  });

  pendingTaskMeta.delete(taskId);
  return record;
}

async function readJsonResponse(resp, label) {
  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  const text = await resp.text();

  if (!text) {
    return { data: null, text: '', contentType };
  }

  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      return { data: JSON.parse(text), text, contentType };
    } catch {
      const err = new Error(`${label} returned invalid JSON. HTTP ${resp.status}.`);
      err.status = resp.status || 502;
      throw err;
    }
  }

  const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 160);
  const prettyType = contentType || 'non-JSON content';
  const err = new Error(
    `${label} returned ${prettyType} instead of JSON. This usually means the apiUrl is wrong, or the upstream service returned an HTML error page. HTTP ${resp.status}. Snippet: ${snippet}`
  );
  err.status = resp.status || 502;
  throw err;
}

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/history', express.static(HISTORY_DIR));

// Upload reference file and return base64
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const filePath = path.join('uploads', req.file.filename);
  const ext = path.extname(req.file.originalname).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.gif': 'image/gif',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm'
  };
  const mime = mimeMap[ext] || 'application/octet-stream';
  const absPath = path.join(__dirname, 'public', filePath);
  const b64 = fs.readFileSync(absPath).toString('base64');
  const dataUrl = `data:${mime};base64,${b64}`;
  res.json({ url: `/${filePath}`, dataUrl, mime });
});

// Proxy: Create video generation task
app.post('/api/generate', async (req, res) => {
  try {
    const { apiKey, prompt, imageUrl, videoUrl, duration, aspectRatio, resolution, apiUrl, model } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API Key is required' });
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const baseUrl = resolveBaseUrl(apiUrl);
    const seedanceModel = model || SEEDANCE_MODEL;

    console.log('Using model:', seedanceModel);
    console.log('Using base URL:', baseUrl);

    const body = {
      model: seedanceModel,
      prompt,
      duration: duration || 5,
      aspect_ratio: aspectRatio || '16:9',
      resolution: resolution || '1080p'
    };
    if (imageUrl) body.image_url = imageUrl;
    if (videoUrl) body.video_url = videoUrl;

    const resp = await fetch(`${baseUrl}/v1/video/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const { data, text } = await readJsonResponse(resp, 'Video generation API');
    if (!resp.ok) {
      return res.status(resp.status).json({
        error: data?.error?.message || data?.message || text || `Video generation API failed with HTTP ${resp.status}`
      });
    }

    const taskId = data?.task_id || data?.taskId || data?.data?.task_id || data?.id || null;
    if (taskId) {
      pendingTaskMeta.set(taskId, {
        prompt,
        duration: duration || 5,
        aspectRatio: aspectRatio || '16:9',
        resolution: resolution || '1080p',
        model: seedanceModel
      });
      console.log('Created task:', taskId);
    }

    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Proxy: Poll task status
app.get('/api/task/:taskId', async (req, res) => {
  try {
    const { apiKey, apiUrl } = req.query;
    if (!apiKey) return res.status(400).json({ error: 'API Key is required' });

    const baseUrl = resolveBaseUrl(apiUrl);
    const resp = await fetch(`${baseUrl}/v1/video/generations/${req.params.taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const { data, text } = await readJsonResponse(resp, 'Task status API');
    if (!resp.ok) {
      return res.status(resp.status).json({
        error: data?.error?.message || data?.message || text || `Task status API failed with HTTP ${resp.status}`
      });
    }
    const taskData = data?.data || data;
    const status = String(taskData?.status || data?.status || data?.state || '').toUpperCase();
    const successStates = ['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'DONE'];
    const remoteUrl =
      taskData?.result_url ||
      taskData?.video_url ||
      taskData?.content?.video_url ||
      taskData?.output?.video_url ||
      taskData?.results?.[0]?.url ||
      taskData?.data?.video_url ||
      taskData?.data?.content?.video_url ||
      taskData?.data?.output?.video_url ||
      taskData?.data?.results?.[0]?.url ||
      data?.video_url ||
      data?.content?.video_url ||
      data?.output?.video_url ||
      data?.results?.[0]?.url ||
      data?.data?.video_url ||
      data?.data?.content?.video_url ||
      data?.data?.output?.video_url ||
      data?.data?.results?.[0]?.url;

    if (successStates.includes(status) && remoteUrl) {
      const records = readHistoryRecords();
      const existing = records.find((item) => item.taskId === req.params.taskId);

      if (existing) {
        attachResultUrls(data, existing);
      } else if (!pendingHistorySaves.has(req.params.taskId)) {
        pendingHistorySaves.add(req.params.taskId);
        try {
          const record = await persistHistoryForTask(
            req.params.taskId,
            remoteUrl,
            taskData?.model || data?.model || SEEDANCE_MODEL
          );
          attachResultUrls(data, record);
        } catch (error) {
          console.warn(`History save failed for task ${req.params.taskId}: ${error.message}`);
        } finally {
          pendingHistorySaves.delete(req.params.taskId);
        }
      }
    }

    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/task-debug/:taskId', async (req, res) => {
  try {
    const { apiKey, apiUrl } = req.query;
    if (!apiKey) return res.status(400).json({ error: 'API Key is required' });

    const baseUrl = resolveBaseUrl(apiUrl);
    const resp = await fetch(`${baseUrl}/v1/video/generations/${req.params.taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const contentType = resp.headers.get('content-type') || '';
    const text = await resp.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    res.status(resp.status).json({
      statusCode: resp.status,
      contentType,
      body: data || text
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/history', (req, res) => {
  const records = readHistoryRecords();
  res.json(records);
});

app.get('/api/history/:taskId', (req, res) => {
  const records = readHistoryRecords();
  const record = records.find((item) => item.taskId === req.params.taskId);

  if (!record) {
    return res.status(404).json({ error: 'History record not found' });
  }

  res.json(record);
});

// Proxy: Validate API connectivity and credentials
app.get('/api/validate', async (req, res) => {
  try {
    const { apiKey, apiUrl } = req.query;
    if (!apiKey) return res.status(400).json({ error: 'API Key is required' });

    const baseUrl = resolveBaseUrl(apiUrl);
    const resp = await fetch(`${baseUrl}/v1/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const { data, text } = await readJsonResponse(resp, 'API validation');
    if (!resp.ok) {
      return res.status(resp.status).json({
        error: data?.error?.message || data?.message || text || `API validation failed with HTTP ${resp.status}`
      });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Proxy: AI prompt expansion via LLM
app.post('/api/expand-prompt', async (req, res) => {
  try {
    const { apiKey, prompt, style, apiUrl, model } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API Key is required' });

    const baseUrl = resolveBaseUrl(apiUrl);
    const llmModel = model || LLM_MODEL;

    const systemPrompt = `你是一位专业的 Seedance 2.0 视频提示词工程师。请将用户的简短描述扩展为一段高质量的 Seedance 2.0 视频生成提示词。

要求：
- 提示词应包含具体的场景描述、镜头运动、光线氛围、角色细节
- 使用 Seedance 2.0 支持的格式：时间轴分镜（如 [00:00-00:05]）
- 包含具体的摄像机运动描述（推进、拉远、环绕、跟踪等）
- 描述视觉风格、色调、分辨率等技术参数
- 总时长控制在 5-15 秒
- 使用中文输出
${style ? `\n- 当前风格模板：${style}，请按此风格扩写` : ''}

参考优秀提示词结构示例：
[风格] 描述风格、画质、渲染引擎
[场景] 描述环境、光线、氛围
[时间轴] 按秒分镜，描述画面内容、镜头运动、角色动作
[音效] 描述背景音乐、环境音等（可选）

请直接输出扩展后的提示词，不要添加额外解释。`;

    const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: llmModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 2000
      })
    });

    const { data, text } = await readJsonResponse(resp, 'Prompt expansion API');
    if (!resp.ok) {
      return res.status(resp.status).json({
        error: data?.error?.message || data?.message || text || `Prompt expansion API failed with HTTP ${resp.status}`
      });
    }
    const expanded = data.choices?.[0]?.message?.content || '';
    res.json({ expanded });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Serve prompt templates
app.get('/api/templates', (req, res) => {
  const tplPath = path.join(__dirname, 'public', 'templates', 'prompts.json');
  if (fs.existsSync(tplPath)) {
    res.json(JSON.parse(fs.readFileSync(tplPath, 'utf-8')));
  } else {
    res.json([]);
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Seedance Studio running at http://localhost:${PORT}\n`);
});
