# lancy.site

个人 AI 工作流作品集入口站点

## 项目介绍

展示多个 AI 工作流项目：

| 项目 | 链接 | 说明 |
|------|------|------|
| 🎬 AI 漫剧工作流 | [comic.lancy.site](https://comic.lancy.site) | AI 漫剧自动生成 |
| 🛒 电商生视频 | [ecommerce.lancy.site](https://ecommerce.lancy.site) | 商品短视频 AI 生成 |
| 📝 公众号优化 | [blog.lancy.site](https://blog.lancy.site) | 公众号内容创作工具 |
| 🔍 降 AI 率图文 | [noai.lancy.site](https://noai.lancy.site) | 自动优化图文，降 AI 率 |
| 📈 AI 量化交易 | [quant.lancy.site](https://quant.lancy.site) | 基于 AI 的量化交易系统 |
| 🎨 AI 海报生成 | [poster.lancy.site](https://poster.lancy.site) | 输入文案自动生成精美海报 |

## 技术栈

- 纯静态 HTML + CSS
- 部署在 GitHub Pages

## 部署

- 主域名 `lancy.site` → GitHub Pages
- 各子域名对应不同项目独立部署

## 添加新项目

在 `index.html` 的 `<section class="cards">` 中添加新卡片：

```html
<article class="card">
  <div class="card-image">
    <img src="images/your-cover.jpg" alt="项目名称" loading="lazy">
  </div>
  <div class="card-content">
    <span class="card-tag">NEW</span>
    <h3>项目名称</h3>
    <p>项目描述</p>
    <a href="https://your-project.lancy.site" class="card-link">立即体验 →</a>
  </div>
</article>
```

## License

MIT
