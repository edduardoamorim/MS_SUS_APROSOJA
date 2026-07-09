import { useState, useEffect } from 'react';
import { MapPin, Search, Map as MapIcon, Loader2, Building2, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import MapView from '../../components/map/MapView';
import type { FeatureCollection } from 'geojson';

export default function GestorMapa() {
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // GIS States
  const [farmsData, setFarmsData] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [municipalitiesData, setMunicipalitiesData] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [munStats, setMunStats] = useState<any[]>([]);

  useEffect(() => {
    fetchGeoData();
  }, []);

  async function fetchGeoData() {
    setLoading(true);
    try {
      // 1. Buscar estatísticas espaciais dos municípios
      const { data: stats, error: statsError } = await supabase.rpc('get_municipios_stats');
      if (statsError) throw statsError;
      setMunStats(stats || []);

      // 2. Buscar geometrias reais dos municípios (para desenhar no mapa)
      const { data: muns, error: munsError } = await supabase.rpc('get_municipios');
      if (!munsError && muns) {
        const munFeatures = muns.map((mun: any) => ({
          type: 'Feature' as const,
          properties: {
            id: mun.id,
            name: mun.nm_mun,
            code: mun.cd_mun,
            area: mun.area_km2
          },
          geometry: JSON.parse(mun.geom_json)
        }));
        setMunicipalitiesData({
          type: 'FeatureCollection',
          features: munFeatures
        });
      }

      // 3. Buscar propriedades reais
      const { data: props, error: propsError } = await supabase.from('propriedades').select('*');
      if (!propsError && props) {
        const propFeatures = props.map((p: any, index: number) => {
          let geom = p.geom;
          if (!geom) {
            // Geometria mockada se estiver vazia
            const latBase = -20.4 - (index * 0.15);
            const lngBase = -54.6 - (index * 0.15);
            geom = {
              type: 'Polygon',
              coordinates: [[[lngBase, latBase], [lngBase + 0.05, latBase], [lngBase + 0.05, latBase - 0.05], [lngBase, latBase - 0.05], [lngBase, latBase]]]
            };
          }
          return {
            type: 'Feature' as const,
            properties: {
              id: p.id,
              name: p.nome_fazenda,
              status: p.nome_produtor
            },
            geometry: geom
          };
        });
        setFarmsData({
          type: 'FeatureCollection',
          features: propFeatures
        });
      }
    } catch (err: any) {
      console.error('Erro ao buscar dados geoespaciais:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredStats = munStats.filter(m => 
    (m.nm_mun || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.cd_mun || '').includes(searchQuery)
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <MapIcon className="w-5 h-5 text-primary" />
            Mapa e Cruzamento Espacial
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Monitore a sobreposição geográfica de fazendas registradas com o mapa oficial de municípios (SHP IBGE/Imasul).
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Painel de Estatísticas de Municípios */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-card p-5 rounded-2xl border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
              <h3 className="font-bold text-foreground text-sm mb-4 flex items-center gap-1.5">
                <Building2 className="w-4.5 h-4.5 text-primary" />
                Municípios Importados ({munStats.length})
              </h3>
              
              <div className="relative mb-4">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
                <input 
                  type="text" 
                  placeholder="Buscar município..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all shadow-sm text-xs"
                />
              </div>

              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                {filteredStats.map((mun, i) => (
                  <div key={i} className="p-3 bg-muted/30 border border-border/60 rounded-xl flex justify-between items-center group hover:border-primary/45 hover:bg-muted/50 transition-colors">
                    <div>
                      <h4 className="font-bold text-foreground text-xs">{mun.nm_mun}</h4>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        Cod: {mun.cd_mun || 'N/A'} | Area: {mun.area_km2 || 'N/A'} km²
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      mun.farm_count > 0 
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {mun.farm_count} fazenda(s)
                    </span>
                  </div>
                ))}
                {filteredStats.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground">
                    Nenhum município correspondente.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Painel do Mapa */}
          <div className="lg:col-span-2 relative">
            <div className="h-[550px] w-full rounded-2xl overflow-hidden border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] relative">
              <MapView 
                farms={farmsData}
                municipalities={municipalitiesData}
                interactive={true}
              />
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
