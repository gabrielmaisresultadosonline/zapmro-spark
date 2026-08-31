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
import { Loader2, RefreshCw, Power, QrCode, Send, Trash2, Smartphone } from "lucide-react";

interface SessionRow { status: string; qr_code: string | null; phone_number: string | null; last_heartbeat: string | null; }
interface SettingsRow { message_template: string; delay_minutes: number; enabled: boolean; }
interface MessageRow { id: string; lead_name: string | null; phone: string; message: string; status: string; scheduled_for: string; sent_at: string | null; error_message: string | null; created_at: string; }

interface Props {
  adminToken: string;
  onUnauthorized?: () => void;
  functionName?: string;
  emptyHint?: string;
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

export default function WppBotPanelV2({ adminToken, onUnauthorized, functionName = "wpp-bot-admin-v2", emptyHint = "Nenhuma mensagem ainda." }: Props) {
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [settings, setSettings] = useState<SettingsRow>({ message_template: "", delay_minutes: 30, enabled: true });
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("");

  const invokeAdmin = useCallback(async (body: Record<string, unknown>) => {
    const response = await supabase.functions.invoke(functionName, { body: { ...body, adminToken } });
    if (response.error) throw response.error;
    if (response.data?.success === false) {
      const errorMessage = response.data?.error || "Falha ao processar a solicitação";
      if (response.data?.error?.includes("Sessão expirada")) onUnauthorized?.();
      throw new Error(errorMessage);
    }
    return response.data;
  }, [adminToken, onUnauthorized, functionName]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invokeAdmin({ action: "getStatus" });
      setSession(data.session);
      if (data.settings) setSettings(data.settings);
      setMessages(data.messages || []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [invokeAdmin]);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const requestQr = async () => { await invokeAdmin({ action: "requestQr" }); toast({ title: "Solicitando QR Code...", description: "Aguarde alguns segundos" }); load(); };
  const logout = async () => { if (!confirm("Desconectar o WhatsApp?")) return; await invokeAdmin({ action: "logout" }); toast({ title: "Desconectando..." }); load(); };
  const saveSettings = async () => {
    await invokeAdmin({ action: "saveSettings", message_template: settings.message_template, delay_minutes: Number(settings.delay_minutes) || 30, enabled: settings.enabled });
    toast({ title: "Configurações salvas!" });
  };
  const retry = async (id: string) => { await invokeAdmin({ action: "retryMessage", message_id: id }); load(); };
  const sendNow = async (id: string) => { await invokeAdmin({ action: "sendNow", message_id: id }); toast({ title: "Enviando agora..." }); load(); };
  const remove = async (id: string) => { await invokeAdmin({ action: "deleteMessage", message_id: id }); load(); };
  const sendTest = async () => {
    if (!testPhone.trim()) { toast({ title: "Informe um número", variant: "destructive" }); return; }
    try {
      const res = await invokeAdmin({ action: "sendTest", phone: testPhone.trim(), message_template: testMessage.trim() || settings.message_template, lead_name: "TESTE" });
      toast({ title: "Teste enfileirado!", description: `Enviando para ${res.phone}` });
      setTestPhone(""); setTestMessage(""); load();
    } catch (e: any) {
      toast({ title: "Erro no teste", description: e.message, variant: "destructive" });
    }
  };

  const status = session?.status || "disconnected";
  const badge = STATUS_BADGE[status] || STATUS_BADGE.disconnected;
  const heartbeatOk = session?.last_heartbeat && Date.now() - new Date(session.last_heartbeat).getTime() < 30_000;

  return (
    <div className="space-y-4">
      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between">
            <span className="flex items-center gap-2"><Smartphone className="w-5 h-5" /> Conexão WhatsApp (VPS)</span>
            <span className={`text-xs px-3 py-1 rounded-full ${badge.color}`}>{badge.label}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm text-gray-300">
            <div><span className="text-gray-500">Bot VPS: </span>{heartbeatOk ? <span className="text-green-400">online</span> : <span className="text-red-400">offline (rodar bot na VPS)</span>}</div>
            {session?.phone_number && <div><span className="text-gray-500">Número: </span><span className="text-white">{session.phone_number}</span></div>}
            {session?.last_heartbeat && <div><span className="text-gray-500">Último ping: </span>{format(new Date(session.last_heartbeat), "dd/MM HH:mm:ss", { locale: ptBR })}</div>}
          </div>
          {session?.qr_code && status !== "connected" && (
            <div className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(session.qr_code)}`} alt="QR Code WhatsApp" className="w-64 h-64" />
              <p className="text-gray-700 text-sm">Escaneie no WhatsApp do celular</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={requestQr} variant="outline" disabled={loading}><QrCode className="w-4 h-4 mr-2" /> Gerar/Atualizar QR</Button>
            <Button onClick={logout} variant="destructive" disabled={status !== "connected"}><Power className="w-4 h-4 mr-2" /> Desconectar</Button>
            <Button onClick={load} variant="ghost"><RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader><CardTitle className="text-white">Mensagem de Remarketing</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={settings.enabled} onCheckedChange={(v) => setSettings({ ...settings, enabled: v })} />
            <Label className="text-gray-300">Envio automático ativado</Label>
          </div>
          <div>
            <Label className="text-gray-300">Atraso após cadastro (minutos)</Label>
            <Input type="number" min={1} value={settings.delay_minutes} onChange={(e) => setSettings({ ...settings, delay_minutes: Number(e.target.value) })} className="mt-2 bg-gray-700 border-gray-600 text-white max-w-xs" />
          </div>
          <div>
            <Label className="text-gray-300">Mensagem (use *texto* para negrito)</Label>
            <Textarea rows={6} value={settings.message_template} onChange={(e) => setSettings({ ...settings, message_template: e.target.value })} className="mt-2 bg-gray-700 border-gray-600 text-white" />
          </div>
          <Button onClick={saveSettings}><Send className="w-4 h-4 mr-2" /> Salvar configurações</Button>
        </CardContent>
      </Card>

      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader><CardTitle className="text-white">Enviar mensagem de teste</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-400">Aceita: <code>51980437695</code>, <code>5180437695</code>, <code>(51) 98043-7695</code>. Sistema adiciona <strong>55</strong> automaticamente.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Número (ex: 51980437695)" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="bg-gray-700 border-gray-600 text-white" />
            <Button onClick={sendTest} className="shrink-0"><Send className="w-4 h-4 mr-2" /> Enviar Teste</Button>
          </div>
          <Textarea rows={3} placeholder="(opcional) mensagem custom" value={testMessage} onChange={(e) => setTestMessage(e.target.value)} className="bg-gray-700 border-gray-600 text-white" />
        </CardContent>
      </Card>

      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader><CardTitle className="text-white">Histórico de envios ({messages.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-700">
                  <TableHead className="text-gray-300">Lead</TableHead>
                  <TableHead className="text-gray-300">WhatsApp</TableHead>
                  <TableHead className="text-gray-300">Status</TableHead>
                  <TableHead className="text-gray-300">Agendado</TableHead>
                  <TableHead className="text-gray-300">Enviado</TableHead>
                  <TableHead className="text-gray-300">Erro</TableHead>
                  <TableHead className="text-gray-300">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((m) => {
                  const s = MSG_STATUS[m.status] || MSG_STATUS.pending;
                  return (
                    <TableRow key={m.id} className="border-gray-700">
                      <TableCell className="text-white">{m.lead_name || "-"}</TableCell>
                      <TableCell className="text-gray-300">{m.phone}</TableCell>
                      <TableCell><span className={`px-2 py-1 rounded-full text-xs ${s.color}`}>{s.label}</span></TableCell>
                      <TableCell className="text-gray-300 text-xs">{format(new Date(m.scheduled_for), "dd/MM HH:mm", { locale: ptBR })}</TableCell>
                      <TableCell className="text-gray-300 text-xs">{m.sent_at ? format(new Date(m.sent_at), "dd/MM HH:mm", { locale: ptBR }) : "-"}</TableCell>
                      <TableCell className="text-red-400 text-xs max-w-[200px] truncate">{m.error_message || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {m.status === "pending" && <Button size="sm" variant="ghost" onClick={() => sendNow(m.id)} title="Enviar agora"><Send className="w-3 h-3 text-green-400" /></Button>}
                          {(m.status === "failed" || m.status === "no_whatsapp") && <Button size="sm" variant="ghost" onClick={() => retry(m.id)} title="Reenviar"><RefreshCw className="w-3 h-3" /></Button>}
                          <Button size="sm" variant="ghost" onClick={() => remove(m.id)} title="Excluir"><Trash2 className="w-3 h-3 text-red-400" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {messages.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-gray-500 py-8">{emptyHint}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
