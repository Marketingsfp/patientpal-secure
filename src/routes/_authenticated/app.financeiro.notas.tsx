/**
 * Financeiro › Notas dos pacientes — conferência das NFS-e emitidas.
 *
 * Esta tela lia `fin_notas_pacientes`, um cadastro MANUAL de notas que nunca
 * foi usado: em produção a tabela está com zero registros, enquanto as notas
 * de verdade — as que saem do caixa, das mensalidades e da tela de NFS-e —
 * são gravadas em `nfse`. Por isso a tela mostrava "Nenhuma nota emitida"
 * mesmo com mais de mil notas emitidas no banco. Agora ela lê `nfse`.
 *
 * É uma tela de CONFERÊNCIA, não de operação: emitir, reenviar e cancelar
 * continuam em Notas Fiscais (/app/nfse), que é a tela da recepção. Aqui o
 * financeiro filtra o período, soma e leva para o Excel ou para o papel.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileText, Download, Printer, Search, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { exportarRelatorioXlsx, type ColunaXlsx } from "@/lib/exportar-xlsx";
import { exportToExcel } from "@/lib/export-csv";
import { imprimirRelatorio } from "@/lib/print-relatorio-financeiro";

export const Route = createFileRoute("/_authenticated/app/financeiro/notas")({
  component: Page,
  head: () => ({ meta: [{ title: "Notas Pacientes — Financeiro" }] }),
});

interface Emitente {
  id: string;
  nome: string;
  cnpj: string;
}

interface Nota {
  id: string;
  numero: string | null;
  rps_numero: number | null;
  rps_serie: string | null;
  data_emissao: string;
  created_at: string;
  valor_servicos: number;
  status: string;
  url_pdf: string | null;
  descricao_servicos: string | null;
  paciente_id: string | null;
  tomador_nome: string | null;
  tomador_documento: string | null;
  emitente_id: string | null;
  emitida_por: string | null;
}

/** Linha já enriquecida com os nomes que vêm de outras tabelas. */
interface Linha extends Nota {
  emitente_nome: string;
  emitente_cnpj: string;
  funcionario_nome: string;
  paciente_nome: string;
  paciente_cpf: string;
}

const fmtMoeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "YYYY-MM-DD" no fuso local (não usar toISOString: recua um dia à noite). */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Primeiro dia do mês corrente até hoje. */
function periodoEsteMes(): { inicio: string; fim: string } {
  const h = new Date();
  return { inicio: iso(new Date(h.getFullYear(), h.getMonth(), 1)), fim: iso(h) };
}

/** Mês anterior inteiro, do dia 1 ao último dia. */
function periodoMesPassado(): { inicio: string; fim: string } {
  const h = new Date();
  return {
    inicio: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)),
    fim: iso(new Date(h.getFullYear(), h.getMonth(), 0)),
  };
}

/** Data em dd/mm/aaaa sem o recuo de 1 dia do fuso. */
function dataBr(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR")
    : new Date(v).toLocaleDateString("pt-BR");
}

