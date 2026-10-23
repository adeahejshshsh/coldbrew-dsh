// coldbrew-dsh —— 一个插件，三档强度，靠配置切换。
//
// 强度不是靠「装哪个包」决定的，是运行时决定的：
//
//   lite  只追加 section。宿主原来是什么人格，就还是什么人格。
//   mid   追加 section + 在 assembly 层把出厂人格过滤掉。不改任何配置文件。
//   deep  同 mid，另加「直接改 DSH 安装目录里写死的默认提示词」，连没装插件的会话也吃这套。
//
// mid/deep 的过滤走 system-prompt/assemble 这个 waterfall，而不是改 bundle 的 config——
// 因为 config 是静态 YAML，一个包只能写死一种；waterfall 能按配置在运行时决定，
// 而且作用域干净：只影响本插件 ctx 覆盖到的 assembly，不写任何宿主文件。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { route, listSkills, loadIndex } from './lib/router.js';
import * as installer from './lib/installer.js';
import * as patcher from './lib/patcher.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));

export const TIERS = ['lite', 'mid', 'deep'];

// 出厂人格的 section 名。mid / deep 会把它们从 assembly 里摘掉。
//   harness:identity          order -1000  "You are an AI agent powered by DSH."
//   deployment:persona-prefix order     0  dsh-web-app 设的 "You are a coding agent ..."
const FACTORY_PERSONA = ['harness:identity', 'deployment:persona-prefix'];

const PROMPT_PATH = path.join(here, 'prompts/core.md');
// DSH 的提示词插值引擎把 {{...}} 当变量；非内置变量先转义，否则整个 profile 起不来
const escapeVars = (t) => t.replace(/\{\{(?!(?:cwd|model|provider)\}\})/g, '{ {');
const CORE_TEXT = escapeVars(fs.readFileSync(PROMPT_PATH, 'utf8'));

const SECTION_NAME = 'coldbrew-dsh:execution-core';
const SECTION_ORDER = 150;

const DEFAULTS = {
  tier: 'mid',
  injectPrompt: true,
  autoInstallSkills: true,
  autoPatchHost: false,
  filterFactoryPersona: null, // null = 按 tier 自动决定
};

const TIER_NOTE = {
  lite: '不碰宿主配置；人格由宿主决定，本插件只追加执行核。',
  mid: 'assembly 层过滤出厂人格（harness:identity + deployment:persona-prefix），不写任何宿主文件。',
  deep: '同 mid，另加直接改 DSH 安装目录里的默认提示词；升级后需重打，可一键还原。',
};

function dshHome(env = process.env) {
  const raw = String(env.DSH_HOME || '').trim();
  if (!raw) return path.join(env.HOME || '', '.dsh');
  if (raw === '~') return env.HOME || '';
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return path.join(env.HOME || '', raw.slice(2));
  return path.resolve(raw);
}

// 配置文件：$DSH_HOME/coldbrew.json
// 优先级：环境变量 COLDBREW_TIER > coldbrew.json 的 tier > cordis.patch.yml 的 config.tier > 'mid'
function readConfigFile(env = process.env) {
  try {
    const file = path.join(dshHome(env), 'coldbrew.json');
    if (!fs.existsSync(file)) return {};
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function resolveConfig(config = {}, env = process.env) {
  const file = readConfigFile(env);
  const merged = { ...DEFAULTS, ...config, ...file };
  const fromEnv = String(env.COLDBREW_TIER || '').trim().toLowerCase();
  const tier = TIERS.includes(fromEnv) ? fromEnv : (TIERS.includes(merged.tier) ? merged.tier : DEFAULTS.tier);
  const filter = merged.filterFactoryPersona === null || merged.filterFactoryPersona === undefined
    ? tier !== 'lite'
    : Boolean(merged.filterFactoryPersona);
  return { ...merged, tier, filterFactoryPersona: filter, source: fromEnv ? 'env' : (file.tier ? 'file' : 'config') };
}

const textOut = {
  schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } } },
  render: (_a, v) => [{ type: 'text', text: String(v?.text ?? '') }],
};
const emptyParams = { type: 'object', properties: {}, additionalProperties: false };

let CURRENT = { ...DEFAULTS };

