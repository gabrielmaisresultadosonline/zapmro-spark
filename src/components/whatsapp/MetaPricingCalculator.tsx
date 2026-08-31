import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Info, ChevronDown } from "lucide-react";

type Category = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

// Preços aproximados cobrados pela Meta por conversa/mensagem (BRL)
const PRICING: Record<Category, { min: number; max: number; label: string }> = {
  MARKETING:      { min: 0.34, max: 0.36, label: 'Marketing' },
  UTILITY:        { min: 0.04, max: 0.04, label: 'Utilidade' },
  AUTHENTICATION: { min: 0.04, max: 0.04, label: 'Autenticação' },
};

interface MetaPricingCalculatorProps {
  defaultCategory?: Category;
  defaultQuantity?: number;
  compact?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

const fmt = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MetaPricingCalculator = ({
  defaultCategory = 'MARKETING',
  defaultQuantity = 100,
  compact = false,
  collapsible = false,
  defaultOpen = false,
}: MetaPricingCalculatorProps) => {
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [qty, setQty] = useState<number>(defaultQuantity);
  const [open, setOpen] = useState<boolean>(defaultOpen);

  const price = PRICING[category];
  const totalMin = price.min * qty;
  const totalMax = price.max * qty;
  const sameRange = price.min === price.max;

  return (
    <Card className="rounded-2xl border border-amber-200/40 dark:border-amber-900/30 bg-gradient-to-br from-amber-50/60 to-orange-50/40 dark:from-amber-900/10 dark:to-orange-900/10 shadow-sm">
      <CardHeader
        className={`${compact ? "py-3 px-4" : ""} ${collapsible ? "cursor-pointer select-none" : ""}`}
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm md:text-base flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <Calculator className="w-4 h-4" /> Calculadora de Custo Meta
          </CardTitle>
          {collapsible && (
            <ChevronDown
              className={`w-4 h-4 text-amber-700 dark:text-amber-300 transition-transform ${open ? "rotate-180" : ""}`}
            />
          )}
        </div>
        {!compact && (!collapsible || open) && (
          <CardDescription className="text-[11px] md:text-xs text-amber-700/80 dark:text-amber-300/70">
            Estime quanto a Meta vai cobrar antes de enviar templates ou disparos.
          </CardDescription>
        )}
      </CardHeader>
      {(!collapsible || open) && (
      <CardContent className={compact ? "px-4 pb-4 pt-0 space-y-3" : "space-y-4"}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-amber-800 dark:text-amber-200">Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger className="h-9 text-xs bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKETING">Marketing (~R$ 0,34–0,36)</SelectItem>
                <SelectItem value="UTILITY">Utilidade (~R$ 0,04)</SelectItem>
                <SelectItem value="AUTHENTICATION">Autenticação (~R$ 0,04)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-amber-800 dark:text-amber-200">Quantidade de envios</Label>
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(0, parseInt(e.target.value || '0', 10)))}
              className="h-9 text-xs bg-background"
            />
          </div>
        </div>

        <div className="rounded-xl bg-white/70 dark:bg-black/30 border border-amber-200/50 dark:border-amber-900/30 p-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold">
              Custo estimado ({price.label})
            </p>
            <p className="text-lg md:text-2xl font-bold text-amber-900 dark:text-amber-100">
              {sameRange ? fmt(totalMin) : `${fmt(totalMin)} – ${fmt(totalMax)}`}
            </p>
            <p className="text-[10px] text-amber-700/80 dark:text-amber-300/70">
              {qty} {qty === 1 ? 'mensagem' : 'mensagens'} × {sameRange ? fmt(price.min) : `${fmt(price.min)}–${fmt(price.max)}`}
            </p>
          </div>
        </div>

        <div className="text-[10px] leading-relaxed text-amber-800/80 dark:text-amber-200/70 flex gap-2">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            Valores aproximados cobrados pela Meta por conversa iniciada (Brasil).
            <b> Marketing:</b> R$ 0,34 a R$ 0,36 · <b>Utilidade:</b> ~R$ 0,04 · <b>Autenticação:</b> ~R$ 0,04 por mensagem.
            A Meta pode reclassificar a categoria do template ao aprovar, alterando o custo final.
          </span>
        </div>
      </CardContent>
      )}
    </Card>
  );
};

export default MetaPricingCalculator;