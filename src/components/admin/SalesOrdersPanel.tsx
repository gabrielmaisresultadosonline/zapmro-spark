import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, RefreshCw, ExternalLink, Trash2, Copy, CheckCircle2, ArrowLeftRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Order = {
  id: string;
  full_name: string;
  email: string;
  whatsapp: string;
  plan: string;
  plan_label: string;
  amount: number;
  nsu_order: string;
  infinitepay_link: string | null;
  status: "pending" | "approved" | "expired";
  expires_at: string;
  paid_at: string | null;
  created_at: string;
};

export default function SalesOrdersPanel({ creds }: { creds: { email: string; password: string } }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-central-admin", {
        body: { action: "list_sales_orders", adminEmail: creds.email, adminPassword: creds.password },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro");
      setOrders(data.orders || []);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar vendas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
    // eslint-disable-next-line
  }, []);

  async function remove(id: string) {
    if (!confirm("Excluir este pedido?")) return;
    try {
      await supabase.functions.invoke("crm-central-admin", {
        body: { action: "delete_sales_order", adminEmail: creds.email, adminPassword: creds.password, id },
      });
      setOrders((p) => p.filter((o) => o.id !== id));
    } catch (e: any) { toast.error(e.message || "Erro"); }
  }

  async function approveManual(id: string, plan?: string) {
    try {
      const { data, error } = await supabase.functions.invoke("crm-central-admin", {
        body: { action: "approve_sales_order", adminEmail: creds.email, adminPassword: creds.password, id, plan },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro");
      toast.success("Pedido aprovado");
      load();
    } catch (e: any) { toast.error(e.message || "Erro"); }
  }

  async function migratePlan(id: string, plan: string) {
    try {
      const { data, error } = await supabase.functions.invoke("crm-central-admin", {
        body: { action: "migrate_sales_order_plan", adminEmail: creds.email, adminPassword: creds.password, id, plan },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro");
      toast.success("Plano migrado");
      load();
    } catch (e: any) { toast.error(e.message || "Erro"); }
  }

  const byStatus = (s: string) => orders.filter((o) => o.status === s);

  const total = orders.length;
  const pending = byStatus("pending").length;
  const approved = byStatus("approved").length;
  const expired = byStatus("expired").length;
  const revenue = byStatus("approved").reduce((sum, o) => sum + Number(o.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-[#075E54]">Vendas (Página de Vendas)</h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="bg-white border-[#E8F5F1] text-[#075E54] hover:bg-[#F0FDF4]">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Recarregar
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatBox label="Total" value={total} color="bg-slate-100 text-slate-700" />
        <StatBox label="Pendentes" value={pending} color="bg-amber-100 text-amber-700" />
        <StatBox label="Aprovados" value={approved} color="bg-green-100 text-green-700" />
        <StatBox label="Expirados" value={expired} color="bg-red-100 text-red-700" />
        <StatBox label="Faturamento" value={`R$ ${revenue.toFixed(2)}`} color="bg-[#25D366]/15 text-[#075E54]" />
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="bg-white border border-[#E8F5F1] shadow-sm">
          <TabsTrigger value="pending" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white">Pendentes ({pending})</TabsTrigger>
          <TabsTrigger value="approved" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">Aprovados ({approved})</TabsTrigger>
          <TabsTrigger value="expired" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">Expirados ({expired})</TabsTrigger>
        </TabsList>
        {(["pending", "approved", "expired"] as const).map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4 space-y-2">
            {loading && orders.length === 0 ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[#128C7E]/60" /></div>
            ) : byStatus(tab).length === 0 ? (
              <Card className="p-6 text-center text-sm text-[#128C7E]/70 bg-white border-[#E8F5F1]">Nenhum pedido nesta categoria</Card>
            ) : (
              byStatus(tab).map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  onDelete={() => remove(o.id)}
                  onApprove={(plan) => approveManual(o.id, plan)}
                  onMigrate={(plan) => migratePlan(o.id, plan)}
                />
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className={`rounded-xl p-3 ${color}`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function OrderRow({
  order, onDelete, onApprove, onMigrate,
}: {
  order: Order;
  onDelete: () => void;
  onApprove: (plan?: string) => void;
  onMigrate: (plan: string) => void;
}) {
  const [planOverride, setPlanOverride] = useState<string>(order.plan);
  const created = new Date(order.created_at).toLocaleString("pt-BR");
  const expires = new Date(order.expires_at).toLocaleString("pt-BR");
  const statusBadge =
    order.status === "approved" ? <Badge className="bg-green-600 text-white">Aprovado</Badge>
    : order.status === "pending" ? <Badge className="bg-amber-500 text-white">Pendente</Badge>
    : <Badge className="bg-red-500 text-white">Expirado</Badge>;

  return (
    <Card className="p-4 bg-white border-[#E8F5F1] shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[#075E54]">{order.full_name}</span>
            {statusBadge}
            <Badge variant="outline" className="text-[#128C7E] border-[#128C7E]/30">{order.plan_label}</Badge>
            <span className="font-bold text-[#075E54]">R$ {Number(order.amount).toFixed(2)}</span>
          </div>
          <div className="text-xs text-[#128C7E]/80 space-x-3">
            <span>📧 {order.email}</span>
            <span>📱 {order.whatsapp}</span>
            <span>NSU: {order.nsu_order}</span>
          </div>
          <div className="text-[11px] text-slate-500 space-x-3">
            <span>Criado: {created}</span>
            {order.status === "pending" && <span>Expira: {expires}</span>}
            {order.paid_at && <span>Pago: {new Date(order.paid_at).toLocaleString("pt-BR")}</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {order.status !== "approved" && (
            <div className="flex items-center gap-1">
              <Select value={planOverride} onValueChange={setPlanOverride}>
                <SelectTrigger className="h-9 w-[160px] text-xs">
                  <SelectValue placeholder="Plano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal — R$ 137</SelectItem>
                  <SelectItem value="semestral">6 Meses — R$ 397</SelectItem>
                  <SelectItem value="anual">Anual — R$ 597</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => {
                  if (!confirm(`Aprovar manualmente como ${planOverride}?`)) return;
                  onApprove(planOverride !== order.plan ? planOverride : undefined);
                }}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
              </Button>
            </div>
          )}
          {order.status === "approved" && (
            <div className="flex items-center gap-1">
              <Select value={planOverride} onValueChange={setPlanOverride}>
                <SelectTrigger className="h-9 w-[160px] text-xs">
                  <SelectValue placeholder="Migrar plano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal — R$ 137</SelectItem>
                  <SelectItem value="semestral">6 Meses — R$ 397</SelectItem>
                  <SelectItem value="anual">Anual — R$ 597</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={planOverride === order.plan}
                onClick={() => {
                  if (!confirm(`Migrar acesso para ${planOverride}?`)) return;
                  onMigrate(planOverride);
                }}
              >
                <ArrowLeftRight className="h-4 w-4 mr-1" /> Migrar
              </Button>
            </div>
          )}
          {order.infinitepay_link && (
            <>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(order.infinitepay_link!); toast.success("Link copiado"); }}>
                <Copy className="h-4 w-4 mr-1" /> Copiar link
              </Button>
              <a href={order.infinitepay_link} target="_blank" rel="noopener">
                <Button size="sm" variant="outline"><ExternalLink className="h-4 w-4 mr-1" /> Abrir</Button>
              </a>
            </>
          )}
          <Button size="sm" variant="destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
    </Card>
  );
}