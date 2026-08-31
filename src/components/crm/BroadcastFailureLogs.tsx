import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, RefreshCcw, ShieldAlert, Clock, PhoneOff, CreditCard } from "lucide-react";

/**
 * Explicação humana de cada código de erro da Meta (Cloud API).
 * Mantemos aqui um dicionário para que o usuário entenda exatamente
 * POR QUE a mensagem não foi entregue e QUAL a melhor forma de reenviar.
 */
interface ErrorExplanation {
  title: string;
  reason: string;
  fix: string;
  icon: JSX.Element;
}

const ERROR_DICTIONARY: Record<string, ErrorExplanation> = {
  "131026": {
    title: "Mensagem não entregue (Undeliverable)",
    reason:
      "A Meta aceitou o envio, mas não conseguiu entregar ao destinatário. Normalmente o número NÃO tem WhatsApp ativo, é um número fixo/inválido, a conta foi desativada, o aparelho está sem WhatsApp instalado, ou o destinatário nunca aceitou receber mensagens de empresas (WhatsApp Business API bloqueado no país/aparelho).",
    fix:
      "Valide o número antes do disparo (DDD + 9º dígito). Para números brasileiros antigos, teste com e sem o 9. Se o contato nunca respondeu, use SOMENTE template aprovado do tipo Marketing/Utilidade. Se falhar 2x seguidas, remova o contato da lista — ele não possui WhatsApp válido.",
    icon: <PhoneOff className="w-4 h-4 text-red-400" />,
  },
  "131047": {
    title: "Janela de 24h expirada",
    reason:
      "Você tentou enviar mensagem livre (texto/fluxo) para um contato que não responde há mais de 24 horas. A Meta bloqueia esse tipo de envio.",
    fix: "Envie um TEMPLATE aprovado para reabrir a conversa. Depois que o cliente responder, você pode mandar mensagens livres por mais 24h.",
    icon: <Clock className="w-4 h-4 text-yellow-400" />,
  },
  "131049": {
    title: "Bloqueio de qualidade / engajamento",
    reason:
      "A Meta limitou a entrega para proteger a experiência do usuário (muitos bloqueios ou baixa taxa de resposta na sua conta).",
    fix: "Reduza o volume, aumente o intervalo randômico entre envios e melhore o conteúdo do template para gerar respostas.",
    icon: <ShieldAlert className="w-4 h-4 text-orange-400" />,
  },
  "131042": {
    title: "Problema de pagamento / elegibilidade da conta",
    reason: "A conta comercial (WABA) está sem método de pagamento válido ou não está elegível para enviar.",
    fix: "Acesse o Gerenciador de Negócios da Meta e regularize o método de pagamento/limite de gastos.",
    icon: <CreditCard className="w-4 h-4 text-red-400" />,
  },
  "131045": {
    title: "Certificado do número não registrado",
    reason: "O número não completou o registro na Cloud API.",
    fix: "Reconecte o WhatsApp na aba de conexão para refazer o registro do número.",
    icon: <ShieldAlert className="w-4 h-4 text-orange-400" />,
  },
  "132000": {
    title: "Template com parâmetros incorretos",
    reason: "A quantidade de variáveis enviadas não corresponde ao template aprovado.",
    fix: "Reveja as variáveis do template antes de disparar novamente.",
    icon: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
  },
  "131051": {
    title: "Tipo de mensagem não suportado",
    reason: "O formato enviado não é aceito pela Cloud API nesse contexto.",
    fix: "Use texto, mídia suportada ou template aprovado.",
    icon: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
  },
  "130472": {
    title: "Usuário fora do experimento / não elegível",
    reason: "O destinatário faz parte de um grupo que a Meta não permite receber esse tipo de mensagem de marketing.",
    fix: "Envie um template de Utilidade ou aguarde o contato iniciar a conversa.",
    icon: <ShieldAlert className="w-4 h-4 text-orange-400" />,
  },
};

const UNKNOWN_ERROR: ErrorExplanation = {
  title: "Falha não catalogada",
  reason: "A Meta retornou um erro que ainda não está no nosso dicionário. Veja o detalhe técnico abaixo.",
  fix: "Reenvie usando um template aprovado. Se persistir, confira se o número existe no WhatsApp.",
  icon: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
};

interface FailureRow {
  id: string;
  created_at: string;
  error_code: string | null;
  error_message: string | null;
  metadata: any;
  contact: { name?: string | null; wa_id?: string | null } | null;
}

