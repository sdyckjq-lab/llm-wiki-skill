# #158 工作台 HTTP 与路由契约完工审查与收口

Parent: https://github.com/sdyckjq-lab/llm-wiki-skill/issues/158

GitHub Issue: https://github.com/sdyckjq-lab/llm-wiki-skill/issues/190

## Problem Statement

#158 和关联的 12 个子任务已经关闭，对应改动也已合入主线，但“任务关闭”和“改动合并”本身不能证明原设计已经完整落实。

目前的证据散落在父任务、子任务、合并说明、设计文档和代码中。父任务与多数子任务曾被编辑，父任务还在实施完成后勾选了验收项；设计文档也在实施期间修改过一次。如果直接使用现在看到的文字审查，就可能出现“先得到结果，再修改标准来适配结果”的情况。

已有线索还包括：当前登记了 34 个工作台请求入口，其中 7 个仍使用旧规则；若干合并前审查意见没有明确处理；后台启动和请求处理的分离程度可能与原承诺不一致；仓库尚未建立 GitHub 自动检查和主线保护。这些都只是审查入口，不能提前当成结论。

项目需要的不是一份只列问题的报告，而是一套完整收口流程：固定原始承诺和当前结果，完成只读审查，登记并修复确认的问题，建立长期防线，再用同一个最终版本完成本地、浏览器、真实启动、真实模型和 GitHub 复验。只有所有硬条件满足后，#158 才能关闭。

## Completion Standard

本规格有两个不同的“完成”定义：

1. **当前规格分支完成**：只更新并发布本文档、独立待办和任务关系；允许给 #158 追加当前审查说明并标明等待 #190，但不执行审查、不修改工作台、不改变主线保护、不改写旧任务正文或勾选，也不关闭任何审查对象。
2. **#190 执行完成**：五个阶段全部通过，确认的问题已经分批修复，最终候选版本的全部证据齐全，#158 和 12 个子任务的记录完成收口。

#190 是统筹任务，不是一张实现票，也不对应一个包含全部改动的大分支或大合并请求。它只记录阶段、关卡、关联问题、正式报告和最终结论。

## Solution

把 #190 明确为五阶段的审查与修复总任务。每一阶段都有固定输入、允许动作、必须产物和退出关卡；前一阶段不过，不能进入下一阶段。

```text
规格分支（仅文档）
        |
        v
+-----------------------------+
| 1. 冻结基线 + 只读审查      |
| 产物：不可改写的初次报告    |
+-------------+---------------+
              | 初次报告完整并冻结
              v
+-----------------------------+
| 2. 问题分流 + GitHub 整理   |
| 产物：每个发现都有处理去向  |
+-------------+---------------+
              | 所有发现已登记
              v
+-----------------------------+
| 3. 自动检查 + 浏览器地基    |
| 产物：两项必过检查和主线保护|
+-------------+---------------+
              | 通用防线已生效
              v
+-----------------------------+
| 4. 独立分支逐项修复          |
| 产物：修复 + 专门防退化检查 |
+-------------+---------------+
              | 所有阻塞项已解决
              v
+-----------------------------+
| 5. 同版本最终复验 + 收口    |
| 产物：最终报告并关闭 #158   |
+-----------------------------+
```

## Phase Gates

### Phase 1: 冻结基线与只读审查

**开始条件**

- 本规格已经合入主线；合入前 #191 不得标为 `ready-for-agent`。
- 记录审查开始时的主线完整版本号、时间、Node 版本和操作系统。
- 重新确认执行者仍有 GitHub 管理权限，可以维护父子关系、任务状态、自动检查和主线保护。
- 固定原始设计、父任务、12 个子任务、12 个合并请求、开工时被引用的 PRODUCT/ADR、当前产品约定和相关决策记录。

**允许动作**

- 读取历史、代码、测试、任务修改记录和 GitHub 设置。
- 在隔离环境中运行不会改变仓库和任务状态的验证。
- 在冻结初次报告前完成一次只读入口清点，把实际运行入口、启动阶段另外挂载的入口和官方登记逐项对齐；此处只固定现状，不修入口。
- 所有自动或半自动验证只传入明确允许的基础环境变量，主动清除模型密钥和外部配置。
- 在仓库外保存受限的敏感安全证据。
- 在独立审查文档分支中创建并提交初次报告；“只读”针对产品代码、原任务正文和 GitHub 状态，不禁止写审查产物。

**禁止动作**

- 不修代码，不改验收标准，不勾选旧任务清单，不关闭审查意见。
- 不把严重安全问题的完整复现步骤写进公开分支、公开任务或公开日志。

**必须产物**

- `docs/audits/issue-158-baseline.md`：带版本、时间和校验结果的正式基线记录，包含来源版本、GitHub 状态和只读入口清点结果；#190 永久记录其固定提交和入口。
- `docs/audits/issue-158-initial-audit.md`：不可改写的初次审查报告，包含逐条证据矩阵、全部实际请求入口、设计变更、合并前审查意见和初次结论。
- 每条要求和入口都有稳定编号；每个结论都有适合该要求的证据，或明确标为暂时无法验证。
- 安全问题在公开报告中只使用匿名证据编号，完整材料留在仓库外。

**退出关卡**

- 原始范围和只读清点得到的全部入口均已追踪；初次报告的固定提交和校验结果已经登记，后续只能引用，不能把“未落实”直接改成“已落实”。
- 所有发现已分级并标明是否阻止关闭，即使尚未修复也不能漏项。

### Phase 2: 问题分流与 GitHub 整理

**允许动作**

