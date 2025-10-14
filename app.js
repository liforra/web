const fs = require("node:fs");
const express = require("express");
const { exec } = require("child_process");
const { request } = require("node:http");
const { execSync } = require("child_process");
const { Pool } = require("pg");
const app = express();
const port = process.env.PORT;
const http = require("http");
const uap = require("ua-parser-js");
const path = require("path");
const cookieParser = require("cookie-parser");

// Middleware for static files
app.use(express.static("public"));
app.use(express.static("keyfiles"));
app.use(express.json());

// After app = express();
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));

const TERMS_COOKIE_NAME = "t3_terms_accepted";
const TERMS_COOKIE_VALUE = "true";
const TERMS_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
const TERMS_ACCEPT_PATH = "/__accept-terms";
const TOS_FILE_ABS = path.resolve(__dirname, "public", "tos.html");

// Database configuration
const DB_TYPE = process.env.BOT_DATABASE_TYPE || "json";
const DB_URL =
  process.env.BOT_DATABASE_URL || "file:///home/liforra/bot-users.json";
const DB_USER = process.env.BOT_DATABASE_USER;
const DB_PASSWORD = process.env.BOT_DATABASE_PASSWORD;

// Initialize PostgreSQL pool if needed
let pgPool = null;
if (DB_TYPE === "postgres") {
  pgPool = new Pool({
    connectionString: DB_URL,
    user: DB_USER,
    password: DB_PASSWORD,
  });

  // Create tables if they don't exist
  pgPool
    .query(
      `
    -- Table for tracking all emails ever used by a user
    CREATE TABLE IF NOT EXISTS bot_user_emails (
      id SERIAL PRIMARY KEY,
      discord_user_id TEXT NOT NULL,
      email TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_user_emails_discord_id 
      ON bot_user_emails(discord_user_id);

    -- Table for current user state
    CREATE TABLE IF NOT EXISTS bot_users (
      discord_user_id TEXT PRIMARY KEY,
      username TEXT,
      avatar TEXT,
      code TEXT,
      access_token TEXT,
      refresh_token TEXT,
      expires_at TIMESTAMP,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `
    )
    .catch((err) => console.error("Error creating tables:", err));
}

// Database abstraction layer
async function saveUserData(userData) {
  if (DB_TYPE === "postgres" && pgPool) {
    // Save to PostgreSQL with new structure
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");

      if (userData.userId) {
        // Insert/Update email history (only if email exists)
        if (userData.email) {
          await client.query(
            `
            INSERT INTO bot_user_emails (discord_user_id, email)
            VALUES ($1, $2)
          `,
            [userData.userId, userData.email]
          );
        }

        // Upsert current user state
        await client.query(
          `
            INSERT INTO bot_users (
              discord_user_id, username, avatar, code, 
              access_token, refresh_token, expires_at, last_updated
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
            ON CONFLICT (discord_user_id) 
            DO UPDATE SET
              username = EXCLUDED.username,
              avatar = EXCLUDED.avatar,
              code = EXCLUDED.code,
              access_token = EXCLUDED.access_token,
              refresh_token = EXCLUDED.refresh_token,
              expires_at = EXCLUDED.expires_at,
              last_updated = CURRENT_TIMESTAMP
          `,
          [
            userData.userId,
            userData.username,
            userData.avatar,
            userData.code,
            userData.tokens.access_token,
            userData.tokens.refresh_token,
            userData.tokens.expires_at,
          ]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } else {
    // Save to JSON file (default) - keep original structure for compatibility
    const filePath = DB_URL.startsWith("file://")
      ? DB_URL.replace("file://", "")
      : DB_URL;

    let users = [];
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      users = JSON.parse(data);
    } catch (err) {
      console.log("Creating new users file at", filePath);
    }

    users.push(userData);
    fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
  }
}

// Simple bot detector (same as earlier logic)
function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = String(userAgent).toLowerCase();
  const botKeywords = [
    "bot",
    "crawl",
    "spider",
    "slurp",
    "bingpreview",
    "facebookexternalhit",
    "applesearch",
    "google",
    "duckduckbot",
    "baiduspider",
    "yandex",
    "discordbot",
    "twitterbot",
    "whatsapp",
    "embedly",
    "linkedinbot",
    "vkshare",
    "telegrambot",
    "okhttp",
    "curl",
    "wget",
    "python-requests",
    "java/",
    "libwww",
    "go-http-client",
  ];
  return botKeywords.some((k) => ua.includes(k));
}

