# openrouterX

面向 AI 编码工具的本地统一路由服务。

`openrouterX` 可以把 Claude Code、Codex、Cursor、OpenCode、OpenClaw、Cline、Continue、Roo 等客户端统一接到一个本地 OpenAI-compatible 接口，并提供 Dashboard、模型路由、API Key 管理、Usage 分析、组合模型与自动 fallback。

## 为什么用 openrouterX

- 统一本地接口：`http://localhost:20128/v1`
- 统一管理后台：`http://localhost:20128/dashboard`
- 同时接入订阅型供应商、API Key 供应商、免费供应商
- 支持组合模型与自动 fallback
- 内置 `RTK`，适合 `git diff`、`grep`、日志等重工具调用场景
- 支持管理员创建子用户，并精细限制子用户可用供应商与 API Key

## 安装

从 npm 全局安装：

```bash
npm install -g @yina-npm/openrouterx
openrouterX
```

启动后默认地址：

- Dashboard：`http://localhost:20128/dashboard`
- OpenAI-compatible API：`http://localhost:20128/v1`

## 快速开始

### 1. 启动本地服务

```bash
openrouterX
```

登录页默认在：

```txt
http://localhost:20128/login
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
Base URL: http://localhost:20128/v1
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
http://localhost:20128/v1
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
Base URL: http://localhost:20128/v1
API Key:  你的 Dashboard API Key
Model:    你选择的模型或 combo
```

### Codex CLI

```bash
export OPENAI_BASE_URL="http://localhost:20128/v1"
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
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```

生产构建：

```bash
npm run build
PORT=20128 HOSTNAME=0.0.0.0 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run start
```

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
  -p 20128:20128 \
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
curl http://localhost:20128/v1/chat/completions \
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
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 常见问题

### Dashboard 打不开

- 检查 `20128` 端口是否被占用
- 启动前显式设置 `PORT=20128`

### 登录失败

- 初始化环境时检查 `INITIAL_PASSWORD`
- 如果已经有历史数据，请使用当前保存的管理员密码，不要假设存在默认密码

### 工具看不到模型

- 确认供应商已连接
- 确认当前 API Key 属于当前用户
- 如果是子用户，检查 `Admin -> Users` 中配置的 allowed providers

### Usage 没有数据

- 确认工具接入的是 `http://localhost:20128/v1`
- 确认使用的是 Dashboard 中生成的 Bearer API Key

### 上游报错或配额不足

- 重新连接供应商
- 切换到其他模型
- 创建带 fallback 的 combo

## 包信息

- npm 包：[`@yina-npm/openrouterx`](https://www.npmjs.com/package/@yina-npm/openrouterx)
- 启动命令：`openrouterX`
- 协议：MIT

## License

MIT，见 [LICENSE](LICENSE)。