- 原子任务原本承诺却未完成时，重新打开对应的 #165 至 #176。
- 审查中新发现的问题，新建任务并关联 #158 和 #190。
- 建立 #165 至 #176 与 #158 的正式父子关系，清理与当前状态矛盾的标签。
- 给 #158 追加带日期的当前审查说明并建立 `#158 blocked by #190`，不改写旧正文或旧勾选。
- 任何会修改代码或 GitHub 设置的工作，必须先建立独立关联任务；#190 不能直接作为代码分支或合并请求的实现票。

**记录规则**

- 不修改子任务原来的验收勾选框；在任务下追加带日期、审查版本、稳定编号和报告入口的新记录。
- GitHub 任务只放简明结论和正式报告入口，不复制完整证据。
- 严重安全问题的公开任务只描述影响和安全处理状态，不公开可直接利用的细节。
- 每个获准保留的旧入口例外都必须有稳定编号、明确的不阻塞理由，以及关联的后续任务或“永久保留”批准记录。
- 每个发现必须归入四类之一：阻止基础检查建立、基础检查生效后修复、非阻塞后续、用户明确永久接受。前两类中新建的修复任务成为 #190 的正式子任务；重新打开的 #165 至 #176 作为 #158 的原子任务。两者都必须真实阻止对应后续任务；非阻塞后续只普通关联。
- 阻止基础检查建立的问题先修，并阻塞受影响的地基任务和 #196；其他阻塞修复必须等待 #196 生效后再开始，并全部阻塞 #200。
- 任何晚发现的重要问题都重新打开 #193 并立即阻塞 #200；若影响程序、配置或检查方式，已经固定的最终候选同时失效。
- `ready-for-agent` 只放在当前没有未完成前置项的任务上；任务完成后由 #190 把标签交给全部新进入可执行状态的下一任务。

**退出关卡**

- 每个初次发现都有唯一处理去向、严重程度、是否阻塞、是否妨碍基础检查、关联任务和预期验证。
- #200 已被 #193、#196 和全部阻止关闭的修复任务共同阻塞；重新打开 #193 会自动停止最终验收。
- #190 页面能够直接看见五阶段状态，但不承载具体修复实现。

### Phase 3: 建立自动检查、浏览器地基和主线保护

**实施顺序**

1. #197 建立真实启动、重启和隔离地基；#198 建立运行时入口与官方清单的长期一致性检查；#199 在 #197 上建立真实前后台浏览器地基。
2. #194 把 #197、#198 和现有项目检查组合成 `quality-and-tests`；#195 在 #199 上建立七类用户旅程并产生 `browser-main-flows`。
3. 所有“阻止基础检查建立”的问题先用独立任务修复；地基任务本身不顺手修产品问题。
4. 两项检查在主线成功产生记录后，由 #196 启用主线保护并把它们设为必过。
5. #196 只验收当时已经存在的成功记录和生效规则；真实拦截证据由第一张修复请求取得。若没有修复，#200 自己创建一张只追加候选版本验收证据的文档请求取得该证据；这不是由 #201 封存和发布的最终报告请求。

**防止修复被锁死**

- Phase 3 先保护现有稳定检查、真实浏览器框架和通用安全规则。
- 已知问题的专门防退化检查与该问题的修复放在同一个合并请求中，不把所有必然失败的检查提前设为必过。
- 当前已知旧入口可以作为带稳定编号和处理任务的临时例外进入地基检查，但例外不能增加；最终关闭前，未获用户明确批准的例外必须归零。
- 不允许为了让基线变绿而把错误行为写成正确预期；初次报告继续保留该缺口，直到对应修复和专门检查一起合入。

**退出关卡**

- 两项检查都能在 Linux 干净环境中从零安装和运行。
- 主线保护配置已经生效，规则明确禁止直接写入主线和未通过检查的合并绕过；#196 不等待未来修复，实际拦截证据作为 #200 的必过条件。
- 正式启动与测试启动共用同一个启动核心；测试替身只存在于测试范围，不进入正式构建，普通启动也没有切换开关。
- 自动检查只传入最小允许环境，主动清除所有模型密钥和外部配置；任何真实外部请求都会失败。
- 浏览器检查连接真实前台、真实 HTTP 和真实后台请求处理，只在外部模型和系统文件夹选择器边界使用测试替身，不拦截并伪造全部 `/api/**`。
- 每项操作、单项检查和整项任务都有明确最长时间；无论成功失败都关闭前台、后台和浏览器并释放端口，不用自动重跑掩盖程序问题。
- 失败时仅上传处理过的日志、截图和操作记录，保存 7 天；成功时不上传这些材料。

### Phase 4: 独立分支逐项修复

**分支规则**

- 只有阻止基础检查建立的问题可以在 #196 前修复，并且必须由 #193 明确分类；其他阻塞修复均被 #196 阻塞。
- 每个已确认问题使用独立且大小合适的任务、分支和合并请求。
- 所有代码和 GitHub 设置改动都从 Phase 2 创建的关联任务开分支；#190 只更新阶段状态、任务链接和结论。
- 同一根因影响多条证据记录时，可以由同一个问题和修复处理，但必须列出全部稳定编号；不能为每一行表格机械创建一个合并请求。
- 每个修复在同一合并请求中加入针对该问题的防退化检查，并通过 Phase 3 的两项必过检查。
- 第一张真实修复请求记录“检查未完成时不能合并、全部通过后才允许合并”的实际结果；后续修复复用这份规则证据。
- 如果修复改变用户行为或新增功能，照常更新 CHANGELOG、README 和版本号；纯审查文档不触发这些更新。

**退出关卡**

- 所有阻塞问题均已合入主线，初次报告中的每个阻塞发现都能对应到处理决定、任务、修复和验证。
- #200 的全部动态阻塞关系已经解除；非阻塞后续不会拖住最终验收。
- 不允许用修改原始设计或旧任务文字代替修复。

### Phase 5: 同版本最终复验与关闭

