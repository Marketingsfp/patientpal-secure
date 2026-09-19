import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  ClipboardList,
  Printer,
  Save,
  Target,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatDuracao } from "@/lib/coach/study-time";
import { META_LIGACOES, META_WHATSAPP, NOTA_MINIMA } from "@/lib/coach/treinamento-plano";
import { toast } from "sonner";

export type DesempenhoAluno = {
  nome: string;
  clinicaId: string | null;
  segundosTotal: number;
  dias: number;
  progresso: number;
  mediaProva: number;
  mediaRoleplay: number;
  provas: number;
  roleplays: number;
  conversas: number;
  ligacoes: number;
  ultimo: string | null;
};

type Meta = {
  atendente: string;
  clinica_id: string | null;
  meta_nota: number;
  meta_horas: number;
  observacao: string;
};

type Aba = "ranking" | "clinicas" | "fracos" | "cumprimento";

const SEM_CLINICA_LABEL = "Sem clínica";

function notaGeral(a: DesempenhoAluno) {
  const notas: number[] = [];
  if (a.roleplays > 0) notas.push(a.mediaRoleplay);
  if (a.provas > 0) notas.push(a.mediaProva);
  return notas.length ? notas.reduce((s, x) => s + x, 0) / notas.length : 0;
}

function normalizarPonto(txt: string) {
  return txt.trim().replace(/\s+/g, " ").replace(/^[-•\s]+/, "").slice(0, 90);
}

