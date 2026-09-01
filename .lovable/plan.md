# Plano definitivo — corrigir o Google Sync 403 sem afetar o WhatsApp

## Diagnóstico confirmado

A atualização terminou corretamente: build, banco, API, Storage, Functions, nginx e SSL estão operacionais. Os webhooks do WhatsApp também estão funcionando — o log mostra número resolvido, contato criado, mensagem recebida salva, eco de mensagem enviado pelo celular e status `delivered`.

A falha isolada é a integração com Google Contatos. Quatro contas estão usando tokens que não possuem o escopo efetivamente necessário para acessar a People API. O erro acontece já na leitura usada para deduplicação (`people/me/connections`), portanto não é apenas “falta de permissão de escrita”: o token não possui uma autorização de Contatos válida para a operação atual.

O problema fica recorrente porque:

1. o sistema pede hoje o escopo correto (`https://www.googleapis.com/auth/contacts`), mas contas conectadas anteriormente continuam com refresh tokens antigos;
2. ao reconectar, o backend preserva silenciosamente o refresh token anterior quando o Google não devolve um novo;
3. o erro 403 na etapa de deduplicação apenas gera log e não marca a conta como inválida;
4. `processScheduled` executa o Google Sync em segundo plano continuamente, então as mesmas contas são tentadas de novo em cada ciclo;
5. o frontend também dispara sincronização periódica, ampliando as tentativas enquanto o CRM está aberto;
6. há duas implementações diferentes para montar a URL OAuth, uma no frontend e outra na Function.

## Resultado esperado

- Tokens com escopo inválido param de ser tentados automaticamente após a primeira confirmação do 403.
- O CRM mostra de forma persistente qual conta precisa ser reconectada.
- A reconexão solicita consentimento completo e nunca reaproveita um refresh token sem o escopo de Contatos.
- Após reconectar, a conta volta ao Auto Sync e os contatos pendentes são processados.
- Erros de uma conta não bloqueiam as demais.
- O processamento de WhatsApp, fluxos e IA permanece independente e inalterado.

## Implementação

### 1. Persistir a saúde da autorização Google

Criar uma nova migração SQL idempotente para acrescentar em `crm_google_accounts`:

- `granted_scopes text[]` — escopos efetivamente concedidos pelo Google;
- `connection_status text` com estados controlados: `active`, `reconnect_required`, `token_error`;
- `last_sync_error_code text` e `last_sync_error text` — diagnóstico seguro, sem tokens;
- `last_sync_error_at timestamptz` — data da falha;
- `last_sync_at timestamptz` — última sincronização válida.

A migração preservará todas as contas e contatos existentes. Não haverá exclusão nem recriação de dados. A tabela já possui RLS; a migração manterá as políticas atuais e adicionará somente as colunas e a constraint de status.

### 2. Centralizar e validar OAuth no backend

Em `supabase/functions/meta-whatsapp-crm/index.ts`:

- manter uma única constante para os escopos obrigatórios;
- fazer `getGoogleAuthUrl` ser a única fonte da URL de autorização;
- incluir `access_type=offline`, `prompt=consent` e um fluxo de reconexão explícito;
- validar os escopos concedidos após a troca do código usando a resposta OAuth e, quando necessário, o endpoint `tokeninfo` do Google;
- repetir a validação após renovação do access token;
- só marcar a conta como `active` quando o escopo completo de Contatos estiver presente;
- não registrar access token, refresh token, authorization code ou segredo nos logs.

### 3. Impedir reutilização do refresh token inválido

No `exchangeGoogleCode`:

- consultar o estado anterior da conta;
- se a conta estiver em `reconnect_required`, não reutilizar o refresh token antigo;
- exigir um novo refresh token válido para reativar o Auto Sync;
- se o Google não devolver o token/escopo necessário, manter a conta pausada e retornar uma mensagem objetiva para concluir a reconexão;
- somente depois da validação limpar os campos de erro e reativar a sincronização.

Isso elimina o comportamento atual em que uma reconexão aparentemente bem-sucedida continua usando a autorização antiga.

### 4. Tratar o 403 exatamente onde ele ocorre

Ajustar `loadGoogleContactsByCanonicalPhone` e `pushPendingContactsToGoogle` para trabalhar com erro estruturado (status, código e detalhes sanitizados).

Quando a leitura de deduplicação ou qualquer escrita retornar `ACCESS_TOKEN_SCOPE_INSUFFICIENT`, `PERMISSION_DENIED` ou “insufficient authentication scopes”:

- marcar a conta como `reconnect_required`;
- desligar `auto_sync` somente dessa conta;
- armazenar o erro sanitizado e a data;
- liberar imediatamente os claims dos contatos pendentes;
- continuar processando outras contas válidas do mesmo usuário;
- não tentar `batchCreate`, `createContact` ou `batchDelete` com o token inválido.

Para falhas temporárias (429, 5xx ou indisponibilidade de rede), não exigir reconexão: manter pendente e aplicar espera controlada. Para `invalid_grant`/token revogado, usar `token_error` e também pedir reconexão.

### 5. Parar o ciclo infinito de logs

Em `autoPushGoogleContactsForAllUsers`:

- buscar apenas contas `auto_sync = true` e `connection_status = active`;
- não executar contas já marcadas para reconexão;
- manter isolamento por usuário e por conta;
- registrar um resumo único por ciclo, evitando repetir o corpo completo do 403 a cada minuto;
- preservar o claim atômico existente para impedir duplicação de contatos.

