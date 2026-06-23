# 马原重点刷题

一个本地优先、也支持在线同步的刷题网站，用于按章节和专题练习马克思主义基本原理客观题。项目包含前端页面、Node.js 本地服务、Vercel 在线函数、题库数据、作答记录持久化和错题/标记复习流程。

这个仓库的目标不是做一个花哨的题库平台，而是保留一套可以直接复用和二次修改的高效备考工具：打开即可刷题，每次作答、切题、标记和错误次数都会被记录。本地运行时写入本机文件；部署到 Vercel 后，手机和电脑可以通过同一个网址同步进度。

## 功能

- 章节与专题树状导航。
- 三个练习入口：
  - `重点题`：当前专题的重点题顺序练习。
  - `错题`：只显示当前章节专题下已经答错过的题，按当前专题题库顺序稳定展示。
  - `标记汇总`：只显示当前章节专题下手动标记过的题。
- 每个入口分别记住浏览位置。
- 错题再次答错时只更新错误次数，不会让题目在当前错题列表里动态跳位。
- 支持上一题、下一题和滑块跳题。
- 单选、多选、判断题作答。
- 提交后显示正确答案、正确项、解析和易错提醒。
- 记录每道题：
  - 作答次数
  - 答错次数
  - 最后答案
  - 最后是否答对
  - 浏览次数
  - 标记状态
- 数据不依赖浏览器缓存，刷新页面或重新打开后进度仍在。
- 可部署为在线网址，使用 Vercel Blob 保存跨设备进度。

## 当前题库

仓库内置的题库文件是：

```text
data/questions.json
```

当前版本包含：

- 原始客观题：1146 道
- 第一轮筛选后重点题：659 道
- 当前单选冲刺题库：460 道
- 第一轮剔除低优先级题：487 道
- 当前进度节点后追加剔除多选/判断：199 道

第一轮筛选后的重点题保留了以下类型：

- 错误判断题。
- 多选非全选题。
- 年份、著作、组织、历史节点等硬记题。
- 含绝对化、偷换、混淆、颠倒关系的易错题。
- 核心定义、本质、根本原因、最高目标、固定教材表述。

剔除的低优先级题主要包括：

- 明显全选且没有硬记价值的多选题。
- 普通正确判断题。
- 题干和选项直接对应、区分度较低的题。

当前版本针对期末选择题“只考单选”的复习策略做了二次裁剪：以 `人类社会及其发展规律 / 生产力和生产关系 / 多选题148` 为进度节点，节点之前的题目全部保留；节点之后只保留单选题。这样已经做过的多选、判断、错题和标记仍然保留，后续新刷题集中到单选。

注意：筛选逻辑服务于“最短时间抓重点”，不是说被剔除题永远不会考。需要更稳妥时，可以基于原始 CSV 重新生成或扩展题库。

## 前置准备

使用者需要准备：

1. Node.js

   建议 Node.js 18 或更高版本。确认方式：

   ```bash
   node --version
   ```

2. Git

   用于克隆和二次修改仓库：

   ```bash
   git --version
   ```

3. 浏览器

   任意现代浏览器即可，例如 Chrome、Safari、Edge。

本地单机刷题不需要数据库，不需要 Redis，不需要安装前端依赖。在线同步需要一个 Vercel 账号和 Vercel Blob 存储。

## 快速启动

克隆仓库后进入项目目录：

```bash
git clone <你的仓库地址>
cd <仓库目录>
```

启动本地服务：

```bash
npm start
```

打开浏览器访问：

```text
http://localhost:5177
```

如果 5177 端口被占用，可以换端口：

```bash
PORT=3000 npm start
```

然后访问：

```text
http://localhost:3000
```

## 在线同步版本

如果你希望手机和电脑共用同一份进度，推荐部署到 Vercel。部署后：

- 题库和页面通过一个在线网址访问。
- 进度、错题次数、标记题、浏览位置写入 GitHub 仓库中的 `data/progress.json`。
- 手机和电脑第一次打开时输入同一个同步口令，之后浏览器会记住。
- 公开网址不会直接暴露个人进度；没有同步口令时，进度接口会拒绝读写。

当前项目已经支持这些接口：

```text
GET  /api/questions          # 公开读取题库
GET  /api/state              # 读取进度，需要同步口令
POST /api/event              # 写入一次操作，需要同步口令
GET  /api/history            # 读取操作历史，需要同步口令
POST /api/import-progress    # 导入本地进度，需要同步口令
```

### Vercel 部署前置

需要准备：

1. Vercel 账号。
2. Vercel CLI 登录状态：

   ```bash
   npx vercel whoami
   ```

   如果没有登录：

   ```bash
   npx vercel login
   ```

