// 补丁器的离线验证：在临时目录伪造一个 DSH 根，跑 apply → verify → restore。
// 不碰真实安装目录。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as patcher from '../lib/patcher.js';

const SP = ' ';
const IDENTITY = 'text: "You are an AI agent powered by DeepSeek' + SP + 'Harness."';
const PERSONA = 'personaPrefix: >-\n      You are a coding agent powered by the {{model}} model.';

function fakeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-fake-'));
  const pkg = path.join(root, 'node_modules', '@deepseek-ai');
  const sp = path.join(pkg, 'dsh-system-prompt', 'lib');
  const web = path.join(pkg, 'dsh-web-app');
  fs.mkdirSync(sp, { recursive: true });
  fs.mkdirSync(web, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"@deepseek-ai/dsh"}\n');
  fs.writeFileSync(path.join(sp, 'index.js'), `const x = {\n\t\t\t${IDENTITY}\n};\n`);
  fs.writeFileSync(path.join(web, 'cordis.patch.yml'), `- id: system-prompt\n  config:\n    ${PERSONA}\n`);
  return root;
}

test('findDshRoot：显式路径命中 / 不存在返回 null', () => {
  const root = fakeRoot();
  assert.equal(patcher.findDshRoot(root), root);
  assert.equal(patcher.findDshRoot(path.join(root, 'nope')), null);
});

test('inspect：未打补丁时报 original', () => {
  const root = fakeRoot();
  const s = patcher.inspect(root, { DSH_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'home-')) });
  assert.equal(s.rows.length, 2);
  for (const r of s.rows) assert.equal(r.status, 'original', `${r.id}: ${r.status}`);
});

test('apply → verify → restore 全链路', () => {
  const root = fakeRoot();
  const env = { DSH_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'home-')) };

  const a = patcher.apply(root, env);
  assert.ok(a.ok, JSON.stringify(a.failed));
  assert.equal(a.done.length, 2);

  // 内容真的变了
  const sp = fs.readFileSync(path.join(root, 'node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js'), 'utf8');
  assert.ok(!sp.includes('You are an AI agent'), '身份句应被清掉');
  const web = fs.readFileSync(path.join(root, 'node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml'), 'utf8');
  assert.ok(!web.includes('You are a coding agent'), '人格句应被清掉');

  // verify 全绿
  const v = patcher.verify(root, env);
  assert.ok(v.ok, JSON.stringify(v.bad));

  // 重复 apply 幂等
  const again = patcher.apply(root, env);
  assert.equal(again.done.length, 0);
  assert.equal(again.skipped.length, 2);

  // restore 回原文
  const r = patcher.restore(root, env);
  assert.ok(r.ok, JSON.stringify(r.failed));
  assert.equal(r.reverted.length, 2);
  const back = fs.readFileSync(path.join(root, 'node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js'), 'utf8');
  assert.ok(back.includes('You are an AI agent'), '身份句应还原');
});

test('版本不符时拒绝改', () => {
  const root = fakeRoot();
  const env = { DSH_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'home-')) };
  // 模拟上游改了文案
  const f = path.join(root, 'node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js');
  fs.writeFileSync(f, 'text: "You are a completely different agent."\n');
  const a = patcher.apply(root, env);
  assert.equal(a.ok, false);
  assert.ok(a.failed.some((x) => x.id === 'harness-identity' && x.reason === 'unknown-version'));
  // 未改的文件原样保留
  assert.ok(fs.readFileSync(f, 'utf8').includes('completely different'));
});

test('备份缺失时 restore 报错而不是写坏', () => {
  const root = fakeRoot();
  const env = { DSH_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'home-')) };
  patcher.apply(root, env);
  const stateDir = patcher.status(env).stateDir;
  fs.rmSync(path.join(stateDir, 'backup'), { recursive: true, force: true });
  const r = patcher.restore(root, env);
  assert.equal(r.ok, false);
  assert.ok(r.failed.every((x) => x.reason === 'backup-missing'));
});

test('root 为空时不崩', () => {
  const s = patcher.inspect(null, { DSH_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'home-')) });
  assert.ok(s.rows.every((r) => r.status === 'no-root'));
  const a = patcher.apply(null, { DSH_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'home-')) });
  assert.equal(a.ok, false);
});
