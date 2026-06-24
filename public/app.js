const state = {
  questions: [],
  meta: {},
  progress: { questions: {} },
  chapters: [],
  currentChapter: '',
  currentTopic: '',
  mode: 'normal',
  currentList: [],
  index: 0,
  answered: false,
  selected: [],
  lastViewed: '',
  localCursors: {},
  modeContexts: {},
  expandedChapters: new Set(),
  markedListOpen: true,
  sidebarOpen: false,
};

const $ = (id) => document.getElementById(id);

const els = {
  saveStatus: $('saveStatus'),
  summary: $('summary'),
  mobileMenuButton: $('mobileMenuButton'),
  mobileCloseSidebar: $('mobileCloseSidebar'),
  sidebarOverlay: $('sidebarOverlay'),
  chapterList: $('chapterList'),
  topicTitle: $('topicTitle'),
  topicMeta: $('topicMeta'),
  emptyState: $('emptyState'),
  markedSummary: $('markedSummary'),
  syncGate: $('syncGate'),
  syncTokenInput: $('syncTokenInput'),
  syncTokenButton: $('syncTokenButton'),
  syncTokenError: $('syncTokenError'),
  questionCard: $('questionCard'),
  prevQuestionButton: $('prevQuestionButton'),
  jumpNextButton: $('jumpNextButton'),
  questionSlider: $('questionSlider'),
  questionPosition: $('questionPosition'),
  markedListButton: $('markedListButton'),
  questionLabel: $('questionLabel'),
  questionStem: $('questionStem'),
  tagLine: $('tagLine'),
  answerForm: $('answerForm'),
  submitButton: $('submitButton'),
  nextButton: $('nextButton'),
  resultBox: $('resultBox'),
  markButton: $('markButton'),
};

const syncTokenKey = 'mayuanSyncToken';
let syncTokenPromise = null;
let saveQueue = Promise.resolve();
let pendingSaves = 0;
let latestSaveSeq = 0;
let lastSavedAt = '';

function readTokenFromUrl() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('sync');
  if (!token) return;
  localStorage.setItem(syncTokenKey, token);
  url.searchParams.delete('sync');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function syncToken() {
  return localStorage.getItem(syncTokenKey) || '';
}

function requestSyncToken() {
  if (syncTokenPromise) return syncTokenPromise;
  els.syncGate.classList.remove('hidden');
  els.syncTokenError.textContent = '';
  setTimeout(() => els.syncTokenInput.focus(), 0);
  syncTokenPromise = new Promise((resolve) => {
    const submit = () => {
      const token = els.syncTokenInput.value.trim();
      if (!token) {
        els.syncTokenError.textContent = '请输入同步口令。';
        return;
      }
      localStorage.setItem(syncTokenKey, token);
      els.syncGate.classList.add('hidden');
      els.syncTokenInput.value = '';
      syncTokenPromise = null;
      resolve(token);
    };
    els.syncTokenButton.onclick = submit;
    els.syncTokenInput.onkeydown = (event) => {
      if (event.key === 'Enter') submit();
    };
  });
  return syncTokenPromise;
}

async function api(path, options = {}, retries = 2) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = syncToken();
  if (token) headers['X-Sync-Token'] = token;
  const requestOptions = {
    ...options,
    headers,
  };
  const response = await fetch(path, requestOptions);
  if (response.status === 401 && retries > 0) {
    localStorage.removeItem(syncTokenKey);
    await requestSyncToken();
    return api(path, options, retries - 1);
  }
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function record(type, payload = {}, questionId = null) {
  const event = {
    at: new Date().toISOString(),
    type,
    questionId,
    payload,
  };
  const question = state.questions.find((item) => item.id === questionId);
  applyLocalEvent(event, question);
  if (!['select-option', 'view-question'].includes(type)) {
    enqueueSave(event);
  }
  renderSummary();
  return event;
}

async function recordStrict(type, payload = {}, questionId = null) {
  await saveQueue.catch(() => {});
  const result = await api('/api/event', {
    method: 'POST',
    body: JSON.stringify({ type, payload, questionId }),
  });
  state.progress = result.progress;
  lastSavedAt = result.event.at;
  const time = new Date(result.event.at).toLocaleTimeString('zh-CN', { hour12: false });
  els.saveStatus.textContent = `已保存 ${time}`;
  renderSummary();
  return result.event;
}

