const demoCookie = "__Host-lifecycle-demo";
const demoSessionAge = 60 * 60 * 24 * 7;
const demoEncoder = new TextEncoder();
const demoHex = (bytes) => Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
const demoRandom = (size) => demoHex(crypto.getRandomValues(new Uint8Array(size)));
const demoDigest = async (value) => demoHex(new Uint8Array(await crypto.subtle.digest("SHA-256", demoEncoder.encode(value))));
const demoNow = () => Math.floor(Date.now() / 1000);
const demoDummySalt = "c6c9961eb9714ef952dd3e5253bc7ae4e";

const demoArgonPrefix = "argon2id:v19:m19456,t2,p1:";
const demoSaltBytes = (salt) => Uint8Array.from(salt.match(/../g), (byte) => parseInt(byte, 16));

function demoPasswordHash(password, salt = demoRandom(16)) {
  const bits = demoNoble.argon2id(demoEncoder.encode(password), demoSaltBytes(salt),
    { m: 19456, t: 2, p: 1, dkLen: 32 });
  return demoArgonPrefix + salt + ":" + demoHex(bits);
}

function demoCheckPassword(password, stored) {
  const parts = stored?.startsWith(demoArgonPrefix) ? stored.slice(demoArgonPrefix.length).split(":") : [];
  const valid = parts.length === 2 && /^[0-9a-f]{32}$/.test(parts[0]) && /^[0-9a-f]{64}$/.test(parts[1]);
  const actual = demoPasswordHash(password, valid ? parts[0] : demoDummySalt);
  const expected = valid ? stored : demoArgonPrefix + demoDummySalt + ":" + "0".repeat(64);
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return valid && diff === 0;
}

function demoResponse(content, status = 200) {
  const response = render(content, status);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Content-Security-Policy", response.headers.get("Content-Security-Policy") + "; frame-ancestors 'none'");
  return response;
}

function demoRedirect(path, cookie) {
  const headers = new Headers({ location: path, "cache-control": "no-store" });
  if (cookie !== undefined) headers.set("Set-Cookie", demoCookie + "=" + cookie +
    "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=" + (cookie ? demoSessionAge : 0));
  return new Response(null, { status: 303, headers });
}

async function demoSession(request, db) {
  const cookies = (request.headers.get("cookie") || "").split(";").map((value) => value.trim());
  const token = cookies.find((value) => value.startsWith(demoCookie + "="))?.slice(demoCookie.length + 1);
  if (!/^[0-9a-f]{64}$/.test(token ?? "")) return null;
  const tokenHash = await demoDigest(token);
  return await db.prepare(`SELECT a.id,a.username,a.passwordHash,a.passwordVersion,s.tokenHash
    FROM DemoSession s JOIN DemoAccount a ON a.id=s.accountId
    WHERE s.tokenHash=? AND s.expiresAt>? AND a.passwordVersion=s.passwordVersion`).bind(tokenHash, demoNow()).first();
}

async function demoIssueSession(db, account) {
  const token = demoRandom(32);
  await db.batch([
    db.prepare("DELETE FROM DemoSession WHERE expiresAt<=?").bind(demoNow()),
    db.prepare("INSERT INTO DemoSession(tokenHash,accountId,passwordVersion,expiresAt) VALUES(?,?,?,?)")
      .bind(await demoDigest(token), account.id, account.passwordVersion, demoNow() + demoSessionAge),
  ]);
  return demoRedirect("/", token);
}

async function demoLimit(db, request, action, username) {
  const window = Math.floor(demoNow() / 600);
  const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
  const [ip, account] = await Promise.all([
    demoDigest(action + ":ip:" + clientIp), demoDigest(action + ":account:" + username),
  ]);
  const count = (key, max) => db.prepare(`INSERT INTO DemoAuthAttempt(key,window,hits) VALUES(?,?,1)
    ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN window=excluded.window THEN min(hits+1,?) ELSE 1 END,
    window=excluded.window RETURNING hits`).bind(key, window, max + 1);
  const [, fromIp, fromAccount] = await db.batch([
    db.prepare("DELETE FROM DemoAuthAttempt WHERE window<?").bind(window - 1),
    count(ip, 25), count(account, 8),
  ]);
  return fromIp.results[0].hits <= 25 && fromAccount.results[0].hits <= 8;
}

