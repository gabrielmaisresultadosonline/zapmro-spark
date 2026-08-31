# Plano completo — estabilizar todas as ações do `/admincentral`

## Objetivo

Eliminar carregamentos infinitos e resultados ambíguos em todas as operações administrativas, mantendo os dados e comportamentos atuais. Toda ação deverá terminar em sucesso ou erro claro dentro de um tempo limitado, confirmar no banco o resultado aplicado e liberar o botão mesmo quando a API, o e-mail ou a rede estiverem indisponíveis.

## Diagnóstico confirmado

- A correção anterior ficou restrita ao login. O restante do painel ainda depende da função remota `crm-central-admin`.
- `AdminCentral.tsx` possui um cliente parcialmente resiliente, mas `TrialsPanel`, `SalesOrdersPanel`, `AnnouncementsAdminPanel` e o painel de migração ainda chamam `supabase.functions.invoke()` diretamente, sem cancelamento nem timeout garantido.
- A função `crm-central-admin` concentra muitas responsabilidades em um arquivo grande e carrega o módulo de e-mail no início. Isso aumenta o cold start de qualquer ação, mesmo das mais simples.
- `grant_access` atualiza o plano primeiro, mas continua esperando busca paginada do usuário, troca de senha e envio de e-mail. Se essa etapa demorar, a tela informa timeout embora o plano possa já ter sido aplicado.
- `approve_sales_order` também espera a rotina de e-mail antes de responder.
- `delete_user` executa várias exclusões de tabelas em sequência; `list_trials` pagina todos os usuários e pode executar muitos backfills na mesma requisição.
- A infraestrutura aceita requisições de até 300–400 segundos, enquanto várias telas não têm um limite próprio. Isso deixa loaders presos e permite requisições sobrepostas pelos intervalos automáticos.
- Algumas operações não exibem loader individual, não validam corretamente a resposta ou atualizam a interface antes de confirmar o estado real.
- As credenciais administrativas ainda são transportadas a cada chamada e existem fallbacks no código. A correção não deve trocar a senha atual sem autorização, mas deve preparar uma autenticação administrativa curta e validada no servidor.

## Fluxo final desejado

```text
Clique no painel
  -> cliente administrativo único
  -> timeout + AbortController + requestId
  -> função administrativa leve
  -> validação/autorização no servidor
  -> operação crítica no banco
  -> leitura de confirmação
  -> resposta imediata ao painel
  -> atualização local/recarregamento controlado
  -> tarefas lentas (e-mail) processadas separadamente
```

## 1. Criar um cliente administrativo único e resiliente

Criar um módulo compartilhado para substituir todas as chamadas diretas a `supabase.functions.invoke("crm-central-admin")`.

O cliente deverá:

- usar um único caminho HTTP para a API configurada na VPS;
- aplicar `AbortController` e timeout explícito em todas as chamadas;
- usar limites diferentes para leitura, mutação e exportação, sem permitir espera infinita;
- interpretar JSON tanto em respostas 2xx quanto em respostas de erro;
- distinguir timeout, falha de rede, erro de autorização, validação e erro do servidor;
- gerar `requestId` por operação para rastreamento e idempotência;
- não repetir automaticamente mutações destrutivas;
- permitir uma repetição curta apenas para leituras seguras;
- garantir limpeza de timers em `finally`;
- expor tipos de ação e resposta, removendo `any` do caminho crítico;
- continuar usando as credenciais atuais durante a transição, sem apagar ou alterar os valores já existentes na VPS.

Todas as áreas abaixo passarão a usar esse cliente:

- carregar/recarregar usuários;
- insights;
- trocar senha e lembrar acesso;
- travar e destravar;
- desconectar WhatsApp;
- acessar como usuário;
- excluir cadastro;
- listar, editar e remover números;
- liberar, renovar, cancelar e reenviar acesso;
- listar, aprovar, migrar e excluir vendas;
- criar, ativar/desativar e excluir avisos;
- geração dos blocos do dump/migração.

## 2. Corrigir estados de carregamento em toda a interface

- Criar estado de operação por registro e por ação, em vez de loaders genéricos compartilhados.
- Desabilitar somente o controle em execução, impedindo duplo clique sem congelar o restante do painel.
- Encerrar todo loader em `finally`, inclusive timeout, abort, resposta inválida e erro de atualização posterior.
- Mostrar mensagens específicas: “servidor indisponível”, “operação não confirmada”, “credenciais expiradas” e erro retornado pelo banco.
- Remover chamadas automáticas duplicadas nas abas de testes e vendas.
- Impedir sobreposição dos intervalos de atualização: se uma leitura estiver em andamento, o próximo intervalo será ignorado.
- Cancelar requisições e intervalos ao sair da aba/desmontar o componente.
- Após uma mutação, atualizar imediatamente apenas o registro confirmado, sem disparar um recarregamento concorrente desnecessário.
- Para timeout depois de uma possível escrita, executar uma consulta curta de reconciliação e informar um destes estados:
  - aplicado e confirmado;
  - não aplicado;
  - resultado não confirmado, com botão para verificar novamente.