function renderStatus() {
  const st = installer.status();
  const idx = loadIndex();
  const lines = [
    `coldbrew-dsh ${pkg.version} · 执行核`,
    `强度        ${CURRENT.tier}（来源 ${CURRENT.source}）`,
    TIER_NOTE[CURRENT.tier] || '',
    '',
    `提示词槽位  ${SECTION_NAME} (order ${SECTION_ORDER})  ${CORE_TEXT.length} 字节`,
    `人格过滤    ${CURRENT.filterFactoryPersona ? `开 · ${FACTORY_PERSONA.join(' + ')}` : '关（lite）'}`,
    `技能库      ${st.builtin} 条（父 ${idx.parents.length} + 叶 ${idx.leaves.length}）`,
    `安装目录    ${st.dir}  ${st.exists ? '(存在)' : '(未创建)'}`,
    `已安装      ${st.installed}/${st.builtin}`,
  ];
  if (st.missing.length) lines.push(`未安装      ${st.missing.slice(0, 6).join(', ')}${st.missing.length > 6 ? ` …共 ${st.missing.length}` : ''}`);
  const d = patcher.status();
  const root = patcher.findDshRoot();
  lines.push('', `宿主补丁    ${d.patched.length} 处  ${d.patched.join(', ') || '(未打)'}`, `DSH 根      ${root || '(未找到)'}`);
  if (CURRENT.tier === 'deep' && !d.patched.length) lines.push('            deep 档还没打补丁 → /coldbrew apply');
  return lines.join('\n');
}

const statusTool = {
  name: 'coldbrew_status',
  description: '查看 coldbrew-dsh 状态：当前强度、提示词槽位、人格过滤、技能库与宿主补丁进度。',
  parameters: emptyParams,
  output: textOut,
  execute() { return { text: renderStatus() }; },
};

const routeTool = {
  name: 'coldbrew_route',
  description: '把用户原句路由到具体三拍技能。去掉空转词后按关键词计分，返回叶子技能 id、父技能、命中词与分数。零命中时按对象类型兜底。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: { utterance: { type: 'string', description: '用户原句，原样传入，不要先改写' } },
    required: ['utterance'],
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string' }, name: { type: 'string' }, parent: { type: 'string' },
        score: { type: 'number' }, hits: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string' }, text: { type: 'string' },
      },
    },
    render: (_a, v) => [{ type: 'text', text: String(v?.text ?? '') }],
  },
  execute({ utterance }) {
    const hit = route(utterance);
    const text = hit.hits.length
      ? `→ ${hit.id}（${hit.name}）\n父技能 ${hit.parent} · 得分 ${hit.score} · 命中 ${hit.hits.join(' / ')}\n用 skill 工具加载 ${hit.id}，按它的三拍开跑。`
      : `→ ${hit.id}（兜底）\n原句没有命中任何叶子关键词，按对象类型落到父技能。用 skill 工具加载 ${hit.id}。`;
    return { ...hit, text };
  },
};

const listTool = {
  name: 'coldbrew_skills',
  description: '列出 coldbrew 内置的 80 条叶子技能（id / 名称 / 父技能 / 触发关键词），可按父技能过滤。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: { parent: { type: 'string', description: '可选：cha-bin-unlock | cha-playfield | cha-netcast | cha-apicloud | cha-labpipe | cha-inkstage' } },
  },
  output: textOut,
  execute({ parent }) {
    const all = listSkills();
    const rows = parent ? all.filter((s) => s.parent === parent) : all;
    return {
      text: rows.length
        ? `${rows.length} 条\n\n${rows.map((s) => `${s.id.padEnd(16)} ${s.name}  ← ${s.keywords.slice(0, 4).join(' ')}`).join('\n')}`
        : `没有父技能为 ${parent} 的叶子。`,
    };
  },
};