const demoInput = (label, name, type, autocomplete, max = 128) =>
  `<label>${label}<input name="${name}" type="${type}" autocomplete="${autocomplete}" maxlength="${max}" ${name === "username" ? 'autocapitalize="none" spellcheck="false"' : ""} required></label>`;
const demoButton = (label) => `<button class="button">${label}</button>`;
const demoError = (message) => message ? `<p role="alert">${escape(message)}</p>` : "";

function demoCredentials(register, message = "", status = 200) {
  const action = register ? "/register" : "/login";
  const title = register ? "创建演示账号" : "登录 LifeCycle Hub";
  return demoResponse(hero(title, register ? "使用邀请码创建自己的演示账号。" : "使用 LifeCycle Hub 用户名和密码登录。") +
    `<section class="panel">${demoError(message)}<form method="post" action="${action}">
    ${demoInput("用户名", "username", "text", "username", 32)}
    ${demoInput("密码", "password", "password", register ? "new-password" : "current-password")}
    ${register ? demoInput("邀请码", "invitation", "text", "off", 64) : ""}
    ${demoButton(title)}</form><p>${register ? link("/login", "已有账号，前往登录") : link("/register", "使用邀请码开户")}</p></section>`, status);
}

function demoAccountPage(account, message = "", status = 200) {
  return demoResponse(hero("我的账号", "已登录为 " + escape(account.username)) +
    `<section class="panel">${demoError(message)}<form action="/account/password" method="post">
    ${demoInput("当前密码", "password", "password", "current-password")}
    ${demoInput("新密码（至少 12 个字符）", "newPassword", "password", "new-password")}
    ${demoButton("修改密码")}</form><form action="/logout" method="post">${demoButton("退出登录")}</form></section>`, status);
}

