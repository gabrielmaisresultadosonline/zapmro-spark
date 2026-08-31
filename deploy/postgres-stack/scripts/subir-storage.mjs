// Sobe os binários baixados para a stack própria (idempotente: upsert).
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SRC = process.env.SRC_DIR || "./storage";
const CONC = Number(process.env.CONCURRENCY || 8);
if (!URL_BASE || !KEY) { console.error("faltam SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const h = { Authorization: `Bearer ${KEY}`, apikey: KEY };

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

let buckets = [];
try { buckets = JSON.parse(await readFile(join(SRC, "_buckets.json"), "utf8")); } catch {}
for (const b of buckets) {
  const r = await fetch(`${URL_BASE}/storage/v1/bucket`, {
    method: "POST", headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ id: b.id ?? b.name, name: b.name, public: !!b.public,
      file_size_limit: b.file_size_limit ?? null, allowed_mime_types: b.allowed_mime_types ?? null }),
  });
  console.log(`bucket ${b.name}: ${r.status}`);
}

const files = (await walk(SRC)).filter((f) => !f.endsWith("_buckets.json"));
console.log(`${files.length} arquivos para enviar`);

let i = 0, done = 0, fail = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < files.length) {
    const f = files[i++];
    const rel = relative(SRC, f).split(sep);
    const bucket = rel.shift();
    const path = rel.join("/");
    try {
      const body = await readFile(f);
      const r = await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
        method: "POST", headers: { ...h, "x-upsert": "true", "Content-Type": "application/octet-stream" }, body,
      });
      if (!r.ok && r.status !== 409) { fail++; console.error(`falhou ${bucket}/${path}: ${r.status}`); }
    } catch (e) { fail++; console.error(`erro ${bucket}/${path}: ${e.message}`); }
    if (++done % 200 === 0) console.log(`  ${done}/${files.length}`);
  }
}));
console.log(`upload concluído — ${done - fail} ok, ${fail} falhas`);
