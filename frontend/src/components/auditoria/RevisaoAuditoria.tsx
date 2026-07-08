import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, X, ShieldCheck, Image as ImageIcon, Search, Loader2, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface RevisaoAuditoriaProps {
  propriedadeNome: string;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  auditoriaId?: string;
}

const MOCK_RESPOSTAS = [
  { id: '1', secao: 'Meio Ambiente', criterio: '1.1', enunciado: 'A propriedade possui reserva legal averbada e protegida?', conforme: true, observacao: 'Área devidamente cercada.', evidencia: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&h=300&fit=crop' },
  { id: '2', secao: 'Meio Ambiente', criterio: '1.2', enunciado: 'Existe plano de gestão de resíduos sólidos?', conforme: false, observacao: 'Falta lixeiras para químicos no galpão norte.', evidencia: null },
  { id: '3', secao: 'Trabalhista', criterio: '2.1', enunciado: 'Trabalhadores utilizam EPI?', conforme: true, observacao: 'Verificado na frente de plantio.', evidencia: 'https://images.unsplash.com/photo-1588681664899-f142ff2dc9b1?w=400&h=300&fit=crop' },
];

export default function RevisaoAuditoria({ propriedadeNome, onClose, onApprove, onReject, auditoriaId }: RevisaoAuditoriaProps) {
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRespostas() {
      if (!auditoriaId) {
        setRespostas(MOCK_RESPOSTAS);
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('respostas_auditoria')
          .select(`
            id,
            conforme,
            observacao,
            evidencia_url,
            perguntas_rtrs (
              secao,
              numero_criterio,
              enunciado
            )
          `)
          .eq('auditoria_id', auditoriaId);

        if (error) throw error;

        if (data && data.length > 0) {
          const parseNum = (str: string) => {
            return str.split('.').map(x => {
              const match = x.match(/^(\d*)([a-zA-Z]*)$/);
              if (match) {
                const num = match[1] ? parseInt(match[1], 10) : 0;
                const char = match[2] || '';
                return [num, char];
              }
              return [0, x];
            });
          };

          const mapped = data.map(r => ({
            id: r.id,
            secao: (r.perguntas_rtrs as any)?.secao || 'Geral',
            criterio: (r.perguntas_rtrs as any)?.numero_criterio || 'N/A',
            enunciado: (r.perguntas_rtrs as any)?.enunciado || '',
            conforme: r.conforme,
            observacao: r.observacao || 'Nenhum comentário.',
            evidencia: r.evidencia_url
          })).sort((a, b) => {
            const partsA = parseNum(a.criterio);
            const partsB = parseNum(b.criterio);
            for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
              if (partsA[i] === undefined) return -1;
              if (partsB[i] === undefined) return 1;
              const itemA = partsA[i];
              const itemB = partsB[i];
              
              const numA = typeof itemA[0] === 'number' ? itemA[0] : 0;
              const numB = typeof itemB[0] === 'number' ? itemB[0] : 0;
              const charA = typeof itemA[1] === 'string' ? itemA[1] : '';
              const charB = typeof itemB[1] === 'string' ? itemB[1] : '';
              
              if (numA !== numB) return numA - numB;
              if (charA !== charB) return charA < charB ? -1 : 1;
            }
            return 0;
          });
          setRespostas(mapped);
        } else {
          setRespostas(MOCK_RESPOSTAS);
        }
      } catch (err) {
        console.error('Erro ao carregar respostas:', err);
        setRespostas(MOCK_RESPOSTAS);
      } finally {
        setLoading(false);
      }
    }
    fetchRespostas();
  }, [auditoriaId]);

  const getScore = () => {
    if (respostas.length === 0) return 0;
    const conformes = respostas.filter(r => r.conforme).length;
    return Math.round((conformes / respostas.length) * 100);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Modal Principal */}
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gray-900 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
            <div>
              <h2 className="text-xl font-bold uppercase tracking-wide">Revisão de Auditoria RTRS</h2>
              <p className="text-gray-400 text-sm">{propriedadeNome} - Relatório do Técnico</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-300">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Resumo Gerencial */}
        <div className="bg-gray-50 border-b border-gray-200 p-6 flex gap-6 shrink-0">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col items-center justify-center">
            <span className="text-sm font-semibold text-gray-500 uppercase">Score de Conformidade</span>
            <span className={`text-4xl font-black ${getScore() > 80 ? 'text-emerald-600' : 'text-amber-500'}`}>
              {getScore()}%
            </span>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-1">
             <h4 className="text-sm font-bold text-gray-900 mb-2">Parecer Geral do Técnico</h4>
             <p className="text-sm text-gray-600 italic">"Propriedade com boas práticas, mas necessita adequação urgente no galpão de insumos do setor Norte."</p>
          </div>
        </div>

        {/* Lista de Evidências (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
          <h3 className="text-lg font-bold text-gray-900 border-b pb-2">Detalhes por Critério</h3>
          
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-primary">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p className="text-sm font-medium text-muted-foreground">Carregando respostas do banco de dados...</p>
            </div>
          ) : respostas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm font-medium">
              Nenhuma resposta registrada para esta auditoria.
            </div>
          ) : (
            respostas.map((resp) => (
              <div key={resp.id} className="border border-gray-200 rounded-xl overflow-hidden flex flex-col md:flex-row shadow-sm hover:shadow transition-shadow">
                {/* Esquerda: Pergunta e Status */}
                <div className="flex-1 p-5 bg-gray-50/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded text-xs font-bold uppercase">{resp.secao}</span>
                    <span className="font-bold text-gray-500 text-sm">Critério {resp.criterio}</span>
                  </div>
                  <p className="font-bold text-gray-900 mb-3">{resp.enunciado}</p>
                  
                  <div className="flex items-start gap-2 mb-2">
                    {resp.conforme ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className={`font-bold ${resp.conforme ? 'text-emerald-700' : 'text-red-700'}`}>
                        {resp.conforme ? 'Conforme' : 'Não Conforme'}
                      </span>
                      <p className="text-sm text-gray-600 mt-1"><span className="font-semibold text-gray-800">Obs do Auditor:</span> {resp.observacao}</p>
                    </div>
                  </div>
                </div>

                {/* Direita: Foto/Evidência */}
                <div className="w-full md:w-64 bg-gray-100 border-t md:border-t-0 md:border-l border-gray-200 flex flex-col items-center justify-center p-4">
                  <span className="text-xs font-bold text-gray-500 uppercase mb-2">Evidência Fotográfica / PDF</span>
                  {resp.evidencia ? (
                    resp.evidencia.toLowerCase().includes('.pdf') ? (
                      <a
                        href={resp.evidencia}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full h-32 border border-gray-200 rounded-lg flex flex-col items-center justify-center bg-white text-emerald-700 hover:bg-slate-50 transition-colors shadow-sm"
                      >
                        <FileText className="w-8 h-8 mb-1" />
                        <span className="text-xs font-bold text-center px-2 truncate w-full">Ver PDF Anexado</span>
                      </a>
                    ) : (
                      <div 
                        className="relative w-full h-32 rounded-lg overflow-hidden cursor-pointer group"
                        onClick={() => setFotoAmpliada(resp.evidencia)}
                      >
                        <img src={resp.evidencia} alt="Evidência" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Search className="text-white w-6 h-6" />
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400">
                      <ImageIcon className="w-6 h-6 mb-1" />
                      <span className="text-xs">Sem Arquivo</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer: Botões de Decisão */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 shrink-0 flex justify-end gap-3">
          <button
            onClick={onReject}
            className="px-6 py-3 bg-white border border-red-200 text-red-700 hover:bg-red-50 rounded-xl font-bold transition-colors"
          >
            Recusar (Exigir Adequações)
          </button>
          <button
            onClick={onApprove}
            className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            <ShieldCheck className="w-5 h-5" />
            Aprovar Certificação Oficial
          </button>
        </div>
      </div>

      {/* Lightbox para ampliar a foto */}
      {fotoAmpliada && (
        <div 
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setFotoAmpliada(null)}
        >
          <img src={fotoAmpliada} alt="Evidência Ampliada" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl" />
        </div>
      )}
    </div>,
    document.body
  );
}
