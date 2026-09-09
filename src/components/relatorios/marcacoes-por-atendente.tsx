// Relatório sintético "Marcações por atendente".
//
// Substitui o Relatório Sintético de Agendas do sistema antigo (Clínica
// Total), que a supervisão usava agrupado por "USUÁRIO MARCAÇÃO". Uma linha
// por colaboradora, com a quantidade de agendamentos que ela marcou e a fatia
// do total.
//
// De onde vem o número: da função `rel_marcacoes_por_atendente` no banco. O
// autor sai da AUDITORIA, e não de `agendamentos.criado_por` — essa coluna
// está vazia nos 94 mil agendamentos da produção e nunca foi preenchida. O
// arquivo APLICAR-RELATORIO-MARCACOES-POR-ATENDENTE-2026-09-09.sql explica a
// regra inteira.
//
// A própria função confere a alçada (marcação individual `pode_autorizar` +
// perfil de gestão). A tela esconde a aba pelo mesmo critério, mas quem
// manda é o servidor: esconder botão não é permissão.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { DateInputBR } from "@/components/ui/date-input-br";
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
import { Download, Printer, Users } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { exportarRelatorioXlsx } from "@/lib/exportar-xlsx";
import { imprimirRelatorio } from "@/lib/print-relatorio-financeiro";
import {
  descreverFiltros,
  formatarPercentual,
  montarRelatorio,
  rotuloSituacao,
  SITUACOES,
  type LinhaMarcacoes,
} from "@/lib/relatorios/marcacoes-por-atendente";

type Opcao = { id: string; nome: string };

/** Primeiro dia do mês corrente, em AAAA-MM-DD local. */
function inicioDoMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type MarcacoesPorAtendenteProps = {
  /**
   * Período de atendimento com que a tela abre. Em Relatórios fica vazio e
   * vale o mês corrente; aberto de dentro da Agenda, chega o dia que a
   * supervisão já está olhando, para o relatório responder "quem marcou o que
   * está na minha frente" sem ninguém redigitar data.
   */
  atendIniInicial?: string;
  atendFimInicial?: string;
  /** `medico_id` do filtro da Agenda, ou "todos". */
  medicoIdInicial?: string;
};

