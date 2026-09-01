# Plano: variáveis ausentes nos scripts + permissão + o número em Coexistência

## Diagnóstico (o "porquê" antes do "como")

Três problemas distintos aparecem no seu log — só um deles é bug de código:

1. **`Permission denied` em `./deploy/atualizar.sh`** — o bit de execução não está
   versionado nesse arquivo (no repositório ele está `-rw-r--r--`, enquanto
   `reparar-coexistencia.sh` e `diagnosticar-um-numero.sh` estão `-rwxr-xr-x`).
   Nada a ver com a Meta.

2. **`FACEBOOK_APP_ID / FACEBOOK_APP_SECRET ausentes no .env`** — bug real de
   escopo: os scripts de diagnóstico/reparo carregam **apenas**
   `deploy/postgres-stack/.env`. As chaves das integrações (Meta, Google, SMTP…)
   moram em `deploy/postgres-stack/secrets.env`, que é lido só pelo container
   `functions`. Por isso o passo 1 e 2 do reparo foram pulados mesmo com o
   arquivo existindo na VPS.

3. **O número `+55 67 9875-3004` (Dr Edwin Cruz)** — e sim, **tem relação com
   aquele trecho que você citou**. A leitura da Meta é contraditória de propósito:
   `platform_type: CLOUD_API`, mas `name_status: NON_EXISTS` e
   `code_verification_status: NOT_VERIFIED`. Isso é a assinatura de um número que
   passou pelo Embedded Signup **sem concluir a sincronização no aplicativo
   WhatsApp Business do celular**. A WABA existe, o app está assinado
   (`assinado por: ZAPMROCLOUDAPI`, `success: true`), mas não há vínculo com a
   caixa real — então a Meta não tem para onde entregar evento nenhum. É
   exatamente por isso que os 90s de escuta não mostraram nenhuma linha de
   webhook (só ruído do `GOOGLE-SYNC`, que é outro assunto). Nenhuma reassinatura
   resolve isso: **falta uma ação no celular do cliente ou a migração definitiva
   para Cloud API.**

O log de `GOOGLE-SYNC ... [403]` é independente e não afeta WhatsApp: é o
Google People API recusando o escopo de leitura de contatos em 4 contas.
Fica registrado, não entra neste plano.

## O que será alterado no código

**Carregamento de secrets nos scripts operacionais** — em
`deploy/diagnosticar-um-numero.sh`, `deploy/reparar-coexistencia.sh` e
`deploy/registrar-numero-cloudapi.sh`:

- passar a carregar, em ordem, `.env` **e depois** `secrets.env` (quando existir),
  ambos com `set -a`, para que `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`,
  `META_WEBHOOK_VERIFY_TOKEN` e afins fiquem visíveis;
- manter `.env` como obrigatório (é onde estão `POSTGRES_PASSWORD` e `PG_PORT`)
  e `secrets.env` como opcional, sem quebrar quem ainda não o criou;
- quando `PUBLIC_API_URL` não existir em nenhum dos dois, derivar o callback de
  `SITE_URL`/`APP_BASE_URL` em vez de abortar o passo;
- mensagem de erro explícita dizendo **em qual arquivo** falta cada chave.

**Permissão de execução** — aplicar o bit executável a todos os `deploy/*.sh` no
repositório, para que `git reset --hard` já entregue os scripts prontos e o
`Permission denied` não volte.

**`deploy/atualizar.sh`** — ao mesclar o `secrets.env.example` no `secrets.env`
existente, preservar valores já preenchidos (comportamento atual) e passar a
avisar, nominalmente, quais chaves críticas de WhatsApp continuam em branco.

## O que você roda na VPS

```bash
cd /var/www/ia-mro
git fetch origin && git reset --hard origin/main
chmod +x deploy/*.sh                 # rede de segurança, caso o bit não venha
./deploy/atualizar.sh
./deploy/reparar-coexistencia.sh 1277217672141708
```

O `secrets.env` que você colou já está no formato correto e vai passar a ser
lido pelos scripts. Ele fica fora do git (e continua assim).

## Ponto de segurança — leia antes de seguir

Você colou no chat, em texto puro, o `FACEBOOK_APP_SECRET`, o
`GOOGLE_CLIENT_SECRET`, a `LOVABLE_API_KEY` e senhas de SMTP. Trate todas como
**comprometidas** e faça a rotação: novo App Secret no painel da Meta, novo
client secret no Google Cloud, rotação da chave Lovable, troca da senha de
e-mail. Vou usar apenas o formato do arquivo, não os valores.

## Limite honesto sobre o número do Dr Edwin

Depois deste plano os scripts vão funcionar e reassinar tudo corretamente — mas
o número **provavelmente continuará sem receber mensagens**, porque o bloqueio
está do lado da Meta/celular, não do nosso. Os dois caminhos reais:

- **(a) Concluir a Coexistência:** no celular dele, WhatsApp Business >
  Configurações > Ferramentas comerciais > API, finalizar a sincronização; ou
  refazer o Embedded Signup no CRM **até o fim**, aceitando no aparelho.
- **(b) Migrar de vez para Cloud API** (recomendado se ele só quer o CRM): remover
  o número da conta SMB e adicioná-lo pelo WhatsApp Manager como número Cloud
  API. Aí `/register` + PIN passam a valer, `code_verification_status` vira
  `VERIFIED` — e o número deixa de funcionar no aplicativo do celular.
