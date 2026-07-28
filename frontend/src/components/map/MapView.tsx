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

export default function MapView({ farms: farmsProp, farmsData: farmsDataProp, embargoes, municipalities, selectedFarmId, onMapClick, onSelectFarm, interactive = true, activeTab, isVisible }: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const farms = farmsProp || farmsDataProp;

  // Limites geográficos estritos travados no Estado de Mato Grosso do Sul (MS)
  const msMaxBounds: [[number, number], [number, number]] = [
    [-58.5, -24.5], // Sudoeste (SW)
    [-50.5, -16.5]  // Nordeste (NE)
  ];

  // Recalcular tamanho do canvas do mapa e enquadramento quando a aba 'mapa' fica visível
  useEffect(() => {
    const isTabActive = activeTab === 'mapa' || isVisible || isVisible === undefined;
    if (isTabActive) {
      const timer = setTimeout(() => {
        if (mapRef.current) {
          try {
            mapRef.current.resize();

            if (farms && farms.features && farms.features.length > 0) {
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
                  if (!isNaN(lng) && !isNaN(lat)) {
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
                const isSingle = !!selectedFarmId;
                mapRef.current.fitBounds(
                  [[minLng, minLat], [maxLng, maxLat]],
                  {
                    padding: isSingle ? 120 : 90,
                    maxZoom: isSingle ? 15 : 12,
                    duration: 1600,
                    essential: true
                  }
                );
              }
            }
          } catch (e) {
            console.warn('Aviso ao redimensionar mapa:', e);
          }
        }
      }, 120);

      return () => clearTimeout(timer);
    }
  }, [activeTab, isVisible, farms, selectedFarmId]);

  // Auto-fit bounds quando a lista de fazendas ou a fazenda selecionada muda
  useEffect(() => {
    if (!farms || !farms.features || farms.features.length === 0 || !mapRef.current) return;

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
        if (!isNaN(lng) && !isNaN(lat)) {
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
      try {
        const isSingle = !!selectedFarmId;
        mapRef.current.fitBounds(
          [[minLng, minLat], [maxLng, maxLat]],
          {
            padding: isSingle ? 120 : 90,
            maxZoom: isSingle ? 15 : 12,
            duration: 3200,
            essential: true
          }
        );
      } catch (e) {
        console.warn('Erro ao ajustar limites do mapa:', e);
      }
    }
  }, [farms, selectedFarmId]);

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
    <div className="w-full h-full min-h-[400px] rounded-xl overflow-hidden shadow-sm border border-gray-200">
      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        maxBounds={msMaxBounds}
        minZoom={6}
        maxZoom={16}
        mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
        interactive={interactive}
        onClick={handleClick}
        cursor={interactive ? 'crosshair' : 'grab'}
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
            <Layer
              id="farms-fill"
              type="fill"
              paint={{
                'fill-color': ['coalesce', ['get', 'color'], '#10b981'],
                'fill-opacity': 0.02
              }}
            />
            <Layer
              id="farms-line"
              type="line"
              paint={{
                'line-color': ['coalesce', ['get', 'color'], '#059669'],
                'line-width': 3,
                'line-opacity': 0.95
              }}
            />
          </Source>
        )}
      </Map>
    </div>
  );
}
