import { supabase } from './supabase';

export const getStoredEtapas = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem('ms_farm_etapas');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const setStoredEtapa = (propId: string, etapa: string) => {
  try {
    const map = getStoredEtapas();
    map[propId] = etapa;
    localStorage.setItem('ms_farm_etapas', JSON.stringify(map));
  } catch (e) {
    console.warn('Erro ao salvar etapa no localStorage:', e);
  }
};

export function normalizeEtapa(etapaStr?: string | null): 'Prospecção' | 'Auditoria Prévia' | 'Auditoria Oficial' {
  if (!etapaStr) return 'Prospecção';
  const clean = etapaStr.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (clean.includes('oficial') || clean.includes('3')) return 'Auditoria Oficial';
  if (clean.includes('previa') || clean.includes('2')) return 'Auditoria Prévia';
  return 'Prospecção';
}

export const resolveFarmEtapa = (
  propId: string, 
  propEtapa?: string | null, 
  auditEtapa?: string | null
): 'Prospecção' | 'Auditoria Prévia' | 'Auditoria Oficial' => {
  // 1. Precedência máxima para a auditoria atual no banco de dados
  if (auditEtapa && auditEtapa.trim()) {
    const norm = normalizeEtapa(auditEtapa);
    setStoredEtapa(propId, norm);
    return norm;
  }
  // 2. Precedência para a propriedade no banco de dados
  if (propEtapa && propEtapa.trim()) {
    const norm = normalizeEtapa(propEtapa);
    setStoredEtapa(propId, norm);
    return norm;
  }
  // 3. Fallback no cache local do dispositivo
  const storedMap = getStoredEtapas();
  if (storedMap[propId]) return normalizeEtapa(storedMap[propId]);

  return 'Prospecção';
};

export const persistFarmEtapa = async (propId: string, auditId: string | null, novaEtapa: string) => {
  // 1. Salvar no localStorage de forma imediata (garante sincronização no ambiente local)
  setStoredEtapa(propId, novaEtapa);

  // 2. Atualizar na tabela de propriedades no Supabase
  try {
    await supabase.from('propriedades').update({ etapa: novaEtapa }).eq('id', propId);
  } catch (e) {
    console.warn('Erro ao atualizar etapa em propriedades:', e);
  }

  // 3. Atualizar na tabela de auditorias no Supabase
  if (auditId && !auditId.startsWith('mock-') && !auditId.startsWith('v-audit-')) {
    try {
      await supabase.from('auditorias').update({ etapa: novaEtapa }).eq('id', auditId);
    } catch (e) {
      console.warn('Erro ao atualizar etapa em auditorias:', e);
    }
  }

  try {
    await supabase.from('auditorias').update({ etapa: novaEtapa }).eq('propriedade_id', propId);
  } catch (e) {}
};