No frontend, manter o sincronizador silencioso, mas fazê-lo parar localmente quando a resposta indicar `reconnect_required`, em vez de repetir a chamada a cada 60 segundos.

### 6. Unificar a conexão no frontend

Em `src/pages/CRM.tsx`:

- substituir a URL OAuth montada manualmente por uma chamada a `getGoogleAuthUrl`;
- carregar também `connection_status` e o último erro das contas;
- mostrar um aviso persistente “Reconexão necessária” na conta afetada;
- oferecer ação direta “Reconectar Google”;
- impedir que o toggle de Auto Sync seja ativado enquanto a autorização estiver inválida;
- manter as demais contas funcionais e sincronizáveis.

Em `src/pages/GoogleContactsCallback.tsx`:

- só exibir sucesso após o backend validar o escopo e salvar um refresh token utilizável;
- tratar separadamente cancelamento, escopo negado, token ausente e erro de rede;
- depois de uma conexão válida, executar uma sincronização inicial e exibir o resultado real;
- remover logs que incluam partes do authorization code.

### 7. Desconexão correta

Criar uma ação backend para desconectar Google:

- validar o usuário dono da conta;
- tentar revogar o token no endpoint oficial do Google;
- apagar a conta local somente após tratar a resposta de revogação;
- liberar os contatos vinculados à conta de maneira controlada, removendo `google_sync_account_id` e o `google_resource_name` para permitir escolha de outro destino;
- substituir a exclusão direta feita pelo navegador por essa ação segura.

### 8. Segurança dos dados versionados

O arquivo de carga `deploy/postgres-stack/sql/040-dados.sql` contém tokens OAuth históricos em texto aberto. Isso precisa ser tratado junto com a correção:

- remover access tokens e refresh tokens do conteúdo versionado;
- impedir que futuros exports incluam segredos de `crm_google_accounts`, `crm_google_tokens` e configurações sensíveis;
- manter os dados reais apenas no PostgreSQL da VPS e nos arquivos de secrets fora do Git;
- revogar/reconectar as contas cujos tokens já foram versionados;
- nunca imprimir tokens nos scripts ou logs.

Nenhum token existente será copiado para outro arquivo durante a alteração.

## Arquivos previstos

- `supabase/functions/meta-whatsapp-crm/index.ts` — validação, estado da conexão, refresh, backoff e desconexão.
- `src/pages/CRM.tsx` — conexão centralizada, badge/ação de reconexão e pausa do loop local.
- `src/pages/GoogleContactsCallback.tsx` — callback confiável e mensagens corretas.
- `deploy/postgres-stack/sql/092-google-oauth-health.sql` — colunas de saúde e migração idempotente.
- `deploy/postgres-stack/sql/040-dados.sql` e exportadores administrativos relacionados — remoção/prevenção de credenciais versionadas.
- testes focados da integração Google, criando arquivos de teste somente se a estrutura atual permitir.

## Validação técnica

### Testes automatizados

Cobrir pelo menos:

1. token com escopo completo é aceito;
2. token sem `auth/contacts` é marcado como `reconnect_required`;
3. erro 403 na deduplicação desativa Auto Sync da conta afetada;
4. claims dos contatos são liberados após falha;
5. uma conta inválida não impede outra conta válida de sincronizar;
6. refresh token antigo não é reaproveitado durante reconexão obrigatória;
7. falha 429/5xx não é classificada incorretamente como falta de escopo;
8. callback não anuncia sucesso quando a sincronização/autorização falha;
9. desconexão não deixa contatos presos a uma conta removida.

### Verificação na VPS após atualização

Executar a atualização normal e então conferir, sem expor tokens:

```bash
cd /var/www/ia-mro
git fetch origin && git reset --hard origin/main
chmod +x deploy/*.sh
./deploy/atualizar.sh

docker logs --since 10m zapmro-functions 2>&1 \
  | grep -E 'GOOGLE-SYNC|reconnect_required|PERMISSION_DENIED'
```

Consultar apenas metadados seguros das contas:

```bash
set -a; . deploy/postgres-stack/.env; set +a
PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h 127.0.0.1 -p "${PG_PORT:-5432}" -U postgres -d "${POSTGRES_DB:-postgres}" \
  -P pager=off -c "
    select email, auto_sync, connection_status,
           granted_scopes, last_sync_error_code, last_sync_error_at
    from public.crm_google_accounts
    order by updated_at desc;
  "
```

Critérios de aprovação:

- contas antigas aparecem uma única vez como `reconnect_required`, sem avalanche de 403;
- após clicar em “Reconectar Google” e conceder Contatos, ficam `active` com `auto_sync = true`;
- os 46/2 contatos pendentes diminuem até zero;
- o log de WhatsApp continua mostrando recebimentos, ecos e status normalmente;
- build e health checks continuam OK.

## Ação manual inevitável

Código não consegue ampliar permissões de tokens já emitidos. Após publicar a correção, cada uma das quatro contas indicadas no log precisará clicar uma vez em **Reconectar Google** e aceitar a permissão de gerenciar contatos. Não é necessário apagar contatos do CRM nem desconectar o WhatsApp.

## Ordem de execução

1. Criar migração e estado persistente da conta.
2. Implementar validação de escopo e tratamento estruturado no backend.
3. Aplicar circuit breaker no cron e liberar claims corretamente.
4. Unificar OAuth e corrigir callback/UX de reconexão.
5. Implementar desconexão/revogação segura.
6. Sanitizar dumps/exportadores que contêm tokens.
7. Rodar testes, build e inspeção de segurança.
8. Atualizar a VPS e reconectar manualmente apenas as contas marcadas.