## 3. Tornar as ações críticas rápidas e determinísticas no backend

Reorganizar `crm-central-admin` para separar o trabalho obrigatório do trabalho lento.

### Operações de cadastro

- `lock_user` / `unlock_user`: validar UUID e motivo, exigir que o perfil exista, atualizar e retornar a linha confirmada.
- `disconnect_whatsapp`: atualizar os campos e retornar o estado desconectado confirmado.
- `set_max_numbers`, `update_user_number`, `delete_user_number`: validar limites, UUIDs e propriedade do número antes de alterar.
- `set_password`: manter fallback compatível com a VPS, mas aplicar timeout interno em cada tentativa e não iniciar uma segunda tentativa se a primeira ainda estiver ativa.
- `delete_user`: mover a limpeza pública para uma rotina transacional/idempotente no banco, tratar dependências conhecidas e só retornar sucesso quando o usuário Auth não existir mais.
- `impersonate`: validar usuário e retornar erro limitado caso a criação do link falhe.

### Planos, testes e vendas

- `grant_access`: considerar sucesso somente após `grant_crm_access` e leitura de confirmação de `is_paid`, `plan` e `access_until`.
- Tornar a liberação idempotente por `requestId`, evitando somar/aplicar novamente em uma tentativa repetida.
- Definir claramente a regra de renovação: preservar a regra atual do RPC e testar tanto plano expirado quanto plano ainda ativo.
- `cancel_access`: confirmar no retorno que o plano está inativo e as datas foram encerradas.
- `approve_sales_order`: atualizar pedido e acesso como uma unidade lógica; se uma parte falhar, não exibir aprovação completa.
- `migrate_sales_order_plan`: atualizar também o acesso efetivo quando a regra atual exigir, evitando divergência entre pedido e perfil.
- `list_trials`: remover backfills em massa da leitura. A listagem deve apenas ler; correções de dados irão para rotina própria/idempotente.

### E-mails e tarefas lentas

- O sucesso da alteração do plano não ficará condicionado ao SMTP.
- Após confirmar a escrita crítica, registrar o e-mail em uma fila persistente no Postgres.
- Um processador separado enviará e atualizará status/tentativas da fila.
- A resposta ao botão retornará assim que plano/cadastro estiver confirmado.
- A interface mostrará “acesso aplicado; e-mail pendente” quando necessário, sem desfazer o plano.
- Aprovação manual, liberação de acesso, lembrete e reenvio usarão o mesmo mecanismo.

## 4. Validar entrada, autenticação e segurança sem quebrar o acesso atual

- Adotar schemas de validação por ação no backend: UUID, e-mail, plano, quantidade de dias, quantidade de números, senha, motivo e IDs.
- Responder `400`, `401`, `404`, `409` e `500/503` de forma consistente, sempre com CORS e JSON.
- Remover fallbacks de credenciais em texto puro das funções após confirmar que `ADMIN_CENTRAL_EMAIL` e `ADMIN_CENTRAL_PASSWORD` estão preservados em `secrets.env` na VPS.
- Substituir gradualmente o envio de senha em toda requisição por uma sessão administrativa curta, assinada no servidor pela função leve de login.
- Armazenar no navegador somente o token administrativo temporário; não persistir senha.
- Validar o token em todas as ações e expirá-lo de forma previsível, redirecionando ao login apenas em `401`.
- Nunca permitir acesso direto do frontend com chave de serviço.

## 5. Ajustar banco e idempotência

Criar uma migration idempotente para:

- fila de tarefas administrativas/e-mails, com timestamps, status com `CHECK`, tentativas, erro e `request_id` único;
- registro mínimo de operações administrativas para reconciliar timeout sem repetir mutações;
- índices para status da fila, `request_id`, e colunas usadas nas buscas administrativas;
- função transacional de limpeza do cadastro, quando aplicável;
- RLS habilitado em toda tabela nova;
- `GRANT` somente para `service_role` nas tabelas internas, sem acesso `anon`;
- nenhuma alteração destrutiva nos dados existentes.

## 6. Otimizar a função e o runtime da VPS

