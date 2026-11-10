#!/usr/bin/env node
// 社交通道宝的脚本：装 cc-connect、接微信/飞书、写配置、更新状态和总览卡片。只用 Node 自带的东西。
//
//   node skills/chat-setup/chat.mjs install            下载锁定版本的 cc-connect 到 bin/（校验 sha256），给脚本加执行权限
//   node skills/chat-setup/chat.mjs weixin             接微信：后台跑扫码登录，二维码地址写进 data/weixin-qr.txt，页面显示；扫完自动写配置、重启
//   node skills/chat-setup/chat.mjs feishu <app_id> <app_secret> <你的 open_id>   接飞书（自建应用）
//   node skills/chat-setup/chat.mjs off <weixin|feishu> 断开一个
//   node skills/chat-setup/chat.mjs status             重写配置、状态、总览卡片（其他命令做完都会调）
//
// 规矩：
// - 凭据只放 data/channels.json（导出宝不带 data/），config.toml 每次从它重新生成。
// - 每个通道必须有允许名单（只放你自己），没有、或者是 "*" 的通道不写进配置：进来的话按“你本人说的”处理，不能让别人进来。
// - cc-connect 自带的命令（/shell、/cron、/dir…）全部关掉，消息只交给 Kiki（经 ACP 垫片）。
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CC_VERSION = "v1.5.0";
export const CC_SHA256 = {
  arm64: "458e7f1e783e87352fa402732d2b2da5072bbda286ec0fbd4dc01ed37b2084ce",
  amd64: "30b403b0b64c934795281d598079dfeeea0daaaeb6b415d8602a13bd2dcb2092",
};
export const CHANNELS = { weixin: "微信", feishu: "飞书" };

const HERE = dirname(fileURLToPath(import.meta.url));
const BAO = process.env.KIKI_BAO_DIR || resolve(HERE, "..", "..");
const DATA = join(BAO, "data");
const p = (...x) => join(DATA, ...x);

const readJson = (f, d) => {
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return d;
  }
};
const writeAtomic = (f, text, mode) => {
  mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.tmp-${process.pid}`;
  writeFileSync(tmp, text, mode ? { mode } : undefined);
  renameSync(tmp, f);
};
const q = (s) => JSON.stringify(String(s)); // TOML 基本字符串和 JSON 字符串转义一样

/** 允许名单要写死具体的人：空的、带 * 的都不算 */
export const allowOk = (a) => typeof a === "string" && a.trim() !== "" && !a.split(",").some((x) => x.trim() === "*" || !x.trim());

/** 按 channels.json 生成 cc-connect 的配置：一个通道一个项目，agent 都是 Kiki 的 ACP 垫片 */
export function buildConfig(channels, baoDir) {
  const acp = join(baoDir, "skills", "chat-setup", "kiki-acp.sh");
  const out = [
    "# 社交通道宝自动生成，别手改：改了下次会被盖掉。凭据在 data/channels.json。",
    `data_dir = ${q(join(baoDir, "data", "cc"))}`,
    `language = "zh"`,
    "",
  ];
  const on = [];
  for (const [ch, c] of Object.entries(channels || {})) {
    if (!CHANNELS[ch] || !c || !allowOk(c.allow_from)) continue;
    const opts = ch === "weixin" ? (c.token ? { token: c.token, ...(c.base_url ? { base_url: c.base_url } : {}), ...(c.account_id ? { account_id: c.account_id } : {}) } : null) : c.app_id && c.app_secret ? { app_id: c.app_id, app_secret: c.app_secret } : null;
    if (!opts) continue;
    on.push(ch);
    out.push(
      "[[projects]]",
      `name = ${q(ch)}`,
      `disabled_commands = ["*"]`,
      "reply_footer = false",
      "",
      "[projects.agent]",
      `type = "acp"`,
      "",
      "[projects.agent.options]",
      `cmd = ${q(acp)}`,
      `args = [${q(ch)}]`,
      `work_dir = ${q(baoDir)}`,
      `display_name = "Kiki"`,
      "",
      "[[projects.platforms]]",
      `type = ${q(ch)}`,
      "",
      "[projects.platforms.options]",
      ...Object.entries(opts).map(([k, v]) => `${k} = ${q(v)}`),
      `allow_from = ${q(c.allow_from.trim())}`,
      "",
    );
  }
  return { text: out.join("\n"), on };
}

/** 从 cc-connect weixin setup 写出来的配置里读回 token、允许名单这些（它写的是 key = "value" 一行一个） */
export function readWeixinCreds(toml) {
  const get = (k) => {
    const m = new RegExp(`^\\s*${k}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m").exec(toml);
    return m ? JSON.parse(`"${m[1]}"`) : "";
  };
  return { token: get("token"), allow_from: get("allow_from"), base_url: get("base_url"), account_id: get("account_id") };
}

