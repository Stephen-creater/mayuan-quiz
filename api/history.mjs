import { authError, readHistory, sendJson } from './_shared.mjs';

export default async function handler(req, res) {
  if (authError(req, res)) return;
  const limit = Math.max(1, Math.min(500, Number(req.query?.limit || 50)));
  return sendJson(res, 200, await readHistory(limit));
}
