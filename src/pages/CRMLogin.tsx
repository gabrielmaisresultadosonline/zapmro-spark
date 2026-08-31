 import { useState, useEffect } from 'react';
 import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/Logo';
import { Lock, Mail, AlertCircle, User, Phone, BookOpen, ArrowLeft, Gift } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import MetaApiTermsDialog from '@/components/MetaApiTermsDialog';
import FirstTutorialVideo from '@/components/sales/FirstTutorialVideo';

const LOGIN_TIMEOUT_MS = 60000;

type SignInResult = Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;

const isTransientNetworkError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  // Incluímos "timeout" como erro transiente para permitir o retry automático
  return message.includes('failed to fetch') || 
         message.includes('network') || 
         message.includes('fetch') ||
         message.includes('timeout') ||
         message.includes('demorou demais');
};

const signInWithTimeout = async (email: string, password: string): Promise<SignInResult> => {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error('timeout: A conexão com o servidor demorou demais. Verifique sua internet e tente novamente.'));
    }, LOGIN_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      supabase.auth.signInWithPassword({ email, password }).then(res => {
        console.log("Supabase respondeu login:", res.error ? res.error.message : "Sucesso");
        return res;
      }),
      timeout,
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
};

const CRMLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
   const [isRegistering, setIsRegistering] = useState(false);
   const [rememberMe, setRememberMe] = useState(true);
   const [termsOpen, setTermsOpen] = useState(false);
   const [infoOpen, setInfoOpen] = useState(false);
   const [termsAccepted, setTermsAccepted] = useState(false);
   const location = useLocation();
   useEffect(() => {
     const params = new URLSearchParams(location.search);
     if (params.get('mode') === 'register') {
       setIsRegistering(true);
     }
     // Prefill remembered email
     try {
       const saved = localStorage.getItem('crm_remember_email');
       if (saved) {
         setEmail(saved);
         setRememberMe(true);
       }
     } catch {}
   }, [location]);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Block signup until user reads and accepts the Meta API terms
    if (isRegistering && !termsAccepted) {
      setTermsOpen(true);
      return;
    }

    setIsLoading(true);

    try {
      if (isRegistering) {
        // Sign up with Supabase
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              whatsapp_number: whatsapp
            }
          }
        });
        
        if (signUpError) throw signUpError;
        
         if (authData.user) {
           // Check if there are any profiles yet
           const { count } = await supabase
             .from('crm_profiles')
             .select('*', { count: 'exact', head: true });
 
           // The very first registered user becomes super_admin
           const role = (count === 0) ? 'super_admin' : 'user';

             // Cria perfil sem iniciar o teste — os 2 dias começam a contar
             // apenas quando o usuário conectar o WhatsApp no /crm.
             const { error: profileError } = await supabase
              .from('crm_profiles')
              .insert({
                user_id: authData.user.id,
                full_name: fullName,
                whatsapp_number: whatsapp,
                role: role,
                trial_ends_at: null,
              });
           
           if (profileError) console.error("Error creating profile:", profileError);
           
           if (role === 'super_admin') {
             toast({
               title: "Perfil Administrativo Criado!",
               description: "Você foi definido como administrador central por ser o primeiro cadastro.",
             });
            } else {
              toast({
                title: "🎁 2 dias de teste grátis ativados!",
                description: "Conecte seu WhatsApp no CRM para ativar os 2 dias de teste grátis.",
              });
           }
         }

        toast({
          title: "Cadastro realizado!",
          description: "Verifique seu e-mail para confirmar a conta (se habilitado).",
        });
        
        // Auto-switch to login after registration success
        setIsRegistering(false);
        setTermsAccepted(false);
      } else {
        const normalizedEmail = email.trim();
        let signInResult: SignInResult;

        try {
          console.log("Iniciando tentativa de login para:", normalizedEmail);
          signInResult = await signInWithTimeout(normalizedEmail, password);
        } catch (firstError) {
          console.error("Erro na primeira tentativa de login:", firstError);
          // Se for erro de rede ou timeout e o navegador estiver online, tentamos de novo 1 vez
          if (!isTransientNetworkError(firstError)) throw firstError;

          console.log("Falha transiente detectada, tentando novamente em 2s...");
          await new Promise<void>((resolve) => window.setTimeout(resolve, 2000));
          signInResult = await signInWithTimeout(normalizedEmail, password);
        }

        const { data: authData, error: signInError } = signInResult;
        
        if (signInError) throw signInError;
        
        if (authData.session && authData.user) {
          // Garante que a sessão está ativa no cliente antes de prosseguir
          const { error: sessionError } = await supabase.auth.setSession(authData.session);
          if (sessionError) {
             console.error("Erro ao persistir sessão:", sessionError);
             throw sessionError;
          }
          // Persist or clear remembered email
          try {
            if (rememberMe) {
              localStorage.setItem('crm_remember_email', email.trim());
            } else {
              localStorage.removeItem('crm_remember_email');
            }
          } catch {}

          // Log access (opcional, não bloqueante)
          supabase.from('crm_access_logs').insert({
            user_id: authData.user.id,
            user_agent: navigator.userAgent
          }).then();
          
          // O login já devolve uma sessão válida. A consulta de perfil não pode
          // manter o botão em "Processando" caso o backend esteja momentaneamente lento.
          const profileResult = await Promise.race([
            supabase
              .from('crm_profiles')
              .select('role')
              .eq('user_id', authData.user.id)
              .maybeSingle(),
            new Promise<{ data: null }>((resolve) => {
              window.setTimeout(() => resolve({ data: null }), 1000); // Reduzido para 1s
            }),
          ]).catch(() => ({ data: null }));
          
          const profile = profileResult?.data;

          toast({
            title: "Login realizado!",
            description: "Bem-vindo ao CRM Meta SaaS",
          });

          // Redirect to home if no specific role or to the correct dashboard
          const targetPath = profile?.role === 'super_admin' ? '/admincentral' : '/crm';
          
          console.log("Login OK, redirecionando para:", targetPath);
          
          // Fallback final: se replace falhar após 1s, tentamos location.href puro
          const fallbackTimeout = window.setTimeout(() => {
            console.log("Fallback de redirecionamento ativado para:", targetPath);
            window.location.href = targetPath;
          }, 1000);

          try {
            window.location.replace(targetPath);
          } catch (e) {
            window.location.href = targetPath;
          }
          return;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ocorreu um erro';
      setError(
        isTransientNetworkError(err)
          ? 'Não foi possível conectar ao servidor. Isso geralmente ocorre por instabilidade momentânea ou bloqueio de rede (CORS/VPN). Tente novamente em instantes.'
          : message
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Continues the signup automatically right after the user accepts the terms.
  async function runSignupAfterConsent() {
    setTermsAccepted(true);
    // submit the form programmatically
    setTimeout(() => {
      const form = document.getElementById('crm-auth-form') as HTMLFormElement | null;
      form?.requestSubmit();
    }, 50);
  }

  return (
     <div className="min-h-screen bg-[#F0FDF4] flex items-center justify-center p-4">
       <div className="bg-white rounded-3xl shadow-xl shadow-green-900/5 p-8 max-w-md w-full animate-slide-up border border-green-100">
         <button
           type="button"
           onClick={() => navigate('/vendas')}
           className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 hover:text-green-900 transition-colors"
         >
           <ArrowLeft className="w-4 h-4" />
           Voltar para /vendas
         </button>
         <div className="flex flex-col items-center mb-8">
           <div className="bg-[#050508] p-5 rounded-3xl mb-4 border border-white/10 shadow-2xl">
             <Logo size="md" />
           </div>
           <h1 className="text-3xl font-display font-black mt-2 text-[#166534] tracking-tight text-center">CRM Meta SaaS</h1>
           <p className="text-green-600/70 font-medium text-sm text-center">Gestão Profissional de WhatsApp</p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-100 to-green-100 border border-green-200 text-green-800 text-sm font-bold shadow-sm">
            <Gift className="w-4 h-4 text-amber-600" />
            Inicie grátis 2 dias — cadastre-se ou faça login
          </div>
         </div>

         <form id="crm-auth-form" onSubmit={handleSubmit} className="space-y-5">
           {error && (
             <div className="p-4 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2 text-red-600 text-sm font-medium">
               <AlertCircle className="w-4 h-4 shrink-0" />
               {error}
             </div>
           )}

          {isRegistering && (
            <>
               <FirstTutorialVideo
                 headline="Você precisa estar verificado"
                 subline="Assista o vídeo 01 antes de cadastrar — ele explica a verificação obrigatória da Meta."
               />
               <button
                 type="button"
                 onClick={() => setInfoOpen(true)}
                 className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 hover:from-amber-600 hover:via-orange-600 hover:to-red-600 text-white font-bold shadow-lg shadow-orange-200 transition-all active:scale-95"
               >
                 <BookOpen className="w-4 h-4" />
                 Quer usar? Leia antes como funciona
               </button>
              <div className="space-y-2">
                 <Label htmlFor="fullName" className="flex items-center gap-2 text-green-800 font-semibold text-xs uppercase tracking-wider">
                   <User className="w-3.5 h-3.5" />
                   Nome Completo
                 </Label>
                 <Input
                   id="fullName"
                   value={fullName}
                   onChange={(e) => setFullName(e.target.value)}
                   placeholder="Seu nome completo"
                    className="bg-green-50/50 border-green-100 focus:border-green-400 focus:ring-green-400 h-12 rounded-xl text-black"
                   required={isRegistering}
                 />
              </div>

              <div className="space-y-2">
                 <Label htmlFor="whatsapp" className="flex items-center gap-2 text-green-800 font-semibold text-xs uppercase tracking-wider">
                   <Phone className="w-3.5 h-3.5" />
                   WhatsApp
                 </Label>
                 <Input
                   id="whatsapp"
                   value={whatsapp}
                   onChange={(e) => setWhatsapp(e.target.value)}
                   placeholder="Ex: 5551999999999"
                    className="bg-green-50/50 border-green-100 focus:border-green-400 focus:ring-green-400 h-12 rounded-xl text-black"
                   required={isRegistering}
                 />
              </div>
            </>
          )}

          <div className="space-y-2">
             <Label htmlFor="email" className="flex items-center gap-2 text-green-800 font-semibold text-xs uppercase tracking-wider">
               <Mail className="w-3.5 h-3.5" />
               Email
             </Label>
             <Input
               id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Digite seu email"
                 className="bg-green-50/50 border-green-100 focus:border-green-400 focus:ring-green-400 h-12 rounded-xl text-black"
                required
                autoComplete="email"
             />
          </div>

          <div className="space-y-2">
             <Label htmlFor="password" className="flex items-center gap-2 text-green-800 font-semibold text-xs uppercase tracking-wider">
               <Lock className="w-3.5 h-3.5" />
               Senha
             </Label>
             <Input
               id="password"
               type="password"
               value={password}
               onChange={(e) => setPassword(e.target.value)}
               placeholder="Digite sua senha"
                className="bg-green-50/50 border-green-100 focus:border-green-400 focus:ring-green-400 h-12 rounded-xl text-black"
               required
             />
          </div>

          <Button
            type="submit"
             size="lg"
             className="w-full cursor-pointer bg-[#22C55E] hover:bg-[#16A34A] text-white h-12 rounded-xl font-bold text-base shadow-lg shadow-green-200 transition-all active:scale-95"
            disabled={isLoading}
          >
            {isLoading ? 'Processando...' : isRegistering ? 'Criar Minha Conta' : 'Entrar no CRM'}
          </Button>

           {isRegistering && (
             <p className="text-[11px] text-center text-slate-500 leading-relaxed">
               Ao prosseguir, será exibido o informativo sobre a Meta API do WhatsApp. Você precisa ler até o final e confirmar a leitura para concluir o cadastro.
             </p>
           )}

          {!isRegistering && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                id="rememberMe"
                checked={rememberMe}
                onCheckedChange={(v) => setRememberMe(v === true)}
                className="border-green-300 data-[state=checked]:bg-[#22C55E] data-[state=checked]:border-[#22C55E]"
              />
              <span className="text-sm text-green-800 font-medium">
                Manter conectado e memorizar acesso
              </span>
            </label>
          )}
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsRegistering(!isRegistering)}
             className="text-sm text-[#16A34A] hover:text-[#15803D] font-bold transition-colors"
          >
            {isRegistering ? 'Já tem uma conta? Entre aqui' : 'Não tem uma conta? Cadastre-se agora'}
          </button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
           Plataforma Segura & Criptografada
        </p>
      </div>

      {/* Mandatory terms gate before signup */}
      <MetaApiTermsDialog
        open={termsOpen}
        onOpenChange={setTermsOpen}
        requireConsent
        onAccept={runSignupAfterConsent}
        acceptLabel="Li, concordo e quero cadastrar"
      />

      {/* Informational popup (read-only) */}
      <MetaApiTermsDialog
        open={infoOpen}
        onOpenChange={setInfoOpen}
      />
    </div>
  );
};

export default CRMLogin;
