import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Bell, Check, X, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/recepcao")({
  component: RecepcaoPage,
});

type Senha = {
  id: string;
  codigo: string;
  tipo: "N" | "P" | "E" | "R";
  status: string;
  guiche: string | null;
  emitida_em: string;
  chamada_em: string | null;
  identificado_por_facial: boolean;
  paciente_id: string | null;
  pacientes?: { nome: string } | null;
};

const TIPO_COR: Record<string, string> = {
  N: "bg-primary/10 text-primary",
  P: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  E: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  R: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

// Prioridade de atendimento: Emergência > Prioritário > Retorno > Normal
const TIPO_PRIORIDADE: Record<string, number> = { E: 0, P: 1, R: 2, N: 3 };

function ordenarPorPrioridade(a: Senha, b: Senha) {
  const pa = TIPO_PRIORIDADE[a.tipo] ?? 99;
  const pb = TIPO_PRIORIDADE[b.tipo] ?? 99;
  if (pa !== pb) return pa - pb;
  return a.emitida_em.localeCompare(b.emitida_em);
}

function RecepcaoPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("recepcao");
  const [guiche, setGuiche] = useState<string>("1");
  const [fila, setFila] = useState<Senha[]>([]);
  const [chamadas, setChamadas] = useState<Senha[]>([]);
  const [busy, setBusy] = useState(false);

  // Refs para o atalho de teclado sempre ler o valor mais recente
  // sem precisar remontar o listener a cada mudança
  const clinicaIdRef = useRef(clinicaAtual?.clinica_id);
  useEffect(() => { clinicaIdRef.current = clinicaAtual?.clinica_id; }, [clinicaAtual?.clinica_id]);

  // Carrega o guichê salvo assim que a clínica é conhecida (namespaced por clínica)
  useEffect(() => {
    if (!clinicaAtual) return;
    const saved = localStorage.getItem(`guiche:${clinicaAtual.clinica_id}`);
    setGuiche(saved ?? "1");
  }, [clinicaAtual?.clinica_id]);

  useEffect(() => {
    if (!clinicaAtual) return;
    localStorage.setItem(`guiche:${clinicaAtual.clinica_id}`, guiche);
  }, [guiche, clinicaAtual?.clinica_id]);

  // Atalho: C = chamar próxima senha
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        if (!clinicaIdRef.current) return;
        void chamarProxima();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregar = async () => {
    if (!clinicaAtual) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const sel = "id, codigo, tipo, status, guiche, emitida_em, chamada_em, identificado_por_facial, paciente_id, pacientes(nome)";
    const [{ data: emit, error: errEmit }, { data: cham, error: errCham }] = await Promise.all([
      supabase.from("senhas").select(sel).eq("clinica_id", clinicaAtual.clinica_id).eq("data_dia", hoje).eq("status", "emitida").order("emitida_em"),
      supabase.from("senhas").select(sel).eq("clinica_id", clinicaAtual.clinica_id).eq("data_dia", hoje).eq("status", "chamada").order("chamada_em", { ascending: false }).limit(10),
    ]);

    if (errEmit || errCham) {
      mostrarErro(errEmit ?? errCham!);
      return;
    }

    const filaOrdenada = ((emit ?? []) as unknown as Senha[]).sort(ordenarPorPrioridade);
    setFila(filaOrdenada);
    setChamadas((cham ?? []) as unknown as Senha[]);
  };

  useEffect(() => {
    if (!clinicaAtual) return;
    void carregar();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void carregar(); }, 400);
    };
    const ch = supabase
      .channel(`recepcao-${clinicaAtual.clinica_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "senhas", filter: `clinica_id=eq.${clinicaAtual.clinica_id}` },
        debouncedReload,
      )
      .subscribe();
    return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaAtual?.clinica_id]);

  async function chamarProxima() {
    if (!clinicaAtual) return;
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!guiche.trim()) { toast.error("Informe o guichê"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("chamar_proxima_senha", {
      _clinica_id: clinicaAtual.clinica_id,
      _guiche: guiche.trim(),
    });
    setBusy(false);
    if (error) { mostrarErro(error); return; }
    if (!data) { toast.info("Não há senhas na fila"); return; }
    const row = Array.isArray(data) ? data[0] : data;
    toast.success(`Chamada ${row.codigo} no guichê ${guiche}`);
  }

  async function setStatus(id: string, status: "atendida" | "cancelada") {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const now = new Date().toISOString();
    const patch = status === "atendida"
      ? { status, atendida_em: now }
      : { status, cancelada_em: now };
    const { error } = await supabase.from("senhas").update(patch).eq("id", id);
    if (error) mostrarErro(error);
  }

  if (!clinicaAtual) return <div>Selecione uma clínica.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Recepção · Filas</h1>
          <p className="text-sm text-muted-foreground">Chame a próxima senha e acompanhe a fila em tempo real.</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="guiche-input" className="text-xs text-muted-foreground">Meu guichê</label>
            <input
              id="guiche-input"
              value={guiche}
              onChange={(e) => setGuiche(e.target.value.slice(0, 10))}
              className="h-10 w-24 px-3 rounded-md border bg-background text-lg font-semibold"
            />
          </div>
          <Button size="lg" onClick={chamarProxima} disabled={busy} data-primary>
            <Bell className="h-4 w-4 mr-2" /> Chamar próxima
            <kbd className="ml-2 hidden md:inline-flex h-5 min-w-5 items-center justify-center rounded border bg-background/20 px-1 text-[10px] font-mono">C</kbd>
          </Button>
          <Button variant="outline" asChild>
            <a href="/totem" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-2" /> Totem</a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/painel" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-2" /> Painel</a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-card border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Fila ({fila.length})</h2>
            <span className="text-xs text-muted-foreground">Ordem: E · P · R · N</span>
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {fila.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">Fila vazia</div>}
            {fila.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${TIPO_COR[s.tipo]}`}>{s.tipo}</span>
                  <span className="font-bold tabular-nums">{s.codigo}</span>
                  <span className="text-sm text-muted-foreground">
                    {s.pacientes?.nome ?? "Anônimo"}{s.identificado_por_facial ? " · 📷" : ""}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStatus(s.id, "cancelada")}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-card border rounded-xl p-5">
          <h2 className="font-semibold mb-3">Em atendimento / chamadas recentes</h2>
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {chamadas.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">Nenhuma chamada hoje</div>}
            {chamadas.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${TIPO_COR[s.tipo]}`}>{s.tipo}</span>
                  <span className="font-bold tabular-nums">{s.codigo}</span>
                  <span className="text-sm text-muted-foreground">Guichê {s.guiche ?? "—"}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => setStatus(s.id, "atendida")}>
                  <Check className="h-4 w-4 mr-1" /> Concluir
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}