# Debug Session: admin-user-delete

- Status: OPEN
- Symptom: 删除子用户时，`DELETE /api/users/:id` 返回 `{"error":"Not found"}`
- Expected: 已存在的子用户可以被成功删除
- Scope: 本地安装包中的用户管理删除链路

## Hypotheses

1. `/api/users/[id]` 删除路由拿到的 `id` 参数与数据库真实存储的 `id` 结构不一致。
2. 本地数据库查询/删除方法使用了错误字段，导致命中不到目标子用户。
3. 路由层做了额外过滤，误把合法的 `sub_user` 当成不存在。
4. 前端列表展示的 `id` 与实际删除接口所用主键不是同一个字段。
5. 已安装包与当前源码在用户删除逻辑上仍然存在差异。

## Evidence Log

- User provided runtime evidence: `DELETE /api/users/934f114a-e6b2-4097-866b-d848026437e4` returns `{"error":"Not found"}`
- Instrumentation evidence from `.dbg/trae-debug-log-admin-user-delete.ndjson`:
  - route invoked with `paramsType: "object"`
  - `hasId: false`
  - `rawId: null`
  - `deleted: false`
- Root cause confirmed: in Next 16 route handlers, this dynamic route needs `await params` before reading `id`; direct `params.id` resolves to `undefined` here.
- Fix applied in `src/app/api/users/[id]/route.js` for `GET`, `PATCH`, and `DELETE`.
- Post-fix verification:
  - rebuilt project
  - uninstalled and reinstalled local package
  - replayed `DELETE /api/users/934f114a-e6b2-4097-866b-d848026437e4`
  - response changed from `404 {"error":"Not found"}` to `200 {"success":true}`

## Current Status

- Fix applied and locally verified
- Awaiting user browser-side confirmation
