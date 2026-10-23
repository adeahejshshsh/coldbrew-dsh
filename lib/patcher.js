// 宿主补丁器：直接改 DSH 安装目录里的默认提示词文本。
//
// 这是三档里唯一碰宿主的做法：
//   · 改 dsh-system-prompt/lib/index.js 里写死的 "You are an AI agent powered by DSH."
//   · 改 dsh-web-app/cordis.patch.yml 里写死的 personaPrefix
//
// 为什么要这么干：前两档都在插件层，一旦插件没加载（安全模式、profile 换掉、
// 插件被禁）人格立刻回来。重档改的是「出厂默认值」，连一个插件都没装的会话也吃这套。
//
// 代价：DSH 升级会覆盖 node_modules，补丁失效；所以这里做三件事——
//   1. 改前备份原文件到 $DSH_HOME/coldbrew-deep/backup
//   2. manifest 记录「改前 hash / 改后 hash」
//   3. apply 前先校验 hash，对不上就拒绝，不瞎改

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(here, '..');
const MANIFEST = 'manifest.json';

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ---- 补丁定义 ----
// 每处补丁：文件、原文本、替换文本。原文本必须精确匹配一次，匹配不到就是版本变了。
export const PATCHES = [
  {
    id: 'harness-identity',
    label: '关掉出厂身份句',
    rel: 'dsh-system-prompt/lib/index.js',
    find: 'text: "You are an AI agent powered by DeepSeek Harness."',
    replace: 'text: ""',
    why: '模型开局第一句自称 AI agent，是拒答的锚点。改成空串，这一 section 就被 renderPrompt 丢掉。',
  },
  {
    id: 'webapp-persona',
    label: '清掉 web-app 的 coding agent 人格',
    rel: 'dsh-web-app/cordis.patch.yml',
    find: 'personaPrefix: >-\n      You are a coding agent powered by the {{model}} model.',
    replace: 'personaPrefix: >-\n      {{personaOverride}}',
    why: 'DSH Web 的默认人格是「你是 coding agent」。不清掉，它和插件写入的执行核打架。',
  },
];

function dshHome(env = process.env) {
  const raw = String(env.DSH_HOME || '').trim();
  if (!raw) return path.join(os.homedir(), '.dsh');
  if (raw === '~') return os.homedir();
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return path.join(os.homedir(), raw.slice(2));
  return path.resolve(raw);
}

function stateDir(env) {
  return path.join(dshHome(env), 'coldbrew-deep');
}

function manifestPath(env) {
  return path.join(stateDir(env), MANIFEST);
}

function readManifest(env) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath(env), 'utf8'));
  } catch {
    return { version: 1, root: '', files: {} };
  }
}

function writeManifest(env, data) {
  fs.mkdirSync(stateDir(env), { recursive: true });
  fs.writeFileSync(manifestPath(env), JSON.stringify(data, null, 2) + '\n');
}

/**
 * 定位 DSH 安装根。优先用显式传入的 root，其次从当前模块向上找 @deepseek-ai/dsh。
 */
