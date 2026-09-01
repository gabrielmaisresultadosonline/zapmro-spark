import React from 'react';
import { Check, CheckCheck, Link as LinkIcon, Copy, QrCode } from 'lucide-react';
import { FlowMedia } from './FlowMedia';

interface Props {
  nodeType: string;
  data: any;
}

/**
 * Renders a WhatsApp-style mobile mockup previewing how the flow node
 * will be delivered to the contact.
 */
export const WhatsAppFlowPreview: React.FC<Props> = ({ nodeType, data }) => {
  return (
    <div className="w-full flex justify-center">
      <div className="w-[300px] h-[600px] rounded-[36px] border-[10px] border-slate-900 bg-slate-900 shadow-2xl overflow-hidden flex flex-col relative">
        {/* Notch */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-900 rounded-full z-20" />

        {/* Header WhatsApp */}
        <div className="bg-[#075E54] text-white px-3 pt-6 pb-2 flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-full bg-emerald-300/50 flex items-center justify-center text-[10px] font-bold">C</div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold truncate">Cliente</p>
            <p className="text-[9px] text-emerald-100/80">online</p>
          </div>
        </div>

        {/* Chat area */}
        <div
          className="flex-1 overflow-y-auto p-2 space-y-2"
          style={{
            backgroundColor: '#ECE5DD',
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><circle cx='2' cy='2' r='1' fill='%23d9d0c1' opacity='0.5'/></svg>\")",
          }}
        >
          {renderMessage(nodeType, data)}
        </div>

        {/* Composer */}
        <div className="bg-[#F0F0F0] px-2 py-1.5 flex items-center gap-1.5 shrink-0">
          <div className="flex-1 bg-white rounded-full h-7 px-3 flex items-center text-[9px] text-slate-400">
            Mensagem
          </div>
          <div className="w-7 h-7 rounded-full bg-[#075E54] flex items-center justify-center text-white text-[10px]">🎙</div>
        </div>
      </div>
    </div>
  );
};

function Bubble({ children, tail = true }: { children: React.ReactNode; tail?: boolean }) {
  return (
    <div className="flex justify-start">
      <div
        className={`bg-white rounded-lg shadow-sm max-w-[85%] text-slate-800 text-[11px] leading-snug ${
          tail ? 'rounded-tl-none' : ''
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function Timestamp() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return (
    <div className="flex items-center justify-end gap-0.5 px-2 pb-1 text-[8px] text-slate-400">
      <span>{hh}:{mm}</span>
      <CheckCheck className="w-2.5 h-2.5 text-sky-500" />
    </div>
  );
}

function renderMessage(nodeType: string, data: any) {
  if (nodeType === 'copyText') {
    const label = data?.buttonLabel || 'Copiar';
    const isLink = data?.kind === 'link';
    return (
      <>
        <Bubble>
          <div className="px-2.5 pt-1.5 whitespace-pre-wrap break-words">
            {data?.text || <span className="text-slate-400 italic">Sem texto...</span>}
          </div>
          <Timestamp />
          {isLink && (
            <div className="border-t border-slate-200 px-2 py-1.5 text-center text-sky-600 font-medium text-[11px] flex items-center justify-center gap-1">
              <LinkIcon className="w-2.5 h-2.5" />
              {label}
            </div>
          )}
        </Bubble>
        {!isLink && (
          <Bubble tail={false}>
            <div className="px-2.5 py-1.5 font-mono text-[9px] break-all bg-slate-50 rounded">
              {data?.copyValue || 'conteúdo para copiar...'}
            </div>
            <Timestamp />
          </Bubble>
        )}
      </>
    );
  }

  if (nodeType === 'question') {
    const buttons: any[] = Array.isArray(data?.buttons) ? data.buttons : [];
    const hasMedia = !!(data?.imageUrl || data?.videoUrl);
    return (
      <Bubble>
        {hasMedia && (
          <div className="p-1">
            <FlowMedia
              kind={data.videoUrl ? 'video' : 'image'}
              url={data.videoUrl || data.imageUrl}
              className="w-full rounded-md aspect-video"
            />
          </div>
        )}
        <div className="px-2.5 pt-1.5 whitespace-pre-wrap break-words">
          {data?.text || <span className="text-slate-400 italic">Sem texto...</span>}
        </div>
        <Timestamp />
        {buttons.length > 0 && (
          <div className="border-t border-slate-200">
            {buttons.map((btn, i) => (
              <div
                key={btn.id || i}
                className="border-b last:border-b-0 border-slate-100 px-2 py-1.5 text-center text-sky-600 font-medium text-[11px] flex items-center justify-center gap-1"
              >
                {btn.url ? <LinkIcon className="w-2.5 h-2.5" /> : null}
                {btn.text || `Botão ${i + 1}`}
              </div>
            ))}
          </div>
        )}
      </Bubble>
    );
  }

  if (nodeType === 'pix') {
    const amount = data?.amount || '0,00';
    const desc = data?.description || 'Pagamento via PIX';
    return (
      <>
        <Bubble>
          <div className="px-2.5 py-1.5 whitespace-pre-wrap break-words">
            💳 <b>Cobrança PIX</b>
            {'\n'}Valor: <b>R$ {amount}</b>
            {'\n'}{desc}
          </div>
          <Timestamp />
        </Bubble>
        <Bubble tail={false}>
          <div className="p-2 flex flex-col items-center gap-1.5">
            <div className="w-24 h-24 bg-slate-900 rounded-md flex items-center justify-center">
              <QrCode className="w-16 h-16 text-white" />
            </div>
            <div className="text-[9px] text-slate-500">Pague com QR Code</div>
          </div>
          <Timestamp />
        </Bubble>
        <Bubble tail={false}>
          <div className="px-2.5 py-1.5 font-mono text-[9px] break-all bg-slate-50 rounded">
            00020126360014BR.GOV.BCB.PIX...{(data?.pixKey || 'chave').slice(0, 12)}...5204000053039865802BR
          </div>
          <div className="border-t border-slate-200 px-2 py-1.5 text-center text-sky-600 font-medium text-[11px] flex items-center justify-center gap-1">
            <Copy className="w-2.5 h-2.5" /> Copiar código
          </div>
        </Bubble>
      </>
    );
  }

  if (nodeType === 'mediaCarousel') {
    const cards: any[] = Array.isArray(data?.cards) ? data.cards : [];
    return (
      <>
        {data?.headerText && (
          <Bubble>
            <div className="px-2.5 py-1.5 whitespace-pre-wrap break-words">{data.headerText}</div>
            <Timestamp />
          </Bubble>
        )}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
          {cards.map((card, i) => (
            <div key={card.id || i} className="min-w-[180px] max-w-[180px] bg-white rounded-lg shadow-sm snap-center overflow-hidden">
              {card.mediaUrl ? (
                <FlowMedia
                  kind={card.mediaType === 'video' ? 'video' : 'image'}
                  url={card.mediaUrl}
                  className="w-full aspect-video"
                />
              ) : (
                <div className="w-full aspect-video bg-slate-200 flex items-center justify-center text-[9px] text-slate-500">
                  Sem mídia
                </div>
              )}
              {card.caption && (
                <div className="px-2 py-1.5 text-[10px] whitespace-pre-wrap break-words">{card.caption}</div>
              )}
              {(card.buttons || []).length > 0 && (
                <div className="border-t border-slate-100">
                  {(card.buttons || []).map((btn: any, bi: number) => (
                    <div
                      key={btn.id || bi}
                      className="border-b last:border-b-0 border-slate-100 px-2 py-1 text-center text-sky-600 font-medium text-[10px] flex items-center justify-center gap-1"
                    >
                      {btn.url ? <LinkIcon className="w-2.5 h-2.5" /> : null}
                      {btn.text || `Botão ${bi + 1}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <Bubble>
      <div className="px-2.5 py-1.5 italic text-slate-400">Sem preview disponível.</div>
    </Bubble>
  );
}

export default WhatsAppFlowPreview;