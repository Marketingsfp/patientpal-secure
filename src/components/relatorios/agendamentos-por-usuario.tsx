// Relatório "Agendamentos por usuário" (produtividade da recepção).
//
// Quantas fichas cada usuário marcou, confirmou, cancelou e remarcou no
// período — pela data em que a AÇÃO foi feita. Usa o "De/Até" do topo da tela
// Relatórios. Cada usuário abre nos dias do período, e cada dia abre na lista
// das ações feitas nele.
//
// Os números vêm de `rel_agendamentos_por_usuario_dia` e a lista do dia de
// `rel_agendamentos_por_usuario_lista`, que leem a auditoria; as regras de
// contagem estão comentadas nas migrações 20261007150000 e 20261007180000.
//
// Mesma alçada de "Marcações por atendente": as funções conferem
// `pode_autorizar` + perfil de gestão; a aba só aparece para quem passa.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Download, Printer, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { exportarPastaXlsx } from "@/lib/exportar-xlsx";
import { imprimirRelatorio } from "@/lib/print-relatorio-financeiro";
import { dataBR } from "@/lib/relatorios/marcacoes-por-atendente";
import {
  chaveUsuario,
  COLUNAS_PRODUTIVIDADE,
  dataHoraBR,
  horaBR,
  montarRelatorioPorDia,
  ROTULO_ACAO,
  USUARIO_SISTEMA,
  type AcaoAgenda,
  type LinhaAgendamentosUsuarioDia,
} from "@/lib/relatorios/agendamentos-por-usuario";

const ehRecusaDeAlcada = (error: { code?: string; message: string }) =>
  error.code === "42501" || /permiss/i.test(error.message);

/** Chave da lista de um dia: usuário + dia. */
const chaveDia = (usuario: string, dia: string) => `${usuario}|${dia}`;

