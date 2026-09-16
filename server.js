"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createReadStream, existsSync } = require("node:fs");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const SEED_DIR = path.join(ROOT, "seed", "packs");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const PACKS_DIR = path.join(DATA_DIR, "packs");
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY = 512 * 1024;
const PACK_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function text(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function slugify(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return raw || "paket";
}

function uniqueId(base, used) {
  let id = PACK_ID.test(base) ? base : slugify(base);
  if (!used.has(id)) {
    return id;
  }
  let n = 2;
  while (used.has(`${id}-${n}`)) {
    n += 1;
  }
  return `${id}-${n}`;
}

function packPath(id) {
  return path.join(PACKS_DIR, `${id}.json`);
}

function isSafePackId(id) {
  return PACK_ID.test(id);
}

function normalizeProduct(raw, usedIds) {
  const name = String(raw && raw.name ? raw.name : "").trim();
  if (!name) {
    throw new Error("Jeder Artikel braucht einen Namen.");
  }
  const price = Number(raw.price);
  if (!Number.isFinite(price) || price < 0 || price > 9999) {
    throw new Error(`Ungültiger Preis für „${name}“.`);
  }
  const requested = String(raw.id || "")
    .trim()
    .toLowerCase();
  const id = uniqueId(requested || slugify(name), usedIds);
  usedIds.add(id);
  return { id, name, price: Math.round(price * 100) / 100 };
}

function normalizePack(raw, fallbackId) {
  const id = String((raw && raw.id) || fallbackId || "")
    .trim()
    .toLowerCase();
  if (!isSafePackId(id)) {
    throw new Error("Paket-ID: Kleinbuchstaben, Zahlen und Bindestriche.");
  }
  const name = String((raw && raw.name) || id).trim() || id;
  const list = Array.isArray(raw && raw.products) ? raw.products : [];
  const usedIds = new Set();
  const products = list.map((item) => normalizeProduct(item, usedIds));
  return { id, name, products };
}

async function listPackFiles() {
  const names = await fs.readdir(PACKS_DIR);
  return names.filter((name) => name.endsWith(".json")).sort();
}

async function readPack(id) {
  const file = packPath(id);
  const raw = await fs.readFile(file, "utf8");
  return normalizePack(JSON.parse(raw), id);
}

async function writePack(pack) {
  const file = packPath(pack.id);
  const tmp = `${file}.${process.pid}.tmp`;
  const body = `${JSON.stringify(pack, null, 2)}\n`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, file);
}

async function ensureData() {
  await fs.mkdir(PACKS_DIR, { recursive: true });
  const existing = await listPackFiles();
  if (existing.length > 0) {
    return;
  }
  const seeds = await fs.readdir(SEED_DIR);
  for (const name of seeds) {
    if (!name.endsWith(".json")) {
      continue;
    }
    await fs.copyFile(path.join(SEED_DIR, name), path.join(PACKS_DIR, name));
  }
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function matchApi(urlPath) {
  const packs = urlPath.match(/^\/api\/packs\/([^/]+)(\/copy)?$/);
  if (urlPath === "/api/packs") {
    return { collection: true };
  }
  if (!packs) {
    return null;
  }
  return { id: decodeURIComponent(packs[1]), copy: Boolean(packs[2]) };
}

async function handleApi(req, res, url) {
  const route = matchApi(url.pathname);
  if (!route) {
    json(res, 404, { error: "Nicht gefunden" });
    return;
  }

  if (route.collection && req.method === "GET") {
    const files = await listPackFiles();
    const packs = [];
    for (const name of files) {
      const id = name.slice(0, -5);
      try {
        const pack = await readPack(id);
        packs.push({
          id: pack.id,
          name: pack.name,
          productCount: pack.products.length,
        });
      } catch {
        packs.push({ id, name: id, productCount: 0, broken: true });
      }
    }
    json(res, 200, { packs });
    return;
  }

  if (route.collection && req.method === "POST") {
    const body = await parseBody(req);
    const files = await listPackFiles();
    const used = new Set(files.map((name) => name.slice(0, -5)));
    const id = uniqueId(body.id || slugify(body.name || "paket"), used);
    const pack = normalizePack({ ...body, id }, id);
    await writePack(pack);
    json(res, 201, pack);
    return;
  }

  if (!isSafePackId(route.id)) {
    json(res, 400, { error: "Ungültige Paket-ID" });
    return;
  }

  if (route.copy) {
    if (req.method !== "POST") {
      json(res, 405, { error: "Methode nicht erlaubt" });
      return;
    }
    const source = await readPack(route.id);
    const body = await parseBody(req);
    const files = await listPackFiles();
    const used = new Set(files.map((name) => name.slice(0, -5)));
    const id = uniqueId(body.id || slugify(body.name || `${source.name}-kopie`), used);
    const pack = normalizePack(
      {
        id,
        name: String(body.name || `${source.name} Kopie`).trim(),
        products: source.products,
      },
      id
    );
    await writePack(pack);
    json(res, 201, pack);
    return;
  }

  if (req.method === "GET") {
    try {
      json(res, 200, await readPack(route.id));
    } catch (error) {
      if (error && error.code === "ENOENT") {
        json(res, 404, { error: "Paket nicht gefunden" });
        return;
      }
      throw error;
    }
    return;
  }

  if (req.method === "PUT") {
    const body = await parseBody(req);
    const pack = normalizePack({ ...body, id: route.id }, route.id);
    await writePack(pack);
    json(res, 200, pack);
    return;
  }

  if (req.method === "DELETE") {
    try {
      await fs.unlink(packPath(route.id));
    } catch (error) {
      if (error && error.code === "ENOENT") {
        json(res, 404, { error: "Paket nicht gefunden" });
        return;
      }
      throw error;
    }
    json(res, 200, { ok: true, id: route.id });
    return;
  }

  json(res, 405, { error: "Methode nicht erlaubt" });
}

function safeJoinPublic(urlPath) {
  const relative = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const resolved = path.resolve(PUBLIC_DIR, relative);
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) {
    return null;
  }
  return resolved;
}

function serveStatic(req, res, urlPath) {
  const filePath = urlPath === "/" ? path.join(PUBLIC_DIR, "index.html") : safeJoinPublic(urlPath);
  if (!filePath) {
    text(res, 400, "Bad path");
    return;
  }
  if (!existsSync(filePath)) {
    text(res, 404, "Not found");
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
  });
  createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      text(res, 200, "ok");
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      text(res, 405, "Method not allowed");
      return;
    }

    if (url.pathname === "/" || url.pathname.startsWith("/p/")) {
      serveStatic(req, res, "/index.html");
      return;
    }

    serveStatic(req, res, url.pathname);
  } catch (error) {
    const message = error && error.message ? error.message : "Interner Fehler";
    if (message === "Invalid JSON") {
      json(res, 400, { error: "Ungültiges JSON" });
      return;
    }
    if (message === "Payload too large") {
      json(res, 413, { error: "Zu groß" });
      return;
    }
    if (message.startsWith("Ungültig") || message.startsWith("Jeder") || message.startsWith("Paket")) {
      json(res, 400, { error: message });
      return;
    }
    if (error && error.code === "ENOENT") {
      json(res, 404, { error: "Paket nicht gefunden" });
      return;
    }
    console.error(error);
    json(res, 500, { error: "Interner Fehler" });
  }
});

ensureData()
  .then(() => {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Kasse läuft auf Port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Start fehlgeschlagen:", error);
    process.exit(1);
  });