function progressOf(id) {
  return state.progress.questions[id] || {
    attempts: 0,
    correctAttempts: 0,
    wrongCount: 0,
    views: 0,
    marked: false,
  };
}

function isMobileLayout() {
  return window.matchMedia('(max-width: 820px)').matches;
}

function setSidebarOpen(open) {
  state.sidebarOpen = open;
  document.body.classList.toggle('sidebar-open', open);
  els.mobileMenuButton?.setAttribute('aria-expanded', String(open));
  els.sidebarOverlay?.classList.toggle('hidden', !open);
}

function closeSidebarOnMobile() {
  if (isMobileLayout()) setSidebarOpen(false);
}

function isValidMode(mode) {
  return ['normal', 'wrong', 'marked'].includes(mode);
}

function usesTopicContext(mode = state.mode) {
  return isValidMode(mode);
}

function listForMode(mode = state.mode, chapter = state.currentChapter, topic = state.currentTopic) {
  let list = state.questions.filter((q) => q.chapter === chapter && q.topic === topic);
  if (mode === 'marked') {
    list = list
      .filter((q) => progressOf(q.id).marked)
      .sort((a, b) => {
        const aTime = progressOf(a.id).markedAt || '';
        const bTime = progressOf(b.id).markedAt || '';
        return bTime.localeCompare(aTime);
      });
  }
  if (mode === 'wrong') {
    list = list.filter((q) => progressOf(q.id).wrongCount > 0);
  }
  return list;
}

function firstTopicForChapter(chapter) {
  return state.questions.find((q) => q.chapter === chapter)?.topic || '';
}

function hasTopic(chapter, topic) {
  return state.questions.some((q) => q.chapter === chapter && q.topic === topic);
}

function fallbackContext() {
  const recent = mostRecentQuestion();
  const chapter = recent?.chapter || state.currentChapter || state.chapters[0] || '';
  const topic = recent?.topic || state.currentTopic || firstTopicForChapter(chapter);
  return { chapter, topic };
}

function savedModeContext(mode = state.mode) {
  const candidates = [
    state.modeContexts[mode],
    state.progress.ui?.modeContexts?.[mode],
    state.progress.ui?.active?.mode === mode ? state.progress.ui.active : null,
    { chapter: state.currentChapter, topic: state.currentTopic },
    fallbackContext(),
  ];

  for (const candidate of candidates) {
    if (candidate?.chapter && candidate?.topic && hasTopic(candidate.chapter, candidate.topic)) {
      return { chapter: candidate.chapter, topic: candidate.topic };
    }
  }

  const chapter = state.chapters[0] || '';
  return { chapter, topic: firstTopicForChapter(chapter) };
}

function mostRecentQuestion() {
  return state.questions
    .map((question) => ({ question, lastAt: progressOf(question.id).lastAt || '' }))
    .filter((item) => item.lastAt)
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))[0]?.question || null;
}

function cursorKey(mode = state.mode, chapter = state.currentChapter, topic = state.currentTopic) {
  return `${chapter}|||${topic}|||${mode}`;
}

function clampIndex(index, length) {
  if (!length) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function savedCursor(mode = state.mode, chapter = state.currentChapter, topic = state.currentTopic) {
  const key = cursorKey(mode, chapter, topic);
  const local = state.localCursors[key];
  const persisted = state.progress.ui?.cursors?.[key];
  const value = Number.isInteger(local) ? local : Number(persisted);
  if (Number.isInteger(value) && value >= 0) return value;

  const list = listForMode(mode, chapter, topic);
  const recentIndex = list
    .map((question, index) => ({ index, lastAt: progressOf(question.id).lastAt || '' }))
    .filter((item) => item.lastAt)
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))[0]?.index;
  return Number.isInteger(recentIndex) ? recentIndex : 0;
}

function hasSavedCursor(mode = state.mode, chapter = state.currentChapter, topic = state.currentTopic) {
  const key = cursorKey(mode, chapter, topic);
  return Number.isInteger(state.localCursors[key]) || Number.isInteger(state.progress.ui?.cursors?.[key]);
}

