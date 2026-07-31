import { useState, useEffect, useRef } from 'react';
import { Search, Upload, Loader2, MapPin, FileText, X, Building2, Navigation, Compass } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import LocationFinderModal, { type LocationResult } from '../map/LocationFinderModal';

export type PropertyOrigin = 'CAR' | 'SIGEF' | 'KML' | 'Mapa' | 'Manual';

export interface PropertyCodeResult {
  nome_fazenda: string;
  codigo_car: string;
  codigo_sigef: string;
  origem: PropertyOrigin;
  geom: any | null;
}

interface Props {
  onChange: (data: PropertyCodeResult) => void;
  initialNomeFazenda?: string;
  initialCodigoCar?: string;
}

// Sanitização e higienização de acentuação e caracteres corrompidos
function cleanEncoding(str: string | null | undefined): string {
  if (!str) return '';
  let cleaned = str;
  cleaned = cleaned
    .replace(/CAMPAN[\uFFFD]RIO|CAMPAN.RIO/gi, 'CAMPANÁRIO')
    .replace(/[\uFFFD]rea|.rea/gi, 'Área')
    .replace(/S[\uFFFD]O|S.O/gi, 'SÃO')
    .replace(/JO[\uFFFD]O|JO.O/gi, 'JOÃO')
    .replace(/TR[\uFFFD]S|TR.S/gi, 'TRÊS')
    .replace(/CONCEI[\uFFFD][\uFFFD]O|CONCEI[\uFFFD]O/gi, 'CONCEIÇÃO')
    .replace(/UNI[\uFFFD]O/gi, 'UNIÃO')
    .replace(/EST[\uFFFD]NCIA/gi, 'ESTÂNCIA')
    .replace(/PATRIM[\uFFFD]NIO/gi, 'PATRIMÔNIO')
    .replace(/[\uFFFD]GUA/gi, 'ÁGUA')
    .replace(/ITAIP[\uFFFD]/gi, 'ITAIPÚ')
    .replace(/[\uFFFD]/g, '');

  return cleaned.trim();
}

// ============================================================================
// FORMATAÇÃO DO CAR
// ============================================================================

