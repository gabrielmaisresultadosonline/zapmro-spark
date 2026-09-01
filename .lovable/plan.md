# Correção definitiva do recebimento WhatsApp após multi-número

## Diagnóstico confirmado

O build do frontend terminou normalmente; os arquivos `dist/assets/...` não são erro. A falha está no processamento do webhook na Edge Function.

Há quatro problemas distintos a tratar em conjunto:

1. **A VPS registrou execução de código antigo:** o log `ReferenceError: webhookPhoneNumberId is not defined` corresponde à versão anterior do handler. No código atual, a variável já está declarada no escopo da função. Porém o diagnóstico lê seis horas de logs e não separa eventos anteriores e posteriores ao deploy, então ainda não prova qual versão processou a última mensagem.
2. **Criação de contatos pode falhar após a migração 088:** o webhook usa `upsert(... onConflict: 'wa_id,user_id,whatsapp_number_id')`, mas o SQL criou um índice único parcial. O PostgreSQL/PostgREST pode não reconhecer esse índice parcial como alvo do `ON CONFLICT`; para contato novo, isso pode retornar erro e impedir a gravação da mensagem em qualquer cadastro.
3. **Ainda existem consultas sem escopo do número:** o contato é corretamente localizado por número no início, mas depois é buscado novamente apenas por `user_id + wa_id`. Ecos enviados pelo celular, mídia, edição, deduplicação e etapas de fluxo também têm trechos que usam as configurações principais ou não filtram `whatsapp_number_id`. Isso pode selecionar a conversa da outra caixa.
4. **O script de diagnóstico não é compatível com o schema real da VPS:** ele pressupõe `auth.users.email`, coluna que não existe nessa instalação, e por isso os blocos 2–5 não executam. Além disso, exibe logs antigos junto dos novos.

Os erros de Google Sync `403` e falhas transitórias para `gateway:8000` são problemas paralelos; serão identificados no relatório, mas não serão misturados à correção do webhook para evitar alterar outras partes do sistema.

## Implementação

### 1. Tornar a resolução do número única e obrigatória no webhook

- Resolver `phone_number_id` uma única vez, no começo de cada unidade do payload, buscando primeiro em `crm_whatsapp_numbers` e usando `crm_settings` apenas como compatibilidade para cadastros antigos.
- Produzir um contexto imutável do evento com `user_id`, `whatsapp_number_id`, token, `phone_number_id` e WABA.
- Para mensagens recebidas, recusar gravação ambígua quando o payload contém `phone_number_id` mas ele não pertence a nenhum cadastro; retornar HTTP 200 para a Meta não criar tempestade de retries, com log estruturado e motivo explícito.
- Manter funcionamento dos cadastros antigos de um número: se ainda não existir linha em `crm_whatsapp_numbers`, usar a credencial de `crm_settings` e criar/gravar com o fallback compatível previsto pela migração.

### 2. Corrigir gravação de contatos e mensagens

- Substituir o `upsert` dependente do índice parcial por fluxo seguro: buscar por `(user_id, whatsapp_number_id, variantes do wa_id)`, tentar `insert`, e em corrida de concorrência buscar novamente a mesma chave.
- Gravar `whatsapp_number_id` explicitamente em todo contato e toda mensagem recebida; o trigger fica apenas como proteção para chamadas legadas.
- Escopar por número a deduplicação, edição, releitura do contato após a gravação e todas as decisões de IA/fluxo.
- Validar o retorno de cada insert/update. Nenhuma falha de banco poderá continuar silenciosamente até uma etapa posterior.
- Preservar dados existentes; nenhuma conversa ou mensagem será apagada.

### 3. Corrigir caminhos secundários do mesmo webhook

