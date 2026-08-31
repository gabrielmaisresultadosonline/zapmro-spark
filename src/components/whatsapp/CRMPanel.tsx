import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import {
  Users, Search, Flame, Tag, Filter, Loader2, ChevronDown, ChevronRight,
  Phone, MessageSquare, Star, UserCheck, UserPlus, BarChart3,
  X, Save, Edit2, RefreshCw, Share2, Settings2, CheckCircle2, Plus, Trash2,
  UserX, CheckSquare, Square
} from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface CRMContact {
  id: string;
  phone: string;
  name: string | null;
  profile_pic_url?: string;
  tags: string[];
  crm_status: string;
  source: string;
  notes: string | null;
  is_hot_lead: boolean;
  last_message_at?: string;
  unread_count: number;
}

interface CRMPanelProps {
  callProxy: (action: string, data?: Record<string, unknown>) => Promise<any>;
  onSelectContact?: (phone: string) => void;
}

const STATUS_OPTIONS = [
  { value: 'novo', label: 'Novo', color: '#3498db', icon: UserPlus },
  { value: 'em_atendimento', label: 'Em Atendimento', color: '#f39c12', icon: MessageSquare },
  { value: 'qualificado', label: 'Qualificado', color: '#00a884', icon: UserCheck },
  { value: 'cliente', label: 'Cliente', color: '#9b59b6', icon: Star },
  { value: 'perdido', label: 'Perdido', color: '#e74c3c', icon: X },
];

const SOURCE_OPTIONS = [
  { value: 'organico', label: 'Orgânico' },
  { value: 'anuncio', label: 'Anúncio' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'landing_page', label: 'Landing Page' },
  { value: 'whatsapp', label: 'WhatsApp Direto' },
];

const TAG_PRESETS = ['VIP', 'Urgente', 'Interessado', 'Follow-up', 'Proposta Enviada', 'Fechou'];

