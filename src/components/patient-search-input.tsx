import { useEffect, useMemo, useRef, useState } from "react";
import { Search, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PatientOption {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  data_nascimento: string | null;
  clinica_id: string;
}

interface PatientSearchInputProps {
  value?: PatientOption | null;
  onSelect: (patient: PatientOption | null) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** Limita busca à clínica informada; padrão: clínica atual + modo "Todas". */
  clinicaIdsOverride?: string[];
}

/**
 * Busca unificada de pacientes por NOME ou CPF.
 *
 * Use SEMPRE este componente quando precisar selecionar um paciente em
 * qualquer tela nova (agendamentos, prontuário, financeiro, odontograma etc.).
 * Respeita o multi-tenancy (clinica_id) e o modo "Todas" do ClinicSwitcher.
 */
export function PatientSearchInput({
  value,
  onSelect,
  placeholder = "Buscar paciente por nome ou CPF…",
  className,
  autoFocus,
  clinicaIdsOverride,
}: PatientSearchInputProps) {
  const { clinicaIds } = useClinica();
  const scope = useMemo(
    () => (clinicaIdsOverride && clinicaIdsOverride.length > 0 ? clinicaIdsOverride : clinicaIds),
    [clinicaIdsOverride, clinicaIds],
  );
  const [query, setQuery] = useState(value?.nome ?? "");
  const [options, setOptions] = useState<PatientOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value?.nome ?? "");
  }, [value?.id, value?.nome]);

  useEffect(() => {
    if (!open || scope.length === 0) return;
    const term = query.trim();
    if (term.length < 2) {
      setOptions([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      const digits = term.replace(/\D/g, "");
      const filter = digits.length >= 3
        ? `nome.ilike.%${term}%,cpf.ilike.%${digits}%`
        : `nome.ilike.%${term}%`;
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome, cpf, telefone, data_nascimento, clinica_id")
        .in("clinica_id", scope)
        .eq("ativo", true)
        .or(filter)
        .order("nome", { ascending: true })
        .limit(20);
      setOptions((data ?? []) as PatientOption[]);
      setLoading(false);
    }, 220);
    return () => clearTimeout(handle);
  }, [query, open, scope]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onSelect(null);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="pl-9"
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-lg max-h-72 overflow-auto">
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Buscando…</div>
          )}
          {!loading && options.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Nenhum paciente encontrado.
            </div>
          )}
          {!loading && options.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSelect(p);
                setQuery(p.nome);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-start gap-2"
            >
              <User className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{p.nome}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {p.cpf ?? "Sem CPF"} {p.telefone ? `• ${p.telefone}` : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}