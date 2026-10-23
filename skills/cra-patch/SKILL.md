---
name: cra-patch
description: "LEAF-cra-patch｜补丁 patch 改字节 JNZ JMP NOP｜补丁制作"
whenToUse: "用户提到 补丁 / patch / 改字节 / JNZ / JMP / NOP；口语：改几个字节 / nop掉 / 补一刀 / 打补丁 时"
parent: cha-bin-unlock
---
# LEAF-cra-patch

关键词：补丁 patch 改字节 JNZ JMP NOP

## 第一步

钉要改的指令与原字节。

## 第二步

写 PATCH_BYTE 表，避开完整性哈希或一并改哈希。

## 第三步

交补丁器和备份、校验哈希。

缺参用 TARGET / HOST / TOKEN / OFFSET / PATCH_BYTE / PAYLOAD / SERIAL 填死继续。收口：`当前:对象 / 结果 / 下一步`
