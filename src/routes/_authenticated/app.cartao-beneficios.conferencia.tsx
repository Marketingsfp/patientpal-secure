import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  EyeOff,
  Info,
  Link2,
  Phone,
  Search,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { exportToExcel } from "@/lib/export-csv";
import { incluirDependenteConfirmando } from "@/lib/contrato-dependentes";
import { perguntarVinculoDuplicado } from "@/lib/perguntar-vinculo-dependente";
import {
  diagnosticarVidas,
  indexarFaixas,
  telefoneInutilComoPista,
  valorDevidoPorVidas,
  type DiagnosticoVidas,
  type FaixaVidas,
} from "@/lib/convenio/vidas-contrato";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/conferencia")({
  component: ConferenciaPage,
  head: () => ({ meta: [{ title: "Conferência de vidas — Cartão Benefícios" }] }),
});

const PAGE = 1000;

type ContratoRow = {
  id: string;
  numero: number;
  paciente_id: string;
  paciente_nome: string;
  valor_mensal: number;
  convenio_id: string | null;
  titular_apenas_financeiro: boolean;
  observacoes: string | null;
};

type DepRow = {
  id: string;
  contrato_id: string;
  paciente_id: string;
  paciente_nome: string;
  parentesco: string | null;
  incluido_em: string;
};

type PacienteRow = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  telefone2: string | null;
  data_nascimento: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  codigo_prontuario_anterior: string | null;
};

type Linha = ContratoRow & {
  diag: DiagnosticoVidas;
  convenioNome: string;
  titular: PacienteRow | null;
  candidatos: PacienteRow[];
  /** Só para "sobram_pessoas": o que a faixa cobraria pelas vidas em uso. */
  valorCorreto: number | null;
};

