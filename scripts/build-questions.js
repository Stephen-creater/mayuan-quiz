import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(appRoot, '..');
const sourceCsv = process.env.SOURCE_CSV
  ? path.resolve(process.env.SOURCE_CSV)
  : path.join(workspaceRoot, '马原客观题逐题精讲包', '10_全量题目索引_含解析.csv');
const outputPath = path.join(appRoot, 'data', 'questions.json');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' && !quoted) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const header = rows.shift().map((name) => name.replace(/^\uFEFF/, ''));
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

function normalizeId(value) {
  return value
    .replace(/\s+/g, '')
    .replace(/[：:>\/\\|"'`]+/g, '-')
    .slice(0, 80);
}

const hardMemoryPattern = /(\d{3,4}年|\d+世纪|《[^》]+》|第一国际|第二国际|第三国际|正义者同盟|共产主义者同盟|巴黎公社|苏联模式|苏东|德法年鉴|哥达纲领|德意志意识形态|反杜林论|资本论|共产党宣言|神圣家族|法兰西内战|英国工人阶级状况|家庭、私有制和国家的起源|泰罗制|福特制)/;
const hardMemoryStemPattern = /(写成|发表|成立|创立|起草|标志|代表人物|直接理论来源|三大思潮|阶级基础|纲领|著作|哪位|哪一|哪部|来源于|产生于)/;
const trapPattern = /(只要|一定|必然|唯一|直接决定|直接进入|直接|消失|不再|完全|创造规律|改变规律|否定|取代|等于|仅仅|马上|已经不再|高级阶段|从根本上改变)/;
const corePattern = /(根本|本质|核心|决定力量|最终|最高|标志|基础|前提|来源|直接理论来源|唯一标准|实质|关键|基本观点|首要|基本矛盾|基本规律|政治立场)/;
const confusionPattern = /(错在|混淆|颠倒|绝对|片面|不等于|不能把|不要把|不是说|容易|警惕|相反|说反|偷换|扩大|缩小|过头|过于)/;

function classify(row, index) {
  const options = ['A', 'B', 'C', 'D']
    .map((letter) => ({ letter, text: row[`选项${letter}`] || '' }))
    .filter((option) => option.text);
  const text = [
    row.题干,
    row.选项A,
    row.选项B,
    row.选项C,
    row.选项D,
    row.正确项,
    row.解析,
    row.易错提醒,
  ].join(' ');

  const tags = [];
  const reasons = [];
  let score = 0;

  const isHardMemory = hardMemoryPattern.test(text) || (hardMemoryStemPattern.test(row.题干) && /(黑格尔|费尔巴哈|伯恩斯坦|列宁|恩格斯|马克思|毛泽东|空想社会主义|德国古典哲学|英国古典政治经济学|英法)/.test(text));
  const isTrap = trapPattern.test(text);
  const isCore = corePattern.test(row.题干);
  const isConfusing = confusionPattern.test(`${row.解析} ${row.易错提醒}`);
  const isWrongJudgment = row.题型 === '判断题' && row.答案 === '错误';
  const isCorrectJudgment = row.题型 === '判断题' && row.答案 === '正确';
  const isAllSelect = row.题型 === '多选题' && row.答案 === 'ABCD';
  const isPartialMulti = row.题型 === '多选题' && row.答案 !== 'ABCD';

  if (isHardMemory) {
    score += 5;
    tags.push('硬记');
    reasons.push('含年份、著作、人物、组织或固定历史节点，不能靠临场推导');
  }
  if (isWrongJudgment) {
    score += 5;
    tags.push('错判');
    reasons.push('错误判断题本身就是陷阱题，适合优先训练');
  }
  if (isPartialMulti) {
    score += 4;
    tags.push('多选陷阱');
    reasons.push('多选但不是全选，需要识别干扰项');
  }
  if (isTrap) {
    score += 3;
    tags.push('易错');
    reasons.push('题干或选项含绝对化、跳跃化或偷换关系表达');
  }
  if (isConfusing) {
    score += 2;
    if (!tags.includes('易错')) tags.push('易错');
    reasons.push('解析提示有混淆、颠倒、片面化或过度推断风险');
  }
  if (isCore) {
    score += 2;
    tags.push('核心概念');
    reasons.push('考核心定义、根本原因、本质、最高目标或固定教材表述');
  }
  if (isAllSelect && !isHardMemory) {
    score -= 4;
    reasons.push('多选全选且通常区分度较低，降权处理');
  }
  if (isCorrectJudgment && !isHardMemory && !isTrap && !isCore) {
    score -= 3;
    reasons.push('普通正确判断题测试价值较低，降权处理');
  }

  const selected = score >= 4;
  const chapterKey = normalizeId(row.章节);
  const topicKey = normalizeId(row.专题);
  const id = `${chapterKey}__${topicKey}__${row.题型}${row.题号}`;

  return {
    id,
    sourceIndex: index + 1,
    chapter: row.章节,
    topic: row.专题,
    number: row.题号,
    type: row.题型,
    stem: row.题干,
    options,
    answer: row.答案,
    correctItem: row.正确项,
    analysis: row.解析,
    reminder: row.易错提醒,
    tags: [...new Set(tags)],
    priority: Math.max(0, Math.min(10, score)),
    includeReason: reasons.join('；'),
    selected,
  };
}

const rows = parseCsv(fs.readFileSync(sourceCsv, 'utf8'));
const classified = rows.map(classify);
const questions = classified
  .filter((q) => q.selected)
  .map(({ selected, ...question }) => question);

const chapterOrder = [...new Set(rows.map((row) => row.章节))];
const topicOrder = [];
for (const row of rows) {
  const key = `${row.章节}|||${row.专题}`;
  if (!topicOrder.some((item) => item.key === key)) {
    topicOrder.push({ key, chapter: row.章节, topic: row.专题 });
  }
}

const meta = {
  builtAt: new Date().toISOString(),
  source: path.relative(appRoot, sourceCsv),
  sourceTotal: rows.length,
  selectedTotal: questions.length,
  removedTotal: rows.length - questions.length,
  chapterOrder,
  topicOrder: topicOrder.map(({ chapter, topic }) => ({ chapter, topic })),
  tagCounts: questions.reduce((acc, question) => {
    for (const tag of question.tags) acc[tag] = (acc[tag] || 0) + 1;
    return acc;
  }, {}),
  chapterCounts: questions.reduce((acc, question) => {
    acc[question.chapter] = (acc[question.chapter] || 0) + 1;
    return acc;
  }, {}),
};

fs.writeFileSync(outputPath, `${JSON.stringify({ meta, questions }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(meta, null, 2));