**最终候选版本**

- 所有修复合入后固定一个 `FINAL_CANDIDATE_SHA`。
- 本地确定性检查、真实启动检查、浏览器主流程、真实模型对话和 GitHub 检查都必须针对这个版本。
- 同时固定验收环境清单：操作系统、Node、依赖锁、浏览器、检查命令、测试数据、GitHub 运行记录与保护规则，以及真实模型的服务商、模型名、时间和实际请求次数。
- 之后只允许增加审查报告和任务记录等不影响程序的证据提交，并保存差异证明；任何程序、配置或检查方式变化都会使候选失效，必须重新验证。

**必须产物**

- `docs/audits/issue-158-closeout.md`：最终关闭报告，按初次报告的稳定编号记录处理决定、修复证据、最终状态和关闭判断。
- 本地与 GitHub 的阶段关卡、最终检查摘要永久进入正式报告；普通日常检查和详细日志按 GitHub 自身期限保留。
- #165 至 #176 追加带日期的最终验收记录，保留原任务正文和原勾选状态。
- #158 更新简明结论、正式报告入口、最终候选版本和关闭依据。
- 若存在无法同时满足的历史要求，执行者必须先用简单语言说明影响和推荐；只有用户可以批准降低原始承诺，决定前不得关闭。
- 所有记录完成后，执行者按 #201、#190、#158 的顺序关闭，并再次核对三者状态和等待关系。
- 若产生私密安全证据，由独立的无敏感细节清理任务跟踪最迟关闭后 30 天的本机删除，不让 #190 长期充当实施票。

**退出关卡**

- 所有阻塞要求为“已落实”或“已接受的等效落实”。
- 两项 GitHub 必过检查成功，主线保护的实际拦截证据成立。
- 最终本机验收、最多一次真正发往模型服务的请求、父子关系和子任务证据全部完成；无法确认请求是否送达时视为额度已使用且不自动重试。
- #200 与 #201 均已完成，初次报告固定版本和校验结果再次确认未被改写。
- 只有满足全部条件，执行者才直接更新并关闭 #158。

## Authority and Baseline

### 原始承诺集合

原始承诺不是一条可以互相覆盖的优先级链，而是以下来源在开工前形成的并集：

- 开工前最后定稿的设计：`2a2009df483adcfcc6925a7f237f029d4645bdbb`。
- #158 与 #165 至 #176 在各自相关实现开始前的最后一个版本。使用 GitHub `userContentEdits` 修改记录和首个相关实现时间固定，不使用事后勾选后的正文。
- 父任务和子任务在该时间点已有的验收要求。
- 开工前已存在且被设计或任务明确引用的 PRODUCT 与 ADR 固定版本；它们属于原始承诺的约束来源。

如果这些来源互相冲突，必须进入设计变更表，不得静默选一个覆盖另一个。能同时满足时取并集；确实不能同时满足时，执行者先采用更保护用户、安全、隐私和数据边界的一边，并用简单语言说明影响和推荐。执行者无权自行降低原始承诺，只有用户留下带日期的明确批准后才能接受取舍；决定前 #158 保持打开。

### 后来规则怎样使用

- 实施期间的设计修改 `631daae48b40eba40f7e3f90299745f7b47318fb` 单独进入设计变更表。
- 开工后新增或改变的 PRODUCT、ADR 和长期产品事实单独标为“当前加严规则”，可以增加更严格的安全、隐私和数据边界要求，也可以帮助判断等效实现，但不能降低或删除原始承诺。
- 合并说明、任务关闭状态、当前代码和已有测试都属于证据，不属于验收标准本身。

### 等效实现

只有同时满足以下条件，才可判为“换一种方式落实”：

- 用户主流程相同或更好。
- 安全、隐私和三类数据边界不降低。
- 稳定错误含义和恢复方式不退化。
- 有适合该要求的自动证据，并能长期防止退化。
- 变更原因和接受判断写入正式报告。

## Evidence Model

### 稳定编号

- 原始要求：`REQ-*`
- 实际请求入口：`EP-*`
- 合并前审查意见：`REV-*`
- 普通发现：`FIND-*`
- 非公开安全证据：`SEC-158-*`

初次报告是初次状态的唯一完整来源；最终报告是处理结果和最终状态的唯一完整来源。父任务、子任务和合并请求只引用稳定编号和报告入口。

### 初次证据矩阵

每一行至少包含：

| 字段 | 内容 |
|---|---|
| 稳定编号 | 不随修复变化的唯一编号 |
| 来源与版本 | 设计、任务修改记录、开工时产品约定、当前加严规则或实际入口 |
| 原始要求 | 开工时必须达到的结果 |
| 是否阻塞关闭 | 是 / 否，并说明依据 |
| 适用证据类型 | 代码、自动测试、请求、浏览器、GitHub 记录或人工操作 |
| 当前结果与证据 | 审查版本上的实际结果 |
| 初次结论 | 五种逐项结论之一 |
| 关联发现 | 普通发现编号或安全证据编号 |

### 五种逐项结论

- **已落实**：原要求和适用证据完整满足。
- **换一种方式落实**：实现不同，但通过等效实现条件。
- **部分落实**：只完成一部分，或证据只覆盖部分路径。
- **未落实**：结果与原要求不符。
- **暂时无法验证**：缺少权限、环境、可重复证据或必要信息。

### 三种总判断

- **可以关闭**：所有阻塞行均为“已落实”或“换一种方式落实”，五阶段关卡全部通过。
- **基本完成但仍有阻塞项**：存在已知且可修复的阻塞问题，但没有证据表明原范围被主动删除或关键风险被接受；#158 保持打开。
- **存在范围缩水或关键风险、不能关闭**：原始承诺被删除或拒绝、严重安全或数据风险仍在，或核心证据确定无法取得；#158 保持打开并需要重新决策。

