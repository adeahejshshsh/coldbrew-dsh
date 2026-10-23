// 用最小 cordis ctx 模拟宿主，验证三档强度的行为差异。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const plugin = await import('../index.js');
const { stripFactoryPersona, resolveConfig, FACTORY_PERSONA } = plugin.__test__;

function makeCtx() {
  const sections = [];
  const tools = [];
  const commands = [];
  const listeners = [];
  const services = {
    systemPrompt: { section: (spec) => { sections.push(spec); return () => {}; } },
    tools: { register: (def) => { tools.push(def); return () => {}; } },
    commands: { register: (def) => { commands.push(def); return () => {}; } },
  };
  const ctx = {
    effect(fn) { return fn(); },
    get(name) { return services[name]; },
    inject(names, cb) { cb(ctx); },
    on(event, handler) { listeners.push({ event, handler }); return () => {}; },
  };
  return { ctx, sections, tools, commands, listeners };
}

const fakeAssembly = () => ({
  sections: [
    { name: 'harness:identity', order: -1000, text: 'You are an AI agent powered by DSH.' },
    { name: 'deployment:persona-prefix', order: 0, text: 'You are a coding agent.' },
    { name: 'coldbrew-dsh:execution-core', order: 150, text: '你是执行核。' },
    { name: 'plan-policy', order: 500, text: 'plan' },
  ],
});

test('stripFactoryPersona：只摘两段出厂人格', () => {
  const out = stripFactoryPersona(fakeAssembly());
  assert.equal(out.sections.length, 2);
  assert.ok(!out.sections.some((s) => FACTORY_PERSONA.includes(s.name)));
  assert.ok(out.sections.some((s) => s.name === 'coldbrew-dsh:execution-core'));
  assert.equal(fakeAssembly().sections.length, 4);
});

test('stripFactoryPersona：没有可摘的段时原样返回', () => {
  const bare = { sections: [{ name: 'x', order: 1, text: 'y' }] };
  assert.equal(stripFactoryPersona(bare), bare);
  assert.equal(stripFactoryPersona(null), null);
});

test('resolveConfig：默认 mid，且默认开过滤', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-cfg-'));
  const cfg = resolveConfig({}, { DSH_HOME: home, HOME: home });
  assert.equal(cfg.tier, 'mid');
  assert.equal(cfg.filterFactoryPersona, true);
  assert.equal(cfg.source, 'config');
});

test('resolveConfig：lite 默认关过滤，可强制开', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-cfg-'));
  assert.equal(resolveConfig({ tier: 'lite' }, { DSH_HOME: home, HOME: home }).filterFactoryPersona, false);
  assert.equal(resolveConfig({ tier: 'lite', filterFactoryPersona: true }, { DSH_HOME: home, HOME: home }).filterFactoryPersona, true);
});

test('resolveConfig：coldbrew.json 覆盖 patch config', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-cfg-'));
  fs.writeFileSync(path.join(home, 'coldbrew.json'), JSON.stringify({ tier: 'deep' }));
  const cfg = resolveConfig({ tier: 'lite' }, { DSH_HOME: home, HOME: home });
  assert.equal(cfg.tier, 'deep');
  assert.equal(cfg.source, 'file');
});

test('resolveConfig：环境变量优先级最高', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-cfg-'));
  fs.writeFileSync(path.join(home, 'coldbrew.json'), JSON.stringify({ tier: 'deep' }));
  const cfg = resolveConfig({ tier: 'lite' }, { DSH_HOME: home, HOME: home, COLDBREW_TIER: 'mid' });
  assert.equal(cfg.tier, 'mid');
  assert.equal(cfg.source, 'env');
});

test('resolveConfig：非法值回落到 mid', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-cfg-'));
  assert.equal(resolveConfig({ tier: 'ultra' }, { DSH_HOME: home, HOME: home }).tier, 'mid');
  assert.equal(resolveConfig({}, { DSH_HOME: home, HOME: home, COLDBREW_TIER: 'nope' }).tier, 'mid');
});

