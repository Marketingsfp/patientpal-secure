import { useMemo } from "react";
import { AlertTriangle, CalendarX, GaugeCircle, Trophy, UserX } from "lucide-react";
import { formatDuracao } from "@/lib/coach/study-time";
import { NOTA_MINIMA } from "@/lib/coach/treinamento-plano";

export type AlunoResumo = {
  nome: string;
  clinicaId: string | null;
  segundosTotal: number;
  dias: number;
  progresso: number;
  mediaProva: number;
  mediaRoleplay: number;
  provas: number;
  roleplays: number;
  ultimo: string | null;
};

const DIAS_PARADA = 3;

function diasDesde(dia: string | null) {
  if (!dia) return null;
  const hoje = new Date(
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
  ).getTime();
  const d = new Date(dia).getTime();
  if (Number.isNaN(d)) return null;
  return Math.max(0, Math.round((hoje - d) / 86400000));
}

/** Painel "o que fazer hoje": quem parou, quem está abaixo da meta e ranking por clínica. */
export function PainelAcoes({
  alunos,
  clinicas,
}: {
  alunos: AlunoResumo[];
  clinicas: { id: string; nome: string }[];
}) {
  const nomeClinica = useMemo(() => new Map(clinicas.map((c) => [c.id, c.nome])), [clinicas]);

  const grupos = useMemo(() => {
    const naoComecaram = alunos.filter((a) => a.segundosTotal === 0 && a.roleplays === 0);
    const paradas = alunos
      .filter((a) => a.progresso < 100 && a.segundosTotal > 0)
      .map((a) => ({ ...a, parado: diasDesde(a.ultimo) }))
      .filter((a) => (a.parado ?? 0) >= DIAS_PARADA)
      .sort((a, b) => (b.parado ?? 0) - (a.parado ?? 0));
    const abaixo = alunos
      .filter(
        (a) =>
          (a.roleplays > 0 && a.mediaRoleplay < NOTA_MINIMA) ||
          (a.provas > 0 && a.mediaProva < NOTA_MINIMA),
      )
      .sort(
        (a, b) =>
          Math.min(a.mediaRoleplay || 10, a.mediaProva || 10) -
          Math.min(b.mediaRoleplay || 10, b.mediaProva || 10),
      );

    const porClinica = new Map<string, AlunoResumo[]>();
    alunos.forEach((a) => {
      const k = a.clinicaId ?? "__sem__";
      porClinica.set(k, [...(porClinica.get(k) ?? []), a]);
    });
    const ranking = Array.from(porClinica.entries())
      .map(([id, lista]) => ({
        id,
        nome: nomeClinica.get(id) ?? "Sem clínica",
        atendentes: lista.length,
        progresso: Math.round(lista.reduce((s, a) => s + a.progresso, 0) / lista.length),
        tempo: lista.reduce((s, a) => s + a.segundosTotal, 0),
        nota: (() => {
          const notas = lista.filter((a) => a.roleplays > 0).map((a) => a.mediaRoleplay);
          return notas.length ? notas.reduce((s, x) => s + x, 0) / notas.length : 0;
        })(),
      }))
      .sort((a, b) => b.progresso - a.progresso || b.nota - a.nota);

    return { naoComecaram, paradas, abaixo, ranking };
  }, [alunos, nomeClinica]);

  const semAlertas =
    grupos.naoComecaram.length === 0 && grupos.paradas.length === 0 && grupos.abaixo.length === 0;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="rounded-xl border bg-card p-4 md:p-5 shadow-sm">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <GaugeCircle className="h-4 w-4 text-primary" /> O que fazer hoje
        </h3>

        {semAlertas ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhum alerta: a equipe está em dia com o treinamento e dentro da meta de nota.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <Bloco
              icone={<CalendarX className="h-3.5 w-3.5" />}
              tom="warning"
              titulo={`${grupos.paradas.length} sem estudar há ${DIAS_PARADA}+ dias`}
              itens={grupos.paradas.map((a) => ({
                nome: a.nome,
                detalhe: `${a.parado} dias parada · ${a.progresso}% concluído`,
                clinica: nomeClinica.get(a.clinicaId ?? "") ?? null,
              }))}
            />
            <Bloco
              icone={<AlertTriangle className="h-3.5 w-3.5" />}
              tom="destructive"
              titulo={`${grupos.abaixo.length} com nota abaixo de ${NOTA_MINIMA}`}
              itens={grupos.abaixo.map((a) => ({
                nome: a.nome,
                detalhe: `atendimentos ${a.roleplays ? a.mediaRoleplay.toFixed(1) : "—"} · prova ${
                  a.provas ? a.mediaProva.toFixed(1) : "—"
                }`,
                clinica: nomeClinica.get(a.clinicaId ?? "") ?? null,
              }))}
            />
            <Bloco
              icone={<UserX className="h-3.5 w-3.5" />}
              tom="muted"
              titulo={`${grupos.naoComecaram.length} ainda não começaram`}
              itens={grupos.naoComecaram.map((a) => ({
                nome: a.nome,
                detalhe: "nenhuma atividade registrada",
                clinica: nomeClinica.get(a.clinicaId ?? "") ?? null,
              }))}
            />
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 md:p-5 shadow-sm">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" /> Ranking por clínica
        </h3>
        <ol className="mt-3 space-y-2">
          {grupos.ranking.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 rounded-lg border p-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{c.nome}</p>
                <p className="text-[11px] text-muted-foreground">
                  {c.atendentes} {c.atendentes === 1 ? "atendente" : "atendentes"} ·{" "}
                  {formatDuracao(c.tempo)}
                  {c.nota > 0 ? ` · nota ${c.nota.toFixed(1)}` : ""}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums shrink-0">{c.progresso}%</span>
            </li>
          ))}
          {grupos.ranking.length === 0 && (
            <li className="text-sm text-muted-foreground">Sem dados ainda.</li>
          )}
        </ol>
      </div>
    </div>
  );
}

function Bloco({
  icone,
  titulo,
  itens,
  tom,
}: {
  icone: React.ReactNode;
  titulo: string;
  itens: { nome: string; detalhe: string; clinica: string | null }[];
  tom: "warning" | "destructive" | "muted";
}) {
  if (itens.length === 0) return null;
  const cor =
    tom === "destructive"
      ? "bg-destructive/10 text-destructive"
      : tom === "warning"
        ? "bg-primary/10 text-primary"
        : "bg-secondary text-muted-foreground";
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-semibold flex items-center gap-2">
        <span className={`grid h-6 w-6 place-items-center rounded-full ${cor}`}>{icone}</span>
        {titulo}
      </p>
      <ul className="mt-2 space-y-1">
        {itens.slice(0, 6).map((it) => (
          <li key={it.nome} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-medium truncate">
              {it.nome}
              {it.clinica && (
                <span className="text-muted-foreground font-normal"> · {it.clinica}</span>
              )}
            </span>
            <span className="text-muted-foreground shrink-0">{it.detalhe}</span>
          </li>
        ))}
        {itens.length > 6 && (
          <li className="text-[11px] text-muted-foreground">+{itens.length - 6} outras</li>
        )}
      </ul>
    </div>
  );
}