async function demoAuthRoute(request, env, url) {
  const { DB: db } = env;
  const path = url.pathname;
  // Sites may pass its internal routing origin in the Worker request URL.
  const publicUrl = new URL(env.DEMO_PUBLIC_ORIGIN || url.origin);
  publicUrl.pathname = url.pathname;
  publicUrl.search = url.search;
  const isPost = request.method === "POST";
  const origin = request.headers.get("origin");
  // The embedded browser can redact Origin on a same-origin form navigation.
  const fetchSite = request.headers.get("sec-fetch-site");
  const embeddedSameOrigin = origin === "null" && fetchSite === "same-origin";
  if (isPost && (fetchSite === "cross-site" || (origin !== publicUrl.origin && !embeddedSameOrigin))) {
    return demoResponse(hero("请求来源无效", ""), 403);
  }
  const session = await demoSession(request, db);
  if (path === "/") {
    if (isPost) return demoResponse(hero("请求方法不支持", ""), 405);
    if (!session) return demoCredentials(false);
  }
  const accountRoute = ["/account", "/account/password", "/logout"].includes(path);
  if (accountRoute && !session) return isPost ? demoResponse(hero("请先登录", ""), 401) : demoRedirect("/login");
  if (path === "/account" && !isPost) return demoAccountPage(session);
  if (path === "/logout" && isPost) {
    await db.prepare("DELETE FROM DemoSession WHERE tokenHash=?").bind(session.tokenHash).run();
    return demoRedirect("/login", "");
  }
  const registration = path === "/register";
  const credentials = registration || path === "/login";
  const passwordChange = path === "/account/password" && isPost;
  if (credentials && !isPost) return session ? demoRedirect("/account") : demoCredentials(registration);
  if (!credentials && !passwordChange) {
    return accountRoute ? demoResponse(hero("请求方法不支持", ""), 405) :
      session ? await demoBusiness(request, env, publicUrl, session) :
        demoResponse(hero("请先登录", "", link("/login", "前往登录")), 401);
  }
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
    return demoResponse(hero("表单格式无效", ""), 415);
  }
  const reject = (message, status) => passwordChange
    ? demoAccountPage(session, message, status) : demoCredentials(registration, message, status);
  if (Number(request.headers.get("content-length")) > 4096) return reject("表单过大。", 413);
  let form;
  try {
    form = await request.formData();
  } catch {
    console.warn("demo_auth.form_invalid", path);
    return reject("无法读取表单，请刷新后重新输入。", 400);
  }
  const usernameInput = form.get("username");
  const username = passwordChange ? session.username : String(usernameInput ?? "").normalize("NFKC").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!passwordChange && !form.has("username")) {
    console.warn("demo_auth.field_missing", path, "username");
    return reject("服务端未收到用户名，请刷新后重新提交。", 400);
  }
  if (!username) return reject("用户名字段为空，请手动输入用户名。", 400);
  if (username.length < 3 || username.length > 32) return reject("用户名长度须为 3–32 个字符。", 400);
  if (!/^[a-z0-9]/.test(username)) return reject("用户名第一个字符须是英文字母或数字。", 400);
  if (!/^[a-z0-9_.-]+$/.test(username)) return reject("用户名含有不支持的字符。请手动输入英文字母、数字、点、短横线或下划线。", 400);
  if (!password) {
    console.warn("demo_auth.field_empty", path, form.has("password") ? "password-empty" : "password-missing");
    return reject("服务端未收到密码，请重新输入密码后提交。", 400);
  }
  if (demoEncoder.encode(password).length > 512) return reject("密码超过允许长度。", 400);
  if (!await demoLimit(db, request, path, username)) return reject("请求过于频繁，请稍后重试。", 429);
  if (registration) {
    const invitation = form.get("invitation") || "";
    if ([...password].length < 12 || !/^[A-Za-z0-9_-]{24,64}$/.test(invitation)) {
      return reject("请输入有效的邀请码和至少 12 个字符的密码。", 400);
    }
    const invitationHash = await demoDigest(invitation);
    if (!(env.DEMO_INVITATION_HASHES || "").split(/\s+/).includes(invitationHash)) {
      return reject("账号创建失败，请核对用户名和邀请码。", 400);
    }
    const account = { id: crypto.randomUUID(), passwordVersion: 1 };
    const result = await db.prepare(`INSERT OR IGNORE INTO DemoAccount(id,username,passwordHash,invitationHash,createdAt)
      VALUES(?,?,?,?,?)`).bind(account.id, username, demoPasswordHash(password), invitationHash, demoNow()).run();
    if (!result.meta.changes) return reject("账号创建失败，请核对用户名和邀请码。", 400);
    return demoIssueSession(db, account);
  }
  const account = passwordChange ? session : await db.prepare(
    "SELECT id,passwordHash,passwordVersion FROM DemoAccount WHERE username=?").bind(username).first();
  if (!demoCheckPassword(password, account?.passwordHash)) return reject("用户名或密码错误。", 401);
  if (!passwordChange) return demoIssueSession(db, account);
  const next = form.get("newPassword") || "";
  if ([...next].length < 12 || demoEncoder.encode(next).length > 512) return reject("新密码至少需要 12 个字符。", 400);
  const result = await db.prepare(`UPDATE DemoAccount SET passwordHash=?,passwordVersion=passwordVersion+1
    WHERE id=? AND passwordVersion=?`).bind(demoPasswordHash(next), account.id, account.passwordVersion).run();
  if (!result.meta.changes) return demoRedirect("/login", "");
  return demoIssueSession(db, { ...account, passwordVersion: account.passwordVersion + 1 });
}

async function demoBusiness(request, env, url, session) {
  const db = await demoWorkspace(env.DB, session.id);
  const headers = new Headers(request.headers);
  headers.set("oai-authenticated-user-id", session.id);
  // Business routes use the canonical origin after the demo gate approves the POST.
  if (request.method === "POST") headers.set("origin", url.origin);
  const scopedRequest = new Request(request, { headers });
  const response = await businessRoute(scopedRequest, { DB: db }, url, session.id);
  response.headers.set("Cache-Control", "no-store");
  if (response.headers.get("content-type")?.includes("text/html")) {
    const html = (await response.text()).replace("</nav>", '<a href="/account">我的账号</a></nav>');
    return new Response(html, { status: response.status, headers: response.headers });
  }
  return response;
}
