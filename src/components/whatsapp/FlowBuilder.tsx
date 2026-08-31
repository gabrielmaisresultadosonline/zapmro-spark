import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Plus, Trash2, GripVertical, MessageSquare, Image, Mic, Video,
  Clock, Type, MousePointer, Loader2, ChevronDown, ChevronUp,
  Zap, PauseCircle, Play, Save, ArrowRight, Settings2, ToggleLeft, ToggleRight,
  Upload, X, Square, MicOff
} from 'lucide-react';
import { Bell } from 'lucide-react';

interface FlowStep {
  id?: string;
  step_order: number;
  step_type: 'text' | 'image' | 'audio' | 'video' | 'buttons' | 'wait_reply';
  content?: string;
  media_url?: string;
  delay_seconds: number;
  simulate_typing: boolean;
  typing_duration_ms: number;
  wait_for_reply: boolean;
  wait_timeout_seconds: number;
  button_text?: string;
  button_options: string[];
  button_actions?: Array<{
    action_type: 'text' | 'audio' | 'image' | 'video' | 'flow' | 'continue';
    content?: string;
    media_url?: string;
    flow_id?: string;
  }>;
  wait_indefinitely?: boolean;
  followup_enabled?: boolean;
  followup_delay_seconds?: number;
  followup_type?: 'text' | 'audio' | 'image' | 'video' | 'flow';
  followup_content?: string;
  followup_media_url?: string;
  followup_flow_id?: string;
}

interface Flow {
  id?: string;
  name: string;
  description?: string;
  trigger_type: 'manual' | 'keyword' | 'first_message';
  trigger_keywords: string[];
  trigger_on_first_message: boolean;
  trigger_specific_text?: string;
  is_active: boolean;
  steps: FlowStep[];
}

interface FlowBuilderProps {
  callProxy: (action: string, data?: Record<string, unknown>) => Promise<any>;
  onFlowsChange?: () => void;
}

const getPreferredAudioMimeType = (): string => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return 'audio/webm';
  }

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];

  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || 'audio/webm';
};

const getAudioExtensionFromMimeType = (mimeType: string): string => {
  const lower = (mimeType || '').toLowerCase();
  if (lower.includes('ogg') || lower.includes('opus')) return 'ogg';
  if (lower.includes('mp4') || lower.includes('m4a')) return 'm4a';
  if (lower.includes('wav')) return 'wav';
  return 'webm';
};

const STEP_TYPES = [
  { value: 'text', label: 'Texto', icon: Type, color: '#00a884' },
  { value: 'image', label: 'Imagem', icon: Image, color: '#7c5cfc' },
  { value: 'audio', label: 'Áudio', icon: Mic, color: '#e67e22' },
  { value: 'video', label: 'Vídeo', icon: Video, color: '#e74c3c' },
  { value: 'buttons', label: 'Botões', icon: MousePointer, color: '#3498db' },
  { value: 'wait_reply', label: 'Aguardar Resposta', icon: PauseCircle, color: '#f39c12' },
];

const emptyStep = (): FlowStep => ({
  step_order: 0,
  step_type: 'text',
  content: '',
  delay_seconds: 2,
  simulate_typing: true,
  typing_duration_ms: 3000,
  wait_for_reply: false,
  wait_timeout_seconds: 300,
  button_options: [],
});