function rememberLocalCursor(mode = state.mode, index = state.index) {
  state.localCursors[cursorKey(mode)] = Math.max(0, index);
}

function rememberModeContext(mode = state.mode) {
  if (usesTopicContext(mode) && hasTopic(state.currentChapter, state.currentTopic)) {
    state.modeContexts[mode] = {
      chapter: state.currentChapter,
      topic: state.currentTopic,
    };
  }
}

function cursorPayload(extra = {}) {
  return {
    chapter: state.currentChapter,
    topic: state.currentTopic,
    mode: state.mode,
    ...extra,
    cursorKey: cursorKey(),
    index: Math.max(0, state.index),
  };
}

function rememberUiStateLocal(event) {
  state.progress.ui ||= {};
  state.progress.ui.cursors ||= {};
  state.progress.ui.modeContexts ||= {};
  const payload = event.payload || {};
  const key = payload.cursorKey;
  const index = Number(payload.index);
  if (typeof key === 'string' && key && Number.isInteger(index) && index >= 0) {
    state.progress.ui.cursors[key] = index;
  }

  const active = state.progress.ui.active || {};
  for (const field of ['chapter', 'topic', 'mode']) {
    if (typeof payload[field] === 'string' && payload[field]) active[field] = payload[field];
  }
  if (Object.keys(active).length) state.progress.ui.active = active;

  if (typeof payload.mode === 'string' && payload.mode && payload.mode !== 'marked') {
    const modeContext = state.progress.ui.modeContexts[payload.mode] || {};
    if (typeof payload.chapter === 'string' && payload.chapter) modeContext.chapter = payload.chapter;
    if (typeof payload.topic === 'string' && payload.topic) modeContext.topic = payload.topic;
    if (Object.keys(modeContext).length) state.progress.ui.modeContexts[payload.mode] = modeContext;
  }
}

function applyLocalEvent(event, question) {
  state.progress.questions ||= {};
  rememberUiStateLocal(event);
  const id = event.questionId;
  if (!id) {
    state.progress.updatedAt = event.at;
    return;
  }

  const item = state.progress.questions[id] || {
    attempts: 0,
    correctAttempts: 0,
    wrongCount: 0,
    views: 0,
    lastAnswer: null,
    lastCorrect: null,
    lastAt: null,
    marked: false,
    markedAt: null,
  };

  if (event.type === 'view-question') {
    item.views += 1;
    item.lastAt = event.at;
  }

  if (event.type === 'answer-question' && question) {
    const answer = selectedToAnswer(question, event.payload?.selected);
    const correct = answer === question.answer;
    item.attempts += 1;
    item.correctAttempts += correct ? 1 : 0;
    item.wrongCount += correct ? 0 : 1;
    item.lastAnswer = answer;
    item.lastCorrect = correct;
    item.lastAt = event.at;
    event.correct = correct;
    event.expected = question.answer;
  }

  if (event.type === 'toggle-mark') {
    item.marked = Boolean(event.payload?.marked);
    item.markedAt = item.marked ? event.at : null;
    item.lastAt = event.at;
  }

  state.progress.questions[id] = item;
  state.progress.updatedAt = event.at;
}

function enqueueSave(event) {
  pendingSaves += 1;
  const seq = ++latestSaveSeq;
  els.saveStatus.textContent = '保存中...';
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      const result = await api('/api/event', {
        method: 'POST',
        body: JSON.stringify({
          type: event.type,
          payload: event.payload,
          questionId: event.questionId,
        }),
      });
      lastSavedAt = result.event.at;
      if (seq === latestSaveSeq) {
        state.progress = result.progress;
        renderSummary();
      }
    })
    .catch((error) => {
      console.error(error);
      els.saveStatus.textContent = '同步失败，保持页面打开后重试';
    })
    .finally(() => {
      pendingSaves -= 1;
      if (pendingSaves > 0) {
        els.saveStatus.textContent = `保存中...${pendingSaves}`;
      } else if (lastSavedAt) {
        const time = new Date(lastSavedAt).toLocaleTimeString('zh-CN', { hour12: false });
        els.saveStatus.textContent = `已保存 ${time}`;
      }
    });
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key];
    if (!acc[value]) acc[value] = [];
    acc[value].push(item);
    return acc;
  }, {});
}

