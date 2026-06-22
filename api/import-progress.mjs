import { authError, bodyOf, mergeProgress, progressSummary, readProgress, sendJson, writeProgress } from './_shared.mjs';

export default async function handler(req, res) {
  if (authError(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });

  const body = bodyOf(req);
  const incoming = body.progress || body;
  const progress = body.replace ? incoming : mergeProgress(await readProgress(), incoming);
  await writeProgress(progress);
  return sendJson(res, 200, { ok: true, progress, summary: progressSummary(progress) });
}
