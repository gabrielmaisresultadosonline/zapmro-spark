import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CheckCircle, XCircle, Loader2, RefreshCw, Power, QrCode, Send, Trash2, Smartphone, History, AlertCircle
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SessionRow {
  status: string;
  qr_code: string | null;
  phone_number: string | null;
  last_heartbeat: string | null;
}
interface SettingsRow {
  message_template: string;
  delay_minutes: number;
  enabled: boolean;
}
interface MessageRow {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  phone: string;
  message: string;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

interface ConnectionLog {
  id: string;
  event_type: string;
  status: string;
  details: string | null;
  error_message: string | null;
  created_at: string;
}

interface WppBotPanelProps {
  adminToken: string;
  onUnauthorized?: () => void;
}

const STATUS_BADGE: Record<string, { color: string; label: string }> = {
  connected: { color: "bg-green-500/20 text-green-400", label: "Conectado" },
  connecting: { color: "bg-yellow-500/20 text-yellow-400", label: "Conectando" },
  qr: { color: "bg-blue-500/20 text-blue-400", label: "Aguardando QR" },
  disconnected: { color: "bg-gray-500/20 text-gray-400", label: "Desconectado" },
};

const MSG_STATUS: Record<string, { color: string; label: string }> = {
  pending: { color: "bg-yellow-500/20 text-yellow-400", label: "Aguardando" },
  sent: { color: "bg-green-500/20 text-green-400", label: "Enviado" },
  no_whatsapp: { color: "bg-orange-500/20 text-orange-400", label: "Sem WhatsApp" },
  failed: { color: "bg-red-500/20 text-red-400", label: "Falhou" },
};

export default function WppBotPanel({ adminToken, onUnauthorized }: WppBotPanelProps) {
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [settings, setSettings] = useState<SettingsRow>({
    message_template: "",
    delay_minutes: 30,
    enabled: true,
  });
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [connectionLogs, setConnectionLogs] = useState<ConnectionLog[]>([]);
  const [isLogsOpen, setIsLogsOpen] = useState(false);

  const invokeAdmin = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await supabase.functions.invoke("wpp-bot-admin", {
        body: { ...body, adminToken },
      });

      if (response.error) throw response.error;
      if (response.data?.success === false) {
        const errorMessage = response.data?.error || "Falha ao processar a solicitação";
        if (response.data?.error?.includes("Sessão expirada")) {
          onUnauthorized?.();
        }
        throw new Error(errorMessage);
      }

      return response.data;
    },
    [adminToken, onUnauthorized],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invokeAdmin({ action: "getStatus" });
      setSession(data.session);
      if (data.settings) setSettings(data.settings);
      setMessages(data.messages || []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [invokeAdmin]);

  const loadLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("wpp_connection_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      setConnectionLogs(data || []);
    } catch (e: any) {
      console.error("Erro ao carregar logs de conexão:", e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // polling para QR / status / histórico
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (isLogsOpen) {
      loadLogs();
    }
  }, [isLogsOpen, loadLogs]);

  const requestQr = async () => {
    await invokeAdmin({ action: "requestQr" });
    toast({ title: "Solicitando QR Code...", description: "Aguarde alguns segundos" });
    load();
  };

  const logout = async () => {
    if (!confirm("Desconectar o WhatsApp?")) return;
    await invokeAdmin({ action: "logout" });
    toast({ title: "Desconectando..." });
    load();
  };

  const retry = async (id: string) => {
    await invokeAdmin({ action: "retryMessage", message_id: id });
    load();
  };

  const sendNow = async (id: string) => {
    await invokeAdmin({ action: "sendNow", message_id: id });
    toast({ title: "Enviando agora..." });
    load();
  };

  const remove = async (id: string) => {
    await invokeAdmin({ action: "deleteMessage", message_id: id });
    load();
  };

  const status = session?.status || "disconnected";
  const badge = STATUS_BADGE[status] || STATUS_BADGE.disconnected;
  const heartbeatOk =
    session?.last_heartbeat &&
    Date.now() - new Date(session.last_heartbeat).getTime() < 30_000;

  // Filtrar apenas mensagens de vendas (que possuem lead_id)
  const salesMessages = messages.filter(m => m.lead_id !== null);