/** Remove todos os caracteres que não sejam alfanuméricos */
function stripNonAlphanumeric(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Formata um código CAR cru para o padrão UF-1234567-AAAA.BBBB.CCCC.DDDD */
function formatCarCode(raw: string): string {
  const clean = stripNonAlphanumeric(raw);
  if (!clean) return '';
  let result = '';

  for (let i = 0; i < clean.length && i < 41; i++) {
    if (i === 2) result += '-';       // Após UF (ex: MS-)
    if (i === 9) result += '-';       // Após código IBGE de 7 dígitos (ex: MS-5006606-)
    if (i > 9 && (i - 9) % 4 === 0) result += '.'; // A cada bloco de 4 caracteres hexadecimais (ex: .D581.3C88)
    result += clean[i];
  }

  return result;
}

/** Extrai o prefixo UF-IBGE (ex: "MS-5455690") de um código CAR formatado */
function extractCarPrefix(formatted: string): string | null {
  const match = formatted.match(/^([A-Z]{2})-?(\d{7})/);
  if (match) return `${match[1]}-${match[2]}`;
  return null;
}

// ============================================================================
// KML/KMZ PARSER
// ============================================================================

async function parseKmlFile(file: File): Promise<{ name: string; geom: any } | null> {
  let xmlText: string;

  if (file.name.toLowerCase().endsWith('.kmz')) {
    // KMZ is a zip file containing a .kml
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(file);
    const kmlFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.kml'));
    if (!kmlFile) return null;
    xmlText = await kmlFile.async('text');
  } else {
    xmlText = await file.text();
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  // Encontrar o primeiro Placemark
  const placemarks = doc.getElementsByTagName('Placemark');
  if (placemarks.length === 0) return null;

  const placemark = placemarks[0];

  // Extrair nome
  const nameEl = placemark.getElementsByTagName('name')[0];
  const name = nameEl?.textContent?.trim() || 'Propriedade KML';

  // Extrair coordenadas do polígono
  const coordsEl = placemark.getElementsByTagName('coordinates')[0];
  if (!coordsEl) return null;

  const coordsText = coordsEl.textContent?.trim() || '';
  const coords = coordsText.split(/\s+/).map(c => {
    const [lng, lat] = c.split(',').map(Number);
    return [lng, lat];
  }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));

  if (coords.length < 3) return null;

  // Garantir que o polígono está fechado
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([...first]);
  }

  const geom = {
    type: 'Polygon',
    coordinates: [coords]
  };

  return { name, geom };
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function PropertyCodeInput({ onChange, initialNomeFazenda = '', initialCodigoCar = '' }: Props) {
  const [mode, setMode] = useState<'CAR' | 'SIGEF' | 'KML' | 'Mapa'>('CAR');
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null);

  // CAR State
  const [carRaw, setCarRaw] = useState(stripNonAlphanumeric(initialCodigoCar));
  const [carFormatted, setCarFormatted] = useState(initialCodigoCar ? formatCarCode(initialCodigoCar) : '');
  const [carSuggestions, setCarSuggestions] = useState<any[]>([]);
  const [loadingCar, setLoadingCar] = useState(false);
  const [showCarDropdown, setShowCarDropdown] = useState(false);
  const carInputRef = useRef<HTMLInputElement>(null);

  // SIGEF State
  const [sigefQuery, setSigefQuery] = useState('');
  const [sigefResults, setSigefResults] = useState<any[]>([]);
  const [loadingSigef, setLoadingSigef] = useState(false);
  const [selectedSigef, setSelectedSigef] = useState<any>(null);

  // KML State
  const [kmlFile, setKmlFile] = useState<File | null>(null);
  const [kmlData, setKmlData] = useState<{ name: string; geom: any } | null>(null);
  const [loadingKml, setLoadingKml] = useState(false);

  // Nome da fazenda e Geometria ativa
  const [nomeFazenda, setNomeFazenda] = useState(initialNomeFazenda);
  const [activeGeom, setActiveGeom] = useState<any>(null);

  const handleConfirmMapLocation = (loc: LocationResult) => {
    setSelectedLocation(loc);
    setActiveGeom(loc.geom);
    const finalName = nomeFazenda.trim() || `Fazenda Sede (${loc.municipio})`;
    if (!nomeFazenda.trim()) setNomeFazenda(finalName);
    
    onChange({
      nome_fazenda: finalName,
      codigo_car: `MS-SEDE-${Math.floor(100000 + Math.random() * 900000)}`,
      codigo_sigef: '',
      origem: 'Mapa',
      geom: loc.geom
    });
  };

  // ---- CAR Auto-format and Autocomplete ----

  const handleCarInput = (value: string) => {
    const clean = stripNonAlphanumeric(value);
    setCarRaw(clean);
    
    // Sempre aplicar a formatação canônica do CAR (ex: MS-5006606-D581.3C88.A7F6...)
    const formatted = formatCarCode(clean);
    setCarFormatted(formatted);

    // Emitir mudança para o pai
    onChange({
      nome_fazenda: nomeFazenda,
      codigo_car: formatted,
      codigo_sigef: '',
      origem: 'CAR',
      geom: null
    });

    // REGRA DE BUSCA DO CAR:
    // Apenas pesquisar se o usuário tiver digitado a UF + o código de 7 dígitos do município do IBGE + pelo menos mais 1 caractere (clean.length >= 10, ex: MS-5006606D...)
    if (clean.length >= 10) {
      fetchCarSuggestions(value, formatted, clean);
    } else {
      setCarSuggestions([]);
      setShowCarDropdown(false);
    }
  };

  const fetchCarSuggestions = async (rawInput: string, formatted: string, clean: string) => {
    if (!clean || clean.length < 10) {
      setCarSuggestions([]);
      setShowCarDropdown(false);
      return;
    }
    setLoadingCar(true);
    try {
      // Criar lista de termos de busca únicos (formatado e limpo com tamanho mínimo >= 10)
      const searchTerms = Array.from(new Set([formatted, clean, rawInput.trim()])).filter(t => t && t.length >= 10);

      let results: any[] = [];

      for (const term of searchTerms) {
        if (results.length >= 10) break;

        // 1. Tentar codigosica
        try {
          const { data } = await supabase
            .from('imoveis_car')
            .select('*')
            .ilike('codigosica', `%${term}%`)
            .limit(10);
          if (data && data.length > 0) results = [...results, ...data];
        } catch (e) {}

        // 2. Tentar cod_imovel
        try {
          const { data } = await supabase
            .from('imoveis_car')
            .select('*')
            .ilike('cod_imovel', `%${term}%`)
            .limit(10);
          if (data && data.length > 0) results = [...results, ...data];
        } catch (e) {}

        // 3. Tentar nomeprop_1 (Nome da fazenda no CAR-SHP-2026)
        try {
          const { data } = await supabase
            .from('imoveis_car')
            .select('*')
            .ilike('nomeprop_1', `%${term}%`)
            .limit(10);
          if (data && data.length > 0) results = [...results, ...data];
        } catch (e) {}

        // 4. Tentar nome_imovel
        try {
          const { data } = await supabase
            .from('imoveis_car')
            .select('*')
            .ilike('nome_imovel', `%${term}%`)
            .limit(10);
          if (data && data.length > 0) results = [...results, ...data];
        } catch (e) {}

        // 5. Tentar numerocar
        try {
          const { data } = await supabase
            .from('imoveis_car')
            .select('*')
            .ilike('numerocar', `%${term}%`)
            .limit(10);
          if (data && data.length > 0) results = [...results, ...data];
        } catch (e) {}
      }

      // Deduplicar resultados por ID/Código
      const uniqueMap = new Map();
      results.forEach(item => {
        const key = item.id || item.codigosica || item.cod_imovel || item.numerocar;
        if (key && !uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        }
      });
      const uniqueResults = Array.from(uniqueMap.values()).slice(0, 15);

      setCarSuggestions(uniqueResults);
      setShowCarDropdown(uniqueResults.length > 0);
    } catch (err) {
      console.warn('Erro ao buscar CAR:', err);
      setCarSuggestions([]);
      setShowCarDropdown(false);
    } finally {
      setLoadingCar(false);
    }
  };

  const selectCarSuggestion = async (suggestion: any) => {
    const cod_imovel = suggestion.codigosica || suggestion.cod_imovel || suggestion.numerocar || '';
    const nome_fazenda = suggestion.nomeprop_1 || suggestion.nome_imovel || nomeFazenda || '';
    const clean = stripNonAlphanumeric(cod_imovel);
    setCarRaw(clean);
    setCarFormatted(cod_imovel);
    setShowCarDropdown(false);

    // Auto-preencher nome da fazenda se disponível no banco
    if (nome_fazenda && (!nomeFazenda || nomeFazenda === 'Fazenda Nova')) {
      setNomeFazenda(nome_fazenda);
    }

    // Usar geometria direta se disponível
    let geom = suggestion.geom || null;

    if (!geom && cod_imovel) {
      try {
        let { data: carGeomData } = await supabase
          .from('imoveis_car')
          .select('geom')
          .eq('cod_imovel', cod_imovel)
          .limit(1)
          .maybeSingle();
        if (!carGeomData?.geom) {
          const { data: carGeomData2 } = await supabase
            .from('imoveis_car')
            .select('geom')
            .eq('codigosica', cod_imovel)
            .limit(1)
            .maybeSingle();
          carGeomData = carGeomData2;
        }
        if (carGeomData?.geom) {
          geom = typeof carGeomData.geom === 'string' && carGeomData.geom.trim().startsWith('{') ? JSON.parse(carGeomData.geom) : carGeomData.geom;
        }
      } catch (e) {}
    }

    setActiveGeom(geom);

    onChange({
      nome_fazenda: nome_fazenda || nomeFazenda,
      codigo_car: cod_imovel,
      codigo_sigef: '',
      origem: 'CAR',
      geom: geom
    });
  };

  // ---- SIGEF Search ----
  
  const formatSigefCode = (val: string) => {
    const clean = val.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    let formatted = '';
    if (clean.length > 0) formatted += clean.substring(0, 8);
    if (clean.length > 8) formatted += '-' + clean.substring(8, 12);
    if (clean.length > 12) formatted += '-' + clean.substring(12, 16);
    if (clean.length > 16) formatted += '-' + clean.substring(16, 20);
    if (clean.length > 20) formatted += '-' + clean.substring(20, 32);
    return formatted;
  };

  const handleSigefSearch = async (userInput: string) => {
    const trimmed = userInput.trim();
    if (!trimmed || trimmed.length < 3) {
      setSigefResults([]);
      return;
    }
    setLoadingSigef(true);
    setSelectedSigef(null);

    try {
      const clean = trimmed.replace(/[^a-zA-Z0-9]/g, '');
      const searchTerms = Array.from(new Set([trimmed, clean])).filter(t => t && t.length >= 3);

      let results: any[] = [];

      for (const term of searchTerms) {
        if (results.length >= 10) break;

        // 1. parcela_co
        try {
          const { data } = await supabase
            .from('imoveis_sigef')
            .select('*')
            .ilike('parcela_co', `%${term}%`)
            .limit(10);
          if (data && data.length > 0) results = [...results, ...data];
        } catch (e) {}

        // 2. codigo_imo
        try {
          const { data } = await supabase
            .from('imoveis_sigef')
            .select('*')
            .ilike('codigo_imo', `%${term}%`)
            .limit(10);
          if (data && data.length > 0) results = [...results, ...data];
        } catch (e) {}

        // 3. nome_area
        try {
          const { data } = await supabase
            .from('imoveis_sigef')
            .select('*')
            .ilike('nome_area', `%${term}%`)
            .limit(10);
          if (data && data.length > 0) results = [...results, ...data];
        } catch (e) {}
      }

      // Deduplicar resultados por ID/parcela_co
      const uniqueMap = new Map();
      results.forEach(item => {
        const key = item.id || item.parcela_co || item.codigo_imo;
        if (key && !uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        }
      });
      const uniqueResults = Array.from(uniqueMap.values()).slice(0, 15);

      setSigefResults(uniqueResults);
    } catch (err) {
      console.warn('Erro ao buscar SIGEF:', err);
      setSigefResults([]);
    } finally {
      setLoadingSigef(false);
    }
  };

  useEffect(() => {
    if (sigefQuery.trim().length >= 2) {
      const timer = setTimeout(() => handleSigefSearch(sigefQuery), 250);
      return () => clearTimeout(timer);
    } else {
      setSigefResults([]);
      setSelectedSigef(null);
    }
  }, [sigefQuery]);

  const selectSigefResult = async (item: any) => {
    const cleanName = cleanEncoding(item.nome_area);
    setSelectedSigef({ ...item, nome_area_clean: cleanName });
    setSigefQuery(item.parcela_co);
    setSigefResults([]); // Fechar menu de sugestões imediatamente ao selecionar
    
    if (cleanName) {
      setNomeFazenda(cleanName);
    }

    // Buscar geometria
    try {
      const { data } = await supabase
        .from('imoveis_sigef')
        .select('geom')
        .eq('parcela_co', item.parcela_co)
        .limit(1)
        .single();
        
      const geom = data?.geom || null;
      setActiveGeom(geom);

      onChange({
        nome_fazenda: cleanName || nomeFazenda,
        codigo_car: '',
        codigo_sigef: item.parcela_co,
        origem: 'SIGEF',
        geom: geom
      });
    } catch {
      setActiveGeom(null);
      onChange({
        nome_fazenda: cleanName || nomeFazenda,
        codigo_car: '',
        codigo_sigef: item.parcela_co,
        origem: 'SIGEF',
        geom: null
      });
    }
  };

  // ---- KML/KMZ Handler ----

  const handleKmlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setKmlFile(file);
    setLoadingKml(true);

    try {
      const result = await parseKmlFile(file);
      if (result) {
        setKmlData(result);
        setNomeFazenda(result.name);
        setActiveGeom(result.geom);
        onChange({
          nome_fazenda: result.name,
          codigo_car: '',
          codigo_sigef: '',
          origem: 'KML',
          geom: result.geom
        });
      } else {
        setKmlData(null);
        setActiveGeom(null);
      }
    } catch (err) {
      console.error('Erro ao processar KML/KMZ:', err);
      setKmlData(null);
      setActiveGeom(null);
    } finally {
      setLoadingKml(false);
    }
  };

  // ---- Nome da Fazenda handler ----

  const handleNomeFazendaChange = (value: string) => {
    setNomeFazenda(value);

    if (mode === 'CAR') {
      onChange({
        nome_fazenda: value,
        codigo_car: carFormatted,
        codigo_sigef: '',
        origem: 'CAR',
        geom: activeGeom
      });
    } else if (mode === 'SIGEF' && selectedSigef) {
      onChange({
        nome_fazenda: value,
        codigo_car: '',
        codigo_sigef: selectedSigef.parcela_co,
        origem: 'SIGEF',
        geom: activeGeom
      });
    } else if (mode === 'KML') {
      onChange({
        nome_fazenda: value,
        codigo_car: '',
        codigo_sigef: '',
        origem: 'KML',
        geom: activeGeom
      });
    }
  };

  // ---- Reset on mode change ----
  const handleModeChange = (newMode: 'CAR' | 'SIGEF' | 'KML' | 'Mapa') => {
    setMode(newMode);
    // Reset all states
    setCarRaw('');
    setCarFormatted('');
    setCarSuggestions([]);
    setShowCarDropdown(false);
    setSigefQuery('');
    setSigefResults([]);
    setSelectedSigef(null);
    setKmlFile(null);
    setKmlData(null);
    setNomeFazenda('');

    if (newMode !== 'Mapa') {
      setSelectedLocation(null);
      setActiveGeom(null);
    }

    onChange({
      nome_fazenda: '',
      codigo_car: '',
      codigo_sigef: '',
      origem: newMode === 'KML' ? 'KML' : newMode === 'SIGEF' ? 'SIGEF' : newMode === 'Mapa' ? 'Mapa' : 'CAR',
      geom: null
    });
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-4">
      {/* Nome da Fazenda */}
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-slate-600 uppercase">Nome da Fazenda</label>
        <input
          required
          type="text"
          placeholder="Ex: Fazenda Santa Maria"
          value={nomeFazenda}
          onChange={e => handleNomeFazendaChange(e.target.value)}
          className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-foreground"
        />
      </div>

      {/* Seletor de Modo */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-slate-600 uppercase">Fonte de Identificação do Imóvel Rural</label>
          <button
            type="button"
            onClick={() => setShowLocationModal(true)}
            className="text-[11px] font-extrabold text-[#1B7547] hover:text-[#16633b] flex items-center gap-1 cursor-pointer hover:underline"
          >
            <Compass className="w-3.5 h-3.5 text-[#C59B27]" />
            <span>📍 Localizar Sede no Mapa (Pop-up)</span>
          </button>
        </div>
        <div className="flex bg-slate-200/60 p-1 rounded-xl">
          {(['CAR', 'SIGEF', 'KML', 'Mapa'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => {
                handleModeChange(m);
                if (m === 'Mapa') setShowLocationModal(true);
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                mode === m
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {m === 'CAR' && <MapPin className="w-3 h-3 text-[#1B7547]" />}
              {m === 'SIGEF' && <Search className="w-3 h-3 text-[#1B7547]" />}
              {m === 'KML' && <Upload className="w-3 h-3 text-[#1B7547]" />}
              {m === 'Mapa' && <Navigation className="w-3 h-3 text-[#C59B27]" />}
              {m === 'CAR' ? 'CAR' : m === 'SIGEF' ? 'SIGEF' : m === 'KML' ? 'KML' : 'Mapa Pop-up'}
            </button>
          ))}
        </div>
      </div>

      {/* ---- MODO CAR ---- */}
      {mode === 'CAR' && (
        <div className="space-y-2 relative">
          <label className="text-[10px] font-bold text-slate-600 uppercase">
            Código CAR
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="Digite: MS5455690... (sem traços ou pontos)"
              value={carFormatted}
              onChange={e => handleCarInput(e.target.value)}
              ref={carInputRef}
              onFocus={() => {
                if (carSuggestions.length > 0) {
                  setShowCarDropdown(true);
                } else if (carFormatted.trim().length >= 2) {
                  fetchCarSuggestions(carFormatted, carFormatted, carRaw);
                }
              }}
              className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-foreground font-mono tracking-wide"
              maxLength={35}
            />
            {loadingCar && (
              <Loader2 className="w-4 h-4 animate-spin text-primary absolute right-3 top-2.5" />
            )}
          </div>
          <span className="text-[9px] text-muted-foreground block">
            Formato automático: UF-IBGE7DIG-AAAA.BBBB.CCCC.DDDD • Apenas digite números e letras
          </span>

          {/* Dropdown de sugestões */}
          {showCarDropdown && carSuggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-64 overflow-y-auto animate-in slide-in-from-top-1 duration-150">
              <div className="p-2 border-b border-border/50">
                <span className="text-[9px] text-muted-foreground font-bold uppercase">
                  {carSuggestions.length} imóvel(is) encontrado(s)
                </span>
              </div>
              {carSuggestions.map((s, i) => {
                const carCode = s.codigosica || s.cod_imovel || s.numerocar || 'N/A';
                const farmName = s.nomeprop_1 || s.nome_imovel;
                const mun = s.municipio;
                const area = s.areatotalc || s.area_total_ha;
                const status = s.situcaocad || s.situacao_cadastral;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectCarSuggestion(s)}
                    className="w-full px-3 py-2.5 text-left hover:bg-primary/10 transition-colors cursor-pointer border-b border-border/30 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="text-xs font-mono text-foreground truncate font-bold">{carCode}</span>
                    </div>
                    {farmName && (
                      <div className="text-[10px] text-emerald-700 font-semibold mt-0.5 ml-5 truncate">
                        🏠 {farmName}
                      </div>
                    )}
                    <div className="text-[9px] text-muted-foreground mt-0.5 ml-5 flex gap-2 flex-wrap">
                      {mun && <span>📍 {mun}</span>}
                      {area && <span>📐 {Number(area).toLocaleString('pt-BR')} ha</span>}
                      {status && (
                        <span className={`px-1 rounded text-[8px] font-bold ${
                          status === 'Aprovado' ? 'bg-emerald-100 text-emerald-800' :
                          status === 'Inscrito' ? 'bg-blue-100 text-blue-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {status}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---- MODO SIGEF ---- */}
      {mode === 'SIGEF' && (
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-600 uppercase">
            Código da Parcela (parcela_co)
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="Digite o código da parcela ou nome no SIGEF..."
              value={sigefQuery}
              onChange={e => setSigefQuery(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-foreground font-mono tracking-wide"
            />
            {loadingSigef && (
              <Loader2 className="w-4 h-4 animate-spin text-primary absolute right-3 top-2.5" />
            )}
          </div>
          <span className="text-[9px] text-muted-foreground block">
            Digite pelo menos 3 caracteres do código ou nome da parcela SIGEF para buscar
          </span>

          {/* Resultados SIGEF */}
          {sigefResults.length > 0 && (
            <div className="bg-card border border-border rounded-xl shadow-lg max-h-60 overflow-y-auto">
              <div className="p-2.5 bg-muted/40 border-b border-border/50">
                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">
                  {sigefResults.length} parcela(s) encontrada(s) no SIGEF
                </span>
              </div>
              {sigefResults.map((r, i) => {
                const cleanName = cleanEncoding(r.nome_area);
                const statusName = r.situacao_i || r.status || 'REGISTRADA';

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectSigefResult(r)}
                    className="w-full px-3.5 py-3 text-left hover:bg-purple-500/10 transition-colors cursor-pointer border-b border-border/30 last:border-0 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-xs text-foreground group-hover:text-purple-700 transition-colors truncate flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          {cleanName || 'Imóvel SIGEF'}
                        </h4>
                        <p className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate">
                          Parcela: <span className="text-foreground/80">{r.parcela_co}</span>
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground font-medium">
                          {r.codigo_imo && (
                            <span>Cód. Imóvel: <strong className="font-mono text-foreground">{r.codigo_imo}</strong></span>
                          )}
                          {r.municipio_ && (
                            <span>• {cleanEncoding(r.municipio_)}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-purple-100/70 text-purple-800 border border-purple-200 uppercase tracking-wider shrink-0 mt-0.5">
                        {statusName}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Fim Modo SIGEF */}
        </div>
      )}

      {/* ---- MODO KML/KMZ ---- */}
      {mode === 'KML' && (
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-600 uppercase">
            Upload de Arquivo KML ou KMZ
          </label>
          <div className="border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-primary/50 transition-colors">
            <input
              type="file"
              accept=".kml,.kmz"
              onChange={handleKmlUpload}
              className="hidden"
              id="kml-upload"
            />
            <label htmlFor="kml-upload" className="cursor-pointer space-y-2 block">
              {loadingKml ? (
                <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
              ) : kmlData ? (
                <div className="space-y-1">
                  <FileText className="w-6 h-6 text-emerald-600 mx-auto" />
                  <div className="text-xs font-bold text-emerald-800">{kmlFile?.name}</div>
                  <div className="text-[10px] text-emerald-700">
                    Placemark: "{kmlData.name}" • Polígono com {kmlData.geom?.coordinates?.[0]?.length || 0} vértices
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="w-6 h-6 text-muted-foreground mx-auto" />
                  <div className="text-xs text-muted-foreground font-medium">
                    Clique para selecionar um arquivo .kml ou .kmz
                  </div>
                </div>
              )}
            </label>
          </div>
          {kmlData && (
            <button
              type="button"
              onClick={() => {
                setKmlFile(null);
                setKmlData(null);
                setNomeFazenda('');
                onChange({ nome_fazenda: '', codigo_car: '', codigo_sigef: '', origem: 'KML', geom: null });
              }}
              className="text-[10px] text-destructive hover:underline cursor-pointer font-semibold"
            >
              Remover arquivo
            </button>
          )}
        </div>
      )}

      {/* ---- MODO MAPA POP-UP ---- */}
      {mode === 'Mapa' && (
        <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-950">
              <Navigation className="w-4 h-4 text-[#C59B27]" />
              <span>Localização da Sede via Mapa Pop-up</span>
            </div>
            <button
              type="button"
              onClick={() => setShowLocationModal(true)}
              className="px-3 py-1.5 bg-[#1B7547] hover:bg-[#16633b] text-white text-xs font-extrabold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Compass className="w-3.5 h-3.5 text-[#C59B27]" />
              <span>{selectedLocation ? 'Reabrir Mapa' : 'Abrir Mapa Pop-up'}</span>
            </button>
          </div>

          {selectedLocation ? (
            <div className="text-xs text-slate-700 font-medium bg-white p-3 rounded-xl border border-slate-200 space-y-1">
              <p className="font-bold text-[#1B7547]">✅ Ponto da Sede Definido!</p>
              <p>{selectedLocation.addressLabel}</p>
              <p className="text-[11px] text-slate-500 font-mono">Município: {selectedLocation.municipio}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              Clique no botão acima para abrir a janela flutuante com o mapa interativo, puxar seu GPS atual e definir o ponto exato da sede da sua fazenda.
            </p>
          )}
        </div>
      )}

      {/* Modal de Mapa Interativo da Sede */}
      <LocationFinderModal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        onConfirmLocation={handleConfirmMapLocation}
        initialFarmName={nomeFazenda}
      />
    </div>
  );
}
