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

export const resolveFarmEtapa = (propId: string, propEtapa?: string | null, auditEtapa?: string | null): string => {
  const storedMap = getStoredEtapas();
  if (storedMap[propId]) return storedMap[propId];
  if (propEtapa === 'Auditoria Prévia' || propEtapa === 'Auditoria Oficial' || propEtapa === 'Prospecção') return propEtapa;
  if (auditEtapa === 'Auditoria Prévia' || auditEtapa === 'Auditoria Oficial' || auditEtapa === 'Prospecção') return auditEtapa;
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
