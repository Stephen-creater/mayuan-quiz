import { authError, bodyOf, loadQuestions, readProgress, recordHistory, sendJson, updateProgress, writeProgress } from './_shared.mjs';

export default async function handler(req, res) {
  if (authError(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });

  const body = bodyOf(req);
  const question = loadQuestions().questions.find((item) => item.id === body.questionId);
  const event = {
    at: new Date().toISOString(),
    type: String(body.type || 'click'),
    questionId: body.questionId || null,
    payload: body.payload || {},
  };
  const progress = updateProgress(await readProgress(), event, question);
  if (!['select-option', 'view-question'].includes(event.type)) {
    await writeProgress(progress);
    await recordHistory(event);
  }
  return sendJson(res, 200, { ok: true, event, progress });
}
