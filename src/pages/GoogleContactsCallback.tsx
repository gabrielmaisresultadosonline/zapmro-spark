import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Users, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const GoogleContactsCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    const processAuth = async () => {
      if (error) {
        setStatus("error");
        toast.error(`Erro na autenticação do Google: ${error}`);
        setTimeout(() => navigate("/crm"), 3000);
        return;
      }

       if (code) {
         // Force standard redirect URI to match what Google Console expects
         const redirectUri = "https://zapmro.com.br/google-callback";
          const { data, error: invokeError } = await supabase.functions.invoke('meta-whatsapp-crm', {
            body: { action: 'exchangeGoogleCode', code, redirectUri }
          });

          if (!invokeError && data?.success) {
            console.log("Sucesso ao trocar código, iniciando sincronização...");
            // Agora que a conta está salva, dispara a sincronização automática
            const { data: syncData, error: syncError } = await supabase.functions.invoke('meta-whatsapp-crm', {
              body: { action: 'syncGoogleContacts' }
            });
            console.log("Resultado da sincronização automática:", { syncData, syncError });
          }

        if (invokeError || !data?.success) {
          const errorMsg = invokeError?.message || data?.error || "Erro desconhecido";
          console.error("Erro detalhado ao trocar código Google:", {
            invokeError,
            data,
            code: code.substring(0, 10) + "...",
            redirectUri
          });
          setStatus("error");
          toast.error(`Erro ao sincronizar: ${errorMsg}`);
          setTimeout(() => navigate("/crm"), 5000);
          return;
        }

        localStorage.setItem("google_contacts_connected", "true");

        setStatus("success");
        toast.success("Google Contatos conectado com sucesso!");
        
        setTimeout(() => {
          navigate("/crm");
        }, 2000);
      } else {
        setStatus("error");
        toast.error("Nenhum código de autorização encontrado.");
        setTimeout(() => navigate("/crm"), 3000);
      }
    };

    processAuth();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-[#050508] flex items-center justify-center text-white p-4">
      <div className="max-w-md w-full text-center space-y-8 glass-card p-10 glow-border animate-slide-up">
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
          <div className="relative bg-secondary/50 rounded-full p-5 flex items-center justify-center border border-primary/30">
            <Users className="w-10 h-10 text-primary" />
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-2xl font-black tracking-tight">
            {status === "processing" && "Conectando Google Contatos..."}
            {status === "success" && "Conexão Estabelecida!"}
            {status === "error" && "Erro na Conexão"}
          </h1>
          
          <p className="text-gray-400 text-sm leading-relaxed">
            {status === "processing" && "Estamos finalizando a integração com sua conta Google para sincronizar seus contatos em tempo real."}
            {status === "success" && "Sua conta do Google Contatos foi vinculada. Redirecionando você de volta ao CRM..."}
            {status === "error" && "Não foi possível completar a conexão. Você será redirecionado para o CRM."}
          </p>
        </div>

        {status === "processing" && (
          <div className="flex justify-center pt-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {status === "success" && (
          <div className="flex justify-center pt-4">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center animate-scale-in">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GoogleContactsCallback;
