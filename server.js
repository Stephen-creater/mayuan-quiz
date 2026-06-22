import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const dataDir = path.join(__dirname, 'data');
const questionsPath = path.join(dataDir, 'questions.json');
const progressPath = path.join(dataDir, 'progress.json');
const historyPath = path.join(dataDir, 'history.jsonl');
const port = Number(process.env.PORT || 5177);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}

function ensureDataFiles() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(progressPath)) {
    writeJson(progressPath, { version: 1, updatedAt: null, questions: {}, ui: { cursors: {} } });
  }
  if (!fs.existsSync(historyPath)) {
    fs.writeFileSync(historyPath, '', 'utf8');
  }
}

function loadQuestions() {
  return readJson(questionsPath, { meta: {}, questions: [] });
}

function sendJson(res, value, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
}

function sendText(res, text, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function selectedToAnswer(question, selected) {
  if (question.type === '多选题') {
    return Array.isArray(selected) ? [...selected].sort().join('') : '';
  }
  return String(selected || '');
}

function recordEvent(event) {
  fs.appendFileSync(historyPath, `${JSON.stringify(event)}\n`, 'utf8');
}

function normalizeProgress(progress) {
  progress.version ||= 1;
  progress.questions ||= {};
  progress.ui ||= {};
  progress.ui.cursors ||= {};
  progress.ui.modeContexts ||= {};
  return progress;
}

function rememberUiState(progress, event) {
  const payload = event.payload || {};
  const cursorKey = payload.cursorKey;
  const index = Number(payload.index);
  if (typeof cursorKey === 'string' && cursorKey && Number.isInteger(index) && index >= 0) {
    progress.ui.cursors[cursorKey] = index;
  }

  const active = progress.ui.active || {};
  for (const key of ['chapter', 'topic', 'mode']) {
    if (typeof payload[key] === 'string' && payload[key]) {
      active[key] = payload[key];
    }
  }
  if (Object.keys(active).length) {
    progress.ui.active = active;
  }

  if (typeof payload.mode === 'string' && payload.mode && payload.mode !== 'marked') {
    const modeContext = progress.ui.modeContexts[payload.mode] || {};
    if (typeof payload.chapter === 'string' && payload.chapter) {
      modeContext.chapter = payload.chapter;
    }
    if (typeof payload.topic === 'string' && payload.topic) {
      modeContext.topic = payload.topic;
    }
    if (Object.keys(modeContext).length) {
      progress.ui.modeContexts[payload.mode] = modeContext;
    }
  }
}

function updateProgress(event, question) {
  const progress = normalizeProgress(readJson(progressPath, { version: 1, updatedAt: null, questions: {}, ui: { cursors: {} } }));
  const now = event.at;
  const id = event.questionId;
  rememberUiState(progress, event);

  if (!id) {
    progress.updatedAt = now;
    writeJson(progressPath, progress);
    return progress;
  }

  const item = progress.questions[id] || {
    attempts: 0,
    correctAttempts: 0,
    wrongCount: 0,
    views: 0,
    lastAnswer: null,
    lastCorrect: null,
    lastAt: null,
    marked: false,
  };

  if (event.type === 'view-question') {
    item.views += 1;
    item.lastAt = now;
  }

  if (event.type === 'answer-question' && question) {
    const answer = selectedToAnswer(question, event.payload?.selected);
    const correct = answer === question.answer;
    item.attempts += 1;
    item.correctAttempts += correct ? 1 : 0;
    item.wrongCount += correct ? 0 : 1;
    item.lastAnswer = answer;
    item.lastCorrect = correct;
    item.lastAt = now;
    event.correct = correct;
    event.expected = question.answer;
  }

  if (event.type === 'toggle-mark') {
    item.marked = Boolean(event.payload?.marked);
    item.markedAt = item.marked ? now : null;
    item.lastAt = now;
  }

  progress.questions[id] = item;
  progress.updatedAt = now;
  writeJson(progressPath, progress);
  return progress;
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = path.normalize(path.join(publicDir, pathname));
  if (!file.startsWith(publicDir)) return sendText(res, 'Forbidden', 403);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return sendText(res, 'Not found', 404);

  const ext = path.extname(file);
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  };
  res.writeHead(200, {
    'Content-Type': types[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
}

ensureDataFiles();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/questions') {
      return sendJson(res, loadQuestions());
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      return sendJson(res, normalizeProgress(readJson(progressPath, { version: 1, updatedAt: null, questions: {}, ui: { cursors: {} } })));
    }

    if (req.method === 'GET' && url.pathname === '/api/history') {
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 50)));
      const lines = fs.readFileSync(historyPath, 'utf8').trim().split('\n').filter(Boolean);
      return sendJson(res, lines.slice(-limit).map((line) => JSON.parse(line)));
    }

    if (req.method === 'POST' && url.pathname === '/api/event') {
      const body = await readBody(req);
      const questions = loadQuestions().questions;
      const question = questions.find((item) => item.id === body.questionId);
      const event = {
        at: new Date().toISOString(),
        type: String(body.type || 'click'),
        questionId: body.questionId || null,
        payload: body.payload || {},
      };
      const progress = updateProgress(event, question);
      recordEvent(event);
      return sendJson(res, { ok: true, event, progress });
    }

    return serveStatic(req, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, { ok: false, error: error.message }, 500);
  }
});

server.listen(port, () => {
  console.log(`马原刷题网站已启动: http://localhost:${port}`);
  console.log(`进度文件: ${progressPath}`);
  console.log(`历史文件: ${historyPath}`);
});
