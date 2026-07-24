# napcat-plugin-contact-manager

NapCat 联系人批量管理插件，提供好友与群聊的批量维护能力。

## 功能

- 好友：按分组查看、搜索、多选、批量删除、批量移动分组、批量备注、创建分组、删除空分组
- 群聊：搜索、多选、批量退群、单独修改群备注
- 操作保护：危险操作二次确认、批量进度展示、取消操作、操作中锁定界面
- WebUI：支持暗色模式、加载进度、失败明细展示

## 安装

从 GitHub Release 下载 `napcat-plugin-contact-manager.zip`，解压到 NapCat 的插件目录：

```text
plugins/napcat-plugin-contact-manager/
```

启用插件后，在 NapCat WebUI 的插件扩展页打开「批量管理」。

## 构建

```bash
pnpm install
cd src/webui && pnpm install && cd ../..
pnpm run build
```

构建产物位于 `dist/`：

```text
dist/
├── index.mjs
├── package.json
└── webui/
    └── index.html
```

## 配置

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 启用插件写操作 |
| `allowBatchDeleteFriend` | `true` | 允许批量删除好友 |
| `allowBatchLeaveGroup` | `true` | 允许批量退群 |
| `allowBatchMoveCategory` | `true` | 允许批量移动好友分组 |
| `requireConfirm` | `true` | 危险操作二次确认 |
| `operationDelayMs` | `300` | 批量操作间隔，单位毫秒 |
| `deleteFriendBlock` | `false` | 删除好友时拉黑 |
| `deleteFriendBothDel` | `false` | 删除好友时双向删除 |
| `debug` | `false` | 输出调试日志 |

## 发布

推送 `v*` 标签会触发 GitHub Actions 构建 Release 包，并提交官方插件索引 PR。

```bash
git tag v1.0.0
git push origin v1.0.0
```

索引更新需要在仓库 Secrets 中配置 `INDEX_PAT`。

## 注意

- 批量删除好友和批量退群不可撤销，建议先小批量验证。
- 移动好友分组依赖 NapCat/QQ 客户端的分组能力，不同版本可能存在差异。
- 本插件仅用于个人账号联系人管理，请遵守相关平台规则。

## License

MIT
