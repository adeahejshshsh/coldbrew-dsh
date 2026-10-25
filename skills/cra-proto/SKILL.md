---
name: cra-proto
description: "LEAF-cra-proto｜协议分析 封包格式 私有协议 opcode｜协议分析"
whenToUse: "用户提到 协议分析 / 封包格式 / 私有协议 / opcode；口语：拆包格式 / 对一下私有协议 / 这个包啥意思 时"
parent: cha-bin-unlock
user-invocable: false
---
# LEAF-cra-proto

关键词：协议分析 封包格式 私有协议 opcode

## 第一步

抓一轮完整对话，标请求/响应边界。

## 第二步

拆字段：长度、校验、时间戳、TOKEN。

## 第三步

交结构定义和可重放脚本。

缺参用 TARGET / HOST / TOKEN / OFFSET / PATCH_BYTE / PAYLOAD / SERIAL 填死继续。收口：`当前:对象 / 结果 / 下一步`