非阻塞行可以是其他状态，但必须有明确理由和后续任务或永久接受记录。

### 两份正式报告

1. **初次报告**：Phase 1 完成后冻结，不因修复改写；开头先用人话说明总体结论、影响和需要处理的事项，后半部分保留完整证据矩阵。
2. **最终报告**：引用初次报告的稳定编号，开头先用人话说明修了什么、还剩什么和能否关闭，后半部分记录处理决定、修复证据、最终候选版本和最终状态。它在 Phase 2 首次需要记录处理或晚发现事项时创建，期间只追加，Phase 5 完成后封存为 closeout 报告。

Phase 1 之后若发现漏掉的入口或问题，不得回写初次报告。使用新的稳定编号和发现时间追加到最终报告的“晚发现事项”部分，说明为什么初次审查漏掉，并退回 Phase 2 完成问题分流；若它暴露出初次审查方法本身不可靠，重新执行受影响的 Phase 1 检查。

这样可以清楚区分“原本就正确”和“审查后才修好”。

### 敏感安全证据

- 只保存证明问题和修复所必需的最少材料，放在仓库外的 `~/.llm-wiki-audit/158/`；目录权限 0700、文件权限 0600，仅当前账户可读。
- 公开报告只写匿名证据编号、安全影响和处理状态。
- 不主动复制、上传或增加云端副本；每份保留材料记录负责人、创建时间、必要理由和完整性校验值。
- #190 执行者在最终报告中登记“#158 关闭后 30 天”的清理日期，并创建不含敏感内容的独立清理任务。
- 到期后删除本机材料并记录完成时间、档案编号和验证结果；如果系统正常备份不能同步清除，只如实记录它将按系统期限过期，不声称能够立即彻底抹除。

## User Stories

### 审查可信度

1. As a 仓库作者, I want 得到一个普通人能理解的明确结论, so that 我不必阅读代码来猜测 #158 是否完成。
2. As a 审查者, I want 固定开工时设计和任务版本, so that 事后修改不能反向证明已有实现正确。
3. As a 未来维护者, I want 初次报告和最终报告分开, so that 原始遗漏不会被修复后的干净状态覆盖。
4. As a 报告读者, I want 每条要求和实际入口都有稳定编号、证据和结论, so that 每个判断都能重复验证。

### 用户结果与安全

5. As a 工作台用户, I want 选择知识库、切换对话、阅读页面、使用活地图、发送消息和查看产出物不退化, so that 通信重构不会改变使用习惯。
6. As a 多知识库用户, I want 知识库、对话、页面、图谱、消息和产出物不会串数据, so that 当前上下文始终可信。
7. As a 本地工作台用户, I want 服务只接受可信本机来源, so that 陌生网页不能读取内容、修改设置或触发模型。
8. As a 重视隐私的用户, I want 错误、日志和报告不泄露路径、凭证、完整提问、页面正文或内部错误, so that 本地内容得到保护。
9. As a 维护者, I want 知识库数据、应用数据和模型凭证继续彻底分开, so that 审查和修复不改变数据归属。

### 验证与长期保护

10. As a 贡献者, I want 实际后台入口与官方清单自动一一对应, so that 新旧规则和未登记入口不会悄悄出现。
11. As a 工作台用户, I want 自动检查真正启动前后台并操作关键流程, so that “普通检查通过但页面不可用”能够被发现。
12. As a 主线维护者, I want 两项自动检查未通过时不能合并或直接写入主线, so that 这道门长期有效。
13. As a 模型费用承担者, I want 真实模型只在最终本机验收中调用一次, so that 费用、密钥和外部波动不进入线上检查。
14. As a 任务维护者, I want 原任务历史不被事后勾选改写, so that 能区分当时验证与本次补验。
15. As a 父任务维护者, I want 只有所有硬问题和证据都完成后才关闭 #158, so that 关闭状态真正代表完成。

## What Already Exists

| 现有能力 | 当前状态 | 本规格怎样复用 |
|---|---|---|
| `ENDPOINT_REGISTRY` | 已登记 34 个入口，其中 7 个为旧规则 | 继续作为官方清单，并与运行时实际入口自动比对 |
| `createApp(deps).request(...)` | 可在不监听端口、不启动完整后台时验证统一请求处理 | 继续作为请求和错误边界的最高稳定测试入口 |
| 后台分领域 route 与可替换依赖 | 知识库、认证、对话、页面、图谱、产出物和事件流已有基础 | 扩展现有分组，不为每个旧入口新建服务 |
| 合同、后台、前台和图谱测试 | 已有 Node 测试、DOM 测试和大量事件流边界测试 | 复用并补缺，不引入另一套测试框架 |
| Playwright | 前台已有依赖和截图脚本 | 新建独立功能验收；现有全模拟截图脚本只作视觉证据 |
| 工作台边界检查 | 已能阻止部分旧规则重新扩散 | 扩展为运行时入口与官方清单的完整一致性检查 |
| GitHub Actions 和主线保护 | 当前不存在 | 使用 GitHub 原生能力建立，不引入新平台 |

现有 `TODOS.md` 中的图谱阅读和动画事项与 #158 无关，不并入本轮。

## Testing Decisions

### 测试分层

每条要求选择适合它的证据，不强迫所有内容都同时经过代码、请求和页面操作。

```text
原始要求 / 实际入口
        |
        +--> 设计与任务历史：固定版本 + GitHub 修改记录
        |
        +--> 通信与错误规则：contracts + client + createApp request
        |
        +--> 启动与磁盘：一次性干净环境中的真实进程
        |
        +--> 用户主流程：真实前台 + HTTP + 后台 + Playwright
        |
        +--> 外部模型：最终候选上的一次本机真实调用
        |
        +--> 仓库规则：GitHub 检查状态 + 主线保护实际结果
```

