# Corrigir /admincentral: "Falha de rede ao contatar o servidor"

## Diagnóstico (causa raiz encontrada)

O login entra (validação local por hash), mas **nenhuma leitura carrega**. O motivo não é o servidor estar fora: é o **CORS preflight** sendo recusado.

- `src/lib/adminCentralApi.ts` envia o cabeçalho personalizado `x-request-id` em toda chamada.
- Um cabeçalho personalizado força o navegador a fazer um `OPTIONS` (preflight) antes do `POST`.
- O gateway da VPS (`deploy/postgres-stack/nginx.conf`) responde `Access-Control-Allow-Headers` com uma lista fixa que **não inclui `x-request-id`**. As Edge Functions (`crm-central-admin`, `crm-central-admin-login`) também não incluem.
- O navegador então aborta a requisição **antes de qualquer resposta**. O `fetch` lança `TypeError`, que o cliente traduz exatamente como "Falha de rede ao contatar o servidor".

Ou seja: acessa a tela, mas toda ação (listar contatos, liberar plano, travar, excluir) morre no preflight.

## Correção

1. **Cliente (efeito imediato, sem depender da VPS)** — `src/lib/adminCentralApi.ts`
   - Remover o cabeçalho `x-request-id` do `fetch`. O `requestId` continua indo **no corpo** (o servidor já o lê de lá para idempotência), então nada de comportamento se perde.
   - Sem cabeçalho personalizado, a requisição volta a ser "simples" e não exige preflight.

2. **Gateway (defensivo)** — `deploy/postgres-stack/nginx.conf`
   - Acrescentar `x-request-id` (e `x-admin-session`) na lista de `Access-Control-Allow-Headers` dos blocos `/functions/v1/`, `/rest/v1/` e `/auth/v1/`, tanto na resposta normal quanto no ramo `OPTIONS`.

3. **Edge Functions (defensivo)** — `crm-central-admin` e `crm-central-admin-login`
   - Padronizar `Access-Control-Allow-Headers` incluindo `x-request-id`, para o caso de a função ser chamada sem passar pelo Nginx.

4. **Mensagem de erro mais útil** — `src/lib/adminCentralApi.ts`
   - Diferenciar "bloqueado pelo navegador (CORS/preflight)" de "servidor inacessível", para que um problema desse tipo seja identificável na primeira leitura, em vez de virar um genérico "falha de rede".

## Aplicação na VPS

```bash
cd /var/www/ia-mro && git fetch origin && git reset --hard origin/main
chmod +x deploy/*.sh && ./deploy/atualizar.sh
```

O item 1 já resolve o acesso mesmo antes do Nginx ser recarregado; os itens 2 e 3 entram junto no `atualizar.sh`.

## Escopo

Sem alteração de banco, de RLS ou de qualquer lógica de negócio do CRM/WhatsApp. Somente transporte HTTP/CORS do `/admincentral`.
