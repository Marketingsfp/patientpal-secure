// Relatório "Agendamentos por usuário" (produtividade da recepção).
//
// Quantas fichas cada usuário marcou, confirmou, cancelou e remarcou no
// período — pela data em que a AÇÃO foi feita. Usa o "De/Até" do topo da tela
// Relatórios. O número vem da função `rel_agendamentos_por_usuario`, que lê a
// auditoria; as regras de contagem estão comentadas na migração
// 20261007150000_rel_agendamentos_por_usuario.sql.
//
// Mesma alçada de "Marcações por atendente": a função confere
// `pode_autorizar` + perfil de gestão; a aba só aparece para quem passa.

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Download, Printer, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { exportarRelatorioXlsx } from "@/lib/exportar-xlsx";
import { imprimirRelatorio } from "@/lib/print-relatorio-financeiro";
import { dataBR } from "@/lib/relatorios/marcacoes-por-atendente";
import {
  chaveUsuario,
  COLUNAS_PRODUTIVIDADE,
  montarRelatorioProdutividade,
  type LinhaAgendamentosUsuario,
} from "@/lib/relatorios/agendamentos-por-usuario";

export function AgendamentosPorUsuario({ ini, fim }: { ini: string; fim: string }) {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;

  const [usuario, setUsuario] = useState("todos");
  const [cruas, setCruas] = useState<LinhaAgendamentosUsuario[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [semPermissao, setSemPermissao] = useState(false);

  const buscar = useCallback(async () => {
    if (!clinicaId || !ini || !fim) return;
    setCarregando(true);
    setSemPermissao(false);
    try {
      const { data, error } = await supabase.rpc(
        "rel_agendamentos_por_usuario" as never,
        { _clinica_id: clinicaId, _ini: ini, _fim: fim } as never,
      );
      if (error) {
        // 42501 é a recusa de alçada levantada pela própria função.
        if (error.code === "42501" || /permiss/i.test(error.message)) {
          setSemPermissao(true);
          setCruas([]);
          return;
        }
        throw error;
      }
      setCruas((data ?? []) as unknown as LinhaAgendamentosUsuario[]);
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
      montarRelatorioProdutividade(cruas ?? [])
        .linhas.map((l) => ({ valor: chaveUsuario(l), nome: l.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })),
    [cruas],
  );
  const usuarioEfetivo = opcoes.some((o) => o.valor === usuario) ? usuario : "todos";
  const relatorio = useMemo(
    () => montarRelatorioProdutividade(cruas ?? [], usuarioEfetivo),
    [cruas, usuarioEfetivo],
  );

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
    try {
      await exportarRelatorioXlsx({
        arquivo: `agendamentos-por-usuario-${ini}-a-${fim}`,
        aba: "Agendamentos por usuário",
        cabecalho: [`${clinicaAtual?.clinica.nome ?? ""} — Agendamentos por usuário`, ...contexto],
        colunas: [
          { rotulo: "Usuário", tipo: "texto", largura: 42 },
          ...COLUNAS_PRODUTIVIDADE.map((c) => ({
            rotulo: c.rotulo,
            tipo: "numero" as const,
            largura: 14,
          })),
        ],
        linhas: relatorio.linhas.map((l) => [
          l.nome,
          ...COLUNAS_PRODUTIVIDADE.map((c) => l[c.chave]),
        ]),
        totais: ["TOTAL", ...COLUNAS_PRODUTIVIDADE.map((c) => relatorio.totais[c.chave])],
      });
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
        ...COLUNAS_PRODUTIVIDADE.map((c) => ({ rotulo: c.rotulo, numerica: true })),
      ],
      linhas: relatorio.linhas.map((l) => [
        l.nome,
        ...COLUNAS_PRODUTIVIDADE.map((c) => String(l[c.chave])),
      ]),
      totais: ["TOTAL", ...COLUNAS_PRODUTIVIDADE.map((c) => String(relatorio.totais[c.chave]))],
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
            <div className="text-xs text-muted-foreground">{contexto.join(" · ")}</div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
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
                relatorio.linhas.map((l) => (
                  <TableRow key={chaveUsuario(l)}>
                    <TableCell
                      className={l.ehSistema ? "italic text-muted-foreground" : "font-medium"}
                    >
                      {l.nome}
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
                ))
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
            atendimento). <strong>Marcados</strong>: paciente colocado numa vaga ou encaixe.{" "}
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
