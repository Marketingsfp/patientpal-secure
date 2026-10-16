/**
 * Importação de beneficiários por planilha (Cartão Benefícios).
 *
 * Roda inteira no navegador, com o login de quem está usando o sistema: o
 * arquivo nunca sai da máquina do operador e todas as gravações passam pelas
 * mesmas regras de permissão (RLS) das telas normais. Não existe chave de
 * serviço envolvida.
 *
 * Ordem das etapas, propositalmente igual à da conferência:
 *   1. titulares viram pacientes (a matrícula da planilha vira o prontuário);
 *   2. cada titular ganha um contrato do convênio escolhido;
 *   3. dependentes viram pacientes;
 *   4. cada dependente é amarrado ao contrato do titular pela matrícula.
 *
 * O contrato é criado pela RPC `criar_contrato_assinatura` (mesma função da
 * tela de vendas) e o vínculo do dependente por `incluirDependenteContrato`
 * — as duas validam limite do plano, duplicidade e permissão no banco. Esta
 * tela não insere direto em `contrato_dependentes` de propósito: já houve
 * telas fazendo isso e furando a regra do plano.
 */

import { hojeBR } from "@/lib/date-utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { moduloDoProduto, rotuloProduto, type ProdutoCartao } from "@/lib/cartao/produto";
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
  Info,
  History,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/date-utils";
import { confirmDialog } from "@/lib/confirm";
import {
  concluirLote,
  ehFuncaoAusente,
  iniciarLote,
  listarLotes,
  registrarNoLote,
  reverterLote,
  type LoteImportacao,
  type ResultadoReversao,
} from "@/lib/cartao/importacao-lotes";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { mostrarErro } from "@/lib/traduzir-erro";
import { incluirDependenteContrato } from "@/lib/contrato-dependentes";
import {
  ABAS_PADRAO,
  agruparAvisos,
  fimDeVigencia,
  inicioContratoDaAba,
  lerPlanilhaBeneficiarios,
  TELEFONE_AUSENTE,
  type Aviso,
  type LinhaBeneficiario,
  type ResultadoLeitura,
} from "@/lib/importar-beneficiarios";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

const TAMANHO_MAXIMO = 15 * 1024 * 1024; // 15 MB
const LOTE_PACIENTES = 50;

type Convenio = {
  id: string;
  nome: string;
  valor_mensal: number | null;
  taxa_adesao: number | null;
  num_parcelas: number | null;
  vigencia_meses: number | null;
  max_dependentes: number | null;
};

type PacienteExistente = {
  id: string;
  nome: string;
  cpf_digits: string | null;
  codigo_prontuario: string | null;
};

/** Resultado da conferência contra o banco, antes de gravar qualquer coisa. */
type Conferencia = {
  /** matrícula -> id do paciente que já existe e será reaproveitado */
  reaproveitar: Map<string, string>;
  /** linhas que serão cadastradas do zero */
  novos: LinhaBeneficiario[];
  /** matrícula já usada por outro paciente: exige conferência manual */
  conflitos: { linha: LinhaBeneficiario; dono: PacienteExistente }[];
  observacoes: Aviso[];
};

type Etapa = {
  titulo: string;
  feitos: number;
  total: number;
};

/** "1 titular" / "324 titulares" — plural certo nos selos da tela. */
function contar(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

function pedacos<T>(itens: T[], tamanho: number): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) saida.push(itens.slice(i, i + tamanho));
  return saida;
}

