import { useState, useEffect } from 'react';
import { 
  Map as MapIcon, 
  Search, 
  Filter, 
  Building2, 
  UserCheck, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Loader2, 
  Eye, 
  RefreshCw,
  Layers,
  MapPin
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import MapView from '../../components/map/MapView';
import AuditDetailModal from '../../components/auditoria/AuditDetailModal';
import type { FeatureCollection } from 'geojson';

function formatMunicipioName(val?: string | null): string {
  if (!val) return 'Mato Grosso do Sul';
  const clean = val.trim();
  if (!clean || clean.toLowerCase() === 'geral' || clean.toLowerCase() === 'n/a') {
    return 'Mato Grosso do Sul';
  }
  return clean
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (['de', 'do', 'da', 'dos', 'das', 'e'].includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

const PALETTE = [
  '#059669', '#2563eb', '#7c3aed', '#d97706', '#dc2626',
  '#0891b2', '#4f46e5', '#c026d3', '#059669', '#d97706'
];

function getTechnicianColor(name: string, index: number): string {
  if (!name) return '#94a3b8';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorIndex = Math.abs(hash) % PALETTE.length;
  return PALETTE[colorIndex] || PALETTE[index % PALETTE.length];
}

export default function GestorMapa() {
  const [loading, setLoading] = useState(true);
  
  // Filtros Avançados
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMunicipio, setSelectedMunicipio] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedEtapa, setSelectedEtapa] = useState('');
  const [selectedTecnicoId, setSelectedTecnicoId] = useState('');
  const [selectedOrigem, setSelectedOrigem] = useState('');

  // Dados do Mapa e Propriedades
  const [farmsData, setFarmsData] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [rawProperties, setRawProperties] = useState<any[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [allTechnicians, setAllTechnicians] = useState<any[]>([]);
  const [allAuditorias, setAllAuditorias] = useState<any[]>([]);
  const [municipiosList, setMunicipiosList] = useState<string[]>([]);
  
  // Modal de Detalhes
  const [selectedAuditForDetail, setSelectedAuditForDetail] = useState<any>(null);

  useEffect(() => {
    fetchGestorMapData();
  }, []);

  async function fetchGestorMapData() {
    setLoading(true);
    try {
      // 1. Carregar lista de técnicos
      const { data: tecsData } = await supabase
        .from('perfis')
        .select('id, nome, email')
        .eq('role', 'tecnico')
        .order('nome');

      const tecMap: Record<string, string> = {};
      const techColorMapLocal: Record<string, string> = {};
      if (tecsData) {
        setAllTechnicians(tecsData);
        tecsData.forEach((t: any, idx: number) => {
          tecMap[t.id] = t.nome;
          techColorMapLocal[t.id] = getTechnicianColor(t.nome, idx);
        });
      }

      // 2. Carregar todas as auditorias
      const { data: auds } = await supabase
        .from('auditorias')
        .select(`
          id,
          status,
          data_agendamento,
          tecnico_responsavel_id,
          propriedade_id,
          score_total,
          conformidade_percentual,
          propriedades (
            id,
            nome_fazenda,
            nome_produtor,
            codigo_car,
            codigo_sigef,
            municipio
          )
        `)
        .order('created_at', { ascending: false });

      if (auds) {
        setAllAuditorias(auds);
      }

      // 3. Carregar todas as propriedades
      const { data: propsList, error: propsError } = await supabase
        .from('propriedades')
        .select('id, nome_fazenda, nome_produtor, codigo_car, codigo_sigef, municipio, geom, produtor_id, created_at')
        .order('created_at', { ascending: false });

      if (propsError) throw propsError;

      const allProps = propsList || [];
      setRawProperties(allProps);

      // Coletar municípios únicos
      const munSet = new Set<string>();
      
      const features = await Promise.all(
        allProps.map(async (p: any, index: number) => {
          const propAudits = (auds || []).filter((a: any) => a.propriedade_id === p.id);
          const latestAudit = propAudits[0];
          const tecId = latestAudit?.tecnico_responsavel_id || null;
          const tecName = tecId ? (tecMap[tecId] || 'Técnico Atribuído') : 'Sem técnico';
          const auditStatus = latestAudit?.status || 'Autoavaliação';

          let geom = p.geom;

          // Processamento e blindagem de Geometria GeoJSON
          if (typeof geom === 'string') {
            try {
              const trimmed = geom.trim();
              if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                geom = JSON.parse(trimmed);
              } else {
                geom = null;
              }
            } catch (e) {
              geom = null;
            }
          }

          if (geom && typeof geom === 'object' && (!geom.type || !geom.coordinates)) {
            geom = null;
          }

          if (geom && geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
            geom = { type: 'Polygon', coordinates: geom.coordinates[0] || [] };
          }

          // Fallback de Busca no Banco GIS por Código CAR/SIGEF se nulo
          if (!geom) {
            try {
              if (p.codigo_car) {
                const cleanCar = p.codigo_car.trim();
                const { data: carGeomData } = await supabase
                  .from('imoveis_car')
                  .select('geom')
                  .or(`cod_imovel.ilike.${cleanCar},codigosica.ilike.${cleanCar}`)
                  .limit(1)
                  .maybeSingle();
                if (carGeomData?.geom) {
                  geom = typeof carGeomData.geom === 'string' && carGeomData.geom.trim().startsWith('{') ? JSON.parse(carGeomData.geom) : carGeomData.geom;
                }
              }
              if (!geom && p.codigo_sigef) {
                const cleanSigef = p.codigo_sigef.trim();
                const { data: sigefGeomData } = await supabase
                  .from('imoveis_sigef')
                  .select('geom')
                  .or(`parcela_co.ilike.${cleanSigef},codigo_imo.ilike.${cleanSigef}`)
                  .limit(1)
                  .maybeSingle();
                if (sigefGeomData?.geom) {
                  geom = typeof sigefGeomData.geom === 'string' && sigefGeomData.geom.trim().startsWith('{') ? JSON.parse(sigefGeomData.geom) : sigefGeomData.geom;
                }
              }
            } catch (e) {}
          }

          if (geom && geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
            geom = { type: 'Polygon', coordinates: geom.coordinates[0] || [] };
          }

          if (!geom || typeof geom !== 'object' || !geom.type || !geom.coordinates) {
            const latBase = -20.4 - (index * 0.15);
            const lngBase = -54.6 - (index * 0.15);
            geom = {
              type: 'Polygon',
              coordinates: [[[lngBase, latBase], [lngBase + 0.05, latBase], [lngBase + 0.05, latBase - 0.05], [lngBase, latBase - 0.05], [lngBase, latBase]]]
            };
          }

          // Resolução de Município
          let resolvedMunicipio = p.municipio;
          const isGeneric = (val?: string | null) => !val || val.trim() === '' || val.toLowerCase().includes('geral');

          if (isGeneric(resolvedMunicipio)) {
            const nameLower = (p.nome_fazenda || '').toLowerCase();
            if (nameLower.includes('chapad')) resolvedMunicipio = 'Chapadão do Sul';
            else if (nameLower.includes('campanar')) resolvedMunicipio = 'Maracaju';
            else if (nameLower.includes('rio verde')) resolvedMunicipio = 'Água Clara';
            else if (nameLower.includes('santa virg')) resolvedMunicipio = 'Ponta Porã';
            else if (nameLower.includes('caceres') || nameLower.includes('cáceres')) resolvedMunicipio = 'Corumbá';
            else resolvedMunicipio = 'Mato Grosso do Sul';
          }

          const finalMunicipio = formatMunicipioName(resolvedMunicipio);
          if (finalMunicipio && finalMunicipio !== 'Mato Grosso do Sul') {
            munSet.add(finalMunicipio);
          }

          const featureColor = tecId ? getTechnicianColor(tecName, index) : '#94a3b8';
          const origemCalculada = p.codigo_car ? 'CAR' : p.codigo_sigef ? 'SIGEF' : 'Manual';

          let e = p.etapa || latestAudit?.etapa;
          if (!e) {
            if (auditStatus === 'Autoavaliação') e = 'Auditoria Prévia';
            else if (['Visita de Campo', 'Em Análise', 'Certificada', 'Acompanhamento'].includes(auditStatus)) e = 'Auditoria Oficial';
            else e = 'Prospecção';
          }

          return {
            type: 'Feature' as const,
            properties: {
              id: p.id,
              nome_fazenda: p.nome_fazenda,
              nome_produtor: p.nome_produtor || 'Produtor Rural',
              municipio: finalMunicipio,
              tecnico_nome: tecName,
              tecnico_id: tecId,
              color: featureColor,
              status: auditStatus,
              etapa: e,
              codigo_car: p.codigo_car || '',
              codigo_sigef: p.codigo_sigef || '',
              origem: origemCalculada,
              latestAudit: latestAudit || null
            },
            geometry: geom
          };
        })
      );

      // Adicionar municípios padrão de MS no filtro
      ['Maracaju', 'Sidrolândia', 'Dourados', 'Campo Grande', 'Ponta Porã', 'Três Lagoas', 'Naviraí', 'Rio Verde de Mato Grosso', 'Chapadão do Sul', 'São Gabriel do Oeste', 'Costa Rica', 'Bela Vista'].forEach(m => munSet.add(m));

      setMunicipiosList(Array.from(munSet).sort());
      setFarmsData({ type: 'FeatureCollection', features });
    } catch (err: any) {
      console.error('Erro ao carregar mapa do gestor:', err);
    } finally {
      setLoading(false);
    }
  }

  // Filtragem Dinâmica de Alta Performance para Grande Volume
  const filteredFeatures = farmsData.features.filter(f => {
    const props = f.properties || {};

    // 1. Busca Textual
    const q = searchQuery.toLowerCase().trim();
    const matchSearch = q === '' ||
      (props.nome_fazenda || '').toLowerCase().includes(q) ||
      (props.nome_produtor || '').toLowerCase().includes(q) ||
      (props.municipio || '').toLowerCase().includes(q) ||
      (props.codigo_car || '').toLowerCase().includes(q) ||
      (props.codigo_sigef || '').toLowerCase().includes(q) ||
      (props.tecnico_nome || '').toLowerCase().includes(q);

    // 2. Filtro de Município
    const matchMun = selectedMunicipio === '' || props.municipio === selectedMunicipio;

    // 3. Filtro de Status e Etapa
    const matchStatus = selectedStatus === '' || props.status === selectedStatus;
    const matchEtapa = selectedEtapa === '' || props.etapa === selectedEtapa;

    // 4. Filtro de Técnico
    const matchTec = selectedTecnicoId === '' || 
      (selectedTecnicoId === 'sem_tecnico' ? !props.tecnico_id : props.tecnico_id === selectedTecnicoId);

    // 5. Filtro de Origem
    const matchOrigem = selectedOrigem === '' || props.origem === selectedOrigem;

    return matchSearch && matchMun && matchStatus && matchEtapa && matchTec && matchOrigem;
  });

  const filteredGeoJSON: FeatureCollection = {
    type: 'FeatureCollection',
    features: filteredFeatures
  };

  // Estatísticas Rápidas dos Filtros Ativos
  const totalCount = filteredFeatures.length;
  const certificadasCount = filteredFeatures.filter(f => f.properties?.status === 'Certificada').length;
  const emAuditoriaCount = filteredFeatures.filter(f => ['Visita de Campo', 'Em Análise', 'Autoavaliação'].includes(f.properties?.status)).length;
  const acompanhamentoCount = filteredFeatures.filter(f => f.properties?.status === 'Acompanhamento').length;

  const handleOpenAuditDetail = (props: any) => {
    let auditObj = props.latestAudit;
    if (!auditObj) {
      auditObj = {
        id: `mock-gestor-${props.id}`,
        status: props.status || 'Autoavaliação',
        data_agendamento: new Date().toISOString(),
        propriedade_id: props.id,
        propriedades: {
          id: props.id,
          nome_fazenda: props.nome_fazenda,
          nome_produtor: props.nome_produtor,
          codigo_car: props.codigo_car,
          codigo_sigef: props.codigo_sigef,
          municipio: props.municipio
        }
      };
    } else if (!auditObj.propriedades) {
      auditObj.propriedades = {
        id: props.id,
        nome_fazenda: props.nome_fazenda,
        nome_produtor: props.nome_produtor,
        codigo_car: props.codigo_car,
        codigo_sigef: props.codigo_sigef,
        municipio: props.municipio
      };
    }
    setSelectedAuditForDetail(auditObj);
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedMunicipio('');
    setSelectedStatus('');
    setSelectedTecnicoId('');
    setSelectedOrigem('');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
              <MapIcon className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Mapa e Cruzamento Espacial
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Monitoramento geoespacial unificado de todas as fazendas registradas no Mato Grosso do Sul (Imasul/IBGE/SIGEF).
          </p>
        </div>

        <button
          type="button"
          onClick={fetchGestorMapData}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Mapa</span>
        </button>
      </div>

      {/* Cards de Métricas em Tempo Real */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{totalCount}</div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Fazendas Visíveis</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-100 text-emerald-800 rounded-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{certificadasCount}</div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Certificadas RTRS</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{emAuditoriaCount}</div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Em Auditoria / Visita</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-700 rounded-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{acompanhamentoCount}</div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Acompanhamento</div>
          </div>
        </div>
      </div>

      {/* Painel Principal com Sidebar de Filtros e Mapa */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-3" />
          <p className="text-sm font-bold text-slate-700">Processando geometrias e camadas territoriais...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* PAINEL ESQUERDO: BARRA DE FILTROS & LISTA DE FAZENDAS */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <Filter className="w-4 h-4 text-emerald-700" />
                  Filtros de Grande Volume
                </h3>
                {(searchQuery || selectedMunicipio || selectedStatus || selectedTecnicoId || selectedOrigem) && (
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Limpar Filtros
                  </button>
                )}
              </div>

              {/* Busca Textual */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input 
                  type="text" 
                  placeholder="Buscar por fazenda, produtor, CAR ou técnico..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-xs font-medium transition-all"
                />
              </div>

              {/* Filtros em Grade */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Município */}
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Município MS</label>
                  <select
                    value={selectedMunicipio}
                    onChange={e => setSelectedMunicipio(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <option value="">Todos os Municípios</option>
                    {municipiosList.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {/* Etapa RTRS */}
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Etapa RTRS</label>
                  <select
                    value={selectedEtapa}
                    onChange={e => setSelectedEtapa(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <option value="">Todas as 3 Etapas</option>
                    <option value="Prospecção">1. Prospecção</option>
                    <option value="Auditoria Prévia">2. Auditoria Prévia</option>
                    <option value="Auditoria Oficial">3. Auditoria Oficial</option>
                  </select>
                </div>

                {/* Técnico Responsável */}
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Técnico Responsável</label>
                  <select
                    value={selectedTecnicoId}
                    onChange={e => setSelectedTecnicoId(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <option value="">Todos os Técnicos</option>
                    {allTechnicians.map(t => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                    <option value="sem_tecnico">Sem Técnico Atribuído</option>
                  </select>
                </div>

                {/* Origem */}
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Origem Geográfica</label>
                  <select
                    value={selectedOrigem}
                    onChange={e => setSelectedOrigem(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <option value="">Todas as Fontes</option>
                    <option value="CAR">CAR Oficial (Imasul)</option>
                    <option value="SIGEF">SIGEF (Incra)</option>
                    <option value="Manual">Cadastro Manual</option>
                  </select>
                </div>
              </div>

              {/* Lista de Fazendas */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Fazendas Filtradas ({totalCount})
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold">Clique para centralizar</span>
                </div>

                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {filteredFeatures.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 space-y-1">
                      <AlertTriangle className="w-8 h-8 mx-auto text-amber-400" />
                      <p className="text-xs font-bold text-slate-700">Nenhuma fazenda encontrada.</p>
                      <p className="text-[11px]">Tente ajustar ou limpar os filtros acima.</p>
                    </div>
                  ) : (
                    filteredFeatures.map((f, idx) => {
                      const props = f.properties || {};
                      const isSelected = selectedFarmId === props.id;

                      return (
                        <div
                          key={props.id || idx}
                          onClick={() => setSelectedFarmId(props.id)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-2 ${
                            isSelected 
                              ? 'bg-emerald-50/80 border-emerald-500 shadow-md ring-2 ring-emerald-500/20' 
                              : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/80 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <h4 className="font-bold text-slate-900 text-xs tracking-tight line-clamp-1">{props.nome_fazenda}</h4>
                              <p className="text-[11px] text-slate-500 font-medium">{props.nome_produtor}</p>
                            </div>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border shrink-0 ${
                              props.status === 'Certificada' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                              props.status === 'Visita de Campo' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                              props.status === 'Em Análise' ? 'bg-purple-100 text-purple-800 border-purple-300' :
                              'bg-amber-100 text-amber-800 border-amber-300'
                            }`}>
                              {props.status}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold pt-1 border-t border-slate-200/50">
                            <span className="flex items-center gap-1 text-slate-700">
                              <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                              {props.municipio}
                            </span>
                            
                            <span className="flex items-center gap-1 text-slate-600">
                              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: props.color || '#94a3b8' }}></span>
                              {props.tecnico_nome}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenAuditDetail(props);
                              }}
                              className="text-[11px] text-emerald-700 hover:text-emerald-900 font-extrabold flex items-center gap-1 underline cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Ficha Detalhada</span>
                            </button>

                            <span className="text-[9px] font-mono text-slate-400 uppercase">
                              {props.origem}: {props.codigo_car?.slice(0, 14) || props.codigo_sigef?.slice(0, 10) || 'GEO'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* PAINEL DIREITO: MAPA INTERATIVO COM CAMADAS */}
          <div className="lg:col-span-2 relative">
            <div className="h-[680px] w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative">
              <MapView 
                farms={filteredGeoJSON}
                farmsData={filteredGeoJSON}
                selectedFarmId={selectedFarmId}
                onSelectFarm={setSelectedFarmId}
                activeTab="mapa"
              />
            </div>
          </div>

        </div>
      )}

      {/* Modal de Detalhes da Auditoria / Propriedade */}
      {selectedAuditForDetail && (
        <AuditDetailModal
          isOpen={!!selectedAuditForDetail}
          onClose={() => setSelectedAuditForDetail(null)}
          auditoria={selectedAuditForDetail}
          onStartVisita={() => {}}
          onOpenPendencias={() => {}}
        />
      )}
    </div>
  );
}
