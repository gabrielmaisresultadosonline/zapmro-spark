O usuário relatou dois problemas no Editor de Fluxos:
1. As etiquetas (status) não estão sendo salvas corretamente ao configurar um bloco de "Ação CRM".
2. O gatilho de "Frase Completa Exata" não está funcionando ou salvando corretamente.

### Problema 1: Etiquetas no bloco Ação CRM
Ao analisar o código de `FlowEditor.tsx`, identifiquei que o nó `CRMActionNode` utiliza `data.statusLabel` para exibir a etiqueta, mas o formulário de edição atualiza `statusValue` e `statusLabel`. No entanto, na função `handleSave` do componente, os dados dos nós são salvos, mas pode haver uma inconsistência na forma como o estado local do nó selecionado reflete as mudanças. Vou garantir que a atualização do nó seja refletida imediatamente e que os nomes das propriedades estejam corretos.

### Problema 2: Gatilho de Frase Completa
No `FlowEditor.tsx`, o campo `trigger_keywords` é salvo como um array (`split(',')`). Para o tipo `exact_phrase`, isso pode estar causando confusão ou erros de busca no backend. Além disso, o backend (`meta-whatsapp-crm`) processa o início do fluxo. Vou ajustar o editor para tratar `exact_phrase` de forma distinta (sem quebrar por vírgulas se for frase completa) e verificar se o backend está preparado para essa comparação exata.

### Plano de Implementação:

**Frontend (src/components/crm/FlowEditor.tsx):**
- Corrigir a atualização de dados do nó selecionado para garantir que etiquetas e outros campos sejam persistidos no estado global do fluxo.
- Ajustar a lógica de salvamento do gatilho para diferenciar "Palavras-chave" (array) de "Frase Completa" (string única no array ou campo dedicado).
- Adicionar logs de depuração para rastrear o que está sendo enviado ao Supabase.

**Backend (supabase/functions/meta-whatsapp-crm/index.ts):**
- (Se necessário após teste) Reforçar a lógica de detecção de gatilhos para suportar `exact_phrase` com comparação estrita de string.

### Detalhes Técnicos:
- No `CRMActionNode`, verificar se `data.statusLabel` está sendo exibido corretamente.
- No formulário lateral, garantir que `updateNodeData` chame corretamente a atualização do nó no array `nodes` do React Flow.
- No `handleSave`, tratar `triggerKeywords` baseado no `triggerType`.

Vou começar corrigindo o `FlowEditor.tsx`.
