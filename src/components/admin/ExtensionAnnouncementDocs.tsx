import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  FileText, Copy, Check, X, Code, ExternalLink, 
  Clock, Eye, Bell, Settings, Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ExtensionAnnouncementDocsProps {
  announcementId?: string;
  isOpen: boolean;
  onClose: () => void;
  targetArea?: 'extension' | 'extension2';
}

const ExtensionAnnouncementDocs = ({ announcementId, isOpen, onClose, targetArea = 'extension' }: ExtensionAnnouncementDocsProps) => {
  const { toast } = useToast();
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

  const copyToClipboard = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    toast({ title: 'Copiado!', description: `${section} copiado para área de transferência` });
    setTimeout(() => setCopiedSection(null), 2000);
  };

  if (!isOpen) return null;

  const fileName = targetArea === 'extension2' ? 'extension2-announcements.json' : 'extension-announcements.json';
  const storageKey = targetArea === 'extension2' ? 'mro_extension2_announcements' : 'mro_extension_announcements';
  const label = targetArea === 'extension2' ? 'Extensão Chrome 2' : 'Extensão Chrome';
  const endpoint = `${supabaseUrl}/storage/v1/object/public/user-data/admin/${fileName}`;

  const fetchCode = `// 🔔 Buscar avisos da extensão
const ANNOUNCEMENTS_URL = '${endpoint}';

async function fetchExtensionAnnouncements() {
  try {
    const response = await fetch(ANNOUNCEMENTS_URL + '?t=' + Date.now());
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.announcements || [];
  } catch (error) {
    console.error('Erro ao buscar avisos:', error);
    return [];
  }
}`;

  const displayLogicCode = `// 📋 Lógica de exibição de avisos
const STORAGE_KEY = '${storageKey}';

function getViewedAnnouncements() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch { return {}; }
}

function saveViewedAnnouncement(id, announcement) {
  const viewed = getViewedAnnouncements();
  const now = Date.now();
  
  viewed[id] = {
    viewCount: (viewed[id]?.viewCount || 0) + 1,
    lastViewed: now,
    firstViewed: viewed[id]?.firstViewed || now
  };
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(viewed));
}

function shouldShowAnnouncement(announcement) {
  if (!announcement.isActive) return false;
  
  const viewed = getViewedAnnouncements()[announcement.id];
  if (!viewed) return true;
  
  const { frequencyType, frequencyValue, frequencyHours } = announcement;
  
  // Verificar limite de exibições
  if (frequencyType === 'times_per_day') {
    const today = new Date().toDateString();
    const lastViewedDate = new Date(viewed.lastViewed).toDateString();
    
    if (today !== lastViewedDate) {
      // Novo dia, resetar contagem
      return true;
    }
    
    return viewed.viewCount < frequencyValue;
  }
  
  if (frequencyType === 'times_per_hours') {
    const hoursMs = (frequencyHours || 1) * 60 * 60 * 1000;
    const timeSinceFirst = Date.now() - viewed.firstViewed;
    const currentPeriod = Math.floor(timeSinceFirst / hoursMs);
    const viewsThisPeriod = viewed.viewCount; // Simplificado
    
    return viewsThisPeriod < frequencyValue;
  }
  
  if (frequencyType === 'once') {
    return viewed.viewCount < 1;
  }
  
  return true;
}`;

  const delayCode = `// ⏱️ Exibir aviso com delay configurado
async function showAnnouncementWithDelay(announcement) {
  const delayMs = (announcement.delaySeconds || 0) * 1000;
  
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  
  // Verificar novamente se ainda deve mostrar
  if (shouldShowAnnouncement(announcement)) {
    displayAnnouncementPopup(announcement);
    saveViewedAnnouncement(announcement.id, announcement);
  }
}

// 🚀 Inicialização ao carregar página
async function initExtensionAnnouncements() {
  const announcements = await fetchExtensionAnnouncements();
  
  for (const announcement of announcements) {
    if (shouldShowAnnouncement(announcement)) {
      showAnnouncementWithDelay(announcement);
      break; // Mostrar um aviso de cada vez
    }
  }
}

// Chamar quando a página do Instagram carregar
if (window.location.hostname.includes('instagram.com')) {
  initExtensionAnnouncements();
}`;

  const popupCode = `// 🎨 Criar popup do aviso
function displayAnnouncementPopup(announcement) {
  // Remover popup existente se houver
  const existing = document.getElementById('mro-extension-popup');
  if (existing) existing.remove();
  
  const popup = document.createElement('div');
  popup.id = 'mro-extension-popup';
  popup.innerHTML = \`
    <div style="
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.8);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    ">
      <div style="
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 16px;
        max-width: 500px;
        width: 100%;
        overflow: hidden;
        box-shadow: 0 25px 50px rgba(0,0,0,0.5);
        border: 1px solid rgba(255,255,255,0.1);
      ">
        \${announcement.thumbnailUrl ? \`
          <img src="\${announcement.thumbnailUrl}" style="width: 100%; max-height: 300px; object-fit: cover;" />
        \` : ''}
        
        <div style="padding: 24px;">
          <h2 style="color: #fff; font-size: 20px; font-weight: bold; margin-bottom: 12px;">
            \${announcement.title}
          </h2>
          <p style="color: #a0aec0; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
            \${announcement.content}
          </p>
          
          \${announcement.buttonUrl ? \`
            <a href="\${announcement.buttonUrl}" target="_blank" style="
              display: inline-block;
              margin-top: 16px;
              padding: 12px 24px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
            ">
              \${announcement.buttonText || 'Saiba Mais'}
            </a>
          \` : ''}
          
          <button onclick="this.closest('#mro-extension-popup').remove()" style="
            display: block;
            width: 100%;
            margin-top: 16px;
            padding: 12px;
            background: transparent;
            border: 1px solid rgba(255,255,255,0.2);
            color: #a0aec0;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
          ">
            Fechar
          </button>
        </div>
      </div>
    </div>
  \`;
  
  document.body.appendChild(popup);
}`;

  const dataStructure = `// 📦 Estrutura de dados do aviso
interface ExtensionAnnouncement {
  id: string;                    // ID único do aviso
  title: string;                 // Título do aviso
  content: string;               // Conteúdo/mensagem
  thumbnailUrl?: string;         // URL da imagem (opcional)
  buttonText?: string;           // Texto do botão CTA
  buttonUrl?: string;            // URL do botão CTA
  isActive: boolean;             // Se o aviso está ativo
  
  // ⏱️ Configurações de delay
  delaySeconds: number;          // Segundos para aguardar antes de mostrar
  
  // 🔄 Configurações de frequência
  frequencyType: 'once' | 'times_per_day' | 'times_per_hours';
  frequencyValue: number;        // Quantas vezes exibir
  frequencyHours?: number;       // Intervalo em horas (se times_per_hours)
  
  createdAt: string;
  updatedAt: string;
}`;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Documentação - Avisos para {label}</h2>
              <p className="text-sm text-muted-foreground">
                API e integração com {label.toLowerCase()}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 space-y-8">
          {/* Endpoint */}
          <section>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Endpoint
            </h3>
            <div className="bg-secondary/50 rounded-lg p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <code className="text-sm text-green-400 break-all">{endpoint}</code>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => copyToClipboard(endpoint, 'Endpoint')}
                >
                  {copiedSection === 'Endpoint' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                GET request público - não requer autenticação
              </p>
            </div>
          </section>

          {/* Estrutura de Dados */}
          <section>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-500" />
              Estrutura de Dados
            </h3>
            <div className="bg-secondary/50 rounded-lg p-4 relative">
              <Button 
                variant="ghost" 
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(dataStructure, 'Estrutura')}
              >
                {copiedSection === 'Estrutura' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
              <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                {dataStructure}
              </pre>
            </div>
          </section>

          {/* Buscar Avisos */}
          <section>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Bell className="w-5 h-5 text-purple-500" />
              1. Buscar Avisos
            </h3>
            <div className="bg-secondary/50 rounded-lg p-4 relative">
              <Button 
                variant="ghost" 
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(fetchCode, 'Buscar Avisos')}
              >
                {copiedSection === 'Buscar Avisos' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
              <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                {fetchCode}
              </pre>
            </div>
          </section>

          {/* Lógica de Exibição */}
          <section>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Eye className="w-5 h-5 text-cyan-500" />
              2. Lógica de Exibição
            </h3>
            <div className="bg-secondary/50 rounded-lg p-4 relative">
              <Button 
                variant="ghost" 
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(displayLogicCode, 'Lógica')}
              >
                {copiedSection === 'Lógica' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
              <pre className="text-xs text-cyan-400 overflow-x-auto whitespace-pre-wrap">
                {displayLogicCode}
              </pre>
            </div>
          </section>

          {/* Delay e Inicialização */}
          <section>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              3. Delay e Inicialização
            </h3>
            <div className="bg-secondary/50 rounded-lg p-4 relative">
              <Button 
                variant="ghost" 
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(delayCode, 'Delay')}
              >
                {copiedSection === 'Delay' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
              <pre className="text-xs text-orange-400 overflow-x-auto whitespace-pre-wrap">
                {delayCode}
              </pre>
            </div>
          </section>

          {/* Popup Visual */}
          <section>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Code className="w-5 h-5 text-pink-500" />
              4. Popup Visual
            </h3>
            <div className="bg-secondary/50 rounded-lg p-4 relative">
              <Button 
                variant="ghost" 
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(popupCode, 'Popup')}
              >
                {copiedSection === 'Popup' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
              <pre className="text-xs text-pink-400 overflow-x-auto whitespace-pre-wrap">
                {popupCode}
              </pre>
            </div>
          </section>

          {/* Resumo */}
          <section className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-lg p-6">
            <h3 className="text-lg font-bold mb-4">📋 Resumo de Implementação</h3>
            <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
              <li>Adicione o código de fetch no seu content script</li>
              <li>Implemente a lógica de verificação de visualizações</li>
              <li>Configure o delay antes de mostrar o popup</li>
              <li>Crie o popup visual com o HTML/CSS fornecido</li>
              <li>Chame <code className="text-primary">initExtensionAnnouncements()</code> ao detectar página do Instagram</li>
            </ol>
            
            <div className="mt-4 pt-4 border-t border-purple-500/30">
              <p className="text-xs text-muted-foreground">
                <strong>Dica:</strong> Use o parâmetro <code className="text-primary">?t=timestamp</code> 
                para evitar cache e sempre buscar avisos atualizados.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ExtensionAnnouncementDocs;
