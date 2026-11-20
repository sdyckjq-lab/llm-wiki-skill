# #158 完工审查基线

> GitHub Issue: [#191](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/191)
> Parent: [#190](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/190)
> Audit target: [#158](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/158)

## 1. 用途与边界

本文固定 #158 完工审查开始时可见的材料。它只回答“开始审查时是什么样”，不判断 #158 是否合格，不确认下列线索是否成立，也不修复任何问题。后续 #192 必须引用本文件固定的版本和入口编号；若后来发现遗漏，不回写本文，而是按审查规格登记为晚发现事项。

本文没有读取真实知识库、应用数据或模型凭证，没有调用真实模型，也没有发起外部模型请求。运行代码相关的收集和验证均使用临时 `HOME`、最小环境变量，并显式清除常见模型密钥变量。

## 2. 审查起点

| 项目                  | 固定值                                                                     |
| --------------------- | -------------------------------------------------------------------------- |
| 开始收集时间          | `2026-07-12T09:08:11Z`（北京时间 `2026-07-12T17:08:11+08:00`）             |
| 最新主线              | `504db2d99bef9a8b7eb2b849bb2e3d0dccf55109`                                 |
| 主线提交时间          | `2026-07-12T16:53:54+08:00`                                                |
| 主线提交说明          | `Merge pull request #202 from sdyckjq-lab/codex/spec-158-completion-audit` |
| Node                  | `v22.22.3`                                                                 |
| 操作系统              | macOS `26.3.1 (a)`，build `25D771280a`，Darwin `25.3.0 arm64`              |
| 收集分支              | `codex/docs-191-audit-baseline`，从上述主线直接创建                        |
| GitHub 任务快照       | `2026-07-12T09:08:10Z`                                                     |
| GitHub 合并结果快照   | `2026-07-12T09:08:49Z`                                                     |
| GitHub 检查与审查快照 | `2026-07-12T09:11:32Z` 至 `2026-07-12T09:11:40Z`                           |
| GitHub 权限复核       | `2026-07-12T09:26:09Z`                                                     |

固定主线的命令：

```bash
git fetch origin main --prune
git switch main
git pull --ff-only origin main
git rev-parse HEAD
git switch -c codex/docs-191-audit-baseline
```

## 3. 版本固定方法

- GitHub 任务使用 GraphQL `Issue.userContentEdits` 取得所有可用正文快照，同时取得 `state`、`labels`、`parent`、`subIssues`、`blockedBy`、`blocking` 和关闭它的合并请求。正文校验值按 GitHub 返回的 UTF-8 正文原文计算 SHA-256。
- 合并请求使用 GitHub CLI 的结构化 JSON 和 REST commits 接口取得创建、首个实现提交、合并、审查和讨论记录。
- 仓库文档使用完整提交、Git blob 和文件内容 SHA-256 三层定位。开工前文档以第一份实现提交的直接父版本为边界。
- 请求入口不使用文本搜索计数。统一组装部分读取 Hono 实例实际注册的 routes；启动阶段另挂部分使用 TypeScript 语法树读取 `index.ts` 顶层 `app.METHOD("/api/...")` 调用。两者合并后再与 `ENDPOINT_REGISTRY` 按方法和地址逐项连接。
- 所有清单先按固定字段和固定排序序列化，再计算 SHA-256。第 11 节记录校验值和重算口径。

### 3.1 GitHub 结构化收集命令

任务正文、版本和关系使用下面的完整 GraphQL 查询。`diff` 字段保存 GitHub 可返回的每个完整正文快照，不是从当前正文猜测旧版本：

```bash
nums=(158 {165..176} {190..201})
fields='number title body state stateReason createdAt updatedAt closedAt
lastEditedAt url id labels(first:50){nodes{name}} parent{number}
subIssues(first:50){nodes{number state}}
blockedBy(first:50){nodes{number state}}
blocking(first:50){nodes{number state}}
closedByPullRequestsReferences(first:20){nodes{number title state merged
mergedAt mergeCommit{oid} headRefName baseRefName url}}
userContentEdits(first:100){nodes{id createdAt editedAt updatedAt
editor{login} diff}}'
query='query {'
for n in "${nums[@]}"; do
  query+=" i${n}: repository(owner:\"sdyckjq-lab\",name:\"llm-wiki-skill\")
  {issue(number:${n}){${fields}}}"
done
query+=' }'
gh api graphql -f query="$query" |
  jq -S '.data | map_values(.issue)' > issue-158-github-snapshot.json
```

合并结果和 commits 使用固定编号，不依赖搜索结果：

```bash
for n in {177..188}; do
  gh pr view "$n" --repo sdyckjq-lab/llm-wiki-skill \
    --json number,title,body,state,createdAt,updatedAt,mergedAt,mergeCommit,\
headRefName,baseRefName,url,closingIssuesReferences,reviews,comments
  gh api "repos/sdyckjq-lab/llm-wiki-skill/pulls/$n/commits?per_page=100"
done
```

审查线程使用 GraphQL `PullRequest.reviews` 和 `PullRequest.reviewThreads`，固定字段为审查 ID、状态、提交时间、审查提交、thread ID、`isResolved`、`isOutdated`、讨论 URL 和评论时间。公开基线不复制意见正文；完整意见继续由第 8.3 节的 GitHub 永久链接定位。仓库设置使用第 8.1 节逐行列出的 REST endpoint，权限主体和复核时间见第 8.2 节。

## 4. 原始设计与后续变化

### 4.1 开工前设计

第一份相关实现提交是 `623e66121ed176201637e0f76e41a8537676697c`，提交时间 `2026-07-10T04:36:40Z`。它的直接父版本正是开工前设计定稿：

| 项目         | 固定值                                                                         |
| ------------ | ------------------------------------------------------------------------------ |
| 设计提交     | `2a2009df483adcfcc6925a7f237f029d4645bdbb`                                     |
| 提交时间     | `2026-07-10T10:56:31+08:00`                                                    |
| 文件         | `docs/superpowers/specs/2026-07-10-workbench-http-routing-contracts-design.md` |
| Git blob     | `22facf11d53be5f662a740c879f4efa2cc61458c`                                     |
| 文件 SHA-256 | `78174d2930f33dd864d6e1fa4b48143fb3aa404a30d1cbb9874ff3e521e1ec47`             |

### 4.2 实施期间设计变化

实施期间只找到一次该设计文件的修改：

| 项目         | 固定值                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------- |
| 修改提交     | `631daae48b40eba40f7e3f90299745f7b47318fb`                                                  |
| 提交时间     | `2026-07-11T21:15:55+08:00`                                                                 |
| Git blob     | `6d6916014fce4bb62b735008fd0f71ba13ced30e`                                                  |
| 文件 SHA-256 | `3a753562606f02c991ab32185e81d462a64351c161a4b0806dbd54112a2fef09`                          |
| 变化范围     | 9 行：把唯一终态规则限定到 prompt，并分别补充 batch digest 与 graph events 的身份和结束规则 |

这里固定变化内容和发生时间；文字冲突在第 4.4 节单独登记。

### 4.3 当前审查规格

当前审查规格在主线 `504db2d99bef9a8b7eb2b849bb2e3d0dccf55109` 中的固定值：

| 项目         | 固定值                                                                                |
| ------------ | ------------------------------------------------------------------------------------- |
| 文件         | `docs/superpowers/specs/2026-07-11-workbench-http-routing-completion-audit-design.md` |
| 最后正文提交 | `2e872877290ddc9b99817842d11f7e730b6a50cc`                                            |
| Git blob     | `55ab435be52448492dceab04777d2fa9c17a9616`                                            |
| 文件 SHA-256 | `d1aa0406cc1b06aa99f2fa8a1355f52225cbe3ad6f7de59a1d297f2b332f8941`                    |

### 4.4 来源冲突登记

这里只比较来源文字，不评价当前实现：

| 编号             | 开工前来源                                                        | 后来来源                                                                               | 文字差异                                               | 本阶段处理                                                             |
| ---------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| SRC-CONFLICT-001 | `2a2009d...` 的设计把每个 stream 的唯一终态写成 prompt 的三类终态 | `631daae...` 将该规则限定为 prompt，并为 batch digest 与 graph events 改用各自结束规则 | 对 batch digest 和 graph events 的身份与结束规则不相同 | 两个版本同时固定，留给 #192 按设计变更规则审查，不在 #191 选择或下结论 |

逐项比较 #158、#165 至 #176 在各自开工前的最后正文，与第 7 节开工前 PRODUCT/ADR 后，没有发现其他文字上无法同时满足的要求。第 7 节来源从开工前到审查起点未变化，因此没有来自 PRODUCT/ADR 的后来加严或放宽。第 4.3 节是后来新增的审查程序规则，单独使用，不替换原始产品承诺。

## 5. 任务状态、关系与当前正文

以下是开始收集时的快照。`正文 SHA-256` 固定当时完整正文；正文历次快照见附录 A。`上级`、`子级`、`等待`、`挡住` 均来自 GitHub 正式关系字段，不从正文里的手写列表推断。

| 任务                                                             | 状态   | 标签                         | 上级 | 子级                                                             | 等待       | 挡住       | GitHub 更新时间        | 正文 SHA-256                                                       |
| ---------------------------------------------------------------- | ------ | ---------------------------- | ---- | ---------------------------------------------------------------- | ---------- | ---------- | ---------------------- | ------------------------------------------------------------------ |
| [#158](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/158) | OPEN   | enhancement                  | -    | #190                                                             | #190       | -          | `2026-07-12T08:22:00Z` | `3875462117f6d863cad96f8c82ba91a91521120b41f6f47ebaa10e83bf1c0dc6` |
| [#165](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/165) | CLOSED | ready-for-agent              | -    | -                                                                | -          | -          | `2026-07-10T05:12:09Z` | `c7d261ff227eea273e690ddad54e5a2a9fa6b4b145c4ec1870c3c85c655b7dc7` |
| [#166](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/166) | CLOSED | -                            | -    | -                                                                | -          | -          | `2026-07-10T08:05:17Z` | `00f7fbb2b8f0c6bed980abeb6d7eb851e133aaef6bc0149597471bd549478e49` |
| [#167](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/167) | CLOSED | -                            | -    | -                                                                | -          | -          | `2026-07-11T14:46:16Z` | `f4a06dffdd8e906d7c00d40b0c2dc08e930077421992802c025e78e1730d7eab` |
| [#168](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/168) | CLOSED | -                            | -    | -                                                                | -          | -          | `2026-07-11T14:46:19Z` | `8cc885143efebb57ddd5034b1be0726c48d7e9a4022b6ac64219e688acd19d0e` |
| [#169](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/169) | CLOSED | -                            | -    | -                                                                | -          | -          | `2026-07-10T14:35:38Z` | `b4aba0e93948af06c0dd25404db4c17c09e96f9a5ce18107be76e47ff138112b` |
| [#170](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/170) | CLOSED | -                            | -    | -                                                                | -          | -          | `2026-07-10T15:27:24Z` | `a8271f0ded269db2969b4d312617577cb1466ba5e7308cea5dfbd39a7664d159` |
| [#171](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/171) | CLOSED | -                            | -    | -                                                                | -          | -          | `2026-07-10T13:54:29Z` | `db401479154227072f3c5450405efc03fd300ce1accff1f4693e52018ef291a4` |
| [#172](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/172) | CLOSED | -                            | -    | -                                                                | -          | -          | `2026-07-11T06:34:25Z` | `8cad184b3099e9df409a89d7da887a25e600e22c05d61bc4fae2d19eccd7c49f` |
| [#173](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/173) | CLOSED | -                            | -    | -                                                                | -          | -          | `2026-07-10T23:50:01Z` | `79e73d7454bdb1cfc361bf3ab1f9610c05a23fcf8cd079a8be7f236601aedefc` |
| [#174](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/174) | CLOSED | -                            | -    | -                                                                | -          | -          | `2026-07-11T12:06:13Z` | `4410c3791840f0c7a4e96d582d76e351ae77491961bbf1c2a57a87b34fc01928` |
| [#175](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/175) | CLOSED | -                            | -    | -                                                                | -          | -          | `2026-07-11T13:18:03Z` | `44c29c628eec2c988fc671b1cd66aa326e2b55d1e5e060a6743ceb760e125bc9` |
| [#176](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/176) | CLOSED | -                            | -    | -                                                                | -          | -          | `2026-07-11T14:24:44Z` | `913e93b2311fc632c7f5143fb9fb2bfb1cd9c9e0181bf1b469ef5d41c11913ed` |
| [#190](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/190) | OPEN   | enhancement                  | #158 | #191, #192, #193, #194, #195, #196, #197, #198, #199, #200, #201 | #201       | #158       | `2026-07-12T08:55:07Z` | `abfa8df3bd2a60e5e4657369caafca0c99c75906ce5893f683c48bc9b12d24f7` |
| [#191](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/191) | OPEN   | enhancement, ready-for-agent | #190 | -                                                                | -          | #192       | `2026-07-12T08:54:58Z` | `0f0f70b8ee769d7ce276a3f9f09e7c437b7d7df0abdc7e0f04ba3e74c697619e` |
| [#192](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/192) | OPEN   | enhancement                  | #190 | -                                                                | #191       | #193       | `2026-07-12T08:20:02Z` | `f6dc6393f704e460d96090bf7b52ebb929bee754bd3209eb217416ed2dfe7333` |
| [#193](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/193) | OPEN   | enhancement                  | #190 | -                                                                | #192       | #197, #200 | `2026-07-12T08:20:00Z` | `4e6b0708836e5afa3787c69d4adb2376537d05ea670b432174446fb459003bb9` |
| [#194](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/194) | OPEN   | enhancement                  | #190 | -                                                                | #198       | #196       | `2026-07-12T08:26:20Z` | `595281359d15aabb01eba7246bbfd75cdbdb391eb76686862e434f1f4e4114dd` |
| [#195](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/195) | OPEN   | enhancement                  | #190 | -                                                                | #199       | #196       | `2026-07-12T08:20:43Z` | `b5ded933ac13853e594fe5d051c6c03c83e76e841553ca44293d5114bc7bf03a` |
| [#196](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/196) | OPEN   | enhancement                  | #190 | -                                                                | #194, #195 | #200       | `2026-07-12T08:41:16Z` | `4d6b30394c18056f0a029a6a38ac787e681d6b35de10129fc9adc01eb4cae80c` |
| [#197](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/197) | OPEN   | enhancement                  | #190 | -                                                                | #193       | #198, #199 | `2026-07-12T08:32:15Z` | `27365ecb3488293ffef41f0e2b8cb2f9df2cc66a614ce2c603944796c542a2eb` |
| [#198](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/198) | OPEN   | enhancement                  | #190 | -                                                                | #197       | #194       | `2026-07-12T08:41:32Z` | `f4d97c568e9dc0d4576f7bcd5da76e5fc8a69b6640b35af0d8242fcfe185864f` |
| [#199](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/199) | OPEN   | enhancement                  | #190 | -                                                                | #197       | #195       | `2026-07-12T08:18:45Z` | `aad8fdae259f8ccb837e1fbf8c895c98796720dfedacf558927e5b9dc8c8e96e` |
| [#200](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/200) | OPEN   | enhancement                  | #190 | -                                                                | #193, #196 | #201       | `2026-07-12T08:41:19Z` | `94fe3fb959dcfb208014a7cba8fe24e13c251721b5bc0b5f1458e540198e47c1` |
| [#201](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/201) | OPEN   | enhancement                  | #190 | -                                                                | #200       | #190       | `2026-07-12T08:19:13Z` | `8819da48a4bb0f9e5ce8c077122cc74f32b9592f781a3dbf4203023784464241` |

开始时 #165 仍带 `ready-for-agent`，但已关闭；这里只记录，不在 #191 整理旧标签。#165 至 #176 在 GitHub 正式父子关系中没有上级；它们的正文写有 `Parent: #158`。两种事实均保留，不用其中一种覆盖另一种。

## 6. 十二个合并结果

“首个实现时间”取该合并请求 commits 接口返回的最早 committer 时间，不取合并请求创建时间。

| 子任务 | 合并请求                                                       | 首个实现提交与时间                                                  | 创建时间               | 合并时间               | 合并提交                                   |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------- | ---------------------- | ------------------------------------------ |
| #165   | [#177](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/177) | `623e66121ed176201637e0f76e41a8537676697c` / `2026-07-10T04:36:40Z` | `2026-07-10T04:37:49Z` | `2026-07-10T05:12:08Z` | `d2c9760f3c38f84b6cbdc60e0fac8fe9a07a5a18` |
| #166   | [#179](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/179) | `6b42a6c2effedb4f6478c58e6df259b4b39f0dca` / `2026-07-10T08:00:39Z` | `2026-07-10T08:01:50Z` | `2026-07-10T08:05:16Z` | `6e70cc468898e95643660638994fe34ad3cee080` |
| #167   | [#178](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/178) | `7cadcd8e962dd4f267d1181e5e6830ec636db4b5` / `2026-07-10T05:31:29Z` | `2026-07-10T05:33:00Z` | `2026-07-10T07:17:18Z` | `75c131818e6efb0f1e2c499ef438f54e388708eb` |
| #168   | [#180](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/180) | `a28fe8ce0ef23de1b07fbdf12e785b6d8efae8be` / `2026-07-10T10:49:30Z` | `2026-07-10T10:49:57Z` | `2026-07-10T10:54:59Z` | `99cb6457a5e080b9eb2559e226816ec1b9ed7131` |
| #169   | [#182](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/182) | `1b2846e9f32a72f2c1c85bce7d973a34488d649c` / `2026-07-10T14:28:29Z` | `2026-07-10T14:33:18Z` | `2026-07-10T14:35:37Z` | `4eaa7c6ef10284cbc388b833393907d169686a28` |
| #170   | [#183](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/183) | `1f2ae1025c6d27102f2a534963a466776ff1e549` / `2026-07-10T15:24:29Z` | `2026-07-10T15:25:07Z` | `2026-07-10T15:27:22Z` | `04fc3c3b74a21762d5a49973a2ec3da8c4765fb9` |
| #171   | [#181](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/181) | `cec8b2037d0ee55857332d8ed0587d82cd2497ab` / `2026-07-10T12:09:52Z` | `2026-07-10T13:50:55Z` | `2026-07-10T13:54:28Z` | `984c5798adaead6ecc783dad3c8f4b9e7ce98540` |
| #172   | [#185](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/185) | `845c07fa1c75f44ae9b87a6c5cd3490eb21835b3` / `2026-07-11T00:36:15Z` | `2026-07-11T00:36:41Z` | `2026-07-11T06:34:24Z` | `fa6401f8a987a8aa16eb58065cdd27d8ed265a5f` |
| #173   | [#184](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/184) | `9fa9e7889235cb0d2e435540540114e72bd1044d` / `2026-07-10T16:28:32Z` | `2026-07-10T16:29:05Z` | `2026-07-10T23:50:00Z` | `3628d5a65f3e4d2aa2ed1e9051af4465140155ea` |
| #174   | [#186](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/186) | `b6adfb2e3c59bd36588753c043ceee12af2ef232` / `2026-07-11T06:56:45Z` | `2026-07-11T12:05:22Z` | `2026-07-11T12:06:12Z` | `0cfe6fbce22985d10b2fdbb9d333d8df4ee2013a` |
| #175   | [#187](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/187) | `1022213c48d276377aa348eabddc2dbc8c0297d7` / `2026-07-11T12:47:25Z` | `2026-07-11T12:51:43Z` | `2026-07-11T13:18:02Z` | `de4af3cb9abecfedbb2a245c3287d13ad805bd2d` |
| #176   | [#188](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/188) | `d7cd1004b1ce545f6a70faba746c4351df7120e3` / `2026-07-11T13:46:40Z` | `2026-07-11T13:49:37Z` | `2026-07-11T14:24:43Z` | `159d1a9325556352419f197246f87a6d0e71a0c0` |

GitHub 自动关闭关系能直接连接 #165、#166 和 #169-#176。#167 对应 #178、#168 对应 #180，但两张合并请求没有登记为 closing reference；任务分别在 `2026-07-11T14:46:16Z` 和 `2026-07-11T14:46:19Z` 被手动关闭。这里只固定差异，不解释原因。

## 7. PRODUCT、ADR 与决策记录

下表固定设计和任务涉及的通信方式、应用上下文、知识库与会话边界、认证、仓库布局、本地数据边界和模块格式记录。`开工前 blob` 取设计定稿 `2a2009d...`，`审查起点 blob` 取 `504db2d...`。

| 文件                                                          | 开工前 blob                                | 最后修改提交与时间                                                       | 审查起点 blob                              |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------ |
| `workbench/PRODUCT.md`                                        | `a5523854d85bf47b9c2e26e460efdf50069274fb` | `dfecef7025f16adf5130e2fd86206685eda38c03` / `2026-07-06T14:52:04+08:00` | `a5523854d85bf47b9c2e26e460efdf50069274fb` |
| `CONTEXT-MAP.md`                                              | `83f95ca27465eb3124832c59ab68a10f0aab5e10` | `dfecef7025f16adf5130e2fd86206685eda38c03` / `2026-07-06T14:52:04+08:00` | `83f95ca27465eb3124832c59ab68a10f0aab5e10` |
| `workbench/CONTEXT.md`                                        | `3783e07f0d2913959f414410075b24edf8a243f0` | `2d6430727a1d4fe6af523a60e865384ac21ba195` / `2026-07-09T14:41:03+08:00` | `3783e07f0d2913959f414410075b24edf8a243f0` |
| `docs/adr/README.md`                                          | `73052a58520ce988241c5ef64a0bc95059e404a8` | `dfecef7025f16adf5130e2fd86206685eda38c03` / `2026-07-06T14:52:04+08:00` | `73052a58520ce988241c5ef64a0bc95059e404a8` |
| `docs/adr/0003-sse-not-websocket.md`                          | `ca2c0f85c309aa6e5c808b21397be29d7526851a` | `dfecef7025f16adf5130e2fd86206685eda38c03` / `2026-07-06T14:52:04+08:00` | `ca2c0f85c309aa6e5c808b21397be29d7526851a` |
| `docs/adr/0007-kb-context-via-extension-not-prompt.md`        | `dc9e3ddbbbf8887df3dfd04dba4bf0b7cc3ea435` | `dfecef7025f16adf5130e2fd86206685eda38c03` / `2026-07-06T14:52:04+08:00` | `dc9e3ddbbbf8887df3dfd04dba4bf0b7cc3ea435` |
| `docs/adr/0010-pi-agent-npm-dependency-no-fork.md`            | `5a6322fb50c4a981fc51dd32ab85b932051e5bc9` | `dfecef7025f16adf5130e2fd86206685eda38c03` / `2026-07-06T14:52:04+08:00` | `5a6322fb50c4a981fc51dd32ab85b932051e5bc9` |
| `docs/adr/0011-hybrid-knowledge-base-storage.md`              | `121163fe4c03a5ab80cf89b59de6eade21ed5243` | `dfecef7025f16adf5130e2fd86206685eda38c03` / `2026-07-06T14:52:04+08:00` | `121163fe4c03a5ab80cf89b59de6eade21ed5243` |
| `docs/adr/0012-sessions-bound-to-knowledge-base.md`           | `393c94c2b9514561f8b41c1d3a5bd54627b6a508` | `dfecef7025f16adf5130e2fd86206685eda38c03` / `2026-07-06T14:52:04+08:00` | `393c94c2b9514561f8b41c1d3a5bd54627b6a508` |
| `docs/adr/0013-pi-agent-auth-system.md`                       | `0d44767429b4d694762c4b76aaa17a17c76a140b` | `dfecef7025f16adf5130e2fd86206685eda38c03` / `2026-07-06T14:52:04+08:00` | `0d44767429b4d694762c4b76aaa17a17c76a140b` |
| `docs/adr/0016-merge-with-llm-wiki-repo.md`                   | `473727254e4dcffdd49062dd9531209d9dcfc081` | `dfecef7025f16adf5130e2fd86206685eda38c03` / `2026-07-06T14:52:04+08:00` | `473727254e4dcffdd49062dd9531209d9dcfc081` |
| `docs/adr/0020-monorepo-merge.md`                             | `26a65dbbf4f288e503d557852be62ae2d2039648` | `dfecef7025f16adf5130e2fd86206685eda38c03` / `2026-07-06T14:52:04+08:00` | `26a65dbbf4f288e503d557852be62ae2d2039648` |
| `docs/adr/0030-local-first-data-boundaries.md`                | `02829d6176e25ad4d31d30ace5b87d058ead1da5` | `dfecef7025f16adf5130e2fd86206685eda38c03` / `2026-07-06T14:52:04+08:00` | `02829d6176e25ad4d31d30ace5b87d058ead1da5` |
| `docs/adr/0031-monorepo-root-keeps-commonjs-compatibility.md` | `8aa958167e02f3f120d61f29236cfdc921f2bf9b` | `dfecef7025f16adf5130e2fd86206685eda38c03` / `2026-07-06T14:52:04+08:00` | `8aa958167e02f3f120d61f29236cfdc921f2bf9b` |

这些文件从开工前设计定稿到审查起点的 blob 完全相同。因此本组来源中没有实施期间新增或改变的 PRODUCT/ADR 规则；实施期间变化仅为第 4.2 节所列设计修改。当前审查流程本身则由第 4.3 节的后来规格约束，但不反向替换原始承诺。

## 8. GitHub 状态

### 8.1 自动检查与主线保护

| 项目                     | 审查起点状态                              | 结构化来源                                                |
| ------------------------ | ----------------------------------------- | --------------------------------------------------------- |
| Actions workflows        | `0` 个                                    | `GET /repos/sdyckjq-lab/llm-wiki-skill/actions/workflows` |
| 主线版本 check runs      | `0` 个                                    | `GET /repos/.../commits/504db2d.../check-runs`            |
| 主线版本 commit statuses | `0` 个                                    | `GET /repos/.../commits/504db2d.../status`                |
| Actions 总开关           | 已启用，允许全部 actions；未要求 SHA 固定 | `GET /repos/.../actions/permissions`                      |
| workflow 默认权限        | 只读；不能批准合并请求审查                | `GET /repos/.../actions/permissions/workflow`             |
| `main` branch protection | 未启用                                    | `GET /repos/.../branches/main` 与 protection endpoint     |
| Repository rulesets      | `0` 个                                    | `GET /repos/.../rulesets`                                 |
| 必过检查                 | `0` 个                                    | branch protection 返回的 checks 与 contexts 均为空        |

### 8.2 执行权限

采集主体是 GitHub 账户 `sdyckjq-lab`，在 `2026-07-12T09:26:09Z` 通过 collaborators permission 接口复核为 `admin`，同时具有 `maintain`、`push`、`triage` 和 `pull`。权限接口可以读取仓库设置、主线保护、rulesets、任务父子和等待关系；主线 protection endpoint 返回的是“未保护”而不是权限拒绝。这固定了审查开始时具备维护任务关系、标签、自动检查和主线保护的权限状态，不代表这些动作已在 #191 执行。

### 8.3 合并前审查意见

12 个合并请求中，#178、#179、#182、#186、#188 各有一次自动审查，共 5 次；其余 7 个没有 GitHub review。开始时共有 6 条逐行讨论，全部 `isResolved=false` 且 `isOutdated=false`：

| 合并请求 | 审查提交与时间                                                      | 讨论入口                                                                                                | 开始时状态         |
| -------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------ |
| #178     | `7825decce1560c101992cdf29cd9e43db8333c9e` / `2026-07-10T05:35:46Z` | [discussion_r3556592867](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/178#discussion_r3556592867) | 未标记解决，未过时 |
| #178     | `7825decce1560c101992cdf29cd9e43db8333c9e` / `2026-07-10T05:35:46Z` | [discussion_r3556592869](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/178#discussion_r3556592869) | 未标记解决，未过时 |
| #179     | `778b97614b0ea65c9de1fa6441ca8c72e5f000eb` / `2026-07-10T08:07:18Z` | [discussion_r3557337627](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/179#discussion_r3557337627) | 未标记解决，未过时 |
| #182     | `1b2846e9f32a72f2c1c85bce7d973a34488d649c` / `2026-07-10T14:39:03Z` | [discussion_r3559732657](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/182#discussion_r3559732657) | 未标记解决，未过时 |
| #186     | `ff0196861d1e98022cb852bd853ed8a53c94b40e` / `2026-07-11T12:11:09Z` | [discussion_r3564118234](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/186#discussion_r3564118234) | 未标记解决，未过时 |
| #188     | `1e99ab0b1a955b7feced3db8ed93109e5674c2ec` / `2026-07-11T13:55:14Z` | [discussion_r3564307516](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/188#discussion_r3564307516) | 未标记解决，未过时 |

本文不复制意见正文，不判断意见有效性，也不改变讨论状态；#192 只通过固定链接和审查提交核对。

## 9. 后台请求入口清点

### 9.1 重新计算结果

- 统一 `createApp()` 实际组装：27 个。
- 启动阶段在 `index.ts` 另外挂载：7 个。
- 实际入口总数：34 个。
- `ENDPOINT_REGISTRY`：34 个。
- 按请求方法和地址连接：34 个一一对应，缺失 0、额外 0、重复 0。
- 当前分类：`migrated-json` 23、`sse` 3、`file-download` 1、`legacy` 7。

这些数字由本次重新计算得到，不从审查规格中的旧数字抄录。分类只记录登记现状，不表示实现合格。

### 9.2 完整入口清单

| 编号   | 方法   | 地址                                 | 实际挂载来源 | 登记分类      | 登记安全类型   |
| ------ | ------ | ------------------------------------ | ------------ | ------------- | -------------- |
| EP-001 | GET    | `/api/artifacts`                     | createApp    | migrated-json | read-only      |
| EP-002 | GET    | `/api/artifacts/:id`                 | createApp    | migrated-json | read-only      |
| EP-003 | GET    | `/api/artifacts/:id/files/:filename` | createApp    | file-download | read-only      |
| EP-004 | POST   | `/api/auth/set`                      | startup      | legacy        | state-changing |
| EP-005 | GET    | `/api/auth/status`                   | createApp    | migrated-json | read-only      |
| EP-006 | POST   | `/api/auth/test`                     | startup      | legacy        | state-changing |
| EP-007 | GET    | `/api/commands`                      | startup      | legacy        | read-only      |
| EP-008 | GET    | `/api/config`                        | createApp    | migrated-json | read-only      |
| EP-009 | POST   | `/api/config`                        | createApp    | migrated-json | state-changing |
| EP-010 | GET    | `/api/conversations`                 | createApp    | migrated-json | read-only      |
| EP-011 | POST   | `/api/conversations`                 | createApp    | migrated-json | state-changing |
| EP-012 | POST   | `/api/conversations/new`             | createApp    | migrated-json | state-changing |
| EP-013 | POST   | `/api/echo`                          | startup      | legacy        | read-only      |
| EP-014 | GET    | `/api/events`                        | createApp    | sse           | read-only      |
| EP-015 | GET    | `/api/graph`                         | createApp    | migrated-json | read-only      |
| EP-016 | GET    | `/api/graph/layout`                  | createApp    | migrated-json | read-only      |
| EP-017 | PUT    | `/api/graph/layout`                  | createApp    | migrated-json | state-changing |
| EP-018 | POST   | `/api/graph/rebuild`                 | createApp    | migrated-json | state-changing |
| EP-019 | GET    | `/api/health`                        | createApp    | migrated-json | read-only      |
| EP-020 | DELETE | `/api/knowledge-base`                | createApp    | migrated-json | state-changing |
| EP-021 | GET    | `/api/knowledge-base`                | createApp    | migrated-json | read-only      |
| EP-022 | POST   | `/api/knowledge-base`                | createApp    | migrated-json | state-changing |
| EP-023 | GET    | `/api/knowledge-bases`               | createApp    | migrated-json | read-only      |
| EP-024 | POST   | `/api/knowledge-bases/batch-digest`  | createApp    | sse           | state-changing |
| EP-025 | DELETE | `/api/knowledge-bases/external`      | createApp    | migrated-json | state-changing |
| EP-026 | POST   | `/api/knowledge-bases/external`      | createApp    | migrated-json | state-changing |
| EP-027 | POST   | `/api/knowledge-bases/init-existing` | startup      | legacy        | state-changing |
| EP-028 | POST   | `/api/knowledge-bases/inspect`       | createApp    | migrated-json | read-only      |
| EP-029 | POST   | `/api/knowledge-bases/new`           | startup      | legacy        | state-changing |
| EP-030 | GET    | `/api/models`                        | createApp    | migrated-json | read-only      |
| EP-031 | GET    | `/api/page`                          | createApp    | migrated-json | read-only      |
| EP-032 | POST   | `/api/prompt`                        | createApp    | sse           | state-changing |
| EP-033 | GET    | `/api/refs`                          | createApp    | migrated-json | read-only      |
| EP-034 | POST   | `/api/system/choose-directory`       | startup      | legacy        | state-changing |

### 9.3 可重复完整性检查

入口收集在临时 `HOME` 下执行。以下完整脚本的标准输出就是第 11 节定义的实际入口 TSV：

```js
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { createApp } from "./workbench/server/src/app.ts";
import { ENDPOINT_REGISTRY } from "./packages/workbench-contracts/src/endpoints.ts";

const methods = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
]);
const assembled = createApp({ mode: "test" })
  .routes.filter(
    ({ method, path }) =>
      methods.has(method.toLowerCase()) && path.startsWith("/api/"),
  )
  .map(({ method, path }) => ({ method, path, source: "createApp" }));

const source = await readFile("./workbench/server/src/index.ts", "utf8");
const ast = ts.createSourceFile(
  "index.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const startup = [];
for (const statement of ast.statements) {
  if (
    !ts.isExpressionStatement(statement) ||
    !ts.isCallExpression(statement.expression)
  )
    continue;
  const call = statement.expression;
  if (!ts.isPropertyAccessExpression(call.expression)) continue;
  const receiver = call.expression.expression;
  const method = call.expression.name.text;
  const path = call.arguments[0];
  if (
    !ts.isIdentifier(receiver) ||
    receiver.text !== "app" ||
    !methods.has(method) ||
    !ts.isStringLiteral(path) ||
    !path.text.startsWith("/api/")
  )
    continue;
  startup.push({
    method: method.toUpperCase(),
    path: path.text,
    source: "startup",
  });
}

const registry = new Map(
  ENDPOINT_REGISTRY.map((entry) => [`${entry.method} ${entry.path}`, entry]),
);
const actual = [...assembled, ...startup].sort(
  (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
);
const seen = new Set();
const duplicates = [];
const rows = actual.map((entry, index) => {
  const key = `${entry.method} ${entry.path}`;
  if (seen.has(key)) duplicates.push(key);
  seen.add(key);
  const registered = registry.get(key);
  return {
    id: `EP-${String(index + 1).padStart(3, "0")}`,
    ...entry,
    kind: registered?.kind ?? "UNREGISTERED",
    safety: registered?.safety ?? "UNREGISTERED",
  };
});
const missing = ENDPOINT_REGISTRY.filter(
  (entry) => !seen.has(`${entry.method} ${entry.path}`),
);
const extra = actual.filter(
  (entry) => !registry.has(`${entry.method} ${entry.path}`),
);
if (missing.length || extra.length || duplicates.length)
  throw new Error(JSON.stringify({ missing, extra, duplicates }, null, 2));
console.log(
  [
    "id\tmethod\tpath\tsource\tkind\tsafety",
    ...rows.map((row) =>
      [row.id, row.method, row.path, row.source, row.kind, row.safety].join(
        "\t",
      ),
    ),
  ].join("\n"),
);
```

把上面的脚本保存到临时文件 `endpoint-collector.mjs` 后，从仓库根执行：

```bash
tmp_home=$(mktemp -d)
trap 'rm -rf "$tmp_home"' EXIT
env -i HOME="$tmp_home" PATH="$PATH" NODE_ENV=test \
  node --import tsx endpoint-collector.mjs > /tmp/issue-191-endpoints.tsv
shasum -a 256 /tmp/issue-191-endpoints.tsv
```

`env -i` 会先清空包括模型密钥和外部配置在内的全部继承环境，再只加入命令中列出的三个基础变量。收集器没有启动端口、bootstrap、watcher、模型或外部进程。

## 10. 留给 #192 的只读线索

以下只表示 #192 需要核对，不是问题结论：

- 7 个实际入口在登记表中仍标为 `legacy`。
- 7 个实际入口由启动文件另外挂载，不在统一组装结果内。
- 6 条合并前逐行讨论在 GitHub 中仍未标记解决。
- #167、#168 与对应合并请求没有 GitHub closing reference，且在全部 12 个合并完成后被手动关闭。
- #165 已关闭但仍带 `ready-for-agent`；#165 至 #176 没有正式父级关系，只有正文中的 `Parent: #158`。
- 审查起点没有 GitHub 自动检查记录、主线保护或 ruleset。
- 实施期间设计文件发生过第 4.2 节固定的一次变化。

## 11. 完整性校验值

所有校验均为 SHA-256。任务状态、合并结果、审查讨论和入口清单的完整规范化内容已经逐行保存在本文对应表格中；重算时去掉 Markdown 链接和反引号、去掉任务号的 `#`、把 `-` 还原为空字段、列表去空格后按数字排序，并使用下表给出的表头和字段顺序。正文版本索引则直接使用附录 A 的四列。

这些是已保存表格的校验值，不要求未来变化后的 GitHub 当前状态再次返回同样结果。第 3.1 节查询用于取得和核对不可变正文快照及永久记录；动态状态以本文固定表格为准。

所有清单都包含一行下表所示字段名的 TSV 表头和末尾换行：

| 清单                 | 规范化内容                                                                                                                                                         | SHA-256                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 25 张任务状态表      | `issue<TAB>state<TAB>labels<TAB>parent<TAB>subissues<TAB>blocked_by<TAB>blocking<TAB>updated_at<TAB>body_sha256`；按任务排序，列表字段数字排序且逗号连接，末尾换行 | `338930e77d9e04423bcbaf9e34b81a56d2b01e23c77ac069feb8196cfd732e0e` |
| 正文版本索引         | `issue<TAB>snapshot-id<TAB>edited-at<TAB>body-sha256`，按任务和时间排序，末尾换行                                                                                  | `221dff86f2513bfadbacf0657035d8fd6503fc10a0e32d36e6b6a032ab3b09eb` |
| 12 个合并结果        | `issue<TAB>pr<TAB>first_commit<TAB>first_commit_time<TAB>created_at<TAB>merged_at<TAB>merge_commit`；按子任务排序，末尾换行                                        | `7057e378ce13fe1d48340b25994d91a3d18829951df095b1050fb6f095e370bc` |
| 审查与讨论状态       | `pr<TAB>review_commit<TAB>review_time<TAB>discussion_url<TAB>is_resolved<TAB>is_outdated`；按 PR 和 URL 排序，末尾换行                                             | `e940cdd88c47530aeb0b43b011df3a37cba4804f7e14bb7b99e4e742a1c611ed` |
| PRODUCT/ADR/决策清单 | `path<TAB>git-blob<TAB>last-commit<TAB>time<TAB>baseline-blob`，末尾换行                                                                                           | `67a92b2fd8de0be931d66a7ca7908f41eea2b47a391542be76f5e955a726c771` |
| 实际入口清单         | `id<TAB>method<TAB>path<TAB>source<TAB>kind<TAB>safety`，含表头和末尾换行                                                                                          | `1c3a465e49fab9b47d90dc37048ce1346ed46a822f2dbd2ad41bfa0633b172be` |
| `ENDPOINT_REGISTRY`  | `method<TAB>path<TAB>kind<TAB>safety`，表头后按完整行排序                                                                                                          | `ccf75c1ec9b24b60a3f78e256f050306030fb4c419af37893b083b62cd81e90a` |

GitHub 状态会在 #191 收口时按计划改变，因此未来直接查询“当前状态”不会与本快照相同。可重复核对的方式是用上述任务正文快照 ID、Git 提交/blob、合并请求/讨论永久链接和规范化口径重建审查起点，而不是期待后来状态保持不变。

## 12. #191 验证记录

最终验证均在临时 `HOME` 和 `env -i` 最小环境中执行，没有模型密钥或外部配置，没有真实模型请求：

| 检查               | 结果                                                                           |
| ------------------ | ------------------------------------------------------------------------------ |
| Markdown 格式      | Prettier 检查通过                                                              |
| 文档结构           | 代码围栏成对、末尾换行和链接结构检查通过                                       |
| 隐私与密钥扫描     | 新文档没有本机路径、用户名、凭证或私有素材；仓库规定扫描只命中原有检查说明文字 |
| 入口完整性         | 34 行与运行组装、启动挂载和登记表逐项一致；校验值重算一致                      |
| 任务正文完整性     | 25 张任务当前正文和 55 个正文快照逐项核对通过                                  |
| 文档来源完整性     | 14 份 PRODUCT、ADR 和决策记录逐项核对通过                                      |
| 工作台边界         | 静态检查通过；边界测试 6/6 通过                                                |
| 全仓类型检查       | 通过                                                                           |
| contracts 测试     | 46/46 通过                                                                     |
| graph-engine 测试  | 759/759 通过                                                                   |
| 后台测试           | 140/140 通过                                                                   |
| 前台 lint          | 通过                                                                           |
| 前台单元测试       | 179/179 通过                                                                   |
| 前台 DOM 测试      | 108/108 通过                                                                   |
| `git diff --check` | 通过                                                                           |

`visual:paper` 是已知不可移植的本机视觉回归，本任务也没有修改界面或程序，因此按任务约定不强行运行。

## 附录 A：任务正文修改记录

每行依次为任务、快照时间、GitHub 正文快照 ID、完整正文 SHA-256。`created-body` 表示 GitHub 没有编辑记录，使用创建时正文。

```text
158  2026-07-09T12:44:31Z  UCE_lAHOR6FKkM8AAAABIN0SO87N3gU-  130872fd7e87a7545bba58d6411014892ee8b59286d5a8d3e87f02ee4002dadc
158  2026-07-11T14:46:41Z  UCE_lAHOR6FKkM8AAAABIN0SO87N3gVA  3875462117f6d863cad96f8c82ba91a91521120b41f6f47ebaa10e83bf1c0dc6
165  2026-07-10T03:08:53Z  UCE_lAHOR6FKkM8AAAABIS5nd87NZVTu  37590de5605169637c8650fe69b34e868f387104192ab306564615b5c5dcabdb
165  2026-07-10T03:18:29Z  UCE_lAHOR6FKkM8AAAABIS5nd87NZVTv  7a44e45f82da36090652f5dffd897186684c09f6138a6f6a6b6b6932aa2a6102
165  2026-07-10T03:28:26Z  UCE_lAHOR6FKkM8AAAABIS5nd87NZdIC  c7d261ff227eea273e690ddad54e5a2a9fa6b4b145c4ec1870c3c85c655b7dc7
166  2026-07-10T03:08:55Z  UCE_lAHOR6FKkM8AAAABIS5oGs7NZdLN  05d3f91b5e58c18dcb785719a7c00630713f5042a81a83869b3c3bf262548395
166  2026-07-10T03:28:30Z  UCE_lAHOR6FKkM8AAAABIS5oGs7NZdLO  00f7fbb2b8f0c6bed980abeb6d7eb851e133aaef6bc0149597471bd549478e49
167  2026-07-10T03:08:58Z  UCE_lAHOR6FKkM8AAAABIS5ouM7NZdKA  7063c1c5e566f97b990544e0782f2ba3c640a566b82e12ddc0f28167fdb8cb48
167  2026-07-10T03:28:28Z  UCE_lAHOR6FKkM8AAAABIS5ouM7NZdKB  f4a06dffdd8e906d7c00d40b0c2dc08e930077421992802c025e78e1730d7eab
168  2026-07-10T03:10:00Z  created-body  8cc885143efebb57ddd5034b1be0726c48d7e9a4022b6ac64219e688acd19d0e
169  2026-07-10T03:10:02Z  UCE_lAHOR6FKkM8AAAABIS58687NZdND  699d298867138addf6c49f74425c54c8261bae7fefbdd11106e2ee0de25e9d64
169  2026-07-10T03:28:32Z  UCE_lAHOR6FKkM8AAAABIS58687NZdNE  b4aba0e93948af06c0dd25404db4c17c09e96f9a5ce18107be76e47ff138112b
170  2026-07-10T03:10:05Z  UCE_lAHOR6FKkM8AAAABIS59i87NZdOd  71acb0f5a0e23e6e369b44c570cddf92979281573b5b56d64bf88d4299211003
170  2026-07-10T03:28:34Z  UCE_lAHOR6FKkM8AAAABIS59i87NZdOe  a8271f0ded269db2969b4d312617577cb1466ba5e7308cea5dfbd39a7664d159
171  2026-07-10T03:10:07Z  UCE_lAHOR6FKkM8AAAABIS5-DM7NZOaJ  e50550901d7408da755003dda1444995d791122f5f657509108246ed25f31e50
171  2026-07-10T03:10:27Z  UCE_lAHOR6FKkM8AAAABIS5-DM7NZOaK  db401479154227072f3c5450405efc03fd300ce1accff1f4693e52018ef291a4
172  2026-07-10T03:10:57Z  UCE_lAHOR6FKkM8AAAABIS6NQ87NZdQT  e9a788fa6de5af443b0202d541c3aacfeee70eeda6f09f14e62f4d7c3f67255d
172  2026-07-10T03:28:37Z  UCE_lAHOR6FKkM8AAAABIS6NQ87NZdQU  8cad184b3099e9df409a89d7da887a25e600e22c05d61bc4fae2d19eccd7c49f
173  2026-07-10T03:11:01Z  created-body  79e73d7454bdb1cfc361bf3ab1f9610c05a23fcf8cd079a8be7f236601aedefc
174  2026-07-10T03:11:03Z  UCE_lAHOR6FKkM8AAAABIS6O087NZUeO  74c66b7fd625d0a28c81982fe9777ba81430b4480ef31a646b1b650fc027d328
174  2026-07-10T03:17:27Z  UCE_lAHOR6FKkM8AAAABIS6O087NZUeQ  4410c3791840f0c7a4e96d582d76e351ae77491961bbf1c2a57a87b34fc01928
175  2026-07-10T03:11:05Z  UCE_lAHOR6FKkM8AAAABIS6Pes7NZUf9  1b0b180a4b68c279d5c1da5ac8ee557da2d148d5429e466efc7a1b0a76b51614
175  2026-07-10T03:17:29Z  UCE_lAHOR6FKkM8AAAABIS6Pes7NZUf-  44c29c628eec2c988fc671b1cd66aa326e2b55d1e5e060a6743ceb760e125bc9
176  2026-07-10T03:11:21Z  created-body  913e93b2311fc632c7f5143fb9fb2bfb1cd9c9e0181bf1b469ef5d41c11913ed
190  2026-07-11T15:54:05Z  UCE_lAHOR6FKkM8AAAABIdv7u87N4Jmx  ec9d99c49e4c54678b0852c0e1f8af24a562de166c741ea3229e1976b0decf00
190  2026-07-11T15:54:27Z  UCE_lAHOR6FKkM8AAAABIdv7u87N4Jmy  060cea8300e54763fc0a7f20a26a26e8be63becd2ba4e03cbc3e01b0f9386853
190  2026-07-12T07:28:21Z  UCE_lAHOR6FKkM8AAAABIdv7u87N_7XM  aa045aba17bd43f40cf6ae81482fac5a4e2f0e723ac16a26842c0ab8f03c0e12
190  2026-07-12T07:32:11Z  UCE_lAHOR6FKkM8AAAABIdv7u87N_9T2  135ec84301dd4482397b0a165a9d0fb92a3b31d1384bf8a5034093ad0ebb230a
190  2026-07-12T08:21:06Z  UCE_lAHOR6FKkM8AAAABIdv7u87OAXD-  c8aaaf91872190a626735f0bd37c9de9412493e11369ee1f8233bd96418563a0
190  2026-07-12T08:42:56Z  UCE_lAHOR6FKkM8AAAABIdv7u87OAiMV  0b49f93071b877908a12ba427613e1e9be4ae8380e7f4333657fbf36d309ad40
190  2026-07-12T08:53:19Z  UCE_lAHOR6FKkM8AAAABIdv7u87OAn22  abfa8df3bd2a60e5e4657369caafca0c99c75906ce5893f683c48bc9b12d24f7
191  2026-07-12T07:26:11Z  UCE_lAHOR6FKkM8AAAABIgcBYM7OAWlW  b83c2ace8b533d901323b3a216b25fdda0ca0a9067759b35bab6feacfc583b8f
191  2026-07-12T08:20:05Z  UCE_lAHOR6FKkM8AAAABIgcBYM7OAWlX  65df7e8acaef05b1dec66380f42ec208632a97608bc9d9c101d8e1c552db8060
191  2026-07-12T08:54:58Z  UCE_lAHOR6FKkM8AAAABIgcBYM7OAoxE  0f0f70b8ee769d7ce276a3f9f09e7c437b7d7df0abdc7e0f04ba3e74c697619e
192  2026-07-12T07:26:24Z  UCE_lAHOR6FKkM8AAAABIgcDbc7OAWkC  0dbeb66f7b1c8aecb2de3224baafd6175332ced08f92d1944e384320c1bea433
192  2026-07-12T08:20:02Z  UCE_lAHOR6FKkM8AAAABIgcDbc7OAWkD  f6dc6393f704e460d96090bf7b52ebb929bee754bd3209eb217416ed2dfe7333
193  2026-07-12T07:26:37Z  UCE_lAHOR6FKkM8AAAABIgcFj87OAWjE  0bc8190c1e04060ab2567dc597f0bef7ed49a68533c2a3ab352cc0df4d1caca1
193  2026-07-12T08:20:00Z  UCE_lAHOR6FKkM8AAAABIgcFj87OAWjF  4e6b0708836e5afa3787c69d4adb2376537d05ea670b432174446fb459003bb9
194  2026-07-12T07:27:04Z  UCE_lAHOR6FKkM8AAAABIgcKBs7OAW3B  0843ad9b3561ebfb6180cc5ed454765bc6ee80f0e23f335366ec06bbd2e6d83e
194  2026-07-12T08:20:41Z  UCE_lAHOR6FKkM8AAAABIgcKBs7OAW3D  ad37df5726886e100014457d1f3bd5a98e4d941b67bfd74d66dbed938525ee63
194  2026-07-12T08:26:20Z  UCE_lAHOR6FKkM8AAAABIgcKBs7OAZvy  595281359d15aabb01eba7246bbfd75cdbdb391eb76686862e434f1f4e4114dd
195  2026-07-12T07:27:06Z  UCE_lAHOR6FKkM8AAAABIgcKYc7OAW4L  c83a8e6f82042e0f931d5ed11005d075081b552042d0805a4ca766b9e1956e55
195  2026-07-12T08:20:43Z  UCE_lAHOR6FKkM8AAAABIgcKYc7OAW4M  b5ded933ac13853e594fe5d051c6c03c83e76e841553ca44293d5114bc7bf03a
196  2026-07-12T07:27:17Z  UCE_lAHOR6FKkM8AAAABIgcMZ87OAW5K  881df7a5b595aed8d9fb985e4b83cba1c3ab132432062ac7af28ec57158a15dd
196  2026-07-12T08:20:45Z  UCE_lAHOR6FKkM8AAAABIgcMZ87OAW5L  cfac712ddbfbfe3068543e288dbf9c7cfaee5dafa4a27554f1044e324edf29e2
196  2026-07-12T08:41:16Z  UCE_lAHOR6FKkM8AAAABIgcMZ87OAhTF  4d6b30394c18056f0a029a6a38ac787e681d6b35de10129fc9adc01eb4cae80c
197  2026-07-12T08:18:11Z  UCE_lAHOR6FKkM8AAAABIgk5iM7OAc23  1bd5e7db64cfaab82b6df936660bb5cfef28996b80da78c3aff00c58f4e0c7e6
197  2026-07-12T08:32:15Z  UCE_lAHOR6FKkM8AAAABIgk5iM7OAc24  27365ecb3488293ffef41f0e2b8cb2f9df2cc66a614ce2c603944796c542a2eb
198  2026-07-12T08:18:13Z  UCE_lAHOR6FKkM8AAAABIgk54s7OAZul  267361dcdc2000c3a59f7c92c44a81aa14f9d899918f237d52d2bacddbd170dd
198  2026-07-12T08:26:18Z  UCE_lAHOR6FKkM8AAAABIgk54s7OAZun  1ed3ddd299644a8e8ef1dcb1e062760c5d16a84884d6b08be2ed031fd99a849f
198  2026-07-12T08:41:32Z  UCE_lAHOR6FKkM8AAAABIgk54s7OAhb5  f4d97c568e9dc0d4576f7bcd5da76e5fc8a69b6640b35af0d8242fcfe185864f
199  2026-07-12T08:18:45Z  created-body  aad8fdae259f8ccb837e1fbf8c895c98796720dfedacf558927e5b9dc8c8e96e
200  2026-07-12T08:18:47Z  UCE_lAHOR6FKkM8AAAABIgk_t87OAhUX  274f33ea9ed01d5b9be1114376085a71d513f10ac0c9493127c60402a175d3ad
200  2026-07-12T08:41:19Z  UCE_lAHOR6FKkM8AAAABIgk_t87OAhUZ  94fe3fb959dcfb208014a7cba8fe24e13c251721b5bc0b5f1458e540198e47c1
201  2026-07-12T08:19:13Z  created-body  8819da48a4bb0f9e5ce8c077122cc74f32b9592f781a3dbf4203023784464241
```

对于 #165 至 #176，首个实现时间都晚于附录中该任务最后一个正文快照，因此表中最后一个快照就是各任务相关实现开始前的最后正文版本。#158 的原始正文快照为 `2026-07-09T12:44:31Z`；`2026-07-11T14:46:41Z` 的快照是实施完成后勾选验收项并追加完成状态的后来版本，两者分开保留。
