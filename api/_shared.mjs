import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { get, list, put } from '@vercel/blob';

const questionsPath = fileURLToPath(new URL('../data/questions.json', import.meta.url));
const bundledProgressPath = fileURLToPath(new URL('../data/progress.json', import.meta.url));
const legacyProgressPath = 'mayuan/progress.json';
const legacyHistoryPath = 'mayuan/history.json';
const progressPrefix = 'mayuan/progress/';
const historyPrefix = 'mayuan/history/';
const githubProgressPath = 'data/progress.json';
let cachedQuestions = null;

export function sendJson(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

export function authError(req, res) {
  const required = process.env.SYNC_TOKEN || '';
  if (!required) return false;
  const provided = req.headers['x-sync-token'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (provided === required) return false;
  sendJson(res, 401, { ok: false, error: '需要同步口令' });
  return true;
}

export function loadQuestions() {
  if (!cachedQuestions) {
    cachedQuestions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
  }
  return cachedQuestions;
}

export function emptyProgress() {
  return { version: 1, updatedAt: null, questions: {}, ui: { cursors: {}, modeContexts: {} } };
}

export function normalizeProgress(progress = emptyProgress()) {
  progress.version ||= 1;
  progress.questions ||= {};
  progress.ui ||= {};
  progress.ui.cursors ||= {};
  progress.ui.modeContexts ||= {};
  return progress;
}

async function streamToText(stream) {
  const response = new Response(stream);
  return response.text();
}

async function readJsonBlob(path, fallback) {
  try {
    const result = await get(path, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) return fallback;
    return JSON.parse(await streamToText(result.stream));
  } catch (error) {
    if (error.name === 'BlobNotFoundError' || /not found/i.test(error.message)) return fallback;
    throw error;
  }
}

function githubConfig() {
  const token = process.env.GITHUB_PROGRESS_TOKEN || process.env.GITHUB_TOKEN || '';
  const owner = process.env.GITHUB_PROGRESS_OWNER || 'Stephen-creater';
  const repo = process.env.GITHUB_PROGRESS_REPO || 'mayuan-quiz';
  const branch = process.env.GITHUB_PROGRESS_BRANCH || 'main';
  return token ? { token, owner, repo, branch } : null;
}

async function githubRequest(config, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mayuan-quiz-sync',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub ${response.status}: ${text}`);
  }
  return response.json();
}

function decodeGitHubContent(content) {
  return Buffer.from(String(content || '').replace(/\s/g, ''), 'base64').toString('utf8');
}

async function readGitHubProgress() {
  const config = githubConfig();
  if (!config) return null;
  const data = await githubRequest(
    config,
    `/repos/${config.owner}/${config.repo}/contents/${githubProgressPath}?ref=${encodeURIComponent(config.branch)}`,
  );
  return normalizeProgress(JSON.parse(decodeGitHubContent(data.content)));
}

async function writeGitHubProgress(progress) {
  const config = githubConfig();
  if (!config) return false;
  const current = await githubRequest(
    config,
    `/repos/${config.owner}/${config.repo}/contents/${githubProgressPath}?ref=${encodeURIComponent(config.branch)}`,
  );
  const content = Buffer.from(`${JSON.stringify(normalizeProgress(progress), null, 2)}\n`, 'utf8').toString('base64');
  await githubRequest(config, `/repos/${config.owner}/${config.repo}/contents/${githubProgressPath}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: 'Update quiz progress',
      content,
      sha: current.sha,
      branch: config.branch,
    }),
  });
  return true;
}

function readBundledProgress() {
  try {
    return normalizeProgress(JSON.parse(fs.readFileSync(bundledProgressPath, 'utf8')));
  } catch {
    return emptyProgress();
  }
}

async function writeJsonBlob(path, value) {
  await put(path, JSON.stringify(value), {
    access: 'private',
    allowOverwrite: false,
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 60,
  });
}

async function listAll(prefix) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    blobs.push(...page.blobs);
    cursor = page.cursor;
    if (!page.hasMore) break;
  } while (cursor);
  return blobs;
}

async function readLatestJsonBlob(prefix, fallback) {
  const blobs = await listAll(prefix);
  const latest = blobs.sort((a, b) => a.pathname.localeCompare(b.pathname)).at(-1);
  if (!latest) return fallback;
  return readJsonBlob(latest.pathname, fallback);
}

export async function readProgress() {
  const githubProgress = await readGitHubProgress();
  if (githubProgress) return githubProgress;

  const snapshot = await readLatestJsonBlob(progressPrefix, null);
  if (snapshot) return normalizeProgress(snapshot);
  try {
    return normalizeProgress(await readJsonBlob(legacyProgressPath, readBundledProgress()));
  } catch (error) {
    if (/403|Forbidden|suspended/i.test(error.message)) return readBundledProgress();
    throw error;
  }
}

export async function writeProgress(progress) {
  if (await writeGitHubProgress(progress)) return;

  const path = `${progressPrefix}${Date.now()}-${randomUUID()}.json`;
  await writeJsonBlob(path, normalizeProgress(progress));
}

export async function readHistory(limit = 50) {
  const blobs = await listAll(historyPrefix);
  if (!blobs.length) {
    const history = await readJsonBlob(legacyHistoryPath, []);
    return history.slice(-limit);
  }
  const latest = blobs.sort((a, b) => a.pathname.localeCompare(b.pathname)).slice(-limit);
  const events = await Promise.all(latest.map((blob) => readJsonBlob(blob.pathname, null)));
  return events.filter(Boolean);
}

export async function recordHistory(event) {
  const path = `${historyPrefix}${Date.now()}-${randomUUID()}.json`;
  try {
    await writeJsonBlob(path, event);
  } catch (error) {
    if (!/suspended|403|Forbidden/i.test(error.message)) throw error;
  }
}

export function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

export function selectedToAnswer(question, selected) {
  if (question.type === '多选题') {
    return Array.isArray(selected) ? [...selected].sort().join('') : '';
  }
  return String(selected || '');
}

export function rememberUiState(progress, event) {
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

export function updateProgress(progress, event, question) {
  normalizeProgress(progress);
  const now = event.at;
  const id = event.questionId;
  rememberUiState(progress, event);

  if (!id) {
    progress.updatedAt = now;
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
  return progress;
}

function newerItem(a = {}, b = {}) {
  return String(b.lastAt || '') > String(a.lastAt || '') ? b : a;
}

export function mergeProgress(existing, incoming) {
  const merged = normalizeProgress(structuredClone(existing || emptyProgress()));
  const source = normalizeProgress(structuredClone(incoming || emptyProgress()));
  for (const [id, item] of Object.entries(source.questions || {})) {
    const current = merged.questions[id] || {};
    const newer = newerItem(current, item);
    merged.questions[id] = {
      ...current,
      ...newer,
      attempts: Math.max(current.attempts || 0, item.attempts || 0),
      correctAttempts: Math.max(current.correctAttempts || 0, item.correctAttempts || 0),
      wrongCount: Math.max(current.wrongCount || 0, item.wrongCount || 0),
      views: Math.max(current.views || 0, item.views || 0),
      marked: Boolean(current.marked || item.marked),
      markedAt: [current.markedAt, item.markedAt].filter(Boolean).sort().at(-1) || null,
    };
  }

  merged.ui = {
    ...(merged.ui || {}),
    ...(source.ui || {}),
    cursors: { ...(merged.ui?.cursors || {}), ...(source.ui?.cursors || {}) },
    modeContexts: { ...(merged.ui?.modeContexts || {}), ...(source.ui?.modeContexts || {}) },
  };
  merged.updatedAt = [merged.updatedAt, source.updatedAt].filter(Boolean).sort().at(-1) || new Date().toISOString();
  return normalizeProgress(merged);
}

export function progressSummary(progress) {
  const entries = Object.values(progress.questions || {});
  return {
    submitted: entries.filter((item) => (item.attempts || 0) > 0).length,
    totalAttempts: entries.reduce((sum, item) => sum + (item.attempts || 0), 0),
    wrongQuestions: entries.filter((item) => (item.wrongCount || 0) > 0).length,
    wrongCount: entries.reduce((sum, item) => sum + (item.wrongCount || 0), 0),
    marked: entries.filter((item) => item.marked).length,
    updatedAt: progress.updatedAt,
  };
}