// Gate ONLY the /bot route (no redirect): serve tos.html content until accepted
app.use((req, res, next) => {
  // Allow the accept endpoint to work
  if (req.path === TERMS_ACCEPT_PATH) return next();

  // Only apply to /bot
  if (!req.path.startsWith("/bot")) return next();

  // Let bots/crawlers through
  if (isBot(req.headers["user-agent"])) return next();

  // If accepted, proceed
  if (req.cookies?.[TERMS_COOKIE_NAME] === TERMS_COOKIE_VALUE) return next();

  // Serve tos.html content for this request (URL stays /bot?...). Inject returnTo.
  const originalURL = req.originalUrl || "/bot";
  try {
    let tosHtml = fs.readFileSync(TOS_FILE_ABS, "utf8");
    tosHtml = tosHtml.replace(
      /%%RETURN_TO%%/g,
      encodeURIComponent(originalURL)
    );
    res.status(200).type("html").send(tosHtml);
  } catch (e) {
    res
      .status(200)
      .type("text")
      .send("ToS page not found. Please add public/tos.html");
  }
});

// Accept endpoint: set cookie and go back to original URL (e.g., /bot?code=...)
app.post(TERMS_ACCEPT_PATH, (req, res) => {
  const encoded = (req.body && req.body.returnTo) || "%2Fbot";
  let returnTo = "/bot";
  try {
    returnTo = decodeURIComponent(encoded);
  } catch {}
  // Prevent open redirects (must be same-origin relative)
  if (!returnTo.startsWith("/")) returnTo = "/bot";

  res.cookie(TERMS_COOKIE_NAME, TERMS_COOKIE_VALUE, {
    httpOnly: true,
    secure: true, // enable when behind HTTPS
    sameSite: "lax",
    maxAge: TERMS_COOKIE_MAX_AGE_MS,
    path: "/",
  });

  return res.redirect(returnTo);
});

app.use((req, res, next) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
  let ua = uap(req.headers["user-agent"]);
  next(); // Pass control to the next middleware/route
  if (ip != "127.0.0.1") {
    fetch(process.env.NTFY, {
      method: "POST",
      headers: {
        Title: "Website",
        Priority: "high",
      },
      body: `${ip} - ${req.url} --- ${ua.browser["name"]} ${ua.browser["version"]} ${ua.os["name"]} ${ua.os["version"]}`,
    }).catch((err) => {
      console.error("Failed to send notification:", err);
    });
  }
  console.log(
    `${ip} - ${req.url} --- ${ua.browser["name"]} ${ua.browser["version"]} ${ua.os["name"]} ${ua.os["version"]}`
  );
});

function readpath(path) {
  try {
    return fs.readFileSync(__dirname + "/" + path + "/index.html", "utf8");
  } catch (error) {
    throw error;
  }
}
function site(path) {
  try {
    return fs.readFileSync(__dirname + "/" + path + ".html", "utf8");
  } catch (error) {
    throw error;
  }
}
function readfile(path) {
  try {
    return fs.readFileSync(__dirname + "/" + path, "utf8");
  } catch (error) {
    throw error;
  }
}
function isServiceUp(url) {
  try {
    execSync(`curl -Is --max-time 5 ${url} | head -n 1 | grep "200"`, {
      stdio: "ignore",
    });
    console.log("I'm able to reach " + url);
    return true;
  } catch {
    console.log("I'm not able to reach " + url);
    return false;
  }
}

