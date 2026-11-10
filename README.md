# 社交通道（Kiki 插件宝）

把你的微信、飞书接到 [Kiki](https://github.com/lkyxuan/kiki)：你在那边说的话交给奇奇，等于在 App 里说一句；奇奇后来又说的（后台任务做完、要问你）也发回去。只认你自己的账号。

背后是开源的聊天软件网桥 [cc-connect](https://github.com/chenhg5/cc-connect)（锁定 v1.5.0，下载时校验 sha256），只放在这个宝的文件夹里。

## 装
在 Kiki 里贴这个仓库的链接导入，或者在宝库里搜「社交通道」。装好后跟它说“接微信”，到左栏「通道」页面扫码。

## 里面有什么
- `plugin.json`：后台跑 cc-connect、通知通道、总览卡片、「通道」页面
- `AGENTS.md`：这个宝负责什么
- `skills/chat-setup/`：装 cc-connect、接微信/飞书、断开、查状态的脚本
- `page/`：「通道」页面（二维码用 qrcode-generator，MIT）

凭据和配置都在 `data/`，导出宝不带。只支持 Mac。
