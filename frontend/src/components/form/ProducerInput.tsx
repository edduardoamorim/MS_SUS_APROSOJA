import { useState, useEffect, useRef } from 'react';
import { User, Check, ChevronDown } from 'lucide-react';

export interface Producer {
  id: string;
  nome: string;
  email?: string;
  telefone?: string;
  whatsapp?: string;
  regiao?: string;
}

interface Props {
  producers: Producer[];
  selectedId: string;
  onChange: (id: string) => void;
  placeholder?: string;
  required?: boolean;
}

export default function ProducerInput({
  producers,
  selectedId,
  onChange,
  placeholder = 'Buscar ou selecionar produtor rural...',
  required = false
}: Props) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedProducer = producers.find(p => p.id === selectedId);

  // Sincronizar texto quando o produtor selecionado mudar
  useEffect(() => {
    if (selectedProducer) {
      setQuery(selectedProducer.nome);
    } else if (!selectedId) {
      setQuery('');
    }
  }, [selectedId, selectedProducer]);

  // Fechar dropdown ao clicar fora do componente
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        if (selectedProducer) {
          setQuery(selectedProducer.nome);
        } else if (!selectedId) {
          setQuery('');
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedId, selectedProducer]);

  const filteredProducers = producers.filter(p => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    const nameMatch = (p.nome || '').toLowerCase().includes(q);
    const emailMatch = (p.email || '').toLowerCase().includes(q);
    const phoneMatch = (p.telefone || p.whatsapp || '').toLowerCase().includes(q);
    const regiaoMatch = (p.regiao || '').toLowerCase().includes(q);
    return nameMatch || emailMatch || phoneMatch || regiaoMatch;
  });

  const handleSelect = (producer: Producer) => {
    onChange(producer.id);
    setQuery(producer.nome);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <User className="w-4 h-4 text-emerald-600 absolute left-3 pointer-events-none" />
        <input
          required={required && !selectedId}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setIsOpen(true);
            if (!e.target.value) {
              onChange('');
            }
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full pl-9 pr-8 py-2.5 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-foreground font-medium transition-all"
        />
        <ChevronDown 
          className={`w-4 h-4 text-muted-foreground absolute right-3 pointer-events-none transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </div>

      {isOpen && (
        <div className="absolute z-[999] w-full mt-1 bg-card border border-border rounded-xl shadow-xl max-h-56 overflow-y-auto animate-in slide-in-from-top-1 duration-150 p-1">
          <div className="px-3 py-1.5 border-b border-border/40 text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center">
            <span>Produtores Cadastrados</span>
            <span className="bg-muted px-1.5 py-0.5 rounded text-[8px]">{filteredProducers.length}</span>
          </div>

          {filteredProducers.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              Nenhum produtor encontrado com este nome.
            </div>
          ) : (
            filteredProducers.map(p => {
              const isSelected = p.id === selectedId;
              const cleanEmail = p.email && p.email.trim().length > 0 ? p.email.trim() : null;
              const cleanPhone = p.telefone || p.whatsapp;

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p)}
                  className={`w-full px-3 py-2 text-left rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 my-0.5 ${
                    isSelected
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{p.nome}</div>
                    {(cleanEmail || cleanPhone || p.regiao) && (
                      <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                        {cleanEmail && <span>{cleanEmail}</span>}
                        {cleanEmail && cleanPhone && <span>•</span>}
                        {cleanPhone && <span className="font-semibold text-emerald-800">{cleanPhone}</span>}
                        {p.regiao && <span>📍 {p.regiao}</span>}
                      </div>
                    )}
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
