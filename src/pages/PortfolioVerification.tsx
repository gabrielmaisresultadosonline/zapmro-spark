import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, BadgeCheck, Check, AlertTriangle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FirstTutorialVideo from "@/components/sales/FirstTutorialVideo";

const PortfolioVerification = () => {
  const navigate = useNavigate();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyForm, setVerifyForm] = useState({
    empresa: "",
    nome: "",
    whatsapp: "",
    isBusiness: "" as "sim" | "nao" | "",
    over20: "" as "sim" | "nao" | "",
  });
  const canSubmitVerify =
    verifyForm.empresa.trim() &&
    verifyForm.nome.trim() &&
    verifyForm.whatsapp.trim() &&
    verifyForm.isBusiness === "sim" &&
    verifyForm.over20 === "sim";
  const submitVerify = () => {
    if (!canSubmitVerify) return;
    const msg =
      `Olá! Preciso verificar meu portfólio.\n\n` +
      `*Empresa:* ${verifyForm.empresa}\n` +
      `*Nome:* ${verifyForm.nome}\n` +
      `*WhatsApp:* ${verifyForm.whatsapp}\n` +
      `*WhatsApp Business instalado:* ${verifyForm.isBusiness}\n` +
      `*Mais de 20 dias de uso no Business:* ${verifyForm.over20}`;
    const url = `https://wa.me/555192835863?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
    setVerifyOpen(false);
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/vendas" className="bg-[#050508] p-2 rounded-xl">
            <Logo size="sm" />
          </Link>
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="rounded-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
          </Button>
        </div>
      </header>

      <section className="pt-28 pb-24 bg-gradient-to-br from-orange-50 via-white to-amber-50 border-b border-orange-100 min-h-screen">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <Badge className="bg-orange-100 text-orange-700 border-orange-200 mb-4 gap-1">
                <BadgeCheck className="w-4 h-4" /> Serviço exclusivo
              </Badge>
              <h1 className="text-3xl md:text-4xl font-bold mb-4 text-slate-900">
                Precisa verificar seu portfólio?
              </h1>
              <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                Nós verificamos seu portfólio na Meta e configuramos tudo para você usar o WhatsApp com a API Oficial — com <strong>1 mês de utilização incluso</strong>.
              </p>
            </div>

            <div className="max-w-2xl mx-auto mb-8">
              <FirstTutorialVideo
                headline="Você precisa estar verificado"
                subline="Assista o vídeo 01 — entenda por que a verificação da Meta é obrigatória antes de usar o sistema."
              />
            </div>

            <Card className="border-orange-200 shadow-xl overflow-hidden">
              <div className="grid md:grid-cols-2">
                <div className="p-8 bg-white">
                  <h2 className="text-xl font-bold text-slate-900 mb-4">O que está incluso</h2>
                  <ul className="space-y-3 text-slate-700">
                    <li className="flex gap-2"><Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" /> Verificação completa do seu portfólio Meta</li>
                    <li className="flex gap-2"><Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" /> Configuração da conta empresarial (WABA)</li>
                    <li className="flex gap-2"><Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" /> Conexão do número à API Oficial</li>
                    <li className="flex gap-2"><Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" /> <strong>1 mês incluso</strong> de utilização do sistema</li>
                  </ul>

                  <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-200 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800">
                      <strong>Atenção:</strong> Sem o portfólio verificado e configurado corretamente como empresa, <strong>não é possível usar o WhatsApp com API Oficial</strong>. Podemos fazer isso por você.
                    </p>
                  </div>
                </div>

                <div className="p-8 bg-gradient-to-br from-orange-500 to-amber-600 text-white flex flex-col justify-between">
                  <div>
                    <div className="text-sm uppercase tracking-wider opacity-90 mb-2">Investimento único</div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-5xl font-black">R$ 300</span>
                    </div>
                    <div className="text-white/90 mb-6">
                      ou <strong>12x de R$ 30</strong> no cartão
                    </div>
                    <div className="text-sm bg-white/15 rounded-lg p-3 mb-6">
                      Verificação do portfólio + <strong>1 mês de sistema incluso</strong>
                    </div>
                  </div>
                  <Button
                    onClick={() => setVerifyOpen(true)}
                    size="lg"
                    className="bg-white text-orange-700 hover:bg-orange-50 font-bold w-full"
                  >
                    Quero verificar meu portfólio <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </div>
            </Card>

            <div className="mt-10 text-center">
              <Button variant="outline" onClick={() => navigate(-1)} className="rounded-full">
                <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para /vendas
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Verificar portfólio Meta</DialogTitle>
            <DialogDescription>
              Preencha os dados abaixo. Ao enviar, abriremos o WhatsApp para continuarmos o atendimento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome da sua empresa *</Label>
              <Input
                value={verifyForm.empresa}
                onChange={(e) => setVerifyForm({ ...verifyForm, empresa: e.target.value })}
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Seu nome completo *</Label>
              <Input
                value={verifyForm.nome}
                onChange={(e) => setVerifyForm({ ...verifyForm, nome: e.target.value })}
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Número de WhatsApp *</Label>
              <Input
                value={verifyForm.whatsapp}
                onChange={(e) => setVerifyForm({ ...verifyForm, whatsapp: e.target.value })}
                placeholder="+55 (11) 90000-0000"
                maxLength={30}
              />
            </div>

            <div className="space-y-2">
              <Label>Este número está conectado no WhatsApp Business (app do celular)? *</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={verifyForm.isBusiness === "sim" ? "default" : "outline"}
                  onClick={() => setVerifyForm({ ...verifyForm, isBusiness: "sim" })}
                  className={verifyForm.isBusiness === "sim" ? "bg-green-600 hover:bg-green-700" : ""}
                >
                  Sim
                </Button>
                <Button
                  type="button"
                  variant={verifyForm.isBusiness === "nao" ? "default" : "outline"}
                  onClick={() => setVerifyForm({ ...verifyForm, isBusiness: "nao" })}
                  className={verifyForm.isBusiness === "nao" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
                >
                  Não
                </Button>
              </div>
              {verifyForm.isBusiness === "nao" && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  Precisa ser WhatsApp <strong>Business</strong>. Caso contrário, não conseguimos fazer a configuração correta.
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Seu número tem mais de 20 dias de uso instalado no Business? *</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={verifyForm.over20 === "sim" ? "default" : "outline"}
                  onClick={() => setVerifyForm({ ...verifyForm, over20: "sim" })}
                  className={verifyForm.over20 === "sim" ? "bg-green-600 hover:bg-green-700" : ""}
                >
                  Sim
                </Button>
                <Button
                  type="button"
                  variant={verifyForm.over20 === "nao" ? "default" : "outline"}
                  onClick={() => setVerifyForm({ ...verifyForm, over20: "nao" })}
                  className={verifyForm.over20 === "nao" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
                >
                  Não
                </Button>
              </div>
              {verifyForm.over20 === "nao" && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  É necessário ter no mínimo <strong>20 dias de uso no Business App</strong> para conseguir utilizar na API Oficial.
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyOpen(false)}>Cancelar</Button>
            <Button
              onClick={submitVerify}
              disabled={!canSubmitVerify}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <MessageCircle className="w-4 h-4 mr-2" /> Enviar via WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PortfolioVerification;