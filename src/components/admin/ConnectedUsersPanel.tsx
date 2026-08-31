import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, Clock, User, Mail, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface ConnectedUser {
  squarecloud_username: string;
  email: string | null;
  days_remaining: number | null;
  last_access: string | null;
  updated_at: string;
}

export const ConnectedUsersPanel = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<ConnectedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchConnectedUsers = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-connected-users');
      
      if (error) throw error;
      
      if (data?.success) {
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching connected users:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar usuários conectados",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchConnectedUsers();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchConnectedUsers, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchConnectedUsers();
  };

  const formatLastAccess = (lastAccess: string | null) => {
    if (!lastAccess) return 'Nunca';
    
    const date = new Date(lastAccess);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins} min atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    if (diffDays < 7) return `${diffDays} dias atrás`;
    
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isOnlineRecently = (lastAccess: string | null) => {
    if (!lastAccess) return false;
    const date = new Date(lastAccess);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return diffMs < 300000; // 5 minutes
  };

  const getDaysStatus = (days: number | null) => {
    if (days === null) return { text: 'N/A', color: 'text-muted-foreground' };
    if (days > 365) return { text: 'Vitalício', color: 'text-amber-500' };
    if (days > 30) return { text: `${days} dias`, color: 'text-green-500' };
    if (days > 0) return { text: `${days} dias`, color: 'text-yellow-500' };
    return { text: 'Expirado', color: 'text-destructive' };
  };

  if (isLoading) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Carregando usuários...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Usuários Conectados</h3>
          <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-sm">
            {users.length} total
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {users.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          Nenhum usuário encontrado
        </p>
      ) : (
        <div className="overflow-hidden">
          <table className="w-full">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Usuário</th>
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Email</th>
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Acesso</th>
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Último Acesso</th>
              </tr>
            </thead>
          </table>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <tbody>
                {users.map((user) => {
                  const daysStatus = getDaysStatus(user.days_remaining);
                  const isOnline = isOnlineRecently(user.last_access);
                  
                  return (
                    <tr key={user.squarecloud_username} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{user.squarecloud_username}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          {user.email || 'Não informado'}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <span className={`text-sm font-medium ${daysStatus.color}`}>
                          {daysStatus.text}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          <span className={isOnline ? 'text-green-500 font-medium' : 'text-muted-foreground'}>
                            {formatLastAccess(user.last_access)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectedUsersPanel;
