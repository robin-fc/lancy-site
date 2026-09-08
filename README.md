# lancy.site

Lancy（兰心）AI 实验室数字星球入口站点

## 项目介绍

展示多个 AI 工作流项目：

| 项目 | 链接 | 说明 |
|------|------|------|
| 📄 AI 简历助手 | [resume.lancy.site](https://resume.lancy.site) | JD 匹配、ATS 检查与简历改写 |
| 🛒 电商生视频 | [ecommerce.lancy.site](https://ecommerce.lancy.site) | 商品短视频 AI 生成 |
| 📝 公众号优化 | [blog.lancy.site](https://blog.lancy.site) | 公众号内容创作工具 |
| 📈 AI 选股器 | [stock.lancy.site](https://stock.lancy.site) | AI 驱动的智能选股平台 |
| 🎨 AI 海报生成 | [poster.lancy.site](https://poster.lancy.site) | 输入文案自动生成精美海报 |
| 📈 AI 量化交易 | [quant.lancy.site](https://quant.lancy.site) | 基于 AI 的量化交易系统 |

## SEO / AI 搜索优化

### 已配置
- `robots.txt` — 允许所有爬虫抓取
- `sitemap.xml` — XML 站点地图（包含所有子站点）
- `index.html` — 完整 meta 标签 + Open Graph + Twitter Card + JSON-LD 结构化数据
- 语义化 HTML（`<article>`, `<figure>`, `<main>`, ARIA 标签）
- 所有图片含描述性 alt 文本

### JSON-LD 结构化数据
- `WebSite` 类型（支持 Google Sitelinks 搜索框）
- `ItemList` 类型（列出所有 AI 工具，利于 AI 搜索索引）

## 技术栈

- 纯静态 HTML + CSS + JavaScript
- Three.js 数字星球与 DOM 投影交互
- 无构建步骤，部署在 GitHub Pages

## 部署

- 主域名 `lancy.site` → GitHub Pages
- 各子域名对应不同项目独立部署

## 添加新项目

在 `js/projects.js` 中新增项目配置，包括名称、链接、缩略图、星球坐标和地点圈尺寸。页面会自动生成星球地点与底部实验索引。

添加后同步更新：
1. `sitemap.xml` — 新增 `<url>` 条目
2. `README.md` — 更新项目表格
3. `index.html` — 更新 JSON-LD 的 `ItemList`

设计稿保存在 `design/lancy-lab-ui-concept.svg`，Three.js 渲染逻辑位于 `js/planet.js`，项目面板与背景图切换位于 `js/app.js`。

## License

MIT
