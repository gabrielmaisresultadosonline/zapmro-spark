# Bot WhatsApp — Renda Extra v2

Bot que conecta ao WhatsApp (whatsapp-web.js) e troca dados com o painel
`/rendaextra2/admin` via a edge function `wpp-bot-admin`.

## Setup rápido na VPS

```bash
cd /var/www/ia-mro/whatsapp-bot
cp .env.example .env
nano .env         # ajuste WPP_BOT_TOKEN (mesmo valor do secret no Lovable Cloud)
npm install --omit=dev
pm2 start index.js --name wpp-bot-mro --time
pm2 logs wpp-bot-mro
```

O `deploy/update.sh` já faz isso automaticamente.

## Comandos úteis

```bash
pm2 status wpp-bot-mro       # estado
pm2 logs wpp-bot-mro         # logs em tempo real
pm2 restart wpp-bot-mro      # reiniciar
pm2 delete wpp-bot-mro       # remover
rm -rf .wwebjs_auth          # forçar novo QR (logout completo)
```

## Como gerar o QR Code

1. Acesse `/rendaextra2/admin` → aba **WhatsApp**.
2. Clique em **"Conectar WhatsApp / Gerar QR"**.
3. O QR aparece tanto no painel quanto no terminal (`pm2 logs wpp-bot-mro`).
4. Escaneie com WhatsApp → Aparelhos conectados.