/** Hora da emissão (HH:MM) a partir do `created_at`. */
function horaBr(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** CPF/CNPJ com máscara; devolve o original quando não tem 11 nem 14 dígitos. */
function documentoBr(v: string | null): string {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v ?? "";
}

const ROTULO_STATUS: Record<string, string> = {
  emitida: "Emitida",
  cancelada: "Cancelada",
  processando: "Em processamento",
  erro: "Erro",
};
const rotuloStatus = (s: string) => ROTULO_STATUS[s] ?? s;

/** Nº da nota; enquanto a prefeitura não devolve o número, mostra o RPS. */
function numeroDaNota(n: Nota): string {
  if (n.numero) return n.numero;
  if (n.rps_numero) return `RPS ${n.rps_numero}${n.rps_serie ? `/${n.rps_serie}` : ""}`;
  return "—";
}

/** Busca em lotes: `.in()` com milhares de ids estoura o tamanho da URL. */
async function emLotes<T>(ids: string[], fn: (lote: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    out.push(...(await fn(ids.slice(i, i + 200))));
  }
  return out;
}

function Page() {
  const { clinicaAtual } = useClinica();

  // Quem emitiu cada nota é informação de gestão. A tela de NFS-e já restringe
  // essa coluna a Admin/Gestor/Supervisor; aqui o perfil Financeiro também
  // entra, porque é ele que responde pela conferência do mês. Caixa e Recepção,
  // que abrem o Financeiro só em leitura, continuam sem ver o emissor — a
  // coluna some da tela, da planilha e do papel.
  const podeVerFuncionario = ["admin", "gestor", "supervisor", "financeiro"].includes(
    (clinicaAtual?.role ?? "").toLowerCase(),
  );

  const [periodo, setPeriodo] = useState(periodoEsteMes);
  const [filtroEmitente, setFiltroEmitente] = useState("todos");
  const [filtroFuncionario, setFiltroFuncionario] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [emitentes, setEmitentes] = useState<Emitente[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);

  /** Marca qual atalho de período está aceso. "personalizado" quando nenhum. */
  const atalhoAtivo = useMemo(() => {
    const mes = periodoEsteMes();
    if (periodo.inicio === mes.inicio && periodo.fim === mes.fim) return "mes";
    const passado = periodoMesPassado();
    if (periodo.inicio === passado.inicio && periodo.fim === passado.fim) return "passado";
    return "personalizado";
  }, [periodo]);

  useEffect(() => {
    if (!clinicaAtual) return;
    void (async () => {
      const { data } = await supabase
        .from("nfse_emitentes_publico")
        .select("id, nome, cnpj")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .order("nome");
      setEmitentes((data ?? []) as Emitente[]);
    })();
  }, [clinicaAtual?.clinica_id]);

  useEffect(() => {
    if (!clinicaAtual) {
      setLinhas([]);
      setLoading(false);
      return;
    }
    let cancelado = false;
    void (async () => {
      setLoading(true);
      // O período entra na consulta, não na filtragem em memória: senão um mês
      // antigo simplesmente não apareceria e a planilha sairia pela metade.
      const { data, error } = await supabase
        .from("nfse")
        .select(
          "id, numero, rps_numero, rps_serie, data_emissao, created_at, valor_servicos, status, url_pdf, descricao_servicos, paciente_id, tomador_nome, tomador_documento, emitente_id, emitida_por",
        )
        .eq("clinica_id", clinicaAtual.clinica_id)
        .gte("data_emissao", periodo.inicio)
        .lte("data_emissao", periodo.fim)
        // `data_emissao` é uma DATA sem hora: todas as notas do mesmo dia
        // empatam e o banco devolve os empates em ordem arbitrária, que muda a
        // cada consulta. Ordenar pelo momento real da emissão (e pelo id no
        // desempate) mantém a lista parada na frente de quem confere.
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(5000);
      if (cancelado) return;
      if (error) {
        setLoading(false);
        mostrarErro(error);
        return;
      }
      const notas = (data ?? []) as unknown as Nota[];

      // `nfse` guarda só o UUID em `emitida_por` e não tem FK declarada para
      // `profiles`, então o embed do PostgREST não funciona — os nomes vêm em
      // consultas separadas, mesmo padrão do Caixa e da tela de NFS-e.
      const idsUsuarios = podeVerFuncionario
        ? Array.from(new Set(notas.map((n) => n.emitida_por).filter((v): v is string => !!v)))
        : [];
      const nomesUsuarios = new Map<string, string>();
      if (idsUsuarios.length) {
        const perfis = await emLotes(idsUsuarios, async (lote) => {
          const { data: p } = await supabase.from("profiles").select("id, nome").in("id", lote);
          return (p ?? []) as { id: string; nome: string | null }[];
        });
        for (const p of perfis) nomesUsuarios.set(p.id, p.nome ?? "");
      }

      const idsPacientes = Array.from(
        new Set(notas.map((n) => n.paciente_id).filter((v): v is string => !!v)),
      );
      const pacientes = new Map<string, { nome: string; cpf: string }>();
      if (idsPacientes.length) {
        const achados = await emLotes(idsPacientes, async (lote) => {
          const { data: p } = await supabase
            .from("pacientes")
            .select("id, nome, cpf")
            .in("id", lote);
          return (p ?? []) as { id: string; nome: string | null; cpf: string | null }[];
        });
        for (const p of achados) pacientes.set(p.id, { nome: p.nome ?? "", cpf: p.cpf ?? "" });
      }

      const mapaEmitentes = new Map(emitentes.map((e) => [e.id, e]));
      if (cancelado) return;
      setLinhas(
        notas.map((n) => {
          const emit = n.emitente_id ? mapaEmitentes.get(n.emitente_id) : undefined;
          const pac = n.paciente_id ? pacientes.get(n.paciente_id) : undefined;
          return {
            ...n,
            emitente_nome: emit?.nome?.trim() ?? "—",
            emitente_cnpj: emit?.cnpj ?? "",
            funcionario_nome: n.emitida_por
              ? nomesUsuarios.get(n.emitida_por) || "(usuário removido)"
              : "—",
            // Sem paciente vinculado (nota avulsa), o tomador é o melhor nome
            // que existe — é quem está impresso na nota.
            paciente_nome: pac?.nome || n.tomador_nome || "—",
            paciente_cpf: pac?.cpf || n.tomador_documento || "",
          };
        }),
      );
      setLoading(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaAtual?.clinica_id, periodo.inicio, periodo.fim, emitentes, podeVerFuncionario]);

  /** Funcionários que aparecem no período — a lista do filtro sai dos dados. */
  const funcionarios = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linhas) if (l.emitida_por) m.set(l.emitida_por, l.funcionario_nome);
    return Array.from(m, ([id, nome]) => ({ id, nome })).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }, [linhas]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = termo.replace(/\D/g, "");
    return linhas.filter((l) => {
      if (filtroEmitente !== "todos" && l.emitente_id !== filtroEmitente) return false;
      if (filtroFuncionario !== "todos" && l.emitida_por !== filtroFuncionario) return false;
      if (filtroStatus !== "todos" && l.status !== filtroStatus) return false;
      if (!termo) return true;
      const alvo = [
        l.numero ?? "",
        String(l.rps_numero ?? ""),
        l.paciente_nome,
        l.tomador_nome ?? "",
        l.descricao_servicos ?? "",
        l.emitente_nome,
      ]
        .join(" ")
        .toLowerCase();
      if (alvo.includes(termo)) return true;
      const docs = `${l.paciente_cpf}${l.tomador_documento ?? ""}`.replace(/\D/g, "");
      return termoDigitos.length >= 3 && docs.includes(termoDigitos);
    });
  }, [linhas, filtroEmitente, filtroFuncionario, filtroStatus, busca]);

  /**
   * Os cards separam o que é nota válida do que é nota cancelada ou com erro.
   * Somar tudo num "valor total" só inflaria o número: nota cancelada não
   * faturou, e nota com erro nem chegou a existir na prefeitura.
   */
  const resumo = useMemo(() => {
    let qtdEmitidas = 0;
    let valorEmitidas = 0;
    let qtdCanceladas = 0;
    let valorCanceladas = 0;
    let qtdProblema = 0;
    for (const l of filtradas) {
      const v = Number(l.valor_servicos) || 0;
      if (l.status === "emitida") {
        qtdEmitidas += 1;
        valorEmitidas += v;
      } else if (l.status === "cancelada") {
        qtdCanceladas += 1;
        valorCanceladas += v;
      } else {
        qtdProblema += 1;
      }
    }
    return {
      total: filtradas.length,
      qtdEmitidas,
      valorEmitidas,
      qtdCanceladas,
      valorCanceladas,
      qtdProblema,
    };
  }, [filtradas]);

  /** Quebra por empresa emissora, para o rodapé da planilha e do papel. */
  const porEmpresa = useMemo(() => {
    const m = new Map<string, { nome: string; qtd: number; valor: number }>();
    for (const l of filtradas) {
      if (l.status !== "emitida") continue;
      const cur = m.get(l.emitente_nome) ?? { nome: l.emitente_nome, qtd: 0, valor: 0 };
      cur.qtd += 1;
      cur.valor += Number(l.valor_servicos) || 0;
      m.set(l.emitente_nome, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.valor - a.valor);
  }, [filtradas]);

  const nomeEmpresaFiltro =
    filtroEmitente === "todos"
      ? "Todas"
      : (emitentes.find((e) => e.id === filtroEmitente)?.nome?.trim() ?? filtroEmitente);
  const nomeFuncionarioFiltro =
    filtroFuncionario === "todos"
      ? "Todos"
      : (funcionarios.find((f) => f.id === filtroFuncionario)?.nome ?? filtroFuncionario);
  const periodoTexto = `${dataBr(periodo.inicio)} a ${dataBr(periodo.fim)}`;
  const linhaDeFiltros = `Empresa: ${nomeEmpresaFiltro} · Funcionário: ${nomeFuncionarioFiltro} · Status: ${
    filtroStatus === "todos" ? "Todos" : rotuloStatus(filtroStatus)
  }${busca.trim() ? ` · Busca: "${busca.trim()}"` : ""}`;

  /** Colunas do papel e da planilha, na mesma ordem da tela. */
  const cabecalhosExport = [
    "Data",
    "Hora",
    "Nº da nota / RPS",
    "Paciente",
    "CPF/CNPJ",
    "Empresa emissora",
    ...(podeVerFuncionario ? ["Funcionário"] : []),
    "Serviço / Descrição",
    "Valor (R$)",
    "Status",
  ];
  const celulasDaLinha = (l: Linha) => [
    dataBr(l.data_emissao),
    horaBr(l.created_at),
    numeroDaNota(l),
    l.paciente_nome,
    documentoBr(l.paciente_cpf),
    l.emitente_nome,
    ...(podeVerFuncionario ? [l.funcionario_nome] : []),
    (l.descricao_servicos ?? "").replace(/\s+/g, " ").trim(),
  ];

  const semDados = () => {
    toast.error("Nenhuma nota no período e nos filtros selecionados.");
  };

  const onExportarExcel = async () => {
    if (!filtradas.length) return semDados();
    setExportando(true);
    try {
      const colunas: ColunaXlsx[] = [
        { rotulo: "Data", tipo: "texto", largura: 11 },
        { rotulo: "Hora", tipo: "texto", largura: 7 },
        { rotulo: "Nº da nota / RPS", tipo: "texto", largura: 16 },
        { rotulo: "Paciente", tipo: "texto", largura: 34 },
        { rotulo: "CPF/CNPJ", tipo: "texto", largura: 18 },
        { rotulo: "Empresa emissora", tipo: "texto", largura: 30 },
        ...(podeVerFuncionario
          ? [{ rotulo: "Funcionário", tipo: "texto", largura: 30 } as ColunaXlsx]
          : []),
        { rotulo: "Serviço / Descrição", tipo: "texto", largura: 48 },
        { rotulo: "Valor", tipo: "moeda", largura: 14 },
        { rotulo: "Status", tipo: "texto", largura: 16 },
      ];
      await exportarRelatorioXlsx({
        arquivo: `notas-pacientes-${periodo.inicio}-a-${periodo.fim}.xlsx`,
        aba: "Notas",
        cabecalho: [
          `Notas dos pacientes (NFS-e) — ${clinicaAtual?.clinica.nome ?? ""}`,
          `Período: ${periodoTexto}`,
          linhaDeFiltros,
          `Gerado em ${new Date().toLocaleString("pt-BR")}`,
        ],
        colunas,
        linhas: filtradas.map((l) => [
          ...celulasDaLinha(l),
          Number(l.valor_servicos) || 0,
          rotuloStatus(l.status),
        ]),
        totais: [
          ...Array(podeVerFuncionario ? 7 : 6).fill(""),
          `${resumo.qtdEmitidas} nota(s) emitida(s)`,
          resumo.valorEmitidas,
          "",
        ],
        resumo: {
          titulo: "Total emitido por empresa",
          itens: [
            ...porEmpresa.map((e) => ({
              rotulo: `${e.nome} (${e.qtd} nota${e.qtd !== 1 ? "s" : ""})`,
              valor: e.valor,
              tipo: "moeda" as const,
            })),
            {
              rotulo: `Canceladas (${resumo.qtdCanceladas})`,
              valor: resumo.valorCanceladas,
              tipo: "moeda" as const,
            },
          ],
        },
      });
      toast.success(`Planilha gerada com ${filtradas.length} nota(s).`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExportando(false);
    }
  };

  const onExportarCsv = () => {
    if (!filtradas.length) return semDados();
    // O CSV sai com o valor em número puro (ponto decimal) para o Excel somar
    // a coluna sem ninguém precisar converter nada à mão.
    const linhasCsv = filtradas.map((l) => {
      const celulas = [...celulasDaLinha(l), Number(l.valor_servicos) || 0, rotuloStatus(l.status)];
      return Object.fromEntries(cabecalhosExport.map((h, i) => [h, celulas[i]]));
    });
    exportToExcel(
      linhasCsv,
      `notas-pacientes-${periodo.inicio}-a-${periodo.fim}.csv`,
      cabecalhosExport.map((h) => ({ key: h, label: h })),
    );
    toast.success(`CSV gerado com ${filtradas.length} nota(s).`);
  };

  const onImprimir = () => {
    if (!filtradas.length) return semDados();
    imprimirRelatorio({
      clinicaNome: clinicaAtual?.clinica.nome ?? "",
      titulo: "Notas dos pacientes (NFS-e)",
      periodo: `${periodoTexto} — ${linhaDeFiltros}`,
      colunas: [
        { rotulo: "Data" },
        { rotulo: "Hora" },
        { rotulo: "Nº / RPS" },
        { rotulo: "Paciente" },
        { rotulo: "CPF/CNPJ" },
        { rotulo: "Empresa" },
        ...(podeVerFuncionario ? [{ rotulo: "Funcionário" }] : []),
        { rotulo: "Serviço / Descrição" },
        { rotulo: "Valor", numerica: true },
        { rotulo: "Status" },
      ],
      linhas: filtradas.map((l) => [
        ...celulasDaLinha(l).map(String),
        fmtMoeda(Number(l.valor_servicos) || 0),
        rotuloStatus(l.status),
      ]),
      totais: [
        ...Array(podeVerFuncionario ? 7 : 6).fill(""),
        `${resumo.qtdEmitidas} emitida(s)`,
        fmtMoeda(resumo.valorEmitidas),
        "",
      ],
      resumo: [
        { rotulo: "Notas no período", valor: String(resumo.total) },
        { rotulo: "Emitidas", valor: `${resumo.qtdEmitidas} · ${fmtMoeda(resumo.valorEmitidas)}` },
        {
          rotulo: "Canceladas",
          valor: `${resumo.qtdCanceladas} · ${fmtMoeda(resumo.valorCanceladas)}`,
        },
        { rotulo: "Em processamento / com erro", valor: String(resumo.qtdProblema) },
      ],
      composicao: porEmpresa.length
        ? {
            titulo: "Total emitido por empresa",
            itens: porEmpresa.map((e) => ({
              rotulo: `${e.nome} (${e.qtd})`,
              valor: fmtMoeda(e.valor),
            })),
          }
        : undefined,
      assinaturas: [{ cargo: "Responsável Financeiro" }],
    });
  };

  const totalColunas = podeVerFuncionario ? 10 : 9;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Notas dos pacientes
          </h1>
          <p className="text-sm text-muted-foreground">
            Conferência das NFS-e emitidas no período. Para emitir ou cancelar, use{" "}
            <Link to="/app/nfse" className="underline underline-offset-2">
              Notas Fiscais
            </Link>
            .
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void onExportarExcel()} disabled={exportando}>
            {exportando ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Exportar Excel
          </Button>
          <Button variant="outline" onClick={onExportarCsv}>
            <Download className="h-4 w-4 mr-2" /> CSV
          </Button>
          <Button variant="outline" onClick={onImprimir}>
            <Printer className="h-4 w-4 mr-2" /> Imprimir / PDF
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={atalhoAtivo === "mes" ? "default" : "outline"}
            onClick={() => setPeriodo(periodoEsteMes())}
          >
            Este mês
          </Button>
          <Button
            size="sm"
            variant={atalhoAtivo === "passado" ? "default" : "outline"}
            onClick={() => setPeriodo(periodoMesPassado())}
          >
            Mês passado
          </Button>
          <Badge variant="secondary" className="self-center">
            {atalhoAtivo === "personalizado" ? "Personalizado" : "Período pronto"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Data inicial</label>
            <Input
              type="date"
              className="w-40"
              value={periodo.inicio}
              max={periodo.fim}
              onChange={(e) => setPeriodo((p) => ({ ...p, inicio: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Data final</label>
            <Input
              type="date"
              className="w-40"
              value={periodo.fim}
              min={periodo.inicio}
              onChange={(e) => setPeriodo((p) => ({ ...p, fim: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Empresa emissora</label>
            <Select value={filtroEmitente} onValueChange={setFiltroEmitente}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {emitentes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome.trim()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {podeVerFuncionario && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Funcionário</label>
              <Select value={filtroFuncionario} onValueChange={setFiltroFuncionario}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {funcionarios.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="emitida">Emitida</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
                <SelectItem value="processando">Em processamento</SelectItem>
                <SelectItem value="erro">Erro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-[220px]">
            <label className="text-xs text-muted-foreground">Buscar</label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Paciente, CPF, nº da nota ou descrição"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Notas no período</div>
          <div className="text-2xl font-semibold">{resumo.total}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">
            Valor total emitido ({resumo.qtdEmitidas})
          </div>
          <div className="text-2xl font-semibold">{fmtMoeda(resumo.valorEmitidas)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Canceladas ({resumo.qtdCanceladas})</div>
          <div className="text-2xl font-semibold">{fmtMoeda(resumo.valorCanceladas)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Em processamento / com erro</div>
          <div className="text-2xl font-semibold">{resumo.qtdProblema}</div>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-32">Data e hora</TableHead>
              <TableHead className="w-28">Nº / RPS</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead className="w-44">Empresa emissora</TableHead>
              {podeVerFuncionario && <TableHead className="w-44">Funcionário</TableHead>}
              <TableHead>Serviço / Descrição</TableHead>
              <TableHead className="w-32 text-right">Valor</TableHead>
              <TableHead className="w-36">Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={totalColunas}
                  className="text-center py-10 text-muted-foreground"
                >
                  Carregando…
                </TableCell>
              </TableRow>
            ) : filtradas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={totalColunas}
                  className="text-center py-10 text-muted-foreground"
                >
                  <FileText className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
                  Nenhuma nota no período e nos filtros selecionados.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {dataBr(l.data_emissao)}
                    <span className="text-muted-foreground"> {horaBr(l.created_at)}</span>
                  </TableCell>
                  <TableCell className="text-sm">{numeroDaNota(l)}</TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{l.paciente_nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {documentoBr(l.paciente_cpf) || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{l.emitente_nome}</TableCell>
                  {podeVerFuncionario && (
                    <TableCell className="text-sm">{l.funcionario_nome}</TableCell>
                  )}
                  <TableCell
                    className="text-sm max-w-[22rem] truncate"
                    title={l.descricao_servicos ?? ""}
                  >
                    {l.descricao_servicos ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap">
                    {fmtMoeda(Number(l.valor_servicos) || 0)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        l.status === "emitida"
                          ? "default"
                          : l.status === "erro"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {rotuloStatus(l.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {l.url_pdf && (
                      <a
                        href={l.url_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir PDF da nota"
                      >
                        <Button variant="ghost" size="icon">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
