 import React from "react";
 import { Button } from "@/components/ui/button";
 import { ArrowLeft } from "lucide-react";
 import { useNavigate } from "react-router-dom";

 const PrivacyPolicy = () => {
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

         <h1 className="text-3xl font-bold mb-8">Política de Privacidade</h1>
         
         <div className="space-y-6 text-base leading-relaxed text-gray-700">
           <section>
             <p>
               A ZapMRO valoriza a sua privacidade. Esta Política de Privacidade descreve como coletamos, usamos e protegemos suas informações ao utilizar nossos serviços e nossa integração com a API Cloud do WhatsApp da Meta.
             </p>
           </section>

           <section>
             <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Coleta de Informações</h2>
             <p>
               Coletamos informações necessárias para a prestação de nossos serviços de CRM e automação de mensagens, incluindo:
             </p>
             <ul className="list-disc ml-6 mt-2 space-y-2">
               <li>Dados de contato (nome, número de telefone);</li>
               <li>Histórico de mensagens trocadas através da plataforma para fins de gestão de atendimento;</li>
               <li>Tokens de acesso e credenciais fornecidas para integração com APIs oficiais.</li>
             </ul>
           </section>

           <section>
             <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Uso da API Cloud do WhatsApp (Meta)</h2>
             <p>
               Nosso aplicativo utiliza as APIs oficiais da Meta para enviar e receber mensagens. Ao utilizar nossa integração:
             </p>
             <ul className="list-disc ml-6 mt-2 space-y-2">
               <li>Respeitamos todas as políticas de desenvolvedor e termos de serviço da Meta;</li>
               <li>Não utilizamos dados para finalidades de spam ou marketing não solicitado;</li>
               <li>Garantimos que o processamento de áudios e arquivos seja feito de forma segura.</li>
             </ul>
           </section>

           <section>
             <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Proteção de Dados</h2>
             <p>
               Implementamos medidas de segurança técnicas e organizacionais para proteger seus dados contra acesso não autorizado, alteração ou destruição. Seus dados de CRM são armazenados de forma segura e acessíveis apenas por usuários autorizados da sua conta.
             </p>
           </section>

           <section>
             <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Seus Direitos</h2>
             <p>
               Você tem o direito de acessar, corrigir ou excluir seus dados pessoais a qualquer momento através das configurações da plataforma ou entrando em contato com nosso suporte.
             </p>
           </section>

           <section>
             <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Contato</h2>
             <p>
               Se tiver dúvidas sobre esta política, entre em contato através do nosso site oficial: zapmro.com.br.
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

 export default PrivacyPolicy;