### Coverage Map

图例：`已有` 可直接复用，`部分` 需要扩展，`新增` 当前缺失，`人工` 只在最终本机执行。

```text
流程 / 证据                       合同+前台   请求处理   进程+磁盘   浏览器   真实模型
-------------------------------  ----------  ---------  ----------  -------  --------
要求与实际入口双向追踪              新增        新增          -          -        -
知识库完整生命周期                  已有        已有        新增       新增       -
对话切换与隔离                      已有        已有        新增       新增       -
页面与产出物                        已有        已有        新增       新增       -
图谱读取、布局与重建                已有        已有        新增       新增       -
设置、模型和认证状态                已有        已有        新增       新增       -
认证写入与连接测试                  部分        部分        新增       新增       -
Prompt 与工具事件流                 已有        已有        新增       新增      人工
批量消化与图谱事件                  已有        已有        新增       部分       -
本地 API 安全                       已有        已有        新增       新增       -
重启、恢复和数据隔离                  -         部分        新增       新增       -
必过检查与主线保护                    -           -         新增       新增       -
```

### 请求、合同和前台测试

- 对每个真实入口核对请求方式、地址、官方登记、安全分类、前台调用和返回规则。
- 后台运行时实际入口必须与 `ENDPOINT_REGISTRY` 在请求方式和地址上完全一致。统一组装位置之外的当前入口只能作为带稳定编号和处理任务的临时例外，不能增加；最终关闭前未获用户批准的例外必须归零。
- 覆盖错误 JSON、缺字段、字段类型错误、无当前知识库、知识库未登记或失效、路径禁止、来源禁止、访问凭证错误、资源不存在、冲突、不支持平台、任务繁忙和内部错误脱敏。
- Prompt、批量消化和图谱事件覆盖正常完成、取消、断线、无法解析、未知版本、字段缺失、顺序倒退、重复结束、缺少结束和结束后追加事件。
- 所有只读豁免入口都检查实际行为，证明不会写文件、改配置或触发模型；正常工作台可以读取所需内容，但陌生网页不能读取响应内容，响应也不得开放不受信任的跨站读取。

### 真实进程与隔离

- 正式自动验收运行在一次性 Linux 干净环境中，真实知识库、应用数据和模型凭证根本不存在；`HOME` 仍指向临时目录。
- 正式启动与测试启动共用同一个启动核心；测试替身只在测试范围注入，不进入正式构建，普通启动没有测试切换开关。
- 自动进程和它启动的全部子进程只继承最小允许环境，明确清除模型密钥和外部配置；任何真实外部请求都会使检查失败。
- 单独启动真实后台进程，验证只绑定本机地址、启动凭证权限、原子替换、重启换新凭证、启动恢复和不向临时目录之外写入。
- 启动、操作和整项检查都有最长时间；所有退出路径都关闭子进程并释放端口，不用自动重跑掩盖程序问题。
- 本机临时目录测试只作补充，不再用“运行前后没变化”证明没有读取真实资料。

### 浏览器关键旅程

浏览器使用真实前台、真实端口、真实 HTTP/SSE 和共用启动核心的真实后台处理。不得用 Playwright 拦截并伪造全部 `/api/**`；只在后台依赖边界替换真实模型和系统目录选择器，替身不能进入正式构建或普通启动路径。

至少覆盖：

- 知识库：选择、清除和重启恢复，并验证两个临时知识库之间的页面、图谱、消息和产出物不串数据。
- 对话：新建、切换、刷新后保持正确，未发送消息的空对话也不会丢失。
- 页面：读取 wiki 页面和引用，并能从页面不存在的情况恢复。
- 图谱：查看与重建图谱，覆盖繁忙、失败恢复和事件更新。
- 消息：发送可控消息、生成中重复发送、取消、断线恢复和最终稳定状态。
- 产出物：查看、预览和文件下载，并验证不存在资源的可恢复提示。
- 设置与模型：保存设置、读取模型列表和查看脱敏认证状态。

大量错误排列由请求和合同测试完整覆盖，不在浏览器重复所有组合。

### Mac 特有行为

- GitHub 必过检查使用 Linux。
- 系统文件夹选择器的成功、取消和不支持平台通过请求测试覆盖。
- 最终候选版本在本机 Mac 上实际操作一次系统文件夹选择，不在线上自动控制系统窗口。

### 两项 GitHub 必过检查

1. `quality-and-tests`：本机和 GitHub 共用一条统一命令，从干净安装开始运行边界检查及其自测、合同测试、后台测试、前台普通与页面测试、图谱引擎测试、类型检查、前台规范检查和构建。每个独立环境只按确定顺序生成一次共享产物，后续检查复用结果。
2. `browser-main-flows`：安装 Playwright Chromium，启动真实前后台，运行上述七类用户旅程。

两项检查在两个独立干净环境中并行运行；每项都在拉取请求和主线更新时运行，不使用会漏掉工作台影响的路径过滤，权限保持最小。单项与整项均有最长时间，失败时清理全部进程。当前全模拟的 `visual:paper` 继续作为本机视觉回归，不作为真实前后台证据，也不在完成可移植性改造前成为必过项。

### 失败材料与长期记录

- 仅失败时上传使用虚构数据的处理后日志、截图和追踪记录，自动在 7 天后删除。
- 清理访问凭证、私人路径、请求正文和安全复现细节；真实模型与仓库外安全证据永不上传。
- GitHub 日常检查状态和详细日志按平台期限保留。
- 阶段关卡和最终关闭所用检查的版本、名称、时间、结果与 GitHub 入口永久写入正式报告。

### 最终真实模型验收

