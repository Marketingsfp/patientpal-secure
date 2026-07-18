import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAgendaExpressDisabled } from "@/hooks/use-agenda-express-disabled";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator, CommandShortcut,
} from "@/components/ui/command";

export interface CommandEntry {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string[];
  shortcut?: string;
  onSelect: () => void;
}

interface CommandPaletteProps {
  entries: ReadonlyArray<CommandEntry>;
  /** Handler assíncrono opcional para busca de entidades (paciente/orçamento/etc.) */
  asyncSearch?: (term: string) => Promise<CommandEntry[]>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
}

/**
 * Busca Universal do ClinicaOS. Sem convênios externos — apenas:
 * pacientes, orçamentos, agendamentos, cartão de benefícios, associados,
 * regras do cartão, empresas associadas, financeiro, NFS-e, telas e ações.
 */
export function CommandPalette({
  entries, asyncSearch, open, onOpenChange, placeholder = "Buscar telas, pacientes, orçamentos, ações…",
}: CommandPaletteProps) {
  const [term, setTerm] = useState("");
  const [asyncResults, setAsyncResults] = useState<CommandEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!asyncSearch) return;
    const q = term.trim();
    if (q.length < 2) { setAsyncResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await asyncSearch(q);
        setAsyncResults(r);
      } finally { setLoading(false); }
    }, 180);
    return () => clearTimeout(t);
  }, [term, asyncSearch]);

  const grouped = useMemo(() => {
    // Quando asyncSearch está ativo, o cmdk usa shouldFilter=false (pois os
    // resultados server-side não têm o prefixo `o:`/`a:`/... no seu texto).
    // Nesse caso filtramos manualmente as `entries` de navegação por termo,
    // para que a lista de telas não fique inteira poluindo a busca.
    const q = term.trim().toLowerCase();
    const localEntries = !asyncSearch || q.length < 2
      ? entries
      : entries.filter((e) => {
          const hay = `${e.label} ${e.hint ?? ""} ${(e.keywords ?? []).join(" ")}`.toLowerCase();
          // ignora prefixo tipo "o:" para casar telas também
          const bare = /^[a-z]:(.*)$/i.exec(q)?.[1]?.trim() ?? q;
          return bare.length >= 2 && hay.includes(bare);
        });
    const all = [...localEntries, ...asyncResults];
    const map = new Map<string, CommandEntry[]>();
    for (const e of all) {
      if (!map.has(e.group)) map.set(e.group, []);
      map.get(e.group)!.push(e);
    }
    return Array.from(map.entries());
  }, [entries, asyncResults, asyncSearch, term]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={!asyncSearch}>
      <CommandInput placeholder={placeholder} value={term} onValueChange={setTerm} />
      <CommandList>
        <CommandEmpty>{loading ? "Buscando…" : "Nenhum resultado."}</CommandEmpty>
        {grouped.map(([group, items], idx) => (
          <div key={group}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={group}>
              {items.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`${e.label} ${e.hint ?? ""} ${(e.keywords ?? []).join(" ")}`}
                  onSelect={() => { e.onSelect(); onOpenChange(false); }}
                >
                  <div className="flex flex-col">
                    <span>{e.label}</span>
                    {e.hint && <span className="text-xs text-muted-foreground">{e.hint}</span>}
                  </div>
                  {e.shortcut && <CommandShortcut>{e.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

/** Hook: registra atalho global Ctrl/⌘+K → toggle. */
export function useCommandPaletteToggle(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return [open, setOpen];
}

/** Helper: entradas padrão de navegação (telas). Sem convênios externos. */
export function useDefaultScreenEntries(): CommandEntry[] {
  const navigate = useNavigate();
  const agendaExpressDisabled = useAgendaExpressDisabled();
  return useMemo(() => {
    const nav = (to: string) => () => { void navigate({ to: to as never }); };
    const mk = (label: string, to: string, hint?: string, keywords?: string[]): CommandEntry => ({
      id: `nav:${to}`, label, hint, group: "Telas", keywords, onSelect: nav(to),
    });
    const all: (CommandEntry | null)[] = [
      mk("Início", "/app", "Painel inicial"),
      mk("Agenda", "/app/agenda"),
      agendaExpressDisabled ? null : mk("Agenda Express", "/app/agenda/express"),
      mk("Recepção", "/app/recepcao"),
      mk("Check-in", "/app/checkin"),
      mk("Clientes", "/app/clientes"),
      mk("Orçamentos", "/app/orcamentos"),
      mk("Caixa", "/app/caixa"),
      mk("Chat", "/app/chat"),
      mk("Fluxo", "/app/fluxo"),
      mk("Prontuários", "/app/prontuarios"),
      mk("Anamneses", "/app/anamneses"),
      mk("Exames — Resultados", "/app/exames-resultados"),
      mk("Documentos", "/app/documentos"),
      mk("Cartão de Benefícios", "/app/cartao-beneficios", "Associados, regras e planos"),
      mk("Associados", "/app/cartao-beneficios/dependentes", "Titulares e dependentes"),
      mk("Regras do Cartão", "/app/cartao-beneficios/beneficios", "Regras dos benefícios"),
      mk("Modelos de Cartão", "/app/cartao-beneficios/modelos"),
      mk("Contratos do Cartão", "/app/cartao-beneficios/contratos"),
      mk("Empresas associadas", "/app/cartao-beneficios/convenios", "Empresas / entidades associadas", ["empresa","associada","grupos"]),
      mk("Financeiro — Movimento", "/app/financeiro/movimento"),
      mk("Financeiro — Atendimentos", "/app/financeiro/atendimentos"),
      mk("Financeiro — Notas", "/app/financeiro/notas"),
      mk("Financeiro — Relatórios", "/app/financeiro/relatorios"),
      mk("Boletos", "/app/boletos"),
      mk("NFS-e", "/app/nfse"),
      mk("Procedimentos", "/app/procedimentos"),
      mk("Especialidades", "/app/especialidades"),
      mk("Médicos", "/app/medicos"),
      mk("Equipe", "/app/equipe"),
      mk("Unidades", "/app/unidades"),
      mk("Clínicas", "/app/clinicas"),
      mk("Perfis de acesso", "/app/perfis"),
      mk("Auditoria", "/app/auditoria"),
      mk("LGPD", "/app/lgpd"),
      mk("Relatórios", "/app/relatorios"),
    ];
  }, [navigate]);
}