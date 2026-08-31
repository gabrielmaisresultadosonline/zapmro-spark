import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowDown, CheckCircle2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept?: () => void;
  /** When true, requires scroll-to-bottom + checkbox before continuing. */
  requireConsent?: boolean;
  acceptLabel?: string;
};

export default function MetaApiTermsDialog({
  open,
  onOpenChange,
  onAccept,
  requireConsent = false,
  acceptLabel = "Li, concordo e quero continuar",
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [reachedBottom, setReachedBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (open) {
      setReachedBottom(false);
      setAgreed(false);
      // give the dialog a tick to render
      setTimeout(() => {
        const el = scrollRef.current;
        if (el && el.scrollHeight <= el.clientHeight + 4) setReachedBottom(true);
      }, 100);
    }
  }, [open]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) {
      setReachedBottom(true);
    }
  }

  const canContinue = !requireConsent || (reachedBottom && agreed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-white p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-2xl md:text-3xl font-black text-slate-900">
            Informativo sobre a Meta API do WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="px-6 py-4 max-h-[55vh] overflow-y-auto text-left text-slate-700 leading-relaxed space-y-6"
        >
          <p>
            Para utilizar a <strong>Meta API do WhatsApp</strong>, existem algumas regras e requisitos importantes.
          </p>

          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Requisitos para utilização</h3>
            <p className="mb-2">A Meta API não está disponível para qualquer conta. Para utilizar o recurso, é necessário:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Possuir uma <strong>Business Manager do Facebook verificada</strong>;</li>
              <li>Ter o número do WhatsApp cadastrado dentro da Business Manager;</li>
              <li>Possuir uma conta do WhatsApp Business vinculada corretamente à empresa.</li>
            </ul>
            <p className="mt-2">
              Após a aprovação e configuração, será possível utilizar a modalidade de <strong>coexistência via QR Code</strong> em nossa plataforma.
            </p>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Regras da Coexistência</h3>
            <p>Seu número do WhatsApp precisa estar cadastrado no Business Manager para utilizar a Meta API em modo de coexistência.</p>
            <p className="mt-2">
              Além disso, o número não pode ser recém-adicionado ao WhatsApp Business. É necessário que ele já possua um histórico de utilização, com conversas e movimentações por pelo menos <strong>7 dias</strong>. Caso contrário, a Meta pode não liberar a utilização da API.
            </p>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Custos da Meta API do WhatsApp</h3>
            <p>Na Meta API, os custos são cobrados principalmente pela <strong>inicialização de conversas</strong>.</p>
            <p className="mt-2">Se um cliente entrar em contato com você primeiro, é possível atendê-lo gratuitamente dentro da janela de <strong>24 horas</strong>, sem nenhum custo da API.</p>
            <p className="mt-2">Ou seja, você só paga quando inicia uma conversa com o cliente.</p>
            <h4 className="font-bold text-slate-900 mt-3 mb-2">Exemplos:</h4>
            <ul className="list-disc pl-6 space-y-1">
              <li>Cliente envia uma mensagem → você responde em até 24 horas → <strong>sem custo</strong>.</li>
              <li>Sua empresa inicia uma conversa → <strong>há cobrança da Meta</strong>.</li>
              <li>Disparos, remarketing ou reativação de clientes após as 24 horas → cobrança aproximada de <strong>R$ 0,30 por envio</strong>, dependendo da categoria da mensagem e das tarifas vigentes da Meta.</li>
            </ul>
            <p className="mt-2">A grande vantagem é que esse processo pode ser realizado com muito mais segurança, reduzindo significativamente os riscos de bloqueio ou perda do número.</p>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Atendimento pelo aplicativo e pelo sistema</h3>
            <p>Com a funcionalidade de <strong>coexistência via WhatsApp Business App</strong>, você pode:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Iniciar uma conversa pelo celular;</li>
              <li>Continuar o atendimento pelo nosso sistema;</li>
              <li>Receber as respostas diretamente na plataforma.</li>
            </ul>
            <p className="mt-2">Dessa forma, em muitos atendimentos você não terá custos de envio pela API, mantendo a praticidade do aplicativo e os recursos profissionais do sistema.</p>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Vantagens da Meta API do WhatsApp</h3>
            <p>A Meta API leva seu atendimento para um nível mais profissional, oferecendo:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Risco praticamente zero de bloqueios;</li>
              <li>Maior segurança para o número;</li>
              <li>Atendimento multiatendente;</li>
              <li>Integrações e automações;</li>
              <li>Maior estabilidade e confiabilidade.</li>
            </ul>
            <p className="mt-2">Quanto mais o número é utilizado pela API oficial da Meta, maior tende a ser sua reputação, reduzindo ainda mais os riscos relacionados à conta.</p>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">É possível utilizar a API sem pagar pelos envios?</h3>
            <p>Sim. Em muitos casos é possível utilizar o WhatsApp Business API sem custos de envio, aproveitando as janelas gratuitas de atendimento.</p>
            <p className="mt-2">Nós possuímos um passo a passo que utilizamos internamente para ajudar nossos clientes a reduzirem ou até eliminarem esses custos em determinados cenários.</p>
            <p className="mt-2">Entretanto, caso você utilize recursos de disparo em massa ou campanhas ativas, será necessário cadastrar uma forma de pagamento na Meta.</p>
          </div>

          <div className="border-t pt-4 text-center text-sm text-slate-500">
            — Fim do informativo —
          </div>
        </div>

        {requireConsent && (
          <div className="px-6 pt-3 border-t bg-slate-50">
            {!reachedBottom && (
              <div className="flex items-center justify-center gap-2 text-amber-900 bg-amber-100 border-2 border-amber-400 rounded-lg text-sm font-bold py-3 px-4 my-2 shadow-sm">
                <ArrowDown className="w-5 h-5 animate-bounce text-amber-700" />
                <span className="uppercase tracking-wide">Role até o final e marque a opção para aceitar</span>
                <ArrowDown className="w-5 h-5 animate-bounce text-amber-700" />
              </div>
            )}
            {reachedBottom && (
              <label
                className={`flex items-start gap-3 cursor-pointer select-none py-3 px-3 my-2 rounded-lg border-2 transition-all ${
                  agreed
                    ? "border-green-500 bg-green-50"
                    : "border-green-500 bg-green-50/70 animate-pulse ring-4 ring-green-300/60 shadow-lg shadow-green-300/40"
                }`}
              >
                <Checkbox
                  checked={agreed}
                  onCheckedChange={(v) => setAgreed(v === true)}
                  className={`mt-0.5 h-5 w-5 border-2 border-green-600 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 ${
                    !agreed ? "ring-2 ring-green-400 ring-offset-2 ring-offset-green-50" : ""
                  }`}
                />
                <span className="text-sm text-slate-900 font-bold">
                  Li o informativo completo, entendi como funciona a Meta API do WhatsApp, seus requisitos, custos e regras, e concordo em prosseguir com o cadastro.
                </span>
              </label>
            )}
          </div>
        )}

        <DialogFooter className="px-6 py-4 border-t bg-white gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-2 border-slate-400 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900 font-semibold"
          >
            {requireConsent ? "Cancelar" : "Fechar"}
          </Button>
          {requireConsent && (
            <Button
              disabled={!canContinue}
              onClick={() => {
                onAccept?.();
                onOpenChange(false);
              }}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {acceptLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}