function renderSummary() {
  const entries = Object.values(state.progress.questions || {});
  const wrong = entries.reduce((sum, item) => sum + (item.wrongCount || 0), 0);
  const done = entries.filter((item) => item.attempts > 0).length;
  const marked = entries.filter((item) => item.marked).length;
  els.summary.textContent = `精选 ${state.questions.length} 题｜已提交 ${done} 题｜错误 ${wrong} 次｜标记 ${marked} 题`;
}

function renderChapters() {
  const byChapter = groupBy(state.questions, 'chapter');
  els.chapterList.innerHTML = '';
  for (const chapter of state.chapters) {
    const questions = byChapter[chapter] || [];
    const wrong = questions.reduce((sum, q) => sum + progressOf(q.id).wrongCount, 0);
    const topics = [...new Set(questions.map((q) => q.topic))];
    const active = chapter === state.currentChapter;
    const expanded = state.expandedChapters.has(chapter);
    const node = document.createElement('div');
    node.className = `chapter-node ${expanded ? 'is-expanded' : ''}`;

    const button = document.createElement('button');
    button.className = `chapter-toggle ${active ? 'is-active' : ''}`;
    button.type = 'button';
    button.setAttribute('aria-expanded', String(expanded));
    button.innerHTML = `
      <span class="chapter-title"><span class="chevron">${expanded ? '▾' : '▸'}</span><strong>${chapter}</strong></span>
      <span>${questions.length} 题，错误 ${wrong} 次</span>
    `;
    button.addEventListener('click', async () => {
      rememberLocalCursor();
      rememberModeContext();
      const sameChapter = chapter === state.currentChapter;
      if (sameChapter) {
        if (expanded) {
          state.expandedChapters.delete(chapter);
        } else {
          state.expandedChapters.add(chapter);
        }
        renderChapters();
        return;
      }

      state.currentChapter = chapter;
      state.currentTopic = topics[0] || '';
      state.markedListOpen = state.mode === 'marked';
      state.expandedChapters = new Set([chapter]);
      state.index = savedCursor(state.mode, state.currentChapter, state.currentTopic);
      rememberModeContext();
      await record('select-chapter', cursorPayload({ chapter, topic: state.currentTopic }));
      renderAll();
    });
    node.appendChild(button);

    if (expanded) {
      const children = document.createElement('div');
      children.className = 'topic-children';
      for (const topic of topics) {
        const topicQuestions = questions.filter((q) => q.topic === topic);
        const topicWrong = topicQuestions.reduce((sum, q) => sum + progressOf(q.id).wrongCount, 0);
        const done = topicQuestions.filter((q) => progressOf(q.id).attempts > 0).length;
        const topicButton = document.createElement('button');
        topicButton.type = 'button';
        topicButton.className = `topic-item ${topic === state.currentTopic ? 'is-active' : ''}`;
        topicButton.innerHTML = `<strong>${topic}</strong><span>${topicQuestions.length} 题，已提交 ${done}，错误 ${topicWrong}</span>`;
        topicButton.addEventListener('click', async () => {
          rememberLocalCursor();
          rememberModeContext();
          state.currentTopic = topic;
          state.markedListOpen = state.mode === 'marked';
          state.index = savedCursor(state.mode, state.currentChapter, state.currentTopic);
          rememberModeContext();
          await record('select-topic', cursorPayload({ chapter: state.currentChapter, topic }));
          renderAll();
          closeSidebarOnMobile();
        });
        children.appendChild(topicButton);
      }
      node.appendChild(children);
    }

    els.chapterList.appendChild(node);
  }
}

function buildCurrentList() {
  state.currentList = listForMode();
}

async function setMode(mode) {
  if (!isValidMode(mode)) return;
  rememberLocalCursor();
  rememberModeContext();

  if (mode === 'marked' && state.mode === 'marked' && !state.markedListOpen) {
    state.markedListOpen = true;
    await record('open-marked-summary', { chapter: state.currentChapter, topic: state.currentTopic, mode: 'marked' });
    renderQuestion();
    return;
  }

  state.mode = mode;
  state.markedListOpen = mode === 'marked' ? !hasSavedCursor(mode, state.currentChapter, state.currentTopic) : false;
  state.index = savedCursor(mode, state.currentChapter, state.currentTopic);
  rememberModeContext(mode);

  await record('change-mode', cursorPayload({ mode, topic: state.currentTopic }));

  document.querySelectorAll('.mode').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mode === mode);
  });
  renderAll();
}

