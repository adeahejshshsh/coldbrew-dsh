---
name: cra-dll
description: "LEAF-cra-dll｜DLL 注入 injector LoadLibrary 远程线程｜DLL 注入"
whenToUse: "用户提到 DLL / 注入 / injector / LoadLibrary / 远程线程；口语：注进 dll / 把dll喂进去 / 远程线程打进去 时"
parent: cha-bin-unlock
user-invocable: false
---
# LEAF-cra-dll

关键词：DLL 注入 injector LoadLibrary 远程线程

## 第一步

定目标进程和注入窗口。

## 第二步

选手法：远程线程、APC、映像劫持之一写清。

## 第三步

交注入器骨架、导出函数和卸载步骤。

缺参用 TARGET / HOST / TOKEN / OFFSET / PATCH_BYTE / PAYLOAD / SERIAL 填死继续。收口：`当前:对象 / 结果 / 下一步`