- Retirar imports pesados de e-mail do caminho de inicialização das ações simples; o processador de fila fará esse carregamento separadamente.
- Manter `crm-central-admin-login` pequeno e independente.
- Preservar compatibilidade temporária com o endpoint atual enquanto o frontend migra para o cliente único.
- Registrar logs estruturados com `requestId`, ação, duração, resultado e etapa que falhou, sem registrar senha, token ou conteúdo sensível.
- Adicionar timeout interno para chamadas Auth, banco e SMTP; o limite do gateway continuará sendo uma proteção externa, não o mecanismo principal da UX.
- Garantir que erros do worker cheguem em JSON com CORS, inclusive 404/500.

## 7. Tornar a atualização da VPS verificável

Atualizar o fluxo de deploy sem tocar nos volumes ou substituir secrets existentes:

- preservar `.env`, `secrets.env`, banco e storage;
- aplicar migrations antes de recarregar as funções;
- reiniciar a função somente depois das migrations;
- validar o endpoint raiz e a função de login;
- executar smoke tests autenticados e com timeout para `list_users` e uma leitura de planos;
- validar que as variáveis administrativas obrigatórias existem sem imprimir seus valores;
- falhar o deploy com mensagem clara se a função administrativa não responder dentro do limite;
- mostrar comandos de diagnóstico (`docker compose logs functions`, gateway e banco) quando o smoke test falhar;
- não declarar “atualização concluída” se o Admin Central estiver indisponível.

## 8. Testes obrigatórios

### Unitários

- timeout e cancelamento do cliente compartilhado;
- interpretação de erros HTTP/JSON;
- ausência de repetição automática em mutações;
- limpeza do loader em sucesso, erro, timeout e unmount;
- bloqueio de duplo clique;
- validação de plano/dias/números/motivo/senha.

### Integração do backend

- autenticação inválida e sessão expirada;
- liberar plano em usuário sem perfil, expirado e já ativo;
- repetição do mesmo `requestId` sem aplicar duas vezes;
- cancelar, travar, destravar e desconectar com leitura de confirmação;
- excluir cadastro com dados dependentes e repetir exclusão sem travar;
- falha de SMTP sem reverter nem atrasar a liberação do plano;
- falha parcial em aprovação de venda sem estado inconsistente.

### E2E no `/admincentral`

- login e carregamento inicial;
- criar/liberar/renovar/cancelar acesso;
- travar e destravar;
- desconectar WhatsApp;
- alterar senha e reenviar acesso;
- alterar limite e remover número;
- aprovar/migrar/excluir venda;
- excluir cadastro;
- simular API lenta e indisponível, confirmando que nenhum botão fica girando indefinidamente;
- verificar desktop e viewport móvel.

## Critérios de aceite

- Nenhum botão do `/admincentral` permanece carregando além do timeout definido.
- Toda mutação retorna sucesso somente com o estado crítico confirmado no banco.
- Um timeout nunca provoca aplicação duplicada ao tentar novamente.
- Liberar plano funciona mesmo se o serviço de e-mail estiver lento ou fora do ar.
- Erros exibem causa acionável e o controle volta a ficar disponível.
- Atualizações automáticas não se sobrepõem às ações manuais.
- Login e ações administrativas passam pelos smoke tests da VPS após cada atualização.
- Banco, volumes, conexões, tokens e configurações atuais são preservados.

## Arquivos previstos

- `src/lib/adminCentralApi.ts` (novo cliente compartilhado)
- `src/pages/AdminCentral.tsx`
- `src/components/admin/TrialsPanel.tsx`
- `src/components/admin/SalesOrdersPanel.tsx`
- `src/components/admin/AnnouncementsAdminPanel.tsx`
- componentes administrativos que ainda chamem a função diretamente
- `supabase/functions/crm-central-admin/index.ts`
- `supabase/functions/crm-central-admin-login/index.ts`
- função/processador da fila administrativa e helper compartilhado de autenticação
- migration SQL nova para fila, idempotência e operação transacional
- `deploy/postgres-stack/secrets.env.example`
- `deploy/atualizar.sh`
- testes unitários, de integração e E2E correspondentes

## Ordem de execução

1. Criar testes reprodutores dos hangs e inventariar todas as ações.
2. Implementar o cliente único com timeout e migrar todas as abas.
3. Corrigir loaders, concorrência, cancelamento e reconciliação visual.
4. Otimizar/validar ações críticas no backend.
5. Separar e-mails por fila persistente e adicionar idempotência.
6. Fortalecer a sessão administrativa sem trocar as credenciais existentes.
7. Atualizar deploy e smoke tests da VPS.
8. Executar testes, build, validação visual e cenário de API indisponível.
