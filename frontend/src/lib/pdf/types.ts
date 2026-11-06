export interface PropriedadeReportInfo {
  id: string;
  nome_fazenda: string;
  nome_produtor: string;
  municipio: string;
  codigo_car?: string | null;
  codigo_sigef?: string | null;
  area_total?: number | string | null;
  area_soja?: number | string | null;
  coordenadas?: string | null;
  etapa?: string | null;
}

export interface AuditoriaReportInfo {
  id: string;
  data_vistoria: string;
  data_emissao: string;
  status: string;
  etapa: string;
  tecnico_nome: string;
  tecnico_id?: string | null;
  emitido_por: string;
}

export interface EstatisticasReport {
  totalPerguntas: number; // 115
  respondidas: number;
  aplicaveis: number;
  conformes: number;
  naoConformes: number;
  naoSeAplica: number;
  scoreConformidade: number; // 0 - 100
  classificacao: string; // ex: 'Crítica', 'Adequada', 'Certificável'
}

export interface PrazoItemStats {
  prazo: string;
  diasTexto: string;
  total: number;
  conformes: number;
  naoConformes: number;
  descricao: string;
}

export interface MatrizPrazosReport {
  imediato: PrazoItemStats;
  curtoPrazo: PrazoItemStats;
  medioPrazo: PrazoItemStats;
}

export interface PrincipioReportStats {
  numero: number;
  nome: string;
  total: number;
  conformes: number;
  naoConformes: number;
  naoSeAplica: number;
  score: number;
}

export interface CriterioReportItem {
  id: string;
  numero_criterio: string;
  secao: string;
  enunciado: string;
  ponderacao: string;
  prazoEstimado: string;
  status: 'Conforme' | 'Não Conforme' | 'Não se Aplica' | 'Pendente';
  observacao: string;
  evidenciaUrl?: string | null;
  evidenciaBase64?: string | null;
}

export interface NaoConformidadePrioritaria {
  criterio: string;
  secao: string;
  enunciado: string;
  prazo: string;
  observacao: string;
  evidenciaUrl?: string | null;
  evidenciaBase64?: string | null;
}

export interface EvidenciaAnexoItem {
  criterio: string;
  secao: string;
  enunciado: string;
  evidenciaBase64: string;
  observacao?: string;
}

export interface AuditReportData {
  propriedade: PropriedadeReportInfo;
  auditoria: AuditoriaReportInfo;
  estatisticas: EstatisticasReport;
  matrizPrazos: MatrizPrazosReport;
  principios: PrincipioReportStats[];
  naoConformidades: NaoConformidadePrioritaria[];
  criterios: CriterioReportItem[];
  evidenciasAnexo: EvidenciaAnexoItem[];
}

/**
 * Valida se uma auditoria pode ter relatório em PDF emitido (apenas após submissão).
 */
export function isAuditoriaSubmetida(status?: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return (
    s.includes('aguardando') ||
    s.includes('aprova') ||
    s.includes('certificad') ||
    s.includes('concluí') ||
    s.includes('conclui') ||
    s.includes('finaliz') ||
    s.includes('reprovad')
  );
}

/**
 * Remove quebras de linha brutas e normaliza espaços para apresentação limpa e contínua do texto.
 */
export function cleanQuestionText(text?: string | null): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

