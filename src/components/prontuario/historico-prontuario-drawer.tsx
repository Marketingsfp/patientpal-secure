import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Loader2, ChevronDown, ChevronRight } from "lucide-react";

/**
 * Gaveta com o histórico clínico do paciente.
 *
 * Abre a partir da fila do médico, sem sair da tela de atendimento: a médica
 * precisa ler a consulta anterior antes de chamar o paciente, e até aqui o
 * único caminho era abrir o cadastro do paciente em outra tela e perder a fila
 * de vista.
 *
 * Só lê o que já está gravado em `prontuarios` — nenhum resumo automático,
 * nenhuma inteligência artificial: o texto mostrado é exatamente o que o
 * profissional escreveu na consulta.
 */

type ProntuarioItem = {
  id: string;
  data: string;
  medico_id: string | null;
  queixa_principal: string | null;
  historia_doenca: string | null;
  exame_fisico: string | null;
  hipotese_diagnostica: string | null;
  conduta: string | null;
  prescricao: string | null;
  observacoes: string | null;
};

type Props = {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  pacienteId: string | null;
  pacienteNome: string;
  clinicaId: string | null;
  /** Prontuário do atendimento aberto agora — fica de fora da lista de "anteriores". */
  agendamentoAtualId?: string | null;
};

function dataPorExtenso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Bloco de texto do prontuário. Não mostra rótulo de campo que ficou vazio. */
function Campo({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto || !texto.trim()) return null;
  return (
    <div>
      <div className="text-[11px] uppercase text-muted-foreground">{titulo}</div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{texto}</div>
    </div>
  );
}

export function HistoricoProntuarioDrawer({
  aberto,
  onOpenChange,
  pacienteId,
  pacienteNome,
  clinicaId,
  agendamentoAtualId,
}: Props) {
  const [carregando, setCarregando] = useState(false);
  const [itens, setItens] = useState<ProntuarioItem[]>([]);
  const [medicos, setMedicos] = useState<Record<string, { nome: string; especialidade: string }>>(
    {},
  );
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto || !pacienteId || !clinicaId) return;
    let cancel = false;
    setCarregando(true);
    setErro(null);
    (async () => {
      const { data, error } = await supabase
        .from("prontuarios")
        .select(
          "id, data, medico_id, agendamento_id, queixa_principal, historia_doenca, exame_fisico, hipotese_diagnostica, conduta, prescricao, observacoes",
        )
        .eq("clinica_id", clinicaId)
        .eq("paciente_id", pacienteId)
        .order("data", { ascending: false });
      if (cancel) return;
      if (error) {
        setErro("Não foi possível carregar o histórico do prontuário.");
        setItens([]);
        setCarregando(false);
        return;
      }
      const linhas = (
        (data ?? []) as unknown as Array<ProntuarioItem & { agendamento_id: string | null }>
      ).filter((p) => !agendamentoAtualId || p.agendamento_id !== agendamentoAtualId);
      setItens(linhas);
      // A consulta mais recente já vem aberta: é a que a médica procura.
      setAbertos(linhas.length > 0 ? new Set([linhas[0].id]) : new Set());

      const ids = Array.from(new Set(linhas.map((p) => p.medico_id).filter(Boolean))) as string[];
      if (ids.length > 0) {
        const { data: meds } = await supabase
          .from("medicos")
          .select("id, nome, especialidades:especialidades!medicos_especialidade_id_fkey(nome)")
          .in("id", ids);
        if (cancel) return;
        const mapa: Record<string, { nome: string; especialidade: string }> = {};
        for (const m of (meds ?? []) as unknown as Array<{
          id: string;
          nome: string;
          especialidades?: { nome: string } | null;
        }>) {
          mapa[m.id] = { nome: m.nome, especialidade: m.especialidades?.nome ?? "" };
        }
        setMedicos(mapa);
      } else {
        setMedicos({});
      }
      setCarregando(false);
    })();
    return () => {
      cancel = true;
    };
  }, [aberto, pacienteId, clinicaId, agendamentoAtualId]);

  const alternar = (id: string) => {
    setAbertos((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  return (
    <Sheet open={aberto} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-3 sm:max-w-xl">
        <SheetHeader className="space-y-1">
          <SheetTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Histórico do prontuário
          </SheetTitle>
          <SheetDescription className="uppercase font-medium text-foreground">
            {pacienteNome}
          </SheetDescription>
          <SheetDescription>
            Consultas anteriores registradas no sistema, da mais recente para a mais antiga.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          {carregando ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : erro ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
              {erro}
            </div>
          ) : itens.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Este paciente ainda não tem prontuário anterior registrado no sistema.
            </div>
          ) : (
            <div className="space-y-2">
              {itens.map((p) => {
                const med = p.medico_id ? medicos[p.medico_id] : null;
                const estaAberto = abertos.has(p.id);
                return (
                  <div key={p.id} className="rounded-md border">
                    <button
                      type="button"
                      onClick={() => alternar(p.id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50"
                    >
                      <span className="flex items-center gap-2">
                        {estaAberto ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium tabular-nums">
                          {dataPorExtenso(p.data)}
                        </span>
                        <span className="text-xs uppercase text-muted-foreground">
                          {med?.nome ?? "—"}
                        </span>
                      </span>
                      {med?.especialidade && (
                        <Badge variant="outline" className="shrink-0 text-[11px] uppercase">
                          {med.especialidade}
                        </Badge>
                      )}
                    </button>
                    {estaAberto && (
                      <div className="space-y-3 border-t px-3 py-3">
                        <Campo titulo="Queixa principal" texto={p.queixa_principal} />
                        <Campo titulo="História da doença atual" texto={p.historia_doenca} />
                        <Campo titulo="Exame físico" texto={p.exame_fisico} />
                        <Campo titulo="Hipótese diagnóstica" texto={p.hipotese_diagnostica} />
                        <Campo titulo="Conduta" texto={p.conduta} />
                        <Campo titulo="Prescrição" texto={p.prescricao} />
                        <Campo titulo="Observações" texto={p.observacoes} />
                        {!p.queixa_principal &&
                          !p.historia_doenca &&
                          !p.exame_fisico &&
                          !p.hipotese_diagnostica &&
                          !p.conduta &&
                          !p.prescricao &&
                          !p.observacoes && (
                            <div className="text-sm text-muted-foreground">
                              Consulta registrada sem texto no prontuário.
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t pt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
