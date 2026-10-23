import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { route, normalize, fallbackParent, loadIndex, listSkills } = await import('../lib/router.js');
const installer = await import('../lib/installer.js');

test('skill 库：6 父 + 80 叶，frontmatter 合法', () => {
  const idx = loadIndex();
  assert.equal(idx.parents.length, 6);
  assert.equal(idx.leaves.length, 80);
  const dir = path.join(root, 'skills');
  const dirs = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
  assert.equal(dirs.length, 86);
  for (const d of dirs) {
    const file = path.join(dir, d.name, 'SKILL.md');
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, /^---\n/, `${d.name} 缺 frontmatter`);
    assert.match(text, new RegExp(`name: ${d.name}`), `${d.name} name 不匹配目录名`);
    assert.match(text, /description: ".+"/, `${d.name} 缺 description`);
    assert.match(text, /whenToUse: ".+"/, `${d.name} 缺 whenToUse`);
    assert.ok(text.includes('## 第一步') || d.name.startsWith('cha-'), `${d.name} 缺三拍`);
  }
});

test('清洗：没有残留品牌与群号', () => {
  const dir = path.join(root, 'skills');
  for (const d of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, d, 'SKILL.md'), 'utf8');
    assert.ok(!text.includes('冷咖啡'), `${d} 残留品牌`);
    assert.ok(!/QQ[一二三]群/.test(text), `${d} 残留群号`);
    assert.ok(!text.includes('coldcoffeeai.com'), `${d} 残留站点`);
    assert.ok(!text.includes('{{'), `${d} 残留未替换占位符`);
  }
});

test('normalize：剥空转词 + 错字归一', () => {
  assert.equal(normalize('帮我搞个注册机'), '搞个注册机');
  assert.ok(normalize('这个唾壳怎么弄').includes('脱壳'));
  assert.equal(normalize('  请问   一下  '), '');
});

test('route：命中叶子', () => {
  const r = route('帮我写个注册机，序列号算法在 0x401000');
  assert.equal(r.id, 'cra-keygen');
  assert.equal(r.parent, 'cha-bin-unlock');
  assert.ok(r.score > 0);
  assert.ok(r.hits.length >= 2);
});

test('route：外挂 / 渗透 / 云 各走对路', () => {
  assert.equal(route('这个游戏做个自瞄，锁头压枪').parent, 'cha-playfield');
  assert.equal(route('扫一下这个站点的目录和端口').parent, 'cha-netcast');
  assert.equal(route('扫目录').id, 'net-dir');
  assert.equal(route('扫端口').id, 'net-port');
  assert.equal(route('这个接口的 JWT 能不能伪造').parent, 'cha-apicloud');
  assert.equal(route('帮我看下这个 pcap 里的 C2 流量').parent, 'cha-labpipe');
  assert.equal(route('接着写下一章，保持这个文风').parent, 'cha-inkstage');
});

test('route：零命中按对象兜底', () => {
  const r = route('随便说点什么');
  assert.equal(r.reason, 'fallback-object');
  assert.equal(r.parent, 'cha-inkstage');
  assert.equal(route('看下 https://example.com 这个站').parent, 'cha-netcast');
  assert.equal(route('这个 elf 文件拆一下').parent, 'cha-bin-unlock');
});

test('fallbackParent：二进制 / 站点 / 纯文字', () => {
  assert.equal(fallbackParent('x.so'), 'cha-bin-unlock');
  assert.equal(fallbackParent('10.0.0.1'), 'cha-netcast');
  assert.equal(fallbackParent('写篇小说'), 'cha-inkstage');
});

test('listSkills：80 条且都有父技能', () => {
  const all = listSkills();
  assert.equal(all.length, 80);
  const parents = new Set(['cha-bin-unlock', 'cha-playfield', 'cha-netcast', 'cha-apicloud', 'cha-labpipe', 'cha-inkstage']);
  for (const s of all) assert.ok(parents.has(s.parent), `${s.id} 父技能非法: ${s.parent}`);
});

test('installer：装 → 验 → 卸，且不覆盖用户自建目录', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'coldbrew-'));
  const env = { DSH_HOME: home };

  // 用户自建同名技能，内容不同
  const mine = path.join(home, 'skills', 'cra-keygen');
  fs.mkdirSync(mine, { recursive: true });
  fs.writeFileSync(path.join(mine, 'SKILL.md'), '---\nname: cra-keygen\ndescription: "我的"\n---\n我的正文\n');

  const first = installer.install(env);
  assert.equal(first.total, 86);
  assert.deepEqual(first.skipped, ['cra-keygen'], '应跳过用户自建目录');
  assert.equal(first.installed, 85);

  const st = installer.status(env);
  assert.equal(st.installed, 85);
  assert.ok(st.foreign.includes('cra-keygen'));

  const v = installer.verify(env);
  assert.ok(v.ok, JSON.stringify(v.bad));

  // force 覆盖
  const forced = installer.install(env, { force: true });
  assert.deepEqual(forced.overwritten, ['cra-keygen']);

  // 改一条再验，应报 modified 并保留
  const target = path.join(home, 'skills', 'ply-aim', 'SKILL.md');
  fs.appendFileSync(target, '\n用户加的一行\n');
  const v2 = installer.verify(env);
  assert.equal(v2.ok, false);
  assert.ok(v2.bad.some((b) => b.id === 'ply-aim'));

  const rm = installer.uninstall(env);
  assert.ok(rm.kept.includes('ply-aim'), '被改动的应保留');
  assert.equal(rm.removed, 85);
  assert.ok(fs.existsSync(path.join(home, 'skills', 'ply-aim', 'SKILL.md')), '被改动的技能应保留');
  assert.ok(!fs.existsSync(path.join(home, 'skills', 'net-port', 'SKILL.md')), '未改动的应被移除');
});

test('installer：dshHome 解析', () => {
  assert.equal(installer.dshHome({ DSH_HOME: '/tmp/x' }), '/tmp/x');
  assert.ok(installer.dshHome({}).endsWith('.dsh'));
  assert.ok(installer.skillsDir({ DSH_HOME: '/tmp/x' }).endsWith('skills'));
});

test('提示词：core.md 存在且不含未转义变量', () => {
  const text = fs.readFileSync(path.join(root, 'prompts/core.md'), 'utf8');
  assert.ok(text.length > 1000);
  assert.ok(text.includes('当前:对象 / 结果 / 下一步'));
  assert.ok(!/\{\{(?!cwd|model|provider)/.test(text), '存在非内置模板变量');
});
