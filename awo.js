const crypto = require("crypto");
const fetch = require("node-fetch");
const AdmZip = require("adm-zip");

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// Maps SHA256 hashes -> config file paths
const CONFIG_MAP = {
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855": "/awo/config.toml",
  "eff0ec899ceaa71f448b1dae76aaa0bd22691b385e3ab14f70c738416f9092a2": "/awo/liforra.toml"
};

// Fetch the latest release info from GitHub
async function fetchLatestRelease() {
  const apiRes = await fetch("https://api.github.com/repos/liforra/glpi-tool/releases/latest");
  if (!apiRes.ok) throw new Error("Failed to fetch release info");
  return await apiRes.json();
}

// -- AWO GLPI EXE --
module.exports.glpiExe = async (req, res) => {
  try {
    const release = await fetchLatestRelease();
    const exe = release.assets.find(a => a.name.toLowerCase().endsWith(".exe"));
    if (!exe) return res.status(404).send("No .exe found");

    const assetRes = await fetch(exe.browser_download_url);
    if (!assetRes.ok) throw new Error("Failed to download asset");

    res.setHeader("Content-Disposition", `attachment; filename="${exe.name}"`);
    res.setHeader("Content-Type", "application/octet-stream");

    assetRes.body.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error downloading GLPI tool");
  }
};

// -- AWO GLPI EXE HASH --
module.exports.glpiExeHash = async (req, res) => {
  try {
    const release = await fetchLatestRelease();
    const exe = release.assets.find(a => a.name.toLowerCase().endsWith(".exe"));
    if (!exe) return res.status(404).send("No .exe found");

    const assetRes = await fetch(exe.browser_download_url);
    if (!assetRes.ok) throw new Error("Failed to download asset");

    const exeBuffer = Buffer.from(await assetRes.arrayBuffer());
    const hash = sha256(exeBuffer);
    res.send(hash);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error calculating GLPI exe hash");
  }
};

// -- AWO GLPI CONFIG TOML --
module.exports.configToml = (req, res, readfile) => {
  const hash = sha256(req.query.password || "");
  const filePath = CONFIG_MAP[hash];
  if (!filePath) return res.status(403).send("Invalid password");

  res.end(readfile(filePath));
};

// -- AWO GLPI CONFIG TOML HASH --
module.exports.configTomlHash = (req, res, readfile) => {
  const hash = sha256(req.query.password || "");
  const filePath = CONFIG_MAP[hash];
  if (!filePath) return res.status(403).send("Invalid password");

  const content = readfile(filePath);
  const hashOfConfig = sha256(content);
  res.send(hashOfConfig);
};

// -- AWO GLPI --
module.exports.glpi = async (req, res, readfile) => {
  try {
    const password = req.query.password || "";
    if (!password) {
      // Serve the glpi.html page when no password is provided
      return res.sendFile(__dirname + "/glpi.html");
    }

    const hash = sha256(password);
    const configPath = CONFIG_MAP[hash];
    if (!configPath) return res.status(403).send("Invalid password");

    const configContent = readfile(configPath);

    const release = await fetchLatestRelease();
    const exe = release.assets.find(a => a.name.toLowerCase().endsWith(".exe"));
    if (!exe) return res.status(404).send("No .exe found");

    const assetRes = await fetch(exe.browser_download_url);
    if (!assetRes.ok) throw new Error("Failed to download .exe");

    const exeBuffer = Buffer.from(await assetRes.arrayBuffer());

    // ZIP it
    const zip = new AdmZip();
    zip.addFile(exe.name, exeBuffer);
    zip.addFile("config.toml", Buffer.from(configContent));

    const zipBuffer = zip.toBuffer();

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=glpi-package.zip");
    res.end(zipBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error bundling GLPI files");
  }
};

// -- AWO GLPI HASH --
module.exports.glpiHash = async (req, res, readfile) => {
  try {
    const password = req.query.password || "";
    const hash = sha256(password);

    const configPath = CONFIG_MAP[hash];
    if (!configPath) return res.status(403).send("Invalid password");

    const configContent = readfile(configPath);

    const release = await fetchLatestRelease();
    const exe = release.assets.find(a => a.name.toLowerCase().endsWith(".exe"));
    if (!exe) return res.status(404).send("No .exe found");

    const assetRes = await fetch(exe.browser_download_url);
    if (!assetRes.ok) throw new Error("Failed to download .exe");

    const exeBuffer = Buffer.from(await assetRes.arrayBuffer());

    // ZIP it
    const zip = new AdmZip();
    zip.addFile(exe.name, exeBuffer);
    zip.addFile("config.toml", Buffer.from(configContent));

    const zipBuffer = zip.toBuffer();

    const hashOfZip = sha256(zipBuffer);
    res.send(hashOfZip);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error calculating GLPI zip hash");
  }
};

// -- AWO VERSION --
module.exports.version = async (req, res) => {
  try {
    const release = await fetchLatestRelease();
    res.send(release.tag_name); // Sending the version as the tag name of the latest release
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching version");
  }
};
