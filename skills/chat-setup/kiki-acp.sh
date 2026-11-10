#!/bin/sh
# cc-connect 把这个当 ACP agent 起：转给 Kiki 自带的 ACP 垫片，消息交给奇奇。
# KIKI_NODE、KIKI_ACP、KIKI_URL、KIKI_INBOUND_TOKEN 是 Kiki 开后台程序时给 cc-connect 的，cc-connect 再传下来。
exec "${KIKI_NODE:-node}" "$KIKI_ACP" --channel "${1:-weixin}"