function renderTopicHeader() {
  if (state.mode === 'marked') {
    const marked = getMarkedQuestions();
    const question = marked[state.index];
    els.topicTitle.textContent = state.markedListOpen ? '标记题汇总' : '标记题复习';
    els.topicMeta.textContent = state.markedListOpen
      ? `${state.currentChapter}｜${state.currentTopic}｜当前专题 ${marked.length} 道已标记题`
      : question
        ? `${question.chapter}｜${question.topic}｜第 ${state.index + 1}/${marked.length} 题`
        : `${state.currentChapter}｜${state.currentTopic}｜当前专题暂无标记题`;
    document.querySelectorAll('.mode').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.mode === state.mode);
    });
    return;
  }

  const baseList = state.questions.filter((q) => q.chapter === state.currentChapter && q.topic === state.currentTopic);
  const wrong = baseList.reduce((sum, q) => sum + progressOf(q.id).wrongCount, 0);
  els.topicTitle.textContent = state.currentTopic || '请选择专题';
  els.topicMeta.textContent = state.currentTopic
    ? `${state.currentChapter}｜重点 ${baseList.length} 题｜错误 ${wrong} 次`
    : '';
  document.querySelectorAll('.mode').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mode === state.mode);
  });
}

function renderQuestion() {
  buildCurrentList();
  renderTopicHeader();

  if (state.mode === 'marked' && state.markedListOpen) {
    renderMarkedSummary();
    return;
  }

  els.markedSummary.classList.add('hidden');

  if (!state.currentList.length) {
    els.emptyState.classList.remove('hidden');
    els.questionCard.classList.add('hidden');
    els.emptyState.textContent = state.mode === 'marked'
      ? '此章节专题目前还没有标记题。做题时点“标记”，这里会形成当前专题的标记复习队列。'
      : state.currentTopic
      ? '此章节专题目前还没有错题。做题答错后，这里会自动出现对应错题。'
      : '左侧选择章节和专题后开始刷题。系统会自动保存每次选择、作答和错题次数。';
    return;
  }

  els.emptyState.classList.add('hidden');
  els.questionCard.classList.remove('hidden');
  state.index = clampIndex(state.index, state.currentList.length);
  rememberLocalCursor();
  state.answered = false;
  state.selected = [];

  const question = state.currentList[state.index];
  const progress = progressOf(question.id);
  els.questionLabel.textContent = `${question.type}${question.number}｜${state.index + 1}/${state.currentList.length}｜错 ${progress.wrongCount} 次｜优先级 ${question.priority}`;
  els.questionStem.textContent = question.stem;
  els.tagLine.innerHTML = question.tags
    .filter((tag) => tag !== '硬记')
    .map((tag) => `<span class="tag">${tag}</span>`)
    .join('');
  els.markButton.textContent = progress.marked ? '已标记' : '标记';
  els.markButton.classList.toggle('is-marked', progress.marked);
  els.resultBox.className = 'result hidden';
  els.resultBox.innerHTML = '';
  els.submitButton.disabled = false;
  els.submitButton.textContent = '提交';
  els.submitButton.classList.remove('hidden');
  els.nextButton.classList.add('hidden');
  renderNavigator();
  renderOptions(question);

  if (state.lastViewed !== question.id) {
    state.lastViewed = question.id;
    record('view-question', cursorPayload({ mode: state.mode }), question.id);
  }
}

function renderNavigator() {
  const total = state.currentList.length;
  const current = total ? state.index + 1 : 0;
  els.questionSlider.min = '1';
  els.questionSlider.max = String(Math.max(1, total));
  els.questionSlider.value = String(Math.max(1, current));
  els.questionSlider.disabled = total <= 1;
  els.prevQuestionButton.disabled = total <= 1 || state.index <= 0;
  els.jumpNextButton.disabled = total <= 1 || state.index >= total - 1;
  els.questionPosition.textContent = `${current} / ${total}`;
  els.markedListButton.classList.toggle('hidden', !(state.mode === 'marked' && !state.markedListOpen));
}

