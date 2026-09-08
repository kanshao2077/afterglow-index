# 余光档案 / AFTERGLOW INDEX

一个可以先跑起来的 AIGC 作品索引 MVP：机器负责发现、去重、做最低限度的可信筛选并抓取封面；编辑只负责把少数作品加星为「编辑精选」。

当前首批数据来自 6 个来源族：Runway AI Film Festival、Project Odyssey、Reply AI Film Festival、HKUST AI Film Festival、Bilibili 热门 AIGC 和 AI Film Landmarks。它们覆盖官方奖项页、创作者原发页、公开视频页与公开热榜，并按 2026 年 8 月 1 日起的档案周期回填。获奖年份、作品发布时间和归档日期是三个独立字段，不会把旧作品伪装成当年新作。

线上地址：<https://kanshao2077.github.io/afterglow-index/>

## 先运行

需要 Node.js 22。项目不需要数据库，也没有额外抓取依赖。

```bash
npm install
npm run sync
npm run dev
```

打开终端显示的本地地址。不要直接双击 `index.html`，Vite 应用需要本地开发服务器。

## 当前 MVP 做了什么

- 主站总数动态来自 `public/data/catalog.json`，标题会自动变成「XX 件作品，构成生成时代的视觉档案」。
- 页面按 `TYPE / TOOLS / SOURCE / OTHERS / TIME` 筛选，并支持搜索、空状态和作品详情。
- 默认内容池全部来自机器发现和规则初筛；「编辑精选」不是另一套抓取算法，只是人工加星后的子集。
- 获奖信息保存奖项、年份、结果、官方证据链接与核验时间；热门作品保存播放、点赞和采集时间快照。
- 封面自动抓取并保存到 `public/covers/`，页面不直接热链远程图片。
- 每周目标约 7 件，允许在 5—9 件之间浮动；质量不足时不硬凑。
- GitHub Actions 每周一刷新数据并创建 PR，必须人工审阅后合并，不直接改线上站点。

## 数据分层

```text
data/sources.json                 抓取源、起始日期、每周范围和机器门槛
data/generated/candidates.json   自动生成的候选与本地封面记录
data/curation.json               你手动加星、排序、隐藏和写理由的唯一文件
public/data/catalog.json         前端真正读取的发布目录
public/covers/                    本地化封面
scripts/ingest.mjs               抓取、解析、去重、初筛、封面下载
scripts/curate.mjs               人工精选命令
scripts/build-catalog.mjs         合并机器结果与人工标记
```

机器筛选刻意保持透明：官方奖项、作者署名、作品描述、原作链接、可用封面、公开热度和行业记录组成信号分。它只决定「是否进入机器发现池」，不会冒充审美判断。Bilibili 适配器会读取公开热榜并用关键词与播放门槛找候选，同时保留少量已核验的热门作品入口，避免热榜轮换后丢失代表作。

## 你的筛选

先查看可用 ID：

```bash
npm run curate -- list
```

加到编辑精选，并写下为什么值得留下：

```bash
npm run curate -- star runway-aiff-2025-total-pixel-space "把生成空间这个概念变成了可观看的结构"
```

其他命令：

```bash
npm run curate -- unstar <id>
npm run curate -- reason <id> <新的理由>
npm run curate -- rank <id> <数字>
npm run curate -- reject <id>
npm run curate -- approve <id>
```

每次修改会自动重建 `public/data/catalog.json`。

## 自动抓封面

通用优先级是：明确的作品缩略图 → `og:image` → `twitter:image` → JSON-LD image → 正文第一张图片。Runway 与 Project Odyssey 适配器会在每件作品自己的卡片片段中取得图片；Bilibili 使用公开稿件接口返回的封面；YouTube 在本地网络无法直接访问图片 CDN 时，经 `images.weserv.nl` 取得一次性缩略图后保存到本站，不在前端热链。

下载器只接受配置白名单内的 HTTP(S) 主机，拒绝常见内网地址，限制 15 秒与 8 MB，并校验图片 MIME。下载失败时保留上一版本地封面和候选数据。

## 接入下一个来源

新增来源时：

1. 在 `data/sources.json` 增加官方页面、证据地址和允许访问的图片主机。
2. 优先复用 `seeded-oembed`；确实需要解析榜单时，再在 `scripts/ingest.mjs` 增加一个小适配器，输出统一字段。
3. 运行 `npm run sync`，检查新增数量、封面、作者和证据。
4. 运行 `npm run build`，再在桌面和手机宽度做页面验收。

不要直接接入需要登录、明确禁止自动化、来源不明或版权边界不清的页面。

## 验证

```bash
npm run sync
npm run build
npm run test:sites
```

## 权利与发布边界

这个站只保存索引元数据、署名、低尺寸封面和原作链接，不镜像完整影片，也不声称拥有作品版权。正式公开前仍需逐一确认来源站的服务条款、robots 规则、图片展示许可和删除渠道；作者或权利人提出下架时，应立即在 `data/curation.json` 中隐藏并删除对应本地封面。
