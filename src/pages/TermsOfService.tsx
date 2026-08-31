import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const TermsOfService = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white text-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Button 
          variant="ghost" 
          className="mb-8 hover:bg-gray-100"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        <h1 className="text-3xl font-bold mb-8">Termos de Serviço</h1>
        
        <div className="space-y-6 text-base leading-relaxed text-gray-700">
          <section>
            <p>
              Bem-vindo ao ZapMRO. Ao utilizar nossos serviços, você concorda com os seguintes termos. Por favor, leia-os atentamente.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Aceitação dos Termos</h2>
            <p>
              Ao acessar e usar a plataforma ZapMRO, você aceita e concorda em cumprir estes Termos de Serviço e todas as leis e regulamentos aplicáveis. Se você não concordar com algum destes termos, está proibido de usar ou acessar este site.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Uso da Licença e Restrições</h2>
            <p>
              É concedida permissão para acessar a plataforma ZapMRO para uso comercial interno relacionado à gestão de clientes e comunicação via WhatsApp. Você não deve:
            </p>
            <ul className="list-disc ml-6 mt-2 space-y-2">
              <li>Usar o serviço para qualquer finalidade ilegal ou não autorizada;</li>
              <li>Violar as políticas da API Cloud do WhatsApp da Meta;</li>
              <li>Tentar descompilar ou fazer engenharia reversa de qualquer software contido no ZapMRO;</li>
              <li>Enviar mensagens em massa (spam) que violem as normas de proteção ao consumidor.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Integração com APIs de Terceiros</h2>
            <p>
              Nossos serviços dependem de integrações com terceiros, especificamente a Meta (WhatsApp Business API). O uso contínuo de nossos serviços está sujeito ao cumprimento dos termos desses provedores. Não nos responsabilizamos por suspensões de contas causadas por mau uso das diretrizes da Meta pelo usuário final.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Responsabilidade</h2>
            <p>
              O ZapMRO fornece a ferramenta de CRM "como está". Não garantimos que o serviço será ininterrupto ou livre de erros. Em nenhum caso o ZapMRO ou seus fornecedores serão responsáveis por quaisquer danos decorrentes do uso ou da incapacidade de usar os serviços.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Privacidade e Proteção de Dados</h2>
            <p>
              O uso do serviço também é regido pela nossa Política de Privacidade, que detalha como tratamos os dados coletados durante o uso da plataforma e da API do WhatsApp.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Modificações dos Termos</h2>
            <p>
              O ZapMRO pode revisar estes termos de serviço a qualquer momento, sem aviso prévio. Ao usar este site, você concorda em ficar vinculado à versão atual desses termos de serviço.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Contato</h2>
            <p>
              Para questões relacionadas a estes termos, entre em contato via zapmro.com.br.
            </p>
          </section>

          <p className="text-sm text-gray-500 mt-12">
            Última atualização: Maio de 2026
          </p>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
