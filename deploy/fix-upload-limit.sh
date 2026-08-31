#!/bin/bash

# ==============================================
# Fix "Request Entity Too Large" (413) error
# Run this on your VPS to allow large video uploads
# Usage: chmod +x deploy/fix-upload-limit.sh && sudo ./deploy/fix-upload-limit.sh
# ==============================================

set -e

echo "🔧 Corrigindo limite de upload do Nginx..."

# 1. Fix global nginx.conf
NGINX_MAIN="/etc/nginx/nginx.conf"
if [ -f "$NGINX_MAIN" ]; then
  if grep -q "client_max_body_size" "$NGINX_MAIN"; then
    sed -i 's/client_max_body_size.*/client_max_body_size 3G;/' "$NGINX_MAIN"
    echo "✅ nginx.conf: client_max_body_size atualizado para 3G"
  else
    sed -i '/http {/a \    client_max_body_size 3G;' "$NGINX_MAIN"
    echo "✅ nginx.conf: client_max_body_size 3G adicionado"
  fi
else
  echo "⚠️ /etc/nginx/nginx.conf não encontrado"
fi

# 2. Fix all site configs
for CONF in /etc/nginx/sites-available/*; do
  if [ -f "$CONF" ]; then
    BASENAME=$(basename "$CONF")
    if grep -q "client_max_body_size" "$CONF"; then
      sed -i 's/client_max_body_size.*/client_max_body_size 3G;/' "$CONF"
      echo "✅ $BASENAME: client_max_body_size atualizado para 3G"
    else
      sed -i '/server_name/a \    client_max_body_size 3G;' "$CONF"
      echo "✅ $BASENAME: client_max_body_size 3G adicionado"
    fi
  fi
done

# 3. Test and reload
echo ""
echo "🔄 Testando e recarregando Nginx..."
nginx -t && systemctl reload nginx

echo ""
echo "✅ Pronto! O limite de upload agora é 3GB."
echo "   Tente fazer o upload novamente."
