## 开发计划：趋势对比、简单预测、商户归一化

### 目标与范围
- 在不破坏现有体验的前提下，新增三项分析能力：
  1) 趋势对比（同比/环比）
  2) 简单预测（下月的收入/支出/结余）
  3) 商户归一化与合并（同一品牌多门店聚合）

---

### 里程碑拆分
- M1 趋势对比（1.0）
  - 按月对比页支持“同比/环比”对比
  - 图表展示当前与对比序列，显示差值与百分比
- M2 简单预测（1.0）
  - 基于近 N 月（默认 3）移动平均的下月预测
  - 以虚线/透明柱显示，并在图表右侧展示预测值卡片
- M3 商户归一化（1.0）
  - 新增“商户管理”页：正则→标准商户名规则，增删改查
  - 导入后与“重新分类”时应用归一化，UI 明细显示归一化后商户

---

### 详细设计与实施

#### 1) 趋势对比（同比/环比）
- UI 交互
  - 位置：`按月对比` 标签页右上方加入“对比”选择：`无 | 环比 | 同比`
  - 指标选择沿用现有 `支出 | 收入 | 结余`
  - Tooltip 展示：本期值、对比期值、差值、百分比变化
- 数据与算法
  - 基于现有 `monthly` 聚合：对每月计算 `income/expense/net`（排除 `flow='转账'`）
  - 环比：参考上一个自然月；同比：参考上一年同月
  - 缺失数据策略：无数据则不绘制对比点，同时在 Tooltip 提示“对比期缺失”
- 图表呈现
  - 当前期：柱状；对比期：折线或空心柱（区分颜色）
  - 在柱顶显示百分比变化（±X%）；过密时可通过 tooltip 展示
- 验收标准
  - 首月（环比）与首年（同比）不显示对比序列
  - 与人工计算结果误差 < 0.01（取两位小数）
  - 切换指标与对比模式时图表不闪烁、不残影

实施要点（代码）
- `src/App.tsx`
  - 新增状态 `compareMode: 'none' | 'mom' | 'yoy'`
  - 构造 `referenceSeries` 数据并合并到 `monthlyChart` 的 `series`
  - Tooltip 自定义 formatter

---

#### 2) 简单预测（下月）
- 模型与策略
  - 基线：移动平均 MA(N)，默认 `N=3`（可配置）
  - 备选：一次指数平滑 `SES`（alpha 默认 0.5），保留扩展点
  - 预测对象：`expense / income / net`
- UI 与呈现
  - `按月对比` 增加“预测”开关；开启后在 X 轴追加 `下月` 一栏
  - 以虚线边框的柱或淡色标记显示预测值；在图表右侧以小卡片列出预测数值
  - 若有效历史不足 N 个月，禁用开关并在 Tooltip 提示
- 数据接口
  - 不改交易结构；预测仅在前端计算
- 验收标准
  - N>=3 时启用；关闭开关完全不影响既有序列
  - 移动平均计算与手工校验一致

实施要点（代码）
- `src/App.tsx`
  - 新增状态 `forecastOn: boolean`、`maWindow: number = 3`
  - 在 `monthlyChart` 生成时追加预测点与辅助说明

---

#### 3) 商户归一化与合并
- 目标
  - 将“Pak N Save Kapiti / Pak N Save Wellington / Pak N Save”统一为“Pak N Save”，统计更聚合
- 数据结构（IndexedDB / Dexie）
  - 新增表 `merchantAliases`: `++id, pattern, flags, canonicalName, enabled, createdAt`
  - 迁移：`db.version(2).stores({ merchantAliases: '++id, canonicalName, createdAt' })`
- 应用时机
  - 在导入后与“重新分类”时运行归一化：
    - 读取启用的 alias 规则，按创建时间升序匹配；命中后在交易上写入 `merchantNorm`
    - 明细表显示 `merchantNorm ?? merchant`
  - 新增“重新归一化”按钮（与“重新分类”并列）
- UI：新页签 `商户管理`
  - 列表：`规则 / 标准商户名 / 状态 / 操作(编辑|停用|删除)`
  - 表单：新增/编辑规则（正则 + flags + 标准名）
  - 导出/导入（JSON）以便迁移
- 冲突与优先级
  - 多规则命中时取第一个；支持上/下移动调整优先级（可后续增强）
- 验收标准
  - 归一化后饼图与 Top N 统计聚合到标准商户名
  - 切换/编辑规则后，“重新归一化”立即生效

实施要点（代码）
- 新文件：`src/components/MerchantManager.tsx`
- `src/store/db.ts`：新增表结构与版本号，处理升级迁移
- `src/types.ts`：`Transaction` 增加 `merchantNorm?: string`
- `src/utils/*`：新增 `normalizeMerchantsAsync()`，集成到导入与“重新归一化”入口

---

### 数据迁移与兼容
- Dexie 升级到 version 2，写迁移回调；原有数据保留
- 旧交易不含 `merchantNorm` 时，展示时自动回退到 `merchant`

---

### 性能与稳定性
- 聚合与归一化在数据量较大时使用 `requestIdleCallback` 或分批处理以避免卡顿
- 大 CSV 可选放入 Web Worker（保留扩展点）

---

### 测试用例（最小集）
1. 趋势对比
   - 首月环比/首年同比不显示参考序列
   - 切换指标与模式，序列与 tooltip 一致
2. 预测
   - 历史 <3 月时禁用；=3 月时给出1个预测点
3. 商户归一化
   - 同一品牌不同门店归一后统计聚合
   - 多规则命中只取首条，顺序变化结果随之改变

---

### 风险与回滚
- Dexie 迁移失败：保留导出备份能力（分类/规则/商户规则/交易）
- 正则规则误伤：提供停用与优先级调整；保留“原始商户名”

---

### 任务清单（按提交粒度）
- [ ] M1 趋势对比：UI（对比选择） + 数据（referenceSeries） + tooltip
- [ ] M2 简单预测：状态/参数 + 预测点渲染 + 预测说明卡片
- [ ] M3 商户归一化：
  - [ ] 数据库表与迁移 `merchantAliases`
  - [ ] `MerchantManager` 组件（增删改查/导入导出）
  - [ ] `normalizeMerchantsAsync()` 与“重新归一化”按钮
  - [ ] 明细表与统计使用 `merchantNorm ?? merchant`

---

### 影响文件（初版估计）
- `src/App.tsx`（Tabs、对比/预测开关、重新归一化按钮、明细列）
- `src/store/db.ts`（Dexie v2 + 新表）
- `src/types.ts`（新增 `merchantNorm`）
- `src/components/MerchantManager.tsx`（新）
- `src/utils/normalize.ts`（新）
- `src/utils/aggregate.ts`（如需抽离聚合逻辑）