export function MarcacoesPorAtendente({
  atendIniInicial,
  atendFimInicial,
  medicoIdInicial,
}: MarcacoesPorAtendenteProps = {}) {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;

  // Período de ATENDIMENTO já vem preenchido com o mês corrente (ou com o dia
  // que a Agenda estava mostrando): é a pergunta que a supervisão faz toda
  // semana. O período de MARCAÇÃO nasce vazio, senão a tela esconderia, sem
  // avisar, tudo que foi marcado em outro mês.
  const [atendIni, setAtendIni] = useState(() => atendIniInicial || inicioDoMes());
  const [atendFim, setAtendFim] = useState(() => atendFimInicial || hojeISO());
  const [marcIni, setMarcIni] = useState("");
  const [marcFim, setMarcFim] = useState("");
  const [situacao, setSituacao] = useState("todos");
  const [medicoId, setMedicoId] = useState(medicoIdInicial || "todos");
  const [especialidadeId, setEspecialidadeId] = useState("todos");

  const [medicos, setMedicos] = useState<Opcao[]>([]);
  const [especialidades, setEspecialidades] = useState<Opcao[]>([]);
  const [linhas, setLinhas] = useState<LinhaMarcacoes[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [semPermissao, setSemPermissao] = useState(false);

  useEffect(() => {
    if (!clinicaId) return;
    let cancelado = false;
    void (async () => {
      const [med, esp] = await Promise.all([
        supabase
          .from("medicos")
          .select("id, nome")
          .eq("clinica_id", clinicaId)
          .eq("ativo", true)
          .order("nome"),
        supabase.from("especialidades").select("id, nome").eq("ativo", true).order("nome"),
      ]);
      if (cancelado) return;
      setMedicos(((med.data ?? []) as Opcao[]).filter((m) => m.nome));
      setEspecialidades(((esp.data ?? []) as Opcao[]).filter((e) => e.nome));
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaId]);

  const buscar = useCallback(async () => {
    if (!clinicaId) {
      toast.error("Selecione uma clínica");
      return;
    }
    setCarregando(true);
    setSemPermissao(false);
    try {
      const { data, error } = await supabase.rpc(
        "rel_marcacoes_por_atendente" as never,
        {
          _clinica_id: clinicaId,
          _atend_ini: atendIni || null,
          _atend_fim: atendFim || null,
          _marc_ini: marcIni || null,
          _marc_fim: marcFim || null,
          _status: situacao === "todos" ? null : situacao,
          _medico_id: medicoId === "todos" ? null : medicoId,
          _especialidade_id: especialidadeId === "todos" ? null : especialidadeId,
        } as never,
      );
      if (error) {
        // 42501 é a recusa de alçada levantada pela própria função.
        if (error.code === "42501" || /permiss/i.test(error.message)) {
          setSemPermissao(true);
          setLinhas([]);
          return;
        }
        throw error;
      }
      setLinhas((data ?? []) as unknown as LinhaMarcacoes[]);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, atendIni, atendFim, marcIni, marcFim, situacao, medicoId, especialidadeId]);

  // Busca sozinha na abertura e a cada mudança de filtro. O relatório é uma
  // consulta agregada e pequena; obrigar a supervisão a clicar em "Aplicar"
  // depois de trocar o médico só adiciona um passo.
  useEffect(() => {
    void buscar();
  }, [buscar]);

  const relatorio = useMemo(() => montarRelatorio(linhas ?? []), [linhas]);

  const medicoNome =
    medicoId === "todos" ? null : (medicos.find((m) => m.id === medicoId)?.nome ?? null);
  const especialidadeNome =
    especialidadeId === "todos"
      ? null
      : (especialidades.find((e) => e.id === especialidadeId)?.nome ?? null);

  const contexto = useMemo(
    () =>
      descreverFiltros({
        atendIni,
        atendFim,
        marcIni,
        marcFim,
        situacaoRotulo: rotuloSituacao(situacao),
        medicoNome,
        especialidadeNome,
      }),
    [atendIni, atendFim, marcIni, marcFim, situacao, medicoNome, especialidadeNome],
  );

  const periodoRotulo = `${atendIni ? atendIni.split("-").reverse().join("/") : "início"} a ${
    atendFim ? atendFim.split("-").reverse().join("/") : "hoje"
  }`;

  async function baixarExcel() {
    if (relatorio.total === 0) {
      toast.info("Sem marcações no período selecionado.");
      return;
    }
    try {
      await exportarRelatorioXlsx({
        arquivo: `marcacoes-por-atendente-${atendIni || "inicio"}-a-${atendFim || "hoje"}`,
        aba: "Marcações",
        cabecalho: [`${clinicaAtual?.clinica.nome ?? ""} — Marcações por atendente`, ...contexto],
        colunas: [
          { rotulo: "Colaboradora (usuário da marcação)", tipo: "texto", largura: 42 },
          { rotulo: "Qtd", tipo: "numero", largura: 10 },
          { rotulo: "% do total", tipo: "numero", largura: 12 },
        ],
        linhas: relatorio.linhas.map((l) => [l.nome, l.qtd, Number(l.percentual.toFixed(1))]),
        totais: ["TOTAL", relatorio.total, 100],
      });
      toast.success("Planilha gerada.");
    } catch (e) {
      mostrarErro(e);
    }
  }

  function imprimir() {
    if (relatorio.total === 0) {
      toast.info("Sem marcações no período selecionado.");
      return;
    }
    imprimirRelatorio({
      clinicaNome: clinicaAtual?.clinica.nome ?? "",
      titulo: "Marcações por atendente",
      periodo: periodoRotulo,
      colunas: [
        { rotulo: "Colaboradora (usuário da marcação)" },
        { rotulo: "Qtd", numerica: true },
        { rotulo: "% do total", numerica: true },
      ],
      linhas: relatorio.linhas.map((l) => [
        l.nome,
        String(l.qtd),
        formatarPercentual(l.percentual),
      ]),
      totais: ["TOTAL", String(relatorio.total), "100,0%"],
      resumo: contexto.map((t) => {
        const i = t.indexOf(":");
        return { rotulo: t.slice(0, i), valor: t.slice(i + 1).trim() };
      }),
      assinaturas: [{ cargo: "Supervisão" }],
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs text-muted-foreground">Atendimento — de</Label>
            <DateInputBR
              value={atendIni}
              onChange={(e) => setAtendIni(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Atendimento — até</Label>
            <DateInputBR
              value={atendFim}
              onChange={(e) => setAtendFim(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Marcação — de (opcional)</Label>
            <DateInputBR
              value={marcIni}
              onChange={(e) => setMarcIni(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Marcação — até (opcional)</Label>
            <DateInputBR
              value={marcFim}
              onChange={(e) => setMarcFim(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Situação</Label>
            <Select value={situacao} onValueChange={setSituacao}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SITUACOES.map((s) => (
                  <SelectItem key={s.valor} value={s.valor}>
                    {s.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Profissional</Label>
            <Select value={medicoId} onValueChange={setMedicoId}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {medicos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Especialidade</Label>
            <Select value={especialidadeId} onValueChange={setEspecialidadeId}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {especialidades.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              className="h-9 flex-1 gap-2"
              onClick={() => void baixarExcel()}
            >
              <Download className="h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" className="h-9 flex-1 gap-2" onClick={imprimir}>
              <Printer className="h-4 w-4" /> Imprimir
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
              <Users className="h-4 w-4 text-muted-foreground" />
              Marcações por atendente
            </div>
            <div className="text-xs text-muted-foreground">{contexto.join(" · ")}</div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaboradora (usuário da marcação)</TableHead>
                <TableHead className="w-28 text-right">Qtd</TableHead>
                <TableHead className="w-32 text-right">% do total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carregando && linhas === null ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                    Somando as marcações…
                  </TableCell>
                </TableRow>
              ) : relatorio.linhas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                    Nenhuma marcação no período selecionado.
                  </TableCell>
                </TableRow>
              ) : (
                relatorio.linhas.map((l) => (
                  <TableRow key={`${l.usuarioId ?? "sem"}-${l.nome}`}>
                    <TableCell
                      className={l.ehLinhaTecnica ? "italic text-muted-foreground" : "font-medium"}
                    >
                      {l.nome}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.qtd}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarPercentual(l.percentual)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t px-4 py-2.5 text-sm font-bold">
            <span>TOTAL</span>
            <span className="tabular-nums">{relatorio.total}</span>
          </div>

          <div className="border-t px-4 py-2 text-[11px] leading-snug text-muted-foreground">
            Conta um registro por agendamento, creditado a quem fez a marcação mais recente — o
            mesmo critério da coluna &quot;usuário marcação&quot; do sistema antigo. O total bate
            com a quantidade de agendamentos do período. O registro de autoria começou em
            09/07/2026: fichas marcadas antes disso aparecem como &quot;marcado antes do
            registro&quot;.
          </div>
        </div>
      )}
    </div>
  );
}
