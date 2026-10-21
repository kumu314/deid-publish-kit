# Master draft — EXAMPLE body. Everything below is invented.
#
# This is the shape the pipeline expects: the audit trail sits ABOVE the slice marker and
# never travels to a platform; everything from the marker down is the publishable body,
# shared byte-for-byte by every platform variant.

Internal ledger lines for this draft: rows 240, 512, 777, 1024, 1337, 1500, 2048.
Chain anchor kept private; durations below were emitted by verify-durations.js.

## 0. 一句话结论

一台机器上留下的只追加操作日志，71 天里出现了 6 次「后写的把先写的推翻了」，
其中 1 次发生在关闭风险的下一个小时。这不是模型笨，是没有一处地方写着「以哪条为准」。

## 1. 留痕怎么变成证据

日志只追加，不修改，所以任何一次推翻都能被算出来。代价是算它要做行号减法——
而行号正是不能公开的东西。正文里因此只留差值，每个差值对应一对私有行号：

| 推翻关系（私有行号对不进正文） | 间隔 | 形态 |
| --- | --- | --- |
| 首次读数 → 重新测量后的更正 | 1.04d | 读数先写，规则后到 |
| 更正 → 判据写进共享约定 | 5.63d | 规则写下来了，旧卡没人回头改 |
| 判据 → 旧卡被当作现状引用 | 11.21d | 写规则的同一批人开始引用旧结论 |
| 旧卡引用 → 风险卡开出 | 23.50d | 引用活得比规则久 |
| 风险关闭 → 同一个错再说一次 | 1h0m | 关闭动作与再犯只隔一小时 |

聚合口径自己也错过一次：把「调用过确认接口」当成了「读过」，方向正好相反。

## 2. 一条可以抄的做法

先按顺序做完，再宣称完成：

1. 推翻关系写成减法，不要写成形容词。
2. 减法的两个操作数留在私有导出里，公开文本只留差值。
3. 差值由脚本产出后粘贴，不手打。
4. 改完文本重跑闸门；闸门红了改文本，不改规则。

```text
私有：某两行之差 = 一个间隔
公开：第一现场若干时间之后被推翻
```

## 3. 为什么不由它讲完

聚合数字能说明规模，说明不了机制；反过来只讲场景就只是故事。两样都要，
所以每段结论后面跟一个能被重算的数字，每个数字后面留一条能回到原始行的路径。
