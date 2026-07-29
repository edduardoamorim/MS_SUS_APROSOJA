import { useRef, useEffect } from 'react';
import Map, { NavigationControl, Source, Layer } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';

interface MapViewProps {
  farms?: FeatureCollection;
  farmsData?: FeatureCollection;
  embargoes?: FeatureCollection;
  municipalities?: FeatureCollection;
  selectedFarmId?: string | null;
  onMapClick?: (lng: number, lat: number) => void;
  onSelectFarm?: (id: string | null) => void;
  interactive?: boolean;
  activeTab?: string;
  isVisible?: boolean;
}

// Estilo de mapa Carto Voyager de alta resolução e performance garantida
const cartoVoyagerStyle: any = {
  version: 8,
  sources: {
    'carto-voyager': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png'
      ],
      tileSize: 256,
      attribution: '&copy; CARTO &copy; OpenStreetMap contributors'
    }
  },
  layers: [
    {
      id: 'carto-voyager-layer',
      type: 'raster',
      source: 'carto-voyager',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

export default function MapView({ farms: farmsProp, farmsData: farmsDataProp, embargoes, municipalities, selectedFarmId, onMapClick, onSelectFarm, interactive = true, activeTab, isVisible }: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const farms = farmsProp || farmsDataProp;

  // Recalcular o tamanho do canvas do mapa e enquadrar os limites dos imóveis perfeitamente no centro
  const fitBoundsAndResizeMap = () => {
    if (!mapRef.current) return;

    try {
      mapRef.current.resize();
    } catch (e) {
      console.warn('Aviso ao redimensionar mapa:', e);
    }

    if (!farms || !farms.features || farms.features.length === 0) return;

    let targetFeatures = farms.features;
    if (selectedFarmId) {
      const match = farms.features.filter(f => f.properties?.id === selectedFarmId);
      if (match.length > 0) targetFeatures = match;
    }

    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    let hasValidCoords = false;

    const processCoords = (coords: any[]) => {
      if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        const [lng, lat] = coords;
        if (!isNaN(lng) && !isNaN(lat) && isFinite(lng) && isFinite(lat)) {
          minLng = Math.min(minLng, lng);
          minLat = Math.min(minLat, lat);
          maxLng = Math.max(maxLng, lng);
          maxLat = Math.max(maxLat, lat);
          hasValidCoords = true;
        }
      } else if (Array.isArray(coords)) {
        coords.forEach(processCoords);
      }
    };

    targetFeatures.forEach(f => {
      if (f.geometry && (f.geometry as any).coordinates) {
        processCoords((f.geometry as any).coordinates);
      }
    });

    if (hasValidCoords && isFinite(minLng) && isFinite(minLat)) {
      if (minLng === maxLng) { minLng -= 0.015; maxLng += 0.015; }
      if (minLat === maxLat) { minLat -= 0.015; maxLat += 0.015; }

      try {
        const isSingle = !!selectedFarmId;
        mapRef.current.fitBounds(
          [[minLng, minLat], [maxLng, maxLat]],
          {
            padding: isSingle ? 100 : 75,
            maxZoom: isSingle ? 14 : 11,
            duration: 800,
            essential: true,
            easing: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
          }
        );
      } catch (e) {
        console.warn('Erro ao ajustar limites do mapa:', e);
      }
    }
  };

  // Efeito para sincronizar o tamanho e a centralização do mapa ao alternar abas ou alterar a fazenda selecionada
  useEffect(() => {
    const isTabActive = activeTab === 'mapa' || isVisible || isVisible === undefined;
    if (isTabActive) {
      const t1 = setTimeout(fitBoundsAndResizeMap, 50);
      const t2 = setTimeout(fitBoundsAndResizeMap, 250);
      const t3 = setTimeout(fitBoundsAndResizeMap, 600);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [activeTab, isVisible, farms, selectedFarmId]);

  const handleClick = (e: any) => {
    if (onMapClick && e.lngLat) {
      onMapClick(e.lngLat.lng, e.lngLat.lat);
    }
  };

  // Coordenadas centrais do Estado de Mato Grosso do Sul (MS)
  const initialViewState = {
    longitude: -54.6201,
    latitude: -20.4428,
    zoom: 6.8
  };

  return (
    <div className="w-full h-full min-h-[450px] rounded-xl overflow-hidden shadow-sm border border-gray-200 relative bg-slate-100">
      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        minZoom={5}
        maxZoom={18}
        mapStyle={cartoVoyagerStyle}
        interactive={interactive}
        onClick={handleClick}
        cursor={interactive ? 'crosshair' : 'grab'}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" />

        {/* Camada dos Municípios (SHP do IBGE) */}
        {municipalities && (
          <Source id="municipalities" type="geojson" data={municipalities}>
            <Layer
              id="municipalities-fill"
              type="fill"
              paint={{
                'fill-color': '#064e3b',
                'fill-opacity': 0.05
              }}
            />
            <Layer
              id="municipalities-line"
              type="line"
              paint={{
                'line-color': '#064e3b',
                'line-opacity': 0.25,
                'line-width': 1
              }}
            />
          </Source>
        )}

        {/* Camada de Embargos (Áreas de Risco) */}
        {embargoes && (
          <Source id="embargoes" type="geojson" data={embargoes}>
            <Layer
              id="embargoes-fill"
              type="fill"
              paint={{
                'fill-color': '#ef4444',
                'fill-opacity': 0.4
              }}
            />
            <Layer
              id="embargoes-line"
              type="line"
              paint={{
                'line-color': '#b91c1c',
                'line-width': 2
              }}
            />
          </Source>
        )}

        {/* Camada das Fazendas do Produtor */}
        {farms && (
          <Source id="farms" type="geojson" data={farms}>
            {/* Preenchimento de Polígono da Fazenda */}
            <Layer
              id="farms-fill"
              type="fill"
              paint={{
                'fill-color': ['coalesce', ['get', 'color'], '#10b981'],
                'fill-opacity': 0.2
              }}
            />
            {/* Linha dos Limites da Fazenda (Cor do Técnico) */}
            <Layer
              id="farms-line"
              type="line"
              paint={{
                'line-color': ['coalesce', ['get', 'color'], '#047857'],
                'line-width': 3.5,
                'line-opacity': 0.95
              }}
            />
            {/* Marcadores APENAS para geometrias do tipo Ponto (Point) - Sem bolinhas nos vértices de polígonos */}
            <Layer
              id="farms-circle"
              type="circle"
              filter={['==', '$type', 'Point']}
              paint={{
                'circle-color': ['coalesce', ['get', 'color'], '#047857'],
                'circle-radius': 7,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff'
              }}
            />
          </Source>
        )}
      </Map>
    </div>
  );
}

