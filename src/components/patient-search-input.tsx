import { useEffect, useMemo, useRef, useState } from "react";
import { Search, User, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { VoiceInput } from "@/components/voice-input";

export interface PatientOption {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  data_nascimento: string | null;
  clinica_id: string;
  codigo_prontuario?: string | null;
  numero_pasta?: string | null;
  codigo_prontuario_anterior?: string | null;
  email?: string | null;
  /** Preenchido quando o paciente tem contrato ativo de convênio. */
  associado_convenio?: string | null;
  /** 'titular' | 'dependente' — quando associado_convenio está preenchido. */
  associado_tipo?: "titular" | "dependente" | null;
  ultima_consulta?: string | null;
  cadastro_incompleto?: boolean;
  match_score?: number;
  match_reason?: string;
}

interface PatientSearchInputProps {
  value?: PatientOption | null;
  onSelect: (patient: PatientOption | null) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** Limita busca à clínica informada; padrão: clínica atual + modo "Todas". */
  clinicaIdsOverride?: string[];
  /** Mostra um botão de microfone para ditar a busca por voz. */
  enableVoice?: boolean;
  /**
   * Se informado, exibe um botão "Cadastrar novo paciente" quando a busca
   * não retorna resultados. O callback recebe o texto atualmente digitado.
   */
  onRequestCreate?: (query: string) => void;
}

/**
 * Busca unificada de pacientes por NOME ou CPF.
 *
 * Use SEMPRE este componente quando precisar selecionar um paciente em
 * qualquer tela nova (agendamentos, prontuário, financeiro, odontograma etc.).
 * Respeita o multi-tenancy (clinica_id) e o modo "Todas" do ClinicSwitcher.
 */
// Remove acentos e normaliza para uppercase — os nomes são salvos assim
// no banco (trigger uppercase_text_fields + strip_accents), então a busca
// fica mais rápida e tolerante a "joão" / "JOAO" / "joao".
function normalizarBusca(s: string) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

// Tenta interpretar o termo como uma data de nascimento.
// Aceita: DD/MM/AAAA, DD-MM-AAAA, DDMMAAAA, AAAA-MM-DD, DD/MM (ano qualquer).
// Retorna { iso?: "YYYY-MM-DD", partial?: { dia, mes } } ou null.
function parseDataBusca(term: string): { iso?: string; partial?: { dia: string; mes: string } } | null {
  const t = term.trim();
  // AAAA-MM-DD
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}` };
  // DD/MM/AAAA ou DD-MM-AAAA
  m = t.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (m) return { iso: `${m[3]}-${m[2]}-${m[1]}` };
  // DDMMAAAA (8 dígitos contínuos)
  m = t.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) return { iso: `${m[3]}-${m[2]}-${m[1]}` };
  // DD/MM (dia/mês sem ano)
  m = t.match(/^(\d{2})[\/\-](\d{2})$/);
  if (m) return { partial: { dia: m[1], mes: m[2] } };
  return null;
}

export function PatientSearchInput({
  value,
  onSelect,
  placeholder = "Buscar por nome, nascimento (DD/MM/AAAA), CPF, pasta ou prontuário…",
  className,
  autoFocus,
  clinicaIdsOverride,
  enableVoice = false,
  onRequestCreate,
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
  const reqIdRef = useRef(0);
  const cacheRef = useRef<Map<string, PatientOption[]>>(new Map());

  useEffect(() => {
    setQuery(value?.nome ?? "");
  }, [value?.id, value?.nome]);

  useEffect(() => {
    if (!open || scope.length === 0) return;
    const term = query.trim();
    const digits = term.replace(/\D/g, "");
    if (term.length < 2 && digits.length < 2) {
      setOptions([]);
      return;
    }
    const cacheKey = `${scope.slice().sort().join(",")}|${term.toLowerCase()}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setOptions(cached);
      setLoading(false);
      return;
    }
    const handle = setTimeout(async () => {
      const myReq = ++reqIdRef.current;
      setLoading(true);
      const dataBusca = parseDataBusca(term);
      // Busca única global: nome, CPF, telefone, DN, prontuário, pasta,
      // código antigo — com ranking por relevância e status/última consulta.
      const { data, error } = await supabase.rpc("buscar_pacientes_global", {
        _clinica_ids: scope,
        _termo: term,
        _limite: 20,
      });
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[patient-search] rpc error", { term, scope, error });
      }
      if (myReq !== reqIdRef.current) return;
      const todas = (data ?? []) as PatientOption[];
      let base = todas;
      if (dataBusca?.partial) {
        const { dia, mes } = dataBusca.partial;
        base = todas.filter(p => {
          if (!p.data_nascimento) return false;
          const [, m2, d2] = p.data_nascimento.split("-");
          return m2 === mes && d2 === dia;
        });
        if (base.length > 0) {
          setOptions(base.slice(0, 20));
          if (cacheRef.current.size > 50) cacheRef.current.clear();
          cacheRef.current.set(cacheKey, base);
          setLoading(false);
          return;
        }
      }
      // A RPC já retorna ordenado por match_score desc; mantemos como veio.
      const rows = base.slice(0, 20);
      if (cacheRef.current.size > 50) cacheRef.current.clear();
      cacheRef.current.set(cacheKey, rows);
      setOptions(rows);
      setLoading(false);
    }, 150);
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
        data-quick-search
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onSelect(null);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // Não deixar o Enter submeter o formulário pai sem que o
            // usuário tenha escolhido um paciente da lista.
            e.preventDefault();
            if (options.length > 0) {
              const first = options[0];
              onSelect(first);
              setQuery(first.nome);
              setOpen(false);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className={cn("pl-9", enableVoice && "pr-12")}
      />
      {enableVoice && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          <VoiceInput
            size="sm"
            title="Ditar busca de paciente"
            append={false}
            onTranscript={(text) => {
              // Limpa pontuação típica que o STT pode inserir
              const limpo = text.replace(/[.,;:!?]+$/g, "").trim();
              setQuery(limpo);
              setOpen(true);
              if (value) onSelect(null);
            }}
          />
        </div>
      )}
      {open && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-lg max-h-72 overflow-auto">
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Buscando…</div>
          )}
          {!loading && options.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground space-y-2">
              <div>Nenhum paciente encontrado.</div>
              {onRequestCreate && (
                <button
                  type="button"
                  onClick={() => {
                    onRequestCreate(query.trim());
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md border border-dashed border-primary/40 text-primary hover:bg-primary/5 text-sm font-medium"
                >
                  <UserPlus className="h-4 w-4" />
                  Cadastrar novo paciente{query.trim() ? `: "${query.trim()}"` : ""}
                </button>
              )}
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
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="font-medium truncate">{p.nome}</span>
                  {p.codigo_prontuario && (
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted">
                      Prontuário {p.codigo_prontuario}
                    </span>
                  )}
                  {p.numero_pasta && (
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted">
                      Pasta {p.numero_pasta}
                    </span>
                  )}
                  {p.associado_convenio ? (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                      Associado - {p.associado_tipo === "dependente" ? "dependente" : "titular"} — {p.associado_convenio}
                    </span>
                  ) : (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      Particular
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    CPF: {formatCPFMasked(p.cpf) ?? "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Nasc.: {p.data_nascimento
                      ? p.data_nascimento.split("-").reverse().join("/")
                      : "—"}
                  </span>
                  {p.ultima_consulta && (
                    <span className="text-xs text-muted-foreground">
                      Última: {p.ultima_consulta.split("-").reverse().join("/")}
                    </span>
                  )}
                </div>
                {p.telefone && (
                  <div className="text-xs text-muted-foreground truncate">
                    {formatTelMasked(p.telefone)}
                  </div>
                )}
                {p.cadastro_incompleto && (
                  <div className="text-[11px] mt-0.5 text-amber-700 dark:text-amber-400">
                    ⚠ Cadastro incompleto — clique para completar
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Máscaras apenas para exibição — os dados são armazenados sem formatação.
function formatCPFMasked(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatTelMasked(tel: string | null | undefined): string {
  if (!tel) return "";
  const d = tel.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel;
}