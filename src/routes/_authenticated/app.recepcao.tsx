import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Bell, Check, X, ExternalLink, Volume2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/recepcao")({
  component: RecepcaoPage,
});

type Senha = {
  id: string;
  codigo: string;
  tipo: "N" | "P" | "C" | "R";
  status: string;
  guiche: string | null;
  emitida_em: string;
  chamada_em: string | null;
  identificado_por_facial: boolean;
  paciente_id: string | null;
  pacientes?: { nome: string } | null;
};

const TIPO_COR: Record<string, string> = {
  N: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
  P: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  C: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20",
  R: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
};

const ACTION_BTN =
  "border border-border/50 text-muted-foreground rounded-lg px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 transition-colors";

// Prioridade de atendimento: Emergência > Prioritário > Retorno > Normal
const TIPO_PRIORIDADE: Record<string, number> = { C: 0, P: 1, R: 2, N: 3 };

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
  const [tipoFiltro, setTipoFiltro] = useState<"AUTO" | "N" | "P" | "C" | "R">("AUTO");
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
      // Fila da recepção: apenas senhas emitidas pelo totem/recepção
      // (exclui as senhas geradas pela Triagem, que já nascem com status="chamada").
      supabase.from("senhas").select(sel).eq("clinica_id", clinicaAtual.clinica_id).eq("data_dia", hoje).eq("status", "emitida").order("emitida_em"),
      // Chamadas recentes: só as chamadas feitas pela Recepção — filtra fora
      // qualquer senha cujo guichê comece com "Triagem" (fila separada).
      supabase.from("senhas").select(sel).eq("clinica_id", clinicaAtual.clinica_id).eq("data_dia", hoje).eq("status", "chamada").not("guiche", "ilike", "Triagem%").order("chamada_em", { ascending: false }).limit(10),
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
    const { data, error } = await supabase.rpc("chamar_proxima_senha_tipo", {
      _clinica_id: clinicaAtual.clinica_id,
      _guiche: guiche.trim(),
      _tipo: tipoFiltro === "AUTO" ? null : tipoFiltro,
    } as never);
    setBusy(false);
    if (error) { mostrarErro(error); return; }
    if (!data) {
      toast.info(tipoFiltro === "AUTO" ? "Não há senhas na fila" : `Não há senhas do tipo ${tipoFiltro}`);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    toast.success(`Chamada ${row.codigo} no guichê ${guiche}`);
  }

  async function rechamar(id: string) {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const { data, error } = await supabase.rpc("rechamar_senha", { _id: id } as never);
    if (error) { mostrarErro(error); return; }
    const row = Array.isArray(data) ? data[0] : data;
    toast.success(`Rechamada ${row?.codigo ?? ""}`);
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground/90">Recepção · Filas</h1>
          <p className="text-sm text-muted-foreground/80 leading-relaxed mt-0.5">Chame a próxima senha e acompanhe a fila em tempo real.</p>
        </div>
        <div className="flex items-center justify-end gap-3 flex-wrap">
          <div className="bg-background border border-border/60 rounded-xl px-3 py-1.5 text-xs font-semibold flex items-center gap-2 shadow-2xs">
            <label htmlFor="guiche-input" className="text-muted-foreground font-medium">Meu guichê</label>
            <input
              id="guiche-input"
              value={guiche}
              onChange={(e) => setGuiche(e.target.value.slice(0, 10))}
              className="w-12 bg-transparent text-sm font-bold outline-none"
            />
          </div>
          <div className="bg-background border border-border/60 rounded-xl px-3 py-1.5 text-xs font-semibold flex items-center gap-2 shadow-2xs">
            <label htmlFor="tipo-select" className="text-muted-foreground font-medium">Tipo</label>
            <select
              id="tipo-select"
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value as typeof tipoFiltro)}
              className="bg-transparent text-xs font-semibold outline-none"
            >
              <option value="AUTO">Automático (C · P · R · N)</option>
              <option value="C">C · Cartão consulta</option>
              <option value="P">P · Preferencial</option>
              <option value="R">R · Retorno</option>
              <option value="N">N · Comum</option>
            </select>
          </div>
          <button
            type="button"
            onClick={chamarProxima}
            disabled={busy}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-5 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-2.5 disabled:opacity-60"
          >
            <Bell className="h-4 w-4" /> Chamar próxima
            <kbd className="hidden md:inline-flex bg-primary-foreground/20 text-primary-foreground text-[10px] font-mono px-1.5 py-0.5 rounded-md">C</kbd>
          </button>
          <a
            href="/app/configuracoes/painel-totem"
            title="Links, QR Codes e rotação de token do Painel e Totem"
            className="border border-border/60 hover:bg-muted text-foreground font-medium rounded-xl px-4 py-2.5 text-xs flex items-center gap-2 transition-colors"
          >
            <ExternalLink className="h-4 w-4" /> Painel & Totem
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-card border border-border/50 rounded-2xl p-5 shadow-2xs flex flex-col gap-4 min-h-[500px]">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              Fila
              <span className="bg-primary/10 text-primary font-bold px-2.5 py-0.5 rounded-full text-xs">{fila.length}</span>
            </h2>
            <span className="text-[11px] text-muted-foreground font-medium bg-muted/40 border border-border/40 px-2.5 py-1 rounded-lg">Ordem: C · P · R · N</span>
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {fila.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">Fila vazia</div>}
            {fila.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 hover:bg-muted/50 border border-border/40 transition-all">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${TIPO_COR[s.tipo]}`}>{s.tipo}</span>
                  <span className="text-base font-bold tracking-tight text-foreground font-mono tabular-nums">{s.codigo}</span>
                  <span className="text-sm text-muted-foreground">
                    {s.pacientes?.nome ?? "Anônimo"}{s.identificado_por_facial ? " · 📷" : ""}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Cancelar senha"
                  onClick={() => setStatus(s.id, "cancelada")}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-card border border-border/50 rounded-2xl p-5 shadow-2xs flex flex-col gap-4 min-h-[500px]">
          <h2 className="font-semibold">Em atendimento / chamadas recentes</h2>
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {chamadas.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">Nenhuma chamada hoje</div>}
            {chamadas.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  i === 0
                    ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                    : "bg-muted/20 hover:bg-muted/50 border-border/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${TIPO_COR[s.tipo]}`}>{s.tipo}</span>
                  <span className="text-base font-bold tracking-tight text-foreground font-mono tabular-nums">{s.codigo}</span>
                  <span className="text-sm text-muted-foreground">Guichê {s.guiche ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => rechamar(s.id)}
                    title="Rechamar (o painel toca e fala novamente)"
                    className={`${ACTION_BTN} hover:bg-amber-500/10 hover:text-amber-600`}
                  >
                    <Volume2 className="h-4 w-4" /> Rechamar
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus(s.id, "atendida")}
                    className={`${ACTION_BTN} hover:bg-emerald-500/10 hover:text-emerald-600`}
                  >
                    <Check className="h-4 w-4" /> Concluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}