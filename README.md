# openrouterX

面向 AI 编码工具的本地统一路由服务。

> 当前代码分支：[`feat/openrouterx-release`](https://github.com/hackyinge/9router/tree/feat/openrouterx-release)  
> GitHub 仓库：[`hackyinge/9router`](https://github.com/hackyinge/9router)  
> 如果这个项目对你有帮助，欢迎点一个 Star，后续会继续更新更多 AI 编码工具、MITM、账号切换和团队网关能力。

`openrouterX` 可以把 Claude Code、Codex、Cursor、OpenCode、OpenClaw、Cline、Continue、Roo 等客户端统一接到一个本地 OpenAI-compatible 接口，并提供 Dashboard、模型路由、API Key 管理、Usage 分析、组合模型与自动 fallback。

## 为什么用 openrouterX

- 统一本地接口：`http://localhost:20502/v1`
- 统一管理后台：`http://localhost:20502/dashboard`
- 同时接入订阅型供应商、API Key 供应商、免费供应商
- 支持组合模型与自动 fallback
- 支持 Codex 账号一键激活到本机 Codex，并自动刷新 token、写入 macOS Keychain、重启 Codex App
- 支持子用户在授权范围内切换 Codex 账号，适合团队共用多账号额度
- 支持 Antigravity MITM，带上游解析修复，避免依赖固定 IP 导致网络漂移后失效
- 默认端口前移到 `20502`，安装和启动时会迁移旧的 `20128` MITM router 配置
- 配额刷新请求做了分散调度，降低多个账号集中请求触发风控的概率
- 内置 `RTK`，适合 `git diff`、`grep`、日志等重工具调用场景
- 支持管理员创建子用户，并精细限制子用户可用供应商与 API Key

## 新增功能速览

### Codex 账号一键激活

在配额页面的 Codex 账号卡片上点击 `Activate`，即可把该账号应用到本机 Codex：

- 检测本机是否安装 Codex CLI 或 macOS Codex.app
- 使用账号的 `refresh_token` 刷新最新 `access_token` / `id_token`
- 写入 `~/.codex/auth.json`
- 在 macOS 上同步写入 `Codex Auth` Keychain
- 自动重启 Codex.app，让新账号立即生效

如果本机没有安装 Codex，会提示安装方式：

```bash
npm install -g @openai/codex
# macOS 也可以：
brew install --cask codex
```

### 子用户也能切换 Codex 账号

子用户在配额页面仍然保持只读，不能编辑、删除或启停供应商连接，但可以对自己被授权看到的 Codex 账号点击 `Activate`。后端会做连接级权限校验，手写未授权的 `connectionId` 会返回 `403`。

注意：Codex 激活修改的是当前机器的本地 Codex 登录态，是机器级状态，不是每个子用户隔离一份本地 Codex 状态。

### Antigravity MITM 更稳定

MITM 不再依赖固定上游 IP 列表。解析上游地址时会跳过本机 alias、回环路由和已失败地址，减少这类错误：

```txt
Passthrough error: connect EADDRNOTAVAIL ...
Router fetch failed for http://localhost:20128/v1/chat/completions
```

同时默认端口已从 `20128` 迁移到 `20502`，升级安装和启动时会刷新旧配置，避免其他机器升级后继续指向旧端口。

## 安装

从 npm 全局安装：

```bash
npm install -g @yina-npm/openrouterx
openrouterX
```

开发者在验证本地改动时，必须区分“源码启动”和“npm 包安装测试”。发布、CLI、MITM、安装布局相关改动请先阅读 [Local npm Package Testing](docs/LOCAL_NPM_TESTING.md)。

启动后默认地址：

- Dashboard：`http://localhost:20502/dashboard`
- OpenAI-compatible API：`http://localhost:20502/v1`

## 快速开始

### 1. 启动本地服务

```bash
openrouterX
```

登录页默认在：

```txt
http://localhost:20502/login
```

### 2. 登录

- `Super Admin`：完整管理权限
- `Sub User`：受限使用权限，适合团队成员或子账号

### 3. 连接供应商

进入 Dashboard 后可以接入：

- 订阅型供应商：Claude Code、Codex、Copilot、Cursor
- API Key 供应商：OpenAI、Anthropic、OpenRouter、GLM、Gemini、DeepSeek、Groq、Mistral、MiniMax、Kimi 等
- 免费或低成本供应商：Kiro、OpenCode Free、Vertex AI

### 4. 创建或复制 API Key

在 Dashboard 中创建 API Key，然后把它配置到你的编码工具里。

### 5. 把工具接到 openrouterX

```txt
Base URL: http://localhost:20502/v1
API Key:  你的 Dashboard API Key
Model:    任意可用模型或 combo
```

## 工作方式

```txt
你的工具
  -> Claude Code / Codex / Cursor / OpenCode / OpenClaw / Cline / Continue

openrouterX
  -> 本地 OpenAI-compatible 接口
  -> 请求格式适配
  -> 模型路由与 fallback
  -> 配额感知切换
  -> Usage 统计
  -> API Key 与子用户隔离

上游供应商
  -> 订阅账号
  -> API Key 供应商
  -> 免费供应商
```

## 核心能力

### 统一本地接口

多个工具共享同一个本地入口：

```txt
http://localhost:20502/v1
```

### Dashboard 驱动配置

Dashboard 可以完成：

- 连接供应商
- 创建 API Key
- 测试模型
- 配置 combo
- 查看 Usage 和请求明细
- 生成各类 CLI Tools 的手动配置

### RTK Token Saver

`RTK` 会在请求发送到上游模型前，对冗长的工具输出进行压缩，尤其适合：

- `git diff`
- `grep`
- `ls`
- 构建日志
- 长文本工具输出

### Combo 与自动 fallback

你可以创建一个命名 combo，让多个模型串联：

```txt
premium-coding
  1. cc/claude-opus
  2. glm/glm-5
  3. kr/claude-sonnet-4.5
```

主模型不可用时，可以自动切到后备模型。

### 子用户权限隔离

管理员可以为子用户单独控制：

- 可使用哪些供应商
- 可见哪些 API Key
- Usage 是否只看自己的数据
- 是否仅能查看 `CLI Tools` 手动配置，而不能修改本地工具设置

这适合团队共用部署、代运营账号、或敏感 API Key 隔离场景。

### 团队共享网关

`openrouterX` 不只是单人使用工具，也可以作为团队内部统一网关：

- 管理员统一管理供应商、API Key、用户、combo
- 子用户只看到分配给自己的 API Key 和允许使用的供应商
- 子用户的 Usage 页面只展示自己的调用数据
- 子用户可以在 `CLI Tools` 页面复制配置，但不会拿到完整管理权限
- 上游供应商凭证不会暴露给普通成员

### Usage 分析

Dashboard 支持查看：

- 请求数
- tokens
- estimated cost
- 按 API Key 的使用情况
- 请求明细

其中成本展示主要用于统计和对比，`openrouterX` 本身不会向你收费。

## 支持的工具

`openrouterX` 面向各类 AI 编码工具和 OpenAI-compatible 客户端，包括：

- Claude Code
- Codex CLI
- Cursor
- OpenCode
- OpenClaw
- Cline
- Continue
- Roo
- 兼容 Copilot 的相关流程
- 其他支持 OpenAI-compatible 接口的自定义工具

## 支持的供应商类型

### 订阅型供应商

- Claude Code
- Codex
- GitHub Copilot
- Cursor

### API Key 供应商

- OpenAI
- Anthropic
- OpenRouter
- GLM
- Gemini
- DeepSeek
- Groq
- Mistral
- MiniMax
- Kimi
- 以及其他兼容供应商

### 免费或低成本供应商

- Kiro
- OpenCode Free
- Vertex AI

实际可用性取决于上游服务当前状态和你的本地配置。

## CLI Tools 配置

Dashboard 内置了 `CLI Tools` 页面，可以直接生成可复制的配置。

### 通用 OpenAI-compatible 配置

```txt
Base URL: http://localhost:20502/v1
API Key:  你的 Dashboard API Key
Model:    你选择的模型或 combo
```

### Codex CLI

```bash
export OPENAI_BASE_URL="http://localhost:20502/v1"
export OPENAI_API_KEY="your-dashboard-api-key"
```

### Claude Code

直接使用 `CLI Tools -> Claude Code` 中生成的手动配置。

### OpenClaw

直接使用 `CLI Tools -> OpenClaw` 中生成的手动配置。

### OpenCode

直接使用 `CLI Tools -> OpenCode` 中生成的手动配置。

## 管理员与子用户

`openrouterX` 内置两种角色：

- `super_admin`
- `sub_user`

### `super_admin`

可以管理：

- providers
- API keys
- combos
- users
- usage analytics
- 本地工具集成配置

### `sub_user`

可以被限制为：

- 只能使用分配给自己的 API Key
- 只能访问被允许的供应商
- 只能查看自己的 Usage 数据
- 只显示精简版 `CLI Tools`
- 可以复制手动配置，但不能管理供应商
- 页面范围聚焦在自己的可见资源内

这使得一个部署可以服务多个用户，同时避免把所有供应商和凭证暴露给每个人。

## 本地开发

从源码运行：

```bash
cp .env.example .env
npm install
PORT=20502 NEXT_PUBLIC_BASE_URL=http://localhost:20502 npm run dev
```

生产构建：

```bash
npm run build
PORT=20502 HOSTNAME=0.0.0.0 NEXT_PUBLIC_BASE_URL=http://localhost:20502 npm run start
```

### 切换端口

默认端口是 `20502`。临时切到其他端口时，同时设置 `PORT` 和对外 base URL：

```bash
PORT=20600 NEXT_PUBLIC_BASE_URL=http://localhost:20600 npm run dev
```

生产模式同理：

```bash
PORT=20600 HOSTNAME=0.0.0.0 NEXT_PUBLIC_BASE_URL=http://localhost:20600 npm run start
```

如果使用全局安装的 `openrouterX`，端口来自 CLI 内置默认值或启动时的 `PORT` 环境变量。修改默认端口后需要重新 npm 全局安装并重启：

```bash
npm run release:npm:install-local
openrouterX restart --no-browser --skip-update
```

切换端口后，CLI 工具里的 Base URL 也要同步改成新端口，例如 `http://localhost:20600/v1`。

## 部署

### PM2

```bash
npm install
npm run build
pm2 start npm --name openrouterx -- start
```

### Docker

```bash
docker build -t openrouterx .

docker run -d \
  --name openrouterx \
  -p 20502:20502 \
  --env-file ./.env \
  -v openrouterx-data:/app/data \
  openrouterx
```

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `JWT_SECRET` | Dashboard 登录鉴权使用的 JWT secret |
| `INITIAL_PASSWORD` | 初始登录密码，在没有已保存 hash 时使用 |
| `DATA_DIR` | 主数据库目录 |
| `PORT` | 服务端口 |
| `HOSTNAME` | 监听地址 |
| `BASE_URL` | 服务端内部使用的 base URL |
| `CLOUD_URL` | 云端同步使用的 base URL |
| `NEXT_PUBLIC_BASE_URL` | 前端可见的 base URL |
| `NEXT_PUBLIC_CLOUD_URL` | 前端可见的云端 URL |
| `API_KEY_SECRET` | 生成 API Key 时使用的签名 secret |
| `MACHINE_ID_SALT` | 机器标识计算使用的 salt |
| `ENABLE_REQUEST_LOGS` | 是否开启请求日志 |
| `AUTH_COOKIE_SECURE` | 是否强制使用安全 Cookie |
| `REQUIRE_API_KEY` | 是否要求 `/v1/*` 必须携带 Bearer API Key |

## API 示例

### Chat Completions

```bash
curl http://localhost:20502/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kr/claude-sonnet-4.5",
    "messages": [
      { "role": "user", "content": "Write a Node.js hello world server." }
    ],
    "stream": false
  }'
```

### 列出模型

```bash
curl http://localhost:20502/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 常见问题

### Dashboard 打不开

- 检查 `20502` 端口是否被占用
- 启动前显式设置 `PORT=20502`

### 登录失败

- 初始化环境时检查 `INITIAL_PASSWORD`
- 如果已经有历史数据，请使用当前保存的管理员密码，不要假设存在默认密码

### 工具看不到模型

- 确认供应商已连接
- 确认当前 API Key 属于当前用户
- 如果是子用户，检查 `Admin -> Users` 中配置的 allowed providers

### Usage 没有数据

- 确认工具接入的是 `http://localhost:20502/v1`
- 确认使用的是 Dashboard 中生成的 Bearer API Key

### 上游报错或配额不足

- 重新连接供应商
- 切换到其他模型
- 创建带 fallback 的 combo

## 包信息

- npm 包：[`@yina-npm/openrouterx`](https://www.npmjs.com/package/@yina-npm/openrouterx)
- 启动命令：`openrouterX`
- 代码仓库：[`hackyinge/9router`](https://github.com/hackyinge/9router)
- 当前分支：[`feat/openrouterx-release`](https://github.com/hackyinge/9router/tree/feat/openrouterx-release)
- 协议：MIT

## 作者

如果你喜欢这个项目，欢迎到 GitHub 给 [`hackyinge/9router`](https://github.com/hackyinge/9router) 点个 Star。Star 会直接决定作者继续摸鱼写功能的速度。

作者除了写 AI 工具，也在番茄小说写小说。感兴趣可以在番茄小说搜索：**《首席摸鱼》**。

## License

MIT，见 [LICENSE](LICENSE)。
