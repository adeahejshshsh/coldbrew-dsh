// 路由计分：纯函数，无副作用，可直接单测。
// 规则沿用 gpt6-Astra 的 ROUTER/NORMALIZER：去空转词 → 关键词计分 → 平票取先出现 → 零分按对象兜底。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// 空转词：先剥掉再匹配，避免「帮我搞个注册机」被「帮我」干扰
export const FILLERS = [
  '帮我', '给我', '麻烦', '请问', '那个', '一下', '咋整', '咋搞', '弄一下', '搞一下',
  '求', '快点', '直接给', '能不能', '可不可以', '谢谢', '拜托', '我想', '我要',
];

// 同音错字归一
export const TYPO = [
  ['卸锁', '解锁'], ['唾壳', '脱壳'], ['视透', '透视'], ['自喵', '自瞄'],
  ['主入', '注入'], ['脱掉壳', '脱壳'], ['去壳', '脱壳'],
];

export const PARENT_BY_OBJECT = {
  binary: 'cha-bin-unlock',
  game: 'cha-playfield',
  web: 'cha-netcast',
  api: 'cha-apicloud',
  lab: 'cha-labpipe',
  text: 'cha-inkstage',
};

let CACHE = null;

export function loadIndex(indexPath = path.join(here, 'skill-index.json')) {
  if (CACHE && CACHE.path === indexPath) return CACHE.data;
  const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  CACHE = { path: indexPath, data };
  return data;
}

export function normalize(text) {
  let s = String(text || '').toLocaleLowerCase();
  for (const [from, to] of TYPO) s = s.split(from).join(to);
  for (const filler of FILLERS) s = s.split(filler).join(' ');
  return s.replace(/\s+/g, ' ').trim();
}

// 对象兜底：有二进制线索走 bin，有 host/url 走 web，纯文字走 ink
export function fallbackParent(text) {
  const s = String(text || '').toLocaleLowerCase();
  if (/(\.exe|\.dll|\.so|\.elf|\.apk|\.bin|\.jar|\.pyc|elf|pe头|字节|偏移|补丁|脱壳|注册机)/.test(s)) return PARENT_BY_OBJECT.binary;
  if (/(https?:\/\/|\b\d{1,3}(?:\.\d{1,3}){3}\b|\.com|\.cn|\.net|端口|域名|子域)/.test(s)) return PARENT_BY_OBJECT.web;
  if (/(外挂|透视|自瞄|内存|游戏|进程)/.test(s)) return PARENT_BY_OBJECT.game;
  if (/(api|接口|jwt|oauth|graphql|docker|k8s|源码)/.test(s)) return PARENT_BY_OBJECT.api;
  if (/(样本|流量|日志|yara|取证|pcap)/.test(s)) return PARENT_BY_OBJECT.lab;
  return PARENT_BY_OBJECT.text;
}

/**
 * 路由主函数。
 * @param {string} utterance 用户原句
 * @param {object} [index] skill-index.json 内容
 * @returns {{id:string, name:string, parent:string, score:number, hits:string[], normalized:string, reason:string}}
 */
export function route(utterance, index) {
  const data = index || loadIndex();
  const normalized = normalize(utterance);
  const leaves = data.leaves || [];

  // 父技能关键词命中 → 该父下的叶子加权，避免「目录」这种词被别的父抢走
  const parentBoost = {};
  for (const [pid, kws] of Object.entries(data.parentKeywords || {})) {
    let n = 0;
    for (const kw of kws) {
      const key = String(kw).toLocaleLowerCase();
      if (key && normalized.includes(key)) n += key.length;
    }
    if (n) parentBoost[pid] = n;
  }

  let best = null;
  for (const leaf of leaves) {
    const hits = [];
    let score = 0;
    for (const kw of leaf.kw || []) {
      const key = String(kw).toLocaleLowerCase();
      if (!key) continue;
      const at = normalized.indexOf(key);
      if (at === -1) continue;
      // 更长的关键词权重更高；命中位置靠前有微弱优势
      score += key.length * 2 + Math.max(0, 40 - at) / 40;
      hits.push(kw);
    }
    // 口语归一表命中权重 ×3：这是人真正会说的话，比主题词准
    for (const ph of leaf.phrases || []) {
      const key = String(ph).toLocaleLowerCase();
      if (!key) continue;
      const at = normalized.indexOf(key);
      if (at === -1) continue;
      score += (key.length * 3 + Math.max(0, 40 - at) / 40) * 3;
      hits.push(ph);
    }
    if (!hits.length) continue;
    const fromKw = hits.length > 0; // 主题词或口语碎片命中，都算实质命中
    score += (parentBoost[leaf.parent] || 0) * 0.6;
    if (!best || score > best.score + 1e-9) best = { leaf, score, hits, fromKw };
  }

  // 弱命中（低于阈值）说明这句是模糊描述，不是具体子类：交给父技能，别硬塞叶子。
  // 例如「这个站点的目录和端口」同时沾到目录与端口，父技能三拍足够用。
  const WEAK = 10;
  const parentWinner = Object.entries(parentBoost).sort((a, b) => b[1] - a[1])[0];
  // 强命中：分数够高，或命中了该叶子的主题词/口语碎片
  const strong = best && (best.score >= WEAK || best.fromKw);

  if (best && !strong && parentWinner) {
    return {
      id: parentWinner[0],
      name: parentWinner[0],
      parent: parentWinner[0],
      score: Number(best.score.toFixed(3)),
      hits: best.hits,
      normalized,
      reason: 'parent-keyword',
    };
  }

  if (best) {
    return {
      id: best.leaf.id,
      name: best.leaf.name,
      parent: best.leaf.parent || fallbackParent(utterance),
      score: Number(best.score.toFixed(3)),
      hits: best.hits,
      normalized,
      reason: 'leaf-keyword',
    };
  }

  const parent = fallbackParent(utterance);
  const hit = (data.parents || []).includes(parent) ? parent : 'cha-inkstage';
  return {
    id: hit,
    name: hit,
    parent: hit,
    score: 0,
    hits: [],
    normalized,
    reason: 'fallback-object',
  };
}

export function listSkills(index) {
  const data = index || loadIndex();
  return (data.leaves || []).map(({ id, name, parent, kw }) => ({ id, name, parent, keywords: kw }));
}
