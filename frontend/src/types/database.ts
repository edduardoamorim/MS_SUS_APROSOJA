/**
 * Definições de Tipos do TypeScript para o Supabase DB (MS Sustentável / RTRS)
 */

export interface Prospecto {
  id: string;
  nome: string;
  email: string;
  telefone?: string | null;
  nome_propriedade?: string | null;
  municipio?: string | null;
  mensagem?: string | null;
  status: 'novo' | 'em_atendimento' | 'convertido' | 'arquivado' | string;
  created_at: string;
}

export interface ProducaoCredito {
  id: string;
  propriedade_id: string;
  ano_safra: string; // Ex: '2025/2026'
  area_plantada_ha?: number | null;
  producao_estimada_ton?: number | null;
  volume_credito_rtrs?: number | null;
  observacoes?: string | null;
  created_at: string;
}

export interface GrupoPropriedade {
  id: string;
  nome_grupo: string;
  regiao?: string | null;
  descricao?: string | null;
  created_at: string;
}

export interface PropriedadeGrupo {
  id: string;
  grupo_id: string;
  propriedade_id: string;
  created_at: string;
}

export interface ModeloDocumento {
  id: string;
  titulo: string;
  descricao?: string | null;
  categoria: 'RH' | 'Ambiental' | 'Seguranca' | 'Geral';
  arquivo_url: string;
  criado_por?: string | null;
  created_at: string;
}

export interface AceiteTermo {
  id: string;
  usuario_id: string;
  propriedade_id?: string | null;
  tipo_termo: 'Adesao' | 'Delegacao';
  metodo: 'GovBr' | 'UploadManual';
  assinado_em: string;
  ip_origem?: string | null;
  arquivo_pdf_url?: string | null;
  hash_validacao?: string | null;
  created_at: string;
}

// Tipos já existentes no sistema (mantidos intactos)
export interface Perfil {
  id: string;
  nome: string;
  email: string;
  role: 'gestor' | 'tecnico' | 'produtor';
  regiao?: string | null;
  fazendas_vinculadas?: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Propriedade {
  id: string;
  produtor_id?: string | null;
  nome_fazenda: string;
  nome_produtor: string;
  codigo_car?: string | null;
  codigo_sigef?: string | null;
  origem_cadastro?: 'CAR' | 'SIGEF' | 'KML' | string;
  municipio?: string | null;
  geom?: any;
  created_at: string;
  updated_at: string;
}

export interface Auditoria {
  id: string;
  propriedade_id: string;
  tecnico_responsavel_id?: string | null;
  data_agendamento?: string | null;
  status: 'Autoavaliação' | 'Visita de Campo' | 'Em Análise' | 'Certificada';
  created_at: string;
  updated_at: string;
}

export interface Pendencia {
  id: string;
  propriedade_id: string;
  titulo: string;
  descricao: string;
  status: 'Pendente' | 'Em Análise' | 'Resolvida';
  prazo?: string | null;
  evidencia_url?: string | null;
  resolucao_descricao?: string | null;
  motivo_rejeicao?: string | null;
  criado_por?: string | null;
  created_at: string;
  updated_at: string;
}
