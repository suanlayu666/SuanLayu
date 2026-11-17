# 酸辣鱼个人站

个人主页、博客、学习教程和留言板。网站使用 HTML、CSS 和 JavaScript，博客和教程从 Markdown 生成。Node.js 负责本地预览和构建，部署时由静态托管服务提供 `dist/` 中的文件。公开留言通过 Cloudflare Worker 写入共享数据库。

## 目录结构

```text
.
├── content/                         # 日常编辑的文章和配图
│   ├── blog/                        # 博客 Markdown
│   │   └── images/                  # 博客配图
│   └── learn/                       # 各子目录对应学习目录中的一组教程
│       └── getting-started/         # 「从这里开始」的 Markdown
│           └── images/              # 该组教程的配图
├── src/
│   ├── pages/                       # 首页、博客列表、博客正文、学习和留言页面
│   ├── layouts/                     # HTML 外壳、小鱼标志和教程正文模板
│   ├── styles/                      # 公共样式、Markdown 排版和各页面样式
│   ├── js/                          # 首页导航、复制邮箱和留言板交互
│   └── assets/                      # 小鱼头像、站点图标等全站资源
├── scripts/
│   ├── content.mjs                  # 读取 Markdown、整理文章和目录、转换链接
│   ├── render.mjs                   # 把内容填入页面模板
│   ├── build.mjs                    # 构建 dist/、复制资源、监听源码变动
│   ├── dev.mjs                      # 本地预览和浏览器自动刷新
│   └── site-files.mjs               # 项目路径、支持的资源格式和文件工具
├── dist/                            # 生成的 HTML、样式、脚本和图片
├── package.json                     # 构建命令和依赖
└── package-lock.json                # 锁定依赖版本
```

## 本地预览

本地预览需要 Node.js 22.13 或更新版本。在项目根目录首次运行时安装依赖，再启动预览。

```sh
npm ci
npm run dev
```

用浏览器打开 [本地预览](http://127.0.0.1:4173/)。保存 `content/` 或 `src/` 中的文件后，会重新构建并刷新网页。按 `Ctrl+C` 停止。已有静态预览服务时，也可以用 `npm run watch` 持续生成 `dist/`。

## 写博客和教程

**博客**放在 `content/blog/`。在 Markdown 开头写 `title` 和 `date`，日期格式为 `YYYY-MM-DD`，博客列表按日期倒序。文件名会成为文章地址的一部分。

```markdown
---
title: 我的第一篇博客
date: 2026-11-16
---

这里写正文。
```

**教程**放在 `content/learn/` 下对应的栏目目录。「从这里开始」使用 `content/learn/getting-started/`。可以用 Markdown 开头的一级标题作为页面标题，用 `01-`、`02-` 这样的文件名前缀控制目录顺序。

```markdown
# 【2】安装开发工具

这里写教程正文。
```

## 添加图片和视频

- 博客配图放在 `content/blog/images/`。
- 「从这里开始」的配图放在 `content/learn/getting-started/images/`。以后新增教程栏目时，也可以在该栏目的 Markdown 旁边建一个 `images/`。
- 全站共用的小鱼头像和站点图标放在 `src/assets/`。

在博客或教程中，使用相对于当前 Markdown 文件的路径引用图片。

```markdown
![开发板接线图](./images/开发板接线.webp)
```

构建会把文章配图复制到 `dist/content/` 下的对应目录，并自动转换网页里的引用路径。目前支持 PNG、JPG、JPEG、WebP、GIF、SVG、AVIF、ICO 和 PDF。文件名和扩展名要与 Markdown 中的路径一致。

视频可以上传到 B 站或抖音，在文章里加普通链接。当前构建的资源格式未包含 MP4，直接放入文章目录的视频需要先增加静态视频发布支持。

## 构建与部署

```sh
npm run build
```

构建会生成 `dist/index.html`、`dist/blog.html`、`dist/learn.html`、`dist/guestbook.html`，以及 `dist/posts/` 下的博客正文和 `dist/learn/` 下的教程。腾讯云 EdgeOne 的发布目录是 `dist/`。Cloudflare Workers 使用 `wrangler.jsonc`，将 `dist/` 和留言 API 一起部署。

留言板通过 `/api/guestbook` 读取和发布留言，数据保存在 Cloudflare Durable Object 的 SQLite 存储中。Cloudflare 和腾讯云网址使用同一份留言。以后如果换腾讯云预览域名或绑定自有域名，把域名的 HTTPS 来源追加到 `wrangler.jsonc` 中的 `GUESTBOOK_ORIGINS`，用逗号分隔。

`npm run dev` 使用临时的本地留言数据库，服务重启后清空。旧版保存在浏览器里的留言可从留言页底部复制，确认内容后重新发布。
