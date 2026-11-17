import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL(".", import.meta.url));
const host = "127.0.0.1";
const ports = process.env.PORT === undefined ? [8080, 8081] : [Number(process.env.PORT)];
if (ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}
const url = (port) => "http://" + host + ":" + port + "/";
async function existingTeamService(port) {
  try {
    const response = await fetch(url(port), {redirect:"manual",signal:AbortSignal.timeout(1200)});
    await response.body?.cancel();
    return response.ok && response.headers.get("x-lifecycle-instance") === "team-local";
  } catch {
    return false;
  }
}
function portAvailable(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}
function openBrowser(address) {
  if (process.platform === "win32") {
    const browser = spawn("cmd.exe", ["/d", "/c", "start", "", address], {stdio:"ignore",windowsHide:true});
    browser.on("error", () => {});
  }
}
for (const port of ports) {
  if (await existingTeamService(port)) {
    console.log("Team edition is already running at " + url(port));
    openBrowser(url(port));
    process.exit(0);
  }
}
let port;
for (const candidate of ports) {
  if (await portAvailable(candidate)) { port = candidate; break; }
}
if (!port) {
  console.error("No team port available. Close the conflicting service or set PORT to a free port.");
  process.exit(1);
}
const build = spawn(process.execPath, ["build.mjs"], {cwd,stdio:"inherit"});
const built = await new Promise((resolve) => {
  build.on("error", () => resolve(1));
  build.on("exit", (code) => resolve(code ?? 1));
});
if (built !== 0) process.exit(built);
console.log("Team edition: " + url(port) + " (press Ctrl+C to stop)");
const server = spawn(process.execPath, ["standalone.mjs","--local"],
  {cwd,env:{...process.env,PORT:String(port)},stdio:"inherit"});
server.on("error", (error) => {console.error(error.message);process.exitCode=1;});
server.on("exit", (code) => {process.exitCode=code ?? 0;});
for (const signal of ["SIGINT","SIGTERM"]) process.once(signal, () => server.kill(signal));
