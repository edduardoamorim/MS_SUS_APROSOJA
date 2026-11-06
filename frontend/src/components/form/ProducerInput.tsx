import { useState, useEffect, useRef } from 'react';
import { User, Check, ChevronDown, UserPlus, X } from 'lucide-react';

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
  onCreateNew?: (typedName: string) => void;
  placeholder?: string;
  required?: boolean;
}

export default function ProducerInput({
  producers,
  selectedId,
  onChange,
  onCreateNew,
  placeholder = 'Buscar ou selecionar produtor rural...',
  required = false
}: Props) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInternalEditRef = useRef(false);

  const selectedProducer = producers.find(p => p.id === selectedId);

  // Sincronizar texto quando o produtor selecionado mudar externamente
  useEffect(() => {
    if (selectedProducer) {
      setQuery(selectedProducer.nome);
      isInternalEditRef.current = false;
    } else if (!selectedId) {
      if (isInternalEditRef.current) {
        isInternalEditRef.current = false;
      } else {
        setQuery('');
      }
    }
  }, [selectedId, selectedProducer]);

  // Fechar dropdown ao clicar fora do componente
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        if (selectedProducer) {
          setQuery(selectedProducer.nome);
        } else if (query.trim()) {
          // Se digitou exatamente o nome ou e-mail de um produtor existente, auto-seleciona
          const qLower = query.trim().toLowerCase();
          const exactMatch = producers.find(
            p => (p.nome || '').trim().toLowerCase() === qLower || (p.email || '').trim().toLowerCase() === qLower
          );
          if (exactMatch) {
            onChange(exactMatch.id);
            setQuery(exactMatch.nome);
          }
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedId, selectedProducer, query, producers, onChange]);

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
    isInternalEditRef.current = false;
    onChange(producer.id);
    setQuery(producer.nome);
    setIsOpen(false);
  };

  const handleClear = () => {
    isInternalEditRef.current = false;
    setQuery('');
    onChange('');
    setIsOpen(true);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <User className={`w-4 h-4 absolute left-3 pointer-events-none ${selectedProducer ? 'text-emerald-600' : 'text-muted-foreground'}`} />
        <input
          required={required && !selectedId}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={e => {
            const val = e.target.value;
            setQuery(val);
            setIsOpen(true);
            if (!val.trim()) {
              isInternalEditRef.current = false;
              onChange('');
            } else if (selectedId && selectedProducer && val !== selectedProducer.nome) {
              isInternalEditRef.current = true;
              onChange('');
            }
          }}
          onFocus={() => setIsOpen(true)}
          className={`w-full pl-9 pr-14 py-2.5 bg-background border rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-foreground font-medium transition-all ${
            selectedProducer ? 'border-emerald-500/60 bg-emerald-50/20' : 'border-input'
          }`}
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            title="Limpar seleção"
            className="absolute right-8 p-1 text-muted-foreground hover:text-foreground rounded-md transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown 
          className={`w-4 h-4 text-muted-foreground absolute right-3 pointer-events-none transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </div>

      {selectedProducer && !isOpen && (
        <div className="mt-1.5 flex items-center justify-between px-2.5 py-1 rounded-lg bg-emerald-50/70 border border-emerald-200/70 text-[11px] text-emerald-900">
          <span className="truncate font-medium">
            ✓ Produtor vinculado: <strong>{selectedProducer.nome}</strong>
            {selectedProducer.email ? ` (${selectedProducer.email})` : ''}
          </span>
          {(selectedProducer.telefone || selectedProducer.whatsapp) && (
            <span className="font-semibold text-emerald-700 shrink-0 ml-2">
              {selectedProducer.telefone || selectedProducer.whatsapp}
            </span>
          )}
        </div>
      )}

      {!selectedProducer && query.trim().length > 0 && !isOpen && (
        <div className="mt-1.5 flex items-center justify-between px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
          <span>Selecione um produtor na lista ou cadastre como novo.</span>
          {onCreateNew && (
            <button
              type="button"
              onClick={() => onCreateNew(query.trim())}
              className="font-bold text-emerald-700 hover:underline ml-2 shrink-0 cursor-pointer"
            >
              + Cadastrar "{query.trim()}"
            </button>
          )}
        </div>
      )}

      {isOpen && (
        <div className="absolute z-[999] w-full mt-1 bg-card border border-border rounded-xl shadow-xl max-h-60 overflow-y-auto animate-in slide-in-from-top-1 duration-150 p-1">
          <div className="px-3 py-1.5 border-b border-border/40 text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center">
            <span>Produtores Cadastrados</span>
            <span className="bg-muted px-1.5 py-0.5 rounded text-[8px]">{filteredProducers.length}</span>
          </div>

          {filteredProducers.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground space-y-2">
              <p>Nenhum produtor encontrado para "{query.trim()}".</p>
              {onCreateNew && query.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onCreateNew(query.trim());
                  }}
                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Cadastrar "{query.trim()}" como Novo Produtor
                </button>
              )}
            </div>
          ) : (
            <>
              {filteredProducers.map(p => {
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
              })}
              {onCreateNew && query.trim().length > 1 && (
                <div className="pt-1 mt-1 border-t border-border/50">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onCreateNew(query.trim());
                    }}
                    className="w-full px-3 py-2 text-left rounded-lg text-xs font-bold text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">+ Cadastrar "{query.trim()}" como Novo Produtor</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