/** 总览卡片 */
export function cardFor(on, channels, running) {
  const names = on.map((c) => CHANNELS[c]);
  const pending = Object.keys(channels || {}).filter((c) => CHANNELS[c] && !on.includes(c));
  return {
    title: "聊天软件",
    value: on.length ? `${on.length} 个接上了` : "还没接",
    sub: on.length ? `${names.join("、")}里跟我说话，等于跟奇奇说` : "在页面里点“接微信”",
    lines: pending.map((c) => ({ label: CHANNELS[c], value: channels[c]?.error ? "没接成" : "没接完" })).slice(0, 4),
    ...(on.length ? { tone: running === false ? "warn" : "ok" } : {}),
  };
}

function kikiUrl() {
  return (process.env.KIKI_URL || "http://127.0.0.1:4567").replace(/\/+$/, "");
}

async function restartService() {
  try {
    await fetch(`${kikiUrl()}/api/bao/services`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: basename(BAO), service: "cc-connect", action: "restart" }) });
  } catch {} // Kiki 每 30 秒也会自己看一眼
}

function status() {
  const channels = readJson(p("channels.json"), {});
  const { text, on } = buildConfig(channels, BAO);
  writeAtomic(p("config.toml"), text, 0o600);
  const bin = existsSync(join(BAO, "bin", "cc-connect"));
  const st = { at: new Date().toISOString(), pending: existsSync(p("weixin-pending.json")), installed: bin, version: bin ? CC_VERSION : null, on, channels: Object.fromEntries(Object.entries(channels).map(([k, v]) => [k, { on: on.includes(k), error: v?.error || "", allow: v?.allow_from ? "已设" : "" }])) };
  writeAtomic(p("status.json"), JSON.stringify(st, null, 2) + "\n");
  writeAtomic(p("card.json"), JSON.stringify(cardFor(on, channels, bin ? undefined : false)) + "\n");
  return st;
}