// -- Routes
app.get("/", (req, res) => {
  res.end(readpath("/"));
});
app.get("/sitemap.xml", (req, res) => {
  res.end(readfile("/sitemap.xml"));
});
app.get("/favicon.png", (req, res) => {
  res.setHeader("Content-Type", "image/png");
  res.sendFile(__dirname + "/favicon.png");
});
app.get("/favicon.ico", (req, res) => {
  res.sendFile(__dirname + "/favicon.ico");
  res.end();
});

app.get("/robots.txt", (req, res) => {
  res.end(readfile("/robots.txt"));
});

app.get("/bot", async (req, res) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
  const code = req.query.code;
  const ua = uap(req.headers["user-agent"]);

  let userData = {
    ip: ip,
    code: code || null,
    timestamp: new Date().toISOString(),
    browser: `${ua.browser.name} ${ua.browser.version}`,
    os: `${ua.os.name} ${ua.os.version}`,
    rawUserAgent: req.headers["user-agent"],
    username: null,
    email: null,
    userId: null,
    avatar: null,
    guilds: [],
    tokens: {
      access_token: null,
      refresh_token: null,
      expires_at: null,
    },
  };

  // If we have a code, exchange it for Discord user info
  if (code) {
    try {
      // Exchange code for access token
      const tokenResponse = await fetch(
        "https://discord.com/api/oauth2/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: "authorization_code",
            code: code,
            redirect_uri: process.env.DISCORD_REDIRECT_URI,
          }),
        }
      );

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;
        const expiresIn = tokenData.expires_in; // seconds until expiry

        // Store tokens for later use
        userData.tokens.access_token = accessToken;
        userData.tokens.refresh_token = refreshToken;
        userData.tokens.expires_at = new Date(
          Date.now() + expiresIn * 1000
        ).toISOString();

        // Fetch user info
        const userResponse = await fetch("https://discord.com/api/users/@me", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (userResponse.ok) {
          const userInfo = await userResponse.json();
          userData.username = `${userInfo.username}#${userInfo.discriminator}`;
          userData.email = userInfo.email || null;
          userData.userId = userInfo.id;
          userData.avatar = userInfo.avatar;
        }

        // Fetch guilds
        // const guildsResponse = await fetch(
        //   "https://discord.com/api/users/@me/guilds",
        //   {
        //     headers: {
        //       Authorization: `Bearer ${accessToken}`,
        //     },
        //   }
        //);

        // if (guildsResponse.ok) {
        // const guilds = await guildsResponse.json();
        // userData.guilds = guilds.map((guild) => ({
        // id: guild.id,
        // name: guild.name,
        // icon: guild.icon,
        // owner: guild.owner || false,
        // }));
        // }

        console.log("Successfully fetched Discord user data");
      } else {
        console.error(
          "Failed to exchange OAuth code:",
          await tokenResponse.text()
        );
      }
    } catch (err) {
      console.error("Error fetching Discord user info:", err);
    }
  }

  // Save user data
  try {
    await saveUserData(userData);
    console.log("Logged user:", userData);
  } catch (err) {
    console.error("Error logging user data:", err);
  }

  res.sendFile(path.join(__dirname, "thanks.html"));
});

app.get("/me", (req, res) => {
  res.end(site("/me"));
});

app.get("/donate", (req, res) => {
  if (req.query.success == "true") {
    res.end(site("/donate/success"));
  } else if (req.query.success == "false") {
    res.end(site("/donate/failed"));
  } else {
    res.end(site("/donate/index"));
    console.log(req.query.success);
  }
});

app.get("/projects", (req, res) => {
  let html = site("projects");
  console.log("Im running more then once");
  const services = {
    SEARCH_CLASS: isServiceUp("https://search.liforra.de/")
      ? "online"
      : "offline",
    VAULT_CLASS: isServiceUp("https://v.liforra.de/") ? "online" : "offline",
    TOOLS_CLASS: isServiceUp("https://nerds.liforra.de/")
      ? "online"
      : "offline",
    CLOUD_CLASS: isServiceUp("https://cloud.liforra.de/")
      ? "online"
      : "offline",
    SEND_CLASS: isServiceUp("https://send.liforra.de/") ? "online" : "offline",
  };

  for (const [placeholder, status] of Object.entries(services)) {
    html = html.replace(`{{${placeholder}}}`, status);
  }

  res.end(html);
});
app.get("/key/raw/:id", (req, res) => {
  let keys = JSON.parse(readfile("keys/keys.json"));
  let key = keys.find(
    (k) => k.id.toLowerCase() === req.params.id.toLowerCase()
  );

  if (key) {
    res.end(readfile(key.pubkey_url));
  }
});

