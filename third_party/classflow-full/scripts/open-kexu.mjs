import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const preferredPort = 5180;
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

async function isKexu(port) {
  try {
    const response = await fetch(`http://${host}:${port}/`, {
      signal: AbortSignal.timeout(800),
    });
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes("课序PLUS") || html.includes("课序 · ClassFlow");
  } catch {
    return false;
  }
}

async function chooseTarget() {
  for (let port = preferredPort; port < preferredPort + 30; port += 1) {
    if (await isKexu(port)) return { port, running: true };
    if (await isPortFree(port)) return { port, running: false };
  }
  throw new Error("没有找到可用端口（5180-5209）。");
}

function openBrowser(url) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(command, [url], { detached: true, stdio: "ignore" }).unref();
}

async function waitUntilReady(port, child) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (child.exitCode !== null) return false;
    if (await isKexu(port)) return true;
    await sleep(250);
  }
  return false;
}

async function main() {
  if (!existsSync(viteBin)) {
    console.error("找不到 Vite 依赖，请先在项目目录运行 npm install。");
    process.exit(1);
  }
  console.log("正在检查课序服务…");
  const target = await chooseTarget();
  const url = `http://${host}:${target.port}/?launch=${Date.now()}`;

  if (target.running) {
    console.log(`课序已在运行：${url}`);
    openBrowser(url);
    return;
  }

  console.log(`正在启动最新版本：http://${host}:${target.port}/`);
  const child = spawn(
    process.execPath,
    [viteBin, "--host", host, "--port", String(target.port), "--strictPort"],
    { cwd: root, stdio: "inherit", env: process.env },
  );

  const stop = () => {
    if (child.exitCode === null) child.kill();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.once("SIGHUP", stop);
  child.once("exit", (code) => process.exit(code ?? 0));

  if (!(await waitUntilReady(target.port, child))) {
    console.error("课序启动超时，请查看上方的 Vite 输出。");
    stop();
    process.exit(1);
  }

  console.log(`已就绪，正在打开浏览器。关闭此窗口即可停止服务。`);
  openBrowser(url);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});