export function AgendamentosPorUsuario({ ini, fim }: { ini: string; fim: string }) {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;

  const [usuario, setUsuario] = useState("todos");
  const [cruas, setCruas] = useState<LinhaAgendamentosUsuarioDia[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [semPermissao, setSemPermissao] = useState(false);
  // Usuários abertos nos dias e dias abertos na lista (chave usuário|dia).
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [diasAbertos, setDiasAbertos] = useState<Set<string>>(new Set());
  // Listas já buscadas; `null` enquanto carrega.
  const [listas, setListas] = useState<Record<string, AcaoAgenda[] | null>>({});

  const buscar = useCallback(async () => {
    if (!clinicaId || !ini || !fim) return;
    setCarregando(true);
    setSemPermissao(false);
    setDiasAbertos(new Set());
    setListas({});
    try {
      const { data, error } = await supabase.rpc(
        "rel_agendamentos_por_usuario_dia" as never,
        { _clinica_id: clinicaId, _ini: ini, _fim: fim } as never,
      );
      if (error) {
        if (ehRecusaDeAlcada(error)) {
          setSemPermissao(true);
          setCruas([]);
          return;
        }
        throw error;
      }
      setCruas((data ?? []) as unknown as LinhaAgendamentosUsuarioDia[]);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, ini, fim]);

  // Busca sozinha na abertura e a cada troca de período.
  useEffect(() => {
    void buscar();
  }, [buscar]);

  // O seletor de usuário lista quem teve alguma ação no período; o filtro é
  // feito aqui, sem nova consulta ao banco.
  const opcoes = useMemo(
    () =>
      montarRelatorioPorDia(cruas ?? [])
        .linhas.map((l) => ({ valor: chaveUsuario(l), nome: l.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })),
    [cruas],
  );
  const usuarioEfetivo = opcoes.some((o) => o.valor === usuario) ? usuario : "todos";
  const relatorio = useMemo(
    () => montarRelatorioPorDia(cruas ?? [], usuarioEfetivo),
    [cruas, usuarioEfetivo],
  );

  // Com um usuário só na tela, os dias dele já vêm abertos.
  const usuarioAberto = (chave: string) => usuarioEfetivo !== "todos" || abertos.has(chave);

  function alternarUsuario(chave: string) {
    setAbertos((s) => {
      const novo = new Set(s);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  const todosAbertos =
    relatorio.linhas.length > 0 && relatorio.linhas.every((l) => usuarioAberto(chaveUsuario(l)));

  function alternarTodos() {
    setAbertos(todosAbertos ? new Set() : new Set(relatorio.linhas.map(chaveUsuario)));
  }

  async function alternarDia(usuarioChave: string, dia: string) {
    const chave = chaveDia(usuarioChave, dia);
    if (diasAbertos.has(chave)) {
      setDiasAbertos((s) => {
        const novo = new Set(s);
        novo.delete(chave);
        return novo;
      });
      return;
    }
    setDiasAbertos((s) => new Set(s).add(chave));
    if (listas[chave] !== undefined || !clinicaId) return;
    setListas((l) => ({ ...l, [chave]: null }));
    try {
      const { data, error } = await supabase.rpc(
        "rel_agendamentos_por_usuario_lista" as never,
        {
          _clinica_id: clinicaId,
          _dia: dia,
          _usuario_id: usuarioChave === USUARIO_SISTEMA ? null : usuarioChave,
        } as never,
      );
      if (error) throw error;
      setListas((l) => ({ ...l, [chave]: (data ?? []) as unknown as AcaoAgenda[] }));
    } catch (e) {
      mostrarErro(e);
      // Deixa tentar de novo ao clicar outra vez.
      setListas((l) => {
        const { [chave]: _, ...resto } = l;
        return resto;
      });
      setDiasAbertos((s) => {
        const novo = new Set(s);
        novo.delete(chave);
        return novo;
      });
    }
  }

  const periodo = `${dataBR(ini)} a ${dataBR(fim)}`;
  const usuarioRotulo =
    usuarioEfetivo === "todos"
      ? "Todos"
      : (opcoes.find((o) => o.valor === usuarioEfetivo)?.nome ?? "Todos");
  const contexto = [`Período da ação: ${periodo}`, `Usuário: ${usuarioRotulo}`];

  async function baixarExcel() {
    if (relatorio.linhas.length === 0) {
      toast.info("Sem ações na agenda no período selecionado.");
      return;
    }
    const titulo = `${clinicaAtual?.clinica.nome ?? ""} — Agendamentos por usuário`;
    const numericas = COLUNAS_PRODUTIVIDADE.map((c) => ({
      rotulo: c.rotulo,
      tipo: "numero" as const,
      largura: 14,
    }));
    try {
      await exportarPastaXlsx(`agendamentos-por-usuario-${ini}-a-${fim}`, [
        {
          arquivo: "",
          aba: "Por usuário",
          cabecalho: [titulo, ...contexto],
          colunas: [{ rotulo: "Usuário", tipo: "texto", largura: 42 }, ...numericas],
          linhas: relatorio.linhas.map((l) => [
            l.nome,
            ...COLUNAS_PRODUTIVIDADE.map((c) => l[c.chave]),
          ]),
          totais: ["TOTAL", ...COLUNAS_PRODUTIVIDADE.map((c) => relatorio.totais[c.chave])],
        },
        {
          arquivo: "",
          aba: "Por dia",
          cabecalho: [titulo, ...contexto],
          colunas: [
            { rotulo: "Usuário", tipo: "texto", largura: 42 },
            { rotulo: "Dia", tipo: "texto", largura: 12 },
            ...numericas,
          ],
          linhas: relatorio.linhas.flatMap((l) =>
            l.dias.map((d) => [
              l.nome,
              dataBR(d.dia),
              ...COLUNAS_PRODUTIVIDADE.map((c) => d[c.chave]),
            ]),
          ),
          totais: ["TOTAL", "", ...COLUNAS_PRODUTIVIDADE.map((c) => relatorio.totais[c.chave])],
        },
      ]);
      toast.success("Planilha gerada.");
    } catch (e) {
      mostrarErro(e);
    }
  }

  function imprimir() {
    if (relatorio.linhas.length === 0) {
      toast.info("Sem ações na agenda no período selecionado.");
      return;
    }
    imprimirRelatorio({
      clinicaNome: clinicaAtual?.clinica.nome ?? "",
      titulo: "Agendamentos por usuário",
      periodo,
      colunas: [
        { rotulo: "Usuário" },
        { rotulo: "Dia" },
        ...COLUNAS_PRODUTIVIDADE.map((c) => ({ rotulo: c.rotulo, numerica: true })),
      ],
      // Os dias de cada usuário e, logo abaixo, o total dele no período.
      linhas: relatorio.linhas.flatMap((l) => [
        ...l.dias.map((d) => [
          l.nome,
          dataBR(d.dia),
          ...COLUNAS_PRODUTIVIDADE.map((c) => String(d[c.chave])),
        ]),
        [l.nome, "Total do período", ...COLUNAS_PRODUTIVIDADE.map((c) => String(l[c.chave]))],
      ]),
      totais: ["TOTAL", "", ...COLUNAS_PRODUTIVIDADE.map((c) => String(relatorio.totais[c.chave]))],
      resumo: contexto.map((t) => {
        const i = t.indexOf(":");
        return { rotulo: t.slice(0, i), valor: t.slice(i + 1).trim() };
      }),
      assinaturas: [{ cargo: "Supervisão" }],
    });
  }

  const colSpan = COLUNAS_PRODUTIVIDADE.length + 1;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Label className="text-xs text-muted-foreground">Usuário / atendente</Label>
            <Select value={usuarioEfetivo} onValueChange={setUsuario}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {opcoes.map((o) => (
                  <SelectItem key={o.valor} value={o.valor}>
                    {o.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 lg:col-span-2">
            <Button
              variant="outline"
              className="h-9 flex-1 gap-2"
              onClick={() => void baixarExcel()}
            >
              <Download className="h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" className="h-9 flex-1 gap-2" onClick={imprimir}>
              <Printer className="h-4 w-4" /> PDF / Imprimir
            </Button>
          </div>
        </div>
      </div>

      {semPermissao ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Este relatório mostra o desempenho individual da equipe, então só aparece para quem está
          marcado como supervisor na tela <strong>Equipe</strong> (opção &quot;pode
          autorizar&quot;). Peça a um administrador para marcar o seu nome.
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              Agendamentos por usuário
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-xs text-muted-foreground">{contexto.join(" · ")}</div>
              {usuarioEfetivo === "todos" && relatorio.linhas.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={alternarTodos}>
                  {todosAbertos ? "Fechar todos" : "Abrir dia a dia de todos"}
                </Button>
              )}
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário / dia</TableHead>
                {COLUNAS_PRODUTIVIDADE.map((c) => (
                  <TableHead key={c.chave} className="w-28 text-right">
                    {c.rotulo}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {carregando && cruas === null ? (
                <TableRow>
                  <TableCell
                    colSpan={colSpan}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    Somando as ações da agenda…
                  </TableCell>
                </TableRow>
              ) : relatorio.linhas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={colSpan}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    Nenhuma ação na agenda no período selecionado.
                  </TableCell>
                </TableRow>
              ) : (
                relatorio.linhas.map((l) => {
                  const chave = chaveUsuario(l);
                  const aberto = usuarioAberto(chave);
                  return (
                    <Fragment key={chave}>
                      <TableRow
                        className={usuarioEfetivo === "todos" ? "cursor-pointer" : undefined}
                        onClick={() => usuarioEfetivo === "todos" && alternarUsuario(chave)}
                      >
                        <TableCell
                          className={l.ehSistema ? "italic text-muted-foreground" : "font-medium"}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {aberto ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            {l.nome}
                          </span>
                        </TableCell>
                        {COLUNAS_PRODUTIVIDADE.map((c) => (
                          <TableCell
                            key={c.chave}
                            className={`text-right tabular-nums${c.chave === "total" ? " font-semibold" : ""}`}
                          >
                            {l[c.chave]}
                          </TableCell>
                        ))}
                      </TableRow>
                      {aberto &&
                        l.dias.map((d) => {
                          const kDia = chaveDia(chave, d.dia);
                          const diaAberto = diasAbertos.has(kDia);
                          return (
                            <Fragment key={kDia}>
                              <TableRow
                                className="cursor-pointer bg-muted/30 text-sm"
                                onClick={() => void alternarDia(chave, d.dia)}
                                title="Ver as ações feitas neste dia"
                              >
                                <TableCell className="pl-10">
                                  <span className="inline-flex items-center gap-1.5">
                                    {diaAberto ? (
                                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    )}
                                    {dataBR(d.dia)}
                                  </span>
                                </TableCell>
                                {COLUNAS_PRODUTIVIDADE.map((c) => (
                                  <TableCell key={c.chave} className="text-right tabular-nums">
                                    {d[c.chave]}
                                  </TableCell>
                                ))}
                              </TableRow>
                              {diaAberto && (
                                <TableRow className="hover:bg-transparent">
                                  <TableCell colSpan={colSpan} className="bg-muted/10 py-2 pl-16">
                                    <ListaDoDia acoes={listas[kDia]} />
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          );
                        })}
                    </Fragment>
                  );
                })
              )}
              {relatorio.linhas.length > 0 && (
                <TableRow className="font-bold">
                  <TableCell>TOTAL</TableCell>
                  {COLUNAS_PRODUTIVIDADE.map((c) => (
                    <TableCell key={c.chave} className="text-right tabular-nums">
                      {relatorio.totais[c.chave]}
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="border-t px-4 py-2 text-[11px] leading-snug text-muted-foreground">
            Conta as ações feitas no período, pela data em que foram feitas (não pela data do
            atendimento). Clique no nome para ver dia a dia e no dia para ver a lista.{" "}
            <strong>Marcados</strong>: paciente colocado numa vaga ou encaixe.{" "}
            <strong>Confirmados</strong>: ficha passada para confirmado. <strong>Cancelados</strong>
            : paciente retirado da vaga, ficha excluída ou cancelada. <strong>Remarcados</strong>:
            paciente movido para outro horário (não conta como cancelado nem como marcado).
            &quot;Sistema&quot; reúne o que foi feito sem usuário logado (WhatsApp, totem,
            integrações). O registro de autoria começou em 09/07/2026.
          </div>
        </div>
      )}
    </div>
  );
}

/** Ações de um usuário num dia: hora da ação, tipo, paciente e o que foi marcado. */
function ListaDoDia({ acoes }: { acoes: AcaoAgenda[] | null | undefined }) {
  if (!acoes) {
    return <div className="py-2 text-xs text-muted-foreground">Carregando a lista…</div>;
  }
  if (acoes.length === 0) {
    return <div className="py-2 text-xs text-muted-foreground">Nenhuma ação neste dia.</div>;
  }
  return (
    <table className="w-full text-xs">
      <thead className="text-muted-foreground">
        <tr className="text-left">
          <th className="w-14 py-1 pr-3 font-medium">Hora</th>
          <th className="w-24 py-1 pr-3 font-medium">Ação</th>
          <th className="py-1 pr-3 font-medium">Paciente</th>
          <th className="w-32 py-1 pr-3 font-medium">Atendimento em</th>
          <th className="py-1 pr-3 font-medium">Profissional</th>
          <th className="py-1 font-medium">Procedimento</th>
        </tr>
      </thead>
      <tbody>
        {acoes.map((a, i) => (
          <tr key={`${a.agendamento_id ?? ""}-${a.feito_em}-${a.tipo}-${i}`} className="border-t">
            <td className="py-1 pr-3 tabular-nums">{horaBR(a.feito_em)}</td>
            <td className="py-1 pr-3">{ROTULO_ACAO[a.tipo] ?? a.tipo}</td>
            <td className="py-1 pr-3">{a.paciente_nome}</td>
            <td className="py-1 pr-3 tabular-nums">{dataHoraBR(a.inicio)}</td>
            <td className="py-1 pr-3">{a.medico_nome}</td>
            <td className="py-1">{a.procedimento}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
