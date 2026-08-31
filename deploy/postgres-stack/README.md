# ZapMRO 100% PostgreSQL (sem depender do Lovable Cloud)

Stack própria, no seu VPS, com as **mesmas rotas** do Supabase — por isso o
frontend **não precisa ser reescrito**: ele continua usando `@supabase/supabase-js`,
só que apontando para a sua infraestrutura.

```
https://api.zapmro.com.br
  ├── /rest/v1       → PostgREST      (todas as tabelas + RLS)
  ├── /auth/v1       → GoTrue         (login, OAuth Google/Facebook, magic link)
  ├── /realtime/v1   → Realtime       (chat em tempo real do /crm)
  ├── /storage/v1    → Storage API    (mídias, 8 buckets)
  └── /functions/v1  → Edge Runtime   (as 118 funções em Deno, código atual)
```

## Comando único

```bash
chmod +x deploy/migrar-para-postgres.sh
./deploy/migrar-para-postgres.sh
```

Ele faz, em paralelo:

1. checa dependências (docker, psql/pg_dump 15+, node)
2. gera todos os segredos (senha do Postgres, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`)
3. sobe o PostgreSQL com roles/schemas/extensões (`auth.uid()`, `pg_cron`, `pg_net`…)
4. exporta a origem em 4 processos paralelos: schema+dados público, `auth.users`/`identities`,
   extensões/cron/inventário do Storage e **binários** do Storage
5. restaura tudo no banco próprio (tabelas, dados, funções, triggers, RLS, índices, FKs, grants, views, sequences)
6. sobe Auth, REST, Realtime, Storage, Edge Functions e o gateway
7. envia os binários do Storage
8. gera `.env.postgres` com as novas variáveis do frontend
9. valida saúde de cada serviço e compara contagens

Modos: `--sync` (re-sincroniza dados+storage antes do cutover), `--validar`, `--dry`.

## Configuração

`deploy/postgres-stack/.env` (criado a partir do `.env.example`):

| variável | para quê |
|---|---|
| `PUBLIC_API_URL` | domínio público da stack (ex.: `https://api.zapmro.com.br`) |
| `SITE_URL` / `ADDITIONAL_REDIRECT_URLS` | redirects do Auth |
| `SOURCE_DB_URL` | conexão da origem (para o dump) |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | baixar os binários do Storage |
| `GOOGLE_*` / `FACEBOOK_*` | OAuth |
| `SMTP_*` | e-mails do Auth |

`deploy/postgres-stack/secrets.env` guarda os segredos das Edge Functions
(mesmos nomes de hoje). Sem eles as funções sobem, mas integrações externas falham.

## Cutover (sem quebrar nada)

1. Rodar o comando único e validar `/crm`, login, envio/recebimento de WhatsApp na URL nova.
2. Reapontar na Meta a callback para `PUBLIC_API_URL/functions/v1/meta-whatsapp-crm` e
   reassinar `subscribed_apps` de cada WABA.
3. Adicionar `PUBLIC_API_URL/auth/v1/callback` no Google e no app do Facebook.
4. Reapontar webhooks InfinitePay / Z-API.
5. `./deploy/migrar-para-postgres.sh --sync` (delta final), `cp .env.postgres .env`, build e deploy.
6. Só então desligar o Supabase.

## Operação

```bash
cd deploy/postgres-stack
docker compose ps
docker compose logs -f functions
docker compose restart functions        # após editar secrets.env
docker exec zapmro-db pg_dump -U postgres postgres | gzip > backup-$(date +%F).sql.gz
```

## Limites honestos

- Valores de **secrets**, assinatura `subscribed_apps` da Meta, config OAuth e webhooks de
  terceiros vivem fora do banco: precisam ser recadastrados uma vez (o script lista tudo no final).
- O frontend segue usando o SDK `supabase-js` porque é o **protocolo** do PostgREST/GoTrue —
  reescrever para SQL direto exigiria expor o banco ao navegador, o que seria uma falha de segurança.
  A dependência do Lovable Cloud/Supabase SaaS, essa sim, deixa de existir.

## Comando único de ponta a ponta (`deploy/zapmro.sh`)

```bash
chmod +x deploy/zapmro.sh deploy/migrar-para-postgres.sh
./deploy/zapmro.sh instalar      # SO + stack + migração + build + Nginx/SSL + backup diário
./deploy/zapmro.sh secrets       # cola as chaves das Edge Functions e reinicia
./deploy/zapmro.sh status        # saúde + contagens (tabelas, auth, contatos, mensagens, cron)
./deploy/zapmro.sh virar         # cutover: o frontend sai do Supabase
./deploy/zapmro.sh voltar        # rollback instantâneo
./deploy/zapmro.sh atualizar     # atualizações do dia a dia
```