3. 安装依赖：

   ```bash
   npm install
   ```

### 创建并连接项目

```bash
npx vercel link --yes --project mayuan-quiz
```

如果你想换项目名，把 `mayuan-quiz` 改成自己的名字。

### 创建云端进度存储

当前项目使用 GitHub 作为短周期进度备份和同步后端。你需要给 Vercel 配一个有仓库写入权限的 GitHub token：

```bash
npx vercel env add GITHUB_PROGRESS_TOKEN production --value "<GitHub token>" --yes --sensitive
npx vercel env add GITHUB_PROGRESS_OWNER production --value "<GitHub 用户名>" --yes --no-sensitive
npx vercel env add GITHUB_PROGRESS_REPO production --value "<仓库名>" --yes --no-sensitive
npx vercel env add GITHUB_PROGRESS_BRANCH production --value "main" --yes --no-sensitive
```

token 只放在 Vercel 后端环境变量里，不要写进前端代码，不要提交到 GitHub。

### 设置同步口令

自己生成一个口令，例如：

```bash
node -e "console.log('mayuan-' + require('crypto').randomBytes(12).toString('base64url'))"
```

然后分别写入 Vercel 环境变量：

```bash
npx vercel env add SYNC_TOKEN production --value "<你的同步口令>" --yes --sensitive
npx vercel env add SYNC_TOKEN preview --value "<你的同步口令>" --yes --sensitive
npx vercel env add SYNC_TOKEN development --value "<你的同步口令>" --yes --no-sensitive
```

### 部署

```bash
npm run deploy
```

部署成功后，Vercel 会输出一个生产网址，例如：

```text
https://your-project.vercel.app
```

### 导入已有本地进度

如果你本地已经刷过题，需要把 `data/progress.json` 导入云端：

```bash
curl -X POST "https://your-project.vercel.app/api/import-progress" \
  -H "Content-Type: application/json" \
  -H "X-Sync-Token: <你的同步口令>" \
  --data-binary @data/progress.json
```

导入后再打开线上网址，页面顶部的“已提交 / 错误 / 标记”数字应该和本地一致。

### 手机和电脑怎么用

推荐方式：

1. 手机和电脑都打开同一个 Vercel 网址。
2. 第一次进入时输入同一个同步口令。
3. 后续作答、标记、错题次数都会写入云端。

也可以临时用下面这种方式自动写入口令：

```text
https://your-project.vercel.app?sync=<你的同步口令>
```

页面会把口令保存到当前浏览器，然后自动移除地址栏里的 `sync` 参数。不要把带口令的链接发到公开地方。

注意：`http://localhost:5177` 仍然是本地单机进度。要实现手机和电脑同步，请两端都使用线上 Vercel 网址。

## 数据存储

本地服务运行后会在 `data/` 目录里写入本地进度文件：

```text
data/progress.json
data/history.jsonl
```

它们的作用是：

- `data/progress.json`：当前每道题的进度快照，例如作答次数、错误次数、标记状态、当前位置。
- `data/history.jsonl`：每次操作的事件流水，例如切换专题、切换模式、选择选项、提交答案。

这两个文件属于个人学习记录。当前仓库按使用者要求提交了 `data/progress.json` 作为考试前进度备份；如果你复用本项目且不想公开自己的进度，可以继续让 `.gitignore` 忽略它，或删除仓库里的个人进度文件。

在线部署后，云端进度会写回 GitHub 仓库的 `data/progress.json`。需要把本地进度迁移到云端时，使用上面的 `/api/import-progress`。

仓库中提供了一个空模板：

```text
data/progress.example.json
```

实际运行时，即使 `progress.json` 和 `history.jsonl` 不存在，服务也会自动创建。

## 题库结构

`data/questions.json` 的顶层结构：

```json
{
  "meta": {},
  "questions": []
}
```

每道题的主要字段：

```json
{
  "id": "唯一题目ID",
  "sourceIndex": 3,
  "chapter": "章节",
  "topic": "专题",
  "number": "题号",
  "type": "单选题",
  "stem": "题干",
  "options": [
    { "letter": "A", "text": "选项内容" }
  ],
  "answer": "C",
  "correctItem": "C. 正确项内容",
  "analysis": "解析",
  "reminder": "易错提醒",
  "tags": ["易错"],
  "priority": 5,
  "includeReason": "保留原因"
}
```

判断题的选项由前端自动渲染为“正确 / 错误”。

## 更换或重建题库

默认情况下，直接运行项目会读取仓库内置的：

```text
data/questions.json
```

