# Debug Session: admin-users-load

- Status: OPEN
- Symptom: 访问 `/dashboard/admin/users` 时页面显示 `This page couldn't load`
- Expected: 正常打开子用户管理页，并可创建/编辑/删除子用户
- Scope: 本地安装包运行中的 Dashboard 管理页

## Hypotheses

1. `/dashboard/admin/users` 页面本身在运行时抛错，导致前端路由加载失败。
2. 页面依赖的 `/api/auth/me` 或 `/api/users` 请求返回了非预期响应，触发了客户端加载失败。
3. middleware 或鉴权逻辑对 `super_admin` 的 `/dashboard/admin/users` 路由仍有错误拦截。
4. 本地安装包中的构建产物与源码不一致，实际运行的还是旧逻辑。
5. 某个共享布局或依赖组件在进入 admin users 路由时抛出了运行时异常。

## Evidence Log

- `server.log` captured `Cannot find module '../../shared/constants/mitmToolHosts'` from installed package path `openrouterx-local/app/src/mitm/dns/dnsConfig.js`.
- Installed package was missing `app/src/shared/constants/mitmToolHosts.js`, while source repo contains `src/shared/constants/mitmToolHosts.js`.
- After patching `scripts/release-npm.js` to copy that file into the staged `app/src/shared/constants/` directory, the installed package now contains the file and starts without that module error.
- Verification:
  - Installed package path exists: `openrouterx-local/app/src/shared/constants/mitmToolHosts.js`
  - `GET /dashboard/admin/users` with a synthetic `super_admin` cookie returns `200`
  - User-management modal fix remains in `src/app/(dashboard)/dashboard/admin/users/page.js`

## Current Status

- Package/runtime fix applied and locally reinstalled
- Awaiting user verification in real browser session
