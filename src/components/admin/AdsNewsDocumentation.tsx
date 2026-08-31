import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FileText, 
  Database, 
  Mail, 
  CreditCard, 
  Users, 
  Settings,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Code,
  Server,
  Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

const AdsNewsDocumentation = () => {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<string[]>(['overview']);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const toggleSection = (id: string) => {
    setExpandedSections(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const CodeBlock = ({ code, label }: { code: string; label?: string }) => (
    <div className="relative bg-slate-900 rounded-lg p-4 my-2 overflow-x-auto">
      <pre className="text-green-400 text-sm font-mono whitespace-pre-wrap">{code}</pre>
      <Button
        size="sm"
        variant="ghost"
        className="absolute top-2 right-2 h-8 w-8 p-0"
        onClick={() => copyToClipboard(code, label || 'code')}
      >
        {copiedText === label ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );

  const InfoRow = ({ label, value, copyable = false }: { label: string; value: string; copyable?: boolean }) => (
    <div className="flex items-start gap-2 py-2 border-b border-slate-700 last:border-0">
      <span className="text-slate-400 min-w-[180px] font-medium">{label}:</span>
      <span className="text-white flex-1 break-all">{value}</span>
      {copyable && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 flex-shrink-0"
          onClick={() => copyToClipboard(value, label)}
        >
          {copiedText === label ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </Button>
      )}
    </div>
  );

  const sections: DocSection[] = [
    {
      id: 'overview',
      title: '📋 Visão Geral do Sistema',
      icon: <FileText className="h-5 w-5" />,
      content: (
        <div className="space-y-4">
          <p className="text-slate-300">
            O <strong>Ads News</strong> é um sistema de gestão de leads e anúncios que permite clientes contratarem 
            serviços de criação de campanhas publicitárias no Facebook, Instagram e WhatsApp Status.
          </p>
          
          <h4 className="font-bold text-white mt-4">Fluxo do Cliente:</h4>
          <ol className="list-decimal list-inside text-slate-300 space-y-2">
            <li>Acessa página de vendas <code className="bg-slate-700 px-2 py-1 rounded">/anuncios</code></li>
            <li>Preenche nome, email e telefone</li>
            <li>Paga R$397 (ou R$1 para teste) via InfiniPay</li>
            <li>Sistema verifica pagamento automaticamente</li>
            <li>Acesso liberado ao dashboard <code className="bg-slate-700 px-2 py-1 rounded">/anuncios/dash</code></li>
            <li>Cliente preenche dados do negócio (nicho, região, WhatsApp, logo, etc.)</li>
            <li>Cliente adiciona saldo para anúncios (mínimo R$150)</li>
            <li>Admin ativa campanha e envia página de vendas</li>
            <li>Campanha roda por 30 dias</li>
          </ol>

          <h4 className="font-bold text-white mt-4">Rotas do Sistema:</h4>
          <div className="bg-slate-800 rounded-lg p-4">
            <InfoRow label="Página de Vendas" value="/anuncios" copyable />
            <InfoRow label="Dashboard Cliente" value="/anuncios/dash" copyable />
            <InfoRow label="Painel Admin" value="/anuncios/admin" copyable />
          </div>

          <h4 className="font-bold text-white mt-4">Credenciais Admin:</h4>
          <div className="bg-slate-800 rounded-lg p-4">
            <InfoRow label="Email" value="mro@gmail.com" copyable />
            <InfoRow label="Senha" value="Ga145523@" copyable />
          </div>
        </div>
      )
    },
    {
      id: 'database',
      title: '🗄️ Estrutura do Banco de Dados (Supabase)',
      icon: <Database className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <div className="bg-slate-800 rounded-lg p-4">
            <h4 className="font-bold text-blue-400 mb-2">📦 Projeto Supabase</h4>
            <InfoRow label="Project ID" value="adljdeekwifwcdcgbpit" copyable />
            <InfoRow label="URL" value="https://adljdeekwifwcdcgbpit.supabase.co" copyable />
            <InfoRow label="Dashboard" value="https://supabase.com/dashboard/project/adljdeekwifwcdcgbpit" copyable />
          </div>

          <h4 className="font-bold text-white">Tabelas Utilizadas:</h4>

          {/* ads_users */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-green-400 mb-2">👤 ads_users</h5>
            <p className="text-slate-400 text-sm mb-2">Armazena dados dos clientes cadastrados</p>
            <CodeBlock label="ads_users" code={`Colunas:
- id (uuid) - Chave primária
- name (text) - Nome do cliente
- email (text) - Email (único, usado para login)
- password (text) - Senha (gerada automaticamente ou definida)
- phone (text) - Telefone
- status (text) - 'pending' | 'active'
- subscription_start (timestamp) - Início da assinatura
- subscription_end (timestamp) - Fim da assinatura
- created_at, updated_at`} />
          </div>

          {/* ads_orders */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-green-400 mb-2">💳 ads_orders</h5>
            <p className="text-slate-400 text-sm mb-2">Pedidos de assinatura inicial (R$397)</p>
            <CodeBlock label="ads_orders" code={`Colunas:
- id (uuid) - Chave primária
- user_id (uuid) - FK para ads_users
- email (text) - Email do cliente
- name (text) - Nome
- amount (numeric) - Valor (397 ou 1 para teste)
- nsu_order (text) - ID único do pedido InfiniPay
- infinitepay_link (text) - Link de pagamento
- status (text) - 'pending' | 'paid' | 'expired'
- paid_at (timestamp) - Data do pagamento
- invoice_slug (text) - Slug da fatura InfiniPay
- transaction_nsu (text) - NSU da transação
- created_at, updated_at`} />
          </div>

          {/* ads_balance_orders */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-green-400 mb-2">💰 ads_balance_orders</h5>
            <p className="text-slate-400 text-sm mb-2">Pedidos de saldo para anúncios</p>
            <CodeBlock label="ads_balance_orders" code={`Colunas:
- id (uuid) - Chave primária
- user_id (uuid) - FK para ads_users
- amount (numeric) - Valor do saldo
- leads_quantity (integer) - Qtd estimada de leads
- nsu_order (text) - ID único do pedido
- infinitepay_link (text) - Link de pagamento
- status (text) - 'pending' | 'paid'
- paid_at (timestamp) - Data do pagamento
- created_at, updated_at`} />
          </div>

          {/* ads_client_data */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-green-400 mb-2">📊 ads_client_data</h5>
            <p className="text-slate-400 text-sm mb-2">Dados do negócio do cliente</p>
            <CodeBlock label="ads_client_data" code={`Colunas:
- id (uuid) - Chave primária
- user_id (uuid) - FK para ads_users (1:1)
- niche (text) - Nicho de atuação
- region (text) - Região (ou Brasil todo)
- instagram (text) - @ do Instagram
- whatsapp (text) - Número WhatsApp
- telegram_group (text) - Link grupo Telegram
- logo_url (text) - URL da logo no storage
- observations (text) - Observações
- offer_description (text) - Descrição da oferta
- competitor1_instagram (text) - Concorrente 1
- competitor2_instagram (text) - Concorrente 2
- media_urls (text[]) - Array de URLs de mídias
- sales_page_url (text) - URL da página de vendas criada
- edit_count (integer) - Contador de edições (máx 2)
- campaign_active (boolean) - Campanha ativada pelo admin
- campaign_activated_at (timestamp) - Data de ativação
- campaign_end_date (timestamp) - Data de término (30 dias)
- created_at, updated_at`} />
          </div>

          {/* ads_admins */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-green-400 mb-2">👑 ads_admins</h5>
            <p className="text-slate-400 text-sm mb-2">Administradores do sistema</p>
            <CodeBlock label="ads_admins" code={`Colunas:
- id (uuid)
- email (text)
- password (text)
- name (text)
- created_at`} />
          </div>
        </div>
      )
    },
    {
      id: 'edge-functions',
      title: '⚡ Edge Functions (Backend)',
      icon: <Server className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">
            As Edge Functions rodam no Supabase e são responsáveis por toda lógica de backend.
          </p>

          {/* ads-auth */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-purple-400 mb-2">🔐 ads-auth</h5>
            <p className="text-slate-400 text-sm mb-2">Autenticação e gerenciamento de dados</p>
            <InfoRow label="Arquivo" value="supabase/functions/ads-auth/index.ts" copyable />
            <div className="mt-2">
              <p className="text-white text-sm font-medium mb-1">Actions disponíveis:</p>
              <CodeBlock label="ads-auth-actions" code={`// Login do cliente
action: 'login'
body: { email, password }

// Login do admin
action: 'admin-login'
body: { email, password }

// Buscar todos os pedidos (admin)
action: 'get-all-orders'

// Salvar dados do cliente
action: 'save-client-data'
body: { userId, niche, region, instagram, whatsapp, ... }

// Adicionar saldo para anúncios
action: 'add-balance'
body: { userId, email, amount, leadsQuantity }

// Ativar anúncios (admin)
action: 'activate-ads'
body: { userId, salesPageUrl, balanceAmount, sendEmail: true }

// Definir URL da página de vendas
action: 'set-sales-page'
body: { userId, salesPageUrl }`} />
            </div>
          </div>

          {/* ads-checkout */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-purple-400 mb-2">💳 ads-checkout</h5>
            <p className="text-slate-400 text-sm mb-2">Cria link de pagamento InfiniPay para assinatura inicial</p>
            <InfoRow label="Arquivo" value="supabase/functions/ads-checkout/index.ts" copyable />
            <CodeBlock label="ads-checkout" code={`// Requisição
POST /ads-checkout
body: { name, email, phone }

// Resposta
{
  success: true,
  paymentLink: "https://infinitepay.io/...",
  nsuOrder: "ANUN_email@domain.com_timestamp",
  email: "email@domain.com",
  password: "senhaGerada123"
}`} />
          </div>

          {/* ads-balance-checkout */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-purple-400 mb-2">💰 ads-balance-checkout</h5>
            <p className="text-slate-400 text-sm mb-2">Cria link de pagamento para saldo de anúncios</p>
            <InfoRow label="Arquivo" value="supabase/functions/ads-balance-checkout/index.ts" copyable />
          </div>

          {/* ads-check-payment */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-purple-400 mb-2">🔍 ads-check-payment</h5>
            <p className="text-slate-400 text-sm mb-2">Verifica status do pagamento no banco</p>
            <InfoRow label="Arquivo" value="supabase/functions/ads-check-payment/index.ts" copyable />
            <CodeBlock label="ads-check-payment" code={`// Verificar assinatura
POST /ads-check-payment
body: { order_nsu: "ANUN_...", email, type: 'subscription' }

// Verificar saldo
POST /ads-check-payment
body: { order_nsu: "...", email, type: 'balance' }`} />
          </div>

          {/* ads-webhook */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-purple-400 mb-2">🪝 ads-webhook</h5>
            <p className="text-slate-400 text-sm mb-2">Webhook InfiniPay - recebe confirmação de pagamento</p>
            <InfoRow label="Arquivo" value="supabase/functions/ads-webhook/index.ts" copyable />
            <InfoRow label="URL Webhook" value="https://adljdeekwifwcdcgbpit.supabase.co/functions/v1/ads-webhook" copyable />
            <div className="mt-2">
              <p className="text-white text-sm font-medium mb-1">Fluxo do Webhook:</p>
              <ol className="list-decimal list-inside text-slate-300 text-sm space-y-1">
                <li>InfiniPay envia POST quando pagamento é aprovado</li>
                <li>Webhook extrai product_name (formato: anun_EMAIL)</li>
                <li>Busca pedido no banco pelo email</li>
                <li>Atualiza status para 'paid' e define paid_at</li>
                <li>Se for assinatura, atualiza ads_users para 'active'</li>
                <li>Se for saldo, atualiza ads_balance_orders</li>
              </ol>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'payment',
      title: '💳 Sistema de Pagamento (InfiniPay)',
      icon: <CreditCard className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <div className="bg-slate-800 rounded-lg p-4">
            <h4 className="font-bold text-blue-400 mb-2">🔑 Credenciais InfiniPay</h4>
            <InfoRow label="API Base URL" value="https://api.infinitepay.io" copyable />
            <InfoRow label="Secret Name (Supabase)" value="INFINITEPAY_API_KEY" />
            <p className="text-yellow-400 text-sm mt-2">⚠️ A API Key está configurada como secret no Supabase</p>
          </div>

          <h4 className="font-bold text-white">Fluxo de Pagamento:</h4>
          <div className="bg-slate-800 rounded-lg p-4">
            <ol className="list-decimal list-inside text-slate-300 space-y-2">
              <li><strong>Criação do Link:</strong> POST /checkout/links com product_name = "anun_EMAIL"</li>
              <li><strong>Cliente Paga:</strong> Abre link InfiniPay e completa pagamento</li>
              <li><strong>Webhook Recebe:</strong> InfiniPay envia confirmação para /ads-webhook</li>
              <li><strong>Verificação:</strong> Frontend verifica a cada 4s via /ads-check-payment</li>
              <li><strong>Acesso Liberado:</strong> Status atualizado, cliente redirecionado para dashboard</li>
            </ol>
          </div>

          <h4 className="font-bold text-white">Formato do Product Name:</h4>
          <div className="bg-slate-800 rounded-lg p-4">
            <CodeBlock label="product-name" code={`// Assinatura inicial
product_name: "anun_cliente@email.com"

// Saldo para anúncios  
product_name: "anun_saldo_cliente@email.com"`} />
          </div>

          <h4 className="font-bold text-white">Valores:</h4>
          <div className="bg-slate-800 rounded-lg p-4">
            <InfoRow label="Assinatura Mensal" value="R$ 397,00" />
            <InfoRow label="Valor Teste" value="R$ 1,00" />
            <InfoRow label="Saldo Mínimo Anúncios" value="R$ 150,00 (mínimo Meta)" />
            <InfoRow label="Custo por Lead (estimado)" value="R$ 3,80 - R$ 4,70" />
          </div>
        </div>
      )
    },
    {
      id: 'email',
      title: '📧 Sistema de Email',
      icon: <Mail className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <div className="bg-slate-800 rounded-lg p-4">
            <h4 className="font-bold text-blue-400 mb-2">📮 Configuração SMTP</h4>
            <InfoRow label="Host" value="smtp.hostinger.com" copyable />
            <InfoRow label="Porta" value="465 (SSL)" />
            <InfoRow label="Email From" value="contato@mrodfrota.shop" copyable />
            <InfoRow label="Secret (Senha)" value="SMTP_PASSWORD (configurado no Supabase)" />
          </div>

          <h4 className="font-bold text-white">Emails Enviados:</h4>

          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-green-400 mb-2">1. Email de Campanha Ativada</h5>
            <p className="text-slate-400 text-sm mb-2">Enviado quando admin ativa os anúncios</p>
            <CodeBlock label="email-campanha" code={`Assunto: "🎉 Seus anúncios estão ativos! - Ads News"

Conteúdo:
- Nome do cliente
- Link da página de vendas
- Data de término (30 dias)
- Saldo investido
- Informação sobre relatório em 30 dias`} />
          </div>

          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-green-400 mb-2">Template HTML do Email</h5>
            <p className="text-slate-400 text-sm mb-2">Localização: supabase/functions/ads-auth/index.ts (função sendEmailViaSMTP)</p>
            <CodeBlock label="email-template" code={`const htmlContent = \`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <!-- Header verde -->
    <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0;">🎉 Seus Anúncios Estão Ativos!</h1>
    </div>
    <!-- Conteúdo -->
    <div style="padding: 30px;">
      <p>Olá <strong>\${userName}</strong>,</p>
      <p>Sua campanha foi ativada com sucesso!</p>
      <!-- Cards de informação -->
      <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
        <p><strong>📄 Sua Página de Vendas:</strong></p>
        <a href="\${salesPageUrl}">\${salesPageUrl}</a>
      </div>
      <div style="display: flex; gap: 20px;">
        <div style="flex: 1; background: #f8fafc; padding: 15px; border-radius: 8px;">
          <p>📅 Campanha ativa até:</p>
          <p style="font-size: 18px; font-weight: bold;">\${endDate}</p>
        </div>
        <div style="flex: 1; background: #f8fafc; padding: 15px; border-radius: 8px;">
          <p>💰 Saldo investido:</p>
          <p style="font-size: 18px; font-weight: bold;">R$ \${balanceAmount}</p>
        </div>
      </div>
      <p style="color: #6b7280; margin-top: 30px;">
        📊 Você receberá o relatório completo em 30 dias.
      </p>
    </div>
  </div>
</body>
</html>
\`;`} />
          </div>
        </div>
      )
    },
    {
      id: 'storage',
      title: '📁 Storage (Arquivos)',
      icon: <Globe className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <div className="bg-slate-800 rounded-lg p-4">
            <h4 className="font-bold text-blue-400 mb-2">🪣 Bucket Utilizado</h4>
            <InfoRow label="Bucket Name" value="assets" copyable />
            <InfoRow label="Público" value="Sim" />
            <InfoRow label="Pasta" value="ads-news/" />
          </div>

          <h4 className="font-bold text-white">Arquivos Armazenados:</h4>
          <div className="bg-slate-800 rounded-lg p-4">
            <ul className="text-slate-300 space-y-2">
              <li>• <strong>Logos:</strong> assets/ads-news/logos/[user_id]/logo.[ext]</li>
              <li>• <strong>Mídias:</strong> assets/ads-news/media/[user_id]/[filename].[ext]</li>
            </ul>
          </div>

          <h4 className="font-bold text-white">URL Pública:</h4>
          <CodeBlock label="storage-url" code={`https://adljdeekwifwcdcgbpit.supabase.co/storage/v1/object/public/assets/ads-news/...`} />
        </div>
      )
    },
    {
      id: 'frontend',
      title: '🖥️ Páginas Frontend',
      icon: <Code className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-green-400 mb-2">📄 /anuncios - Página de Vendas</h5>
            <InfoRow label="Arquivo" value="src/pages/AdsNews.tsx" copyable />
            <ul className="text-slate-300 text-sm mt-2 space-y-1">
              <li>• Hero section com proposta de valor</li>
              <li>• Formulário de cadastro (nome, email, telefone)</li>
              <li>• Botão "Entrar" no header para login de clientes</li>
              <li>• Seções de benefícios e FAQ</li>
              <li>• Integração com ads-checkout para gerar link de pagamento</li>
            </ul>
          </div>

          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-green-400 mb-2">📊 /anuncios/dash - Dashboard do Cliente</h5>
            <InfoRow label="Arquivo" value="src/pages/AdsNewsDash.tsx" copyable />
            <ul className="text-slate-300 text-sm mt-2 space-y-1">
              <li>• Login com email/senha</li>
              <li>• Steps de progresso (Assinatura → Dados → Saldo → Campanha)</li>
              <li>• Formulário de dados do negócio (nicho, região, WhatsApp, etc.)</li>
              <li>• Upload de logo e mídias</li>
              <li>• Calculadora de saldo/leads</li>
              <li>• Visualização da página de vendas quando ativada</li>
              <li>• Controle de edições (máx 2 antes da campanha)</li>
            </ul>
          </div>

          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-green-400 mb-2">👑 /anuncios/admin - Painel Administrativo</h5>
            <InfoRow label="Arquivo" value="src/pages/AdsNewsAdmin.tsx" copyable />
            <ul className="text-slate-300 text-sm mt-2 space-y-1">
              <li>• Login admin (mro@gmail.com)</li>
              <li>• Lista de todos os usuários</li>
              <li>• Lista de pedidos (assinatura e saldo)</li>
              <li>• Verificação automática de pagamentos (a cada 4s)</li>
              <li>• Botão "Ativar Anúncios" para cada cliente</li>
              <li>• Campo para definir URL da página de vendas</li>
              <li>• Envio de email de ativação</li>
              <li>• Esta documentação</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'business-rules',
      title: '📋 Regras de Negócio',
      icon: <Settings className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-yellow-400 mb-2">⚙️ Edição de Dados</h5>
            <ul className="text-slate-300 space-y-2">
              <li>• Cliente pode editar dados do negócio <strong>2 vezes</strong> antes de adicionar saldo</li>
              <li>• Após adicionar saldo, edição é bloqueada</li>
              <li>• Durante campanha ativa (30 dias), edição é bloqueada</li>
              <li>• Após 30 dias, cliente pode editar novamente</li>
            </ul>
          </div>

          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-yellow-400 mb-2">⏰ Duração da Campanha</h5>
            <ul className="text-slate-300 space-y-2">
              <li>• Campanha dura exatamente <strong>30 dias</strong> após ativação pelo admin</li>
              <li>• Data de término é calculada automaticamente</li>
              <li>• Cliente vê countdown no dashboard</li>
            </ul>
          </div>

          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-yellow-400 mb-2">💵 Cálculo de Saldo</h5>
            <ul className="text-slate-300 space-y-2">
              <li>• Custo por lead estimado: R$ 4,00</li>
              <li>• Mínimo diário Meta Ads: R$ 7,00</li>
              <li>• Mínimo mensal: R$ 210,00 (30 dias × R$ 7)</li>
              <li>• Mínimo leads: ~53 (R$ 210 ÷ R$ 4)</li>
              <li>• Slider permite ajustar quantidade de leads desejados</li>
            </ul>
          </div>

          <div className="bg-slate-800 rounded-lg p-4">
            <h5 className="font-bold text-yellow-400 mb-2">✅ Fluxo de Ativação</h5>
            <ol className="list-decimal list-inside text-slate-300 space-y-2">
              <li>Admin vê cliente com saldo pago</li>
              <li>Admin cria página de vendas externamente</li>
              <li>Admin insere URL da página no sistema</li>
              <li>Admin clica em "Ativar Campanha"</li>
              <li>Sistema define campaign_active = true</li>
              <li>Sistema calcula campaign_end_date (+30 dias)</li>
              <li>Sistema envia email para cliente</li>
              <li>Dashboard do cliente atualiza automaticamente</li>
            </ol>
          </div>
        </div>
      )
    }
  ];

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <FileText className="h-6 w-6 text-blue-400" />
          Documentação Técnica - Ads News
        </CardTitle>
        <p className="text-slate-400 text-sm">
          Documentação completa do sistema para desenvolvedores
        </p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[70vh] pr-4">
          <div className="space-y-4">
            {sections.map((section) => (
              <div key={section.id} className="border border-slate-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between p-4 bg-slate-700 hover:bg-slate-600 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-blue-400">{section.icon}</span>
                    <span className="font-bold text-white">{section.title}</span>
                  </div>
                  {expandedSections.includes(section.id) ? (
                    <ChevronUp className="h-5 w-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-400" />
                  )}
                </button>
                {expandedSections.includes(section.id) && (
                  <div className="p-4 bg-slate-800/50">
                    {section.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default AdsNewsDocumentation;
