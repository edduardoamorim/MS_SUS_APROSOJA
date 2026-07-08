import { useState, useEffect, useRef } from 'react';
import { Search, Upload, Loader2, MapPin, FileText, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export type PropertyOrigin = 'CAR' | 'SIGEF' | 'KML' | 'Manual';

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
  let result = '';

  for (let i = 0; i < clean.length && i < 41; i++) {
    if (i === 2) result += '-';       // Após UF
    if (i === 9) result += '-';       // Após código IBGE
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
  const [mode, setMode] = useState<'CAR' | 'SIGEF' | 'KML'>('CAR');

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

  // Nome da fazenda
  const [nomeFazenda, setNomeFazenda] = useState(initialNomeFazenda);

  // ---- CAR Auto-format and Autocomplete ----

  const handleCarInput = (value: string) => {
    const clean = stripNonAlphanumeric(value);
    setCarRaw(clean);
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

    // Se temos UF (2) + IBGE (7) = 9+ chars, buscar sugestões usando o código formatado completo
    if (clean.length >= 9) {
      fetchCarSuggestions(formatted);
    } else {
      setCarSuggestions([]);
      setShowCarDropdown(false);
    }
  };

  const fetchCarSuggestions = async (prefix: string) => {
    setLoadingCar(true);
    try {
      const { data, error } = await supabase
        .from('imoveis_car')
        .select('cod_imovel')
        .ilike('cod_imovel', `${prefix}%`)
        .limit(15);

      if (error) throw error;
      setCarSuggestions(data || []);
      setShowCarDropdown((data || []).length > 0);
    } catch (err) {
      console.warn('Erro ao buscar CAR:', err);
      setCarSuggestions([]);
    } finally {
      setLoadingCar(false);
    }
  };

  const selectCarSuggestion = async (cod_imovel: string) => {
    const clean = stripNonAlphanumeric(cod_imovel);
    setCarRaw(clean);
    setCarFormatted(cod_imovel);
    setShowCarDropdown(false);

    // Buscar geometria
    try {
      const { data } = await supabase
        .from('imoveis_car')
        .select('geom')
        .eq('cod_imovel', cod_imovel)
        .limit(1)
        .single();

      onChange({
        nome_fazenda: nomeFazenda,
        codigo_car: cod_imovel,
        codigo_sigef: '',
        origem: 'CAR',
        geom: data?.geom || null
      });
    } catch {
      onChange({
        nome_fazenda: nomeFazenda,
        codigo_car: cod_imovel,
        codigo_sigef: '',
        origem: 'CAR',
        geom: null
      });
    }
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

  const handleSigefSearch = async () => {
    const clean = sigefQuery.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length < 5) return;
    setLoadingSigef(true);
    setSelectedSigef(null);

    try {
      const { data, error } = await supabase
        .from('imoveis_sigef')
        .select('parcela_co, codigo_imo, nome_area, status, situacao_i')
        .ilike('parcela_co', `${sigefQuery}%`)
        .limit(15);

      if (error) throw error;
      setSigefResults(data || []);
    } catch (err) {
      console.warn('Erro ao buscar SIGEF:', err);
      setSigefResults([]);
    } finally {
      setLoadingSigef(false);
    }
  };

  useEffect(() => {
    const clean = sigefQuery.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length >= 5) {
      const timer = setTimeout(handleSigefSearch, 400);
      return () => clearTimeout(timer);
    } else {
      setSigefResults([]);
      setSelectedSigef(null);
    }
  }, [sigefQuery]);

  const selectSigefResult = async (item: any) => {
    setSelectedSigef(item);
    setSigefQuery(item.parcela_co);
    
    // Buscar geometria
    try {
      const { data } = await supabase
        .from('imoveis_sigef')
        .select('geom')
        .eq('parcela_co', item.parcela_co)
        .limit(1)
        .single();
        
      if (item.nome_area) {
        setNomeFazenda(item.nome_area);
      }

      onChange({
        nome_fazenda: item.nome_area || nomeFazenda,
        codigo_car: '',
        codigo_sigef: item.parcela_co,
        origem: 'SIGEF',
        geom: data?.geom || null
      });
    } catch {
      onChange({
        nome_fazenda: item.nome_area || nomeFazenda,
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
        onChange({
          nome_fazenda: result.name,
          codigo_car: '',
          codigo_sigef: '',
          origem: 'KML',
          geom: result.geom
        });
      } else {
        setKmlData(null);
      }
    } catch (err) {
      console.error('Erro ao processar KML/KMZ:', err);
      setKmlData(null);
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
        geom: null
      });
    } else if (mode === 'SIGEF' && selectedSigef) {
      onChange({
        nome_fazenda: value,
        codigo_car: '',
        codigo_sigef: selectedSigef.parcela_co,
        origem: 'SIGEF',
        geom: null
      });
    } else if (mode === 'KML' && kmlData) {
      onChange({
        nome_fazenda: value,
        codigo_car: '',
        codigo_sigef: '',
        origem: 'KML',
        geom: kmlData.geom
      });
    }
  };

  // ---- Reset on mode change ----
  const handleModeChange = (newMode: 'CAR' | 'SIGEF' | 'KML') => {
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

    onChange({
      nome_fazenda: '',
      codigo_car: '',
      codigo_sigef: '',
      origem: newMode === 'KML' ? 'KML' : newMode === 'SIGEF' ? 'SIGEF' : 'CAR',
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
        <label className="text-[10px] font-bold text-slate-600 uppercase">Fonte do Imóvel Rural</label>
        <div className="flex bg-slate-200/60 p-1 rounded-xl">
          {(['CAR', 'SIGEF', 'KML'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => handleModeChange(m)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                mode === m
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {m === 'CAR' && <MapPin className="w-3 h-3" />}
              {m === 'SIGEF' && <Search className="w-3 h-3" />}
              {m === 'KML' && <Upload className="w-3 h-3" />}
              {m === 'CAR' ? 'CAR (SICAR)' : m === 'SIGEF' ? 'SIGEF (INCRA)' : 'KML / KMZ'}
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
              onFocus={() => carSuggestions.length > 0 && setShowCarDropdown(true)}
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
            <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto animate-in slide-in-from-top-1 duration-150">
              <div className="p-2 border-b border-border/50">
                <span className="text-[9px] text-muted-foreground font-bold uppercase">
                  {carSuggestions.length} imóvel(is) encontrado(s) no município
                </span>
              </div>
              {carSuggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectCarSuggestion(s.cod_imovel)}
                  className="w-full px-3 py-2 text-left text-xs font-mono hover:bg-primary/10 transition-colors cursor-pointer flex items-center gap-2 border-b border-border/30 last:border-0"
                >
                  <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span className="text-foreground">{s.cod_imovel}</span>
                </button>
              ))}
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
              placeholder="Ex: 3935c01b-e83c-41d1-8e45-243f53fac25e (sem traços)"
              value={sigefQuery}
              onChange={e => setSigefQuery(formatSigefCode(e.target.value))}
              className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-foreground font-mono tracking-wide"
            />
            {loadingSigef && (
              <Loader2 className="w-4 h-4 animate-spin text-primary absolute right-3 top-2.5" />
            )}
          </div>
          <span className="text-[9px] text-muted-foreground block">
            Digite pelo menos 5 caracteres do código da parcela SIGEF para buscar
          </span>

          {/* Resultados SIGEF */}
          {sigefResults.length > 0 && (
            <div className="bg-card border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto">
              <div className="p-2 border-b border-border/50">
                <span className="text-[9px] text-muted-foreground font-bold uppercase">
                  {sigefResults.length} parcela(s) encontrada(s)
                </span>
              </div>
              {sigefResults.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectSigefResult(r)}
                  className="w-full px-3 py-2.5 text-left hover:bg-primary/10 transition-colors cursor-pointer border-b border-border/30 last:border-0"
                >
                  <div className="text-xs font-mono text-foreground truncate">{r.parcela_co}</div>
                  {r.nome_area && (
                    <div className="text-[10px] text-emerald-700 font-semibold mt-0.5 truncate">
                      📌 {r.nome_area}
                    </div>
                  )}
                  <div className="text-[9px] text-muted-foreground mt-0.5">
                    {r.status || 'N/A'} • Cód. Imóvel: {r.codigo_imo || 'N/A'}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Selecionado */}
          {selectedSigef && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1 animate-in fade-in duration-200">
              <div className="flex justify-between items-start">
                <div className="text-[10px] font-bold text-emerald-800 uppercase">Parcela Selecionada</div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSigef(null);
                    setSigefQuery('');
                    setNomeFazenda('');
                    onChange({ nome_fazenda: '', codigo_car: '', codigo_sigef: '', origem: 'SIGEF', geom: null });
                  }}
                  className="p-0.5 text-emerald-600 hover:text-red-600 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="text-xs font-mono text-emerald-900 truncate">{selectedSigef.parcela_co}</div>
              {selectedSigef.nome_area && (
                <div className="text-xs text-emerald-800 font-semibold">Nome: {selectedSigef.nome_area}</div>
              )}
              <div className="text-[9px] text-emerald-700">Status: {selectedSigef.status || 'N/A'}</div>
            </div>
          )}
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
    </div>
  );
}
