import React, { useState } from 'react';
import { Type, Image as ImageIcon, Video, FileText, Play, ExternalLink, Phone, MousePointer2, ChevronLeft, ChevronRight, CreditCard, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface TemplatePreviewProps {
  name: string;
  headerType: string;
  headerText?: string;
  headerUrl?: string;
  bodyText: string;
  footerText?: string;
  buttons?: any[];
  isCarousel?: boolean;
  carouselCards?: any[];
  isPix?: boolean;
  pixCode?: string;
}

const TemplatePreview: React.FC<TemplatePreviewProps> = ({
  name,
  headerType,
  headerText,
  headerUrl,
  bodyText,
  footerText,
  buttons = [],
  isCarousel = false,
  carouselCards = [],
  isPix = false,
  pixCode = ''
}) => {
  const { toast } = useToast();
  const [activeCard, setActiveCard] = useState(0);

  const copyPix = () => {
    if (pixCode) {
      navigator.clipboard.writeText(pixCode);
      toast({ title: "PIX copiado!", description: "Chave copiada para a área de transferência." });
    }
  };

  return (
    <div className="bg-[#e5ddd5] dark:bg-zinc-950 rounded-3xl p-6 shadow-2xl border-[12px] border-zinc-800 relative overflow-hidden max-w-[360px] mx-auto min-h-[580px]">
      <div className="absolute top-0 left-0 right-0 h-14 bg-[#075e54] flex items-center px-4 gap-3 z-20">
        <div className="w-8 h-8 rounded-full bg-zinc-200/20 flex items-center justify-center">
          <ImageIcon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <div className="text-white text-sm font-bold">WhatsApp Business</div>
          <div className="text-white/70 text-[10px]">online</div>
        </div>
      </div>
      
      <div className="mt-16 space-y-4 relative z-10">
        {!isCarousel ? (
          <div className="bg-white dark:bg-zinc-900 rounded-lg rounded-tl-none shadow-md overflow-hidden border border-zinc-200/50 dark:border-zinc-800">
            {headerType !== 'NONE' && (
              <div className="p-0 border-b border-zinc-100 dark:border-zinc-800">
                {headerType === 'TEXT' ? (
                  <div className="p-3 font-bold text-sm text-zinc-900 dark:text-zinc-100">
                    {headerText || "Título do Cabeçalho"}
                  </div>
                ) : (
                  <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center relative">
                    {headerUrl ? (
                      headerType === 'IMAGE' ? (
                        <img src={headerUrl} alt="Preview" className="w-full h-full object-cover" />
                      ) : headerType === 'VIDEO' ? (
                        <div className="w-full h-full relative">
                          <video src={headerUrl} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <Play className="w-10 h-10 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 p-4">
                          <FileText className="w-10 h-10 text-zinc-400" />
                          <span className="text-[10px] text-zinc-500 truncate max-w-[200px]">{headerUrl.split('/').pop()}</span>
                        </div>
                      )
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        {headerType === 'IMAGE' && <ImageIcon className="w-8 h-8 text-zinc-400" />}
                        {headerType === 'VIDEO' && <Video className="w-8 h-8 text-zinc-400" />}
                        {headerType === 'DOCUMENT' && <FileText className="w-8 h-8 text-zinc-400" />}
                        <span className="text-[10px] text-zinc-400">Sem mídia</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <div className="p-3">
              <div className="text-[13px] whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                {bodyText || "Mensagem..."}
              </div>
              {footerText && (
                <div className="mt-1 text-[11px] text-zinc-500 uppercase">
                  {footerText}
                </div>
              )}
            </div>
            
            {buttons.map((btn, idx) => (
              <div 
                key={idx} 
                className="flex items-center justify-center p-2 border-t border-zinc-100 dark:border-zinc-700 text-blue-500 text-sm font-medium"
              >
                {btn.type === 'URL' && <ExternalLink className="w-3 h-3 mr-2" />}
                {btn.type === 'PHONE' && <Phone className="w-3 h-3 mr-2" />}
                {btn.type === 'QUICK_REPLY' && <MousePointer2 className="w-3 h-3 mr-2" />}
                {btn.text || "Botão"}
              </div>
            ))}

            {isPix && (
              <div 
                className="flex items-center justify-center p-2 border-t border-amber-100 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-900/10 text-amber-600 text-xs font-bold cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/20"
                onClick={copyPix}
              >
                <Copy className="w-3 h-3 mr-2" /> Copiar PIX
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-white dark:bg-zinc-900 rounded-lg rounded-tl-none p-3 shadow-md border border-zinc-200/50 dark:border-zinc-800">
              <div className="text-[13px] text-zinc-800 dark:text-zinc-200">
                {bodyText || "Escolha uma das opções:"}
              </div>
            </div>

            <div className="relative group">
              <div className="flex gap-3 overflow-x-hidden">
                {carouselCards.map((card, idx) => (
                  <div 
                    key={idx} 
                    className={`min-w-[240px] bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800 transition-transform duration-300 ${idx === activeCard ? 'translate-x-0' : idx < activeCard ? '-translate-x-full hidden' : 'translate-x-full hidden'}`}
                    style={{ display: idx === activeCard ? 'block' : 'none' }}
                  >
                    <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 relative rounded-t-xl overflow-hidden">
                      {card.headerUrl ? (
                        card.headerType === 'IMAGE' ? (
                          <img src={card.headerUrl} className="w-full h-full object-cover" />
                        ) : (
                          <video src={card.headerUrl} className="w-full h-full object-cover" />
                        )
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          {card.headerType === 'IMAGE' ? <ImageIcon className="text-zinc-300" /> : <Video className="text-zinc-300" />}
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 line-clamp-3 min-h-[50px]">
                        {card.bodyText || "Descrição do item..."}
                      </div>
                    </div>
                    {card.buttons?.map((btn: any, bIdx: number) => (
                      <div key={bIdx} className="flex items-center justify-center p-2 border-t border-zinc-100 dark:border-zinc-800 text-blue-500 text-xs font-bold">
                        {btn.text || "Botão"}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {activeCard > 0 && (
                <button 
                  onClick={() => setActiveCard(activeCard - 1)}
                  className="absolute left-[-15px] top-1/2 -translate-y-1/2 bg-white dark:bg-zinc-800 rounded-full p-1 shadow-lg border z-20"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              {activeCard < carouselCards.length - 1 && (
                <button 
                  onClick={() => setActiveCard(activeCard + 1)}
                  className="absolute right-[-15px] top-1/2 -translate-y-1/2 bg-white dark:bg-zinc-800 rounded-full p-1 shadow-lg border z-20"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              <div className="flex justify-center gap-1 mt-2">
                {carouselCards.map((_, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === activeCard ? 'bg-primary' : 'bg-zinc-300'}`} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <span className="text-[10px] text-zinc-500">12:00</span>
        </div>
      </div>
    </div>
  );
};

export default TemplatePreview;