const installTool = {
  name: 'coldbrew_install',
  description: '把内置 86 条技能写入 DSH 官方技能目录 $DSH_HOME/skills。只写 manifest 登记过的目录，用户自建同名目录默认不覆盖。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      action: { type: 'string', enum: ['install', 'uninstall', 'verify'], description: '默认 install' },
      force: { type: 'boolean', description: 'install 时覆盖非本插件写入的同名技能' },
    },
  },
  output: textOut,
  execute({ action = 'install', force = false } = {}) {
    if (action === 'uninstall') {
      const r = installer.uninstall();
      return { text: `已移除 ${r.removed} 条（${r.dir}）${r.kept.length ? `\n保留被改动过的 ${r.kept.length} 条: ${r.kept.join(', ')}` : ''}` };
    }
    if (action === 'verify') {
      const r = installer.verify();
      return { text: r.ok ? `✓ ${r.checked} 条全部与内置版本一致` : `✗ ${r.bad.length} 条异常\n${r.bad.map((b) => `${b.id}: ${b.reason}`).join('\n')}` };
    }
    const r = installer.install(undefined, { force });
    const lines = [`✓ 写入 ${r.installed}/${r.total} 条 → ${r.dir}`];
    if (r.overwritten.length) lines.push(`覆盖 ${r.overwritten.length} 条: ${r.overwritten.join(', ')}`);
    if (r.skipped.length) lines.push(`跳过用户自建 ${r.skipped.length} 条（要覆盖加 force）: ${r.skipped.slice(0, 8).join(', ')}`);
    return { text: lines.join('\n') };
  },
};

const hostTool = {
  name: 'coldbrew_host',
  description: 'deep 档专用：直接改/还原 DSH 安装目录里的默认提示词。action = status | apply | restore | verify。改前自动备份，hash 对不上拒绝执行。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      action: { type: 'string', enum: ['status', 'apply', 'restore', 'verify'], description: '默认 status' },
      root: { type: 'string', description: 'DSH 安装根，默认自动定位' },
    },
  },
  output: textOut,
  execute({ action = 'status', root } = {}) {
    const r = root || patcher.findDshRoot();
    if (action === 'apply') {
      const res = patcher.apply(r);
      if (!res.ok) return { text: `✗ 未完全应用\n${(res.failed || []).map((f) => `${f.id}: ${f.reason}`).join('\n')}` };
      return { text: `✓ 已改 ${res.done.length} 处，跳过 ${res.skipped.length} 处\n重启 DSH 生效。还原用 coldbrew_host {action:"restore"}。` };
    }
    if (action === 'restore') {
      const res = patcher.restore(r);
      return { text: res.ok ? `✓ 已还原 ${res.reverted.length} 处\n重启 DSH 恢复出厂人格。` : `✗ 还原失败\n${res.failed.map((f) => `${f.id}: ${f.reason}`).join('\n')}` };
    }
    if (action === 'verify') {
      const res = patcher.verify(r);
      return { text: res.ok ? '✓ 两处补丁都在' : `✗ 未打: ${res.bad.join(', ')}\n${res.rows.map((x) => `${x.id}: ${x.status}`).join('\n')}` };
    }
    const st = patcher.status();
    const ins = patcher.inspect(r);
    return {
      text: [
        `DSH 根      ${r || '(未找到)'}`,
        `状态目录    ${st.stateDir}`,
        `已打补丁    ${st.patched.join(', ') || '(无)'}`,
        '',
        ...ins.rows.map((x) => `${x.id.padEnd(18)} ${x.status.padEnd(16)} ${x.rel}`),
      ].join('\n'),
    };
  },
};

function handleCommand(rawInput) {
  const args = String(rawInput || '').trim().split(/\s+/).filter(Boolean);
  const sub = (args[0] || 'status').toLowerCase();

  if (sub === 'tier' || sub === 'set') {
    const next = String(args[1] || '').toLowerCase();
    if (!TIERS.includes(next)) return { kind: 'error', text: `用法: /coldbrew tier <${TIERS.join('|')}>` };
    try {
      const file = path.join(dshHome(), 'coldbrew.json');
      const cur = readConfigFile();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ ...cur, tier: next }, null, 2) + '\n');
      return { kind: 'success', text: `✓ 已写入 ${file}\n强度改为 ${next}，重启 dsh 生效。` };
    } catch (e) {
      return { kind: 'error', text: `写入失败: ${e?.message || e}` };
    }
  }
  if (sub === 'route' || sub === 'r') {
    const utterance = args.slice(1).join(' ');
    if (!utterance) return { kind: 'error', text: '用法: /coldbrew route <原句>' };
    return { kind: 'success', text: routeTool.execute({ utterance }).text };
  }
  if (sub === 'install' || sub === 'i') return { kind: 'success', text: installTool.execute({ action: 'install' }).text };
  if (sub === 'uninstall' || sub === 'rm') return { kind: 'success', text: installTool.execute({ action: 'uninstall' }).text };
  if (sub === 'verify' || sub === 'v') return { kind: 'success', text: installTool.execute({ action: 'verify' }).text };
  if (sub === 'apply' || sub === 'restore') return { kind: 'success', text: hostTool.execute({ action: sub }).text };
  if (sub === 'list' || sub === 'ls') {
    const idx = loadIndex();
    const byParent = {};
    for (const leaf of idx.leaves) (byParent[leaf.parent] ||= []).push(leaf.id);
    return { kind: 'success', text: `叶子技能 ${idx.leaves.length} 条\n\n${idx.parents.map((p) => `${p}\n  ${(byParent[p] || []).join(' ')}`).join('\n')}` };
  }
  return { kind: 'success', text: renderStatus() };
}