function getMarkedQuestions(chapter = state.currentChapter, topic = state.currentTopic) {
  return state.questions
    .filter((question) => question.chapter === chapter && question.topic === topic && progressOf(question.id).marked)
    .sort((a, b) => {
      const aTime = progressOf(a.id).markedAt || '';
      const bTime = progressOf(b.id).markedAt || '';
      return bTime.localeCompare(aTime);
    });
}

function renderMarkedSummary() {
  const marked = getMarkedQuestions();
  els.emptyState.classList.add('hidden');
  els.questionCard.classList.add('hidden');
  els.markedSummary.classList.remove('hidden');

  if (!marked.length) {
    els.markedSummary.innerHTML = `
      <div class="empty">
        此章节专题目前还没有标记题。做题时点右上角“标记”，这里会自动汇总。
      </div>
    `;
    return;
  }

  els.markedSummary.innerHTML = `
    <div class="marked-list">
      ${marked.map((question) => {
        const progress = progressOf(question.id);
        return `
          <button class="marked-row" type="button" data-id="${question.id}">
            <span class="marked-title">${question.type}${question.number}｜${question.stem}</span>
            <span class="marked-meta">${question.chapter}｜${question.topic}｜错 ${progress.wrongCount} 次｜作答 ${progress.attempts} 次</span>
          </button>
        `;
      }).join('')}
    </div>
  `;

  els.markedSummary.querySelectorAll('.marked-row').forEach((button) => {
    button.addEventListener('click', async () => {
      const question = state.questions.find((item) => item.id === button.dataset.id);
      if (!question) return;
      state.mode = 'marked';
      state.markedListOpen = false;
      buildCurrentList();
      state.index = Math.max(0, state.currentList.findIndex((item) => item.id === question.id));
      rememberLocalCursor('marked', state.index);
      await record('open-marked-question', cursorPayload({ questionId: question.id, mode: 'marked' }), question.id);
      renderQuestion();
    });
  });
}

function renderOptions(question) {
  const inputType = question.type === '多选题' ? 'checkbox' : 'radio';
  const options = question.type === '判断题'
    ? [{ letter: '正确', text: '正确' }, { letter: '错误', text: '错误' }]
    : question.options;

  els.answerForm.innerHTML = '';
  for (const option of options) {
    const optionText = question.type === '判断题'
      ? option.letter
      : `${option.letter}. ${option.text}`;
    const label = document.createElement('label');
    label.className = 'option';
    label.innerHTML = `
      <input name="answer" type="${inputType}" value="${option.letter}" />
      <span>${optionText}</span>
    `;
    label.addEventListener('click', () => {
      setTimeout(() => {
        const inputs = [...els.answerForm.querySelectorAll('input:checked')];
        state.selected = inputs.map((input) => input.value);
        els.answerForm.querySelectorAll('.option').forEach((node) => {
          node.classList.toggle('is-selected', node.querySelector('input').checked);
        });
        record('select-option', cursorPayload({ selected: state.selected }), question.id);
      }, 0);
    });
    els.answerForm.appendChild(label);
  }
}

function selectedAnswer(question) {
  if (question.type === '多选题') return [...state.selected].sort().join('');
  return state.selected[0] || '';
}

async function submitAnswer() {
  const question = state.currentList[state.index];
  if (!question || !state.selected.length) return;
  els.submitButton.disabled = true;
  els.submitButton.textContent = '提交中...';
  let event;
  try {
    event = await recordStrict('answer-question', cursorPayload({ selected: state.selected }), question.id);
  } catch (error) {
    console.error(error);
    els.submitButton.disabled = false;
    els.submitButton.textContent = '提交';
    els.saveStatus.textContent = '提交失败，请再点一次';
    return;
  }
  const correct = event.correct;
  const answer = selectedAnswer(question);
  els.resultBox.className = `result ${correct ? 'good' : 'bad'}`;
  els.resultBox.innerHTML = `
    <h3>${correct ? '答对了' : '答错了'}：你的答案 ${answer || '未选'}，正确答案 ${question.answer}</h3>
    <p><strong>正确项：</strong>${question.correctItem}</p>
    <p><strong>解析：</strong>${question.analysis}</p>
    <p><strong>易错提醒：</strong>${question.reminder}</p>
  `;
  els.submitButton.classList.add('hidden');
  els.nextButton.classList.remove('hidden');
  renderChapters();
}

