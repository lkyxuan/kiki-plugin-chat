---
name: chat-setup
description: 装 cc-connect、接微信/飞书、断开、查状态。用户说“接微信”“接飞书”“断开”“怎么不回了”时用。
---

# 接聊天软件

脚本：`node skills/chat-setup/chat.mjs <命令>`，在宝目录里跑。每个命令做完都会重写 `data/config.toml`、`data/status.json`、`data/card.json`，并让 Kiki 重启后台的 cc-connect。

## 装
`install`：下载锁定版本的 cc-connect（v1.5.0，校验 sha256，对不上就不装）到 `bin/cc-connect`，给 `skills/chat-setup/*.sh` 加执行权限。只支持 Mac。升级版本要改脚本里的 `CC_VERSION` 和 `CC_SHA256`，别的地方不用动。

## 接微信（个人号）
1. `weixin`：后台开始扫码登录，马上返回。
2. 告诉用户打开左栏「通道」页面，用微信扫二维码（5 分钟内，过期了再说一次“接微信”）。
3. 扫完脚本自己读回 token 和用户的微信号，允许名单只放这一个人，接上。拿不到微信号就不接（不然谁给机器人发话都会进 Kiki），`status.json` 里会写原因。

## 接飞书（自建应用）
1. 带用户去 https://open.feishu.cn/app 建一个“企业自建应用”，加“机器人”能力，权限开 `im:message`、`im:message:send_as_bot`，事件订阅选“长连接”，订阅 `im.message.receive_v1`，发布版本。
2. 拿到 App ID、App Secret。
3. 用户自己的 open_id：在开放平台“API 调试台”里调“获取用户信息”能看到，或者先问用户的手机号/邮箱，用 `contact` 接口查。拿不到就别接，不能写 `*`。
4. `feishu <app_id> <app_secret> <open_id>`。

## 断开
`off weixin` / `off feishu`：删掉凭据，重启后台程序。

## 出问题
- 先跑 `status` 看哪些接上了。
- 再看 `data/logs/cc-connect.log`（后台程序的输出）、`data/logs/weixin-setup.log`（扫码）。
- 常见：没装（`installed: false`）→ `install`；微信 token 失效 → 再“接微信”一次；Kiki 那边报 401 → 后台程序没拿到口令，重启 Kiki。
