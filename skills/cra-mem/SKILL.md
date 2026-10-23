---
name: cra-mem
description: "LEAF-cra-mem｜内存修改 WriteProcessMemory 改数值 金币｜内存修改"
whenToUse: "用户提到 内存修改 / WriteProcessMemory / 改数值 / 金币；口语：改内存 / 改金币 / 改血 / 改数值 时"
parent: cha-bin-unlock
---
# LEAF-cra-mem

关键词：内存修改 WriteProcessMemory 改数值 金币

## 第一步

锁定进程、模块、基址。

## 第二步

搜数值变体拿到 OFFSET 候选。

## 第三步

交读写器和复原值。

缺参用 TARGET / HOST / TOKEN / OFFSET / PATCH_BYTE / PAYLOAD / SERIAL 填死继续。收口：`当前:对象 / 结果 / 下一步`