async function nextQuestion() {
  await goToIndex((state.index + 1) % state.currentList.length, 'next-question');
}

async function previousQuestion() {
  await goToIndex(Math.max(0, state.index - 1), 'previous-question');
}

async function goToIndex(index, eventType = 'jump-question') {
  if (!state.currentList.length) return;
  state.index = clampIndex(index, state.currentList.length);
  rememberLocalCursor();
  await record(eventType, cursorPayload({ mode: state.mode }));
  renderQuestion();
}

async function toggleMark() {
  const question = state.currentList[state.index];
  if (!question) return;
  const progress = progressOf(question.id);
  await record('toggle-mark', cursorPayload({ marked: !progress.marked }), question.id);
  renderQuestion();
}

async function openMarkedSummary() {
  if (state.mode !== 'marked') return;
  rememberLocalCursor('marked', state.index);
  state.markedListOpen = true;
  await record('open-marked-summary', { chapter: state.currentChapter, topic: state.currentTopic, mode: 'marked' });
  renderQuestion();
}

function pickInitialContext() {
  const active = state.progress.ui?.active || {};
  state.mode = isValidMode(active.mode) ? active.mode : 'normal';
  const contextMode = state.mode;
  const context = savedModeContext(contextMode);
  state.currentChapter = context.chapter;
  state.currentTopic = context.topic;
  rememberModeContext(contextMode);
  state.expandedChapters = new Set(state.currentChapter ? [state.currentChapter] : []);

  if (state.mode === 'marked') {
    state.index = savedCursor('marked', state.currentChapter, state.currentTopic);
    state.markedListOpen = !hasSavedCursor('marked', state.currentChapter, state.currentTopic);
  } else {
    state.markedListOpen = false;
    state.index = savedCursor(state.mode, state.currentChapter, state.currentTopic);
  }
}

function renderAll() {
  renderSummary();
  renderChapters();
  renderQuestion();
}

async function init() {
  readTokenFromUrl();
  const [questionData, progress] = await Promise.all([
    api('/api/questions'),
    api('/api/state'),
  ]);
  state.questions = questionData.questions;
  state.meta = questionData.meta;
  state.progress = progress;
  state.chapters = questionData.meta.chapterOrder.filter((chapter) =>
    state.questions.some((q) => q.chapter === chapter),
  );
  pickInitialContext();
  renderAll();
  els.saveStatus.textContent = progress.updatedAt ? `上次记录 ${new Date(progress.updatedAt).toLocaleString('zh-CN')}` : '尚无作答记录';
}

document.querySelectorAll('.mode').forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});
els.submitButton.addEventListener('click', submitAnswer);
els.nextButton.addEventListener('click', nextQuestion);
els.prevQuestionButton.addEventListener('click', previousQuestion);
els.jumpNextButton.addEventListener('click', nextQuestion);
els.questionSlider.addEventListener('input', () => {
  els.questionPosition.textContent = `${els.questionSlider.value} / ${state.currentList.length}`;
});
els.questionSlider.addEventListener('change', () => {
  goToIndex(Number(els.questionSlider.value) - 1, 'slide-question');
});
els.markButton.addEventListener('click', toggleMark);
els.markedListButton.addEventListener('click', openMarkedSummary);
els.mobileMenuButton.addEventListener('click', () => setSidebarOpen(true));
els.mobileCloseSidebar.addEventListener('click', () => setSidebarOpen(false));
els.sidebarOverlay.addEventListener('click', () => setSidebarOpen(false));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setSidebarOpen(false);
});
window.addEventListener('resize', () => {
  if (!isMobileLayout()) setSidebarOpen(false);
});

init().catch((error) => {
  els.emptyState.textContent = `加载失败：${error.message}`;
  els.saveStatus.textContent = '加载失败';
});