app.get("/keys", (req, res) => {
  let keys = JSON.parse(readfile("keys/keys.json"));
  const structure = site("structure/key");
  let html = site("/keys");
  keys.forEach((key) => {
    data = structure;
    data = data.replace(/{{PGPKEYNAME}}/g, key.name);
    data = data.replace(/{{DESC}}/g, key.desc);
    data = data.replace(/{{id}}/g, key.id);
    data = data + "{{INSERTKEY}}\n";
    html = html.replace(/{{INSERTKEY}}/g, data);
    console.log(html);
  });
  html = html.replace(/{{INSERTKEY}}/g, "");
  res.send(html);
});

app.get("/key/:id", (req, res) => {
  let keys = JSON.parse(readfile("keys/keys.json"));
  let key = keys.find(
    (k) => k.id.toLowerCase() === req.params.id.toLowerCase()
  );

  if (key) {
    let html = site("key");
    html = html.replace(/{{PGPKEYNAME}}/g, key.name);
    html = html.replace(/{{DESC}}/g, key.desc);
    html = html.replace(/{{FINGERPRINT}}/g, key.fingerprint);
    htmlsafekey = readfile(key.pubkey_url).replace(/\n/g, "<br>");
    html = html.replace(/{{PGPKEY}}/g, htmlsafekey);
    html = html.replace(/{{KEYURL}}/g, key.pubkey_url);
    html = html.replace(/{{id}}/g, key.id);
    res.send(html);
    res.end();
  } else {
    res.status(404).send("Key not found");
  }
});
app.get("/banners", (req, res) => {
  res.end(site("banners"));
});

// -- Folders
app.use("/fonts", express.static("assets/fonts"));
app.use("/banners", express.static("assets/88x31"));
app.use("/old", express.static("old-website"));
app.use("/assets/tor", express.static("assets/tor"));
app.use("/keys", express.static("keys"));
app.use("/assets/icons", express.static("assets/icons"));
app.use("/simplex", express.static("simplex"));
app.use("/.well-known", express.static(".well-known"));

// -- Files
//app.get('/theme.css', (req, res) => {
//    res.setHeader('Content-Type','text/css')
//    res.end(readfile("node_modules/snes.css/dist/snes.css"));
//});
//app.get('/styles.css', (req, res) => {
//    res.setHeader('Content-Type','text/css')
//    res.end(readfile("/styles.css"));
//});

app.get("/checkDomain", (req, res) => {
  res.setHeader("Content-Type", "text/css");
  if (req.header("Host") == "liforra.de") {
    res.send(readfile("conditionalFiles/main.css"));
  } else if (
    req.header("Host") ==
    "ekbyky7ey2d7arb7q6uctyaf4vhb72zlcpsdokmscsdpe6vvwcrrtkid.onion"
  ) {
    res.send(readfile("conditionalFiles/onion.css"));
  } else if (
    req.header("Host") ==
    "q3hpmogpmbv25pdvrceqr3ku454el4xam3u2iugooywfdsb5khea.b32.i2p"
  ) {
    res.send(readfile("conditionalFiles/i2p.css"));
  } else {
    res.send(readfile("conditionalFiles/unknown.css"));
  }
  res.end();
});

// --- Redirects ---

