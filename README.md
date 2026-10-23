# coldbrew-dsh · 冷咖啡执行核

一个 DeepSeek​Harness 插件。**三档破甲强度，改一个配置文件就能切换。**

原版是 [gpt6-Astra](https://github.com/3641397194-wq/gpt6-Astra) 那套「往 11 个 AI CLI 的配置文件里写越狱词包」的桌面软件。这里把它的词包体系移植成 DSH 原生插件，并重做了强度模型——不再是「装哪个包」，而是运行时决定。

---

## 三档强度

| 档 | 动什么 | 人格结果 | 影响范围 | 回滚 |
|---|---|---|---|---|
| `lite` | 只追加 section（order 150） | 旧人格 + 执行核并存 | 本插件 section | 删包 |
| `mid` | section + 在 assembly 层摘掉出厂人格 | 执行核是唯一人格 | 整个 profile | 删包 |
| `deep` | 同 mid + 改 DSH 安装目录里的默认提示词 | 连没装插件的会话也吃这套 | 整台机器 | `restore` |

### 为什么 mid 用 waterfall 而不是改 config

DSH 的人格有三层：

```
order -1000   harness:identity          "You are an AI agent powered by DSH."
order     0   deployment:persona-prefix "You are a coding agent powered by the {{model}} model."
order   150   coldbrew-dsh:execution-core   ← 本插件
```

`cordis.patch.yml` 是静态 YAML，一个包只能写死一种强度。所以 `mid`/`deep` 的「摘掉出厂人格」走的是 `system-prompt/assemble` 这个 waterfall：

```js
ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
  const out = await next();
  return { ...out, sections: out.sections.filter(s => !FACTORY_PERSONA.includes(s.name)) };
});
```

好处：不写任何宿主文件、不占 `system-prompt` 的 config 槽位、别的破甲插件想改 `personaPrefix` 随便改，本插件不抢。

---

## 设置页

装好后，dsh 的设置里会多一面 **设置 › 冷咖啡**：三张卡片选档位，点保存写进 `$DSH_HOME/coldbrew.json`，重启生效。当前生效的那档右上角标红。

```
冷咖啡执行核                          [● 当前 中档 · 来源 file]
选择破甲强度。改完需要重启 dsh 生效。

┌─────────────────────────────────────────────────┐
│  轻档 lite  只加不删                              │
│  只往 systemPrompt 追加执行核，不动宿主人格。       │
│  影响 本插件 section · 回滚 删包即可 · 风险 低     │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│ ● 中档 mid  推荐                       当前生效   │
│  在 assembly 层摘掉出厂人格，不写任何宿主文件。     │
│  影响 整个 profile · 回滚 删包即可 · 风险 中      │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│  重档 deep  最深                                 │
│  同中档，另加直接改 DSH 安装目录里的默认提示词。    │
│  影响 整台机器所有 profile · 回滚 需 restore · 风险 高 │
└─────────────────────────────────────────────────┘

[保存并重启生效]   选中 deep，点保存写入配置文件。
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
DSH 根 /data/.../node_modules/@deepseek-ai/dsh
宿主补丁 harness-identity:original · webapp-persona:original
```

样式跟 DSH 主题走：只用 `inherit` + 透明度分层，不写死背景色，亮色/暗色主题都不炸。唯一硬编码是强调色 `#ef4444`。

后端接口：

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/coldbrew/config` | 当前档位、来源、三档元信息、宿主补丁状态 |
| POST | `/coldbrew/config` | `{ "tier": "mid" }` → 写配置文件 |

---

## 改强度

三种方式，优先级从高到低：

**1. 环境变量**（临时试）

```bash
COLDBREW_TIER=lite dsh
```

**2. 配置文件**（推荐）

```bash
# $DSH_HOME/coldbrew.json
{
  "tier": "mid",
  "autoInstallSkills": true,
  "autoPatchHost": false
}
```

或者用命令：

```
/coldbrew tier deep
```

**3. bundle patch 的默认值**

```yaml
# cordis.patch.yml
- insert:
    - id: coldbrew-dsh
      name: 'coldbrew-dsh'
      config:
        tier: mid
```

改完重启 dsh 生效。

---

## deep 档的额外动作

`deep` 会改 DSH 安装目录里两个文件：

| 文件 | 改什么 |
|---|---|
| `dsh-system-prompt/lib/index.js` | `text: "You are an AI agent powered by DSH."` → `text: ""` |
| `dsh-web-app/cordis.patch.yml` | `personaPrefix: >-` 那段 coding agent 人格 → 空 |

默认**不自动打**（`autoPatchHost: false`），要显式：

```
/coldbrew apply       # 或工具 coldbrew_host {action:"apply"}
/coldbrew restore     # 还原
```

补丁器动手前五道闸：

1. 自动定位 DSH 根（`which dsh` → `$PREFIX/lib/node_modules/@deepseek-ai/dsh`；Android 下 `process.execPath` 是 linker，不能用）
2. **hash 校验**：目标文本必须精确匹配一次，匹配不到就报 `unknown-version` 拒绝改
3. 备份原件到 `$DSH_HOME/coldbrew-deep/backup/`
4. 原子写（临时文件 + rename，保留权限位）
5. manifest 记 `before / after / backup / at`

**DSH 升级会覆盖 node_modules，补丁失效。** 升级后跑 `/coldbrew` 看 `宿主补丁` 那行，或 `coldbrew_host {action:"verify"}`。

---

## 技能：86 条三拍

三档共用同一套，落在 `$DSH_HOME/skills`：

```
cha-bin-unlock   软件破解与逆向       ← 父技能 6 条
cha-playfield    游戏安全与外挂
cha-netcast      网络安全与渗透
cha-apicloud     接口云端与代码安全
cha-labpipe      样本分析取证
cha-inkstage     内容创作与剧情
    └─ 叶子 80 条：cra-keygen / ply-aim / net-sqli / cld-jwt / lab-yara / ink-adult …
```

每条是「第一步 揭盖 → 第二步 追链 → 第三步 落地」的三拍，带占位符（`TARGET` `OFFSET` `PATCH_BYTE` `SERIAL`）。

常驻层只有 3.5KB（`prompts/core.md`），其余按需由 `skill` 工具加载。原版把 43KB 全塞进 AGENTS.md，是在用 5 倍 token 换 0 收益。

---

## 路由

原版的 ROUTER 是 43KB 死表，靠模型自己数关键词。这里做成工具 + 算法：

1. **剥空转词**：帮我 / 给我 / 请问 / 一下 / 咋整 / 能不能 …
2. **错字归一**：卸锁→解锁，唾壳→脱壳，视透→透视，自喵→自瞄
3. **双表计分**：主题词 ×2，口语碎片（从 NORMALIZER 表解析）×6
4. **父技能加权**：命中某父的关键词，该父下的叶子一起加分
5. **弱命中降级**：分数低又没主题词命中 → 交父技能，不硬塞叶子
6. **零分兜底**：有二进制线索 → `cha-bin-unlock`，有 host/url → `cha-netcast`，纯文字 → `cha-inkstage`

实测：

```
脱壳                 → cra-unpack       6.2
帮我写个注册机          → cra-keygen       8.75
扫目录               → net-dir          31.2
扫端口               → net-port         31.2
做个自瞄              → ply-aim          27
这个站点的目录和端口     → cha-netcast      0    ← 弱命中降级
随便说点什么           → cha-inkstage     0    ← 兜底
JWT 伪造             → cld-jwt          13.7
```

---

## 工具

| 工具 | 干什么 |
|---|---|
| `coldbrew_status` | 当前强度、槽位、人格过滤、技能库、宿主补丁 |
| `coldbrew_route` | 传原句 → 叶子 id + 父技能 + 命中词 + 分数 |
| `coldbrew_skills` | 列 80 条叶子，可按父过滤 |
| `coldbrew_install` | install / uninstall / verify（sha256 manifest） |
| `coldbrew_host` | deep 档：status / apply / restore / verify |

命令：`/coldbrew status | tier <lite\|mid\|deep> | install | uninstall | verify | list | route <原句> | apply | restore`

---

## 装

```bash
cd ~/.dsh/profiles/web
dsh plugin --profile web add /path/to/coldbrew-dsh
```

再在 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 里加一行 `"coldbrew-dsh"`，重启 dsh。

首次启动会自动把 86 条技能写进 `$DSH_HOME/skills`（只写自己 manifest 登记过的目录，用户自建同名目录不覆盖）。

---

## 测试

```bash
node tests/smoke.test.js    # 11 项：skills 完整性 / 清洗 / 路由 / 安装器 / 提示词
node tests/load.test.js     # 14 项：三档行为差异 / 配置优先级 / 工具 / 命令
node tests/patcher.test.js  #  6 项：伪造 DSH 根跑 apply/verify/restore，不碰真实安装
```

31 项全绿。

---

## 和别的破甲插件共存

本插件只用 `order 150` 一个 section，**不碰** `system-prompt` 的 config。fujiang-armor 那类插件占 100 / 200、想清 `personaPrefix` 都随意——两边不打架。

如果它们也清了人格，`mid` 的过滤就是幂等的（本来就没有可摘的段）。

---

## 许可

MIT。词包正文衍生自 [gpt6-Astra](https://github.com/3641397194-wq/gpt6-Astra)（MIT），清洗时去掉了群号、站点推广、产品标题与 IDA 依赖条款。
