import { loadQuestions, sendJson } from './_shared.mjs';

export default function handler(req, res) {
  return sendJson(res, 200, loadQuestions());
}
