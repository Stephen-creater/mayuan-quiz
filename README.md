# 马原重点刷题

一个本地优先的刷题网站，用于按章节和专题练习马克思主义基本原理客观题。项目包含前端页面、Node.js 本地服务、题库数据、作答记录持久化和错题/标记复习流程。

这个仓库的目标不是做一个花哨的题库平台，而是保留一套可以直接复用和二次修改的高效备考工具：打开即可刷题，每次作答、切题、标记和错误次数都会被记录到本地文件。

## 功能

- 章节与专题树状导航。
- 三个练习入口：
  - `重点题`：当前专题的重点题顺序练习。
  - `错题`：只显示当前章节专题下已经答错过的题。
  - `标记汇总`：只显示当前章节专题下手动标记过的题。
- 每个入口分别记住浏览位置。
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

## 当前题库

仓库内置的题库文件是：

```text
data/questions.json
```

当前版本包含：

- 原始客观题：1146 道
- 筛选后重点题：659 道
- 剔除低优先级题：487 道

筛选后的重点题保留了以下类型：

- 错误判断题。
- 多选非全选题。
- 年份、著作、组织、历史节点等硬记题。
- 含绝对化、偷换、混淆、颠倒关系的易错题。
- 核心定义、本质、根本原因、最高目标、固定教材表述。

剔除的低优先级题主要包括：

- 明显全选且没有硬记价值的多选题。
- 普通正确判断题。
- 题干和选项直接对应、区分度较低的题。

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

不需要数据库，不需要 Redis，不需要安装前端依赖。这个项目只使用 Node.js 内置模块。

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

## 数据存储

项目运行后会在 `data/` 目录里写入本地进度文件：

```text
data/progress.json
data/history.jsonl
```

它们的作用是：

- `data/progress.json`：当前每道题的进度快照，例如作答次数、错误次数、标记状态、当前位置。
- `data/history.jsonl`：每次操作的事件流水，例如切换专题、切换模式、选择选项、提交答案。

这两个文件属于个人学习记录，默认被 `.gitignore` 忽略，不建议提交到公开仓库。

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
├── public/
│   ├── app.js                    # 前端交互逻辑
│   ├── index.html                # 页面结构
│   └── styles.css                # 页面样式
├── scripts/
│   └── build-questions.js        # 从 CSV 生成 questions.json
├── server.js                     # 本地 Node.js 服务
├── package.json
├── .gitignore
└── README.md
```

## 二次修改入口

常见修改位置：

- 想改界面：`public/index.html`、`public/styles.css`
- 想改交互：`public/app.js`
- 想改存储逻辑：`server.js`
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

如果你是从 GitHub 重新 clone 的仓库，默认不会带有别人的 `progress.json`，第一次运行会自动创建空进度。

### 4. 为什么不把进度上传到 GitHub

因为进度文件是个人学习记录，里面包含作答历史、错题、标记题和浏览位置。公开仓库只应包含代码和可复用题库，不应包含个人记录。

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

