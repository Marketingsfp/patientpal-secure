/**
 * Importação de médicos por planilha (Equipe → Médicos).
 *
 * Roda inteira no navegador, com o login de quem está usando o sistema: o
 * arquivo nunca sai da máquina e todas as gravações passam pelas mesmas
 * regras de permissão (RLS) do cadastro manual.
 *
 * Grava exatamente o que o formulário de médico grava ao criar um cadastro:
 * `medicos` (dados + repasse padrão), a agenda padrão, `medico_especialidades`,
 * `medico_procedimentos` (serviços que aparecem na Agenda) e `medico_convenios`
 * (repasse individual por serviço, com EM BRANCO = nulo = herda o padrão).
 *
 * A clínica é sempre a clínica aberta na tela — nunca vem da planilha.
 * Esta tela só cria médicos novos: quem já existe é pulado, nunca alterado,
 * porque o repasse de um médico cadastrado pode ter sido negociado caso a caso.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Info,
  Download,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { mostrarErro } from "@/lib/traduzir-erro";
import { confirmDialog } from "@/lib/confirm";
import { exportToExcel } from "@/lib/export-csv";
import { invalidateAgendaRefs } from "@/lib/agenda/refs-cache";
import {
  conferirImportacaoMedicos,
  lerPlanilhaMedicos,
  montarModeloMedicos,
  numeroOuNulo,
  repasseTemExcecao,
  type LinhaRecusada,
  type MedicoConferido,
  type MedicoExistente,
  type Opcao,
  type RepasseConferido,
  type ResultadoLeituraMedicos,
  type TipoRepasse,
} from "@/lib/importar-medicos";
import { chaveTexto } from "@/lib/importar-servicos";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/equipe/importar")({
  component: ImportarMedicosPage,
  head: () => ({ meta: [{ title: "Importar médicos por planilha — ClinicaOS" }] }),
});

const TAMANHO_MAXIMO = 15 * 1024 * 1024; // 15 MB

type Resultado = {
  cadastrados: number;
  servicosVinculados: number;
  excecoesGravadas: number;
  especialidadesCriadas: number;
  /** Médico cadastrado, mas alguma parte (serviços, repasse) falhou. */
  incompletos: Array<{ nome: string; motivo: string }>;
  falhas: Array<{ nome: string; linhaExcel: number; motivo: string }>;
};

const fmtBRL = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtRepasse = (valor: number, tipo: TipoRepasse) =>
  tipo === "percentual" ? `${String(valor).replace(".", ",")}%` : fmtBRL(valor);

/** Célula de repasse na conferência: em branco mostra que herda o padrão. */
function CelulaRepasse({ valor, tipo }: { valor: number | null; tipo: TipoRepasse }) {
  if (valor === null) return <span className="text-muted-foreground">padrão</span>;
  if (valor === 0) {
    return (
      <Badge variant="outline" className="border-destructive text-destructive">
        sem repasse
      </Badge>
    );
  }
  return <span>{fmtRepasse(valor, tipo)}</span>;
}

async function buscarPaginado<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const todos: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw error;
    const lote = (data as T[]) ?? [];
    todos.push(...lote);
    if (lote.length < 1000) break;
  }
  return todos;
}

