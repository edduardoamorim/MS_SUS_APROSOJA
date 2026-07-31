import { useState, useEffect, useRef } from 'react';
import Map, { NavigationControl, Marker, Source, Layer } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, Navigation, Search, CheckCircle2, X, Loader2, Sparkles, Building2 } from 'lucide-react';
import Modal from '../ui/Modal';

export interface LocationResult {
  lat: number;
  lng: number;
  municipio: string;
  geom: any;
  addressLabel: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirmLocation: (result: LocationResult) => void;
  initialFarmName?: string;
}

// Estilo Google Maps Híbrido Exclusivo (Imagens de Satélite HD + Vias, Rodovias, Nomes e Informações de Terreno)
const googleHybridStyle: any = {
  version: 8,
  sources: {
    'google-hybrid': {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        'https://mt2.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        'https://mt3.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
      ],
      tileSize: 256,
      attribution: '&copy; Google Maps'
    }
  },
  layers: [
    {
      id: 'google-hybrid-layer',
      type: 'raster',
      source: 'google-hybrid',
      minzoom: 0,
      maxzoom: 20
    }
  ]
};

// Lista de Todos os 79 Municípios de Mato Grosso do Sul (MS) com Latitude e Longitude Exatas
export const MS_MUNICIPALITIES: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Água Clara', lat: -20.4439, lng: -52.8794 },
  { name: 'Alcinópolis', lat: -18.3244, lng: -53.7042 },
  { name: 'Amambai', lat: -23.1047, lng: -55.2258 },
  { name: 'Anastácio', lat: -20.4836, lng: -55.8067 },
  { name: 'Anaurilândia', lat: -22.1856, lng: -52.7172 },
  { name: 'Angélica', lat: -22.1533, lng: -53.7708 },
  { name: 'Antônio João', lat: -22.1936, lng: -55.9489 },
  { name: 'Aparecida do Taboado', lat: -20.0864, lng: -51.0939 },
  { name: 'Aquidauana', lat: -20.4711, lng: -55.7872 },
  { name: 'Aral Moreira', lat: -23.0125, lng: -55.6353 },
  { name: 'Bandeirantes', lat: -19.9214, lng: -54.3647 },
  { name: 'Bataguassu', lat: -21.7139, lng: -52.4228 },
  { name: 'Batayporã', lat: -22.2956, lng: -53.2711 },
  { name: 'Bela Vista', lat: -22.1089, lng: -56.5211 },
  { name: 'Bodoquena', lat: -20.5389, lng: -56.7158 },
  { name: 'Bonito', lat: -21.1211, lng: -56.4819 },
  { name: 'Brasilândia', lat: -21.2561, lng: -52.0358 },
  { name: 'Caarapó', lat: -22.6342, lng: -54.8219 },
  { name: 'Camapuã', lat: -19.5314, lng: -54.0439 },
  { name: 'Campo Grande', lat: -20.4428, lng: -54.6464 },
  { name: 'Caracol', lat: -22.0136, lng: -57.0256 },
  { name: 'Cassilândia', lat: -19.1108, lng: -51.7342 },
  { name: 'Chapadão do Sul', lat: -18.7942, lng: -52.6225 },
  { name: 'Corguinho', lat: -19.8292, lng: -54.8286 },
  { name: 'Coronel Sapucaia', lat: -23.2711, lng: -55.5289 },
  { name: 'Corumbá', lat: -19.0089, lng: -57.6533 },
  { name: 'Costa Rica', lat: -18.5244, lng: -52.9772 },
  { name: 'Coxim', lat: -18.5067, lng: -54.7600 },
  { name: 'Deodápolis', lat: -22.2764, lng: -54.1628 },
  { name: 'Dois Irmãos do Buriti', lat: -20.6808, lng: -55.5119 },
  { name: 'Douradina', lat: -22.0436, lng: -54.6144 },
  { name: 'Dourados', lat: -22.2231, lng: -54.8122 },
  { name: 'Eldorado', lat: -23.7869, lng: -54.2839 },
  { name: 'Fátima do Sul', lat: -22.3736, lng: -54.5128 },
  { name: 'Figueirão', lat: -18.6775, lng: -53.6375 },
  { name: 'Glória de Dourados', lat: -22.4178, lng: -54.2306 },
  { name: 'Guia Lopes da Laguna', lat: -21.4589, lng: -56.1158 },
  { name: 'Iguatemi', lat: -23.6803, lng: -54.5614 },
  { name: 'Inocência', lat: -19.7250, lng: -51.9300 },
  { name: 'Itaporã', lat: -22.0789, lng: -54.6897 },
  { name: 'Itaquiraí', lat: -23.4756, lng: -54.1844 },
  { name: 'Ivinhema', lat: -22.3047, lng: -53.8186 },
  { name: 'Japorã', lat: -23.8869, lng: -54.4022 },
  { name: 'Jaraguari', lat: -20.1417, lng: -54.3986 },
  { name: 'Jardim', lat: -21.4803, lng: -56.1381 },
  { name: 'Jateí', lat: -22.5136, lng: -54.3114 },
  { name: 'Juti', lat: -22.8611, lng: -54.6044 },
  { name: 'Ladário', lat: -19.0047, lng: -57.6019 },
  { name: 'Laguna Carapã', lat: -22.5414, lng: -55.1581 },
  { name: 'Maracaju', lat: -21.6144, lng: -55.1683 },
  { name: 'Miranda', lat: -20.2406, lng: -56.3789 },
  { name: 'Mundo Novo', lat: -23.9422, lng: -54.2789 },
  { name: 'Naviraí', lat: -23.0650, lng: -54.1906 },
  { name: 'Nioaque', lat: -21.1350, lng: -55.8306 },
  { name: 'Nova Alvorada do Sul', lat: -21.3658, lng: -54.3831 },
  { name: 'Nova Andradina', lat: -22.2392, lng: -53.3444 },
  { name: 'Novo Horizonte do Sul', lat: -22.3836, lng: -53.8569 },
  { name: 'Paraíso das Águas', lat: -19.0167, lng: -53.0119 },
  { name: 'Paranaíba', lat: -19.6769, lng: -51.1908 },
  { name: 'Paranhos', lat: -23.8925, lng: -55.4311 },
  { name: 'Pedro Gomes', lat: -18.1006, lng: -54.5519 },
  { name: 'Ponta Porã', lat: -22.5361, lng: -55.7256 },
  { name: 'Porto Murtinho', lat: -21.6989, lng: -57.8825 },
  { name: 'Ribas do Rio Pardo', lat: -20.4489, lng: -53.7586 },
  { name: 'Rio Brilhante', lat: -21.8019, lng: -54.5458 },
  { name: 'Rio Negro', lat: -19.4478, lng: -54.9856 },
  { name: 'Rio Verde de Mato Grosso', lat: -18.9181, lng: -54.8442 },
  { name: 'Rochedo', lat: -19.9525, lng: -54.8872 },
  { name: 'Santa Rita do Pardo', lat: -21.3025, lng: -52.8319 },
  { name: 'São Gabriel do Oeste', lat: -19.3950, lng: -54.5614 },
  { name: 'Selvíria', lat: -20.3683, lng: -51.4189 },
  { name: 'Sete Quedas', lat: -23.9714, lng: -55.0358 },
  { name: 'Sidrolândia', lat: -20.9319, lng: -54.9614 },
  { name: 'Sonora', lat: -17.5703, lng: -54.7564 },
  { name: 'Tacuru', lat: -23.6339, lng: -55.0156 },
  { name: 'Taquarussu', lat: -22.4889, lng: -53.3528 },
  { name: 'Terenos', lat: -20.4419, lng: -54.8614 },
  { name: 'Três Lagoas', lat: -20.7849, lng: -51.7007 },
  { name: 'Vicentina', lat: -22.4089, lng: -54.4372 }
];