/** Painel de gestão de desempenho: ranking, comparativo por clínica, pontos fracos e metas. */
export function GestaoDesempenho({
  alunos,
  clinicas,
  clinicaId,
  podeEditar,
}: {
  alunos: DesempenhoAluno[];
  clinicas: { id: string; nome: string }[];
  /** Clínica em foco: as leituras abaixo nunca cruzam clínicas. */
  clinicaId?: string | null;
  podeEditar: boolean;
}) {
  const [aba, setAba] = useState<Aba>("ranking");
  const [metas, setMetas] = useState<Record<string, Meta>>({});
  const [fracos, setFracos] = useState<{ atendente: string; itens: string[] }[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<{ nota: string; horas: string; obs: string }>({
    nota: "",
    horas: "",
    obs: "",
  });
  const [salvando, setSalvando] = useState(false);

  const nomeClinica = useMemo(() => new Map(clinicas.map((c) => [c.id, c.nome])), [clinicas]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let qMetas = supabase
        .from("coach_desempenho_metas")
        .select("atendente,clinica_id,meta_nota,meta_horas,observacao")
        .limit(500);
      let qRoleplay = supabase
        .from("coach_roleplay_sessions")
        .select("atendente,pontos_fracos,melhorias")
        .order("created_at", { ascending: false })
        .limit(400);
      if (clinicaId) {
        qMetas = qMetas.eq("clinica_id", clinicaId);
        qRoleplay = qRoleplay.eq("clinica_id", clinicaId);
      }
      const [m, r] = await Promise.all([qMetas, qRoleplay]);
      if (cancelled) return;
      const mapa: Record<string, Meta> = {};
      ((m.data ?? []) as unknown as Meta[]).forEach((row) => {
        mapa[row.atendente] = {
          ...row,
          meta_nota: Number(row.meta_nota) || NOTA_MINIMA,
          meta_horas: Number(row.meta_horas) || 1,
          observacao: row.observacao ?? "",
        };
      });
      setMetas(mapa);
      const rows = (r.data ?? []) as unknown as {
        atendente: string;
        pontos_fracos: unknown;
        melhorias: unknown;
      }[];
      const agrupado = new Map<string, string[]>();
      rows.forEach((row) => {
        const lista = [
          ...(Array.isArray(row.pontos_fracos) ? (row.pontos_fracos as string[]) : []),
          ...(Array.isArray(row.melhorias) ? (row.melhorias as string[]) : []),
        ]
          .filter((x) => typeof x === "string" && x.trim().length > 3)
          .map(normalizarPonto);
        if (!lista.length) return;
        agrupado.set(row.atendente, [...(agrupado.get(row.atendente) ?? []), ...lista]);
      });
      setFracos(Array.from(agrupado.entries()).map(([atendente, itens]) => ({ atendente, itens })));
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicaId]);

  const ranking = useMemo(
    () =>
      alunos
        .map((a) => {
          const meta = metas[a.nome];
          const nota = notaGeral(a);
          const metaNota = meta?.meta_nota ?? NOTA_MINIMA;
          return {
            ...a,
            nota,
            metaNota,
            metaHoras: meta?.meta_horas ?? 1,
            observacao: meta?.observacao ?? "",
            atingiu: nota > 0 && nota >= metaNota,
          };
        })
        .sort((a, b) => b.nota - a.nota || b.progresso - a.progresso),
    [alunos, metas],
  );

  const porClinica = useMemo(() => {
    const buckets = new Map<string, typeof ranking>();
    ranking.forEach((a) => {
      const k = a.clinicaId ?? "__sem__";
      buckets.set(k, [...(buckets.get(k) ?? []), a]);
    });
    return Array.from(buckets.entries())
      .map(([id, lista]) => {
        const comNota = lista.filter((a) => a.nota > 0);
        return {
          id,
          nome: nomeClinica.get(id) ?? SEM_CLINICA_LABEL,
          atendentes: lista.length,
          nota: comNota.length ? comNota.reduce((s, a) => s + a.nota, 0) / comNota.length : 0,
          progresso: Math.round(lista.reduce((s, a) => s + a.progresso, 0) / lista.length),
          tempo: lista.reduce((s, a) => s + a.segundosTotal, 0),
          naMeta: lista.filter((a) => a.atingiu).length,
          conversas: lista.reduce((s, a) => s + a.conversas, 0),
          ligacoes: lista.reduce((s, a) => s + a.ligacoes, 0),
          provas: lista.reduce((s, a) => s + a.provas, 0),
        };
      })
      .sort((a, b) => b.nota - a.nota || b.progresso - a.progresso);
  }, [ranking, nomeClinica]);

  const nomesVisiveis = useMemo(() => new Set(alunos.map((a) => a.nome)), [alunos]);

  const fracosGerais = useMemo(() => {
    const contagem = new Map<string, { total: number; pessoas: Set<string> }>();
    fracos
      .filter((f) => nomesVisiveis.has(f.atendente))
      .forEach((f) => {
        f.itens.forEach((item) => {
          const chave = item.toLowerCase();
          const atual = contagem.get(chave) ?? { total: 0, pessoas: new Set<string>() };
          atual.total += 1;
          atual.pessoas.add(f.atendente);
          contagem.set(chave, atual);
        });
      });
    return Array.from(contagem.entries())
      .map(([texto, v]) => ({ texto, total: v.total, pessoas: Array.from(v.pessoas) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [fracos, nomesVisiveis]);

  const fracosPorPessoa = useMemo(() => {
    return fracos
      .filter((f) => nomesVisiveis.has(f.atendente))
      .map((f) => {
        const contagem = new Map<string, number>();
        f.itens.forEach((i) => contagem.set(i.toLowerCase(), (contagem.get(i.toLowerCase()) ?? 0) + 1));
        return {
          atendente: f.atendente,
          top: Array.from(contagem.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3),
        };
      })
      .sort((a, b) => a.atendente.localeCompare(b.atendente));
  }, [fracos, nomesVisiveis]);

  const resumo = useMemo(() => {
    const comNota = ranking.filter((a) => a.nota > 0);
    return {
      nota: comNota.length ? comNota.reduce((s, a) => s + a.nota, 0) / comNota.length : 0,
      naMeta: ranking.filter((a) => a.atingiu).length,
      abaixo: comNota.filter((a) => !a.atingiu).length,
      semAvaliacao: ranking.length - comNota.length,
    };
  }, [ranking]);

  function abrirEdicao(nome: string) {
    const alvo = ranking.find((a) => a.nome === nome);
    setEditando(nome);
    setRascunho({
      nota: String(alvo?.metaNota ?? NOTA_MINIMA),
      horas: String(alvo?.metaHoras ?? 1),
      obs: alvo?.observacao ?? "",
    });
  }

  async function salvar(nome: string, clinicaId: string | null) {
    const nota = Math.min(10, Math.max(0, Number(rascunho.nota.replace(",", ".")) || NOTA_MINIMA));
    const horas = Math.min(100, Math.max(0, Number(rascunho.horas.replace(",", ".")) || 1));
    setSalvando(true);
    const { data: sessao } = await supabase.auth.getUser();
    const { error } = await supabase.from("coach_desempenho_metas").upsert(
      {
        atendente: nome,
        clinica_id: clinicaId,
        meta_nota: nota,
        meta_horas: horas,
        observacao: rascunho.obs.slice(0, 2000),
        autor_email: sessao.user?.email ?? null,
      } as never,
      { onConflict: "clinica_id,atendente" },
    );
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMetas((cur) => ({
      ...cur,
      [nome]: {
        atendente: nome,
        clinica_id: clinicaId,
        meta_nota: nota,
        meta_horas: horas,
        observacao: rascunho.obs,
      },
    }));
    setEditando(null);
    toast.success(`Meta e observação salvas para ${nome}.`);
  }

  function imprimir() {
    const linhas = ranking
      .map(
        (a) => `<tr>
          <td>${a.nome}</td>
          <td>${nomeClinica.get(a.clinicaId ?? "") ?? SEM_CLINICA_LABEL}</td>
          <td class="n">${a.nota > 0 ? a.nota.toFixed(1) : "—"}</td>
          <td class="n">${a.metaNota.toFixed(1)}</td>
          <td class="n">${a.progresso}%</td>
          <td class="n">${formatDuracao(a.segundosTotal)}</td>
          <td class="n">${a.conversas}/${META_WHATSAPP} · ${a.ligacoes}/${META_LIGACOES}</td>
          <td>${a.observacao ? a.observacao.replace(/</g, "&lt;") : ""}</td>
        </tr>`,
      )
      .join("");
    const clinicasHtml = porClinica
      .map(
        (c) =>
          `<tr><td>${c.nome}</td><td class="n">${c.atendentes}</td><td class="n">${
            c.nota > 0 ? c.nota.toFixed(1) : "—"
          }</td><td class="n">${c.progresso}%</td><td class="n">${c.naMeta}/${c.atendentes}</td><td class="n">${formatDuracao(
            c.tempo,
          )}</td></tr>`,
      )
      .join("");
    const fracosHtml = fracosGerais
      .map((f) => `<li>${f.texto.replace(/</g, "&lt;")} — ${f.total}x (${f.pessoas.length} atendentes)</li>`)
      .join("");
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Relatório de desempenho</title>
      <style>
        body{font-family:system-ui,Arial,sans-serif;padding:28px;color:#111}
        h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:22px 0 8px}
        p.sub{color:#666;font-size:12px;margin:0 0 8px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ddd;padding:5px 6px;text-align:left;vertical-align:top}
        th{background:#f4f4f5} td.n{text-align:center;white-space:nowrap}
        ul{font-size:11px;padding-left:18px}
      </style></head><body>
      <h1>Relatório de desempenho</h1>
      <p class="sub">Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · nota média da equipe ${
        resumo.nota > 0 ? resumo.nota.toFixed(1) : "—"
      } · ${resumo.naMeta} de ${ranking.length} na meta</p>
      <h2>Comparativo por clínica</h2>
      <table><thead><tr><th>Clínica</th><th>Atendentes</th><th>Nota</th><th>Progresso</th><th>Na meta</th><th>Tempo</th></tr></thead><tbody>${clinicasHtml}</tbody></table>
      <h2>Ranking por atendente</h2>
      <table><thead><tr><th>Atendente</th><th>Clínica</th><th>Nota</th><th>Meta</th><th>Progresso</th><th>Tempo</th><th>Conversas/Ligações</th><th>Observação da gestora</th></tr></thead><tbody>${linhas}</tbody></table>
      <h2>Pontos fracos recorrentes</h2>
      <ul>${fracosHtml || "<li>Sem dados suficientes.</li>"}</ul>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="rounded-xl border bg-card p-4 md:p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" /> Gestão de desempenho
        </h3>
        <Button size="sm" variant="outline" onClick={imprimir}>
          <Printer className="h-3.5 w-3.5" /> Relatório
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Mini label="Nota média da equipe" valor={resumo.nota > 0 ? resumo.nota.toFixed(1) : "—"} />
        <Mini label="Dentro da meta" valor={`${resumo.naMeta}/${ranking.length}`} />
        <Mini label="Abaixo da meta" valor={String(resumo.abaixo)} alerta={resumo.abaixo > 0} />
        <Mini label="Sem avaliação" valor={String(resumo.semAvaliacao)} />
      </div>

      <div className="mt-4 flex items-center gap-1.5 overflow-x-auto">
        {(
          [
            ["ranking", "Ranking e metas", Target],
            ["clinicas", "Clínicas", Building2],
            ["fracos", "Pontos fracos", AlertTriangle],
            ["cumprimento", "Cumprimento", ClipboardList],
          ] as [Aba, string, typeof Target][]
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setAba(key)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              aba === key
                ? "bg-primary text-primary-foreground border-transparent"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {aba === "ranking" && (
        <ul className="mt-3 divide-y rounded-xl border overflow-hidden">
          {ranking.map((a, i) => (
            <li key={a.nome} className="px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {a.nome}
                    <span className="text-muted-foreground font-normal">
                      {" · "}
                      {nomeClinica.get(a.clinicaId ?? "") ?? SEM_CLINICA_LABEL}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {a.progresso}% da trilha · {formatDuracao(a.segundosTotal)} · meta{" "}
                    {a.metaNota.toFixed(1)}
                    {a.observacao ? " · com observação" : ""}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`shrink-0 tabular-nums ${
                    a.nota === 0
                      ? "text-muted-foreground"
                      : a.atingiu
                        ? "border-[color:var(--success)] text-[color:var(--success)]"
                        : "border-destructive text-destructive"
                  }`}
                >
                  {a.nota > 0 ? a.nota.toFixed(1) : "—"}
                </Badge>
                {podeEditar && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => (editando === a.nome ? setEditando(null) : abrirEdicao(a.nome))}
                  >
                    {editando === a.nome ? "Fechar" : "Meta"}
                  </Button>
                )}
              </div>

              {a.observacao && editando !== a.nome && (
                <p className="mt-2 rounded-lg bg-secondary/40 px-3 py-2 text-xs whitespace-pre-wrap">
                  {a.observacao}
                </p>
              )}

              {podeEditar && editando === a.nome && (
                <div className="mt-3 space-y-2 rounded-lg border p-3">
                  <div className="flex flex-wrap gap-2">
                    <label className="text-xs text-muted-foreground">
                      Meta de nota
                      <Input
                        value={rascunho.nota}
                        onChange={(e) => setRascunho((r) => ({ ...r, nota: e.target.value }))}
                        className="h-9 w-24 mt-1"
                        inputMode="decimal"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Meta de horas
                      <Input
                        value={rascunho.horas}
                        onChange={(e) => setRascunho((r) => ({ ...r, horas: e.target.value }))}
                        className="h-9 w-24 mt-1"
                        inputMode="decimal"
                      />
                    </label>
                  </div>
                  <Textarea
                    value={rascunho.obs}
                    onChange={(e) => setRascunho((r) => ({ ...r, obs: e.target.value }))}
                    placeholder="Observação da gestora (a atendente enxerga esse recado)"
                    rows={3}
                  />
                  <Button size="sm" disabled={salvando} onClick={() => salvar(a.nome, a.clinicaId)}>
                    <Save className="h-3.5 w-3.5" /> {salvando ? "Salvando…" : "Salvar"}
                  </Button>
                </div>
              )}
            </li>
          ))}
          {ranking.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              Sem atendentes neste filtro.
            </li>
          )}
        </ul>
      )}

      {aba === "clinicas" && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {porClinica.map((c) => (
            <div key={c.id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium truncate">{c.nome}</p>
                <span className="text-sm font-semibold tabular-nums">
                  {c.nota > 0 ? c.nota.toFixed(1) : "—"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {c.atendentes} {c.atendentes === 1 ? "atendente" : "atendentes"} ·{" "}
                {formatDuracao(c.tempo)} · {c.naMeta}/{c.atendentes} na meta
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${c.progresso}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {c.conversas} conversas · {c.ligacoes} ligações · {c.provas} provas · progresso{" "}
                {c.progresso}%
              </p>
            </div>
          ))}
          {porClinica.length === 0 && (
            <p className="text-sm text-muted-foreground">Sem dados por clínica ainda.</p>
          )}
        </div>
      )}

      {aba === "fracos" && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border p-3">
            <p className="text-xs font-semibold flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-primary" /> Mais recorrentes na equipe
            </p>
            <ul className="mt-2 space-y-1.5">
              {fracosGerais.map((f) => (
                <li key={f.texto} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="capitalize">{f.texto}</span>
                    <span className="text-muted-foreground shrink-0">{f.total}x</span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-destructive/70"
                      style={{
                        width: `${Math.round((f.total / (fracosGerais[0]?.total || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
              {fracosGerais.length === 0 && (
                <li className="text-xs text-muted-foreground">
                  Sem treinos avaliados suficientes para apontar padrões.
                </li>
              )}
            </ul>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs font-semibold">Foco individual</p>
            <ul className="mt-2 space-y-2">
              {fracosPorPessoa.map((p) => (
                <li key={p.atendente} className="text-xs">
                  <span className="font-medium">{p.atendente}</span>
                  <ul className="mt-0.5 list-disc pl-4 text-muted-foreground">
                    {p.top.map(([texto, qtd]) => (
                      <li key={texto} className="capitalize">
                        {texto} ({qtd}x)
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {fracosPorPessoa.length === 0 && (
                <li className="text-xs text-muted-foreground">Nenhum ponto fraco registrado.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {aba === "cumprimento" && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium py-1.5">Atendente</th>
                <th className="font-medium py-1.5">Tempo / meta</th>
                <th className="font-medium py-1.5">Conversas</th>
                <th className="font-medium py-1.5">Ligações</th>
                <th className="font-medium py-1.5">Provas</th>
                <th className="font-medium py-1.5">Dias</th>
                <th className="font-medium py-1.5">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ranking.map((a) => {
                const horasFeitas = a.segundosTotal / 3600;
                const emDia =
                  horasFeitas >= a.metaHoras &&
                  a.conversas >= META_WHATSAPP &&
                  a.ligacoes >= META_LIGACOES &&
                  a.provas > 0;
                return (
                  <tr key={a.nome}>
                    <td className="py-2 pr-2 font-medium">{a.nome}</td>
                    <td className="py-2 text-center tabular-nums">
                      {formatDuracao(a.segundosTotal)} / {a.metaHoras}h
                    </td>
                    <td className="py-2 text-center tabular-nums">
                      {a.conversas}/{META_WHATSAPP}
                    </td>
                    <td className="py-2 text-center tabular-nums">
                      {a.ligacoes}/{META_LIGACOES}
                    </td>
                    <td className="py-2 text-center tabular-nums">{a.provas}</td>
                    <td className="py-2 text-center tabular-nums">{a.dias}</td>
                    <td className="py-2 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          emDia
                            ? "bg-[color:var(--success)]/15 text-[color:var(--success)]"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {emDia ? "Em dia" : "Pendente"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ranking.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem atendentes.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Mini({ label, valor, alerta }: { label: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl border bg-background/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`text-lg font-semibold tabular-nums ${alerta ? "text-destructive" : ""}`}
      >
        {valor}
      </p>
    </div>
  );
}
