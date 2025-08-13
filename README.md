# Finace Helper

一个用 React + TypeScript 构建的本地银行账单分析工具。支持上传多种 CSV 模板，离线解析与持久化（IndexedDB），自动分类、商户归一化，收支与按月对比分析，可视化展示与主题切换，并支持数据与规则的导入导出。

## 功能特点

- **CSV 上传与解析**：
  - 兼容多种银行导出模板（信用卡/储蓄卡），自动识别常见表头与日期格式。
  - 处理借贷标记（例如 Type=D/C）并自动修正金额正负。
  - 支持多文件上传并自动去重合并。

- **本地持久化**：
  - 使用 IndexedDB（Dexie）保存分类、分类规则、商户归一化规则。
  - 账单数据保存在内存，支持一键导出/导入 JSON 备份。

- **自动分类与规则引擎**：
  - 基于正则的分类规则，导入时自动匹配 `merchant/note` 并打上分类。
  - 可在“分类管理”中增删改分类、编辑规则、启停规则、设置颜色。
  - 一键“重新分类”对现有账单重新应用规则。

- **商户归一化（合并同品牌多门店）**：
  - 基于正则的商户归一化规则，将不同写法统一为标准名称。
  - 支持“重新归一化”对现有数据批量更新。

- **财务口径与转账排除**：
  - 通过关键词识别“转账/还款”等内部流转，自动从收支统计中排除。
  - 支持自定义关键字（在规则中配置）。

- **分析与可视化**：
  - 收支分析：
    - 月份筛选（含“本月/上月”快捷选择）、视图切换（全部/支出/收入）。
    - 分类占比饼图（颜色与分类同步）、商户 Top N、账户收支对比、明细表（可排序）。
  - 按月对比：
    - 选择指标（支出/收入/结余），支持环比/同比对比。
    - 支持简单预测（MA(3)），Tooltip 显示差值与百分比。
    - 点击某个月柱子可跳转至“收支分析”并同步月份筛选。

- **主题切换**：
  - 在“设置”抽屉内切换浅色/深色主题，图表随主题自适应。

- **数据与规则导入/导出**：
  - 导出/导入账单 JSON 备份。
  - 导出/导入分类与规则；导出/导入商户归一化规则。

## 快速开始

1) 环境要求

- Node.js 20+

2) 安装与启动

```bash
npm ci
npm run dev
```

3) 使用流程

- 打开“设置”抽屉 → 上传 CSV（可多文件）。
- 在“收支分析”页使用月份筛选与视图切换查看当月明细与图表。
- 在“分类管理”中维护分类与规则；在“商户管理”中维护归一化规则。
- 需要时在“设置”抽屉中进行“重新分类/重新归一化”，或导入导出数据与规则。

## 支持的 CSV 模板与适配

- 信用卡账单模板：包含日期、商户、金额、类型（D/C）、卡号等。
- 储蓄卡收支模板：包含日期、收/支、商户、摘要、账户等。
- 自动映射：程序会根据常见表头与内容自动推断 `date/merchant/amount/note/account/currency` 等字段及日期格式。

## 数据与存储

- 分类、规则、商户归一化规则：存储于 IndexedDB（Dexie），浏览器本地持久化。
- 账单：内存持有；支持导出为 JSON 文件并再次导入恢复。
- `.gitignore` 已忽略 `*.csv` 与备份 JSON（防止敏感数据入库）。

## 技术栈

- React + TypeScript + Vite
- Ant Design（UI 与主题）
- ECharts + echarts-for-react（可视化）
- PapaParse（CSV 解析）
- Dexie.js（IndexedDB）
- Day.js（日期处理）
- Zod（数据校验）

## Cloudflare Pages 部署（GitHub Actions）

1) 在 Cloudflare 获取参数
- 创建 API Token（授予 Pages 权限；可基于 Edit Cloudflare Workers 模板添加 Pages 相关权限）
- 记录 `CLOUDFLARE_API_TOKEN`
- 进入账户主页记录 `CLOUDFLARE_ACCOUNT_ID`

2) 在 GitHub 仓库设置 Secrets
- `Settings` → `Secrets and variables` → `Actions` → `New repository secret`
- 添加：
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`

3) 工作流说明
- 文件：`.github/workflows/deploy-cloudflare-pages.yml`
- 触发：推送到 `main` 分支
- 步骤：安装依赖 → `npm run build` → 发布 `dist/` 到 Cloudflare Pages
- 已集成“自动创建项目”步骤：首次运行会尝试创建名为 `finace-helper` 的 Pages 项目（或使用你在 workflow 中的自定义名称）

4) 本地预览
```bash
npm run dev
```

如遇到 “Project not found” 错误：请在 Cloudflare 控制台先手动创建同名 Pages 项目，或确认 `projectName` 与权限/账号信息正确。

