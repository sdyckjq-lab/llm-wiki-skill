# pi-agent 作为 npm 依赖，不 fork、不 clone 源码

- npm 依赖是现代 JS 项目用第三方库的标准方式，"不造轮子"正解
- fork 会导致上游更新无法 merge，维护噩梦
- submodule 对新手是地狱级体验，没有任何收益
- 极端情况需要 patch 时用 `patch-package`，保持升级路径干净
