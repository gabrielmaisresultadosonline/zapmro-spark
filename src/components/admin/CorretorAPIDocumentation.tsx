import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Copy, Check, Code, FileText } from 'lucide-react';

const CorretorAPIDocumentation: React.FC = () => {
  const [copied, setCopied] = useState(false);
  
  const BASE_URL = 'https://adljdeekwifwcdcgbpit.supabase.co/functions/v1/corretor-api';
  
  const endpoints = [
    {
      name: 'Verificar Usuário',
      action: 'verify_user',
      method: 'POST',
      description: 'Verifica se um usuário existe e está ativo. Retorna o status, dias restantes, contagem de correções e informações do usuário.',
      body: {
        action: 'verify_user',
        email: 'usuario@email.com'
      },
      response: {
        success: true,
        user: {
          id: 'uuid',
          email: 'usuario@email.com',
          name: 'Nome do Usuário',
          status: 'active',
          days_remaining: 25,
          is_active: true,
          needs_payment: false,
          corrections_count: 150,
          corrections_last_30_days: 45
        }
      },
      errorResponse: {
        success: false,
        error: 'Usuário não encontrado',
        needs_payment: true
      }
    },
    {
      name: 'Obter API Key',
      action: 'get_api_key',
      method: 'POST',
      description: 'Retorna a API Key do OpenAI configurada no admin. Use esta chave para fazer requisições à API do ChatGPT.',
      body: {
        action: 'get_api_key',
        email: 'usuario@email.com'
      },
      response: {
        success: true,
        api_key: 'sk-...'
      },
      errorResponse: {
        success: false,
        error: 'Usuário não autorizado ou API não configurada'
      }
    },
    {
      name: 'Registrar Correção',
      action: 'log_correction',
      method: 'POST',
      description: 'Registra uma correção feita pelo usuário. Chame após cada correção de texto para contabilizar o uso.',
      body: {
        action: 'log_correction',
        user_id: 'uuid-do-usuario',
        text_length: 500,
        correction_type: 'text'
      },
      response: {
        success: true,
        corrections_count: 151
      }
    },
    {
      name: 'Obter Estatísticas do Usuário',
      action: 'get_user_stats',
      method: 'POST',
      description: 'Retorna estatísticas detalhadas de uso do usuário: correções totais, últimos 30 dias, hoje e status.',
      body: {
        action: 'get_user_stats',
        user_id: 'uuid-do-usuario'
      },
      response: {
        success: true,
        stats: {
          total_corrections: 150,
          corrections_last_30_days: 45,
          corrections_today: 5,
          days_remaining: 25,
          status: 'active'
        }
      }
    },
    {
      name: 'Obter Avisos',
      action: 'get_announcements',
      method: 'POST',
      description: 'Retorna todos os avisos ativos que o usuário ainda não visualizou. Use para exibir popups na extensão.',
      body: {
        action: 'get_announcements',
        user_id: 'uuid-do-usuario'
      },
      response: {
        success: true,
        announcements: [
          {
            id: 'uuid',
            title: 'Título do Aviso',
            content: 'Conteúdo do aviso em texto',
            image_url: 'https://...',
            video_url: 'https://...',
            is_blocking: true,
            display_duration: 10
          }
        ]
      }
    },
    {
      name: 'Marcar Aviso como Visualizado',
      action: 'mark_viewed',
      method: 'POST',
      description: 'Marca um aviso como visualizado pelo usuário. Chame após o usuário fechar o popup.',
      body: {
        action: 'mark_viewed',
        user_id: 'uuid-do-usuario',
        announcement_id: 'uuid-do-aviso'
      },
      response: {
        success: true
      }
    }
  ];

  const generateFullDocumentation = () => {
    let doc = `
================================================================================
                    DOCUMENTAÇÃO DA API - CORRETOR MRO
================================================================================

BASE URL: ${BASE_URL}

HEADERS OBRIGATÓRIOS:
  Content-Type: application/json

================================================================================
                              ENDPOINTS
================================================================================

`;

    endpoints.forEach((endpoint, index) => {
      doc += `
--------------------------------------------------------------------------------
${index + 1}. ${endpoint.name.toUpperCase()}
--------------------------------------------------------------------------------
Método: ${endpoint.method}
URL: ${BASE_URL}
Action: "${endpoint.action}"

Descrição:
${endpoint.description}

Body da Requisição:
${JSON.stringify(endpoint.body, null, 2)}

Resposta de Sucesso:
${JSON.stringify(endpoint.response, null, 2)}

${endpoint.errorResponse ? `Resposta de Erro:
${JSON.stringify(endpoint.errorResponse, null, 2)}` : ''}

`;
    });

    doc += `
================================================================================
                         EXEMPLO DE IMPLEMENTAÇÃO
================================================================================

// JavaScript/TypeScript - Verificar usuário
async function verifyUser(email) {
  const response = await fetch('${BASE_URL}', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'verify_user',
      email: email
    })
  });
  
  const data = await response.json();
  
  if (data.success) {
    console.log('Usuário ativo:', data.user);
    console.log('Dias restantes:', data.user.days_remaining);
    console.log('Correções feitas:', data.user.corrections_count);
    console.log('Correções últimos 30 dias:', data.user.corrections_last_30_days);
    return data.user;
  } else {
    console.log('Acesso negado:', data.error);
    return null;
  }
}

// JavaScript/TypeScript - Obter API Key
async function getApiKey(email) {
  const response = await fetch('${BASE_URL}', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'get_api_key',
      email: email
    })
  });
  
  const data = await response.json();
  return data.success ? data.api_key : null;
}

// JavaScript/TypeScript - Registrar correção
async function logCorrection(userId, textLength) {
  const response = await fetch('${BASE_URL}', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'log_correction',
      user_id: userId,
      text_length: textLength,
      correction_type: 'text'
    })
  });
  
  const data = await response.json();
  return data.corrections_count; // Retorna total atualizado
}

// JavaScript/TypeScript - Obter estatísticas
async function getUserStats(userId) {
  const response = await fetch('${BASE_URL}', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'get_user_stats',
      user_id: userId
    })
  });
  
  const data = await response.json();
  if (data.success) {
    console.log('Total de correções:', data.stats.total_corrections);
    console.log('Correções nos últimos 30 dias:', data.stats.corrections_last_30_days);
    console.log('Correções hoje:', data.stats.corrections_today);
    return data.stats;
  }
  return null;
}

// JavaScript/TypeScript - Obter avisos não lidos
async function getUnreadAnnouncements(userId) {
  const response = await fetch('${BASE_URL}', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'get_announcements',
      user_id: userId
    })
  });
  
  const data = await response.json();
  return data.success ? data.announcements : [];
}

// JavaScript/TypeScript - Marcar aviso como visto
async function markAnnouncementViewed(userId, announcementId) {
  await fetch('${BASE_URL}', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'mark_viewed',
      user_id: userId,
      announcement_id: announcementId
    })
  });
}

================================================================================
                      FLUXO RECOMENDADO NA EXTENSÃO
================================================================================

1. Ao abrir a extensão:
   - Solicitar e-mail do usuário
   - Chamar verify_user para verificar acesso
   - Exibir days_remaining e corrections_count na interface
   
2. Se usuário ativo (days_remaining > 0):
   - Salvar user_id e email localmente
   - Chamar get_api_key para obter a chave da API
   - Chamar get_announcements para verificar avisos pendentes
   
3. Após cada correção de texto:
   - Chamar log_correction com user_id e tamanho do texto
   - Atualizar o contador na interface com o retorno
   
4. Mostrar avisos (se houver):
   - Se is_blocking = true, bloquear interação até fechar
   - Respeitar display_duration (tempo em segundos)
   - Ao fechar, chamar mark_viewed
   
5. Se usuário inativo/expirado (needs_payment = true):
   - Mostrar mensagem para renovar assinatura
   - Redirecionar para página de pagamento

================================================================================
`;

    return doc;
  };

  const copyAllDocumentation = () => {
    const doc = generateFullDocumentation();
    navigator.clipboard.writeText(doc);
    setCopied(true);
    toast.success('Documentação copiada para a área de transferência!');
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Documentação da API para Extensão
        </CardTitle>
        <Button 
          onClick={copyAllDocumentation}
          className={copied ? "bg-green-600" : "bg-blue-600 hover:bg-blue-700"}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Copiado!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-2" />
              Copiar Tudo
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Base URL */}
        <div className="bg-gray-900 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Base URL</span>
            <Badge variant="outline" className="text-blue-400 border-blue-400">
              POST
            </Badge>
          </div>
          <code className="text-green-400 text-sm break-all">{BASE_URL}</code>
        </div>

        {/* Headers */}
        <div className="bg-gray-900 p-4 rounded-lg">
          <span className="text-gray-400 text-sm">Headers Obrigatórios</span>
          <pre className="text-yellow-400 text-sm mt-2">
{`{
  "Content-Type": "application/json"
}`}
          </pre>
        </div>

        {/* Endpoints */}
        <div className="space-y-4">
          {endpoints.map((endpoint, index) => (
            <div key={index} className="bg-gray-900 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-purple-600">{endpoint.action}</Badge>
                <h4 className="text-white font-medium">{endpoint.name}</h4>
              </div>
              <p className="text-gray-400 text-sm mb-3">{endpoint.description}</p>
              
              <div className="space-y-2">
                <div>
                  <span className="text-gray-500 text-xs">Body da Requisição:</span>
                  <pre className="text-blue-300 text-xs mt-1 bg-gray-950 p-2 rounded overflow-x-auto">
                    {JSON.stringify(endpoint.body, null, 2)}
                  </pre>
                </div>
                
                <div>
                  <span className="text-gray-500 text-xs">Resposta de Sucesso:</span>
                  <pre className="text-green-300 text-xs mt-1 bg-gray-950 p-2 rounded overflow-x-auto">
                    {JSON.stringify(endpoint.response, null, 2)}
                  </pre>
                </div>

                {endpoint.errorResponse && (
                  <div>
                    <span className="text-gray-500 text-xs">Resposta de Erro:</span>
                    <pre className="text-red-300 text-xs mt-1 bg-gray-950 p-2 rounded overflow-x-auto">
                      {JSON.stringify(endpoint.errorResponse, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Exemplo de código */}
        <div className="bg-gray-900 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Code className="w-4 h-4 text-yellow-400" />
            <span className="text-white font-medium">Exemplo de Uso (JavaScript)</span>
          </div>
          <pre className="text-gray-300 text-xs bg-gray-950 p-3 rounded overflow-x-auto">
{`// Verificar usuário e obter estatísticas
async function checkUserAccess(email) {
  try {
    const response = await fetch('${BASE_URL}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_user', email })
    });
    
    const data = await response.json();
    
    if (data.success && data.user.is_active) {
      // Usuário ativo - salvar dados
      localStorage.setItem('corretor_user', JSON.stringify(data.user));
      
      // Exibir estatísticas na UI
      console.log('Correções totais:', data.user.corrections_count);
      console.log('Correções últimos 30 dias:', data.user.corrections_last_30_days);
      
      return { success: true, user: data.user };
    }
    
    return { success: false, needs_payment: true };
  } catch (error) {
    return { success: false, message: 'Erro de conexão' };
  }
}

// Registrar correção após usar o corretor
async function afterCorrection(userId, textLength) {
  const response = await fetch('${BASE_URL}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      action: 'log_correction', 
      user_id: userId,
      text_length: textLength 
    })
  });
  const data = await response.json();
  // Atualizar contador na UI
  updateCorrectionCount(data.corrections_count);
}`}
          </pre>
        </div>

        {/* Fluxo */}
        <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 p-4 rounded-lg border border-blue-700">
          <h4 className="text-white font-medium mb-3">📋 Fluxo Recomendado na Extensão</h4>
          <ol className="text-gray-300 text-sm space-y-2 list-decimal list-inside">
            <li>Ao abrir a extensão → Pedir e-mail → <code className="text-blue-400">verify_user</code></li>
            <li>Se ativo → Buscar API → <code className="text-blue-400">get_api_key</code></li>
            <li>Verificar avisos → <code className="text-blue-400">get_announcements</code></li>
            <li><strong className="text-yellow-400">Após cada correção</strong> → <code className="text-blue-400">log_correction</code></li>
            <li>Ao fechar aviso → <code className="text-blue-400">mark_viewed</code></li>
            <li>Para estatísticas detalhadas → <code className="text-blue-400">get_user_stats</code></li>
            <li>Se <code className="text-red-400">needs_payment = true</code> → Mostrar tela de pagamento</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};

export default CorretorAPIDocumentation;
