import { useMemo, useRef, useState } from "react";
import { Pill, Search, Trash2, ArrowUp, ArrowDown, Plus, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buscarMedicamentos, POSOLOGIAS, type Medicamento } from "@/data/medicamentos";
import { novoItem, mover, type ItemPrescricao } from "@/lib/prontuario/prescricao";

interface Props {
  itens: ItemPrescricao[];
  onChange: (itens: ItemPrescricao[]) => void;
}

export function PrescricaoBuilder({ itens, onChange }: Props) {
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resultados = useMemo(() => (q.trim() ? buscarMedicamentos(q, 10) : []), [q]);

  const adicionar = (m?: Medicamento) => {
    onChange([
      ...itens,
      novoItem({
        nome: m?.nome ?? q.trim(),
        apresentacao: m?.apresentacao ?? "",
        posologia: m?.posologia ?? "",
      }),
    ]);
    setQ("");
    setAberto(false);
  };

  const atualizar = (id: string, patch: Partial<ItemPrescricao>) =>
    onChange(itens.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const remover = (id: string) => onChange(itens.filter((i) => i.id !== id));

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setAberto(true); }}
          onFocus={() => setAberto(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setAberto(false), 120); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (resultados.length) adicionar(resultados[0]);
              else if (q.trim()) adicionar();
            }
          }}
          className="pl-8 h-9"
          placeholder="Buscar medicamento (ex.: dipirona, amoxicilina) — Enter adiciona…"
        />
        {aberto && (resultados.length > 0 || q.trim()) && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-72 overflow-auto">
            {resultados.map((m, i) => (
              <button
                key={`${m.nome}-${i}`}
                type="button"
                onMouseDown={() => { if (blurTimer.current) clearTimeout(blurTimer.current); }}
                onClick={() => adicionar(m)}
                className="w-full text-left px-3 py-2 hover:bg-muted/70 border-b border-border/50 last:border-0"
              >
                <div className="text-sm font-medium">{m.nome} <span className="text-muted-foreground font-normal">— {m.apresentacao}</span></div>
                {m.posologia && <div className="text-[11px] text-muted-foreground truncate">{m.posologia}</div>}
              </button>
            ))}
            {q.trim() && (
              <button
                type="button"
                onMouseDown={() => { if (blurTimer.current) clearTimeout(blurTimer.current); }}
                onClick={() => adicionar()}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/70 flex items-center gap-2"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar &quot;{q.trim()}&quot; manualmente
              </button>
            )}
          </div>
        )}
      </div>

      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum medicamento na prescrição. Use a busca acima.</p>
      ) : (
        <div className="space-y-2">
          {itens.map((it, idx) => (
            <Card
              key={it.id}
              draggable
              onDragStart={() => setArrastando(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (arrastando === null || arrastando === idx) return;
                onChange(mover(itens, arrastando, idx));
                setArrastando(null);
              }}
              className={`p-3 space-y-2 ${arrastando === idx ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-1.5 font-mono shrink-0">{idx + 1}</Badge>
                <div className="flex-1 grid gap-2 sm:grid-cols-[2fr_1.4fr_0.9fr]">
                  <Input value={it.nome} onChange={(e) => atualizar(it.id, { nome: e.target.value })} placeholder="Medicamento" className="h-9" />
                  <Input value={it.apresentacao} onChange={(e) => atualizar(it.id, { apresentacao: e.target.value })} placeholder="Apresentação" className="h-9" />
                  <Input value={it.quantidade} onChange={(e) => atualizar(it.id, { quantidade: e.target.value })} placeholder="Qtd. (ex.: 20 cp)" className="h-9" />
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <div className="flex gap-1">
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={idx === 0} onClick={() => onChange(mover(itens, idx, idx - 1))} title="Subir">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={idx === itens.length - 1} onClick={() => onChange(mover(itens, idx, idx + 1))} title="Descer">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remover(it.id)} title="Remover">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
              <Input
                value={it.posologia}
                onChange={(e) => atualizar(it.id, { posologia: e.target.value })}
                placeholder="Posologia (ex.: 1 comprimido via oral de 8 em 8 horas por 7 dias)"
                className="h-9"
              />
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] uppercase text-muted-foreground flex items-center gap-1 mr-1">
                  <Zap className="h-3 w-3" /> Atalhos
                </span>
                {POSOLOGIAS.slice(0, 6).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => atualizar(it.id, { posologia: p })}
                    className="text-[11px] rounded-full border px-2 py-0.5 hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => adicionar()} className="gap-1">
          <Pill className="h-3.5 w-3.5" /> Item em branco
        </Button>
        <span className="text-xs text-muted-foreground">{itens.length} item(ns) · arraste para reordenar</span>
      </div>
    </div>
  );
}