  return (
    <div className="space-y-4">
      {/* Status + Conexão */}
      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Smartphone className="w-5 h-5" /> Conexão WhatsApp (VPS)
            </span>
            <span className={`text-xs px-3 py-1 rounded-full ${badge.color}`}>
              {badge.label}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm text-gray-300">
            <div>
              <span className="text-gray-500">Bot VPS: </span>
              {heartbeatOk ? (
                <span className="text-green-400">online</span>
              ) : (
                <span className="text-red-400">offline (rodar bot na VPS)</span>
              )}
            </div>
            {session?.phone_number && (
              <div>
                <span className="text-gray-500">Número: </span>
                <span className="text-white">{session.phone_number}</span>
              </div>
            )}
            {session?.last_heartbeat && (
              <div>
                <span className="text-gray-500">Último ping: </span>
                {format(new Date(session.last_heartbeat), "dd/MM HH:mm:ss", { locale: ptBR })}
              </div>
            )}
          </div>

          {session?.qr_code && status !== "connected" && (
            <div className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(
                  session.qr_code
                )}`}
                alt="QR Code WhatsApp"
                className="w-64 h-64"
              />
              <p className="text-gray-700 text-sm">Escaneie no WhatsApp do celular</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={requestQr} variant="outline" disabled={loading}>
              <QrCode className="w-4 h-4 mr-2" /> 
              {status === "disconnected" ? "Conectar" : "Atualizar QR"}
            </Button>
            <Button onClick={logout} variant="destructive" disabled={status !== "connected"}>
              <Power className="w-4 h-4 mr-2" /> Desconectar
            </Button>
            
            <Dialog open={isLogsOpen} onOpenChange={setIsLogsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10">
                  <History className="w-4 h-4 mr-2" /> Logs Internos
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-2xl max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <History className="w-5 h-5 text-blue-400" /> Histórico de Conexão (VPS)
                  </DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[50vh] pr-4">
                  <div className="space-y-3">
                    {connectionLogs.length === 0 ? (
                      <div className="text-center py-10 text-gray-500">Nenhum log registrado ainda.</div>
                    ) : (
                      connectionLogs.map((log) => (
                        <div key={log.id} className="p-3 rounded-lg bg-gray-800/50 border border-gray-700 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className={`font-bold uppercase ${
                              log.event_type === 'connection_lost' ? 'text-red-400' : 
                              log.event_type === 'connection_restored' ? 'text-green-400' : 
                              'text-blue-400'
                            }`}>
                              {log.event_type.replace(/_/g, ' ')}
                            </span>
                            <span className="text-gray-500">
                              {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                            </span>
                          </div>
                          <p className="text-sm text-gray-200">{log.details}</p>
                          {log.error_message && (
                            <div className="flex items-start gap-2 mt-2 p-2 bg-red-500/10 rounded border border-red-500/20">
                              <AlertCircle className="w-3 h-3 text-red-400 mt-0.5" />
                              <p className="text-xs text-red-300 italic">{log.error_message}</p>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>

            <Button onClick={load} variant="ghost">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>


      {/* Histórico de Envios (Apenas Vendas Aprovadas) */}
      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" /> 
            Histórico de Envios (Vendas Aprovadas)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-gray-700">
            <Table>
              <TableHeader className="bg-gray-900/50">
                <TableRow className="border-gray-700 hover:bg-transparent">
                  <TableHead className="text-gray-400">Lead</TableHead>
                  <TableHead className="text-gray-400">Telefone</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400">Agendado</TableHead>
                  <TableHead className="text-gray-400 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesMessages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      Nenhum envio recente de venda aprovada
                    </TableCell>
                  </TableRow>
                ) : (
                  salesMessages.map((msg) => {
                    const status = MSG_STATUS[msg.status] || { color: "bg-gray-500", label: msg.status };
                    return (
                      <TableRow key={msg.id} className="border-gray-700 hover:bg-gray-700/30">
                        <TableCell className="font-medium text-white">{msg.lead_name || "Desconhecido"}</TableCell>
                        <TableCell className="text-gray-300">{msg.phone}</TableCell>
                        <TableCell>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${status.color}`}>
                            {status.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-gray-400 text-xs">
                          {format(new Date(msg.scheduled_for), "HH:mm:ss", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {msg.status === "failed" && (
                              <Button size="icon" variant="ghost" onClick={() => retry(msg.id)} title="Tentar novamente">
                                <RefreshCw className="w-3 h-3" />
                              </Button>
                            )}
                            {msg.status === "pending" && (
                              <Button size="icon" variant="ghost" onClick={() => sendNow(msg.id)} title="Enviar agora">
                                <Send className="w-3 h-3 text-blue-400" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => remove(msg.id)} title="Excluir">
                              <Trash2 className="w-3 h-3 text-red-400" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
