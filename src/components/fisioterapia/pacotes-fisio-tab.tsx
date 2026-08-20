import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PacienteNomeCell } from "@/components/paciente-nome";
import { NovoPacoteDialog } from "@/components/fisioterapia/novo-pacote-dialog";
import { SessaoDialog, type SessaoRow } from "@/components/fisioterapia/sessao-dialog";
import {
  PACOTE_STATUS_LABEL,
  SESSAO_CLASSE,
  SESSAO_LABEL,
  type FisioSessaoStatus,
} from "@/lib/fisio";
import { formatDatePura } from "@/lib/date-utils";

interface Props {
  clinicaId: string;
  /** null = lista os pacotes de toda a clínica (visão de gestão). */
  pacienteId: string | null;
  pacienteNome: string | null;
  userId: string | null;
  readOnly?: boolean;
  /** Permite abrir o diálogo de criação por um botão fora deste componente. */
  novoOpen?: boolean;
  onNovoOpenChange?: (v: boolean) => void;
}

interface Pacote {
  id: string;
  paciente_id: string;
  descricao: string;
  total_sessoes: number;
  valor_total: number;
  data_inicio: string;
  status: string;
  observacoes: string | null;
}

const SELECT_SESSAO =
  "id,pacote_id,numero,agendamento_id,data_prevista,status,evolucao,dor_antes,dor_depois,realizada_em";

export function PacotesFisioTab({
  clinicaId,
  pacienteId,
  pacienteNome,
  userId,
  readOnly = false,
  novoOpen,
  onNovoOpenChange,
}: Props) {
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [sessoes, setSessoes] = useState<Record<string, SessaoRow[]>>({});
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ sessao: SessaoRow; pacienteId: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [novoInterno, setNovoInterno] = useState(false);

  const novoAberto = novoOpen ?? novoInterno;
  const setNovoAberto = onNovoOpenChange ?? setNovoInterno;

  const carregar = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("fisio_pacotes")
      .select("id,paciente_id,descricao,total_sessoes,valor_total,data_inicio,status,observacoes")
      .eq("clinica_id", clinicaId)
      .order("data_inicio", { ascending: false });
    if (pacienteId) q = q.eq("paciente_id", pacienteId);
    const { data, error } = await q;
    if (error) {
      setLoading(false);
      mostrarErro(error);
      return;
    }
    const lista = (data as Pacote[]) ?? [];
    setPacotes(lista);

    if (lista.length === 0) {
      setSessoes({});
      setLoading(false);
      return;
    }
    const { data: ss } = await supabase
      .from("fisio_sessoes")
      .select(SELECT_SESSAO)
      .in(
        "pacote_id",
        lista.map((p) => p.id),
      )
      .order("numero");
    const porPacote: Record<string, SessaoRow[]> = {};
    for (const s of (ss ?? []) as Array<SessaoRow & { pacote_id: string }>) {
      (porPacote[s.pacote_id] ??= []).push(s);
    }
    setSessoes(porPacote);
    setLoading(false);
  }, [clinicaId, pacienteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando pacotes…</p>;
  }

  return (
    <div className="space-y-4">
      {!readOnly && pacienteId && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setNovoAberto(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo pacote
          </Button>
        </div>
      )}

      {pacotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {pacienteId
            ? "Este paciente ainda não tem pacote de sessões."
            : "Nenhum pacote de fisioterapia cadastrado nesta clínica."}
        </p>
      ) : (
        <div className="space-y-3">
          {pacotes.map((p) => (
            <PacoteCard
              key={p.id}
              pacote={p}
              sessoes={sessoes[p.id] ?? []}
              mostrarPaciente={!pacienteId}
              expandido={aberto === p.id}
              onToggle={() => setAberto((a) => (a === p.id ? null : p.id))}
              onAbrirSessao={(s) => setEditando({ sessao: s, pacienteId: p.paciente_id })}
            />
          ))}
        </div>
      )}

      {pacienteId && (
        <NovoPacoteDialog
          open={novoAberto}
          onClose={() => setNovoAberto(false)}
          clinicaId={clinicaId}
          pacienteId={pacienteId}
          pacienteNome={pacienteNome ?? ""}
          userId={userId}
          onCreated={() => void carregar()}
        />
      )}

      {editando && (
        <SessaoDialog
          open={!!editando}
          onClose={() => setEditando(null)}
          clinicaId={clinicaId}
          pacienteId={editando.pacienteId}
          sessao={editando.sessao}
          userId={userId}
          readOnly={readOnly}
          onSaved={() => void carregar()}
        />
      )}
    </div>
  );
}

function PacoteCard({
  pacote,
  sessoes,
  mostrarPaciente,
  expandido,
  onToggle,
  onAbrirSessao,
}: {
  pacote: Pacote;
  sessoes: SessaoRow[];
  mostrarPaciente: boolean;
  expandido: boolean;
  onToggle: () => void;
  onAbrirSessao: (s: SessaoRow) => void;
}) {
  // "Usadas" conta realizadas e faltas: a falta consome a sessão do pacote,
  // que é justamente o que a clínica precisa enxergar para cobrar ou repor.
  const realizadas = useMemo(
    () => sessoes.filter((s) => s.status === "realizada").length,
    [sessoes],
  );
  const faltas = useMemo(() => sessoes.filter((s) => s.status === "faltou").length, [sessoes]);
  const pct = pacote.total_sessoes > 0 ? (realizadas / pacote.total_sessoes) * 100 : 0;

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-start justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            <p className="font-medium flex items-center gap-2">
              {expandido ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
              {pacote.descricao}
            </p>
            <p className="text-xs text-muted-foreground ml-6">
              {mostrarPaciente && (
                <>
                  <PacienteNomeCell id={pacote.paciente_id} /> ·{" "}
                </>
              )}
              Início {formatDatePura(pacote.data_inicio)} · R${" "}
              {Number(pacote.valor_total).toFixed(2)}
              {faltas > 0 && ` · ${faltas} falta(s)`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-mono">
              {realizadas}/{pacote.total_sessoes}
            </span>
            <Badge variant={pacote.status === "ativo" ? "default" : "secondary"}>
              {PACOTE_STATUS_LABEL[pacote.status] ?? pacote.status}
            </Badge>
          </div>
        </button>

        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>

        {expandido && (
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap gap-2">
              {sessoes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onAbrirSessao(s)}
                  title={`Sessão ${s.numero} — ${SESSAO_LABEL[s.status]}${
                    s.data_prevista ? ` · ${formatDatePura(s.data_prevista)}` : ""
                  }`}
                  className={`h-9 w-9 rounded-md border-2 text-xs font-mono ${
                    SESSAO_CLASSE[s.status] ?? SESSAO_CLASSE.pendente
                  }`}
                >
                  {s.numero}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {(Object.keys(SESSAO_LABEL) as FisioSessaoStatus[]).map((st) => (
                <span
                  key={st}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-sm border ${SESSAO_CLASSE[st]}`}
                  />
                  {SESSAO_LABEL[st]}
                </span>
              ))}
            </div>
            {pacote.observacoes && (
              <p className="text-sm text-muted-foreground">{pacote.observacoes}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