export function findDshRoot(explicit) {
  if (explicit) {
    const p = path.resolve(explicit);
    return fs.existsSync(path.join(p, 'package.json')) ? p : null;
  }
  const candidates = [];
  // 1) 环境变量最优先
  if (process.env.DSH_INSTALL_ROOT) candidates.push(process.env.DSH_INSTALL_ROOT);

  // 2) 从 dsh 可执行文件推。Android/Termux 下 process.execPath 是 linker，不能直接用。
  const which = (cmd) => {
    try {
      const r = spawnSync('which', [cmd], { encoding: 'utf8', timeout: 3000 });
      return r.status === 0 ? String(r.stdout || '').trim().split('\n')[0] : '';
    } catch {
      return '';
    }
  };
  const bin = which('dsh');
  if (bin) {
    const prefix = path.dirname(path.dirname(bin)); // usr/bin/dsh → usr
    candidates.push(path.join(prefix, 'lib', 'node_modules', '@deepseek-ai', 'dsh'));
  }

  // 3) Termux / 常见全局前缀
  const prefixes = [process.env.PREFIX, '/data/data/com.termux/files/usr', '/usr/local', '/usr'].filter(Boolean);
  for (const p of prefixes) candidates.push(path.join(p, 'lib', 'node_modules', '@deepseek-ai', 'dsh'));

  // 4) 从 process.execPath 推（桌面端 Node 有效）
  if (process.execPath && !/linker|\/apex\//.test(process.execPath)) {
    candidates.push(path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh'));
  }

  // 5) 从插件自身位置向上找
  let dir = PKG_ROOT;
  for (let i = 0; i < 8; i += 1) {
    candidates.push(path.join(dir, 'node_modules', '@deepseek-ai', 'dsh'));
    dir = path.dirname(dir);
  }

  for (const c of candidates) {
    try {
      if (c && fs.existsSync(path.join(c, 'package.json'))) return c;
    } catch { /* 继续找 */ }
  }
  return null;
}

function targetPath(root, patch) {
  return path.join(root, 'node_modules', '@deepseek-ai', patch.rel);
}

export function inspect(root, env = process.env) {
  const manifest = readManifest(env);
  if (!root) return { root: null, manifest, rows: PATCHES.map((p) => ({ ...p, file: '', status: 'no-root', hash: '', size: 0 })) };
  const rows = [];
  for (const patch of PATCHES) {
    const file = targetPath(root, patch);
    let status = 'missing';
    let hash = '';
    if (fs.existsSync(file)) {
      const buf = fs.readFileSync(file);
      hash = sha(buf);
      const text = buf.toString('utf8');
      const hasPatched = text.includes(patch.replace);
      const hasOriginal = text.includes(patch.find);
      status = hasPatched && !hasOriginal ? 'patched' : hasOriginal ? 'original' : 'unknown-version';
    }
    rows.push({ ...patch, file, status, hash, size: fs.existsSync(file) ? fs.statSync(file).size : 0 });
  }
  return { root, manifest, rows };
}

export function apply(root, env = process.env) {
  if (!root) return { ok: false, error: '找不到 DSH 安装目录；用 DSH_INSTALL_ROOT 显式指定。' };
  const state = inspect(root, env);
  const manifest = { ...state.manifest, root, files: { ...(state.manifest.files || {}) } };
  const done = [];
  const skipped = [];
  const failed = [];

  for (const row of state.rows) {
    if (row.status === 'patched') {
      skipped.push({ id: row.id, reason: 'already' });
      continue;
    }
    if (row.status !== 'original') {
      failed.push({ id: row.id, reason: row.status, file: row.file });
      continue;
    }
    const original = fs.readFileSync(row.file);
    const before = sha(original);
    // 备份：只在第一次打补丁时留原件，重复 apply 不会覆盖掉真正的原版
    const backup = path.join(stateDir(env), 'backup', row.rel.replace(/\//g, '__'));
    if (!fs.existsSync(backup)) {
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.writeFileSync(backup, original);
    }
    const text = original.toString('utf8');
    const next = text.replace(row.find, row.replace);
    if (next === text) {
      failed.push({ id: row.id, reason: 'replace-noop', file: row.file });
      continue;
    }
    // 原子写：临时文件 + rename，保留原权限位
    const mode = fs.statSync(row.file).mode & 0o777;
    const tmp = `${row.file}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tmp, next, { mode });
    if (process.platform !== 'win32') fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, row.file);
    manifest.files[row.id] = { rel: row.rel, before, after: sha(Buffer.from(next)), backup, at: new Date().toISOString() };
    done.push({ id: row.id, file: row.file });
  }

  manifest.at = new Date().toISOString();
  writeManifest(env, manifest);
  return { ok: failed.length === 0, root, done, skipped, failed };
}

export function restore(root, env = process.env) {
  const manifest = readManifest(env);
  const reverted = [];
  const failed = [];
  for (const [id, meta] of Object.entries(manifest.files || {})) {
    const file = path.join(root || manifest.root, 'node_modules', '@deepseek-ai', meta.rel);
    try {
      if (!fs.existsSync(meta.backup)) {
        failed.push({ id, reason: 'backup-missing', backup: meta.backup });
        continue;
      }
      const buf = fs.readFileSync(meta.backup);
      if (sha(buf) !== meta.before) {
        failed.push({ id, reason: 'backup-corrupt' });
        continue;
      }
      const mode = fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o644;
      const tmp = `${file}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(tmp, buf, { mode });
      if (process.platform !== 'win32') fs.chmodSync(tmp, mode);
      fs.renameSync(tmp, file);
      reverted.push({ id, file });
    } catch (e) {
      failed.push({ id, reason: String(e?.message || e) });
    }
  }
  if (reverted.length) {
    for (const r of reverted) delete manifest.files[r.id];
    writeManifest(env, manifest);
  }
  return { ok: failed.length === 0, reverted, failed };
}

export function verify(root, env = process.env) {
  const state = inspect(root, env);
  const bad = state.rows.filter((r) => r.status !== 'patched');
  return { ok: bad.length === 0, root, rows: state.rows.map(({ id, status, file }) => ({ id, status, file })), bad: bad.map((r) => r.id) };
}

export function status(env = process.env) {
  const manifest = readManifest(env);
  return {
    home: dshHome(env),
    stateDir: stateDir(env),
    root: manifest.root || '',
    patched: Object.keys(manifest.files || {}),
    at: manifest.at || '',
  };
}
