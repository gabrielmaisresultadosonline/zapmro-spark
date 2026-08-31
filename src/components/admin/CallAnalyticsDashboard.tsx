import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Eye, PhoneCall, ExternalLink,
  Trash2, TrendingUp, 
  Smartphone, Monitor, RefreshCw, Loader2
} from 'lucide-react';

interface AnalyticsEvent {
  id: string;
  event_type: string;
  user_agent: string;
  referrer: string;
  device_type: string;
  source_url: string;
  created_at: string;
}

const CallAnalyticsDashboard = () => {
  const { toast } = useToast();
  const [analytics, setAnalytics] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('call_analytics')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setAnalytics(data || []);
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast({ title: "Erro ao carregar analytics", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const handleClearAnalytics = async () => {
    if (!confirm('Tem certeza que deseja limpar todos os dados de analytics?')) return;
    
    try {
      const { error } = await supabase
        .from('call_analytics')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) throw error;
      setAnalytics([]);
      toast({ title: "Analytics limpos!", description: "Todos os dados foram removidos." });
    } catch (error) {
      console.error('Error clearing analytics:', error);
      toast({ title: "Erro ao limpar", variant: "destructive" });
    }
  };

  // Calculate stats
  const stats = {
    pageViews: analytics.filter(a => a.event_type === 'PageView').length,
    audioCompleted: analytics.filter(a => a.event_type === 'ViewContent').length,
    ctaClicked: analytics.filter(a => a.event_type === 'Lead').length,
  };

  // Calculate conversion rates
  const completionRate = stats.pageViews > 0 ? ((stats.audioCompleted / stats.pageViews) * 100).toFixed(1) : '0';
  const ctaRate = stats.audioCompleted > 0 ? ((stats.ctaClicked / stats.audioCompleted) * 100).toFixed(1) : '0';
  const overallRate = stats.pageViews > 0 ? ((stats.ctaClicked / stats.pageViews) * 100).toFixed(1) : '0';

  // Device breakdown
  const mobileCount = analytics.filter(a => a.event_type === 'PageView' && a.device_type === 'mobile').length;
  const desktopCount = analytics.filter(a => a.event_type === 'PageView' && a.device_type === 'desktop').length;

  // Get recent events (last 20)
  const recentEvents = analytics.slice(0, 20);

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'PageView': return <Eye className="w-4 h-4 text-blue-500" />;
      case 'ViewContent': return <PhoneCall className="w-4 h-4 text-purple-500" />;
      case 'Lead': return <ExternalLink className="w-4 h-4 text-green-500" />;
      default: return <Eye className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getEventLabel = (eventType: string) => {
    switch (eventType) {
      case 'PageView': return 'Acesso à página';
      case 'ViewContent': return 'Ouviu tudo';
      case 'Lead': return 'Clicou CTA';
      default: return eventType;
    }
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card p-4 text-center">
          <Eye className="w-6 h-6 mx-auto text-blue-500 mb-2" />
          <p className="text-2xl font-bold">{stats.pageViews}</p>
          <p className="text-xs text-muted-foreground">Total de Acessos</p>
        </div>
        <div className="glass-card p-4 text-center">
          <PhoneCall className="w-6 h-6 mx-auto text-purple-500 mb-2" />
          <p className="text-2xl font-bold">{stats.audioCompleted}</p>
          <p className="text-xs text-muted-foreground">Ouviram Tudo</p>
        </div>
        <div className="glass-card p-4 text-center">
          <ExternalLink className="w-6 h-6 mx-auto text-green-500 mb-2" />
          <p className="text-2xl font-bold">{stats.ctaClicked}</p>
          <p className="text-xs text-muted-foreground">Clicaram CTA</p>
        </div>
      </div>

      {/* Conversion Rates & Device Breakdown */}
      <div className="grid grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Taxas de Conversão
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Taxa de Conclusão do Áudio</span>
                <span className="font-bold text-purple-500">{completionRate}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 transition-all" 
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Taxa de Clique no CTA</span>
                <span className="font-bold text-green-500">{ctaRate}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all" 
                  style={{ width: `${ctaRate}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Conversão Geral (Acesso → CTA)</span>
                <span className="font-bold text-primary">{overallRate}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all" 
                  style={{ width: `${overallRate}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-primary" />
            Dispositivos
          </h3>
          <div className="flex items-center justify-around">
            <div className="text-center">
              <Smartphone className="w-10 h-10 mx-auto text-blue-500 mb-2" />
              <p className="text-2xl font-bold">{mobileCount}</p>
              <p className="text-xs text-muted-foreground">Mobile</p>
            </div>
            <div className="text-center">
              <Monitor className="w-10 h-10 mx-auto text-green-500 mb-2" />
              <p className="text-2xl font-bold">{desktopCount}</p>
              <p className="text-xs text-muted-foreground">Desktop</p>
            </div>
          </div>
          {stats.pageViews > 0 && (
            <div className="mt-4">
              <div className="flex gap-2 h-4 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-500 transition-all" 
                  style={{ width: `${(mobileCount / stats.pageViews) * 100}%` }}
                />
                <div 
                  className="bg-green-500 transition-all" 
                  style={{ width: `${(desktopCount / stats.pageViews) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{((mobileCount / stats.pageViews) * 100).toFixed(0)}% Mobile</span>
                <span>{((desktopCount / stats.pageViews) * 100).toFixed(0)}% Desktop</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Events */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            Eventos Recentes (sincronizado com Meta Pixel)
          </h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadAnalytics} className="cursor-pointer">
              <RefreshCw className="w-4 h-4 mr-1" />
              Atualizar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClearAnalytics} className="cursor-pointer">
              <Trash2 className="w-4 h-4 mr-1" />
              Limpar Tudo
            </Button>
          </div>
        </div>
        
        {recentEvents.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Nenhum evento registrado ainda. Os eventos aparecerão quando usuários acessarem /ligacao.
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {recentEvents.map((event) => (
              <div 
                key={event.id}
                className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg"
              >
                {getEventIcon(event.event_type)}
                <div className="flex-1">
                  <p className="text-sm font-medium">{getEventLabel(event.event_type)}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.device_type === 'mobile' ? '📱 Mobile' : '💻 Desktop'}
                    {event.referrer && event.referrer !== 'direct' && ` • via ${event.referrer}`}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(event.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CallAnalyticsDashboard;
