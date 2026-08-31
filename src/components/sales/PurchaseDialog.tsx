import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, Clock, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const SALES_PIXEL_ID = "1009304915232936";
const genEventId = () =>
  `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

const getFbCookies = () => {
  if (typeof document === "undefined") return { fbc: "", fbp: "" };
  let fbc = "", fbp = "";
  for (const c of document.cookie.split(";")) {
    const [n, v] = c.trim().split("=");
    if (n === "_fbc") fbc = v;
    if (n === "_fbp") fbp = v;
  }
  if (!fbc) {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
  }
  return { fbc, fbp };
};

const getTestEventCode = () => {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("test_event_code");
};

const fbTrack = async (
  event: string,
  data?: { content_name?: string; content_category?: string; value?: number; currency?: string; email?: string; phone?: string }
) => {
  const eventId = genEventId();
  // Client-side Pixel
  try {
    const w = window as any;
    if (w.fbq) w.fbq("trackSingle", SALES_PIXEL_ID, event, data || {}, { eventID: eventId });
  } catch (_) { /* noop */ }
  // Server-side CAPI
  try {
    const { fbc, fbp } = getFbCookies();
    const testEventCode = getTestEventCode();
    const payload: Record<string, any> = {
      pixel_id: SALES_PIXEL_ID,
      event_name: event,
      event_id: eventId,
      event_source_url: window.location.href,
      user_agent: navigator.userAgent,
      fbc: fbc || undefined,
      fbp: fbp || undefined,
      test_event_code: testEventCode || undefined,
      currency: data?.currency || "BRL",
      ...data,
    };
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
    await supabase.functions.invoke("meta-conversions", { body: payload });
  } catch (_) { /* noop */ }
};

export type PlanKey = "mensal" | "semestral" | "anual";

const PLAN_INFO: Record<PlanKey, { label: string; amount: number; sub: string }> = {
  mensal: { label: "Plano Mensal", amount: 97, sub: "R$ 97/mês por número" },
  semestral: { label: "Plano 6 Meses", amount: 397, sub: "R$ 397 à vista • ou 6x de R$ 77 por número" },
  anual: { label: "Plano Anual (1 ano)", amount: 597, sub: "R$ 597 à vista • ou 12x de R$ 61 por número" },
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  plan: PlanKey;
}

export default function PurchaseDialog({ open, onOpenChange, plan }: Props) {
  const info = PLAN_INFO[plan];
  const [step, setStep] = useState<"form" | "waiting" | "approved" | "expired">("form");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", whatsapp: "", password: "" });
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number>(900);
  const pollRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      // reset on close
      setStep("form");
      setLoading(false);
      setForm({ fullName: "", email: "", whatsapp: "", password: "" });
      setPaymentLink(null);
      setOrderId(null);
      setExpiresAt(null);
      setRemaining(900);
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    }
  }, [open]);

  useEffect(() => {
    if (step !== "waiting" || !orderId || !expiresAt) return;

    tickRef.current = window.setInterval(() => {
      const s = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setRemaining(s);
      if (s <= 0 && tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    }, 1000);

    const verify = async () => {
      try {
        const { data } = await supabase.functions.invoke("crm-sales-verify", { body: { order_id: orderId } });
        if (data?.status === "approved") {
          setStep("approved");
          fbTrack("Purchase", {
            content_name: info.label,
            value: info.amount,
            currency: "BRL",
            email: form.email,
            phone: form.whatsapp,
          });
          if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
          if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
        } else if (data?.status === "expired") {
          setStep("expired");
          if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
          if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
        }
      } catch (_) { /* ignore */ }
    };
    verify();
    pollRef.current = window.setInterval(verify, 6000);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [step, orderId, expiresAt]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 6) { toast.error("Senha mínima de 6 caracteres"); return; }
    setLoading(true);
    // Dispara Lead imediatamente ao finalizar cadastro (antes da API)
    fbTrack("Lead", {
      content_name: info.label,
      content_category: "CRM Signup",
      value: info.amount,
      currency: "BRL",
      email: form.email,
      phone: form.whatsapp,
    });
    try {
      const { data, error } = await supabase.functions.invoke("crm-sales-checkout", {
        body: { ...form, plan },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Falha ao criar pedido");
      setPaymentLink(data.payment_link);
      setOrderId(data.order_id);
      setExpiresAt(new Date(data.expires_at).getTime());
      setStep("waiting");
      window.open(data.payment_link, "_blank", "noopener");
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar compra");
    } finally {
      setLoading(false);
    }
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{info.label}</DialogTitle>
          <DialogDescription>{info.sub}</DialogDescription>
        </DialogHeader>

        {step === "form" && (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <Input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Seu nome completo" />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="voce@email.com" />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp (com DDD)</Label>
              <Input required value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="(11) 99999-9999" />
            </div>
            <div className="space-y-1.5">
              <Label>Crie uma senha</Label>
              <Input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Pagar ${info.sub.split(" •")[0]}`}
            </Button>
            <p className="text-xs text-slate-500 text-center">Pagamento processado via InfinitePay</p>
          </form>
        )}

        {step === "waiting" && (
          <div className="space-y-4 text-center py-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
              <Clock className="h-8 w-8 text-blue-600 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Aguardando pagamento</h3>
              <p className="text-sm text-slate-600 mt-1">Estamos verificando seu pagamento em tempo real.</p>
            </div>
            <div className="text-3xl font-bold tabular-nums text-blue-600">{mm}:{ss}</div>
            <p className="text-xs text-slate-500">Tempo restante para concluir o pagamento</p>
            {paymentLink && (
              <a href={paymentLink} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-green-600 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Reabrir link de pagamento
              </a>
            )}
          </div>
        )}

        {step === "approved" && (
          <div className="space-y-3 text-center py-6">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold">Pagamento aprovado!</h3>
            <p className="text-sm text-slate-600">Sua compra foi confirmada. Em breve você receberá os acessos por e-mail.</p>
            <Button onClick={() => onOpenChange(false)} className="bg-green-600 hover:bg-green-700 text-white">Fechar</Button>
          </div>
        )}

        {step === "expired" && (
          <div className="space-y-3 text-center py-6">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold">Tempo esgotado</h3>
            <p className="text-sm text-slate-600">O link expirou. Gere um novo para concluir a compra.</p>
            <Button onClick={() => setStep("form")} className="bg-green-600 hover:bg-green-700 text-white">Tentar novamente</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}