// Função auxiliar para encontrar o município de MS mais próximo por coordenadas
export function getNearestMSMunicipality(lat: number, lng: number): string {
  let minDistance = Infinity;
  let nearestName = 'Campo Grande, MS';

  for (const city of MS_MUNICIPALITIES) {
    const dLat = city.lat - lat;
    const dLng = city.lng - lng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < minDistance) {
      minDistance = dist;
      nearestName = `${city.name}, MS`;
    }
  }
  return nearestName;
}

export default function LocationFinderModal({
  isOpen,
  onClose,
  onConfirmLocation,
  initialFarmName = ''
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Ponto central padrão: Mato Grosso do Sul (Maracaju / Campo Grande)
  const [markerPos, setMarkerPos] = useState<{ lat: number; lng: number }>({
    lat: -21.6144,
    lng: -55.1683
  });

  const [viewState, setViewState] = useState({
    longitude: -55.1683,
    latitude: -21.6144,
    zoom: 11
  });

  const [loadingGps, setLoadingGps] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [municipio, setMunicipio] = useState('Maracaju, MS');
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Filtrar sugestões de municípios conforme a digitação (suporta acentos)
  const searchSuggestions = searchQuery.trim().length >= 1
    ? MS_MUNICIPALITIES.filter(c => {
        const queryNorm = searchQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const nameNorm = c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return nameNorm.includes(queryNorm);
      }).slice(0, 7)
    : [];

  // Atualizar o nome do município quando o pino se move
  const updateMunicipioFromCoords = (lat: number, lng: number) => {
    const nearest = getNearestMSMunicipality(lat, lng);
    setMunicipio(nearest);
  };

  // Fechar dropdown de sugestões ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Solicitar geolocalização ao abrir o modal
  useEffect(() => {
    if (isOpen) {
      handleGetGPSLocation();
    }
  }, [isOpen]);

  const handleGetGPSLocation = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocalização não suportada no seu navegador.');
      return;
    }

    setLoadingGps(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setMarkerPos({ lat: latitude, lng: longitude });
        updateMunicipioFromCoords(latitude, longitude);
        setViewState(prev => ({
          ...prev,
          latitude,
          longitude,
          zoom: 14
        }));
        if (mapRef.current) {
          mapRef.current.flyTo({ center: [longitude, latitude], zoom: 14, duration: 1500 });
        }
        setLoadingGps(false);
      },
      (err) => {
        console.warn('Aviso de geolocalização GPS:', err);
        setGpsError('Não foi possível obter GPS automático. Navegue ou toque no mapa para posicionar a sede.');
        setLoadingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleMapClick = (e: any) => {
    if (!e.lngLat) return;
    const { lng, lat } = e.lngLat;
    setMarkerPos({ lat, lng });
    updateMunicipioFromCoords(lat, lng);
  };

  const handleSelectCity = (city: { name: string; lat: number; lng: number }) => {
    setMarkerPos({ lat: city.lat, lng: city.lng });
    setMunicipio(`${city.name}, MS`);
    setSearchQuery(city.name);
    setShowSuggestions(false);

    if (mapRef.current) {
      mapRef.current.flyTo({ center: [city.lng, city.lat], zoom: 13, duration: 1500 });
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchSuggestions.length > 0) {
      handleSelectCity(searchSuggestions[0]);
    }
  };

  // Gerar polígono circular simples de ~800m ao redor da sede
  const generateBoundaryGeom = (lat: number, lng: number) => {
    const delta = 0.008;
    return {
      type: 'Polygon',
      coordinates: [[
        [lng - delta, lat + delta],
        [lng + delta, lat + delta],
        [lng + delta, lat - delta],
        [lng - delta, lat - delta],
        [lng - delta, lat + delta]
      ]]
    };
  };

  const handleConfirm = () => {
    const geom = generateBoundaryGeom(markerPos.lat, markerPos.lng);
    onConfirmLocation({
      lat: markerPos.lat,
      lng: markerPos.lng,
      municipio,
      geom,
      addressLabel: `Coordenadas: ${markerPos.lat.toFixed(5)}, ${markerPos.lng.toFixed(5)} (${municipio})`
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      maxWidth="max-w-4xl"
    >
      <div className="space-y-3 sm:space-y-4">
        {/* Cabeçalho Corporativo Responsivo com Gradiente APROSOJA */}
        <div className="relative -mx-6 -mt-6 p-4 sm:p-6 bg-gradient-to-r from-[#1B7547] via-[#16633b] to-[#0f4d2c] text-white rounded-t-2xl overflow-hidden shadow-sm">
          <div className="flex justify-between items-start gap-3 relative z-10">
            <div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white px-2 sm:px-2.5 py-0.5 rounded-full backdrop-blur-sm border border-white/20">
                  Geolocalização Interativa
                </span>
                <span className="text-[9px] sm:text-[10px] font-semibold bg-[#C59B27] text-white px-2 sm:px-2.5 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> GPS Ativo
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight mt-1 flex items-center gap-2">
                <MapPin className="w-5 h-5 sm:w-6 sm:h-6 text-[#C59B27] animate-bounce shrink-0" />
                <span>Localizar Sede no Mapa</span>
              </h2>
              <p className="text-[11px] sm:text-xs text-emerald-100 mt-1 font-medium leading-normal">
                Puxe sua localização por GPS ou toque no mapa para posicionar a sede da sua fazenda.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de Ações Rápidas & Autocomplete de Municípios em MS (Totalmente Responsiva) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50 p-2.5 sm:p-3 rounded-2xl border border-slate-200/80">
          <button
            type="button"
            onClick={handleGetGPSLocation}
            disabled={loadingGps}
            className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1B7547] hover:bg-[#16633b] text-white font-extrabold text-xs rounded-xl transition-all duration-300 shadow-sm active:scale-98 cursor-pointer disabled:opacity-50 min-h-[42px]"
          >
            {loadingGps ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Navigation className="w-4 h-4 text-[#C59B27] group-hover:rotate-45 transition-transform duration-300 shrink-0" />
            )}
            <span>{loadingGps ? 'Obtendo GPS...' : 'Usar Minha Posição Atual (GPS)'}</span>
          </button>

          <div ref={searchBoxRef} className="relative w-full sm:max-w-xs">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar município em MS..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#1B7547] focus:outline-none text-foreground min-h-[42px]"
                />
              </div>
              <button
                type="submit"
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer shrink-0 min-h-[42px]"
              >
                Buscar
              </button>
            </form>

            {/* Menu Dropdown de Autocomplete com Todos os 79 Municípios de MS */}
            {showSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute z-[999] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto p-1 animate-in fade-in-50">
                <div className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase border-b border-slate-100 flex justify-between items-center">
                  <span>Municípios de MS Encontrados</span>
                  <span className="bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded text-[8px] font-bold">
                    {searchSuggestions.length}
                  </span>
                </div>
                {searchSuggestions.map((city, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelectCity(city)}
                    className="w-full px-3 py-2 text-left hover:bg-emerald-50 text-slate-800 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer my-0.5"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-[#1B7547] shrink-0" />
                      <span className="truncate">{city.name}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">MS</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {gpsError && (
          <div className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200 font-medium">
            {gpsError}
          </div>
        )}

        {/* Container do Mapa Interativo com Google Maps Híbrido Exclusivo (Responsivo) */}
        <div className="relative w-full h-72 sm:h-96 rounded-2xl overflow-hidden border border-slate-300 shadow-inner group">
          <Map
            ref={mapRef}
            {...viewState}
            onMove={evt => setViewState(evt.viewState)}
            onClick={handleMapClick}
            mapStyle={googleHybridStyle}
            style={{ width: '100%', height: '100%' }}
          >
            <NavigationControl position="top-right" />

            {/* Delimitação da Fazenda (GeoJSON) */}
            <Source
              id="farm-boundary"
              type="geojson"
              data={{
                type: 'Feature',
                geometry: generateBoundaryGeom(markerPos.lat, markerPos.lng),
                properties: {}
              }}
            >
              <Layer
                id="farm-fill"
                type="fill"
                paint={{
                  'fill-color': '#1B7547',
                  'fill-opacity': 0.3
                }}
              />
              <Layer
                id="farm-stroke"
                type="line"
                paint={{
                  'line-color': '#C59B27',
                  'line-width': 3
                }}
              />
            </Source>

            {/* Marcador Arrastável da Sede da Fazenda */}
            <Marker
              longitude={markerPos.lng}
              latitude={markerPos.lat}
              anchor="bottom"
              draggable
              onDragEnd={(e) => {
                const lat = e.lngLat.lat;
                const lng = e.lngLat.lng;
                setMarkerPos({ lat, lng });
                updateMunicipioFromCoords(lat, lng);
              }}
            >
              <div className="flex flex-col items-center cursor-grab active:cursor-grabbing group/marker">
                <div className="bg-slate-900/95 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-lg border border-emerald-400 whitespace-nowrap mb-1 flex items-center gap-1 backdrop-blur-xs">
                  <Building2 className="w-3 h-3 text-[#C59B27]" />
                  <span>Sede da Fazenda</span>
                </div>
                <div className="relative">
                  <div className="w-9 h-9 bg-gradient-to-br from-[#1B7547] to-[#0f4d2c] rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white font-bold animate-pulse">
                    <MapPin className="w-5 h-5 text-[#C59B27]" />
                  </div>
                </div>
              </div>
            </Marker>
          </Map>

          {/* Dica de Toque / Arraste Responsiva */}
          <div className="absolute bottom-2 left-2 right-2 sm:right-auto bg-slate-900/90 backdrop-blur-md text-white px-3 py-1.5 rounded-xl border border-white/20 text-[10px] sm:text-xs font-bold shadow-md text-center sm:text-left">
            📍 Toque ou clique no mapa para posicionar a sede
          </div>
        </div>

        {/* Resumo da Localização Selecionada (Responsivo) */}
        <div className="p-3 bg-emerald-50/80 rounded-2xl border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#1B7547] shrink-0" />
            <div className="min-w-0">
              <span className="font-extrabold text-emerald-950">Sede Selecionada:</span>
              <span className="ml-1 text-emerald-800 font-mono text-[11px] sm:text-xs block sm:inline">
                Lat: {markerPos.lat.toFixed(5)} | Lng: {markerPos.lng.toFixed(5)}
              </span>
            </div>
          </div>
          <span className="text-[11px] font-extrabold text-[#1B7547] bg-white px-3 py-1 rounded-full border border-emerald-200 shadow-2xs self-start sm:self-auto shrink-0">
            📍 {municipio}
          </span>
        </div>

        {/* Botões de Ação Mobile-Friendly */}
        <div className="flex flex-col-reverse sm:flex-row justify-end items-stretch sm:items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-all cursor-pointer text-center min-h-[42px]"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#1B7547] to-[#16633b] hover:from-[#16633b] hover:to-[#0f4d2c] text-white font-extrabold text-xs rounded-xl transition-all duration-300 shadow-md active:scale-98 cursor-pointer min-h-[44px]"
          >
            <CheckCircle2 className="w-4 h-4 text-[#C59B27]" />
            <span>Confirmar Localização da Sede</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