async function install() {
  if (process.platform !== "darwin") throw new Error("目前只支持 Mac");
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  const name = `cc-connect-${CC_VERSION}-darwin-${arch}`;
  const url = `https://github.com/chenhg5/cc-connect/releases/download/${CC_VERSION}/${name}.tar.gz`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`下载失败：HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const sum = createHash("sha256").update(buf).digest("hex");
  if (sum !== CC_SHA256[arch]) throw new Error(`下载的文件校验不对（${sum}），没装`);
  const tmp = join(BAO, "bin", ".tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, "a.tgz"), buf);
  const t = spawnSync("tar", ["xzf", "a.tgz"], { cwd: tmp });
  if (t.status !== 0) throw new Error(`解压失败：${t.stderr}`);
  const exe = readdirSync(tmp).find((f) => f.startsWith("cc-connect"));
  if (!exe) throw new Error("压缩包里没找到 cc-connect");
  chmodSync(join(tmp, exe), 0o755);
  renameSync(join(tmp, exe), join(BAO, "bin", "cc-connect"));
  rmSync(tmp, { recursive: true, force: true });
  for (const f of ["kiki-acp.sh", "notify.sh"]) chmodSync(join(HERE, f), 0o755); // .bao 导入不带执行权限
  console.log(`装好了：cc-connect ${CC_VERSION}（${arch}）`);
}

/** 正在扫码的那一轮：data/weixin-pending.json 记着它的 pid 和编号。断开、重新扫码时先停掉它，它扫完发现编号对不上就不写凭据 */
function cancelPending() {
  const pend = readJson(p("weixin-pending.json"), null);
  rmSync(p("weixin-pending.json"), { force: true });
  rmSync(p("weixin-qr.txt"), { force: true });
  if (pend?.pid) try { process.kill(pend.pid, "SIGTERM"); } catch {}
}

/** 接微信：前台只把后台扫码进程开起来就返回，扫码等最多 5 分钟 */
function weixin() {
  if (!existsSync(join(BAO, "bin", "cc-connect"))) throw new Error("还没装 cc-connect：先跑 install");
  cancelPending();
  const id = `${process.pid}-${Date.now()}`;
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "weixin-run", id], { cwd: BAO, detached: true, stdio: "ignore", env: process.env });
  // 返回之前就写好：宝回话时页面马上能看到“在扫码”，一直看着等二维码
  writeAtomic(p("weixin-pending.json"), JSON.stringify({ pid: child.pid, id, at: new Date().toISOString() }) + "\n");
  child.unref();
  console.log("扫码登录开始了：二维码在「通道」页面里，5 分钟内用微信扫。扫完会自动接上。");
}

async function weixinRun(given) {
  const id = given || `${process.pid}-${Date.now()}`;
  if (!given) writeAtomic(p("weixin-pending.json"), JSON.stringify({ pid: process.pid, id, at: new Date().toISOString() }) + "\n");
  const tmpCfg = p("setup-weixin.toml");
  // 单独一份配置给扫码用：扫完之前，正在跑的 cc-connect 配置里不会出现没有允许名单的微信
  writeAtomic(tmpCfg, `data_dir = ${q(p("cc"))}\n\n[[projects]]\nname = "weixin"\n\n[projects.agent]\ntype = "acp"\n\n[projects.agent.options]\ncmd = "true"\n\n[[projects.platforms]]\ntype = "weixin"\n\n[projects.platforms.options]\ntoken = ""\nallow_from = ""\n`, 0o600);
  rmSync(p("weixin-qr.txt"), { force: true });
  mkdirSync(p("logs"), { recursive: true });
  const code = await new Promise((done) => {
    const c = spawn(join(BAO, "bin", "cc-connect"), ["weixin", "setup", "--config", tmpCfg, "--project", "weixin", "--set-allow-from-empty", "--timeout", "300"], { cwd: BAO });
    let buf = "";
    const onData = (d) => {
      writeFileSync(p("logs", "weixin-setup.log"), d, { flag: "a" });
      buf += d.toString("utf8");
      for (const m of buf.matchAll(/URL:\s*(\S+)/g)) writeAtomic(p("weixin-qr.txt"), JSON.stringify({ url: m[1], at: new Date().toISOString() }) + "\n");
      buf = buf.slice(-4000);
    };
    c.stdout.on("data", onData);
    c.stderr.on("data", onData);
    c.on("error", () => done(-1));
    c.on("close", done);
    process.on("SIGTERM", () => c.kill("SIGTERM")); // 被断开、重新扫码停掉：扫码进程一起停
  });
  const mine = readJson(p("weixin-pending.json"), null)?.id === id;
  if (mine) {
    rmSync(p("weixin-pending.json"), { force: true });
    rmSync(p("weixin-qr.txt"), { force: true });
  }
  if (!mine) return rmSync(tmpCfg, { force: true }); // 中途断开了或者又开了新的一轮：这一轮的结果不要
  const channels = readJson(p("channels.json"), {});
  const got = code === 0 && existsSync(tmpCfg) ? readWeixinCreds(readFileSync(tmpCfg, "utf8")) : null;
  rmSync(tmpCfg, { force: true });
  if (got?.token && allowOk(got.allow_from)) channels.weixin = { ...got, at: new Date().toISOString() };
  else channels.weixin = { error: got?.token ? "没拿到你的微信号，没敢接（不然谁都能给 Kiki 发话）" : "扫码没完成或过期了", at: new Date().toISOString() };
  writeAtomic(p("channels.json"), JSON.stringify(channels, null, 2) + "\n", 0o600);
  status();
  await restartService();
}

async function feishu(appId, secret, openId) {
  if (!appId || !secret || !openId) throw new Error("要三样：app_id、app_secret、你自己的 open_id");
  if (!allowOk(openId)) throw new Error("open_id 要写具体的人，不能是 *");
  const channels = readJson(p("channels.json"), {});
  channels.feishu = { app_id: appId, app_secret: secret, allow_from: openId, at: new Date().toISOString() };
  writeAtomic(p("channels.json"), JSON.stringify(channels, null, 2) + "\n", 0o600);
  status();
  await restartService();
  console.log("飞书接上了：在飞书里给你的应用发一句话试试。");
}

async function off(ch) {
  if (!CHANNELS[ch]) throw new Error("只认 weixin、feishu");
  if (ch === "weixin") cancelPending();
  const channels = readJson(p("channels.json"), {});
  delete channels[ch];
  writeAtomic(p("channels.json"), JSON.stringify(channels, null, 2) + "\n", 0o600);
  status();
  await restartService();
  console.log(`${CHANNELS[ch]}断开了`);
}

// Mac 的 /var 是 /private/var 的软链接，import.meta.url 是解开后的真路径，两边都解开再比
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  const [cmd, ...args] = process.argv.slice(2);
  const run = { install: async () => (await install(), status()), weixin, "weixin-run": () => weixinRun(args[0]), feishu: () => feishu(...args), off: () => off(args[0]), status: () => console.log(JSON.stringify(status(), null, 2)) }[cmd];
  if (!run) {
    console.error("用法：chat.mjs install | weixin | feishu <app_id> <app_secret> <open_id> | off <weixin|feishu> | status");
    process.exit(2);
  }
  Promise.resolve(run()).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