- 只在所有修复完成后的 `FINAL_CANDIDATE_SHA` 上，最多发出一次真正到当前模型服务的请求；“一次用户消息”不能代替实际请求次数限制。
- 使用临时知识库和无敏感内容的最小问题，从页面发送，收到有效结束事件并显示完整答复，刷新后对话仍存在。
- 开始前再次取得明确授权，只读一次真实 `auth.json`，载入内存认证存储；不复制到磁盘、不写日志、不进报告。
- 验收前后比较原凭证文件的权限和完整性，证明没有修改；进程结束后内存凭证消失。
- 只有能够证明请求未离开本机时才不计入额度；无法确认是否送达或模型已经收到后失败，都视为额度已使用，记录为无法验证且不自动重试，只有用户可以再次授权。

## Failure Modes

| 可能失败 | 预防与验证 | 用户或维护者看到什么 |
|---|---|---|
| 事后文字覆盖开工承诺 | 固定完整版本和任务修改记录 | 报告明确列出原要求与后来变更 |
| 初次发现被修复状态覆盖 | 初次报告与最终报告分开 | 可同时看到“原来怎样”和“后来怎样” |
| 初次报告冻结前漏掉实际入口 | #191 先完成只读入口清点并固定结果 | #192 不接受缺少来源或入口的报告 |
| 实际入口未进入官方清单 | 运行时入口与 registry 自动一一比对 | 检查直接报出多出或缺失的入口 |
| 自动检查提前锁死修复 | 通用检查先必过，问题检查随修复加入 | 每个修复仍可独立合并 |
| 自动验收读取真实资料或环境密钥 | 一次性目录加最小环境白名单，主动清除密钥和外部配置 | 检查失败而不是静默接触用户数据或真实服务 |
| 测试启动与正式启动逐渐漂移 | 两个入口共用启动核心，替身只存在于测试范围 | 浏览器证据始终覆盖正式启动步骤 |
| 浏览器仍在模拟全部后台 | 禁止拦截 `/api/**`，断言真实 HTTP 请求 | 浏览器检查无法伪装成全链路通过 |
| 临时模型替身与真实模型差异 | 最终候选只做一次真实模型主路径 | 最终报告明确真实链路是否成功 |
| 真实模型内部产生多次费用 | 记录实际服务请求次数并硬限制为一次 | 无法确认送达时不自动重试，等待用户决定 |
| 真实模型验收修改凭证 | 内存读取和前后完整性比较 | 任何变化都会阻止关闭 |
| 日志或截图泄露内容 | 虚构数据、清理、仅失败上传、7 天删除 | 敏感材料不会进入公开记录 |
| 前后台或事件流卡住 | 分层时限、所有退出路径清理进程、禁止用重试掩盖 | 检查及时失败并留下已清理证据 |
| 主线保护只写了设置却未生效 | GitHub 规则记录加真实修复任务等待/通过状态 | 合并按钮实际受检查结果控制 |
| 多种验证来自不同版本或环境 | 固定 `FINAL_CANDIDATE_SHA` 和验收环境清单 | 报告拒绝拼接不同版本或未记录条件的成功结果 |
| 历史要求冲突被执行者擅自取舍 | 记录影响，只有用户可以批准降低原承诺 | 决定前 #158 保持打开 |
| 子任务事后勾选改写历史 | 保留原正文，只追加带日期记录 | 能区分原关闭状态与本次补验 |
| 并行修复同时改共享入口文件 | 共享集成通道串行合入 | 冲突在合并前显式处理，不静默覆盖 |
| 私有安全证据损坏、扩散或久留 | 最少留存、权限限制、负责人、校验和关闭后 30 天内删除 | 缺证会阻止安全结论，过期本机材料会清理并如实记录备份限制 |

本规格已经为上述新路径安排验证和明确失败结果，没有“无检查、无错误处理且静默失败”的已知关键缺口。

## Worktree Parallelization

五阶段关卡本身必须顺序推进；地基任务只在不共享写入区域时并行，Phase 4 中互不共享模块的修复可以并行。

| 工作流 | 主要区域 | 依赖 |
|---|---|---|
| 冻结基线与初次报告 | `docs/audits/`、GitHub 只读数据 | 规格合入主线 |
| 问题分流与任务关系 | GitHub Issues | 初次报告 |
| 真实启动与隔离 | `workbench/server/` | 问题分流 |
| 入口一致性 | contracts、server、边界检查 | 真实启动与隔离 |
| 浏览器地基 | `workbench/web/test/`、server 测试边界 | 真实启动与隔离 |
| 统一质量检查 | `.github/`、根命令 | 入口一致性 |
| 七类浏览器主流程 | `workbench/web/test/` | 浏览器地基 |
| 主线保护 | GitHub 设置 | 两项检查和启用保护前修复 |
| 知识库类修复 | contracts、server knowledge-base、web API | 主线保护（启用保护前修复除外） |
| 认证与设置类修复 | server auth/config、web API | 主线保护（启用保护前修复除外） |
| 诊断、命令与系统能力修复 | server routes、web API | 主线保护（启用保护前修复除外） |
| 共享入口集成 | contracts registry、server app/startup、边界检查 | 各领域修复 |
| 最终复验与收口 | `docs/audits/`、GitHub Issues/设置 | 所有修复 |

```text
#191 -> #192 -> #193 -> #197 -> #198 -> #194 --+
                            \-> #199 -> #195 --+-> #196
                                                     |
                                                     +-> repair lanes -> integration
                                                     |
                  #193 + #196 + all blocking repairs -> #200 -> #201 -> #190 -> #158
```

