# lancy.site

个人 AI 工作流作品集入口站点

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

- 纯静态 HTML + CSS
- 部署在 GitHub Pages

## 部署

- 主域名 `lancy.site` → GitHub Pages
- 各子域名对应不同项目独立部署

## 添加新项目

在 `index.html` 的 `<section class="projects-grid">` 中添加新卡片：

```html
<article class="project-card">
    <figure class="project-image">
        <span class="project-tag new">NEW</span>
        <img src="images/your-cover.jpg" alt="项目名称 - 功能简介" loading="lazy" width="340" height="200">
    </figure>
    <div class="project-content">
        <h2 class="project-title">项目名称</h2>
        <p class="project-desc">项目功能描述</p>
        <a href="https://your-project.lancy.site" class="project-link" target="_blank" rel="noopener noreferrer">
            访问项目
            <svg ...>...</svg>
        </a>
    </div>
</article>
```

添加后更新：
1. `sitemap.xml` — 新增 `<url>` 条目
2. `README.md` 项目表格
3. `index.html` JSON-LD 的 `ItemList` 中的 `itemListElement`

## License

MIT
