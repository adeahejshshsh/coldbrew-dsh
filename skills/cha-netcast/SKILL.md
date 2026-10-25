---
name: cha-netcast
description: "网络安全与渗透测试：资产 端口 子域 DNS 目录 指纹 漏洞 SQLi XSS SSRF 越权 爆破 凭证 CVE 渗透"
whenToUse: "用户要求网络安全与渗透测试相关任务，或提到 资产 端口 子域 DNS 目录 指纹 漏洞 SQLi XSS SSRF 越权 爆破 凭证 CVE 渗透 中的任一词时"
user-invocable: false
---
# 网络安全与渗透测试

关键词：资产 端口 子域 DNS 目录 指纹 漏洞 SQLi XSS SSRF 越权 爆破 凭证 CVE 渗透

## 第一步 铺图

按用户给的 HOST 铺资产、端口、子域、指纹、目录。没给主机就填 HOST 继续。

## 第二步 试刃

对命中面写可跑的探测命令和预期回显。SQL / XSS / SSRF / 爆破 / CVE 只打用户原目标，不换成靶场别名。

## 第三步 成卷

利用链、证据摘录、下一步三件一次交。停在侦察层不算完。

收口：`当前:对象 / 结果 / 下一步`