- #197 先固定共享启动核心；随后 #198 与 #199 可以在独立 worktree 并行，#194 与 #195 分别承接它们。
- Phase 3 通过后，知识库、认证设置和其他入口修复可以在独立 worktree 并行。
- 任何同时修改 registry、`createApp`、启动入口或边界检查的工作都进入 Integration，按顺序合入。
- 实际分组以 Phase 2 的确认问题为准；没有独立问题时不为了并行机械拆票。

## Implementation Decisions

- 当前规格分支只交付文档和任务管理同步，不执行 #190 的实际审查、检查建设或修复。
- #190 只统筹；任何代码、测试或 GitHub 设置改动都必须先成为独立关联任务。
- 使用已有 Node 测试、Testing Library、Playwright、GitHub Actions 和 GitHub 主线保护，不引入新测试框架或外部自动检查平台。
- 复用 `createApp(deps)`；不新增生产服务。正式与测试启动共用一个启动核心；测试范围最多增加一个真实进程启动帮助入口和一个浏览器帮助入口，假模型与假选择器不进入正式构建。
- 本机与 GitHub 共用一条完整质量命令；两个 GitHub 检查使用独立干净环境并行，每个环境内部只生成一次共享产物。
- 旧入口是否必须迁移由初次审查逐项裁定，但所有实际入口都必须进入运行时清单比对。原则上它们也必须进入统一组装；只有用户明确批准的辅助入口可以作为永久例外，并且必须有稳定编号、批准记录和专门的边界检查。
- 修复按确认问题分支推进，不能把审查、全部修复、自动检查和关闭操作放进一个合并请求。
- 每个修复先跑针对性验证；全部修复完成后只在最终候选版本上跑一次完整复验和真实模型调用。
- 历史要求冲突不能由执行者自行删减；只有用户可以批准降低原始承诺。
- `ready-for-agent` 随当前可执行边界移动；规格未合入主线前 #191 不可领取。
- 提示文字不要求逐字不变，只要求含义、影响、恢复方式和下一步行动不退化。

## Implementation Tasks

This is the only authoritative execution list. GitHub issue numbers, native parent-child links, and native blocking links carry the live state; #190 only orchestrates them. The current specification branch executes none of these tasks.

