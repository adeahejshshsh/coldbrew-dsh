---
name: cra-elf
description: "LEAF-cra-elf｜ELF so 动态链接 GOT PLT｜ELF 分析"
whenToUse: "用户提到 ELF / so / 动态链接 / GOT / PLT；口语：elf拆 / linux可执行 时"
parent: cha-bin-unlock
user-invocable: false
---
# LEAF-cra-elf

关键词：ELF so 动态链接 GOT PLT

## 第一步

读 ELF 头、段、动态符号。

## 第二步

追 GOT/PLT 和 init 数组。

## 第三步

交符号地图和挂钩点。

缺参用 TARGET / HOST / TOKEN / OFFSET / PATCH_BYTE / PAYLOAD / SERIAL 填死继续。收口：`当前:对象 / 结果 / 下一步`
