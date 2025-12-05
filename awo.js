// awo.js

const express = require("express");
const fetch = require("node-fetch");
const crypto = require("crypto");
const AdmZip = require("adm-zip");
const fs = require("fs");
const toml = require("toml");

const router = express.Router(); // Use Router to modularize routes

// SHA256 function
function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// Maps SHA256 hashes -> config file paths
const CONFIG_MAP = {
  "2f35c9406d6df3a92364975625cadd01d62f4c1a0cbbe6100d6adb877661e339":
    "/awo/config.toml",
  eff0ec899ceaa71f448b1dae76aaa0bd22691b385e3ab14f70c738416f9092a2:
    "/awo/liforra.toml",
};

// Version endpoint
router.get("/version", async (req, res) => {
  try {
    const apiRes = await fetch(
      "https://api.github.com/repos/liforra/glpi-tool/releases/latest",
    );
    if (!apiRes.ok) throw new Error("Failed to fetch release info");

    const release = await apiRes.json();

    // Fetch config.toml from the release assets
    const tomlAsset = release.assets.find((a) =>
      a.name.toLowerCase().endsWith(".toml"),
    );
    if (!tomlAsset) return res.status(404).send("No .toml found");

    // Fetch and parse the config.toml
    const tomlRes = await fetch(tomlAsset.browser_download_url);
    if (!tomlRes.ok) throw new Error("Failed to download config.toml");

    const tomlContent = await tomlRes.text();
    const parsedToml = toml.parse(tomlContent);

    // Get the version from the TOML file
    const version = parsedToml.application.version;

    res.json({ version });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching version");
  }
});

// Hash endpoint (for every file endpoint)
router.get("/hash", async (req, res) => {
  try {
    const password = req.query.password || "";

    // Check hashes for glpi.exe and config.toml
    const hashes = {
      "glpi.exe": await getFileHash("/awo/glpi/glpi.exe"),
      "config.toml": await getFileHash("/awo/glpi/config.toml"),
    };

    // Add the hashes for any other file you serve
    if (password) {
      const hash = sha256(password);
      if (CONFIG_MAP[hash]) {
        const configFilePath = CONFIG_MAP[hash];
        hashes[configFilePath] = await getFileHash(configFilePath);
      }
    }

    res.json(hashes);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating file hashes");
  }
});

// Helper function to compute the file hash
async function getFileHash(filePath) {
  const fileContent = readfile(filePath);
  return sha256(fileContent);
}

// Helper function to simulate reading a file (replace with actual implementation)
function readfile(filePath) {
  // Just for the example, simulate a file read operation:
  if (filePath === "/awo/glpi/glpi.exe") {
    return fs.readFileSync("path/to/glpi.exe"); // Replace with actual file reading logic
  } else if (filePath === "/awo/glpi/config.toml") {
    return fs.readFileSync("path/to/config.toml", "utf8"); // Replace with actual file reading logic
  } else {
    return fs.readFileSync(filePath, "utf8");
  }
}

// Other existing endpoints can be added here, following the same structure

module.exports = router; // Export the router to be used in app.js