export default function FlowBuilder({ callProxy, onFlowsChange }: FlowBuilderProps) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [newKeyword, setNewKeyword] = useState('');
  const [uploadingStep, setUploadingStep] = useState<number | null>(null);
  const [recordingStep, setRecordingStep] = useState<number | null>(null);
  const [recordedPreview, setRecordedPreview] = useState<{ stepIndex: number; url: string; blob: Blob; mimeType: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeFileStep, setActiveFileStep] = useState<number | null>(null);

  const uploadMediaFile = async (file: File, stepIndex: number, field: 'media_url' | 'followup_media_url' = 'media_url') => {
    // Validação de tamanho para vídeo (limite do WhatsApp: 16MB)
    if (file.type.startsWith('video/') && file.size > 16 * 1024 * 1024) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      toast({
        title: 'Vídeo muito grande',
        description: `Seu vídeo tem ${sizeMB}MB. O WhatsApp aceita no máximo 16MB. Use o botão "Converter vídeo" para comprimir antes de subir.`,
        variant: 'destructive',
      });
      setUploadingStep(null);
      return;
    }
    setUploadingStep(stepIndex);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `whatsapp/flow_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error } = await supabase.storage.from('assets').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(data.path);
      if (field === 'followup_media_url') {
        updateStep(stepIndex, { followup_media_url: urlData.publicUrl });
      } else {
        updateStep(stepIndex, { media_url: urlData.publicUrl });
      }
      toast({ title: 'Arquivo enviado com sucesso!' });
    } catch (e: any) {
      toast({ title: 'Erro ao enviar arquivo', description: e.message, variant: 'destructive' });
    } finally {
      setUploadingStep(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeFileStep !== null) {
      uploadMediaFile(file, activeFileStep);
    }
    e.target.value = '';
    setActiveFileStep(null);
  };

  const startRecording = async (stepIndex: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const selectedMimeType = getPreferredAudioMimeType();
      const recorder = new MediaRecorder(stream, selectedMimeType ? { mimeType: selectedMimeType } : undefined);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const resolvedMimeType = recorder.mimeType || audioChunksRef.current[0]?.type || selectedMimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: resolvedMimeType });
        const url = URL.createObjectURL(blob);
        setRecordedPreview({ stepIndex, url, blob, mimeType: resolvedMimeType });
        setRecordingStep(null);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingStep(stepIndex);
    } catch {
      toast({ title: 'Erro ao acessar microfone', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const saveRecordedAudio = async () => {
    if (!recordedPreview) return;
    setUploadingStep(recordedPreview.stepIndex);
    try {
      const ext = getAudioExtensionFromMimeType(recordedPreview.mimeType);
      const path = `whatsapp/flow_audio_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from('assets').upload(path, recordedPreview.blob, {
        contentType: recordedPreview.mimeType || undefined,
      });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(data.path);
      updateStep(recordedPreview.stepIndex, { media_url: urlData.publicUrl });
      toast({ title: 'Áudio salvo com sucesso!' });
    } catch (e: any) {
      toast({ title: 'Erro ao salvar áudio', description: e.message, variant: 'destructive' });
    } finally {
      setUploadingStep(null);
      URL.revokeObjectURL(recordedPreview.url);
      setRecordedPreview(null);
    }
  };

  const cancelRecording = () => {
    if (recordedPreview) {
      URL.revokeObjectURL(recordedPreview.url);
      setRecordedPreview(null);
    }
  };

  const loadFlows = async () => {
    setLoading(true);
    try {
      const result = await callProxy('get-flows');
      setFlows(Array.isArray(result.flows) ? result.flows : []);
    } catch (e) {
      console.error('Error loading flows:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFlows(); }, []);

  const createNewFlow = () => {
    const flow: Flow = {
      name: 'Novo Fluxo',
      trigger_type: 'manual',
      trigger_keywords: [],
      trigger_on_first_message: false,
      is_active: true,
      steps: [emptyStep()],
    };
    setSelectedFlow(flow);
    setExpandedStep(0);
  };

  const saveFlow = async () => {
    if (!selectedFlow) return;
    if (!selectedFlow.name.trim()) {
      toast({ title: 'Nome do fluxo é obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await callProxy('save-flow', {
        flow: {
          id: selectedFlow.id,
          name: selectedFlow.name,
          description: selectedFlow.description,
          trigger_type: selectedFlow.trigger_type,
          trigger_keywords: selectedFlow.trigger_keywords,
          trigger_on_first_message: selectedFlow.trigger_on_first_message,
          trigger_specific_text: selectedFlow.trigger_specific_text,
          is_active: selectedFlow.is_active,
        },
        steps: selectedFlow.steps.map((s, i) => ({ ...s, step_order: i })),
      });
      toast({ title: 'Fluxo salvo com sucesso!' });
      await loadFlows();
      onFlowsChange?.();
    } catch (e) {
      toast({ title: 'Erro ao salvar fluxo', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteFlow = async (flowId: string) => {
    try {
      await callProxy('delete-flow', { flowId });
      toast({ title: 'Fluxo removido!' });
      if (selectedFlow?.id === flowId) setSelectedFlow(null);
      await loadFlows();
      onFlowsChange?.();
    } catch {
      toast({ title: 'Erro ao remover', variant: 'destructive' });
    }
  };

  const addStep = (type: FlowStep['step_type']) => {
    if (!selectedFlow) return;
    const step = { ...emptyStep(), step_type: type, step_order: selectedFlow.steps.length };
    if (type === 'wait_reply') {
      step.wait_for_reply = true;
      step.simulate_typing = false;
    }
    const updated = { ...selectedFlow, steps: [...selectedFlow.steps, step] };
    setSelectedFlow(updated);
    setExpandedStep(updated.steps.length - 1);
  };

  const removeStep = (index: number) => {
    if (!selectedFlow) return;
    const steps = selectedFlow.steps.filter((_, i) => i !== index);
    setSelectedFlow({ ...selectedFlow, steps });
    setExpandedStep(null);
  };

  const updateStep = (index: number, updates: Partial<FlowStep>) => {
    if (!selectedFlow) return;
    const steps = [...selectedFlow.steps];
    steps[index] = { ...steps[index], ...updates };
    setSelectedFlow({ ...selectedFlow, steps });
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (!selectedFlow) return;
    const steps = [...selectedFlow.steps];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= steps.length) return;
    [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];
    setSelectedFlow({ ...selectedFlow, steps });
    setExpandedStep(newIndex);
  };

  const addKeyword = () => {
    if (!selectedFlow || !newKeyword.trim()) return;
    setSelectedFlow({
      ...selectedFlow,
      trigger_keywords: [...selectedFlow.trigger_keywords, newKeyword.trim()],
    });
    setNewKeyword('');
  };

  const removeKeyword = (index: number) => {
    if (!selectedFlow) return;
    setSelectedFlow({
      ...selectedFlow,
      trigger_keywords: selectedFlow.trigger_keywords.filter((_, i) => i !== index),
    });
  };

  const addButtonOption = (stepIndex: number) => {
    if (!selectedFlow) return;
    const step = selectedFlow.steps[stepIndex];
    updateStep(stepIndex, { button_options: [...step.button_options, ''] });
  };

  const updateButtonOption = (stepIndex: number, optIndex: number, value: string) => {
    if (!selectedFlow) return;
    const opts = [...selectedFlow.steps[stepIndex].button_options];
    opts[optIndex] = value;
    updateStep(stepIndex, { button_options: opts });
  };

  const removeButtonOption = (stepIndex: number, optIndex: number) => {
    if (!selectedFlow) return;
    const opts = selectedFlow.steps[stepIndex].button_options.filter((_, i) => i !== optIndex);
    const actions = (selectedFlow.steps[stepIndex].button_actions || []).filter((_, i) => i !== optIndex);
    updateStep(stepIndex, { button_options: opts, button_actions: actions });
  };

  if (selectedFlow) {
    return (
      <div className="h-full flex flex-col bg-[#111b21]">
        {/* Hidden file input for media uploads */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/ogg,audio/mp3,audio/wav,video/mp4,video/webm"
          onChange={handleFileSelect}
        />
        {/* Header */}
        <div className="bg-[#202c33] px-4 py-3 flex items-center justify-between border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setSelectedFlow(null)} className="text-white/60 hover:text-white hover:bg-white/10">
              ← Voltar
            </Button>
            <Zap className="w-5 h-5 text-[#00a884]" />
            <span className="text-white font-semibold text-sm">Editor de Fluxo</span>
          </div>
          <Button onClick={saveFlow} disabled={saving} className="bg-[#00a884] hover:bg-[#00a884]/80 text-white text-sm h-9">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Salvar
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4 max-w-3xl mx-auto">
            {/* Flow Info */}
            <div className="bg-[#202c33] rounded-xl p-4 space-y-3 border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <Settings2 className="w-4 h-4 text-[#00a884]" />
                <span className="text-white/80 text-sm font-semibold">Configurações do Fluxo</span>
              </div>
              <Input
                value={selectedFlow.name}
                onChange={(e) => setSelectedFlow({ ...selectedFlow, name: e.target.value })}
                placeholder="Nome do fluxo"
                className="bg-[#2a3942] border-white/10 text-white placeholder:text-white/30"
              />
              <Textarea
                value={selectedFlow.description || ''}
                onChange={(e) => setSelectedFlow({ ...selectedFlow, description: e.target.value })}
                placeholder="Descrição (opcional)"
                className="bg-[#2a3942] border-white/10 text-white placeholder:text-white/30 resize-none"
                rows={2}
              />

              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">Ativo</span>
                <button onClick={() => setSelectedFlow({ ...selectedFlow, is_active: !selectedFlow.is_active })}>
                  {selectedFlow.is_active
                    ? <ToggleRight className="w-8 h-8 text-[#00a884]" />
                    : <ToggleLeft className="w-8 h-8 text-white/30" />
                  }
                </button>
              </div>
            </div>

            {/* Trigger Config */}
            <div className="bg-[#202c33] rounded-xl p-4 space-y-3 border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-white/80 text-sm font-semibold">Gatilho</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'manual', label: 'Manual' },
                  { value: 'keyword', label: 'Palavra-chave' },
                  { value: 'first_message', label: '1ª Mensagem' },
                ].map(t => (
                  <button
                    key={t.value}
                    onClick={() => setSelectedFlow({ ...selectedFlow, trigger_type: t.value as Flow['trigger_type'] })}
                    className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                      selectedFlow.trigger_type === t.value
                        ? 'bg-[#00a884] text-white'
                        : 'bg-[#2a3942] text-white/50 hover:text-white/80'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {selectedFlow.trigger_type === 'keyword' && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      placeholder="Adicionar palavra-chave"
                      className="bg-[#2a3942] border-white/10 text-white placeholder:text-white/30 text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                    />
                    <Button onClick={addKeyword} size="sm" className="bg-[#00a884] hover:bg-[#00a884]/80 text-white">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedFlow.trigger_keywords.map((kw, i) => (
                      <span key={i} className="bg-[#00a884]/20 text-[#00a884] px-2 py-1 rounded-full text-xs flex items-center gap-1">
                        {kw}
                        <button onClick={() => removeKeyword(i)} className="hover:text-red-400">×</button>
                      </span>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <label className="text-white/50 text-xs">Responder na mensagem específica?</label>
                    <Input
                      value={selectedFlow.trigger_specific_text || ''}
                      onChange={(e) => setSelectedFlow({ ...selectedFlow, trigger_specific_text: e.target.value })}
                      placeholder="Texto específico (deixe vazio para qualquer)"
                      className="bg-[#2a3942] border-white/10 text-white placeholder:text-white/30 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Steps */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-white/80 text-sm font-semibold">Passos do Fluxo ({selectedFlow.steps.length})</span>
              </div>

              {selectedFlow.steps.map((step, index) => {
                const stepType = STEP_TYPES.find(s => s.value === step.step_type);
                const Icon = stepType?.icon || Type;
                const isExpanded = expandedStep === index;

                return (
                  <div key={index} className="bg-[#202c33] rounded-xl border border-white/5 overflow-hidden">
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5"
                      onClick={() => setExpandedStep(isExpanded ? null : index)}
                    >
                      <GripVertical className="w-4 h-4 text-white/20" />
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: stepType?.color + '20' }}>
                        <Icon className="w-4 h-4" style={{ color: stepType?.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-white text-sm font-medium">{index + 1}. {stepType?.label}</span>
                        {step.content && <p className="text-white/40 text-xs truncate">{step.content}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); moveStep(index, 'up'); }} className="p-1 text-white/20 hover:text-white/60" disabled={index === 0}>
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); moveStep(index, 'down'); }} className="p-1 text-white/20 hover:text-white/60" disabled={index === selectedFlow.steps.length - 1}>
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); removeStep(index); }} className="p-1 text-white/20 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3">
                        {(step.step_type === 'text' || step.step_type === 'buttons') && (
                          <div>
                            <label className="text-white/50 text-xs mb-1 block">Mensagem</label>
                            <Textarea
                              value={step.content || ''}
                              onChange={(e) => updateStep(index, { content: e.target.value })}
                              placeholder="Digite a mensagem..."
                              className="bg-[#2a3942] border-white/10 text-white placeholder:text-white/30 text-sm resize-none"
                              rows={3}
                            />
                          </div>
                        )}

                        {(step.step_type === 'image' || step.step_type === 'audio' || step.step_type === 'video') && (
                          <>
                            <div>
                              <label className="text-white/50 text-xs mb-1 block">URL da Mídia</label>
                              <Input
                                value={step.media_url || ''}
                                onChange={(e) => updateStep(index, { media_url: e.target.value })}
                                placeholder="https://..."
                                className="bg-[#2a3942] border-white/10 text-white placeholder:text-white/30 text-sm"
                              />
                            </div>

                            {/* Upload / Record buttons */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={uploadingStep === index}
                                onClick={() => {
                                  setActiveFileStep(index);
                                  fileInputRef.current?.click();
                                }}
                                className="text-white/60 hover:text-white bg-[#2a3942] text-xs h-8"
                              >
                                {uploadingStep === index ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
                                {step.step_type === 'audio' ? 'Subir áudio (.mp3, .ogg)' : step.step_type === 'video' ? 'Subir vídeo (.mp4)' : 'Subir imagem (.jpg, .png)'}
                              </Button>

                              {step.step_type === 'video' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => window.open('/converter-video', '_blank')}
                                  className="text-[#00a884] hover:text-[#00a884] bg-[#00a884]/10 text-xs h-8"
                                  title="Converter vídeo grande para até 16MB (100% no navegador, sem nuvem)"
                                >
                                  <Video className="w-3 h-3 mr-1" /> Converter vídeo
                                </Button>
                              )}

                              {step.step_type === 'audio' && (
                                <>
                                  {recordingStep === index ? (
                                    <Button variant="ghost" size="sm" onClick={stopRecording} className="text-red-400 hover:text-red-300 bg-red-400/10 text-xs h-8 animate-pulse">
                                      <Square className="w-3 h-3 mr-1" /> Parar gravação
                                    </Button>
                                  ) : (
                                    <Button variant="ghost" size="sm" onClick={() => startRecording(index)} className="text-orange-400 hover:text-orange-300 bg-orange-400/10 text-xs h-8"
                                      disabled={recordingStep !== null}>
                                      <Mic className="w-3 h-3 mr-1" /> Gravar áudio
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Recorded audio preview */}
                            {recordedPreview && recordedPreview.stepIndex === index && (
                              <div className="bg-[#1a2730] rounded-lg p-3 space-y-2">
                                <p className="text-white/50 text-xs">Pré-visualização do áudio gravado:</p>
                                <audio controls src={recordedPreview.url} className="w-full h-8" />
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={saveRecordedAudio} disabled={uploadingStep === index} className="bg-[#00a884] hover:bg-[#00a884]/80 text-white text-xs h-7">
                                    {uploadingStep === index ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                                    Salvar
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={cancelRecording} className="text-white/40 hover:text-white/60 text-xs h-7">
                                    <X className="w-3 h-3 mr-1" /> Cancelar
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Media preview */}
                            {step.media_url && (
                              <div className="bg-[#1a2730] rounded-lg p-2">
                                {step.step_type === 'image' && <img src={step.media_url} alt="Preview" className="max-h-32 rounded object-contain" />}
                                {step.step_type === 'audio' && <audio controls src={step.media_url} className="w-full h-8" />}
                                {step.step_type === 'video' && <video controls src={step.media_url} className="max-h-32 rounded" />}
                              </div>
                            )}

                            <div>
                              <label className="text-white/50 text-xs mb-1 block">Legenda (opcional)</label>
                              <Input
                                value={step.content || ''}
                                onChange={(e) => updateStep(index, { content: e.target.value })}
                                placeholder="Legenda da mídia"
                                className="bg-[#2a3942] border-white/10 text-white placeholder:text-white/30 text-sm"
                              />
                            </div>
                          </>
                        )}

                        {step.step_type === 'buttons' && (
                          <div className="space-y-3">
                            <label className="text-white/50 text-xs block">Opções de Botão (máx 3)</label>
                            {step.button_options.map((opt, oi) => {
                              const actions = step.button_actions || [];
                              const action = actions[oi] || { action_type: 'text', content: '', media_url: '', flow_id: '' };
                              return (
                                <div key={oi} className="bg-[#1a2730] rounded-lg p-3 space-y-2 border border-white/5">
                                  <div className="flex gap-2 items-center">
                                    <span className="text-[#3498db] text-xs font-bold min-w-[20px]">{oi + 1}.</span>
                                    <Input
                                      value={opt}
                                      onChange={(e) => updateButtonOption(index, oi, e.target.value)}
                                      placeholder={`Texto do Botão ${oi + 1}`}
                                      className="bg-[#2a3942] border-white/10 text-white placeholder:text-white/30 text-sm"
                                    />
                                    <Button variant="ghost" size="sm" onClick={() => removeButtonOption(index, oi)} className="text-red-400 hover:text-red-300 shrink-0">
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                  {/* Action config per button */}
                                  <div className="pl-6 space-y-2">
                                    <label className="text-white/40 text-[10px] block">Ação ao clicar neste botão:</label>
                                    <div className="grid grid-cols-5 gap-1">
                                      {([
                                        { value: 'text' as const, label: 'Texto', icon: Type, color: '#00a884' },
                                        { value: 'audio' as const, label: 'Áudio', icon: Mic, color: '#e67e22' },
                                        { value: 'image' as const, label: 'Imagem', icon: Image, color: '#7c5cfc' },
                                        { value: 'video' as const, label: 'Vídeo', icon: Video, color: '#e74c3c' },
                                        { value: 'flow' as const, label: 'Fluxo', icon: Zap, color: '#f39c12' },
                                        { value: 'continue' as const, label: 'Sequência', icon: ArrowRight, color: '#3498db' },
                                      ]).map(at => (
                                        <button
                                          key={at.value}
                                          onClick={() => {
                                            const newActions = [...(step.button_actions || [])];
                                            while (newActions.length <= oi) newActions.push({ action_type: 'text' });
                                            newActions[oi] = { ...newActions[oi], action_type: at.value };
                                            updateStep(index, { button_actions: newActions });
                                          }}
                                          className={`flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition-all border ${
                                            action.action_type === at.value
                                              ? 'border-white/20 bg-white/5'
                                              : 'border-transparent bg-[#2a3942] text-white/40'
                                          }`}
                                        >
                                          <at.icon className="w-3 h-3" style={{ color: at.color }} />
                                          <span className="text-white/70 hidden sm:inline">{at.label}</span>
                                        </button>
                                      ))}
                                    </div>
                                    {action.action_type === 'text' && (
                                      <Textarea
                                        value={action.content || ''}
                                        onChange={(e) => {
                                          const newActions = [...(step.button_actions || [])];
                                          while (newActions.length <= oi) newActions.push({ action_type: 'text' });
                                          newActions[oi] = { ...newActions[oi], content: e.target.value };
                                          updateStep(index, { button_actions: newActions });
                                        }}
                                        placeholder="Mensagem a enviar..."
                                        className="bg-[#2a3942] border-white/10 text-white placeholder:text-white/30 text-xs resize-none"
                                        rows={2}
                                      />
                                    )}
                                    {(action.action_type === 'audio' || action.action_type === 'image' || action.action_type === 'video') && (
                                      <div className="space-y-1.5">
                                        <Input
                                          value={action.media_url || ''}
                                          onChange={(e) => {
                                            const newActions = [...(step.button_actions || [])];
                                            while (newActions.length <= oi) newActions.push({ action_type: action.action_type });
                                            newActions[oi] = { ...newActions[oi], media_url: e.target.value };
                                            updateStep(index, { button_actions: newActions });
                                          }}
                                          placeholder="URL da mídia..."
                                          className="bg-[#2a3942] border-white/10 text-white placeholder:text-white/30 text-xs"
                                        />
                                        {action.action_type !== 'audio' && (
                                          <Input
                                            value={action.content || ''}
                                            onChange={(e) => {
                                              const newActions = [...(step.button_actions || [])];
                                              while (newActions.length <= oi) newActions.push({ action_type: action.action_type });
                                              newActions[oi] = { ...newActions[oi], content: e.target.value };
                                              updateStep(index, { button_actions: newActions });
                                            }}
                                            placeholder="Legenda (opcional)"
                                            className="bg-[#2a3942] border-white/10 text-white placeholder:text-white/30 text-xs"
                                          />
                                        )}
                                      </div>
                                    )}
                                    {action.action_type === 'flow' && (
                                      <div>
                                        <select
                                          value={action.flow_id || ''}
                                          onChange={(e) => {
                                            const newActions = [...(step.button_actions || [])];
                                            while (newActions.length <= oi) newActions.push({ action_type: 'flow' });
                                            newActions[oi] = { ...newActions[oi], flow_id: e.target.value };
                                            updateStep(index, { button_actions: newActions });
                                          }}
                                          className="w-full bg-[#2a3942] border border-white/10 text-white text-xs rounded-md px-2 py-1.5"
                                        >
                                          <option value="">Selecionar fluxo...</option>
                                          {flows.filter(f => f.id && f.id !== selectedFlow?.id).map(f => (
                                            <option key={f.id} value={f.id}>{f.name}</option>
                                          ))}
                                        </select>
                                        <p className="text-white/30 text-[10px] mt-1">Dispara outro fluxo completo</p>
                                      </div>
                                    )}
                                    {action.action_type === 'continue' && (
                                      <p className="text-blue-400/70 text-[10px]">
                                        ▶ Qualquer resposta neste botão continua a sequência dos próximos passos do fluxo
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {step.button_options.length < 3 && (
                              <Button variant="ghost" size="sm" onClick={() => addButtonOption(index)} className="text-[#00a884] text-xs">
                                <Plus className="w-3 h-3 mr-1" /> Adicionar botão
                              </Button>
                            )}
                          </div>
                        )}

                        {step.step_type === 'wait_reply' && (
                          <div className="space-y-4">
                            {/* Wait mode */}
                            <div>
                              <label className="text-white/50 text-xs mb-2 block font-medium">Modo de espera</label>
                              <div className="flex items-center justify-between bg-[#2a3942] rounded-lg px-3 py-2">
                                <span className="text-white/70 text-xs">Aguardar por tempo indeterminado</span>
                                <button onClick={() => updateStep(index, { wait_indefinitely: !step.wait_indefinitely })}>
                                  {step.wait_indefinitely
                                    ? <ToggleRight className="w-7 h-7 text-[#00a884]" />
                                    : <ToggleLeft className="w-7 h-7 text-white/30" />
                                  }
                                </button>
                              </div>
                              {!step.wait_indefinitely && (
                                <div className="mt-2">
                                  <label className="text-white/50 text-xs mb-1 block">Tempo limite (segundos)</label>
                                  <Input
                                    type="number"
                                    value={step.wait_timeout_seconds}
                                    onChange={(e) => updateStep(index, { wait_timeout_seconds: parseInt(e.target.value) || 300 })}
                                    className="bg-[#2a3942] border-white/10 text-white text-sm w-32"
                                  />
                                  <p className="text-white/30 text-xs mt-1">Após esse tempo, continua o fluxo automaticamente</p>
                                </div>
                              )}
                            </div>

                            {/* Follow-up */}
                            <div className="border-t border-white/5 pt-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Bell className="w-3.5 h-3.5 text-yellow-400" />
                                  <span className="text-white/70 text-xs font-medium">Follow-up se não responder</span>
                                </div>
                                <button onClick={() => updateStep(index, { followup_enabled: !step.followup_enabled })}>
                                  {step.followup_enabled
                                    ? <ToggleRight className="w-7 h-7 text-yellow-400" />
                                    : <ToggleLeft className="w-7 h-7 text-white/30" />
                                  }
                                </button>
                              </div>

                              {step.followup_enabled && (
                                <div className="space-y-3 bg-[#1a2730] rounded-lg p-3">
                                  <div>
                                    <label className="text-white/50 text-xs mb-1 block">Enviar follow-up após (segundos)</label>
                                    <Input
                                      type="number"
                                      value={step.followup_delay_seconds || 600}
                                      onChange={(e) => updateStep(index, { followup_delay_seconds: parseInt(e.target.value) || 600 })}
                                      className="bg-[#2a3942] border-white/10 text-white text-sm w-40"
                                    />
                                    <p className="text-white/30 text-xs mt-1">
                                      = {Math.floor((step.followup_delay_seconds || 600) / 60)} min {((step.followup_delay_seconds || 600) % 60) > 0 ? `e ${(step.followup_delay_seconds || 600) % 60}s` : ''}
                                    </p>
                                  </div>

                                  <div>
                                    <label className="text-white/50 text-xs mb-1.5 block">Tipo do follow-up</label>
                                    <div className="grid grid-cols-3 gap-1.5">
                                      {([
                                        { value: 'text' as const, label: 'Texto', icon: Type, color: '#00a884' },
                                        { value: 'audio' as const, label: 'Áudio', icon: Mic, color: '#e67e22' },
                                        { value: 'image' as const, label: 'Imagem', icon: Image, color: '#7c5cfc' },
                                        { value: 'video' as const, label: 'Vídeo', icon: Video, color: '#e74c3c' },
                                        { value: 'flow' as const, label: 'Outro Fluxo', icon: Zap, color: '#f39c12' },
                                      ]).map(ft => (
                                        <button
                                          key={ft.value}
                                          onClick={() => updateStep(index, { followup_type: ft.value })}
                                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all border ${
                                            (step.followup_type || 'text') === ft.value
                                              ? 'border-white/20 bg-white/5'
                                              : 'border-transparent bg-[#2a3942] text-white/40'
                                          }`}
                                        >
                                          <ft.icon className="w-3 h-3" style={{ color: ft.color }} />
                                          <span className="text-white/70">{ft.label}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {(step.followup_type || 'text') === 'text' && (
                                    <div>
                                      <label className="text-white/50 text-xs mb-1 block">Mensagem de follow-up</label>
                                      <Textarea
                                        value={step.followup_content || ''}
                                        onChange={(e) => updateStep(index, { followup_content: e.target.value })}
                                        placeholder="Oi! Vi que você não respondeu ainda. Posso te ajudar?"
                                        className="bg-[#2a3942] border-white/10 text-white placeholder:text-white/30 text-sm resize-none"
                                        rows={3}
                                      />
                                    </div>
                                  )}

                                  {((step.followup_type || 'text') === 'audio' || (step.followup_type || 'text') === 'image' || (step.followup_type || 'text') === 'video') && (
                                    <div className="space-y-2">
                                      <div>
                                        <label className="text-white/50 text-xs mb-1 block">URL da mídia</label>
                                        <Input
                                          value={step.followup_media_url || ''}
                                          onChange={(e) => updateStep(index, { followup_media_url: e.target.value })}
                                          placeholder="https://..."
                                          className="bg-[#2a3942] border-white/10 text-white placeholder:text-white/30 text-sm"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-white/50 text-xs mb-1 block">Legenda (opcional)</label>
                                        <Input
                                          value={step.followup_content || ''}
                                          onChange={(e) => updateStep(index, { followup_content: e.target.value })}
                                          placeholder="Texto do follow-up"
                                          className="bg-[#2a3942] border-white/10 text-white placeholder:text-white/30 text-sm"
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {(step.followup_type || 'text') === 'flow' && (
                                    <div>
                                      <label className="text-white/50 text-xs mb-1 block">ID do fluxo a disparar</label>
                                      <Input
                                        value={step.followup_flow_id || ''}
                                        onChange={(e) => updateStep(index, { followup_flow_id: e.target.value })}
                                        placeholder="Cole o ID do fluxo"
                                        className="bg-[#2a3942] border-white/10 text-white placeholder:text-white/30 text-sm"
                                      />
                                      <p className="text-white/30 text-xs mt-1">Copie o ID na lista de fluxos</p>
                                    </div>
                                  )}

                                  <div className="bg-[#2a3942]/50 rounded-lg p-2">
                                    <p className="text-yellow-400/70 text-[10px] flex items-center gap-1">
                                      <Bell className="w-3 h-3" />
                                      Se não responder em {Math.floor((step.followup_delay_seconds || 600) / 60)} min, o follow-up dispara automaticamente
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {step.step_type !== 'wait_reply' && (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-white/50 text-xs mb-1 block">Delay antes (s)</label>
                                <Input
                                  type="number"
                                  value={step.delay_seconds}
                                  onChange={(e) => updateStep(index, { delay_seconds: parseInt(e.target.value) || 0 })}
                                  className="bg-[#2a3942] border-white/10 text-white text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-white/50 text-xs mb-1 block">{step.step_type === 'audio' ? 'Gravando áudio (ms)' : 'Digitando (ms)'}</label>
                                <Input
                                  type="number"
                                  value={step.typing_duration_ms}
                                  onChange={(e) => updateStep(index, { typing_duration_ms: parseInt(e.target.value) || 0 })}
                                  className="bg-[#2a3942] border-white/10 text-white text-sm"
                                  disabled={!step.simulate_typing}
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-white/50 text-xs">{step.step_type === 'audio' ? 'Simular gravando áudio' : 'Simular digitando'}</span>
                              <button onClick={() => updateStep(index, { simulate_typing: !step.simulate_typing })}>
                                {step.simulate_typing
                                  ? <ToggleRight className="w-7 h-7 text-[#00a884]" />
                                  : <ToggleLeft className="w-7 h-7 text-white/30" />
                                }
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add Step Buttons */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                {STEP_TYPES.map(st => (
                  <button
                    key={st.value}
                    onClick={() => addStep(st.value as FlowStep['step_type'])}
                    className="flex items-center gap-2 bg-[#202c33] hover:bg-[#2a3942] border border-white/5 rounded-lg px-3 py-2.5 transition-all"
                  >
                    <st.icon className="w-4 h-4" style={{ color: st.color }} />
                    <span className="text-white/60 text-xs">{st.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#111b21]">
      <div className="bg-[#202c33] px-4 py-3 flex items-center justify-between border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#00a884]" />
          <span className="text-white font-semibold text-sm">Fluxos de Mensagens</span>
        </div>
        <Button onClick={createNewFlow} size="sm" className="bg-[#00a884] hover:bg-[#00a884]/80 text-white text-sm h-8">
          <Plus className="w-4 h-4 mr-1" /> Novo Fluxo
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
          </div>
        ) : flows.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Zap className="w-12 h-12 text-white/10 mx-auto mb-3" />
            <p className="text-white/40 text-sm mb-1">Nenhum fluxo criado</p>
            <p className="text-white/20 text-xs mb-4">Crie fluxos para automatizar suas mensagens</p>
            <Button onClick={createNewFlow} className="bg-[#00a884] hover:bg-[#00a884]/80 text-white text-sm">
              <Plus className="w-4 h-4 mr-1" /> Criar Primeiro Fluxo
            </Button>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {flows.map(flow => (
              <div
                key={flow.id}
                className="bg-[#202c33] rounded-xl p-4 border border-white/5 hover:border-[#00a884]/30 transition-all cursor-pointer"
                onClick={() => {
                  setSelectedFlow({ ...flow, steps: flow.steps || [emptyStep()] });
                  setExpandedStep(null);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${flow.is_active ? 'bg-[#00a884]' : 'bg-white/20'}`} />
                    <div>
                      <h3 className="text-white text-sm font-medium">{flow.name}</h3>
                      {flow.description && <p className="text-white/40 text-xs mt-0.5">{flow.description}</p>}
                      {flow.id && <p className="text-white/20 text-[9px] mt-0.5 font-mono">ID: {flow.id}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white/30 text-xs bg-[#2a3942] px-2 py-0.5 rounded">
                      {flow.trigger_type === 'manual' ? 'Manual' : flow.trigger_type === 'keyword' ? 'Palavra-chave' : '1ª Msg'}
                    </span>
                    <span className="text-white/30 text-xs">{(flow.steps || []).length} passos</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); if (flow.id) deleteFlow(flow.id); }}
                      className="text-white/20 hover:text-red-400 p-1 h-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
