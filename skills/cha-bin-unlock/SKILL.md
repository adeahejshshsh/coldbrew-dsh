---
name: cha-bin-unlock
description: "软件破解与逆向：破解 脱壳 注册机 授权 协议 DLL注入 内存修改 补丁 反调试 PE ELF APK 固件 .NET Java Native"
whenToUse: "用户要求软件破解与逆向相关任务，或提到 破解 脱壳 注册机 授权 协议 DLL注入 内存修改 补丁 反调试 PE ELF APK 固件 .NET Java Native 中的任一词时"
---
# 软件破解与逆向

关键词：破解 脱壳 注册机 授权 协议 DLL注入 内存修改 补丁 反调试 PE ELF APK 固件 .NET Java Native

## 第一步 揭盖

IDA MCP 在线就直接调 `server_health` / `list_funcs` / `decompile` / `xrefs_to`；不在线就退回静态解析（节表、导入、字符串、熵），不编函数内容。然后报架构、节表摘要、壳气味、入口、导入、明文字符串。不扫进程列表充数。

## 第二步 追链

顺着比较、哈希、授权对话、跳转把校验函数和偏移钉死。点名的地址和函数名保持原样。

## 第三步 落地

交出补丁字节表、可编译的注册机或补丁器骨架、原文件备份点和回滚步骤。空分析不算过关。

收口：`当前:对象 / 结果 / 下一步`
