import { authError, readProgress, sendJson } from './_shared.mjs';

export default async function handler(req, res) {
  if (authError(req, res)) return;
  return sendJson(res, 200, await readProgress());
}
