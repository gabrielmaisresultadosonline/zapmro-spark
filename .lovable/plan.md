# Corrigir prévia de mídia no fluxo + animação ao salvar

## Problema 1 — imagens/vídeos quebrados na prévia do fluxo

As mídias do fluxo são gravadas com a URL pública do Storage no momento do upload. Depois da migração para a VPS, essas URLs antigas (`*.supabase.co` ou host interno `gateway:8000`) não existem mais no navegador — por isso a prévia aparece como imagem quebrada, mesmo com o arquivo presente.

Já existe a função `resolveMediaUrl()` (`src/lib/mediaUrl.ts`) que reescreve esses casos para o Storage atual. O chat do CRM já a usa; o editor de fluxos e a prévia estilo WhatsApp **não**.

Correção: aplicar `resolveMediaUrl()` em todo `src`/`poster` de mídia dentro do fluxo:
- `src/components/crm/FlowEditor.tsx` — nós de imagem/vídeo (miniatura no canvas), painel lateral de pergunta/imagem/vídeo, cartões do carrossel.
- `src/components/crm/WhatsAppFlowPreview.tsx` — `imageUrl`, `videoUrl` e `cards[].mediaUrl`.

Adicionalmente, quando a imagem falhar mesmo assim, mostrar um estado visual claro ("mídia indisponível") em vez do ícone quebrado do navegador, usando `onError` com token semântico.

## Problema 2 — salvar parece não atualizar

Hoje o `onSave` fecha o editor na hora e chama `fetchData(false)`, que recarrega **todos** os dados do CRM (contatos, mensagens, agendamentos…). Por isso demora ~3s e, se o fluxo for reaberto logo em seguida, ainda vem a versão antiga.

Correção em `src/pages/CRM.tsx` (`handleSaveFlow`):
1. Mostrar um overlay bloqueante com ícone do WhatsApp animado e barra de progresso enquanto salva.
2. Após o `update`/`insert`, recarregar **apenas** `crm_flows` (consulta escopada, não `fetchData` inteiro) e atualizar o estado local — isso deixa o salvar bem mais rápido e garante que o fluxo reaberto já esteja atualizado.
3. Só então fechar o overlay e o editor, com uma pequena transição de "Salvo!" para não confundir.

## Novo componente

`src/components/crm/FlowSaveOverlay.tsx` — overlay de tela cheia:
- ícone do WhatsApp com pulso/ping suave;
- barra de progresso animada que avança durante o salvamento e completa em 100% ao terminar;
- estados: `Salvando fluxo...` → `Fluxo salvo!`, fechando sozinho.
- Tokens semânticos e `cn()`, mobile-first, com `role="status"` e `aria-live`.

## Escopo

Nada além disso é alterado: lógica de nós, envio, webhooks e demais telas ficam intactas.
