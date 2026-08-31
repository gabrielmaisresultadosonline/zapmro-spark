import { useState } from "react";
import JSZip from "jszip";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Loader2, FileCode2, HardDrive, BookOpen, KeyRound, ShieldAlert } from "lucide-react";
import { ADMIN_TIMEOUTS, adminCall, adminErrorMessage } from "@/lib/adminCentralApi";

/**
 * MigrationExtras — exportações complementares ao dump SQL:
 *  1) Código de TODAS as Edge Functions (.zip)
 *  2) Script de migração dos binários do Storage (.zip com .sh/.mjs)
 *  3) Documentação completa de migração (.md) com secrets, OAuth, webhooks e passo a passo no VPS
 *
 * Nenhum valor de secret é exportado — apenas os NOMES das chaves a recriar no destino.
 */

/** Nomes (sem valores) dos secrets que precisam ser recriados no projeto de destino. */
const SECRET_NAMES: readonly string[] = [
  "BRIGHTDATA_API_TOKEN",
  "BRIGHTDATA_WEB_UNLOCKER_ZONE",
  "DEEPSEEK_API_KEY",
  "FACEBOOK_APP_ID",
  "FACEBOOK_APP_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "INFINITEPAY_API_KEY",
  "INFINITEPAY_WEBHOOK_SECRET",
  "INSTAGRAM_SESSION_ID",
  "LOVABLE_API_KEY",
  "META_CONVERSIONS_API_TOKEN",
  "META_WEBHOOK_VERIFY_TOKEN",
  "OPENAI_API_KEY",
  "RAPIDAPI_KEY",
  "SMTP_PASSWORD",
  "STRIPE_SECRET_KEY",
  "WPP_BOT_TOKEN",
  "ZAPMRO_SMTP_PASSWORD",
];

const STORAGE_BUCKETS: readonly { name: string; publicBucket: boolean }[] = [
  { name: "assets", publicBucket: true },
  { name: "crm-media", publicBucket: true },
  { name: "inteligencia-fotos", publicBucket: true },
  { name: "metodo-seguidor-backup", publicBucket: false },
  { name: "metodo-seguidor-content", publicBucket: true },
  { name: "profile-cache", publicBucket: true },
  { name: "trial-screenshots", publicBucket: true },
  { name: "user-data", publicBucket: true },
];

