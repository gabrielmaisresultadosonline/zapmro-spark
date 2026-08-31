# MIGRACAO ZAPMRO — COMO IMPORTAR NO NOVO BANCO

Gerado em: 2026-08-29T14:18:03.232Z
Tabelas: 120 | Linhas: 483 | Usuarios Auth: 44 | Arquivos Storage: 15475

## Opcao A — comando unico na VPS (recomendado)
1. Descompacte este pacote dentro do projeto, em: deploy/postgres-stack/sql/
   unzip dumps-sql.zip -d /var/www/ia-mro/deploy/postgres-stack/sql/
2. Rode: cd /var/www/ia-mro && ./deploy/atualizar.sh
   O script aplica os arquivos em ordem (010 -> 090), registra o que ja foi aplicado
   em public._migracoes_aplicadas e nao reaplica o que nao mudou.

## Opcao B — manual, arquivo por arquivo
psql "$DB" -f 010-extensions-types-sequences.sql
psql "$DB" -f 020-schema.sql
psql "$DB" -f 030-funcoes.sql
psql "$DB" -f 040-dados.sql
psql "$DB" -f 050-auth.sql
psql "$DB" -f 060-storage.sql
psql "$DB" -f 070-views-fks-indices.sql
psql "$DB" -f 080-rls-triggers-grants.sql
psql "$DB" -f 090-cron.sql

## Opcao C — arquivo unico
psql "postgres://postgres:SENHA@HOST:5432/postgres" -f mro_backup.sql | tee restore.log

## Fora do SQL (baixe nos outros botoes desta aba)
- Binarios do Storage (script Node)
- Codigo das Edge Functions (.zip)
- Secrets, OAuth/Google/Meta e webhooks: recriar manualmente