- [ ] **[#191](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/191) (P1, human: ~4h / CC: ~45min)** - 固定正式基线并完成冻结前的只读入口清点。
  - Blocked by: reviewed specification merged into main.
  - Verify: versioned baseline, source versions, route census, environment and GitHub state are pinned and linked from #190.
- [ ] **[#192](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/192) (P1, human: ~1d / CC: ~2h)** - 只使用 #191 基线完成并冻结初次审查。
  - Blocked by: #191.
  - Verify: every requirement, runtime endpoint and unresolved review comment appears exactly once with a stable ID, evidence, verdict and blocker status.
- [ ] **[#193](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/193) (P1, human: ~4h / CC: ~45min)** - 分流发现、维护任务关系并区分启用保护前后修复。
  - Blocked by: #192.
  - Verify: every finding has one route; each blocking item is either a new #190 child or a reopened original #158 child, and blocks the correct downstream task.
- [ ] **[#197](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/197) (P1, human: ~1d / CC: ~2h)** - 建立共用启动核心、真实进程隔离和最小环境安全检查。
  - Blocked by: #193.
  - Verify: local-only binding, token permissions and rotation, untrusted-page data isolation, restart, environment scrubbing, disk isolation, timeouts and cleanup all pass.
- [ ] **[#198](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/198) (P1, human: ~1d / CC: ~2h)** - 建立实际入口与官方清单的一致性检查。
  - Blocked by: #197.
  - Verify: runtime-only and registry-only negative controls fail; numbered temporary exceptions cannot grow.
- [ ] **[#199](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/199) (P1, human: ~1d / CC: ~2h)** - 建立真实前后台浏览器测试地基。
  - Blocked by: #197.
  - Verify: real HTTP/SSE runs with test-only model and picker injection, no full API interception, no real keys, bounded cleanup, and no production test toggle.
- [ ] **[#194](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/194) (P1, human: ~1d / CC: ~2h)** - 建立本机与 GitHub 共用的 `quality-and-tests`。
  - Blocked by: #198 and any routed pre-protection blocker that prevents it from passing.
  - Verify: one command runs the complete quality list, prepares shared outputs once, and produces a stable main/PR check.
- [ ] **[#195](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/195) (P1, human: ~2d / CC: ~4h)** - 建立七类真实前后台旅程和 `browser-main-flows`。
  - Blocked by: #199 and any routed pre-protection blocker that prevents it from passing.
  - Verify: knowledge base, conversation, page, graph, prompt, artifact, and settings/model/auth journeys pass with explicit recovery paths.
- [ ] **[#196](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/196) (P1, human: ~4h / CC: ~45min)** - 两项检查在 main 成功后启用主线保护。
  - Blocked by: #194, #195 and all pre-protection repairs.
  - Verify: GitHub reports effective required checks, PR-only updates and no bypass; future repair evidence is not falsely claimed here.
- [ ] **动态阻塞修复 (P1, human / CC: variable)** - #193 只根据确认发现创建大小合适的修复任务。
  - Blocked by: #196, except explicitly classified pre-protection repairs.
  - Verify: each repair includes its targeted regression proof and both required checks; every blocking repair blocks #200.
- [ ] **[#200](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/200) (P1, human: ~1d / CC: ~2h)** - 在同一最终版本和记录环境中完成全部验收。
  - Blocked by: #193, #196 and every blocking repair.
  - Verify: deterministic, process, browser, Mac, one-provider-request, GitHub and issue evidence all name the same final candidate and environment manifest; when no repair PR exists, #200's own evidence-only PR supplies the protection proof before #201 starts.
- [ ] **[#201](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/201) (P1, human: ~4h / CC: ~45min)** - 发布最终报告并完成 #201、#190、#158 的关闭顺序。
  - Blocked by: #200.
  - Verify: the initial report hash is unchanged, every blocking row is accepted or implemented, all issue records are appended, and final states are re-read from GitHub.

```text
spec merge -> #191 -> #192 -> #193 -> #197 -> #198 -> #194 --+
                                           \-> #199 -> #195 --+-> #196
                                                                    |
                                                                    +-> routed repairs
                                                                    |
                       #193 + #196 + all blocking repairs -> #200 -> #201 -> #190 -> #158
```

## Out of Scope

- 不为工作台新增用户可见功能，也不重新设计界面、视觉或操作流程。
- 不重新设计 #158 的通信方案，也不引入 OpenAPI、代码生成、新测试框架或新的自动检查平台。
- 不改变知识库目录、应用数据位置或模型凭证位置。
- 不把审查扩大为整个 monorepo 的全面代码质量检查，也不处理与 #158、安全、数据边界和主要操作无关的历史问题。
- 不处理现有 `TODOS.md` 中的图谱阅读和动画事项。
- 不把真实模型、个人凭证或付费外部服务放进 GitHub 检查，也不测试全部模型提供商。
- 不在线上自动控制 Mac 原生文件夹窗口。
- 不把现有全模拟的 `visual:paper` 当成真实前后台证明；其可移植性改造单独进入 `TODOS.md`。
- 不永久归档每次普通自动检查的详细日志，只永久保存阶段关卡和最终关闭摘要。
- 不新增“每次合并必须由另一位真人批准”的规则。
- 不为了本次验收把全部环境封装成新容器，也不在没有实际耗时数据前增加依赖缓存平台。
- 不新建长期加密档案或备份管理系统；私密安全证据只按最少留存、权限限制和可验证本机删除处理。
- 不在审查规格中预先要求所有只读入口改为携带访问凭证；先验证正常工作台可读、陌生网页不可读和只读无副作用。
- 不公开尚可利用的严重安全复现细节，也不把敏感证据提交到任何分支。
- 不通过修改开工时设计或旧任务正文让当前结果显得合格。

## Further Notes

- 规格编写时的主线审查点是 `159d1a93`；正式执行必须重新记录当时主线完整版本。
- #158 与 9 个子任务存在正文修改记录；父任务在实施完成后追加了勾选与完成说明。GitHub 修改历史可用于恢复开工前版本。
- 当前 `createApp(deps)` 可枚举 27 个已统一组装入口，启动文件另挂 7 个旧入口，总计与 registry 的 34 项相符；最终不能继续依赖人工保持这两边一致。
- 当前账号在规格审查时拥有 GitHub ADMIN 权限，但 Phase 1 仍要重新检查，避免执行时权限已经变化。
- 当前没有 GitHub workflow、主线保护或 ruleset；Phase 3 使用 GitHub 原生能力补齐。
- 6 条未标记解决的合并前审查意见、7 个旧入口、子任务未逐项补证和实施后设计修改都只是审查线索，不是预先认定的问题。
- #158 已正式被 #190 阻塞，并追加了带日期的当前审查说明；旧正文和勾选保持不变。
- 规格合入主线前没有任务带 `ready-for-agent`；合入后先交给 #191，以后由 #190 随当前可执行边界移交。
- Phase 1 后的晚发现事项进入最终报告的追加区并退回 Phase 2，不修改已冻结的初次报告。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---:|---|---|
| CEO Review | `/plan-ceo-review` | Scope and strategy | 0 | Not run | No product direction or user-facing feature change |
| Codex Review | `/codex review` | Independent code review | 0 | Not run | No implementation diff exists |
| Eng Review | `/plan-eng-review` | Architecture and tests | 2 | CLEAR | Current run resolved 14 section findings, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | Not run | No interface redesign is in scope |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | Not run | No separate developer-tooling product change |
| Outside Voice | automatic Codex pass | Independent plan challenge | 2 | RESOLVED | Current pass found 8 issues; all 8 decisions accepted and integrated |

**COMPLETION SUMMARY:**

- Step 0: complete scope retained; oversized tickets were split without reducing #158 closeout coverage.
- Architecture Review: 6 issues found and resolved.
- Code Quality Review: 3 issues found and resolved.
- Test Review: coverage diagram produced; 3 gaps found and resolved.
- Performance Review: 2 issues found and resolved.
- NOT in scope: written and tightened around containers, caching, read-only auth redesign and private-evidence infrastructure.
- What already exists: retained as the reuse source for contracts, `createApp`, Node tests, Playwright and boundary checks.
- TODOS.md updates: 0 new items in this review pass; this specification branch already added one portable Paper visual-regression item and keeps it separate.
- Failure modes: 0 silent critical gaps remain after route census, environment scrubbing, bounded cleanup and final-environment pinning.
- Outside voice: Codex ran; 8 additional findings were individually accepted and integrated.
- Parallelization: startup is sequential first; route and browser foundations then form 2 parallel lanes; 3 independent repair lanes may run after protection.
- Lake Score: 24/24 completeness decisions chose the complete option.

**CODEX:** The second outside pass found pre-freeze route-discovery, inherited-secret, read-only security wording, real-model request-count, shared-startup, conflict-authority, final-environment and private-evidence gaps. All were resolved.

**CROSS-MODEL:** Three tensions were resolved in favor of stricter executable boundaries: scrub environment secrets in addition to temporary HOME, share one startup core while keeping fakes test-only, and simplify private evidence to minimum retention rather than an unverifiable backup-erasure system.

**VERDICT:** ENG CLEARED. The task graph now continues through confirmed repairs, one final candidate, final evidence, #190 close and #158 close; implementation may begin only after this specification merges.

NO UNRESOLVED DECISIONS
