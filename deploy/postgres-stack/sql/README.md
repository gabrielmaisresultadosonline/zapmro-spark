# Dumps SQL da migração (aplicados automaticamente)

Os arquivos desta pasta são aplicados **em ordem alfabética** por `./deploy/atualizar.sh`
e registrados em `public._migracoes_aplicadas` (não reaplica se o conteúdo não mudou).

Conteúdo atual (export de 2026-08-29 feito em /admincentral → Migração):

| arquivo | o que traz |
|---|---|
| `010-extensions-types-sequences.sql` | extensões, tipos/enums, sequences |
| `020-schema.sql` | tabelas do schema `public` |
| `030-funcoes.sql` | funções PostgreSQL |
| `040-dados.sql` | dados (contatos, conversas, mensagens, fluxos, templates…) |
| `050-auth.sql` | `auth.users` / `auth.identities` |
| `060-storage.sql` | buckets e inventário de objetos do Storage |
| `070-views-fks-indices.sql` | views, foreign keys e índices |
| `080-rls-triggers-grants.sql` | RLS, policies, triggers e grants |
| `090-cron.sql` | jobs do pg_cron |

Para atualizar: /admincentral → Migração → **Baixar todos os dumps (.zip)**,
extrair aqui por cima e rodar `./deploy/atualizar.sh` de novo.

> Os **binários** do Storage não estão aqui (são arquivos, não SQL). Use
> `./deploy/migrar-para-postgres.sh --sync` para copiá-los.