interface BroadcastFailureLogsProps {
  broadcast: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BroadcastFailureLogs = ({ broadcast, open, onOpenChange }: BroadcastFailureLogsProps) => {
  const [rows, setRows] = useState<FailureRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!broadcast) return;
    setLoading(true);
    try {
      const base = () =>
        supabase
          .from("crm_messages")
          .select("id, created_at, error_code, error_message, metadata, contact_id, crm_contacts(name, wa_id)")
          .eq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(300);

      // 1) Tentamos vincular pelas mensagens marcadas com o broadcast_id
      let { data, error } = await base().eq("metadata->>broadcast_id", broadcast.id);
      if (error) throw error;

      // 2) Fallback: campanhas antigas não gravavam broadcast_id — usamos a janela de tempo
      if (!data || data.length === 0) {
        const start = new Date(broadcast.created_at).toISOString();
        const end = new Date(new Date(broadcast.created_at).getTime() + 6 * 60 * 60 * 1000).toISOString();
        const res = await base().gte("created_at", start).lte("created_at", end);
        if (res.error) throw res.error;
        data = res.data as any[];
      }

      setRows(
        (data || []).map((m: any) => ({
          id: m.id,
          created_at: m.created_at,
          error_code: m.error_code ? String(m.error_code) : null,
          error_message: m.error_message,
          metadata: m.metadata,
          contact: m.crm_contacts || null,
        }))
      );
    } catch (e) {
      console.error("[BroadcastFailureLogs] erro ao carregar logs:", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, broadcast?.id]);

  // Resumo agrupado por código de erro
  const summary = rows.reduce<Record<string, number>>((acc, r) => {
    const key = r.error_code || "desconhecido";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] md:max-w-2xl bg-[#111b21] border-white/10 text-[#e9edef] p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b border-white/10 bg-[#202c33]">
          <DialogTitle className="text-base flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-4 h-4" /> Logs de falha — {broadcast?.name}
          </DialogTitle>
          <DialogDescription className="text-[11px] text-[#8696a0]">
            Aqui aparece exatamente quais contatos falharam, o código retornado pela Meta, o motivo e a melhor forma de reenviar.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {Object.keys(summary).length === 0 ? (
              <span className="text-[11px] text-[#8696a0]">Nenhuma falha registrada nesta campanha.</span>
            ) : (
              Object.entries(summary).map(([code, count]) => (
                <Badge key={code} className="bg-red-500/15 text-red-300 text-[10px]">
                  {code}: {count} falha{count > 1 ? "s" : ""}
                </Badge>
              ))
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={load}
              disabled={loading}
              className="ml-auto h-7 text-[10px] text-[#8696a0] hover:text-[#e9edef]"
            >
              <RefreshCcw className={"w-3 h-3 mr-1 " + (loading ? "animate-spin" : "")} /> Atualizar
            </Button>
          </div>

          <ScrollArea className="h-[55vh] md:h-[420px] pr-2">
            <div className="space-y-2">
              {rows.map((r) => {
                const info = ERROR_DICTIONARY[r.error_code || ""] || UNKNOWN_ERROR;
                const details =
                  r.metadata?.last_meta_status?.errors?.[0]?.error_data?.details ||
                  r.error_message ||
                  "sem detalhe técnico";
                return (
                  <div key={r.id} className="p-3 rounded-xl bg-[#202c33] border border-white/5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">
                          {r.contact?.name || "Sem nome"}{" "}
                           <span className="text-[#8696a0] font-normal">{r.contact?.wa_id || ""}</span>
                        </p>
                        <p className="text-[9px] text-[#8696a0]">
                          {new Date(r.created_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                      <Badge className="bg-red-500/15 text-red-300 text-[9px] shrink-0">
                        {r.error_code || "erro"}
                      </Badge>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 shrink-0">{info.icon}</div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold text-[#e9edef]">{info.title}</p>
                        <p className="text-[10px] text-[#8696a0] leading-relaxed">
                          <span className="text-[#e9edef]/80 font-medium">Por que falhou:</span> {info.reason}
                        </p>
                        <p className="text-[10px] text-[#00a884] leading-relaxed">
                          <span className="font-medium">Como reenviar:</span> {info.fix}
                        </p>
                        <p className="text-[9px] text-[#8696a0]/70 break-all">Detalhe técnico: {details}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BroadcastFailureLogs;