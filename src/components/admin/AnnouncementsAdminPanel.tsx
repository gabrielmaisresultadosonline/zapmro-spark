import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Megaphone, Plus, Trash2, RefreshCw } from "lucide-react";

type Ann = {
  id: string;
  title: string;
  message: string;
  frequency: "once" | "always" | "twice" | "date_range";
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  created_at: string;
};

export default function AnnouncementsAdminPanel({ creds }: { creds: { email: string; password: string } }) {
  const [items, setItems] = useState<Ann[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [frequency, setFrequency] = useState<Ann["frequency"]>("once");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  async function call(action: string, extra: Record<string, any> = {}) {
    const { data, error } = await supabase.functions.invoke("crm-central-admin", {
      body: { action, adminEmail: creds.email, adminPassword: creds.password, ...extra },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || "Erro");
    return data;
  }

  async function load() {
    setLoading(true);
    try {
      const data = await call("list_announcements");
      setItems(data.announcements || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar avisos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function create() {
    if (!title.trim() || !message.trim()) {
      toast.error("Preencha título e mensagem");
      return;
    }
    setSaving(true);
    try {
      await call("create_announcement", {
        title: title.trim(),
        message: message.trim(),
        frequency,
        start_date: frequency === "date_range" && startDate ? new Date(startDate).toISOString() : null,
        end_date: frequency === "date_range" && endDate ? new Date(endDate).toISOString() : null,
        active: true,
      });
      toast.success("Aviso publicado");
      setTitle(""); setMessage(""); setStartDate(""); setEndDate(""); setFrequency("once");
      load();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(a: Ann) {
    try {
      await call("update_announcement", { id: a.id, active: !a.active });
      setItems((p) => p.map((x) => x.id === a.id ? { ...x, active: !a.active } : x));
    } catch (err: any) {
      toast.error(err.message || "Erro");
    }
  }

  async function remove(a: Ann) {
    if (!confirm(`Excluir aviso "${a.title}"?`)) return;
    try {
      await call("delete_announcement", { id: a.id });
      toast.success("Excluído");
      setItems((p) => p.filter((x) => x.id !== a.id));
    } catch (err: any) {
      toast.error(err.message || "Erro");
    }
  }

  const freqLabel: Record<Ann["frequency"], string> = {
    once: "1 vez por usuário",
    twice: "2 vezes por usuário",
    always: "Sempre (até dispensar)",
    date_range: "Período específico",
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-5 border-[#E8F5F1] bg-white shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center text-white">
            <Megaphone className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-bold text-[#075E54]">Novo aviso (popup)</h2>
            <p className="text-xs text-[#128C7E]/70">Aparece para todos os logados conforme a frequência escolhida.</p>
          </div>
        </div>
        <div className="grid gap-3">
          <div>
            <Label className="text-[#075E54]">Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Manutenção programada"
              className="bg-[#F0FDF4] border-[#E8F5F1] text-[#075E54] placeholder:text-[#128C7E]/50 focus-visible:ring-[#25D366]"
            />
          </div>
          <div>
            <Label className="text-[#075E54]">Mensagem</Label>
            <Textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escreva o conteúdo do aviso..."
              className="bg-[#F0FDF4] border-[#E8F5F1] text-[#075E54] placeholder:text-[#128C7E]/50 focus-visible:ring-[#25D366]"
            />
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label className="text-[#075E54]">Frequência</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Ann["frequency"])}>
                <SelectTrigger className="bg-[#F0FDF4] border-[#E8F5F1] text-[#075E54]"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white border-[#E8F5F1] text-[#075E54]">
                  <SelectItem value="once">1 vez por usuário</SelectItem>
                  <SelectItem value="twice">2 vezes por usuário</SelectItem>
                  <SelectItem value="always">Sempre (até dispensar)</SelectItem>
                  <SelectItem value="date_range">Período específico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {frequency === "date_range" && (
              <>
                <div>
                  <Label className="text-[#075E54]">Início</Label>
                  <Input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-[#F0FDF4] border-[#E8F5F1] text-[#075E54]" />
                </div>
                <div>
                  <Label className="text-[#075E54]">Fim</Label>
                  <Input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-[#F0FDF4] border-[#E8F5F1] text-[#075E54]" />
                </div>
              </>
            )}
          </div>
          <div>
            <Button onClick={create} disabled={saving} className="bg-[#25D366] hover:bg-[#128C7E] text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Publicar aviso</>}
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[#075E54]">Avisos publicados ({items.length})</h3>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="bg-white border-[#E8F5F1] text-[#075E54] hover:bg-[#F0FDF4]">
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Recarregar
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[#128C7E]/60" /></div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-[#128C7E]/70 bg-white border-[#E8F5F1] shadow-sm">Nenhum aviso publicado ainda</Card>
      ) : (
        <div className="grid gap-3">
          {items.map((a) => (
            <Card key={a.id} className="p-4 bg-white border-[#E8F5F1] text-[#075E54] shadow-sm">
              <div className="flex justify-between items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{a.title}</span>
                    <Badge className={a.active ? "bg-[#25D366] text-white hover:bg-[#25D366]" : "bg-slate-100 text-slate-500 hover:bg-slate-100"}>
                      {a.active ? "Ativo" : "Inativo"}
                    </Badge>
                    <Badge variant="outline" className="border-[#E8F5F1] text-[#128C7E]">{freqLabel[a.frequency]}</Badge>
                  </div>
                  <p className="text-sm text-[#128C7E]/80 whitespace-pre-wrap">{a.message}</p>
                  <div className="text-xs text-slate-500">
                    Criado em {new Date(a.created_at).toLocaleString("pt-BR")}
                    {a.frequency === "date_range" && a.start_date && (
                      <> · {new Date(a.start_date).toLocaleString("pt-BR")} → {a.end_date ? new Date(a.end_date).toLocaleString("pt-BR") : "—"}</>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={a.active} onCheckedChange={() => toggleActive(a)} />
                    <span className="text-xs text-[#128C7E]/80">Ativo</span>
                  </div>
                  <Button size="sm" variant="destructive" onClick={() => remove(a)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}