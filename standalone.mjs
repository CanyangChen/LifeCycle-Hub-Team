import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import worker from "./dist/server/index.js";
import { openDemoDatabase } from "./standalone-db.mjs";

const local = process.argv.includes("--local");
const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
const publicUrl = new URL(local ? "http://127.0.0.1:" + port : process.env.DEMO_PUBLIC_ORIGIN);
const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(publicUrl.hostname);
if ((publicUrl.protocol !== "https:" && !(loopback && publicUrl.protocol === "http:")) ||
    publicUrl.href !== publicUrl.origin + "/") {
  throw new Error("DEMO_PUBLIC_ORIGIN must be an HTTPS origin or a loopback HTTP origin.");
}
const host = local ? "127.0.0.1" : process.env.LISTEN_HOST || "127.0.0.1";
const teamData = process.env.LIFECYCLE_TEAM_DATA_DIR || join(process.env.LOCALAPPDATA || homedir(), "LifeCycleHub-Team");
const localPath = join(teamData, "data", "team.sqlite");
if (local) mkdirSync(join(teamData, "uploads"), {recursive:true});
const database = openDemoDatabase(local ? localPath : process.env.DEMO_DB_PATH || "./local-data/demo.sqlite");
const env = {
  DB: database.DB,
  ...(local ? {LOCAL_INSTANCE: true, LOCAL_DEMO_SEED: true} : {DEMO_ACCOUNT_MODE: "enabled"}),
  DEMO_PUBLIC_ORIGIN: publicUrl.origin,
  DEMO_INVITATION_HASHES: process.env.DEMO_INVITATION_HASHES || "",
};

const server = createServer(async (incoming, outgoing) => {
  try {
    if (local && incoming.headers.host !== publicUrl.host) {
      outgoing.writeHead(403).end("Invalid Host");
      return;
    }
    if (local && incoming.method === "POST" && incoming.headers.origin !== publicUrl.origin) {
      outgoing.writeHead(403).end("Invalid Origin");
      return;
    }
    const url = new URL(publicUrl);
    if (!incoming.url?.startsWith("/") || incoming.url.startsWith("//")) {
      outgoing.writeHead(400).end();
      return;
    }
    const target = new URL(incoming.url, publicUrl);
    if (target.origin !== publicUrl.origin) {
      outgoing.writeHead(400).end();
      return;
    }
    url.pathname = target.pathname;
    url.search = target.search;
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
    headers.delete("oai-authenticated-user-id");
    // Use the direct peer for throttling and ignore client-supplied proxy headers.
    headers.set("cf-connecting-ip", incoming.socket.remoteAddress || "unknown");
    const method = incoming.method;
    let body;
    if (method === "POST") {
      const chunks = [];
      let size = 0;
      for await (const chunk of incoming.iterator({destroyOnReturn:false})) {
        size += chunk.length;
        if (size > 64 * 1024) {
          outgoing.writeHead(413, {connection:"close"}).end();
          incoming.resume();
          return;
        }
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks);
    }
    const response = await worker.fetch(new Request(url, {method, headers, body}), env);
    const cookies = response.headers.getSetCookie();
    const output = Object.fromEntries(response.headers);
    if (local) output["x-lifecycle-instance"] = "team-local";
    if (cookies.length) output["set-cookie"] = cookies;
    outgoing.writeHead(response.status, output);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("Standalone request failed", error.name);
    if (!outgoing.headersSent) outgoing.writeHead(500, {"cache-control":"no-store"});
    outgoing.end();
  }
});
server.listen(port, host, () => console.log("LifeCycle Hub listening on", server.address().address, server.address().port));
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => server.close(() => database.close()));