/** Busca paginada — o PostgREST devolve no máximo 1000 linhas por request. */
async function carregarTudo<T>(
  montarQuery: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await montarQuery(from, from + PAGE - 1);
    if (error) {
      mostrarErro(error);
      break;
    }
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function soDigitos(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}

function formatarTelefone(s: string | null | undefined) {
  const d = soDigitos(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s ?? "—";
}

function formatarBRL(v: number) {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Sobrenomes do titular, para a busca por semelhança sob demanda. */
function sobrenomes(nome: string): string[] {
  const IGNORAR = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);
  return nome
    .toUpperCase()
    .split(/\s+/)
    .slice(1)
    .filter((p) => p.length > 2 && !IGNORAR.has(p));
}

function ConferenciaPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("cartao-beneficios");

  const [loading, setLoading] = useState(true);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [busca, setBusca] = useState("");
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());

  // Diálogo de conferência
  const [aberto, setAberto] = useState<Linha | null>(null);
  const [depsDoAberto, setDepsDoAberto] = useState<DepRow[]>([]);
  const [escolhido, setEscolhido] = useState<PatientOption | null>(null);
  const [parentesco, setParentesco] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [porSobrenome, setPorSobrenome] = useState<PacienteRow[] | null>(null);
  const [buscandoSobrenome, setBuscandoSobrenome] = useState(false);

  const carregar = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const cid = clinicaAtual.clinica_id;

    const contratos = await carregarTudo<ContratoRow>((from, to) =>
      supabase
        .from("contratos_assinatura")
        .select(
          "id, numero, paciente_id, paciente_nome, valor_mensal, convenio_id, titular_apenas_financeiro, observacoes",
        )
        .eq("clinica_id", cid)
        .eq("status", "ativo")
        .eq("teste", false)
        .order("paciente_nome")
        .range(from, to),
    );

    const deps = await carregarTudo<DepRow>((from, to) =>
      supabase
        .from("contrato_dependentes")
        .select(
          "id, contrato_id, paciente_id, paciente_nome, parentesco, incluido_em, contratos_assinatura!inner(clinica_id)",
        )
        .eq("contratos_assinatura.clinica_id", cid)
        .eq("ativo", true)
        .is("excluido_em", null)
        .range(from, to),
    );

    const { data: convData, error: eConv } = await supabase
      .from("cb_convenios")
      .select("id, nome")
      .eq("clinica_id", cid);
    if (eConv) mostrarErro(eConv);
    const convenios = new Map(
      ((convData ?? []) as Array<{ id: string; nome: string }>).map((c) => [c.id, c.nome]),
    );

    const { data: faixaData, error: eFaixa } = await supabase
      .from("cb_convenio_faixas")
      .select("convenio_id, vidas_de, vidas_ate, valor_mensal")
      .in("convenio_id", [...convenios.keys()]);
    if (eFaixa) mostrarErro(eFaixa);
    const faixas = ((faixaData ?? []) as FaixaVidas[]).map((f) => ({
      ...f,
      valor_mensal: Number(f.valor_mensal),
    }));
    const faixasIdx = indexarFaixas(faixas);

    const depsPorContrato = new Map<string, DepRow[]>();
    for (const d of deps) {
      const arr = depsPorContrato.get(d.contrato_id) ?? [];
      arr.push(d);
      depsPorContrato.set(d.contrato_id, arr);
    }

    const diagnosticadas = contratos.map((c) => ({
      contrato: c,
      diag: diagnosticarVidas(
        { ...c, valor_mensal: Number(c.valor_mensal) },
        depsPorContrato.get(c.id)?.length ?? 0,
        faixasIdx,
      ),
    }));

    // Cadastro dos titulares — telefone e endereço vivem em `pacientes`,
    // não no contrato, e é deles que sai a única pista de família que
    // sobrou da migração.
    const idsTitulares = [...new Set(diagnosticadas.map((d) => d.contrato.paciente_id))];
    const titulares = new Map<string, PacienteRow>();
    // Lotes de 100: cada UUID ocupa ~37 caracteres na querystring do
    // PostgREST, e lotes maiores estouram o limite de URL do proxy.
    for (const parte of chunk(idsTitulares, 100)) {
      const { data, error } = await supabase
        .from("pacientes")
        .select(
          "id, nome, cpf, telefone, telefone2, data_nascimento, logradouro, numero, bairro, codigo_prontuario_anterior",
        )
        .in("id", parte);
      if (error) {
        mostrarErro(error);
        break;
      }
      for (const p of (data ?? []) as PacienteRow[]) titulares.set(p.id, p);
    }

    // Candidatos por telefone compartilhado. Só para quem tem vaga órfã —
    // não faz sentido varrer a base inteira atrás de contrato já fechado.
    const comVaga = diagnosticadas.filter((d) => d.diag.situacao === "faltam_pessoas");
    const telefonesAlvo = [
      ...new Set(
        comVaga
          .map((d) => soDigitos(titulares.get(d.contrato.paciente_id)?.telefone))
          .filter((t) => !telefoneInutilComoPista(t)),
      ),
    ];

    const porTelefone = new Map<string, PacienteRow[]>();
    const colunas =
      "id, nome, cpf, telefone, telefone2, data_nascimento, logradouro, numero, bairro, codigo_prontuario_anterior";
    for (const parte of chunk(telefonesAlvo, 150)) {
      for (const coluna of ["telefone", "telefone2"] as const) {
        const { data, error } = await supabase
          .from("pacientes")
          .select(colunas)
          .eq("clinica_id", cid)
          .eq("ativo", true)
          .in(coluna, parte);
        if (error) {
          mostrarErro(error);
          continue;
        }
        for (const p of (data ?? []) as PacienteRow[]) {
          const chave = soDigitos(p[coluna]);
          const arr = porTelefone.get(chave) ?? [];
          if (!arr.some((x) => x.id === p.id)) arr.push(p);
          porTelefone.set(chave, arr);
        }
      }
    }

    // Quem já tem plano próprio ou já é dependente de alguém não pode ser
    // sugerido: entraria em dois contratos ao mesmo tempo.
    const jaVinculados = new Set<string>([
      ...deps.map((d) => d.paciente_id),
      ...contratos.map((c) => c.paciente_id),
    ]);

    const montadas: Linha[] = diagnosticadas.map(({ contrato, diag }) => {
      const titular = titulares.get(contrato.paciente_id) ?? null;
      const tel = soDigitos(titular?.telefone);
      const brutos = diag.situacao === "faltam_pessoas" ? (porTelefone.get(tel) ?? []) : [];
      const candidatos = brutos.filter(
        (p) => p.id !== contrato.paciente_id && !jaVinculados.has(p.id),
      );
      return {
        ...contrato,
        valor_mensal: Number(contrato.valor_mensal),
        diag,
        convenioNome: contrato.convenio_id
          ? (convenios.get(contrato.convenio_id) ?? "Convênio removido")
          : "Sem convênio",
        titular,
        // Telefone compartilhado por muita gente é recepção, empresa ou
        // número reaproveitado — não é família. Sugerir isso seria pior
        // que não sugerir nada.
        candidatos: candidatos.length > 8 ? [] : candidatos,
        valorCorreto:
          diag.situacao === "sobram_pessoas" && contrato.convenio_id
            ? valorDevidoPorVidas(contrato.convenio_id, diag.vidasAtuais, faixas)
            : null,
      };
    });

    setLinhas(montadas);
    setLoading(false);
  };

  useEffect(() => {
    void carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id]);

  const fila = useMemo(
    () =>
      linhas
        .filter((l) => l.diag.situacao === "faltam_pessoas" && !ocultos.has(l.id))
        .sort(
          (a, b) =>
            b.candidatos.length - a.candidatos.length ||
            b.diag.vagasOrfas - a.diag.vagasOrfas ||
            a.paciente_nome.localeCompare(b.paciente_nome),
        ),
    [linhas, ocultos],
  );

  const filaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return fila;
    return fila.filter(
      (l) => l.paciente_nome.toLowerCase().includes(q) || String(l.numero).includes(q),
    );
  }, [fila, busca]);

  const semFaixa = useMemo(
    () => linhas.filter((l) => l.diag.situacao === "sem_faixa" && l.convenio_id),
    [linhas],
  );
  const sobrando = useMemo(
    () => linhas.filter((l) => l.diag.situacao === "sobram_pessoas"),
    [linhas],
  );

  const stats = useMemo(() => {
    const comVaga = linhas.filter((l) => l.diag.situacao === "faltam_pessoas");
    return {
      fila: comVaga.length,
      vagas: comVaga.reduce((s, l) => s + l.diag.vagasOrfas, 0),
      comSugestao: comVaga.filter((l) => l.candidatos.length > 0).length,
      ok: linhas.filter((l) => l.diag.situacao === "ok").length,
    };
  }, [linhas]);

  const abrir = (l: Linha) => {
    setAberto(l);
    setEscolhido(null);
    setParentesco("");
    setPorSobrenome(null);
    void carregarDeps(l.id);
  };

  const carregarDeps = async (contratoId: string) => {
    const { data, error } = await supabase
      .from("contrato_dependentes")
      .select("id, contrato_id, paciente_id, paciente_nome, parentesco, incluido_em")
      .eq("contrato_id", contratoId)
      .eq("ativo", true)
      .is("excluido_em", null)
      .order("incluido_em");
    if (error) {
      mostrarErro(error);
      return;
    }
    setDepsDoAberto((data ?? []) as DepRow[]);
  };

  const fechar = () => {
    setAberto(null);
    setDepsDoAberto([]);
    setEscolhido(null);
    setParentesco("");
    setPorSobrenome(null);
  };

  const buscarPorSobrenome = async () => {
    if (!aberto || !clinicaAtual) return;
    const partes = sobrenomes(aberto.paciente_nome);
    if (partes.length === 0) {
      setPorSobrenome([]);
      return;
    }
    setBuscandoSobrenome(true);
    // Sobrenome mais raro primeiro: o último costuma ser o de família.
    const alvo = partes[partes.length - 1];
    const { data, error } = await supabase
      .from("pacientes")
      .select(
        "id, nome, cpf, telefone, telefone2, data_nascimento, logradouro, numero, bairro, codigo_prontuario_anterior",
      )
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("ativo", true)
      .ilike("nome", `%${alvo}%`)
      .limit(30);
    setBuscandoSobrenome(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    const jaNoContrato = new Set(depsDoAberto.map((d) => d.paciente_id));
    setPorSobrenome(
      ((data ?? []) as PacienteRow[]).filter(
        (p) => p.id !== aberto.paciente_id && !jaNoContrato.has(p.id),
      ),
    );
  };

  const vincular = async (paciente: { id: string; nome: string }) => {
    if (!aberto) return;
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    setSalvando(true);
    const r = await incluirDependenteConfirmando(
      {
        contratoId: aberto.id,
        pacienteId: paciente.id,
        pacienteNome: paciente.nome,
        parentesco: parentesco.trim() || null,
      },
      perguntarVinculoDuplicado,
    );
    setSalvando(false);
    // null = o operador viu o aviso de outro cartão ativo e desistiu.
    if (!r) return;
    if (!r.ok) {
      toast.error(r.mensagem);
      return;
    }
    toast.success(`${paciente.nome} vinculada(o) ao contrato #${aberto.numero}.`);
    setEscolhido(null);
    setParentesco("");
    setPorSobrenome(null);
    await carregarDeps(aberto.id);
    await carregar();
  };

  const exportarFila = () => {
    exportToExcel(
      fila.map((l) => ({
        contrato: l.numero,
        titular: l.paciente_nome,
        convenio: l.convenioNome,
        valor_mensal: l.valor_mensal,
        paga_por: l.diag.vidasEsperadas ?? "",
        tem_hoje: l.diag.vidasAtuais,
        vagas_orfas: l.diag.vagasOrfas,
        telefone: formatarTelefone(l.titular?.telefone),
        cpf: l.titular?.cpf ?? "",
        endereco: [l.titular?.logradouro, l.titular?.numero, l.titular?.bairro]
          .filter(Boolean)
          .join(", "),
        candidatos_sugeridos: l.candidatos.map((c) => c.nome).join(" | "),
      })),
      `conferencia-vidas-${new Date().toISOString().slice(0, 10)}`,
    );
  };

  const exportarAuditoria = () => {
    exportToExcel(
      [
        ...semFaixa.map((l) => ({
          tipo: "Valor fora da tabela",
          contrato: l.numero,
          titular: l.paciente_nome,
          convenio: l.convenioNome,
          valor_pago: l.valor_mensal,
          pessoas_vinculadas: l.diag.vidasAtuais,
          observacao: "Nenhuma faixa do convênio tem este valor",
        })),
        ...sobrando.map((l) => ({
          tipo: "Cobrança abaixo do devido",
          contrato: l.numero,
          titular: l.paciente_nome,
          convenio: l.convenioNome,
          valor_pago: l.valor_mensal,
          pessoas_vinculadas: l.diag.vidasAtuais,
          observacao: `Faixa paga cobre ${l.diag.vidasEsperadas} pessoa(s)`,
        })),
      ],
      `auditoria-financeira-convenios-${new Date().toISOString().slice(0, 10)}`,
    );
  };

  if (!clinicaAtual) return <p className="text-sm text-muted-foreground">Selecione uma clínica.</p>;

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Estes contratos vieram da planilha de rateios de junho/2026 com o valor certo, mas sem a
          ligação entre titular e dependentes. O sistema <b>não sabe</b> quem são as pessoas que
          faltam — as sugestões abaixo são apenas pistas (telefone igual, sobrenome parecido).
          <b> Confirme por telefone com o titular antes de vincular.</b> Toda inclusão fica
          registrada com o seu usuário, data e hora na tela de Auditoria.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          label="Contratos na fila"
          value={loading ? "…" : stats.fila}
          icon={<AlertCircle className="h-4 w-4 text-orange-600" />}
        />
        <KPI
          label="Vagas sem pessoa"
          value={loading ? "…" : stats.vagas}
          icon={<Users className="h-4 w-4 text-orange-600" />}
        />
        <KPI
          label="Com sugestão de candidato"
          value={loading ? "…" : stats.comSugestao}
          icon={<Phone className="h-4 w-4 text-primary" />}
        />
        <KPI
          label="Contratos já corretos"
          value={loading ? "…" : stats.ok}
          icon={<Check className="h-4 w-4 text-green-600" />}
        />
      </div>

      <Tabs defaultValue="fila">
        <TabsList>
          <TabsTrigger value="fila">Fila de conferência</TabsTrigger>
          <TabsTrigger value="auditoria">
            Auditoria financeira
            {!loading && (semFaixa.length > 0 || sobrando.length > 0) && (
              <Badge variant="secondary" className="ml-2">
                {semFaixa.length + sobrando.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------- FILA ------------------------------- */}
        <TabsContent value="fila" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4 flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[220px]">
                <Label>Buscar titular ou nº do contrato</Label>
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Digite o nome do titular…"
                />
              </div>
              {ocultos.size > 0 && (
                <Button variant="outline" size="sm" onClick={() => setOcultos(new Set())}>
                  Mostrar {ocultos.size} oculto(s)
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={exportarFila}
                disabled={fila.length === 0}
              >
                <Download className="h-4 w-4 mr-1" /> Exportar lista
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {loading ? "Carregando…" : `${filaFiltrada.length} contrato(s) para conferir`}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!loading && filaFiltrada.length === 0 ? (
                <p className="text-sm text-muted-foreground p-8 text-center">
                  Nenhum contrato pendente com este filtro. 🎉
                </p>
              ) : (
                <ul className="divide-y">
                  {filaFiltrada.slice(0, 150).map((l) => (
                    <li
                      key={l.id}
                      className="p-3 flex flex-wrap items-center gap-3 hover:bg-muted/30"
                    >
                      <div className="flex-1 min-w-[260px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{l.paciente_nome}</span>
                          <Badge variant="outline" className="text-xs">
                            #{l.numero}
                          </Badge>
                          <Badge className="text-xs bg-orange-600 text-white">
                            {l.diag.vagasOrfas} vaga(s)
                          </Badge>
                          {l.candidatos.length > 0 && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <Phone className="h-3 w-3" />
                              {l.candidatos.length} candidato(s)
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {l.convenioNome} · {formatarBRL(l.valor_mensal)} · paga por{" "}
                          <b>{l.diag.vidasEsperadas}</b> pessoa(s), tem <b>{l.diag.vidasAtuais}</b>{" "}
                          hoje
                          {l.titular?.telefone
                            ? ` · ${formatarTelefone(l.titular.telefone)}`
                            : " · sem telefone cadastrado"}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Ocultar até recarregar a página"
                        onClick={() => setOcultos((s) => new Set(s).add(l.id))}
                      >
                        <EyeOff className="h-4 w-4" />
                      </Button>
                      <Button size="sm" onClick={() => abrir(l)}>
                        Conferir <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </li>
                  ))}
                  {filaFiltrada.length > 150 && (
                    <li className="p-3 text-xs text-muted-foreground text-center">
                      Mostrando 150 de {filaFiltrada.length}. Refine a busca para ver o resto.
                    </li>
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------- AUDITORIA ---------------------------- */}
        <TabsContent value="auditoria" className="space-y-4 mt-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Casos para a gerência analisar — <b>não</b> mexa por aqui. Alterar o valor de um
              contrato muda a cobrança do titular.
            </AlertDescription>
          </Alert>

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={exportarAuditoria}
              disabled={semFaixa.length + sobrando.length === 0}
            >
              <Download className="h-4 w-4 mr-1" /> Exportar auditoria
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Valor fora da tabela do convênio ({semFaixa.length})
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                O que o contrato paga não corresponde a nenhuma faixa de preço do convênio, então
                não dá para saber quantas pessoas foram contratadas. Costuma ser desconto antigo ou
                valor digitado errado na migração.
              </p>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <TabelaAuditoria
                linhas={semFaixa}
                loading={loading}
                colunaFinal="Pessoas vinculadas hoje"
                render={(l) => String(l.diag.vidasAtuais)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Cobrança abaixo do devido ({sobrando.length})
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Há mais pessoas usando o plano do que a faixa paga cobre. A clínica está recebendo a
                menos nesses contratos.
              </p>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <TabelaAuditoria
                linhas={sobrando}
                loading={loading}
                colunaFinal="Paga por / Usa / Valor correto"
                render={(l) =>
                  `${l.diag.vidasEsperadas} / ${l.diag.vidasAtuais} / ${
                    l.valorCorreto === null ? "—" : formatarBRL(l.valorCorreto)
                  }`
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* --------------------------- DIÁLOGO --------------------------- */}
      <Dialog
        open={aberto !== null}
        onOpenChange={(o) => {
          if (!o) fechar();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">
              {aberto?.paciente_nome}{" "}
              <span className="text-muted-foreground font-normal">
                — contrato #{aberto?.numero}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-auto flex-1 space-y-4 pr-1">
            {aberto && (
              <>
                <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/20">
                  <div>
                    <b>{aberto.convenioNome}</b> · {formatarBRL(aberto.valor_mensal)} · faixa de{" "}
                    <b>{aberto.diag.vidasEsperadas} pessoa(s)</b> · faltam{" "}
                    <b className="text-orange-600">{aberto.diag.vagasOrfas}</b>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Telefone do titular: {formatarTelefone(aberto.titular?.telefone)}
                    {aberto.titular?.telefone2
                      ? ` / ${formatarTelefone(aberto.titular.telefone2)}`
                      : ""}
                    {aberto.titular?.cpf ? ` · CPF ${aberto.titular.cpf}` : ""}
                  </div>
                  {aberto.titular?.logradouro && (
                    <div className="text-xs text-muted-foreground">
                      Endereço: {aberto.titular.logradouro}
                      {aberto.titular.numero ? `, ${aberto.titular.numero}` : ""}
                      {aberto.titular.bairro ? ` — ${aberto.titular.bairro}` : ""}
                    </div>
                  )}
                </div>

                {depsDoAberto.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-1.5">
                      Já vinculados ({depsDoAberto.length})
                    </p>
                    <div className="space-y-1">
                      {depsDoAberto.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between text-sm border rounded px-2 py-1.5"
                        >
                          <span>
                            {d.paciente_nome}
                            {d.parentesco && (
                              <span className="text-xs text-muted-foreground ml-2">
                                ({d.parentesco})
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            desde{" "}
                            {new Date(d.incluido_em + "T12:00:00").toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Parentesco (aplicado ao próximo vínculo)</Label>
                  <Input
                    value={parentesco}
                    onChange={(e) => setParentesco(e.target.value)}
                    placeholder="Filho(a), Cônjuge, Pai/Mãe…"
                  />
                </div>

                {/* Candidatos por telefone */}
                <div>
                  <p className="text-sm font-semibold mb-1">
                    <Phone className="h-3.5 w-3.5 inline mr-1" />
                    Mesmo telefone do titular ({aberto.candidatos.length})
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Pista mais forte que temos, mas ainda é pista: telefone repetido também acontece
                    entre vizinhos e cadastros antigos.
                  </p>
                  {aberto.candidatos.length === 0 ? (
                    <p className="text-sm text-muted-foreground border rounded-md p-3">
                      Nenhum candidato por telefone. Confirme com o titular quem são os dependentes
                      e busque pelo nome abaixo.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {aberto.candidatos.map((c) => (
                        <CandidatoLinha
                          key={c.id}
                          p={c}
                          disabled={!podeEscrever || salvando}
                          onVincular={() => vincular(c)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Candidatos por sobrenome */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold">Mesmo sobrenome</p>
                    {porSobrenome === null && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={buscarPorSobrenome}
                        disabled={buscandoSobrenome}
                      >
                        <Search className="h-3.5 w-3.5 mr-1" />
                        {buscandoSobrenome ? "Buscando…" : "Buscar por sobrenome"}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Pista fraca — nesta base há titulares cujos dependentes têm sobrenome totalmente
                    diferente. Sirva-se dela só para lembrar nomes na ligação.
                  </p>
                  {porSobrenome !== null &&
                    (porSobrenome.length === 0 ? (
                      <p className="text-sm text-muted-foreground border rounded-md p-3">
                        Nenhum paciente com esse sobrenome.
                      </p>
                    ) : (
                      <div className="space-y-1 max-h-56 overflow-auto">
                        {porSobrenome.map((c) => (
                          <CandidatoLinha
                            key={c.id}
                            p={c}
                            disabled={!podeEscrever || salvando}
                            onVincular={() => vincular(c)}
                          />
                        ))}
                      </div>
                    ))}
                </div>

                {/* Busca livre */}
                <div className="space-y-1.5 pt-2 border-t">
                  <Label>Ou busque qualquer paciente pelo nome / CPF</Label>
                  <PatientSearchInput value={escolhido} onSelect={setEscolhido} />
                  {escolhido && (
                    <Button
                      className="w-full mt-2"
                      disabled={!podeEscrever || salvando}
                      onClick={() => vincular({ id: escolhido.id, nome: escolhido.nome })}
                    >
                      <Link2 className="h-4 w-4 mr-1" />
                      {salvando ? "Vinculando…" : `Vincular ${escolhido.nome}`}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={fechar}>
              <X className="h-4 w-4 mr-1" /> Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CandidatoLinha({
  p,
  disabled,
  onVincular,
}: {
  p: PacienteRow;
  disabled: boolean;
  onVincular: () => void;
}) {
  const idade = p.data_nascimento
    ? Math.floor((Date.now() - new Date(p.data_nascimento + "T12:00:00").getTime()) / 31557600000)
    : null;
  return (
    <div className="flex items-center justify-between gap-2 border rounded-md px-2 py-1.5">
      <div className="min-w-0">
        <div className="text-sm truncate">{p.nome}</div>
        <div className="text-xs text-muted-foreground">
          {idade !== null ? `${idade} anos` : "idade não informada"}
          {p.cpf ? ` · CPF ${p.cpf}` : ""}
          {p.telefone ? ` · ${formatarTelefone(p.telefone)}` : ""}
        </div>
      </div>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={onVincular}>
        <Link2 className="h-4 w-4 mr-1" /> Vincular
      </Button>
    </div>
  );
}

function TabelaAuditoria({
  linhas,
  loading,
  colunaFinal,
  render,
}: {
  linhas: Linha[];
  loading: boolean;
  colunaFinal: string;
  render: (l: Linha) => string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Titular</TableHead>
          <TableHead>Nº</TableHead>
          <TableHead>Convênio</TableHead>
          <TableHead className="text-right">Valor pago</TableHead>
          <TableHead className="text-right">{colunaFinal}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading || linhas.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
              {loading ? "Carregando…" : "Nenhum caso."}
            </TableCell>
          </TableRow>
        ) : (
          linhas.slice(0, 300).map((l) => (
            <TableRow key={l.id}>
              <TableCell>{l.paciente_nome}</TableCell>
              <TableCell>#{l.numero}</TableCell>
              <TableCell>{l.convenioNome}</TableCell>
              <TableCell className="text-right">{formatarBRL(l.valor_mensal)}</TableCell>
              <TableCell className="text-right font-medium">{render(l)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function KPI({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
