#!/bin/sh
# Kiki 的插件通知通道调这个：把奇奇后来又说的、Kiki 的急事发回聊天软件。
# KIKI_NOTIFY_CHANNEL 有值就只发那个通道，没值（Kiki 的提醒）就发给接上的每一个。
cd "$(dirname "$0")/../.." || exit 1
[ -x bin/cc-connect ] || exit 0
msg="$KIKI_NOTIFY_TITLE：$KIKI_NOTIFY_TEXT"
[ "$KIKI_NOTIFY_TITLE" = "奇奇" ] && msg="$KIKI_NOTIFY_TEXT"
if [ -n "$KIKI_NOTIFY_CHANNEL" ]; then chs="$KIKI_NOTIFY_CHANNEL"; else chs=$(sed -n 's/^name = "\(.*\)"$/\1/p' data/config.toml 2>/dev/null); fi
for ch in $chs; do
  case "$ch" in weixin|feishu) bin/cc-connect send --data-dir data/cc --project "$ch" --message "$msg" ;; esac
done