function ImportarMedicosPage() {
  const navigate = useNavigate();
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("equipe");
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const nomeClinica = clinicaAtual?.clinica.nome ?? "nenhuma clínica selecionada";

  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [leitura, setLeitura] = useState<ResultadoLeituraMedicos | null>(null);

  const [existentes, setExistentes] = useState<MedicoExistente[]>([]);
  const [especialidades, setEspecialidades] = useState<Opcao[]>([]);
  const [servicos, setServicos] = useState<Opcao[]>([]);
  /** procedimento_id -> especialidades às quais o serviço está ligado. */
  const [espPorServico, setEspPorServico] = useState<Map<string, Set<string>>>(new Map());
  const [carregando, setCarregando] = useState(false);
  const [versaoCadastro, setVersaoCadastro] = useState(0);

  const [criarEspecialidades, setCriarEspecialidades] = useState(true);
  /** Repasse para todos, quando a planilha não traz a coluna de repasse. */
  const [repasseGeralTipo, setRepasseGeralTipo] = useState<TipoRepasse>("percentual");
  const [repasseGeralTexto, setRepasseGeralTexto] = useState("");
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // --- cadastro atual da clínica -------------------------------------------
  useEffect(() => {
    if (!clinicaId) return;
    let cancelado = false;
    setCarregando(true);
    void (async () => {
      try {
        let medicos: MedicoExistente[];
        try {
          medicos = await buscarPaginado<MedicoExistente>((de, ate) =>
            supabase
              .from("medicos")
              .select("id, nome, crm, crm_uf, cpf")
              .eq("clinica_id", clinicaId)
              .order("nome")
              .range(de, ate),
          );
        } catch {
          // Se o CPF não puder ser lido por este usuário, a conferência segue
          // por CRM e nome — que já pegam praticamente todo cadastro repetido.
          medicos = (
            await buscarPaginado<Omit<MedicoExistente, "cpf">>((de, ate) =>
              supabase
                .from("medicos")
                .select("id, nome, crm, crm_uf")
                .eq("clinica_id", clinicaId)
                .order("nome")
                .range(de, ate),
            )
          ).map((m) => ({ ...m, cpf: null }));
        }
        const procs = await buscarPaginado<Opcao>((de, ate) =>
          supabase
            .from("procedimentos")
            .select("id, nome")
            .eq("clinica_id", clinicaId)
            .eq("ativo", true)
            .order("nome")
            .range(de, ate),
        );
        const vinculos = await buscarPaginado<{
          procedimento_id: string;
          especialidade_id: string;
        }>((de, ate) =>
          supabase
            .from("procedimento_especialidades")
            .select("procedimento_id, especialidade_id")
            .eq("clinica_id", clinicaId)
            .range(de, ate),
        );
        const { data: esps, error: espErr } = await supabase
          .from("especialidades")
          .select("id, nome")
          .order("nome");
        if (espErr) throw espErr;
        if (cancelado) return;

        const mapa = new Map<string, Set<string>>();
        for (const v of vinculos) {
          if (!mapa.has(v.procedimento_id)) mapa.set(v.procedimento_id, new Set());
          mapa.get(v.procedimento_id)!.add(v.especialidade_id);
        }
        setExistentes(medicos);
        setServicos(procs);
        setEspPorServico(mapa);
        setEspecialidades((esps ?? []) as Opcao[]);
      } catch (e) {
        if (!cancelado) mostrarErro(e, "carregar o cadastro atual da clínica");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaId, versaoCadastro]);

  // Só vale número digitado de propósito (0 incluído); em branco não supõe nada.
  const repasseGeralValor = numeroOuNulo(repasseGeralTexto);
  const repasseGeralErro =
    repasseGeralValor === null
      ? null
      : Number.isNaN(repasseGeralValor) || repasseGeralValor < 0
        ? "Digite um número válido."
        : repasseGeralTipo === "percentual" && repasseGeralValor > 100
          ? "O percentual não pode passar de 100%."
          : null;
  const repasseGeral =
    repasseGeralValor !== null && !repasseGeralErro
      ? { tipo: repasseGeralTipo, valor: repasseGeralValor }
      : null;
  const faltaRepasseGeral = !!leitura?.semRepasse && !repasseGeral;

  const conferencia = useMemo(() => {
    if (!leitura) return null;
    return conferirImportacaoMedicos(leitura, {
      existentes,
      especialidades,
      servicos,
      criarEspecialidades,
      repasseGeral,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    leitura,
    existentes,
    especialidades,
    servicos,
    criarEspecialidades,
    repasseGeral?.tipo,
    repasseGeral?.valor,
  ]);

  const todosRepasses = useMemo(
    () =>
      (conferencia?.novos ?? []).flatMap((m) => m.repasses.map((r) => ({ medico: m, repasse: r }))),
    [conferencia],
  );
  const totalExcecoes = todosRepasses.filter(({ repasse }) => repasseTemExcecao(repasse)).length;
  const comPendencia = (conferencia?.novos ?? []).filter((m) => m.pendencias.length).length;

  // --- arquivo --------------------------------------------------------------
  const receberArquivo = useCallback(
    async (arquivo: File) => {
      setResultado(null);
      if (arquivo.size > TAMANHO_MAXIMO) {
        toast.error("A planilha passa de 15 MB. Divida em partes menores.");
        return;
      }
      if (!/\.(xlsx|xlsm|xls|csv)$/i.test(arquivo.name)) {
        toast.error("Envie a planilha em Excel (.xlsx) ou .csv, no formato do modelo.");
        return;
      }
      setLendo(true);
      setNomeArquivo(arquivo.name);
      try {
        const lida = await lerPlanilhaMedicos(await arquivo.arrayBuffer(), arquivo.name, {
          ufPadrao: clinicaAtual?.clinica.estado,
        });
        if (!lida.abaMedicos) {
          toast.error(
            "Não encontrei a lista de médicos: faltam as colunas Nome, CRM e Especialidades. Use o modelo da planilha.",
          );
        }
        setLeitura(lida);
      } catch (e) {
        setLeitura(null);
        mostrarErro(e, "ler a planilha");
      } finally {
        setLendo(false);
      }
    },
    [clinicaAtual?.clinica.estado],
  );

  const baixarModelo = async () => {
    try {
      const XLSX = await import("xlsx");
      const wb = montarModeloMedicos(XLSX, {
        especialidades: especialidades.map((e) => e.nome),
        servicos: servicos.map((s) => s.nome),
      });
      XLSX.writeFile(wb, "modelo-importacao-medicos.xlsx", { bookType: "xlsx", compression: true });
    } catch (e) {
      mostrarErro(e, "gerar o modelo da planilha");
    }
  };

  const baixarProblemas = (linhas: LinhaRecusada[]) => {
    exportToExcel(
      linhas.map((r) => ({ aba: r.aba, linha: r.linhaExcel, nome: r.nome, motivo: r.motivo })),
      "linhas-com-problema-medicos",
      [
        { key: "aba", label: "Aba" },
        { key: "linha", label: "Linha da planilha" },
        { key: "nome", label: "Nome" },
        { key: "motivo", label: "Motivo" },
      ],
    );
  };

  // --- gravação -------------------------------------------------------------
  const importar = useCallback(async () => {
    if (!clinicaId || !clinicaAtual || !conferencia) return;
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição na Equipe.");
      return;
    }
    if (faltaRepasseGeral) {
      toast.error("Informe o repasse padrão dos médicos antes de importar.");
      return;
    }
    const novos = conferencia.novos;
    if (!novos.length) {
      toast.info("Não há médico novo para cadastrar.");
      return;
    }

    const ok = await confirmDialog({
      title: "Confirmar importação",
      description: `Vou cadastrar ${novos.length} médico(s) em ${clinicaAtual.clinica.nome ?? "esta clínica"}, com ${todosRepasses.length} serviço(s) vinculado(s) e ${totalExcecoes} repasse(s) diferente(s) do padrão. ${conferencia.jaCadastrados.length} médico(s) que já existem serão pulados.`,
      confirmText: "Importar",
    });
    if (!ok) return;

    setImportando(true);
    setProgresso({ feito: 0, total: novos.length });
    const res: Resultado = {
      cadastrados: 0,
      servicosVinculados: 0,
      excecoesGravadas: 0,
      especialidadesCriadas: 0,
      incompletos: [],
      falhas: [],
    };

    let gravou = false;
    try {
      // 1. Especialidades que faltam (lista compartilhada entre as clínicas).
      const idPorEspecialidade = new Map(especialidades.map((e) => [chaveTexto(e.nome), e.id]));
      if (criarEspecialidades && conferencia.especialidadesFaltando.length) {
        const { data, error } = await supabase
          .from("especialidades")
          .insert(conferencia.especialidadesFaltando.map((nome) => ({ nome, ativo: true })))
          .select("id, nome");
        if (error) {
          mostrarErro(error, "criar as especialidades que faltavam");
          return;
        }
        for (const e of (data ?? []) as Opcao[]) idPorEspecialidade.set(chaveTexto(e.nome), e.id);
        res.especialidadesCriadas = data?.length ?? 0;
        gravou = true;
      }

      // 2. Um médico por vez: se um falhar, os outros seguem e o relatório diz qual.
      for (const [i, m] of novos.entries()) {
        gravou = true;
        const espIds = m.especialidadesResolvidas
          .map((e) => e.id ?? idPorEspecialidade.get(chaveTexto(e.nome)) ?? null)
          .filter((id): id is string => !!id);
        await gravarMedico(m, espIds, clinicaId, espPorServico, res);
        setProgresso({ feito: i + 1, total: novos.length });
      }

      invalidateAgendaRefs(clinicaId);
      toast.success("Importação concluída.");
    } catch (e) {
      mostrarErro(e, "importar a planilha");
    } finally {
      setImportando(false);
      setProgresso(null);
      // Só limpa a conferência se algo foi gravado; num erro antes disso a
      // funcionária continua vendo o que ia importar.
      if (gravou) {
        setResultado(res);
        setLeitura(null);
        setNomeArquivo(null);
        setCriarEspecialidades(true);
        setRepasseGeralTexto("");
        // Recarrega o cadastro: importar o mesmo arquivo de novo pula quem entrou agora.
        setVersaoCadastro((v) => v + 1);
      }
    }
  }, [
    clinicaId,
    clinicaAtual,
    conferencia,
    podeEscrever,
    faltaRepasseGeral,
    todosRepasses.length,
    totalExcecoes,
    especialidades,
    criarEspecialidades,
    espPorServico,
  ]);

  // --- tela -----------------------------------------------------------------
  if (!podeEscrever) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Sem permissão</AlertTitle>
        <AlertDescription>
          Só quem tem permissão de edição na Equipe pode importar médicos por planilha.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-semibold">Importar médicos por planilha</h1>
        <Button variant="outline" onClick={() => navigate({ to: "/app/equipe" })}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar aos médicos
        </Button>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          A planilha é lida aqui no seu navegador — o arquivo não é enviado para lugar nenhum. Tudo
          é gravado só na clínica aberta agora: <strong>{nomeClinica}</strong>. Médico que já existe
          nesta clínica é pulado; nada é alterado nem apagado.
        </AlertDescription>
      </Alert>

      {/* 1. Arquivo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4" /> 1. Escolha a planilha
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              const arquivo = e.dataTransfer.files?.[0];
              if (arquivo) void receberArquivo(arquivo);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              arrastando
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
          >
            {lendo ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
            <p className="text-sm font-medium">
              {nomeArquivo ?? "Arraste a planilha aqui ou clique para escolher"}
            </p>
            <p className="text-xs text-muted-foreground">Arquivo .xlsx ou .csv até 15 MB</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) void receberArquivo(arquivo);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void baixarModelo()}
              disabled={carregando}
            >
              <Download className="h-4 w-4 mr-2" /> Baixar modelo da planilha
            </Button>
            <span className="text-xs text-muted-foreground">
              O modelo já vem com a lista de especialidades e dos serviços desta clínica.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 2. Conferência */}
      {leitura && conferencia && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Confira antes de gravar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">Os médicos serão gravados em</p>
              <p className="text-lg font-semibold">{nomeClinica}</p>
            </div>

            {leitura.semRepasse && (
              <Alert
                className={
                  faltaRepasseGeral ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" : ""
                }
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>A planilha não traz o repasse dos médicos</AlertTitle>
                <AlertDescription className="space-y-3 text-sm">
                  <p>
                    Informe o <strong>repasse padrão</strong> que vale para todos os médicos desta
                    planilha. Depois da importação, ajuste no cadastro de cada médico quem tem um
                    acordo diferente. Digite <strong>0</strong> só se eles não recebem repasse.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-md border">
                      <Button
                        type="button"
                        size="sm"
                        variant={repasseGeralTipo === "percentual" ? "default" : "ghost"}
                        onClick={() => setRepasseGeralTipo("percentual")}
                      >
                        Percentual (%)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={repasseGeralTipo === "valor" ? "default" : "ghost"}
                        onClick={() => setRepasseGeralTipo("valor")}
                      >
                        Valor fixo (R$)
                      </Button>
                    </div>
                    <Input
                      className="w-32"
                      inputMode="decimal"
                      placeholder={repasseGeralTipo === "percentual" ? "ex.: 60" : "ex.: 70,00"}
                      value={repasseGeralTexto}
                      onChange={(e) => setRepasseGeralTexto(e.target.value)}
                      aria-label="Repasse padrão para todos os médicos da planilha"
                    />
                    {repasseGeralErro && (
                      <span className="text-destructive">{repasseGeralErro}</span>
                    )}
                  </div>
                  {faltaRepasseGeral && (
                    <p className="font-medium">
                      A conferência aparece assim que o repasse for informado.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {!faltaRepasseGeral && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{conferencia.novos.length} médico(s) novo(s)</Badge>
                  <Badge variant="secondary">{todosRepasses.length} serviço(s) vinculado(s)</Badge>
                  <Badge variant="secondary">
                    {totalExcecoes} repasse(s) diferente(s) do padrão
                  </Badge>
                  {comPendencia > 0 && (
                    <Badge variant="outline" className="border-amber-500 text-amber-700">
                      {comPendencia} com dado faltando — completar no cadastro depois
                    </Badge>
                  )}
                  {conferencia.jaCadastrados.length > 0 && (
                    <Badge variant="outline">
                      {conferencia.jaCadastrados.length} já cadastrado(s) — serão pulados
                    </Badge>
                  )}
                  {conferencia.recusadas.length > 0 && (
                    <Badge variant="outline" className="border-destructive text-destructive">
                      {conferencia.recusadas.length} linha(s) com problema
                    </Badge>
                  )}
                  {carregando && (
                    <Badge variant="outline">conferindo o cadastro desta clínica…</Badge>
                  )}
                </div>

                {!leitura.abaRepasses && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Aba "Repasse por serviço" não encontrada</AlertTitle>
                    <AlertDescription className="text-sm">
                      Os médicos serão cadastrados sem serviços vinculados — eles não aparecerão com
                      serviços na Agenda até alguém completar o cadastro.
                    </AlertDescription>
                  </Alert>
                )}

                {conferencia.especialidadesCorrigidas.length > 0 && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Especialidades com o nome corrigido</AlertTitle>
                    <AlertDescription className="space-y-1 text-sm">
                      <p className="text-muted-foreground">
                        Estes nomes da planilha foram ligados à especialidade que já existe no
                        cadastro:
                      </p>
                      <ul className="list-disc pl-5">
                        {conferencia.especialidadesCorrigidas.map((c) => (
                          <li key={c.de}>
                            {c.de} → <strong>{c.para}</strong>
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {conferencia.especialidadesFaltando.length > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Especialidades que ainda não existem</AlertTitle>
                    <AlertDescription className="space-y-2 text-sm">
                      <p>{conferencia.especialidadesFaltando.join(", ")}</p>
                      <p className="text-muted-foreground">
                        Confira se não é só o nome escrito diferente (a lista de especialidades vem
                        no modelo). A lista é <strong>compartilhada entre as clínicas</strong>:
                        criar uma nova aqui faz ela aparecer também nas outras. Sem criar, os
                        médicos com essas especialidades ficam de fora.
                      </p>
                      <label className="flex items-center gap-2">
                        <Checkbox
                          checked={criarEspecialidades}
                          onCheckedChange={(v) => setCriarEspecialidades(v === true)}
                        />
                        <span>Criar as especialidades que faltam</span>
                      </label>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Médicos novos */}
                {conferencia.novos.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Médicos que serão cadastrados</h3>
                    <div className="max-h-[420px] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Linha</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>CRM</TableHead>
                            <TableHead>Especialidades</TableHead>
                            <TableHead className="text-right">Repasse padrão</TableHead>
                            <TableHead className="text-right">Serviços</TableHead>
                            <TableHead>Situação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {conferencia.novos.map((m) => (
                            <TableRow key={`novo-${m.linhaExcel}`}>
                              <TableCell>{m.linhaExcel}</TableCell>
                              <TableCell className="font-medium">
                                {m.nome}
                                {m.pendencias.length > 0 && (
                                  <span className="block text-xs font-normal text-amber-700">
                                    Pendente: {m.pendencias.join("; ")}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {m.crm}/{m.crmUf}
                              </TableCell>
                              <TableCell>
                                {m.especialidadesResolvidas.map((e, i) => (
                                  <span key={e.nome}>
                                    {i > 0 && ", "}
                                    {e.nome}
                                    {!e.id && <span className="text-amber-600"> (nova)</span>}
                                  </span>
                                ))}
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                {m.repassePadrao === 0 ? (
                                  <Badge
                                    variant="outline"
                                    className="border-destructive text-destructive"
                                  >
                                    sem repasse
                                  </Badge>
                                ) : (
                                  fmtRepasse(m.repassePadrao, m.tipoRepasse)
                                )}
                              </TableCell>
                              <TableCell className="text-right">{m.repasses.length}</TableCell>
                              <TableCell>
                                {m.ativo ? (
                                  <Badge variant="secondary">novo</Badge>
                                ) : (
                                  <Badge variant="outline">novo · inativo</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Serviços e repasses */}
                {todosRepasses.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Serviços de cada médico e repasse</h3>
                    <p className="text-xs text-muted-foreground">
                      <strong>padrão</strong> = usa o repasse padrão do médico.{" "}
                      <strong className="text-destructive">sem repasse</strong> = foi digitado 0:
                      aquele serviço não paga nada ao médico. Confira esses com atenção.
                    </p>
                    <div className="max-h-[420px] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Linha</TableHead>
                            <TableHead>Médico</TableHead>
                            <TableHead>Serviço</TableHead>
                            <TableHead className="text-right">Particular</TableHead>
                            <TableHead className="text-right">Convênio</TableHead>
                            <TableHead className="text-right">Cartão Consulta</TableHead>
                            <TableHead className="text-right">Cartão Desconto</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {todosRepasses.map(({ medico, repasse: r }) => (
                            <TableRow key={`rep-${r.linhaExcel}`}>
                              <TableCell>{r.linhaExcel}</TableCell>
                              <TableCell>{medico.nome}</TableCell>
                              <TableCell className="font-medium">{r.procedimentoNome}</TableCell>
                              <TableCell className="text-right">
                                <CelulaRepasse valor={r.particular} tipo={r.tipoEfetivo} />
                              </TableCell>
                              <TableCell className="text-right">
                                <CelulaRepasse valor={r.convenio} tipo={r.tipoEfetivo} />
                              </TableCell>
                              <TableCell className="text-right">
                                <CelulaRepasse valor={r.cartaoConsulta} tipo="valor" />
                              </TableCell>
                              <TableCell className="text-right">
                                <CelulaRepasse valor={r.cartaoDesconto} tipo="valor" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Já cadastrados */}
                {conferencia.jaCadastrados.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">
                      Já cadastrados nesta clínica — serão pulados
                    </h3>
                    <div className="max-h-60 overflow-auto rounded-md border">
                      <Table>
                        <TableBody>
                          {conferencia.jaCadastrados.map(({ linha, motivo }) => (
                            <TableRow key={`existe-${linha.linhaExcel}`}>
                              <TableCell className="w-16">{linha.linhaExcel}</TableCell>
                              <TableCell className="font-medium">{linha.nome}</TableCell>
                              <TableCell className="text-muted-foreground">{motivo}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Problemas */}
                {conferencia.recusadas.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-destructive">
                      Linhas com problema — não serão gravadas
                    </h3>
                    <div className="max-h-60 overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Aba</TableHead>
                            <TableHead className="w-16">Linha</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>Motivo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {conferencia.recusadas.map((r, i) => (
                            <TableRow
                              key={`erro-${r.aba}-${r.linhaExcel}-${i}`}
                              className="bg-destructive/5"
                            >
                              <TableCell className="whitespace-nowrap">{r.aba}</TableCell>
                              <TableCell>{r.linhaExcel}</TableCell>
                              <TableCell>{r.nome || "(sem nome)"}</TableCell>
                              <TableCell className="text-destructive">{r.motivo}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => void importar()}
                    disabled={importando || carregando || !conferencia.novos.length}
                  >
                    {importando ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Importar {conferencia.novos.length} médico(s)
                  </Button>
                  {conferencia.recusadas.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => baixarProblemas(conferencia.recusadas)}
                    >
                      <Download className="h-4 w-4 mr-2" /> Baixar linhas com problema
                    </Button>
                  )}
                  {progresso && (
                    <span className="text-sm text-muted-foreground">
                      Gravando {progresso.feito} de {progresso.total}…
                    </span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* 3. Resultado */}
      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-green-600" /> 3. Resultado da importação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{resultado.cadastrados} médico(s) cadastrado(s)</Badge>
              <Badge variant="secondary">
                {resultado.servicosVinculados} serviço(s) vinculado(s)
              </Badge>
              <Badge variant="secondary">{resultado.excecoesGravadas} repasse(s) por serviço</Badge>
              {resultado.especialidadesCriadas > 0 && (
                <Badge variant="secondary">
                  {resultado.especialidadesCriadas} especialidade(s) criada(s)
                </Badge>
              )}
              {resultado.falhas.length > 0 && (
                <Badge variant="outline" className="border-destructive text-destructive">
                  {resultado.falhas.length} não cadastrado(s)
                </Badge>
              )}
            </div>

            {resultado.incompletos.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Cadastrados, mas incompletos — abra o cadastro e confira</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 space-y-1 text-sm">
                    {resultado.incompletos.map((p, i) => (
                      <li key={`inc-${i}`}>
                        {p.nome}: {p.motivo}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {resultado.falhas.length > 0 && (
              <ul className="max-h-60 space-y-1 overflow-auto text-sm text-destructive">
                {resultado.falhas.map((p, i) => (
                  <li key={`falha-${i}`}>
                    Linha {p.linhaExcel} — {p.nome}: {p.motivo}
                  </li>
                ))}
              </ul>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Próximo passo: cadastrar os horários de atendimento de cada médico (inclusive o
                intervalo de almoço) na aba Agendas do cadastro. Sem horário, o médico não abre
                vagas na Agenda.
              </AlertDescription>
            </Alert>

            <Button onClick={() => navigate({ to: "/app/equipe" })}>Voltar aos médicos</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Grava um médico com a mesma forma de dados do formulário de cadastro
 * (`MedicoFormDialog`, ao criar). Anota no resultado o que deu certo e o que
 * falhou, sem interromper os próximos médicos.
 */
async function gravarMedico(
  m: MedicoConferido,
  especialidadeIds: string[],
  clinicaId: string,
  espPorServico: Map<string, Set<string>>,
  res: Resultado,
) {
  const { data: novo, error } = await supabase
    .from("medicos")
    .insert({
      clinica_id: clinicaId,
      nome: m.nome,
      crm: m.crm,
      crm_uf: m.crmUf,
      especialidade_id: especialidadeIds[0] ?? null,
      tipo_repasse: m.tipoRepasse,
      // Mesma regra do formulário: a coluna do percentual não aceita nulo.
      percentual_repasse_padrao: m.tipoRepasse === "percentual" ? m.repassePadrao : 0,
      valor_repasse_padrao: m.tipoRepasse === "valor" ? m.repassePadrao : null,
      aceita_cartao_beneficios: m.aceitaCartaoBeneficios,
      cb_tipo_repasse: m.aceitaCartaoBeneficios ? "valor" : null,
      cb_percentual_repasse: null,
      cb_valor_repasse: null,
      duracao_consulta_min: m.duracaoConsultaMin,
      usa_sistema: true,
      procedimento_padrao_id: null,
      procedimento_padrao_em_branco: false,
      cpf: m.cpf,
      data_nascimento: m.dataNascimento,
      email: m.email,
      telefone: m.telefone,
      telefone2: m.telefone2,
      nacionalidade: "Brasileira",
      sexo: m.sexo,
      cep: m.cep,
      logradouro: m.logradouro,
      numero: m.numero,
      complemento: m.complemento,
      bairro: m.bairro,
      cidade: m.cidade,
      estado: m.estado,
      banco: m.banco,
      agencia: m.agencia,
      conta: m.conta,
      pix_chave: m.pixChave,
      ativo: m.ativo,
    })
    .select("id")
    .single();

  if (error || !novo) {
    res.falhas.push({
      nome: m.nome,
      linhaExcel: m.linhaExcel,
      motivo:
        error?.code === "23505"
          ? "Já existe médico com este CRM nesta clínica."
          : /telefone/i.test(error?.message ?? "")
            ? "O sistema exige telefone com DDD (mínimo 10 números)."
            : (error?.message ?? "erro desconhecido"),
    });
    return;
  }
  res.cadastrados += 1;
  const medicoId = (novo as { id: string }).id;
  const pendencias: string[] = [];

  // Agenda padrão — o formulário cria ao cadastrar, para as disponibilidades terem onde ficar.
  const { error: agErr } = await supabase.from("medico_agendas").insert({
    clinica_id: clinicaId,
    medico_id: medicoId,
    nome: "AGENDA",
    ordem: 0,
    ativo: true,
  } as never);
  if (agErr) pendencias.push("a agenda padrão não foi criada");

  if (especialidadeIds.length) {
    const { error: espErr } = await supabase.from("medico_especialidades").insert(
      especialidadeIds.map((especialidade_id, i) => ({
        medico_id: medicoId,
        especialidade_id,
        tem_rqe: i === 0 && !!m.rqe,
        rqe_numero: i === 0 ? m.rqe : null,
      })),
    );
    if (espErr) pendencias.push("as especialidades não foram gravadas");
  }

  if (m.repasses.length) {
    const { error: procErr } = await supabase.from("medico_procedimentos").insert(
      m.repasses.map((r) => ({
        medico_id: medicoId,
        procedimento_id: r.procedimentoId,
        // Mostra "SERVIÇO (ESPECIALIDADE)" na Agenda quando o serviço pertence
        // a uma das especialidades do médico — como o formulário faz.
        especialidade_id:
          especialidadeIds.find((id) => espPorServico.get(r.procedimentoId)?.has(id)) ?? null,
      })),
    );
    if (procErr) pendencias.push("os serviços não foram vinculados");
    else res.servicosVinculados += m.repasses.length;

    const excecoes = m.repasses.filter(repasseTemExcecao);
    if (excecoes.length) {
      const { error: convErr } = await supabase
        .from("medico_convenios")
        .insert(excecoes.map((r) => linhaRepasseIndividual(medicoId, r)));
      if (convErr) pendencias.push("os repasses por serviço não foram gravados");
      else res.excecoesGravadas += excecoes.length;
    }
  }

  // O que faltou na planilha também entra no relatório, para completar no cadastro.
  const faltas = [...m.pendencias, ...pendencias];
  if (faltas.length) res.incompletos.push({ nome: m.nome, motivo: faltas.join("; ") });
}

/** Linha de REPASSE INDIVIDUAL: em branco grava nulo (herda o padrão), 0 grava 0. */
function linhaRepasseIndividual(medicoId: string, r: RepasseConferido) {
  const tipo = r.tipoEfetivo;
  return {
    medico_id: medicoId,
    nome: r.procedimentoNome,
    tipo_repasse: tipo,
    percentual: tipo === "percentual" ? r.particular : null,
    valor: tipo === "valor" ? r.particular : null,
    convenio_tipo_repasse: r.convenio !== null ? tipo : null,
    convenio_percentual: tipo === "percentual" ? r.convenio : null,
    convenio_valor: tipo === "valor" ? r.convenio : null,
    cartao_consulta_valor: r.cartaoConsulta,
    cartao_desconto_valor: r.cartaoDesconto,
    terceiro_id: null,
    tipo_repasse_terceiro: "percentual",
    percentual_terceiro: null,
    valor_terceiro: null,
    ativo: true,
  };
}