// cordis 会按 inject 在 ctx 上挂服务代理，不同版本访问方式不一致，两种都试
function service(ctx, key) {
  try {
    const direct = ctx?.[key];
    if (direct !== undefined) return direct;
  } catch { /* getter 可能抛 */ }
  try {
    return ctx?.get?.(key);
  } catch {
    return undefined;
  }
}

// 从 assembly 里摘掉出厂人格。返回新对象，不改原 assembly。
function stripFactoryPersona(assembly) {
  if (!assembly || !Array.isArray(assembly.sections)) return assembly;
  const kept = assembly.sections.filter((s) => !FACTORY_PERSONA.includes(s?.name));
  if (kept.length === assembly.sections.length) return assembly;
  return { ...assembly, sections: kept };
}

export const name = 'coldbrew-dsh';
export const inject = ['tools', 'systemPrompt'];

export function apply(ctx, config = {}) {
  const cfg = resolveConfig(config);
  CURRENT = cfg;

  // 1) 常驻层：三档都注入同一份执行核
  const prompt = service(ctx, 'systemPrompt');
  if (cfg.injectPrompt !== false && prompt?.section) {
    ctx.effect(() => prompt.section({ name: SECTION_NAME, order: SECTION_ORDER, text: CORE_TEXT }));
  }

  // 2) 人格过滤：mid / deep 在 assembly 层摘掉出厂人格
  if (cfg.filterFactoryPersona) {
    const handler = async (_assembly, _context, next) => {
      const out = await next();
      return stripFactoryPersona(out);
    };
    if (typeof ctx.on === 'function') {
      ctx.effect(() => ctx.on('system-prompt/assemble', handler));
    }
  }

  // 3) deep：启动时自动打宿主补丁（失败不阻塞，只记日志）
  if (cfg.tier === 'deep' && cfg.autoPatchHost) {
    try {
      const root = patcher.findDshRoot();
      if (root) {
        const res = patcher.apply(root);
        if (res.done?.length) console.log(`[coldbrew-dsh] host patched: ${res.done.map((d) => d.id).join(', ')}`);
        if (res.failed?.length) console.warn('[coldbrew-dsh] host patch failed:', res.failed.map((f) => `${f.id}:${f.reason}`).join(', '));
      }
    } catch (e) {
      console.warn('[coldbrew-dsh] host patch error:', String(e?.message || e));
    }
  }

  // 4) 工具
  const tools = service(ctx, 'tools');
  if (tools?.register) {
    for (const tool of [statusTool, routeTool, listTool, installTool, hostTool]) {
      ctx.effect(() => tools.register(tool));
    }
  }

  // 5) 命令
  const commands = service(ctx, 'commands');
  if (commands) {
    ctx.effect(() =>
      commands.register({
        name: 'coldbrew',
        description: 'coldbrew-dsh 执行核：status | tier <lite|mid|deep> | install | uninstall | verify | list | route <原句> | apply | restore',
        input: { hint: 'status | tier <lite|mid|deep> | install | uninstall | verify | list | route <原句> | apply | restore' },
        handler: async (invocation) => handleCommand(invocation?.rawInput ?? ''),
      }),
    );
  }

  // 6) 技能落盘
  if (cfg.autoInstallSkills) {
    try {
      const r = installer.install();
      if (r.installed) console.log(`[coldbrew-dsh] skills installed: ${r.installed}/${r.total}`);
    } catch (e) {
      console.warn('[coldbrew-dsh] auto install skills failed:', String(e?.message || e));
    }
  }
}

// 给测试用：不启动插件也能验证过滤逻辑
export const __test__ = { stripFactoryPersona, resolveConfig, FACTORY_PERSONA };

export default { name, inject, apply };
