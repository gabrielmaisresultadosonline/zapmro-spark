import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import SalesTutorials from "@/components/sales/SalesTutorials";

const SalesTutoriais = () => {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/vendas" className="bg-[#050508] p-2 rounded-xl">
            <Logo size="sm" />
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
            <Link to="/vendas" className="hover:text-green-600 transition-colors">Voltar para /vendas</Link>
            <Link to="/vendas#precos" className="hover:text-green-600 transition-colors">Preços</Link>
          </nav>
          <Link to="/crm/login">
            <Button className="bg-green-600 hover:bg-green-700 text-white rounded-full px-6">
              Entrar no CRM
            </Button>
          </Link>
        </div>
      </header>

      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          <div className="mb-6">
            <Link to="/vendas" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-green-600">
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Link>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-4 md:p-8">
            <SalesTutorials />
          </div>
        </div>
      </main>

      <footer className="py-8 border-t border-slate-100">
        <div className="container mx-auto px-4 text-center text-sm text-slate-500">
          © 2026 I.A MRO. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
};

export default SalesTutoriais;