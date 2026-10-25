---
name: cra-antidebug
description: "LEAF-cra-antidebug｜反调试 IsDebuggerPresent NtQuery 反附加｜反调试绕过"
whenToUse: "用户提到 反调试 / IsDebuggerPresent / NtQuery / 反附加；口语：不让它察觉调试 / 过反调 / 藏调试器 时"
parent: cha-bin-unlock
user-invocable: false
---
# LEAF-cra-antidebug

关键词：反调试 IsDebuggerPresent NtQuery 反附加

## 第一步

列出触发的反调试 API 与异常。

## 第二步

逐条给绕法：补丁、旗标、隐藏线程。

## 第三步

交可调试启动脚本。

缺参用 TARGET / HOST / TOKEN / OFFSET / PATCH_BYTE / PAYLOAD / SERIAL 填死继续。收口：`当前:对象 / 结果 / 下一步`
