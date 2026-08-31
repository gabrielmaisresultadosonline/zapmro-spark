// Copia os arquivos do Storage da nuvem para a stack local (idempotente/upsert).
// Lista via edge function exportar-storage-vps; baixa por URL pública da nuvem.
//
// Correções desta versão:
//  - cria os buckets ANTES de enviar (mostrando o motivo real quando falha) e
//    confere via GET se cada bucket existe; sem bucket, todo upload dá HTTP 400.
//  - retenta downloads/uploads com backoff quando a nuvem responde 429/5xx.
//  - pula arquivos que já existem localmente (permite rodar de novo e continuar).

const CLOUD = process.env.CLOUD_URL.replace(/\/$/, "");
const ANON = process.env.CLOUD_ANON;
const ADMIN = process.env.ADMIN_PASSWORD;
const LOCAL = process.env.LOCAL_URL.replace(/\/$/, "");
const KEY = process.env.LOCAL_SERVICE_KEY;
const CONC = Number(process.env.CONCURRENCY || 4);
const RETRIES = Number(process.env.RETRIES || 5);

const FN = `${CLOUD}/functions/v1/exportar-storage-vps`;
const localHeaders = { Authorization: `Bearer ${KEY}`, apikey: KEY };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch com retentativa em 429/5xx (backoff exponencial + jitter). */
async function fetchRetry(url, init = {}, label = "") {
  let last;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const r = await fetch(url, init);
      if (r.status !== 429 && r.status < 500) return r;
      last = new Error(`${label} HTTP ${r.status}`);
      const ra = Number(r.headers.get("retry-after"));
      await sleep(ra > 0 ? ra * 1000 : Math.min(30000, 800 * 2 ** attempt) + Math.random() * 500);
    } catch (e) {
      last = e;
      await sleep(Math.min(30000, 800 * 2 ** attempt));
    }
  }
  throw last ?? new Error(`${label} falhou`);
}

async function callFn(payload) {
  const r = await fetchRetry(
    FN,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
      },
      body: JSON.stringify({ adminPassword: ADMIN, ...payload }),
    },
    "edge function",
  );
  const json = await r.json();
  if (json.error) throw new Error(json.error);
  return json;
}

async function listAll(bucket, prefix = "") {
  const out = [];
  let offset = 0;
  for (;;) {
    const { items, done } = await callFn({ action: "objects", bucket, prefix, offset, limit: 1000 });
    for (const it of items) {
      const path = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.isFolder) out.push(...(await listAll(bucket, path)));
      else out.push(path);
    }
    if (done) break;
    offset += 1000;
  }
  return out;
}

/** Cria o bucket (se faltar) e confirma que ele existe. Retorna true/false. */
async function ensureBucket(b) {
  const id = b.id ?? b.name;

  const exists = async () => {
    const r = await fetch(`${LOCAL}/storage/v1/bucket/${encodeURIComponent(id)}`, { headers: localHeaders });
    return r.ok;
  };

  if (await exists()) return true;

  // O storage-api recusa payload com campos nulos em algumas versões:
  // envia só o que tem valor.
  const payload = { id, name: b.name ?? id, public: !!b.public };
  if (b.file_size_limit != null) payload.file_size_limit = b.file_size_limit;
  if (Array.isArray(b.allowed_mime_types) && b.allowed_mime_types.length) {
    payload.allowed_mime_types = b.allowed_mime_types;
  }

  let r = await fetch(`${LOCAL}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...localHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!r.ok && r.status !== 409) {
    const detail = await r.text().catch(() => "");
    // Última tentativa: payload mínimo absoluto.
    r = await fetch(`${LOCAL}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...localHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: b.name ?? id, public: !!b.public }),
    });
    if (!r.ok && r.status !== 409) {
      console.error(`  bucket ${id}: HTTP ${r.status} — ${detail || (await r.text().catch(() => ""))}`);
      return await exists();
    }
  }
  return await exists();
}

async function alreadyLocal(bucket, path) {
  const r = await fetch(`${LOCAL}/storage/v1/object/info/${bucket}/${encodeURI(path)}`, {
    headers: localHeaders,
  });
  return r.ok;
}

async function pool(items, worker) {
  let i = 0, done = 0, fail = 0;
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (i < items.length) {
        const item = items[i++];
        try {
          await worker(item);
        } catch (e) {
          fail++;
          console.error(`  erro: ${item} — ${e.message}`);
        }
        if (++done % 100 === 0) console.log(`  ${done}/${items.length}`);
      }
    }),
  );
  return { done, fail };
}

const { buckets } = await callFn({ action: "buckets" });
console.log(`buckets na nuvem: ${buckets.map((b) => b.name).join(", ")}`);

let totalOk = 0, totalFail = 0, totalSkip = 0, bucketFail = 0;
for (const b of buckets) {
  const ready = await ensureBucket(b);
  if (!ready) {
    bucketFail++;
    console.error(`✘ bucket ${b.name} não existe na stack local — pulando seus arquivos`);
    continue;
  }
  const files = await listAll(b.name);
  console.log(`${b.name}: ${files.length} arquivos`);
  let skip = 0;
  const { done, fail } = await pool(files, async (path) => {
    if (await alreadyLocal(b.name, path)) { skip++; return; }

    const src = await fetchRetry(
      `${CLOUD}/storage/v1/object/public/${b.name}/${encodeURI(path)}`,
      { headers: { Authorization: `Bearer ${ANON}`, apikey: ANON } },
      "download",
    );
    if (!src.ok) throw new Error(`download HTTP ${src.status}`);
    const buf = Buffer.from(await src.arrayBuffer());
    const contentType = src.headers.get("content-type") || "application/octet-stream";

    const up = await fetchRetry(
      `${LOCAL}/storage/v1/object/${b.name}/${encodeURI(path)}`,
      {
        method: "POST",
        headers: { ...localHeaders, "x-upsert": "true", "Content-Type": contentType },
        body: buf,
      },
      "upload",
    );
    if (!up.ok && up.status !== 409) {
      throw new Error(`upload HTTP ${up.status} — ${(await up.text().catch(() => "")).slice(0, 200)}`);
    }
  });
  totalOk += done - fail - skip;
  totalSkip += skip;
  totalFail += fail;
  console.log(`${b.name}: ${done - fail - skip} enviados, ${skip} já existiam, ${fail} falhas`);
}
console.log(`\nconcluído — ${totalOk} enviados, ${totalSkip} já existiam, ${totalFail} falhas`);

if (bucketFail > 0 || totalFail > 0) {
  throw new Error(
    `migração incompleta: ${bucketFail} bucket(s) indisponível(is), ${totalFail} arquivo(s) com falha`,
  );
}
