import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Ticket, Search, RefreshCw, MessageCircle, Instagram,
  Clock, CheckCircle, XCircle, AlertCircle, Trash2,
  ChevronDown, ChevronUp, Filter
} from 'lucide-react';

interface SupportTicket {
  id: string;
  ticket_number: string;
  platform: 'instagram' | 'zapmro';
  username: string;
  email?: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  admin_notes?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
}

interface TicketStats {
  instagram: { open: number; in_progress: number; resolved: number; closed: number; total: number };
  zapmro: { open: number; in_progress: number; resolved: number; closed: number; total: number };
}

const TicketsManager = () => {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'instagram' | 'zapmro'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved' | 'closed'>('all');
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    loadTickets();
    loadStats();
  }, []);

  const loadTickets = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('support-tickets', {
        body: { action: 'list' }
      });

      if (error) throw error;
      if (data.success) {
        setTickets(data.tickets || []);
      }
    } catch (error) {
      console.error('Error loading tickets:', error);
      toast({ title: 'Erro ao carregar tickets', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('support-tickets', {
        body: { action: 'stats' }
      });

      if (error) throw error;
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const updateTicket = async (id: string, updates: Partial<SupportTicket>) => {
    try {
      const { data, error } = await supabase.functions.invoke('support-tickets', {
        body: { action: 'update', id, ...updates }
      });

      if (error) throw error;
      if (data.success) {
        setTickets(prev => prev.map(t => t.id === id ? { ...t, ...data.ticket } : t));
        loadStats();
        toast({ title: 'Ticket atualizado!' });
      }
    } catch (error) {
      console.error('Error updating ticket:', error);
      toast({ title: 'Erro ao atualizar ticket', variant: 'destructive' });
    }
  };

  const deleteTicket = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este ticket?')) return;

    try {
      const { data, error } = await supabase.functions.invoke('support-tickets', {
        body: { action: 'delete', id }
      });

      if (error) throw error;
      if (data.success) {
        setTickets(prev => prev.filter(t => t.id !== id));
        loadStats();
        toast({ title: 'Ticket excluído!' });
      }
    } catch (error) {
      console.error('Error deleting ticket:', error);
      toast({ title: 'Erro ao excluir ticket', variant: 'destructive' });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'in_progress': return <Clock className="w-4 h-4 text-blue-500" />;
      case 'resolved': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'closed': return <XCircle className="w-4 h-4 text-gray-500" />;
      default: return null;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return 'Aberto';
      case 'in_progress': return 'Em Andamento';
      case 'resolved': return 'Resolvido';
      case 'closed': return 'Fechado';
      default: return status;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'normal': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'low': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      default: return '';
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = 
      ticket.ticket_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.subject.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPlatform = platformFilter === 'all' || ticket.platform === platformFilter;
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;

    return matchesSearch && matchesPlatform && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Carregando tickets...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Ticket className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-display font-bold">Tickets de Suporte</h2>
        </div>
        <Button variant="outline" onClick={() => { loadTickets(); loadStats(); }} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center">
                <Instagram className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.instagram.total}</p>
                <p className="text-xs text-muted-foreground">Instagram</p>
              </div>
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <span className="text-yellow-500">{stats.instagram.open} abertos</span>
              <span className="text-blue-500">{stats.instagram.in_progress} em andamento</span>
            </div>
          </div>
          
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.zapmro.total}</p>
                <p className="text-xs text-muted-foreground">ZAPMRO</p>
              </div>
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <span className="text-yellow-500">{stats.zapmro.open} abertos</span>
              <span className="text-blue-500">{stats.zapmro.in_progress} em andamento</span>
            </div>
          </div>

          <div className="glass-card p-4 text-center">
            <AlertCircle className="w-6 h-6 mx-auto text-yellow-500 mb-2" />
            <p className="text-2xl font-bold">{stats.instagram.open + stats.zapmro.open}</p>
            <p className="text-xs text-muted-foreground">Tickets Abertos</p>
          </div>

          <div className="glass-card p-4 text-center">
            <CheckCircle className="w-6 h-6 mx-auto text-green-500 mb-2" />
            <p className="text-2xl font-bold">{stats.instagram.resolved + stats.zapmro.resolved}</p>
            <p className="text-xs text-muted-foreground">Resolvidos</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, usuário ou assunto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value as any)}
            className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">Todas Plataformas</option>
            <option value="instagram">Instagram</option>
            <option value="zapmro">ZAPMRO</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">Todos Status</option>
            <option value="open">Abertos</option>
            <option value="in_progress">Em Andamento</option>
            <option value="resolved">Resolvidos</option>
            <option value="closed">Fechados</option>
          </select>
        </div>
      </div>

      {/* Tickets List */}
      <div className="space-y-4">
        {filteredTickets.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Ticket className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchTerm || platformFilter !== 'all' || statusFilter !== 'all'
                ? 'Nenhum ticket encontrado com esses filtros'
                : 'Nenhum ticket de suporte ainda'}
            </p>
          </div>
        ) : (
          filteredTickets.map((ticket) => (
            <div 
              key={ticket.id}
              className={`glass-card overflow-hidden ${
                ticket.platform === 'instagram' 
                  ? 'border-l-4 border-l-pink-500' 
                  : 'border-l-4 border-l-green-500'
              }`}
            >
              {/* Ticket Header */}
              <div 
                className="p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                onClick={() => setExpandedTicket(expandedTicket === ticket.id ? null : ticket.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {ticket.platform === 'instagram' ? (
                      <Instagram className="w-5 h-5 text-pink-500" />
                    ) : (
                      <MessageCircle className="w-5 h-5 text-green-500" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-muted-foreground">{ticket.ticket_number}</span>
                        <span className={`text-xs px-2 py-0.5 rounded border ${getPriorityColor(ticket.priority)}`}>
                          {ticket.priority === 'urgent' ? 'Urgente' : 
                           ticket.priority === 'high' ? 'Alta' :
                           ticket.priority === 'normal' ? 'Normal' : 'Baixa'}
                        </span>
                      </div>
                      <p className="font-semibold">{ticket.subject}</p>
                      <p className="text-sm text-muted-foreground">
                        Por @{ticket.username} • {new Date(ticket.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(ticket.status)}
                      <span className="text-sm">{getStatusLabel(ticket.status)}</span>
                    </div>
                    {expandedTicket === ticket.id ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Content */}
              {expandedTicket === ticket.id && (
                <div className="border-t border-border p-4 space-y-4 bg-secondary/20">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Mensagem:</p>
                    <p className="whitespace-pre-wrap">{ticket.message}</p>
                  </div>

                  {ticket.email && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Email:</span> {ticket.email}
                    </p>
                  )}

                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Notas do Admin:</p>
                    <Textarea
                      value={adminNotes[ticket.id] ?? ticket.admin_notes ?? ''}
                      onChange={(e) => setAdminNotes({ ...adminNotes, [ticket.id]: e.target.value })}
                      placeholder="Adicione notas internas sobre este ticket..."
                      rows={3}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => updateTicket(ticket.id, { admin_notes: adminNotes[ticket.id] ?? ticket.admin_notes })}
                    >
                      Salvar Notas
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
                    <select
                      value={ticket.status}
                      onChange={(e) => updateTicket(ticket.id, { status: e.target.value as any })}
                      className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="open">Aberto</option>
                      <option value="in_progress">Em Andamento</option>
                      <option value="resolved">Resolvido</option>
                      <option value="closed">Fechado</option>
                    </select>

                    <select
                      value={ticket.priority}
                      onChange={(e) => updateTicket(ticket.id, { priority: e.target.value as any })}
                      className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="low">Prioridade Baixa</option>
                      <option value="normal">Prioridade Normal</option>
                      <option value="high">Prioridade Alta</option>
                      <option value="urgent">Urgente</option>
                    </select>

                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => deleteTicket(ticket.id)}
                      className="ml-auto"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Excluir
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TicketsManager;
