// Baixa TODOS os binários do Storage da origem para DEST_DIR (paralelismo controlado).
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEST = process.env.DEST_DIR || "./storage";
const CONC = Number(process.env.CONCURRENCY || 12);
if (!URL_BASE || !KEY) { console.error("faltam SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const h = { Authorization: `Bearer ${KEY}`, apikey: KEY, "Content-Type": "application/json" };

async function listBuckets() {
  const r = await fetch(`${URL_BASE}/storage/v1/bucket`, { headers: h });
  if (!r.ok) throw new Error(`bucket list ${r.status}`);
  return r.json();
}

async function listAll(bucket, prefix = "") {
  const out = [];
  let offset = 0;
  for (;;) {
    const r = await fetch(`${URL_BASE}/storage/v1/object/list/${bucket}`, {
      method: "POST", headers: h,
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!r.ok) break;
    const rows = await r.json();
    if (!rows.length) break;
    for (const it of rows) {
      const path = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null && !it.metadata) out.push(...(await listAll(bucket, path)));
      else out.push(path);
    }
    if (rows.length < 1000) break;
    offset += 1000;
  }
  return out;
}

async function pool(items, worker) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { await worker(items[idx]); } catch (e) { console.error("erro:", items[idx], e.message); }
      if (++done % 200 === 0) console.log(`  ${done}/${items.length}`);
    }
  }));
}

const buckets = await listBuckets();
console.log(`buckets: ${buckets.map((b) => b.name).join(", ")}`);
await mkdir(DEST, { recursive: true });
await writeFile(join(DEST, "_buckets.json"), JSON.stringify(buckets, null, 2));

for (const b of buckets) {
  const files = await listAll(b.name);
  console.log(`${b.name}: ${files.length} arquivos`);
  await pool(files, async (path) => {
    const r = await fetch(`${URL_BASE}/storage/v1/object/${b.name}/${encodeURI(path)}`, { headers: h });
    if (!r.ok) throw new Error(`GET ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const dest = join(DEST, b.name, path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, buf);
  });
}
console.log("download concluído");
