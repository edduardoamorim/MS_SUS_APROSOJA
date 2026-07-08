import { useRef } from 'react';
import Map, { NavigationControl, Source, Layer } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';

interface MapViewProps {
  farms?: FeatureCollection;
  embargoes?: FeatureCollection;
  municipalities?: FeatureCollection;
  onMapClick?: (lng: number, lat: number) => void;
  interactive?: boolean;
}

export default function MapView({ farms, embargoes, municipalities, onMapClick, interactive = true }: MapViewProps) {
  const mapRef = useRef<MapRef>(null);

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
