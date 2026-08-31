import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2,
  Send,
  X,
  Search,
  CheckCircle,
  Clock,
  Trash2,
  RefreshCw,
  Mail,
  User,
  Key,
} from "lucide-react";

interface AccessUser {
  id: string;
  customer_email: string;
  customer_name: string | null;
  username: string;
  password: string;
  access_type: string;
  service_type: string;
  expiration_date: string | null;
  created_at: string;
}

interface ReminderHistory {
  email: string;
  username: string;
  sent_at: string;
}

interface AccessReminderPanelProps {
  adminSessionToken: string;
  onClose: () => void;
}

const AccessReminderPanel = ({ adminSessionToken, onClose }: AccessReminderPanelProps) => {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [totalToSend, setTotalToSend] = useState(0);
  const [history, setHistory] = useState<ReminderHistory[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const sendingRef = useRef(false);

  useEffect(() => {
    loadUsers();
    loadHistory();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("instagram-admin", {
        body: { action: "listAccesses", token: adminSessionToken },
      });
      if (error || !data?.success) {
        toast.error("Erro ao carregar usuários");
        return;
      }
      setUsers(data.accesses || []);
    } catch {
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("instagram-admin", {
        body: { action: "listReminderHistory", token: adminSessionToken },
      });
      if (!error && data?.success) {
        setHistory(data.history || []);
      }
    } catch { /* ignore */ }
    setHistoryLoaded(true);
  };

  const wasSent = (email: string) => history.some(h => h.email === email.toLowerCase());

  const filteredUsers = users.filter(u => {
    const term = searchTerm.toLowerCase();
    return (
      u.customer_email.toLowerCase().includes(term) ||
      u.username.toLowerCase().includes(term) ||
      (u.customer_name || "").toLowerCase().includes(term)
    );
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filteredUsers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const removeFromList = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  const buildEmailBody = (user: AccessUser) => {
    return `<p>Olá${user.customer_name ? ` ${user.customer_name}` : ""}! 👋</p>

<p>Estou passando só para <strong>lembrar seu acesso MRO</strong> e como você vai fazer para entrar no seu acesso.</p>

<p>A melhor ferramenta para Instagram agora com a <strong>versão 7</strong>, podendo enviar mensagens no Direct e muito mais!</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#1a1a2e;border-radius:12px;border:1px solid #333;">
<tr><td style="padding:20px;">
<p style="color:#a78bfa;font-weight:bold;margin:0 0 10px;">🔐 Seu Acesso MRO:</p>
<p style="color:#fff;margin:5px 0;">👤 Usuário: <strong>${user.username}</strong></p>
<p style="color:#fff;margin:5px 0;">🔑 Senha: <strong>${user.password}</strong></p>
</td></tr>
</table>

<p>Para acessar, entre em: <a href="https://maisresultadosonline.com.br/instagram" style="color:#a78bfa;font-weight:bold;">maisresultadosonline.com.br/instagram</a></p>

<p>Para suporte, entre em contato conosco pelo WhatsApp:</p>

[BOTAO_WHATSAPP]

<p style="color:#888;font-size:13px;">Equipe MRO - Mais Resultados Online</p>`;
  };

  const sendReminders = async () => {
    const toSend = users.filter(u => selected.has(u.id));
    if (toSend.length === 0) {
      toast.error("Selecione pelo menos um usuário");
      return;
    }

    setSending(true);
    sendingRef.current = true;
    setSentCount(0);
    setTotalToSend(toSend.length);

    let sent = 0;
    for (const user of toSend) {
      if (!sendingRef.current) break;

      try {
        const body = buildEmailBody(user);
        const { error } = await supabase.functions.invoke("broadcast-email", {
          body: {
            to: user.customer_email,
            subject: "Seu acesso MRO !",
            body,
            userName: user.customer_name || user.username,
          },
        });

        if (!error) {
          // Log to history
          await supabase.functions.invoke("instagram-admin", {
            body: {
              action: "logReminder",
              token: adminSessionToken,
              email: user.customer_email,
              username: user.username,
            },
          });
          sent++;
          setSentCount(sent);
        }
      } catch { /* continue */ }

      // Anti-spam delay
      if (sendingRef.current && toSend.indexOf(user) < toSend.length - 1) {
        await new Promise(r => setTimeout(r, 5000 + Math.random() * 10000));
      }
    }

    sendingRef.current = false;
    setSending(false);
    toast.success(`${sent} lembretes enviados com sucesso!`);
    loadHistory();
  };

  const cancelSending = () => {
    sendingRef.current = false;
  };

  return (
    <Card className="bg-blue-500/10 border-blue-500/30 mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-blue-400 flex items-center gap-2">
            <Key className="w-5 h-5" />
            Lembrete de Acesso MRO
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-sm text-zinc-400">
          Envie um email para lembrar os clientes dos seus acessos MRO
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Buscar por email, usuário ou nome..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-zinc-800/50 border-zinc-600 text-white placeholder:text-zinc-500"
            />
          </div>
          <Button size="sm" variant="outline" onClick={selectAll} className="border-zinc-600 text-zinc-300">
            {selected.size === filteredUsers.length && filteredUsers.length > 0 ? "Desmarcar Todos" : "Selecionar Todos"}
          </Button>
          <Button size="sm" variant="outline" onClick={loadUsers} disabled={loading} className="border-zinc-600 text-zinc-300">
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          {sending ? (
            <Button size="sm" variant="destructive" onClick={cancelSending}>
              <X className="w-4 h-4 mr-1" /> Parar ({sentCount}/{totalToSend})
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={sendReminders}
              disabled={selected.size === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Send className="w-4 h-4 mr-1" />
              Enviar Lembrete ({selected.size})
            </Button>
          )}
        </div>

        {/* Progress */}
        {sending && (
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              <span className="text-sm text-blue-300">Enviando lembretes... {sentCount}/{totalToSend}</span>
            </div>
            <div className="w-full bg-zinc-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${totalToSend ? (sentCount / totalToSend) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* User List */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {filteredUsers.length === 0 && (
                <p className="text-center text-zinc-500 py-4">Nenhum usuário encontrado</p>
              )}
              {filteredUsers.map(user => {
                const alreadySent = wasSent(user.customer_email);
                return (
                  <div
                    key={user.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                      selected.has(user.id)
                        ? "bg-blue-500/15 border-blue-500/40"
                        : "bg-zinc-800/30 border-zinc-700 hover:border-zinc-600"
                    }`}
                    onClick={() => toggleSelect(user.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(user.id)}
                      onChange={() => toggleSelect(user.id)}
                      className="accent-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-medium truncate">
                          {user.customer_name || user.customer_email}
                        </span>
                        <Badge variant="outline" className="text-xs border-zinc-600 text-zinc-400">
                          {user.access_type}
                        </Badge>
                        {alreadySent && (
                          <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
                            <CheckCircle className="w-3 h-3 mr-1" /> Já enviado
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {user.customer_email}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" /> {user.username}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={e => { e.stopPropagation(); removeFromList(user.id); }}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {/* History */}
        {historyLoaded && history.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-zinc-400 mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Histórico de Envios ({history.length})
            </h4>
            <ScrollArea className="h-[200px]">
              <div className="space-y-1">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded bg-zinc-800/40 text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3 h-3 text-green-400" />
                      <span className="text-zinc-300">{h.email}</span>
                      <span className="text-zinc-500">({h.username})</span>
                    </div>
                    <span className="text-zinc-500">
                      {new Date(h.sent_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AccessReminderPanel;