export default function CRMPanel({ callProxy, onSelectContact }: CRMPanelProps) {
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterHot, setFilterHot] = useState(false);
  const [editingContact, setEditingContact] = useState<CRMContact | null>(null);
  const [saving, setSaving] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(localStorage.getItem("google_contacts_connected") === "true");
  const [googleAccounts, setGoogleAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [autoSync, setAutoSync] = useState(false);
  const [showUnnamedContacts, setShowUnnamedContacts] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [bulkName, setBulkName] = useState('');
  const [isBulkNaming, setIsBulkNaming] = useState(false);


  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data: settings } = await supabase
          .from('crm_settings')
          .select('google_auto_sync')
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .single();
        if (settings) setAutoSync(settings.google_auto_sync || false);
      } catch (e) {
        console.error("Error fetching sync settings:", e);
      }
    };
    fetchSettings();
    fetchGoogleAccounts();
  }, []);

  const fetchGoogleAccounts = async () => {
    try {
      const { data } = await supabase.from('crm_google_accounts').select('*');
      if (data) {
        setGoogleAccounts(data);
        if (data.length > 0 && !selectedAccountId) {
          setSelectedAccountId(data[0].id);
        }
      }
    } catch (e) {
      console.error("Error fetching google accounts:", e);
    }
  };

  const toggleAutoSync = async (enabled: boolean) => {
    setAutoSync(enabled);
    try {
      await callProxy('updateSettings', { google_auto_sync: enabled });
      toast({ title: enabled ? "Sincronização Automática Ativada" : "Sincronização Automática Desativada" });
    } catch (e) {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    }
  };

  const connectGoogle = async () => {
    try {
      const result = await callProxy('getGoogleAuthUrl');
      if (result.authUrl) {
        window.location.href = result.authUrl;
      } else {
        toast({ title: "Erro", description: "URL de autenticação não gerada.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Erro ao conectar Google:", error);
      toast({ title: "Erro", description: "Falha ao iniciar conexão com Google.", variant: "destructive" });
    }
  };

  const syncContacts = async () => {
    if (googleAccounts.length === 0) {
      toast({ title: "Erro", description: "Nenhuma conta Google conectada.", variant: "destructive" });
      return;
    }
    setSyncingGoogle(true);
    try {
      const result = await callProxy('syncGoogleContacts', { accountId: selectedAccountId });
      if (result.success) {
        toast({ title: "Sucesso", description: `${result.count} contatos sincronizados!` });
        await loadContacts();
      } else {
        toast({ title: "Erro", description: result.error || "Falha na sincronização", variant: "destructive" });
      }
    } catch (error: any) {
      console.error("Erro ao sincronizar:", error);
      if (error.message?.includes("Google account not connected")) {
        setGoogleConnected(false);
        localStorage.removeItem("google_contacts_connected");
      }
      toast({ title: "Erro na sincronização", description: error.message || "Tente reconectar sua conta.", variant: "destructive" });
    } finally {
      setSyncingGoogle(false);
    }
  };

  const loadContacts = async () => {
    setLoading(true);
    try {
      const result = await callProxy('get-crm-contacts');
      setContacts(Array.isArray(result.contacts) ? result.contacts : []);
    } catch (e) {
      console.error('Error loading CRM contacts:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadContacts(); }, []);

  const saveContact = async () => {
    if (!editingContact) return;
    setSaving(true);
    try {
      await callProxy('update-crm-contact', {
        contactId: editingContact.id,
        tags: editingContact.tags,
        crm_status: editingContact.crm_status,
        source: editingContact.source,
        notes: editingContact.notes,
        is_hot_lead: editingContact.is_hot_lead,
      });
      toast({ title: 'Contato atualizado!' });
      await loadContacts();
      setEditingContact(null);
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    if (!editingContact || !newTag.trim()) return;
    if (editingContact.tags.includes(newTag.trim())) return;
    setEditingContact({ ...editingContact, tags: [...editingContact.tags, newTag.trim()] });
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    if (!editingContact) return;
    setEditingContact({ ...editingContact, tags: editingContact.tags.filter(t => t !== tag) });
  };

  const filteredContacts = contacts.filter(c => {
    const matchSearch = (c.name || c.phone).toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === 'all' || c.crm_status === filterStatus;
    const matchHot = !filterHot || c.is_hot_lead;
    const isUnnamed = !c.name || c.name === c.phone;
    const matchUnnamedFilter = showUnnamedContacts ? isUnnamed : !isUnnamed;
    return matchSearch && matchStatus && matchHot && (showUnnamedContacts ? isUnnamed : true);
  });

  const unnamedContacts = contacts.filter(c => !c.name || c.name === c.phone);

  const handleBulkUpdate = async () => {
    if (!bulkName.trim() || selectedContactIds.length === 0) return;
    setIsBulkNaming(true);
    try {
      await callProxy('update-contacts-bulk', {
        contactIds: selectedContactIds,
        name: bulkName.trim()
      });
      toast({ title: `${selectedContactIds.length} contatos atualizados!` });
      await loadContacts();
      setSelectedContactIds([]);
      setBulkName('');
    } catch (e) {
      toast({ title: 'Erro ao atualizar em massa', variant: 'destructive' });
    } finally {
      setIsBulkNaming(false);
    }
  };

  const toggleSelectContact = (id: string) => {
    setSelectedContactIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };


  const stats = {
    total: contacts.length,
    hot: contacts.filter(c => c.is_hot_lead).length,
    novo: contacts.filter(c => c.crm_status === 'novo').length,
    qualificado: contacts.filter(c => c.crm_status === 'qualificado').length,
    cliente: contacts.filter(c => c.crm_status === 'cliente').length,
  };

  if (editingContact) {
    return (
      <div className="h-full flex flex-col bg-[#111b21]">
        <div className="bg-[#202c33] px-4 py-3 flex items-center justify-between border-b border-white/5 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setEditingContact(null)} className="text-white/60 hover:text-white hover:bg-white/10">
            ← Voltar
          </Button>
          <Button onClick={saveContact} disabled={saving} size="sm" className="bg-[#00a884] hover:bg-[#00a884]/80 text-white h-8">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Salvar
          </Button>
        </div>
        <div className="px-4 py-2 border-b border-white/5 flex gap-2">
           <Button 
             variant="ghost" 
             size="sm" 
             onClick={() => callProxy('saveToGoogle', { contactId: editingContact.id, accountId: selectedAccountId })}
             className="flex-1 text-white/60 hover:text-[#4285F4] hover:bg-[#4285F4]/10 h-8 text-xs"
           >
             <Share2 className="w-3.5 h-3.5 mr-2" /> Sincronizar p/ Google
           </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4 max-w-lg mx-auto">
            {/* Contact Info */}
            <div className="bg-[#202c33] rounded-xl p-4 border border-white/5 text-center">
              <div className="w-16 h-16 rounded-full bg-[#6b7b8d] mx-auto mb-3 flex items-center justify-center">
                <Users className="w-8 h-8 text-white/40" />
              </div>
              <h2 className="text-white font-semibold">{editingContact.name || editingContact.phone}</h2>
              <p className="text-white/40 text-sm">{editingContact.phone}</p>
              <div className="flex items-center justify-center gap-3 mt-3">
                <button
                  onClick={() => onSelectContact?.(editingContact.phone)}
                  className="flex items-center gap-1 text-[#00a884] text-xs hover:underline"
                >
                  <MessageSquare className="w-3 h-3" /> Conversar
                </button>
                <button
                  onClick={() => setEditingContact({ ...editingContact, is_hot_lead: !editingContact.is_hot_lead })}
                  className={`flex items-center gap-1 text-xs ${editingContact.is_hot_lead ? 'text-orange-400' : 'text-white/30'}`}
                >
                  <Flame className="w-3 h-3" /> {editingContact.is_hot_lead ? 'Lead Quente' : 'Marcar Quente'}
                </button>
                <button
                  onClick={async () => {
                    if (confirm('Tem certeza que deseja apagar todo o histórico desta conversa?')) {
                      try {
                        const res = await callProxy('clearHistory', { contactId: editingContact.id });
                        if (res.success) {
                          toast({ title: 'Histórico apagado com sucesso!' });
                          onSelectContact?.(editingContact.phone);
                        }
                      } catch (e) {
                        toast({ title: 'Erro ao apagar histórico', variant: 'destructive' });
                      }
                    }
                  }}
                  className="flex items-center gap-1 text-red-400 text-xs hover:underline"
                >
                  <Trash2 className="w-3 h-3" /> Limpar Conversa
                </button>
              </div>
            </div>

            {/* Status */}
            <div className="bg-[#202c33] rounded-xl p-4 border border-white/5 space-y-2">
              <label className="text-white/60 text-xs font-semibold">Status</label>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setEditingContact({ ...editingContact, crm_status: s.value })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
                      editingContact.crm_status === s.value
                        ? 'text-white border-2'
                        : 'bg-[#2a3942] text-white/50 border-2 border-transparent'
                    }`}
                    style={editingContact.crm_status === s.value ? { backgroundColor: s.color + '20', borderColor: s.color } : {}}
                  >
                    <s.icon className="w-3.5 h-3.5" style={editingContact.crm_status === s.value ? { color: s.color } : {}} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Source */}
            <div className="bg-[#202c33] rounded-xl p-4 border border-white/5 space-y-2">
              <label className="text-white/60 text-xs font-semibold">Origem</label>
              <div className="flex flex-wrap gap-2">
                {SOURCE_OPTIONS.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setEditingContact({ ...editingContact, source: s.value })}
                    className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                      editingContact.source === s.value
                        ? 'bg-[#00a884] text-white'
                        : 'bg-[#2a3942] text-white/50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className="bg-[#202c33] rounded-xl p-4 border border-white/5 space-y-2">
              <label className="text-white/60 text-xs font-semibold">Tags</label>
              <div className="flex flex-wrap gap-1">
                {editingContact.tags.map(tag => (
                  <span key={tag} className="bg-[#7c5cfc]/20 text-[#7c5cfc] px-2 py-1 rounded-full text-xs flex items-center gap-1">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-red-400">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Nova tag"
                  className="bg-[#2a3942] border-white/10 text-white text-sm placeholder:text-white/30"
                  onKeyDown={(e) => e.key === 'Enter' && addTag()}
                />
                <Button onClick={addTag} size="sm" className="bg-[#7c5cfc] hover:bg-[#7c5cfc]/80 text-white shrink-0">
                  <Tag className="w-3 h-3" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {TAG_PRESETS.filter(t => !editingContact.tags.includes(t)).map(tag => (
                  <button
                    key={tag}
                    onClick={() => setEditingContact({ ...editingContact, tags: [...editingContact.tags, tag] })}
                    className="bg-[#2a3942] text-white/30 px-2 py-0.5 rounded-full text-[10px] hover:text-white/60"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-[#202c33] rounded-xl p-4 border border-white/5 space-y-2">
              <label className="text-white/60 text-xs font-semibold">Anotações</label>
              <Textarea
                value={editingContact.notes || ''}
                onChange={(e) => setEditingContact({ ...editingContact, notes: e.target.value })}
                placeholder="Adicione observações sobre o contato..."
                className="bg-[#2a3942] border-white/10 text-white text-sm placeholder:text-white/30 resize-none"
                rows={4}
              />
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#111b21]">
      <div className="bg-[#202c33] px-4 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#00a884]" />
            <span className="text-white font-semibold text-sm">CRM</span>
          </div>
          <div className="flex items-center gap-1">
            {googleAccounts.length > 0 && (
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="h-7 w-[120px] bg-[#2a3942] border-0 text-[10px] text-white/70">
                  <SelectValue placeholder="Conta Google" />
                </SelectTrigger>
                <SelectContent className="bg-[#232d36] border-white/10">
                  {googleAccounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id} className="text-white text-xs">
                      {acc.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={connectGoogle}
              className="text-white/40 hover:text-[#4285F4] hover:bg-[#4285F4]/10 h-7 text-[10px]"
            >
              <Plus className="w-3 h-3 mr-1" /> Add Google
            </Button>

            {googleAccounts.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={syncContacts} 
                disabled={syncingGoogle}
                className="text-white/40 hover:text-[#00a884] hover:bg-[#00a884]/10 h-7 text-[10px]"
              >
                {syncingGoogle ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                Sincronizar
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)} className="text-white/40 hover:text-white hover:bg-white/10 h-7">
              <Filter className="w-3.5 h-3.5 mr-1" /> Filtros
            </Button>
          </div>
        </div>

        {googleAccounts.length > 0 && (
          <div className="px-4 py-2 bg-[#202c33]/50 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-white/60">Google Conectado</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/40">Sincronizar Automático</span>
              <Switch 
                checked={autoSync} 
                onCheckedChange={toggleAutoSync}
                className="scale-75 data-[state=checked]:bg-[#00a884]"
              />
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-5 gap-2 mb-3">
          {[
            { label: 'Total', value: stats.total, color: '#fff' },
            { label: 'Quentes', value: stats.hot, color: '#e67e22' },
            { label: 'Novos', value: stats.novo, color: '#3498db' },
            { label: 'Qualif.', value: stats.qualificado, color: '#00a884' },
            { label: 'Clientes', value: stats.cliente, color: '#9b59b6' },
          ].map(s => (
            <div key={s.label} className="bg-[#2a3942] rounded-lg p-2 text-center">
              <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-white/30 text-[9px]">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar contato..."
            className="pl-10 bg-[#2a3942] border-0 text-white placeholder:text-white/30 rounded-lg h-9 text-sm"
          />
        </div>

        {showFilters && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-2 py-1 rounded text-xs ${filterStatus === 'all' ? 'bg-[#00a884] text-white' : 'bg-[#2a3942] text-white/40'}`}
              >
                Todos
              </button>
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.value}
                  onClick={() => setFilterStatus(s.value)}
                  className={`px-2 py-1 rounded text-xs ${filterStatus === s.value ? 'text-white' : 'bg-[#2a3942] text-white/40'}`}
                  style={filterStatus === s.value ? { backgroundColor: s.color } : {}}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setFilterHot(!filterHot)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${filterHot ? 'bg-orange-500/20 text-orange-400' : 'bg-[#2a3942] text-white/40'}`}
            >
              <Flame className="w-3 h-3" /> Apenas Quentes
            </button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">Nenhum contato encontrado</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Unnamed Contacts Queue */}
            {unnamedContacts.length > 0 && (
              <div className="border-b border-white/10">
                <button 
                  onClick={() => setShowUnnamedContacts(!showUnnamedContacts)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-[#202c33] hover:bg-[#2a3942] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <UserX className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-medium text-white">Contatos sem nome</span>
                    <span className="bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded text-[10px] font-bold">
                      {unnamedContacts.length}
                    </span>
                  </div>
                  {showUnnamedContacts ? <ChevronDown className="w-4 h-4 text-white/40" /> : <ChevronRight className="w-4 h-4 text-white/40" />}
                </button>
                
                {showUnnamedContacts && (
                  <div className="bg-[#111b21] p-3 space-y-3">
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Nome base (ex: Cliente)" 
                        value={bulkName}
                        onChange={(e) => setBulkName(e.target.value)}
                        className="h-8 bg-[#2a3942] border-white/10 text-xs"
                      />
                      <Button 
                        size="sm" 
                        disabled={selectedContactIds.length === 0 || !bulkName || isBulkNaming}
                        onClick={handleBulkUpdate}
                        className="h-8 bg-[#00a884] hover:bg-[#00a884]/80 text-[10px]"
                      >
                        {isBulkNaming ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Salvar em massa'}
                      </Button>
                    </div>
                    
                    <div className="space-y-1 max-h-[300px] overflow-y-auto">
                      {unnamedContacts.map(contact => (
                        <div 
                          key={contact.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            selectedContactIds.includes(contact.id) ? 'bg-[#00a884]/10 border border-[#00a884]/20' : 'bg-[#202c33]/50 border border-transparent'
                          }`}
                          onClick={() => toggleSelectContact(contact.id)}
                        >
                          <div className="shrink-0">
                            {selectedContactIds.includes(contact.id) ? (
                              <CheckSquare className="w-4 h-4 text-[#00a884]" />
                            ) : (
                              <Square className="w-4 h-4 text-white/20" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs truncate">{contact.phone}</p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={(e) => { e.stopPropagation(); setEditingContact(contact); }}
                            className="h-6 w-6 p-0 text-white/40 hover:text-white"
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Regular Contacts List */}
            <div className="divide-y divide-white/5">
              {filteredContacts.filter(c => c.name && c.name !== c.phone).map(contact => {
                const status = STATUS_OPTIONS.find(s => s.value === contact.crm_status);
                return (
                  <div
                    key={contact.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[#202c33] cursor-pointer group"
                    onClick={() => setEditingContact(contact)}
                  >
                    <div className="w-10 h-10 rounded-full bg-[#6b7b8d] flex items-center justify-center shrink-0 relative overflow-hidden">
                      <Users className="w-5 h-5 text-white/40" />
                      {(contact as any).google_sync_account_id && (
                        <div className="absolute bottom-0 right-0 bg-[#4285F4] p-0.5 rounded-tl-sm">
                           <div className="w-2 h-2 bg-white rounded-full flex items-center justify-center">
                              <span className="text-[6px] font-bold text-[#4285F4]">G</span>
                           </div>
                        </div>
                      )}

                      {contact.is_hot_lead && (
                        <Flame className="w-3.5 h-3.5 text-orange-400 absolute -top-1 -right-1" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium truncate">{contact.name || contact.phone}</span>
                        {status && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ backgroundColor: status.color + '20', color: status.color }}>
                            {status.label}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {contact.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="bg-[#7c5cfc]/10 text-[#7c5cfc] px-1.5 py-0.5 rounded text-[9px]">{tag}</span>
                        ))}
                        {contact.tags.length > 3 && <span className="text-white/20 text-[9px]">+{contact.tags.length - 3}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectContact?.(contact.phone); }}
                        className="p-1.5 text-white/20 hover:text-[#00a884] opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <Edit2 className="w-3.5 h-3.5 text-white/20" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        )}
      </ScrollArea>
    </div>
  );
}