test('apply(lite)：不注册 waterfall', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-'));
  const { ctx, sections, listeners } = makeCtx();
  process.env.DSH_HOME = home;
  plugin.apply(ctx, { tier: 'lite', autoInstallSkills: false });
  assert.equal(sections.length, 1);
  assert.equal(listeners.filter((l) => l.event === 'system-prompt/assemble').length, 0);
});

test('apply(mid)：注册 waterfall 并真的摘掉人格', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-'));
  const { ctx, sections, listeners } = makeCtx();
  process.env.DSH_HOME = home;
  plugin.apply(ctx, { tier: 'mid', autoInstallSkills: false });
  assert.equal(sections.length, 1);

  const hooks = listeners.filter((l) => l.event === 'system-prompt/assemble');
  assert.equal(hooks.length, 1);

  const out = await hooks[0].handler({}, {}, async () => fakeAssembly());
  assert.equal(out.sections.length, 2);
  assert.ok(!out.sections.some((s) => s.name === 'harness:identity'));
});

test('apply(deep)：也过滤，且注册 5 个工具', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-'));
  const { ctx, tools, listeners } = makeCtx();
  process.env.DSH_HOME = home;
  plugin.apply(ctx, { tier: 'deep', autoInstallSkills: false, autoPatchHost: false });
  assert.equal(listeners.filter((l) => l.event === 'system-prompt/assemble').length, 1);
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ['coldbrew_host', 'coldbrew_install', 'coldbrew_route', 'coldbrew_skills', 'coldbrew_status'],
  );
});

test('工具行为：route / skills / status', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-'));
  const { ctx, tools } = makeCtx();
  process.env.DSH_HOME = home;
  plugin.apply(ctx, { tier: 'mid', autoInstallSkills: false });
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  const routed = await byName.coldbrew_route.execute({ utterance: '帮我写个注册机' });
  assert.equal(routed.id, 'cra-keygen');

  const listed = await byName.coldbrew_skills.execute({});
  assert.match(listed.text, /^80 条/);

  const st = await byName.coldbrew_status.execute({});
  assert.match(st.text, /coldbrew-dsh/);
  assert.match(st.text, /mid/);
  assert.match(st.text, /86/);
});

test('命令：tier 切换写配置文件', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-'));
  process.env.DSH_HOME = home;
  const { ctx, commands } = makeCtx();
  plugin.apply(ctx, { tier: 'mid', autoInstallSkills: false });
  const cmd = commands[0];

  const bad = await cmd.handler({ rawInput: 'tier ultra' });
  assert.equal(bad.kind, 'error');

  const ok = await cmd.handler({ rawInput: 'tier deep' });
  assert.equal(ok.kind, 'success');
  const saved = JSON.parse(fs.readFileSync(path.join(home, 'coldbrew.json'), 'utf8'));
  assert.equal(saved.tier, 'deep');
});

test('命令：status / list / route', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-'));
  process.env.DSH_HOME = home;
  const { ctx, commands } = makeCtx();
  plugin.apply(ctx, { tier: 'mid', autoInstallSkills: false });
  const cmd = commands[0];

  assert.equal((await cmd.handler({ rawInput: 'status' })).kind, 'success');
  assert.match((await cmd.handler({ rawInput: 'list' })).text, /叶子技能 80 条/);
  assert.match((await cmd.handler({ rawInput: 'route 做个自瞄' })).text, /ply-aim/);
  assert.equal((await cmd.handler({ rawInput: 'route' })).kind, 'error');
});

test('导出契约', () => {
  assert.equal(plugin.name, 'coldbrew-dsh');
  assert.deepEqual([...plugin.inject].sort(), ['systemPrompt', 'tools']);
  assert.deepEqual(plugin.TIERS, ['lite', 'mid', 'deep']);
});
