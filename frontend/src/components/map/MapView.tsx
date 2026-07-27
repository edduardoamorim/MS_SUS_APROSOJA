import { useRef, useEffect } from 'react';
import Map, { NavigationControl, Source, Layer } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';

interface MapViewProps {
  farms?: FeatureCollection;
  embargoes?: FeatureCollection;
  municipalities?: FeatureCollection;
  selectedFarmId?: string | null;
  onMapClick?: (lng: number, lat: number) => void;
  interactive?: boolean;
}

export default function MapView({ farms, embargoes, municipalities, selectedFarmId, onMapClick, interactive = true }: MapViewProps) {
  const mapRef = useRef<MapRef>(null);

  // Auto-fit bounds when selectedFarmId changes or farm list loads
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
          { padding: isSingle ? 100 : 80, maxZoom: isSingle ? 15 : 13, duration: 1400 }
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

  // MS center coordinates
  const initialViewState = {
    longitude: -54.6201,
    latitude: -20.4428,
    zoom: 5
  };

  return (
    <div className="w-full h-full min-h-[400px] rounded-xl overflow-hidden shadow-sm border border-gray-200">
      <Map
        ref={mapRef}
        initialViewState={initialViewState}
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
                'fill-color': '#10b981',
                'fill-opacity': 0.6
              }}
            />
            <Layer
              id="farms-line"
              type="line"
              paint={{
                'line-color': '#047857',
                'line-width': 2
              }}
            />
          </Source>
        )}
      </Map>
    </div>
  );
}