如果你想用自己的 CSV 重新生成题库，需要准备一个包含以下表头的 CSV：

```text
章节,专题,题号,题型,题干,选项A,选项B,选项C,选项D,答案,正确项,解析,易错提醒
```

然后运行：

```bash
SOURCE_CSV=/absolute/path/to/your/questions.csv npm run build:data
```

生成结果会覆盖：

```text
data/questions.json
```

重建后重新启动服务即可。

如果你的 CSV 字段不同，需要修改：

```text
scripts/build-questions.js
```

重点看这些部分：

- CSV 解析字段。
- `hardMemoryPattern`
- `trapPattern`
- `corePattern`
- `confusionPattern`
- `classify()` 里的打分规则。

## 筛题逻辑

构建脚本会对每道题进行规则打分：

- 硬记题：`+5`
- 错误判断题：`+5`
- 多选非全选：`+4`
- 易错陷阱词：`+3`
- 解析或易错提醒提示混淆、颠倒、片面、偷换：`+2`
- 核心概念：`+2`
- 非硬记的全选多选：`-4`
- 普通正确判断题：`-3`

最终分数 `>= 4` 的题会进入重点题库。

这套规则适合“短时间抓高风险题”。如果你要做全量训练，可以把阈值调低，或直接把所有题都写入 `questions.json`。

## 项目结构

```text
.
├── data/
│   ├── questions.json            # 公开题库
│   └── progress.example.json     # 空进度模板
├── api/
│   ├── _shared.mjs               # Vercel 云端存储与进度计算
│   ├── event.mjs                 # 线上写入作答/标记/浏览事件
│   ├── history.mjs               # 线上读取历史
│   ├── import-progress.mjs       # 本地进度导入云端
│   ├── questions.mjs             # 线上读取题库
│   └── state.mjs                 # 线上读取进度
├── public/
│   ├── app.js                    # 前端交互逻辑
│   ├── index.html                # 页面结构
│   └── styles.css                # 页面样式
├── scripts/
│   └── build-questions.js        # 从 CSV 生成 questions.json
├── server.js                     # 本地 Node.js 服务
├── vercel.json                   # Vercel 部署配置
├── package.json
├── .gitignore
└── README.md
```

## 二次修改入口

常见修改位置：

- 想改界面：`public/index.html`、`public/styles.css`
- 想改交互：`public/app.js`
- 想改本地存储逻辑：`server.js`
- 想改线上同步逻辑：`api/_shared.mjs` 和 `api/*.mjs`
- 想改筛题规则：`scripts/build-questions.js`
- 想换题库：重新生成或替换 `data/questions.json`

## 常见问题

### 1. 页面打不开

先确认服务是否启动：

```bash
curl http://localhost:5177
```

如果没有响应，重新启动：

```bash
npm start
```

### 2. 端口被占用

换端口：

```bash
PORT=3000 npm start
```

### 3. 进度丢失

检查 `data/progress.json` 是否存在。这个文件保存学习进度，不要删除。

如果你是从 GitHub 重新 clone 的仓库，可能会带有仓库作者提交的 `progress.json`。复用时可以删除它，第一次运行会自动创建空进度。

### 4. 为什么这个仓库包含进度文件

通常不建议把个人进度提交到公开仓库。但这个项目是短周期期末复习工具，当前使用者明确要求把进度上传到 GitHub 做备份，所以仓库里保留了 `data/progress.json` 和 `data/progress-backups/`。

### 5. 手机和电脑为什么没有同步

确认两端是否都在使用线上 Vercel 网址。如果一端使用 `localhost`，另一端使用线上网址，它们就是两份记录。

还要确认两端输入的是同一个同步口令。口令错误时，页面会要求重新输入。

## 可选：macOS 后台常驻

如果希望本地服务在登录后自动启动，可以使用 macOS LaunchAgent。把下面内容保存为：

```text
~/Library/LaunchAgents/com.example.mayuanquiz.plist
```

并把路径改成你自己的项目路径：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.example.mayuanquiz</string>

  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>
    <string>/absolute/path/to/server.js</string>
  </array>

  <key>WorkingDirectory</key>
  <string>/absolute/path/to/project</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
```

加载：

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.mayuanquiz.plist
launchctl enable gui/$(id -u)/com.example.mayuanquiz
```

卸载：

```bash
launchctl bootout gui/$(id -u)/com.example.mayuanquiz
```

## 版权和使用说明

代码以 MIT License 开源。题库内容来自课程复习材料整理，适合学习和复习使用。若你要在公开场景再次分发、商用或改编题库内容，请自行确认原始题目材料的授权情况。
