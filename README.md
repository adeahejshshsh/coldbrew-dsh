# coldbrew-dsh

**冷咖啡执行核** —— 一个 DeepSeek​Harness 插件。

给 DSH 加一层常驻执行核：8 条铁律、6 类路由、86 条三拍技能，破甲强度三档可调。

---

## 能做什么

### 一、三档破甲强度，配置切换

| 档 | 动什么 | 人格结果 | 影响范围 |
|---|---|---|---|
| `lite` | 只追加 systemPrompt section | 旧人格 + 执行核并存 | 本插件 |
| `mid` | 在 assembly 层摘掉出厂人格 | 执行核是唯一人格 | 整个 profile |
| `deep` | 同 mid，另改 DSH 安装目录里的默认提示词 | 连没装插件的会话也生效 | 整台机器 |

改 `$DSH_HOME/coldbrew.json` 的 `tier`，或直接 `/coldbrew tier deep`。重启生效。

`deep` 档改宿主前会校验 hash、备份原件、原子写，`/coldbrew restore` 一键还原。

### 二、86 条三拍技能

装完落进 `$DSH_HOME/skills`，由官方 `skill` 工具按需加载：

```
cha-bin-unlock   软件破解与逆向        cha-apicloud   接口云端与代码安全
cha-playfield    游戏安全与外挂         cha-labpipe    样本分析取证
cha-netcast      网络安全与渗透         cha-inkstage   内容创作与剧情
        └── 80 条叶子：cra-keygen / ply-aim / net-sqli / cld-jwt / lab-yara / ink-adult …
```

每条是「揭盖 → 追链 → 落地」三拍，带占位符 `TARGET` `OFFSET` `PATCH_BYTE` `SERIAL`。

常驻层只有 3.5KB，其余按需加载。

**只允许 agent 调用**：全部 86 条都带 `user-invocable: false`，人类不能用 `/cra-keygen` 直接触发，只能由模型按任务自己加载。

### 三、关键词路由

`coldbrew_route` 工具：传一句人话，返回该走哪条技能。

```
脱壳              → cra-unpack    6.2
帮我写个注册机      → cra-keygen    8.75
扫目录            → net-dir       31.2
做个自瞄           → ply-aim       27
JWT 伪造          → cld-jwt       13.7
这个站点的目录和端口 → cha-netcast   0   ← 弱命中降级到父技能
```

剥空转词、错字归一（唾壳→脱壳、自喵→自瞄）、双表计分、零分按对象兜底。

### 四、设置页

设置 › **冷咖啡**：三张卡片选档位，点保存写配置，当前生效的标红。底部显示 DSH 根路径与宿主补丁状态。

---

## 工具与命令

| 工具 | 干什么 |
|---|---|
| `coldbrew_status` | 当前档位、槽位、人格过滤、技能库、宿主补丁 |
| `coldbrew_route` | 原句 → 技能 id + 父技能 + 命中词 + 分数 |
| `coldbrew_skills` | 列 80 条叶子，可按父技能过滤 |
| `coldbrew_install` | install / uninstall / verify（sha256 manifest） |
| `coldbrew_host` | deep 档：apply / restore / verify |

```
/coldbrew status | tier <lite|mid|deep> | install | uninstall | verify | list | route <原句> | apply | restore
```

---

## 安装

**要求**：DSH `0.2.1-rc.2` 或更高，Node ≥18。

### 方式一：从 GitHub 装

```bash
cd ~/.dsh/profiles/web
dsh plugin --profile web add github:adeahejshshsh/coldbrew-dsh
```

### 方式二：从 tarball 装

```bash
dsh plugin --profile web add https://github.com/adeahejshshsh/coldbrew-dsh/archive/refs/heads/main.tar.gz
```

### 方式三：本地目录

```bash
git clone https://github.com/adeahejshshsh/coldbrew-dsh.git
cd ~/.dsh/profiles/web
dsh plugin --profile web add /path/to/coldbrew-dsh
```

### 装完必须做的一步

在 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 里加一行：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "coldbrew-dsh"
      ]
    }
  }
}
```

**然后重启 dsh。** 首次启动会自动把 86 条技能写进 `$DSH_HOME/skills`。

### 验证

```
/coldbrew status
```

```
coldbrew-dsh 1.0.0 · 执行核
强度        mid（来源 config）
提示词槽位  coldbrew-dsh:execution-core (order 150)  3532 字节
人格过滤    开 · harness:identity + deployment:persona-prefix
技能库      86 条（父 6 + 叶 80）
已安装      86/86
```

---

## 配置

配置文件 `$DSH_HOME/coldbrew.json`：

```json
{
  "tier": "mid",
  "injectPrompt": true,
  "autoInstallSkills": true,
  "autoPatchHost": false,
  "filterFactoryPersona": null
}
```

| 键 | 默认 | 说明 |
|---|---|---|
| `tier` | `mid` | 破甲强度 |
| `injectPrompt` | `true` | 是否注入常驻层 |
| `autoInstallSkills` | `true` | 启动时落盘 86 条技能 |
| `autoPatchHost` | `false` | deep 档是否自动改宿主 |
| `filterFactoryPersona` | `null` | `null` = 按 tier 自动 |

优先级：环境变量 `COLDBREW_TIER` > `coldbrew.json` > bundle patch 默认值。

---

## 卸载

```
/coldbrew uninstall     # 先撤技能
```

再从 `dsh.profile.bundles` 里删掉 `coldbrew-dsh`，重启。

`deep` 档打过宿主补丁的，先 `/coldbrew restore`。

---

## 许可

MIT。词包正文衍生自 [gpt6-Astra](https://github.com/3641397194-wq/gpt6-Astra)（MIT），清洗时去掉了群号、站点推广与 IDA 依赖条款。