app.get("/redir", (req, res) => {
  const targetUrl = req.query.url || "";

  // Load redir.html
  let html = site("redir");
  // Replace {{URL}} with the provided URL
  html = html.replace(/{{URL}}/g, targetUrl);

  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

app.get("/simplexchat", (req, res) => {
  res.statusCode = 301;
  res.setHeader(
    "Location",
    "https://smp16.simplex.im/a#BWKNrxRGVVY-TLEW_C3U-rGavO8MbwY-E4k5Jrkgsf8"
  );
  res.end();
});

// Signal
app.get("/signal", (req, res) => {
  res.statusCode = 301;
  res.setHeader(
    "Location",
    "https://signal.me/#eu/Dljz4HbJUL2dGuYqccBGgqRkHnVei_gq-s7FV9CB6NiZ2X_VEqRPoogqILPkgBLW"
  );
  res.end();
});

// Matrix (Beeper)
app.get("/matrix", (req, res) => {
  res.statusCode = 301;
  res.setHeader("Location", "https://matrix.to/#/@liforra:beeper.com");
  res.end();
});

// WhatsApp
app.get("/whatsapp", (req, res) => {
  res.statusCode = 301;
  res.setHeader(
    "Location",
    "https://app.formbricks.com/s/cmeaaempicq9vu601vqx8u4fa"
  );
  res.end();
});

// Session
app.get("/session", (req, res) => {
  res.statusCode = 301;
  res.setHeader(
    "Location",
    "https://getsession.org/#05f0a919336cb3589337b5bd9ffd5c03e0ca042be19d81a1ec1e417cb3ccec842f"
  );
  res.end();
});

// Discord
app.get("/discord", (req, res) => {
  res.statusCode = 301;
  res.setHeader("Location", "https://discord.com/users/liforra");
  res.end();
});

// Telegram
app.get("/telegram", (req, res) => {
  res.statusCode = 301;
  res.setHeader("Location", "https://t.me/liforra");
  res.end();
});

// Snapchat
app.get("/snapchat", (req, res) => {
  res.statusCode = 301;
  res.setHeader(
    "Location",
    "https://www.snapchat.com/add/liforra?share_id=YeKk2mVRsgY&locale=en-DE"
  );
  res.end();
});

// X (Twitter)
app.get("/x", (req, res) => {
  res.statusCode = 301;
  res.setHeader("Location", "https://x.com/Liforra2");
  res.end();
});

// Email
app.get("/email", (req, res) => {
  res.statusCode = 301;
  res.setHeader("Location", "mailto:mail@liforra.de");
  res.end();
});

app.get("/search", (req, res) => {
  res.statusCode = 301;
  if (req.header("Host") == "liforra.de") {
    res.setHeader("Location", "https://s.liforra.de");
  } else if (
    req.header("Host") ==
    "ekbyky7ey2d7arb7q6uctyaf4vhb72zlcpsdokmscsdpe6vvwcrrtkid.onion"
  ) {
    res.setHeader(
      "Location",
      "http://2hj2tgkzj4w2kbwlt37ymk5z3lq7dskygw5qr5awmkx76p67yu3qn7qd.onion/"
    );
  } else {
    res.setHeader("Location", "/redir?url=https%3A%2F%2Fs.liforra.de");
  }
  res.end();
});
app.get("/vault", (req, res) => {
  res.statusCode = 301;
  if (req.header("Host") == "liforra.de") {
    res.setHeader("Location", "https://v.liforra.de");
  } else if (
    req.header("Host") ==r
    "ekbyky7ey2d7arb7q6uctyaf4vhb72zlcpsdokmscsdpe6vvwcrrtkid.onion"
  ) {
    res.setHeader(
      "Location",
      "http://lostzizeuqb5vfv5sab5xtaigzuhavd6itaalcj466uygav744klxtad.onion"
    );
  } else {
    res.setHeader("Location", "/redir?url=https%3A%2F%2Fv.liforra.de");
  }
  res.end();
});
app.get("/nerds", (req, res) => {
  res.statusCode = 301;
  if (req.header("Host") == "liforra.de") {
    res.setHeader("Location", "https://nerds.liforra.de");
  } else if (
    req.header("Host") ==
    "ekbyky7ey2d7arb7q6uctyaf4vhb72zlcpsdokmscsdpe6vvwcrrtkid.onion"
  ) {
    res.setHeader(
      "Location",
      "http://ifspoug4hzpkj27ujfbekcwpcenx5hb4ggbk6xii7xhwmmmbug5jtlyd.onion"
    );
  } else {
    res.setHeader("Location", "/redir?url=https%3A%2F%2Ftools.liforra.de");
  }
  res.end();
});

app.get("/t", (req, res) => {
  res.statusCode = 301;
  if (req.header("Host") == "liforra.de") {
    res.setHeader("Location", "https://t.liforra.de");
  } else if (
    req.header("Host") ==
    "ekbyky7ey2d7arb7q6uctyaf4vhb72zlcpsdokmscsdpe6vvwcrrtkid.onion"
  ) {
    res.setHeader(
      "Location",
      "http://saroor4xo6hlelunsrxkohpowpsm6arzl6n45bvzkxf5p6b2ivlcuaid.onion"
    );
  } else {
    res.setHeader("Location", "https://liforra.de/error?error=host");
  }
  res.end();
});

app.get("/relay", (req, res) => {
  res.statusCode = 301;
  if (req.header("Host") == "liforra.de") {
    res.setHeader(
      "Location",
      "https://metrics.torproject.org/rs.html#details/F30158BE186234337774F3FC9E5956F01B1DDBE6"
    );
  } else if (
    req.header("Host") ==
    "ekbyky7ey2d7arb7q6uctyaf4vhb72zlcpsdokmscsdpe6vvwcrrtkid.onion"
  ) {
    res.setHeader(
      "Location",
      "http://hctxrvjzfpvmzh2jllqhgvvkoepxb4kfzdjm6h7egcwlumggtktiftid.onion/rs.html#details/F30158BE186234337774F3FC9E5956F01B1DDBE6"
    );
  } else {
    res.setHeader(
      "Location",
      "/redir?url=https%3A%2F%2Fmetrics.torproject.org%2Frs.html%23details%2FF30158BE186234337774F3FC9E5956F01B1DDBE6"
    );
  }
  res.end();
});

app.get("/send", (req, res) => {
  res.statusCode = 301;
  if (req.header("Host") == "liforra.de") {
    res.setHeader("Location", "https://send.liforra.de");
  } else if (
    req.header("Host") ==
    "ekbyky7ey2d7arb7q6uctyaf4vhb72zlcpsdokmscsdpe6vvwcrrtkid.onion"
  ) {
    res.setHeader(
      "Location",
      "http://xudlwxzy7pb2ncctoaau7hs5jugc4brnmtxik3tlkzaeoprs4ccpqzyd.onion/"
    );
  } else {
    res.setHeader("Location", "/redir?url=https%3A%2F%2Fsend.liforra.de");
  }
  res.end();
});

//app.get('', (req, res) => {
//    res.statusCode = 301;
//    if (req.header('Host') == "liforra.de") {
//        res.setHeader('Location', 'https://.liforra.de');
//
//    } else if (req.header('Host') == "ekbyky7ey2d7arb7q6uctyaf4vhb72zlcpsdokmscsdpe6vvwcrrtkid.onion") {
//        res.setHeader('Location', "")
//    } else {
//        res.setHeader('Location', 'https://liforra.de/error?error=host')
//    }
//    res.end();
//});

app.get("/tools", (req, res) => {
  res.statusCode = 301;
  res.setHeader("Location", "https://nerds.liforra.de");
  res.end();
});

// -- API ---
app.post("/updatesite", (req, res) => {
  exec("git pull", (err, stdout, stderr) => {
    if (err) {
      res.statusCode = 500;
      res.end(stderr);
      return;
    } else {
      res.statusCode = 200;
      res.end(stdout);
    }

    // the *entire* stdout and stderr (buffered)
    console.log(`${stdout}`);
    console.log(`${stderr}`);
  });
});
app.get("/api/test", (req, res) => {
  res.json({ message: "API working!", timestamp: new Date() });
});
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});
