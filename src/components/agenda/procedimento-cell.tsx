import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Pencil } from "lucide-react";

const norm = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

interface Props {
  valor: string | null;
  opcoes: { id: string; nome: string }[]; // já filtrado para este médico
  padrao?: string | null; // serviço padrão do médico — usado como fallback quando vazio
  semFallback?: boolean; // se true, não usa "CONSULTA" como fallback visual
  disabled?: boolean;
  onChange: (novoNome: string) => void | Promise<void>;
}

export function ProcedimentoCell({
  valor,
  opcoes,
  padrao,
  semFallback,
  disabled,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Deduplicar pelo nome normalizado, preservando a ordem recebida do cadastro do médico.
  const lista = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; nome: string }[] = [];
    for (const p of opcoes) {
      const k = norm(p.nome);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    return out;
  }, [opcoes]);

  const filtrada = useMemo(() => {
    const qn = norm(q.trim());
    if (!qn) return lista;
    // Permite buscar por número (ex: "3" filtra pelo 3º serviço)
    if (/^\d+$/.test(qn)) {
      const idx = parseInt(qn, 10) - 1;
      if (idx >= 0 && idx < lista.length) return [lista[idx]];
    }
    return lista.filter((p) => norm(p.nome).includes(qn));
  }, [lista, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Atalhos numéricos 1-9 enquanto o popover está aberto e o campo de busca está vazio
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return;
      // Só dispara se a busca estiver vazia, para não conflitar com digitar números
      if (q.length > 0) return;
      const n = parseInt(e.key, 10);
      if (!Number.isFinite(n) || n < 1 || n > 9) return;
      const item = lista[n - 1];
      if (!item) return;
      e.preventDefault();
      escolher(item.nome);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q, lista]);

  const escolher = async (nome: string) => {
    setOpen(false);
    await onChange(nome);
  };

  const fallback = (padrao && padrao.trim()) || (semFallback ? "" : "CONSULTA");
  const textoAtual = valor || fallback || "—";

  if (disabled || lista.length === 0) {
    return (
      <Badge variant="outline" className="text-xs">
        {textoAtual}
      </Badge>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Clique para trocar o serviço"
          className="group inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-xs uppercase font-medium hover:bg-muted hover:border-primary"
        >
          <span className="truncate max-w-[180px]">{textoAtual}</span>
          <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar ou digitar nº (1-9)…"
              className="pl-7 h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtrada[0]) {
                  e.preventDefault();
                  escolher(filtrada[0].nome);
                }
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {lista.length} serviço(s) — na ordem do cadastro do médico. Tecle 1-9 para selecionar.
          </p>
          {valor && (
            <button
              type="button"
              onClick={() => escolher("")}
              className="mt-2 w-full text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 rounded px-2 py-1"
            >
              Limpar serviço (voltar para {fallback})
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-auto">
          {filtrada.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground text-center">
              Nenhum serviço encontrado.
            </div>
          ) : (
            filtrada.map((p) => {
              const idxNaLista = lista.indexOf(p) + 1;
              const mostrarKbd = idxNaLista >= 1 && idxNaLista <= 9 && q.length === 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => escolher(p.nome)}
                  className="w-full text-left px-3 py-1.5 hover:bg-muted/60 border-b border-border/40 last:border-0 flex items-center gap-2 text-sm"
                >
                  {mostrarKbd ? (
                    <kbd className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-muted text-[10px] font-mono shrink-0">
                      {idxNaLista}
                    </kbd>
                  ) : (
                    <span className="inline-flex h-5 w-5 items-center justify-center text-[10px] text-muted-foreground font-mono shrink-0">
                      {idxNaLista}
                    </span>
                  )}
                  <span className="flex-1 truncate">{p.nome}</span>
                  {norm(p.nome) === norm(textoAtual) && (
                    <Badge variant="secondary" className="text-[10px]">
                      atual
                    </Badge>
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
