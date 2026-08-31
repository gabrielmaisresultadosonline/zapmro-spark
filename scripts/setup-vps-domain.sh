#!/bin/bash

# ==============================================================================
# 🚀 SCRIPT DE INSTALAÇÃO AUTOMÁTICA - WHATSAPP AUDIO BRIDGE (PRO)
# Versão: 2.5 (Reverse Proxy + Transcoder + PTT Fix)
# Desenvolvido para: maisresultadosonline.com.br
# ==============================================================================

echo "------------------------------------------------------------------"
echo "💎 Iniciando Instalação Profissional do Bridge..."
echo "------------------------------------------------------------------"

# 1. Verificar privilégios
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Erro: Execute este script com sudo."
  exit 1
fi

# 2. Instalar dependências do sistema
echo "📦 Instalando dependências (Nginx, FFmpeg, Node.js)..."
apt update && apt install -y nginx ffmpeg curl
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

# 3. Preparar diretórios
BASE_DIR="/var/www/ia-mro/scripts"
mkdir -p "$BASE_DIR/temp"
cd "$BASE_DIR"

# 4. Criar o package.json
echo "📝 Configurando ambiente Node.js..."
cat > package.json <<EOF
{
  "name": "whatsapp-audio-bridge",
  "version": "1.0.0",
  "type": "module",
  "main": "vps-whatsapp-bridge.js",
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "axios": "^1.6.2",
    "fluent-ffmpeg": "^2.1.2",
    "form-data": "^4.0.0",
    "uuid": "^9.0.1"
  }
}
EOF

npm install

# 5. Criar o código do servidor Bridge (Versão 2.5 - PTT Nativo)
echo "🛠️ Gerando código do servidor bridge..."
cat > vps-whatsapp-bridge.js <<EOF
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const TEMP_DIR = path.join(__dirname, 'temp');

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        version: '2.5', 
        service: 'WhatsApp Audio Bridge',
        owner: 'Mais Resultados Online'
    });
});

app.post('/transcode', async (req, res) => {
    const { audioUrl, phoneNumberId, accessToken, recipientPhone } = req.body;
    
    if (!audioUrl || !phoneNumberId || !accessToken || !recipientPhone) {
        return res.status(400).json({ error: 'Faltam parâmetros obrigatórios' });
    }

    const taskId = uuidv4();
    const inputPath = path.join(TEMP_DIR, \`input_\${taskId}.mp3\`);
    const outputPath = path.join(TEMP_DIR, \`output_\${taskId}.ogg\`);

    try {
        console.log(\`[#\${taskId}] ⬇️ Baixando áudio: \`, audioUrl);
        const response = await axios({ url: audioUrl, responseType: 'stream' });
        const writer = fs.createWriteStream(inputPath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log(\`[#\${taskId}] ⚙️ Convertendo para OGG/OPUS (WhatsApp PTT)... \`);
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .toFormat('ogg')
                .audioCodec('libopus')
                .audioChannels(1)
                .audioFrequency(16000)
                .audioBitrate('32k')
                .on('end', resolve)
                .on('error', (err) => {
                    console.error('Erro FFmpeg:', err);
                    reject(err);
                })
                .save(outputPath);
        });

        console.log(\`[#\${taskId}] ⬆️ Fazendo upload para Meta Media API...\`);
        const form = new FormData();
        form.append('messaging_product', 'whatsapp');
        form.append('file', fs.createReadStream(outputPath));
        form.append('type', 'audio/ogg');

        const mediaRes = await axios.post(
            \`https://graph.facebook.com/v23.0/\${phoneNumberId}/media\`,
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': \`Bearer \${accessToken}\`
                }
            }
        );

        const mediaId = mediaRes.data.id;
        console.log(\`[#\${taskId}] ✅ Media ID Gerado: \`, mediaId);

        // Aguarda 2 segundos para garantir que a Meta indexou o arquivo
        await new Promise(r => setTimeout(r, 2000));

        console.log(\`[#\${taskId}] 📱 Enviando como ÁUDIO DE VOZ (PTT) para \${recipientPhone}...\`);
        const sendRes = await axios.post(
            \`https://graph.facebook.com/v23.0/\${phoneNumberId}/messages\`,
            {
                messaging_product: "whatsapp",
                to: recipientPhone,
                type: "audio",
                audio: {
                    id: mediaId
                }
            },
            { headers: { 'Authorization': \`Bearer \${accessToken}\` } }
        );

        console.log(\`[#\${taskId}] 🚀 SUCESSO!\`);
        res.json({ success: true, messageId: sendRes.data.messages[0].id });

    } catch (error) {
        console.error(\`[#\${taskId}] ❌ ERRO:\`, error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Falha no processamento', 
            details: error.response?.data || error.message 
        });
    } finally {
        setTimeout(() => {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        }, 30000);
    }
});

app.listen(PORT, () => {
    console.log('==================================================');
    console.log('🚀 WHATSAPP AUDIO BRIDGE - VPS ATIVO');
    console.log('🌐 Porta: ' + PORT);
    console.log('🛠️ Versão: 2.5 (Reverse Proxy Ready)');
    console.log('==================================================');
});
EOF

# 6. Configurar Nginx (Reverse Proxy)
echo "🌐 Configurando Nginx para maisresultadosonline.com.br/bridge..."
DOMAIN="maisresultadosonline.com.br"
CONF_FILE="/etc/nginx/sites-available/whatsapp-bridge"

cat > $CONF_FILE <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location /bridge/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        client_max_body_size 50M;
    }
}
EOF

ln -sf $CONF_FILE /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx

# 7. Configurar PM2
echo "🔄 Reiniciando serviço no PM2..."
npm install -g pm2
pm2 stop whatsapp-audio || true
pm2 start vps-whatsapp-bridge.js --name "whatsapp-audio" --update-env
pm2 save

echo "------------------------------------------------------------------"
echo "✅ TUDO PRONTO E AUTOMATIZADO!"
echo "------------------------------------------------------------------"
echo "1. Sua nova URL: http://$DOMAIN/bridge"
echo "2. Para ver os logs: pm2 logs whatsapp-audio"
echo "3. IMPORTANTE: Atualize no CRM para http://$DOMAIN/bridge"
echo "------------------------------------------------------------------"
