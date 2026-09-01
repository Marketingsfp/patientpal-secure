// Fila de solicitações vindas do site institucional.
//
// São linhas de `agendamentos` com `origem_integracao = 'site_publico'` e
// `solicitacao_pendente = true`. Ficam separadas da agenda operacional até a
// recepção conferir médico/horário: o marcador é o que impede que uma
// solicitação não confirmada seja lida como atendimento agendado de verdade.

import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Globe, Check, X, RefreshCw, UserPlus, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { mostrarErro } from "@/lib/traduzir-erro";

type Solicitacao = {
  id: string;
  paciente_id: string | null;
  paciente_nome: string;
  inicio: string;
  procedimento: string | null;
  observacoes: string | null;
  created_at: string;
};

const BTN =
  "border border-border/50 text-muted-foreground rounded-lg px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-muted/60";

export function SolicitacoesSite() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("recepcao");
  const [itens, setItens] = useState<Solicitacao[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!clinicaAtual) return;
    setCarregando(true);
    const { data, error } = await supabase
      .from("agendamentos")
      .select("id,paciente_id,paciente_nome,inicio,procedimento,observacoes,created_at")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("origem_integracao", "site_publico")
      .eq("solicitacao_pendente", true)
      .neq("status", "cancelado")
      .order("created_at", { ascending: false })
      .limit(100);
    setCarregando(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    setItens((data ?? []) as Solicitacao[]);
  }, [clinicaAtual?.clinica_id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Chegada em tempo real: a recepção não precisa ficar recarregando a tela.
  useEffect(() => {
    if (!clinicaAtual) return;
    const canal = supabase
      .channel(`solicitacoes-site-${clinicaAtual.clinica_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agendamentos" },
        () => void carregar(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [clinicaAtual?.clinica_id, carregar]);

  async function resolver(id: string, acao: "confirmar" | "recusar") {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    const patch =
      acao === "confirmar"
        ? { solicitacao_pendente: false, status: "confirmado" as const }
        : { solicitacao_pendente: false, status: "cancelado" as const };
    const { error } = await supabase.from("agendamentos").update(patch).eq("id", id);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success(acao === "confirmar" ? "Solicitação confirmada." : "Solicitação recusada.");
    setItens((prev) => prev.filter((i) => i.id !== id));
  }

  if (!clinicaAtual) return null;
  if (!carregando && itens.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-amber-600 dark:text-amber-400" />
          <h2 className="text-sm font-bold text-foreground/90">
            Solicitações do site — pendentes de confirmação
            <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {itens.length}
            </span>
          </h2>
        </div>
        <button type="button" className={BTN} onClick={() => void carregar()}>
          <RefreshCw className="size-3.5" /> Atualizar
        </button>
      </header>

      <p className="mt-1 text-xs text-muted-foreground/80">
        Vieram do formulário “Agende sua consulta” do site. Não ocupam horário de verdade — ajuste
        médico e horário na Agenda e confirme aqui.
      </p>

      <ul className="mt-3 space-y-2">
        {itens.map((s) => {
          const criadoAgora = (s.observacoes ?? "").includes("CADASTRADO AGORA");
          return (
            <li
              key={s.id}
              className="rounded-xl border border-border/60 bg-background p-3 flex flex-wrap items-start justify-between gap-3"
            >
              <div className="min-w-[220px] space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{s.paciente_nome}</span>
                  <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                    veio do site
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      criadoAgora
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {criadoAgora ? (
                      <>
                        <UserPlus className="mr-1 inline size-3" />
                        paciente novo
                      </>
                    ) : (
                      "paciente já cadastrado"
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarClock className="size-3.5" />
                  Preferência: {new Date(s.inicio).toLocaleString("pt-BR")}
                  {s.procedimento ? ` · ${s.procedimento}` : ""}
                </div>
                {s.observacoes ? (
                  <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground/80">
                    {s.observacoes}
                  </pre>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link to="/app/agenda" className={BTN}>
                  Abrir agenda
                </Link>
                <button type="button" className={BTN} onClick={() => void resolver(s.id, "confirmar")}>
                  <Check className="size-3.5" /> Confirmar
                </button>
                <button type="button" className={BTN} onClick={() => void resolver(s.id, "recusar")}>
                  <X className="size-3.5" /> Recusar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