function chaveNome(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function ImportarBeneficiariosPage({ produto }: { produto: ProdutoCartao }) {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const podeEscrever = usePodeEscrever(moduloDoProduto(produto));
  const clinicaId = clinicaAtual?.clinica_id ?? null;

  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [leitura, setLeitura] = useState<ResultadoLeitura | null>(null);

  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [convenioId, setConvenioId] = useState<string>("");
  const [diaVencimento, setDiaVencimento] = useState<string>("10");

  const [conferindo, setConferindo] = useState(false);
  const [conferencia, setConferencia] = useState<Conferencia | null>(null);

  const [importando, setImportando] = useState(false);
  const [etapa, setEtapa] = useState<Etapa | null>(null);
  const [relatorio, setRelatorio] = useState<string[] | null>(null);

  const [lotes, setLotes] = useState<LoteImportacao[]>([]);
  const [carregandoLotes, setCarregandoLotes] = useState(false);
  /** null = carregou; "ausente" = falta aplicar a atualização do banco; "erro" = falhou. */
  const [falhaLotes, setFalhaLotes] = useState<"ausente" | "erro" | null>(null);
  const [revertendoId, setRevertendoId] = useState<string | null>(null);
  const [bloqueio, setBloqueio] = useState<{
    lote: LoteImportacao;
    lista: ResultadoReversao["bloqueios"];
  } | null>(null);

  const convenio = useMemo(
    () => convenios.find((c) => c.id === convenioId) ?? null,
    [convenios, convenioId],
  );

  const semTitularInformado = useMemo(
    () => (leitura?.orfaos ?? []).filter((o) => o.motivo === "sem-titular-informado").length,
    [leitura],
  );
  const titularNaoEncontrado = useMemo(
    () => (leitura?.orfaos ?? []).filter((o) => o.motivo === "titular-nao-encontrado").length,
    [leitura],
  );

  /** Avisos da planilha e da conferência, juntos e agrupados por assunto. */
  const gruposDeAvisos = useMemo(
    () => agruparAvisos([...(leitura?.avisos ?? []), ...(conferencia?.observacoes ?? [])]),
    [leitura, conferencia],
  );

  // --- convênios da clínica -------------------------------------------------
  useEffect(() => {
    if (!clinicaId) return;
    let cancelado = false;
    void (async () => {
      const { data, error } = await supabase
        .from("cb_convenios")
        .select(
          "id, nome, valor_mensal, taxa_adesao, num_parcelas, vigencia_meses, max_dependentes",
        )
        .eq("clinica_id", clinicaId)
        .eq("produto", produto)
        .eq("ativo", true)
        .order("nome");
      if (cancelado) return;
      if (error) {
        mostrarErro(error, "carregar convênios");
        return;
      }
      const lista = (data ?? []) as Convenio[];
      setConvenios(lista);
      // Pré-seleciona o Cartão Consulta quando ele existe.
      const consulta = lista.find((c) => chaveNome(c.nome).includes("consulta"));
      setConvenioId((atual) => atual || consulta?.id || (lista.length === 1 ? lista[0].id : ""));
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaId]);

  // --- histórico de importações ---------------------------------------------
  const carregarLotes = useCallback(async () => {
    if (!clinicaId) return;
    setCarregandoLotes(true);
    try {
      setLotes(await listarLotes(clinicaId, produto));
      setFalhaLotes(null);
    } catch (e) {
      setLotes([]);
      setFalhaLotes(ehFuncaoAusente(e) ? "ausente" : "erro");
    } finally {
      setCarregandoLotes(false);
    }
  }, [clinicaId, produto]);

  useEffect(() => {
    void carregarLotes();
  }, [carregarLotes]);

  const desfazer = useCallback(
    async (lote: LoteImportacao) => {
      setBloqueio(null);
      setRevertendoId(lote.id);
      try {
        // Primeiro só confere: nada é apagado sem o operador ver o que sai.
        const previa = await reverterLote(lote.id, true);
        if (!previa.ok) {
          setBloqueio({ lote, lista: previa.bloqueios });
          return;
        }
        const confirmou = await confirmDialog({
          title: "Desfazer esta importação?",
          tone: "danger",
          confirmText: "Desfazer importação",
          description: (
            <span className="block space-y-2">
              <span className="block">
                Vão ser apagados os cadastros que a importação de{" "}
                <strong>{formatDateTime(lote.created_at)}</strong> criou:
              </span>
              <span className="block">
                {contar(previa.titulares, "titular", "titulares")},{" "}
                {contar(previa.dependentes, "dependente", "dependentes")},{" "}
                {contar(previa.contratos, "contrato", "contratos")} e{" "}
                {contar(previa.vinculos, "vínculo de dependente", "vínculos de dependente")}.
              </span>
              <span className="block">
                Quem já estava cadastrado antes da importação não é tocado. Não dá para voltar atrás
                — se precisar, importe a planilha de novo.
              </span>
            </span>
          ),
        });
        if (!confirmou) return;
        const feito = await reverterLote(lote.id, false);
        if (!feito.ok) {
          // Alguém usou um dos cadastros entre a conferência e o clique.
          setBloqueio({ lote, lista: feito.bloqueios });
          return;
        }
        toast.success(
          `Importação desfeita: ${contar(feito.titulares + feito.dependentes, "paciente removido", "pacientes removidos")} e ${contar(feito.contratos, "contrato removido", "contratos removidos")}.`,
        );
      } catch (e) {
        mostrarErro(e, "desfazer a importação");
      } finally {
        setRevertendoId(null);
        void carregarLotes();
      }
    },
    [carregarLotes],
  );

  // --- leitura do arquivo ---------------------------------------------------
  const receberArquivo = useCallback(async (arquivo: File) => {
    setConferencia(null);
    setRelatorio(null);
    setLeitura(null);

    if (!/\.(xlsx|xlsm|xls)$/i.test(arquivo.name)) {
      toast.error("Envie um arquivo do Excel (.xlsx).");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO) {
      toast.error("Arquivo muito grande (limite de 15 MB).");
      return;
    }

    setNomeArquivo(arquivo.name);
    setLendo(true);
    try {
      const buffer = await arquivo.arrayBuffer();
      const resultado = await lerPlanilhaBeneficiarios(buffer, ABAS_PADRAO);
      setLeitura(resultado);
      if (!resultado.linhas.length) {
        toast.error("Não encontrei nenhuma linha válida nas abas 2025 e 2026.");
      } else {
        toast.success(
          `Planilha lida: ${resultado.titulares.length} titulares e ${resultado.dependentes.length} dependentes.`,
        );
        if (resultado.orfaos.length > 0) {
          toast.warning(
            `${resultado.orfaos.length} dependentes ficaram de fora por não ter titular ` +
              `identificável na planilha. Veja "Avisos por assunto".`,
            { duration: 8000 },
          );
        }
      }
    } catch (e) {
      mostrarErro(e, "ler a planilha");
      setNomeArquivo(null);
    } finally {
      setLendo(false);
    }
  }, []);

  // --- conferência contra o banco (não grava nada) --------------------------
  const conferir = useCallback(async () => {
    if (!leitura || !clinicaId) return;
    setConferindo(true);
    setRelatorio(null);
    try {
      const alvo = [...leitura.titulares, ...leitura.dependentes];
      const matriculas = alvo.map((l) => l.matricula);
      const cpfs = alvo.map((l) => l.cpf).filter(Boolean) as string[];

      const porProntuario = new Map<string, PacienteExistente>();
      const porCpf = new Map<string, PacienteExistente>();

      for (const lote of pedacos(matriculas, 200)) {
        const { data, error } = await supabase
          .from("pacientes")
          .select("id, nome, cpf_digits, codigo_prontuario")
          .eq("clinica_id", clinicaId)
          .in("codigo_prontuario", lote);
        if (error) throw error;
        for (const p of (data ?? []) as PacienteExistente[]) {
          if (p.codigo_prontuario) porProntuario.set(p.codigo_prontuario, p);
        }
      }
      for (const lote of pedacos(cpfs, 200)) {
        const { data, error } = await supabase
          .from("pacientes")
          .select("id, nome, cpf_digits, codigo_prontuario")
          .eq("clinica_id", clinicaId)
          .in("cpf_digits", lote);
        if (error) throw error;
        for (const p of (data ?? []) as PacienteExistente[]) {
          if (p.cpf_digits) porCpf.set(p.cpf_digits, p);
        }
      }

      const reaproveitar = new Map<string, string>();
      const novos: LinhaBeneficiario[] = [];
      const conflitos: Conferencia["conflitos"] = [];
      const observacoes: Aviso[] = [];

      for (const linha of alvo) {
        const donoProntuario = porProntuario.get(linha.matricula);
        if (donoProntuario) {
          const mesmoCpf = Boolean(linha.cpf) && donoProntuario.cpf_digits === linha.cpf;
          const mesmoNome = chaveNome(donoProntuario.nome) === chaveNome(linha.nome);
          if (mesmoCpf || mesmoNome) {
            reaproveitar.set(linha.matricula, donoProntuario.id);
            observacoes.push({
              categoria: "Já cadastrado (será reaproveitado)",
              mensagem: `"${linha.nome}" já está cadastrado com o prontuário ${linha.matricula}.`,
            });
          } else {
            conflitos.push({ linha, dono: donoProntuario });
          }
          continue;
        }
        const donoCpf = linha.cpf ? porCpf.get(linha.cpf) : null;
        if (donoCpf) {
          reaproveitar.set(linha.matricula, donoCpf.id);
          observacoes.push({
            categoria: "Já cadastrado (será reaproveitado)",
            mensagem:
              `"${linha.nome}" já existe pelo CPF, com o prontuário ` +
              `${donoCpf.codigo_prontuario ?? "sem número"} — não será duplicado.`,
          });
          continue;
        }
        novos.push(linha);
      }

      // Quem vai entrar com o telefone de enchimento. Fica registrado antes de
      // gravar para a clínica saber de quem precisa correr atrás do número.
      for (const linha of novos) {
        if (linha.telefone) continue;
        observacoes.push({
          categoria: "Sem telefone na planilha",
          mensagem:
            `"${linha.nome}" (matrícula ${linha.matricula}) será cadastrado com o telefone ` +
            `${TELEFONE_AUSENTE}, que o sistema já reconhece como "sem contato". ` +
            `O número real precisa ser preenchido na ficha depois.`,
        });
      }

      setConferencia({ reaproveitar, novos, conflitos, observacoes });
      toast.success("Conferência concluída. Nada foi gravado ainda.");
    } catch (e) {
      mostrarErro(e, "conferir a planilha com o banco");
    } finally {
      setConferindo(false);
    }
  }, [leitura, clinicaId]);

  // --- importação -----------------------------------------------------------
  const importar = useCallback(async () => {
    if (!leitura || !conferencia || !clinicaId || !convenio || !user?.id) return;

    setImportando(true);
    setRelatorio(null);
    const problemas: string[] = [];
    const idPorMatricula = new Map<string, string>(conferencia.reaproveitar);
    const contratoPorMatricula = new Map<string, string>();

    // Abre o registro da importação ANTES de gravar qualquer coisa: é ele que
    // permite desfazer depois. Sem ele, a importação não começa.
    let loteId: string;
    try {
      loteId = await iniciarLote({
        clinicaId,
        produto,
        convenioId: convenio.id,
        arquivoNome: nomeArquivo ?? "planilha",
      });
    } catch (e) {
      setImportando(false);
      if (ehFuncaoAusente(e)) {
        toast.error(
          "A importação está parada até a atualização do banco ser aplicada (opção de desfazer). Nada foi gravado.",
          { duration: 10000 },
        );
      } else {
        mostrarErro(e, "iniciar a importação");
      }
      return;
    }

    /** Insere pacientes em lote; se o lote falhar, tenta um a um para não perder o resto. */
    const gravarPacientes = async (
      linhas: LinhaBeneficiario[],
      titulo: string,
      tipo: "titular" | "dependente",
    ) => {
      setEtapa({ titulo, feitos: 0, total: linhas.length });
      let feitos = 0;
      for (const lote of pedacos(linhas, LOTE_PACIENTES)) {
        const criados: string[] = [];
        const registros = lote.map((l) => ({
          clinica_id: clinicaId,
          nome: l.nome,
          cpf: l.cpf,
          // O banco recusa paciente novo sem telefone de 10 dígitos. Quando a
          // planilha não traz um número usável, entra o marcador de telefone
          // ausente — senão o cadastro simplesmente não existe, que é pior.
          telefone: l.telefone ?? TELEFONE_AUSENTE,
          data_nascimento: l.nascimento,
          sexo: l.sexo,
          codigo_prontuario: l.matricula,
          ativo: true,
        }));
        const { data, error } = await supabase
          .from("pacientes")
          .insert(registros as never)
          .select("id, codigo_prontuario");
        if (!error) {
          for (const p of (data ?? []) as PacienteExistente[]) {
            criados.push(p.id);
            if (p.codigo_prontuario) idPorMatricula.set(p.codigo_prontuario, p.id);
          }
        } else {
          for (let i = 0; i < lote.length; i++) {
            const { data: um, error: erroUm } = await supabase
              .from("pacientes")
              .insert(registros[i] as never)
              .select("id, codigo_prontuario")
              .single();
            if (erroUm) {
              problemas.push(
                `Não cadastrou "${lote[i].nome}" (matrícula ${lote[i].matricula}): ${
                  (erroUm as { message?: string }).message ?? "erro no banco"
                }`,
              );
            } else if (um) {
              const p = um as PacienteExistente;
              criados.push(p.id);
              if (p.codigo_prontuario) idPorMatricula.set(p.codigo_prontuario, p.id);
            }
          }
        }
        // Se a anotação falhar, a importação para aqui: seguir gravando
        // cadastros que o "Desfazer" não enxerga é exatamente o que não pode.
        await registrarNoLote(loteId, tipo, criados);
        feitos += lote.length;
        setEtapa({ titulo, feitos, total: linhas.length });
      }
    };

    try {
      const novosPorMatricula = new Set(conferencia.novos.map((l) => l.matricula));
      const titularesImportaveis = leitura.titulares.filter(
        (t) => novosPorMatricula.has(t.matricula) || idPorMatricula.has(t.matricula),
      );

      // ETAPA 1 — titulares viram pacientes
      await gravarPacientes(
        leitura.titulares.filter((t) => novosPorMatricula.has(t.matricula)),
        "1 de 4 — cadastrando titulares",
        "titular",
      );

      // ETAPA 2 — contrato do plano para cada titular
      const hoje = hojeBR();
      const dia = Math.min(28, Math.max(1, Number(diaVencimento) || 10));
      const vigencia = Number(convenio.vigencia_meses) || 12;
      const parcelas = Number(convenio.num_parcelas) || 12;

      setEtapa({
        titulo: "2 de 4 — vinculando o plano",
        feitos: 0,
        total: titularesImportaveis.length,
      });
      let contratosFeitos = 0;
      for (const titular of titularesImportaveis) {
        const pacienteId = idPorMatricula.get(titular.matricula);
        contratosFeitos++;
        setEtapa({
          titulo: "2 de 4 — vinculando o plano",
          feitos: contratosFeitos,
          total: titularesImportaveis.length,
        });
        if (!pacienteId) continue;

        // Reaproveita contrato ativo que já exista para este titular.
        const { data: jaTem } = await supabase
          .from("contratos_assinatura")
          .select("id")
          .eq("clinica_id", clinicaId)
          .eq("paciente_id", pacienteId)
          .eq("status", "ativo")
          .maybeSingle();
        if (jaTem?.id) {
          contratoPorMatricula.set(titular.matricula, jaTem.id as string);
          continue;
        }

        const inicio = inicioContratoDaAba(titular.aba, hoje);
        const { data: criado, error } = await (
          supabase.rpc as unknown as (
            fn: string,
            args: Record<string, unknown>,
          ) => Promise<{ data: unknown; error: unknown }>
        )("criar_contrato_assinatura", {
          _clinica_id: clinicaId,
          _convenio_id: convenio.id,
          _paciente_id: pacienteId,
          _paciente_nome: titular.nome,
          _data_inicio: inicio,
          _data_fim: fimDeVigencia(inicio, vigencia),
          _dia_vencimento: dia,
          _valor_mensal: Number(convenio.valor_mensal) || 0,
          _taxa_adesao: 0,
          _num_parcelas: parcelas,
          _forma_pagamento: null,
          _observacoes: `Importado de planilha (aba ${titular.aba}) — matrícula ${titular.matricula}`,
          _criado_por: user.id,
          _dependentes: [],
          // Importação de base já existente não gera cobrança: as mensalidades
          // são lançadas depois, pela tela de contratos, com os valores reais.
          _mensalidades: [],
        });
        if (error) {
          problemas.push(
            `Contrato de "${titular.nome}" não foi criado: ${
              (error as { message?: string }).message ?? "erro no banco"
            }`,
          );
          continue;
        }
        const contrato = criado as { id?: string } | null;
        if (contrato?.id) {
          await registrarNoLote(loteId, "contrato", [contrato.id]);
          contratoPorMatricula.set(titular.matricula, contrato.id);
        }
      }

      // ETAPA 3 — dependentes viram pacientes
      await gravarPacientes(
        leitura.dependentes.filter((d) => novosPorMatricula.has(d.matricula)),
        "3 de 4 — cadastrando dependentes",
        "dependente",
      );

      // ETAPA 4 — amarra cada dependente ao contrato do titular
      const vinculaveis = leitura.dependentes.filter((d) => idPorMatricula.has(d.matricula));
      setEtapa({
        titulo: "4 de 4 — vinculando dependentes",
        feitos: 0,
        total: vinculaveis.length,
      });
      let vinculados = 0;
      let vinculadosOk = 0;
      for (const dep of vinculaveis) {
        vinculados++;
        setEtapa({
          titulo: "4 de 4 — vinculando dependentes",
          feitos: vinculados,
          total: vinculaveis.length,
        });
        const pacienteId = idPorMatricula.get(dep.matricula);
        const contratoId = dep.matriculaTitular
          ? contratoPorMatricula.get(dep.matriculaTitular)
          : null;
        if (!pacienteId) continue;
        if (!contratoId) {
          problemas.push(
            `"${dep.nome}" foi cadastrado como paciente, mas não achei o contrato do titular ${
              dep.matriculaTitular ?? "(matrícula vazia)"
            } para vincular.`,
          );
          continue;
        }
        // `confirmarVinculoDuplicado: true`: aqui não há operador para
        // responder a pergunta, e travar a planilha no meio seria pior. O
        // vínculo é criado e a duplicidade sai no relatório de pendências,
        // para alguém resolver depois — foi assim que os cadastros duplicados
        // entraram sem ninguém ver.
        const resultado = await incluirDependenteContrato({
          contratoId,
          pacienteId,
          pacienteNome: dep.nome,
          tipo: "dependente",
          confirmarVinculoDuplicado: true,
        });
        if (resultado.ok) {
          await registrarNoLote(loteId, "vinculo", [resultado.dependente.id]);
          vinculadosOk++;
          if (resultado.avisoVinculoDuplicado) {
            problemas.push(
              `"${dep.nome}" foi vinculado, MAS já estava em outro cartão ativo. ` +
                `${resultado.avisoVinculoDuplicado.replace(/\n+/g, " ")} ` +
                `Confira e remova o vínculo que não valer mais.`,
            );
          }
        } else problemas.push(`"${dep.nome}": ${resultado.mensagem}`);
      }

      setEtapa(null);
      setRelatorio(problemas);
      if (problemas.length === 0) {
        toast.success(
          `Importação concluída: ${contratoPorMatricula.size} titulares com plano e ${vinculadosOk} dependentes vinculados.`,
        );
      } else {
        toast.warning(
          `Importação concluída com ${problemas.length} pendência(s). Veja a lista abaixo.`,
          { duration: 10000 },
        );
      }
      // Força uma nova conferência antes de qualquer reenvio.
      setConferencia(null);
    } catch (e) {
      setEtapa(null);
      setRelatorio(problemas);
      mostrarErro(e, "importar a planilha");
    } finally {
      // Fecha o registro mesmo se parou no meio: o que entrou até ali já pode
      // ser desfeito pelo histórico.
      try {
        await concluirLote(loteId, problemas.length);
      } catch {
        // Sem fechar, o histórico libera o desfazer sozinho depois de 10 minutos.
      }
      setImportando(false);
      void carregarLotes();
    }
  }, [
    leitura,
    conferencia,
    clinicaId,
    convenio,
    user,
    diaVencimento,
    produto,
    nomeArquivo,
    carregarLotes,
  ]);

  // --- tela -----------------------------------------------------------------
  if (!podeEscrever) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Sem permissão</AlertTitle>
        <AlertDescription>
          Só quem tem permissão de escrita no {rotuloProduto(produto)} pode importar planilhas.
        </AlertDescription>
      </Alert>
    );
  }

  const titularesNovos = (conferencia?.novos ?? []).filter((l) => l.tipo === "titular").length;
  const dependentesNovos = (conferencia?.novos ?? []).filter((l) => l.tipo === "dependente").length;
  // Erro = linha que não vai entrar: matrícula de outro paciente ou dependente sem titular.
  const totalErros = (conferencia?.conflitos.length ?? 0) + (leitura?.orfaos.length ?? 0);
  const novosSemTelefone = (conferencia?.novos ?? []).filter((l) => !l.telefone).length;
  const podeImportar =
    Boolean(conferencia) && Boolean(convenio) && !importando && !conferindo && Boolean(user?.id);

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Como funciona</AlertTitle>
        <AlertDescription className="text-sm">
          A planilha é lida aqui no seu navegador, com o seu login — o arquivo não é enviado para
          servidor nenhum. São lidas as abas <strong>2025</strong> e <strong>2026</strong>, e a
          linha do cabeçalho é procurada em cada aba separadamente (elas não começam na mesma
          altura). A coluna <strong>Matrícula</strong> vira o número de prontuário do paciente.
          Dependente sem titular identificável fica de fora e é listado nos avisos. Rodar duas vezes
          não duplica: quem já existe é reaproveitado. Se a planilha errada for importada, o gestor
          da unidade desfaz pelo quadro <strong>Importações recentes</strong>, no fim da página.
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
              {nomeArquivo ?? "Arraste o UNIMED_MJ.xlsx aqui ou clique para escolher"}
            </p>
            <p className="text-xs text-muted-foreground">Arquivos .xlsx até 15 MB</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.xls"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) void receberArquivo(arquivo);
              e.target.value = "";
            }}
          />

          {leitura && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {contar(leitura.titulares.length, "titular", "titulares")}
                </Badge>
                <Badge variant="secondary">
                  {contar(leitura.dependentes.length, "dependente", "dependentes")}
                </Badge>
                {leitura.orfaos.length > 0 && (
                  <Badge variant="outline" className="border-amber-500 text-amber-700">
                    {contar(leitura.orfaos.length, "dependente ignorado", "dependentes ignorados")}
                  </Badge>
                )}
                {leitura.avisos.length > 0 && (
                  <Badge variant="outline">
                    {contar(leitura.avisos.length, "aviso", "avisos")}
                  </Badge>
                )}
              </div>

              {leitura.orfaos.length > 0 && (
                <p className="text-xs text-amber-700">
                  Ignorados porque não dá para dizer de quem são dependentes: {semTitularInformado}{" "}
                  sem a Matrícula Titular preenchida na planilha e {titularNaoEncontrado} apontando
                  para uma matrícula que não existe entre os titulares. O resto da importação segue
                  normalmente.
                </p>
              )}

              {leitura.abas.map((aba) => (
                <p key={aba.nome} className="text-xs text-muted-foreground">
                  Aba <strong>{aba.nome}</strong>:{" "}
                  {aba.linhaCabecalho
                    ? `cabeçalho encontrado na linha ${aba.linhaCabecalho}, ${aba.linhas} linhas de dados. Colunas reconhecidas: `
                    : "não achei a linha de cabeçalho. "}
                  {aba.linhaCabecalho &&
                    Object.entries(aba.colunas)
                      .map(([rotulo, achada]) => `${rotulo} → ${achada ?? "não encontrada"}`)
                      .join(" | ")}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Plano */}
      {leitura && leitura.linhas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Plano que será vinculado</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Convênio</Label>
              <Select value={convenioId} onValueChange={setConvenioId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o convênio" />
                </SelectTrigger>
                <SelectContent>
                  {convenios.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {convenio && (
                <p className="text-xs text-muted-foreground">
                  Mensalidade R$ {Number(convenio.valor_mensal ?? 0).toFixed(2)} · vigência{" "}
                  {convenio.vigencia_meses ?? 12} meses · até {convenio.max_dependentes ?? 0}{" "}
                  dependentes por contrato.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="dia-venc">Dia de vencimento</Label>
              <Select value={diaVencimento} onValueChange={setDiaVencimento}>
                <SelectTrigger id="dia-venc">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => String(i + 1)).map((d) => (
                    <SelectItem key={d} value={d}>
                      Dia {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O contrato começa em 1º de janeiro do ano da aba (aba 2025 → 01/01/2025). As
                mensalidades <strong>não</strong> são geradas nesta importação.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Conferência */}
      {leitura && leitura.linhas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Conferir antes de gravar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => void conferir()} disabled={conferindo || importando}>
              {conferindo ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Conferindo…
                </>
              ) : (
                "Conferir com o banco (não grava nada)"
              )}
            </Button>

            {conferencia && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {contar(titularesNovos, "titular novo", "titulares novos")}
                  </Badge>
                  <Badge variant="secondary">
                    {contar(dependentesNovos, "dependente novo", "dependentes novos")}
                  </Badge>
                  <Badge variant="secondary">
                    {conferencia.reaproveitar.size} já existem (serão reaproveitados)
                  </Badge>
                  <Badge variant={totalErros > 0 ? "destructive" : "outline"}>
                    {totalErros === 0
                      ? "Nenhum erro"
                      : contar(totalErros, "erro (fica de fora)", "erros (ficam de fora)")}
                  </Badge>
                  {conferencia.conflitos.length > 0 && (
                    <Badge variant="destructive">
                      {conferencia.conflitos.length} conflitos de prontuário
                    </Badge>
                  )}
                  {novosSemTelefone > 0 && (
                    <Badge variant="outline" className="border-amber-500 text-amber-700">
                      {contar(novosSemTelefone, "sem telefone", "sem telefone")}
                    </Badge>
                  )}
                </div>

                {novosSemTelefone > 0 && (
                  <p className="text-xs text-amber-700">
                    {novosSemTelefone} desses cadastros entram com o telefone {TELEFONE_AUSENTE},
                    porque o banco não aceita paciente novo sem telefone. O sistema já trata esse
                    número como "sem contato", então ele não vira destino de campanha — mas o número
                    real precisa ser preenchido na ficha depois. A lista com os nomes está em
                    "Avisos por assunto".
                  </p>
                )}

                {conferencia.conflitos.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Matrículas já usadas por outro paciente</AlertTitle>
                    <AlertDescription>
                      <p className="mb-2 text-sm">
                        Essas linhas <strong>não</strong> serão importadas, para não trocar o
                        prontuário de quem já está cadastrado. Confira uma a uma.
                      </p>
                      <div className="max-h-56 overflow-auto rounded border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Matrícula</TableHead>
                              <TableHead>Na planilha</TableHead>
                              <TableHead>No sistema</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {conferencia.conflitos.map((c) => (
                              <TableRow key={`${c.linha.aba}-${c.linha.linhaExcel}`}>
                                <TableCell className="font-mono text-xs">
                                  {c.linha.matricula}
                                </TableCell>
                                <TableCell className="text-xs">{c.linha.nome}</TableCell>
                                <TableCell className="text-xs">{c.dono.nome}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {gruposDeAvisos.length > 0 && (
              <div className="space-y-2 rounded border p-3">
                <p className="text-sm font-medium">Avisos por assunto</p>
                {gruposDeAvisos.map((grupo) => (
                  <details key={grupo.categoria} className="text-sm">
                    <summary className="cursor-pointer">
                      {grupo.categoria}{" "}
                      <span className="text-muted-foreground">
                        ({contar(grupo.quantidade, "caso", "casos")})
                      </span>
                    </summary>
                    <ul className="mt-1 max-h-56 list-disc space-y-1 overflow-auto pl-5 text-xs text-muted-foreground">
                      {grupo.mensagens.map((mensagem, i) => (
                        <li key={i}>{mensagem}</li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 4. Importar */}
      {conferencia && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Importar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {etapa && (
              <div className="space-y-1">
                <p className="text-sm font-medium">{etapa.titulo}</p>
                <Progress value={etapa.total ? (etapa.feitos / etapa.total) * 100 : 0} />
                <p className="text-xs text-muted-foreground">
                  {etapa.feitos} de {etapa.total}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void importar()} disabled={!podeImportar}>
                {importando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando…
                  </>
                ) : (
                  "Importar agora"
                )}
              </Button>
              <Button
                variant="outline"
                disabled={importando}
                onClick={() => {
                  setLeitura(null);
                  setConferencia(null);
                  setRelatorio(null);
                  setNomeArquivo(null);
                }}
              >
                <X className="mr-2 h-4 w-4" /> Limpar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Não feche esta aba durante a importação. Se algo falhar no meio, pode rodar de novo:
              quem já entrou não é duplicado.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Relatório final */}
      {relatorio && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {relatorio.length === 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" /> Importação concluída sem
                  pendências
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> Pendências (
                  {relatorio.length})
                </>
              )}
            </CardTitle>
          </CardHeader>
          {relatorio.length > 0 && (
            <CardContent>
              <ul className="max-h-80 list-disc space-y-1 overflow-auto pl-5 text-xs">
                {relatorio.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> Importações recentes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bloqueio && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Esta importação não pode ser desfeita</AlertTitle>
              <AlertDescription>
                <p className="mb-2 text-sm">
                  Depois da importação de {formatDateTime(bloqueio.lote.created_at)}, alguns desses
                  cadastros já foram usados no sistema. Para não apagar agenda, financeiro ou ficha
                  de ninguém, nada foi removido. Quem está nessa situação:
                </p>
                <ul className="max-h-56 list-disc space-y-1 overflow-auto pl-5 text-xs">
                  {bloqueio.lista.map((b, i) => (
                    <li key={i}>
                      <strong>{b.nome}</strong> — {b.onde}
                    </li>
                  ))}
                </ul>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setBloqueio(null)}
                >
                  Fechar
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {carregandoLotes && lotes.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          ) : falhaLotes === "ausente" ? (
            <p className="text-sm text-muted-foreground">
              O histórico e a opção de desfazer aparecem depois que a atualização do banco for
              aplicada.
            </p>
          ) : falhaLotes === "erro" ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              Não foi possível carregar o histórico.
              <Button variant="outline" size="sm" onClick={() => void carregarLotes()}>
                Tentar de novo
              </Button>
            </div>
          ) : lotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma importação registrada ainda. As importações feitas antes desta opção existir
              não aparecem aqui.
            </p>
          ) : (
            <div className="overflow-x-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Planilha</TableHead>
                    <TableHead>O que entrou</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lotes.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDateTime(l.created_at)}
                        <span className="block text-muted-foreground">
                          {l.criado_por_nome ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.arquivo_nome}
                        {l.convenio_nome && (
                          <span className="block text-muted-foreground">{l.convenio_nome}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.status === "revertido" && l.removidos ? (
                          <span className="text-muted-foreground">
                            Removidos: {contar(l.removidos.titulares, "titular", "titulares")},{" "}
                            {contar(l.removidos.dependentes, "dependente", "dependentes")},{" "}
                            {contar(l.removidos.contratos, "contrato", "contratos")}
                          </span>
                        ) : (
                          <>
                            {contar(l.titulares, "titular novo", "titulares novos")},{" "}
                            {contar(l.dependentes, "dependente novo", "dependentes novos")},{" "}
                            {contar(l.contratos, "contrato", "contratos")},{" "}
                            {contar(l.vinculos, "vínculo", "vínculos")}
                            {l.pendencias > 0 && (
                              <span className="block text-amber-700">
                                {contar(l.pendencias, "pendência", "pendências")}
                              </span>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.status === "revertido" ? (
                          <Badge variant="outline">
                            Desfeita em {formatDateTime(l.revertido_em)}
                            {l.revertido_por_nome ? ` por ${l.revertido_por_nome}` : ""}
                          </Badge>
                        ) : l.status === "em_andamento" ? (
                          <Badge variant="outline" className="border-amber-500 text-amber-700">
                            Não terminou
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Concluída</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {l.status !== "revertido" &&
                          (l.pode_desfazer ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={importando || revertendoId !== null}
                              onClick={() => void desfazer(l)}
                            >
                              {revertendoId === l.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Undo2 className="mr-2 h-4 w-4" />
                              )}
                              Desfazer importação
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Só o gestor desfaz
                            </span>
                          ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