- Alterar `saveOutboundEcho` para receber o contexto do número, buscar/criar contato na caixa correta e gravar `whatsapp_number_id`.
- Buscar mídia com o token do número que recebeu/enviou o evento, não com o token global de `crm_settings`.
- Escopar atualização de mensagens editadas e deduplicação por `whatsapp_number_id` quando conhecido.
- Passar a caixa correta ao executor de fluxos e respostas automáticas, garantindo que a resposta saia pelo mesmo número da conversa.
- Manter sincronização de status por `meta_message_id`, adicionando o número como filtro defensivo quando disponível.

### 4. Fortalecer a migração sem risco aos 74 mil registros

- Criar uma nova migração idempotente, sem reexecutar ou alterar destrutivamente a 088.
- Conferir duplicidades reais antes de qualquer constraint/índice adicional.
- Garantir índices eficientes para contatos e mensagens por `(user_id, whatsapp_number_id)` e busca de número por `meta_phone_number_id`.
- Corrigir somente o mecanismo necessário à concorrência do webhook; não mover históricos já atribuídos automaticamente, pois isso poderia associar dados antigos ao número errado.
- Incluir consultas de auditoria para: números sem dono, IDs Meta duplicados, registros órfãos e contatos duplicados dentro da mesma caixa.

### 5. Refazer o diagnóstico da VPS

- Detectar dinamicamente onde o e-mail está armazenado (`auth.users`, metadados ou identidade), sem assumir uma coluna fixa.
- Passar o filtro de e-mail ao `psql` como variável segura, evitando interpolação SQL.
- Mostrar todos os cadastros quando o e-mail não puder ser resolvido, em vez de abortar os blocos seguintes.
- Separar logs anteriores ao deploy dos logs gerados pelo teste atual.
- Adicionar uma identificação inequívoca da versão ativa: commit do repositório, hash do arquivo montado dentro do container, horário de início do container e marcador de versão emitido pela função.
- Para cada `phone_number_id`, cruzar: dono, número interno, token preenchido, assinatura WABA, último inbound no banco e último evento no log.
- Ocultar tokens e demais segredos da saída.

### 6. Garantir que a VPS carregue o código novo

- Ajustar a atualização das funções para recriar o container quando necessário, em vez de depender apenas de `restart` com worker/cache existente.
- Após subir, comparar o hash do arquivo no host com o arquivo montado em `/home/deno/functions/meta-whatsapp-crm/index.ts`.
- Limpar o ponto de corte dos logs e executar uma chamada de saúde antes de liberar o teste real.
- Não tocar nos volumes do PostgreSQL, Auth ou Storage.

## Validação obrigatória

1. **Teste automatizado de webhook:** payload Meta de um cadastro antigo com um número, primeiro e segundo número de um cadastro multi-número, contato novo, contato existente, mídia, eco e status.
2. **Isolamento:** o mesmo cliente enviando para dois números deve criar/usar dois contatos independentes e mensagens com IDs de caixa diferentes.
3. **Regressão single-number:** cadastros antigos continuam recebendo mesmo quando só `crm_settings` estiver preenchido.
4. **Concorrência:** duas entregas simultâneas da mesma mensagem geram uma única mensagem, sem erro 500.
5. **VPS após deploy:** zerar o ponto de leitura dos logs, enviar uma mensagem real para pelo menos um cadastro comum e para os dois números do cadastro multi-número, e confirmar no banco o `whatsapp_number_id` correto.
6. **Qualidade:** build sem erros e ausência de novos `ReferenceError`, falhas de `ON CONFLICT` e `missing_user` nos eventos de teste.

## Publicação segura e rollback

1. Fazer backup antes da nova migração.
2. Aplicar a migração idempotente.
3. Recriar somente o container de funções e verificar hashes.
4. Executar os testes reais controlados antes de considerar o serviço normalizado.
5. Se a validação falhar, restaurar imediatamente a versão anterior da Edge Function; a migração será aditiva e não exigirá apagar ou restaurar dados.

## Critério de conclusão

A correção só será considerada concluída quando os três cenários — cadastro comum, número principal e segundo número — receberem e gravarem mensagens após o mesmo deploy, sem mistura de histórico, com o número correto registrado e sem erro no log novo.
