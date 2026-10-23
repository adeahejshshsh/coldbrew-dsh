// 把内置 skills 装进 DSH 官方用户技能目录，可安全卸载。
// 只碰 manifest 里登记过的目录；用户自建的同名目录默认不动。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(here, '..');
const BUILTIN = path.join(PKG_ROOT, 'skills');
const MANIFEST = '.coldbrew-manifest.json';

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function dshHome(env = process.env) {
  const raw = String(env.DSH_HOME || '').trim();
  if (!raw) return path.join(os.homedir(), '.dsh');
  if (raw === '~') return os.homedir();
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return path.join(os.homedir(), raw.slice(2));
  return path.resolve(raw);
}

export function skillsDir(env = process.env) {
  return path.join(dshHome(env), 'skills');
}

function manifestPath(dir) {
  return path.join(dir, MANIFEST);
}

function readManifest(dir) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath(dir), 'utf8'));
  } catch {
    return { version: 1, installed: {} };
  }
}

function writeManifest(dir, data) {
  fs.writeFileSync(manifestPath(dir), JSON.stringify(data, null, 2) + '\n');
}

function listBuiltin() {
  if (!fs.existsSync(BUILTIN)) return [];
  return fs
    .readdirSync(BUILTIN, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(BUILTIN, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort();
}

export function status(env = process.env) {
  const dir = skillsDir(env);
  const manifest = readManifest(dir);
  const builtin = listBuiltin();
  const installed = builtin.filter((id) => {
    const target = path.join(dir, id, 'SKILL.md');
    return fs.existsSync(target) && manifest.installed?.[id];
  });
  return {
    home: dshHome(env),
    dir,
    exists: fs.existsSync(dir),
    builtin: builtin.length,
    installed: installed.length,
    missing: builtin.filter((id) => !installed.includes(id)),
    // 用户自建 = 在技能目录里但不由本插件 manifest 登记
    foreign: fs.existsSync(dir)
      ? fs
          .readdirSync(dir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !manifest.installed?.[d.name])
          .map((d) => d.name)
      : [],
  };
}

export function install(env = process.env, { force = false } = {}) {
  const dir = skillsDir(env);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = readManifest(dir);
  const builtin = listBuiltin();
  const done = [];
  const skipped = [];
  const overwritten = [];

  for (const id of builtin) {
    const src = path.join(BUILTIN, id, 'SKILL.md');
    const targetDir = path.join(dir, id);
    const target = path.join(targetDir, 'SKILL.md');
    const body = fs.readFileSync(src);

    if (fs.existsSync(target)) {
      const current = fs.readFileSync(target);
      const same = sha(current) === sha(body);
      const ours = Boolean(manifest.installed?.[id]);
      if (same) {
        manifest.installed[id] = { sha256: sha(body), at: manifest.installed?.[id]?.at || new Date().toISOString() };
        done.push(id);
        continue;
      }
      if (!ours && !force) {
        skipped.push(id);
        continue;
      }
      overwritten.push(id);
    }

    fs.mkdirSync(targetDir, { recursive: true });
    const tmp = `${target}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, target);
    manifest.installed[id] = { sha256: sha(body), at: new Date().toISOString() };
    if (!overwritten.includes(id)) done.push(id);
  }

  writeManifest(dir, manifest);
  return { dir, total: builtin.length, installed: done.length + overwritten.length, skipped, overwritten };
}

export function uninstall(env = process.env) {
  const dir = skillsDir(env);
  const manifest = readManifest(dir);
  const removed = [];
  const kept = [];

  for (const id of Object.keys(manifest.installed || {})) {
    const targetDir = path.join(dir, id);
    const target = path.join(targetDir, 'SKILL.md');
    if (!fs.existsSync(target)) continue;
    const current = sha(fs.readFileSync(target));
    if (current !== manifest.installed[id].sha256) {
      kept.push(id); // 用户改过，保留
      continue;
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
    delete manifest.installed[id];
    removed.push(id);
  }

  writeManifest(dir, manifest);
  return { dir, removed: removed.length, kept };
}

export function verify(env = process.env) {
  const dir = skillsDir(env);
  const manifest = readManifest(dir);
  const bad = [];
  for (const [id, meta] of Object.entries(manifest.installed || {})) {
    const target = path.join(dir, id, 'SKILL.md');
    if (!fs.existsSync(target)) bad.push({ id, reason: 'missing' });
    else if (sha(fs.readFileSync(target)) !== meta.sha256) bad.push({ id, reason: 'modified' });
  }
  return { ok: bad.length === 0, checked: Object.keys(manifest.installed || {}).length, bad };
}