/** Todos os arquivos das edge functions + config, carregados sob demanda (lazy). */
const FUNCTION_FILES = import.meta.glob("/supabase/functions/**/*.{ts,js,json,toml,md,txt}", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

const CONFIG_FILES = import.meta.glob("/supabase/config.toml", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

function download(content: string | Blob, filename: string, mime = "text/plain;charset=utf-8") {
  const blob = typeof content === "string" ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STORAGE_SCRIPT = `#!/usr/bin/env node
/**
 * migrar-storage.mjs — copia TODOS os arquivos do Storage de um projeto Supabase para outro.
 *
 * Uso no VPS (Node 18+):
 *   npm i @supabase/supabase-js
 *   ORIGEM_URL=... ORIGEM_KEY=... DESTINO_URL=... DESTINO_KEY=... node migrar-storage.mjs
 *
 * As KEYs devem ser as SERVICE ROLE de cada projeto (nunca a anon).
 */
import { createClient } from "@supabase/supabase-js";

const origem = createClient(process.env.ORIGEM_URL, process.env.ORIGEM_KEY, { auth: { persistSession: false } });
const destino = createClient(process.env.DESTINO_URL, process.env.DESTINO_KEY, { auth: { persistSession: false } });

const BUCKETS = ${JSON.stringify(STORAGE_BUCKETS.map((b) => ({ name: b.name, public: b.publicBucket })), null, 2)};

async function listAll(client, bucket, prefix = "") {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? \`\${prefix}/\${item.name}\` : item.name;
      if (item.id === null) out.push(...(await listAll(client, bucket, path)));
      else out.push(path);
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  return out;
}

for (const bucket of BUCKETS) {
  console.log(\`\\n=== BUCKET \${bucket.name} ===\`);
  await destino.storage.createBucket(bucket.name, { public: bucket.public }).catch(() => {});
  const files = await listAll(origem, bucket.name);
  console.log(\`\${files.length} arquivos encontrados\`);
  let ok = 0, fail = 0;
  for (const path of files) {
    try {
      const { data, error } = await origem.storage.from(bucket.name).download(path);
      if (error) throw error;
      const buffer = Buffer.from(await data.arrayBuffer());
      const { error: upErr } = await destino.storage
        .from(bucket.name)
        .upload(path, buffer, { upsert: true, contentType: data.type || "application/octet-stream" });
      if (upErr) throw upErr;
      ok++;
      if (ok % 25 === 0) console.log(\`  \${ok}/\${files.length}\`);
    } catch (err) {
      fail++;
      console.error(\`  FALHA \${path}: \${err.message}\`);
    }
  }
  console.log(\`Bucket \${bucket.name}: \${ok} copiados, \${fail} falhas\`);
}
console.log("\\nStorage migrado.");
`;

const STORAGE_README = `# Migrar binários do Storage (VPS / terminal)

1. Envie \`migrar-storage.mjs\` para o VPS (ex.: \`scp migrar-storage.mjs root@zapmro.com.br:/root/\`).
2. No VPS:
   \`\`\`bash
   cd /root && npm init -y && npm i @supabase/supabase-js
   ORIGEM_URL="https://<projeto-atual>.supabase.co" \\
   ORIGEM_KEY="<service_role da origem>" \\
   DESTINO_URL="https://<projeto-novo>.supabase.co" \\
   DESTINO_KEY="<service_role do destino>" \\
   node migrar-storage.mjs | tee storage-migracao.log
   \`\`\`
3. Confira no final quantos arquivos foram copiados por bucket e revise as linhas \`FALHA\` do log.
4. Rode de novo se necessário — o upload usa \`upsert\`, então repetir é seguro.

Buckets copiados: ${STORAGE_BUCKETS.map((b) => `\`${b.name}\` (${b.publicBucket ? "público" : "privado"})`).join(", ")}.
`;

export default function MigrationExtras() {
  const [busy, setBusy] = useState<string | null>(null);

  /** Baixa o secrets.env já preenchido com os valores acessíveis no runtime. */
  async function exportSecrets() {
    const adminEmail = window.prompt("E-mail administrativo:")?.trim();
    if (!adminEmail) return;
    const adminPassword = window.prompt("Senha administrativa:") ?? "";
    if (!adminPassword) return;

    setBusy("secrets");
    try {
      // Função dedicada, mas com o mesmo contrato de tempo limite do restante do
      // Admin Central: se não responder, o botão volta ao normal com o motivo.
      const data = await adminCall<{ content?: string; found?: string[]; missing?: string[] }>(
        "export",
        { email: adminEmail, password: adminPassword },
        {},
        { fn: "export-secrets", timeoutMs: ADMIN_TIMEOUTS.write },
      );

      if (!data.content) throw new Error("Falha ao exportar secrets");

      download(data.content, "secrets.env", "text/plain;charset=utf-8");
      toast.success(
        `${data.found?.length ?? 0} preenchidos · ${data.missing?.length ?? 0} para completar na VPS`,
      );
    } catch (err) {
      toast.error(adminErrorMessage(err, "Falha ao exportar secrets"));

    } finally {
      setBusy(null);
    }
  }


  async function exportFunctions() {
    setBusy("functions");
    try {
      const zip = new JSZip();
      const entries = Object.entries(FUNCTION_FILES);
      if (entries.length === 0) throw new Error("Nenhum arquivo de edge function encontrado no build");

      for (const [path, loader] of entries) {
        const content = await loader();
        zip.file(path.replace(/^\//, ""), content);
      }
      for (const [path, loader] of Object.entries(CONFIG_FILES)) {
        zip.file(path.replace(/^\//, ""), await loader());
      }

      const functionNames = [
        ...new Set(
          entries
            .map(([p]) => p.split("/supabase/functions/")[1]?.split("/")[0])
            .filter((n): n is string => Boolean(n) && n !== "_shared"),
        ),
      ].sort();

      zip.file(
        "DEPLOY_EDGE_FUNCTIONS.md",
        `# Deploy das Edge Functions no novo projeto Supabase

Total de funções: **${functionNames.length}**

## 1. Preparar o VPS
\`\`\`bash
npm i -g supabase
supabase login          # cola o access token da conta de destino
mkdir -p ~/migracao && cd ~/migracao
unzip edge-functions.zip
\`\`\`

## 2. Linkar o projeto de destino
\`\`\`bash
supabase link --project-ref <REF_DO_NOVO_PROJETO>
\`\`\`

## 3. Criar os secrets (valores você pega no painel atual — nunca ficam no dump)
\`\`\`bash
${SECRET_NAMES.map((s) => `supabase secrets set ${s}="<valor>"`).join("\n")}
\`\`\`
> \`SUPABASE_URL\`, \`SUPABASE_ANON_KEY\` e \`SUPABASE_SERVICE_ROLE_KEY\` são injetados automaticamente pelo Supabase — não precisa recriar.

## 4. Fazer deploy de todas as funções de uma vez
\`\`\`bash
for f in supabase/functions/*/; do
  name=$(basename "$f")
  [ "$name" = "_shared" ] && continue
  echo "deploy $name"
  supabase functions deploy "$name" --project-ref <REF_DO_NOVO_PROJETO>
done
\`\`\`

## 5. Funções com \`verify_jwt = false\`
O arquivo \`supabase/config.toml\` já vem no zip com essa configuração — mantenha-o na raiz antes do deploy.

## Lista de funções
${functionNames.map((n) => `- ${n}`).join("\n")}
`,
      );

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      download(blob, `edge-functions_${new Date().toISOString().slice(0, 10)}.zip`, "application/zip");
      toast.success(`${functionNames.length} funções exportadas`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao exportar funções");
    } finally {
      setBusy(null);
    }
  }

  async function exportStorageScript() {
    setBusy("storage");
    try {
      const zip = new JSZip();
      zip.file("migrar-storage.mjs", STORAGE_SCRIPT);
      zip.file("LEIA-ME.md", STORAGE_README);
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      download(blob, "migracao-storage.zip", "application/zip");
      toast.success("Script de Storage baixado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar script");
    } finally {
      setBusy(null);
    }
  }

  function exportGuide() {
    const date = new Date().toISOString().slice(0, 10);
    const md = `# Migração completa para outro projeto Supabase — ${date}

Ordem recomendada: **1) Banco → 2) Edge Functions → 3) Storage → 4) Configurações externas**

---

## 1. Banco de dados (aba Migração → "Exportar Dump SQL Completo")
\`\`\`bash
# no VPS, com o arquivo .sql enviado por scp
psql "postgresql://postgres:<senha>@db.<ref-destino>.supabase.co:5432/postgres" -f mro_backup_${date}.sql | tee restore.log
grep -i "erro\\|error" restore.log
\`\`\`
Inclui: extensions, types/enums, sequences, tabelas, dados, views, funções, triggers, RLS, índices, FKs, grants, cron, \`auth.users\` + identidades e metadados/inventário do Storage.

## 2. Edge Functions (botão "Baixar Edge Functions (.zip)")
O zip traz o código de todas as funções, o \`config.toml\` e o guia \`DEPLOY_EDGE_FUNCTIONS.md\` com o loop de deploy pronto.

## 3. Storage — binários (botão "Baixar script de Storage")
O zip traz \`migrar-storage.mjs\`, que baixa cada arquivo da origem e sobe no destino, bucket por bucket, com log de falhas.

## 4. Secrets (valores nunca saem em SQL)
Recrie no destino:
${SECRET_NAMES.map((s) => `- \`${s}\``).join("\n")}
\`\`\`bash
supabase secrets set NOME="<valor>" --project-ref <REF_DO_NOVO_PROJETO>
\`\`\`

## 5. Auth — provedores e URLs
- Ativar provedor **Google** (Client ID/Secret do Google Cloud).
- **Site URL**: \`https://zapmro.com.br\`
- **Redirect URLs**: \`https://zapmro.com.br/**\`, \`https://zapmro.com.br/crm\`, \`https://zapmro.com.br/crm/login\`
- No Google Cloud Console, adicionar o novo callback: \`https://<ref-destino>.supabase.co/auth/v1/callback\`

## 6. Integrações externas (apontar para o novo domínio das functions)
| Integração | O que trocar |
|---|---|
| Meta / WhatsApp Cloud API | Webhook URL → \`https://<ref-destino>.supabase.co/functions/v1/meta-whatsapp-crm\` + reassinar \`subscribed_apps\` de cada WABA |
| Meta / Instagram (MRO Direct+) | Webhook → \`.../functions/v1/mro-direct-webhook\` e OAuth redirect do app Facebook |
| InfinitePay | Webhook → \`.../functions/v1/infinitepay-webhook\` (e os webhooks específicos de cada produto) |
| Google Contacts | Redirect OAuth → \`https://zapmro.com.br/google-contacts-callback\` |
| Z-API | Webhook → \`.../functions/v1/zapi-webhook\` |

## 7. Frontend
No \`.env\` do VPS e no build:
\`\`\`
VITE_SUPABASE_URL=https://<ref-destino>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key do destino>
VITE_SUPABASE_PROJECT_ID=<ref-destino>
\`\`\`
\`\`\`bash
cd /var/www/ia-mro && git pull && npm install && npm run build && sudo systemctl reload nginx
\`\`\`

## 8. Cron jobs
O dump recria \`cron.schedule(...)\`. Confirme que \`pg_cron\` e \`pg_net\` estão habilitados no destino antes de rodar o SQL.

## 9. Checklist final
- [ ] Login funciona (senhas preservadas via hash)
- [ ] Conversas e contatos aparecem no /crm
- [ ] Envio e recebimento de mensagens WhatsApp
- [ ] Mídias antigas abrem (Storage copiado)
- [ ] Webhooks de pagamento recebendo
- [ ] Cron rodando (recuperador I.A., sync Google)

> Faça a virada em janela de baixa demanda e mantenha o projeto antigo ativo por alguns dias como fallback.
`;
    download(md, `MIGRACAO_COMPLETA_${date}.md`, "text/markdown;charset=utf-8");
    toast.success("Documentação baixada");
  }

  const items = [
    {
      id: "functions",
      icon: FileCode2,
      title: "Código das Edge Functions",
      desc: "Zip com todas as funções, config.toml e guia de deploy pronto para o terminal.",
      action: exportFunctions,
      label: "Baixar Edge Functions (.zip)",
    },
    {
      id: "storage",
      icon: HardDrive,
      title: "Binários do Storage",
      desc: "Script Node que copia arquivo por arquivo de todos os buckets para o novo projeto.",
      action: exportStorageScript,
      label: "Baixar script de Storage",
    },
    {
      id: "guide",
      icon: BookOpen,
      title: "Documentação completa",
      desc: "Passo a passo da migração: banco, funções, storage, secrets, OAuth e webhooks.",
      action: exportGuide,
      label: "Baixar guia de migração",
    },
    {
      id: "secrets",
      icon: ShieldAlert,
      title: "Modelo secrets.env",
      desc: "Gera a lista completa e informa onde obter cada credencial. Valores criptografados não podem ser extraídos pelo site.",
      action: exportSecrets,
      label: "Baixar modelo (.env)",
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-5 bg-white border-[#E8F5F1]">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#F0FDF4] flex items-center justify-center shrink-0">
            <KeyRound className="h-5 w-5 text-[#128C7E]" />
          </div>
          <div>
            <h3 className="font-bold text-[#075E54]">O que não cabe no .sql — exporte aqui</h3>
            <p className="text-sm text-[#128C7E]/80">
              Cada botão gera um pacote separado. Por segurança, o backend não permite recuperar
              credenciais criptografadas. Preencha o modelo diretamente na VPS, use <code>chmod 600</code> e nunca versione.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((item) => (
          <Card key={item.id} className="p-4 bg-white border-[#E8F5F1] flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <item.icon className="h-5 w-5 text-[#128C7E]" />
              <p className="font-bold text-sm text-[#075E54]">{item.title}</p>
            </div>
            <p className="text-xs text-[#128C7E]/70 flex-1">{item.desc}</p>
            <Button
              onClick={item.action}
              disabled={busy !== null}
              className="bg-[#075E54] hover:bg-[#128C7E] text-white gap-2 w-full"
            >
              {busy === item.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="text-xs">{item.label}</span>
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
