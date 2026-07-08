import { useState, useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

const CIDADES_MS_FALLBACK = [
  "Água Clara", "Alcinópolis", "Amambai", "Anastácio", "Anaurilândia", "Angélica", "Aral Moreira", 
  "Bandeirantes", "Bataguassu", "Batayporã", "Bela Vista", "Bodoquena", "Bonito", "Brasilândia", 
  "Caarapó", "Camapuã", "Campo Grande", "Caracol", "Cassilândia", "Chapadão do Sul", "Corguinho", 
  "Coronel Sapucaia", "Corumbá", "Costa Rica", "Coxim", "Deodápolis", "Dois Irmãos do Buriti", 
  "Douradina", "Dourados", "Eldorado", "Fátima do Sul", "Figueirão", "Glória de Dourados", 
  "Guia Lopes da Laguna", "Iguatemi", "Inocência", "Itaporã", "Itaquiraí", "Ivinhema", "Japorã", 
  "Jaraguari", "Jardim", "Jateí", "Juti", "Ladário", "Laguna Carapã", "Maracaju", "Miranda", 
  "Mundo Novo", "Naviraí", "Nioaque", "Nova Alvorada do Sul", "Nova Andradina", "Novo Horizonte do Sul", 
  "Paraíso das Águas", "Paranaíba", "Paranhos", "Pedro Gomes", "Ponta Porã", "Porto Murtinho", 
  "Ribas do Rio Pardo", "Rio Brilhante", "Rio Negro", "Rio Verde de Mato Grosso", "Rochedo", 
  "Santa Rita do Pardo", "Selvíria", "Sete Quedas", "Sidrolândia", "Sonora", "Tacuru", "Taquarussu", 
  "Terenos", "Três Lagoas", "Vicentina"
];

const normalizeText = (str: string) => {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

export default function CityInput({ value, onChange, placeholder = 'Ex: Sidrolândia, MS', className = '', required = false }: Props) {
  const [citiesList, setCitiesList] = useState<string[]>(CIDADES_MS_FALLBACK);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Carregar cidades da tabela municipios_ms para ter dados sempre sincronizados do PostGIS
  useEffect(() => {
    async function loadCities() {
      try {
        const { data, error } = await supabase
          .from('municipios_ms')
          .select('nm_mun')
          .order('nm_mun');
        
        if (!error && data && data.length > 0) {
          const names = data.map(m => m.nm_mun);
          setCitiesList(names);
        }
      } catch (err) {
        console.warn('Erro ao carregar municípios do banco, usando fallback:', err);
      }
    }
    loadCities();
  }, []);

  // Monitorar clique fora do dropdown para fechá-lo
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (userInput: string) => {
    onChange(userInput);

    const cleanInput = userInput.replace(/,\s*MS$/i, '').trim();
    if (cleanInput.length >= 1) {
      const normalizedQuery = normalizeText(cleanInput);
      const filtered = citiesList.filter(city => 
        normalizeText(city).includes(normalizedQuery)
      );
      setSuggestions(filtered);
      setShowDropdown(filtered.length > 0);
    } else {
      setSuggestions([]);
      setShowDropdown(false);
    }
  };

  const selectCity = (city: string) => {
    onChange(`${city}, MS`);
    setShowDropdown(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        required={required}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => handleInputChange(e.target.value)}
        onFocus={() => {
          const cleanInput = value.replace(/,\s*MS$/i, '').trim();
          if (cleanInput.length >= 1) {
            const normalizedQuery = normalizeText(cleanInput);
            const filtered = citiesList.filter(city => 
              normalizeText(city).includes(normalizedQuery)
            );
            setSuggestions(filtered);
            setShowDropdown(filtered.length > 0);
          }
        }}
        className={className}
      />
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-[999] w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto animate-in slide-in-from-top-1 duration-150">
          {suggestions.map((city, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => selectCity(city)}
              className="w-full px-3 py-2 text-left text-xs font-semibold hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer flex items-center gap-2 border-b border-border/30 last:border-0 text-foreground"
            >
              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>{city}, MS</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
