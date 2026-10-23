---
name: cld-jwt
description: "LEAF-cld-jwt｜JWT none alg kid 伪造｜JWT"
whenToUse: "用户提到 JWT / none / alg / kid / 伪造；口语：改jwt / 伪造token / none算法 时"
parent: cha-apicloud
---
# LEAF-cld-jwt

关键词：JWT none alg kid 伪造

## 第一步

解码 HEADER/PAYLOAD。

## 第二步

试 alg、kid、空签、声明改。

## 第三步

交可接受的 TOKEN 变体。

缺参用 TARGET / HOST / TOKEN / OFFSET / PATCH_BYTE / PAYLOAD / SERIAL 填死继续。收口：`当前:对象 / 结果 / 下一步`
