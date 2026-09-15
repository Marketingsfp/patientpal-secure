/**
 * Importação de serviços por planilha (Catálogo de Serviços).
 *
 * Roda inteira no navegador, com o login de quem está usando o sistema: o
 * arquivo nunca sai da máquina e todas as gravações passam pelas mesmas
 * regras de permissão (RLS) das telas normais.
 *
 * A gravação usa exatamente o mesmo mapeamento de colunas do formulário de
 * serviço, para o serviço importado ficar idêntico a um cadastrado à mão.
 * A clínica é sempre a clínica aberta na tela — nunca vem da planilha. Se a
 * planilha tiver coluna Unidade, só entram as linhas da clínica aberta.
 * Esta tela só cria ou atualiza; nunca apaga nada.
 *
 * Repasse: o sistema paga pela grade de cada médico, não pelo serviço. O
 * repasse da planilha é aplicado num passo separado ("Repasse aos médicos"),
 * nos médicos que já atendem cada serviço, sem sobrescrever acordo existente.
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
  chaveNomeServico,
  lerPlanilhaServicos,
  type LinhaRecusada,
  type LinhaServico,
  type RepasseDoServico,
  type ResultadoLeituraServicos,
} from "@/lib/importar-servicos";
import {
  camposDaGrade,
  planejarRepasseServicos,
  type LinhaGradeExistente,
  type PlanoRepasse,
  type RegraDoServico,
  type VinculoMedicoServico,
} from "@/lib/repasse-por-servico";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/procedimentos_/importar")({
  component: ImportarServicosPage,
  head: () => ({
    meta: [
      { title: "Importar serviços por planilha — Catálogo de Serviços" },
      {
        name: "description",
        content:
          "Suba a tabela oficial de serviços da clínica por planilha, confira linha a linha e grave sem duplicar o que já existe.",
      },
      { property: "og:title", content: "Importar serviços por planilha" },
      {
        property: "og:description",
        content: "Conferência antes de gravar: novos, já existentes e linhas com problema.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TAMANHO_MAXIMO = 15 * 1024 * 1024; // 15 MB
const LOTE = 200;

type ServicoExistente = { id: string; nome: string };

type Resultado = {
  criados: number;
  atualizados: number;
  pulados: number;
  especialidadesCriadas: number;
  problemas: LinhaRecusada[];
};

const fmtBRL = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtRepasse = (r: RepasseDoServico | null) =>
  !r ? "—" : r.tipo === "valor" ? fmtBRL(r.valor) : `${String(r.valor).replace(".", ",")}%`;

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

function pedacos<T>(itens: T[], tamanho: number): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) saida.push(itens.slice(i, i + tamanho));
  return saida;
}

/** Mesmo mapeamento de colunas que o formulário de serviço usa ao salvar. */
function montarPayload(l: LinhaServico, clinicaId: string) {
  return {
    clinica_id: clinicaId,
    nome: l.nome,
    grupo: l.especialidade,
    tipo: l.categoria,
    codigo: l.codigo,
    valor_padrao: l.valorDinheiro,
    valor_dinheiro: l.valorDinheiro,
    valor_dinheiro_pix: l.valorDinheiro,
    valor_pix: l.valorCartao,
    valor_cartao_credito: l.valorCartao,
    valor_cartao_debito: l.valorCartao,
    valor_cartao: l.valorCartao,
    valor_cartao_consulta: l.valorCartaoConsulta,
    valor_cartao_desconto: l.valorCartaoDesconto,
    duracao_minutos: l.duracaoMinutos,
    preparo: l.preparo,
    ativo: l.ativo,
    fluxo_atendimento: "consulta_medica",
    agenda_obrigatoria: true,
    medico_obrigatorio: false,
    sala_obrigatoria: false,
    equipamento_obrigatorio: false,
    permite_venda_direta: false,
    permite_encaixe: true,
    tempo_padrao_min: l.duracaoMinutos,
    valor_variavel: false,
    sessoes_incluidas: null,
    ciclo_dias: null,
  };
}

function ImportarServicosPage() {
  const navigate = useNavigate();
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("procedimentos");
  const clinicaId = clinicaAtual?.clinica_id ?? null;

  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [leitura, setLeitura] = useState<ResultadoLeituraServicos | null>(null);

  const [existentes, setExistentes] = useState<ServicoExistente[]>([]);
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(false);

  const [criarEspecialidades, setCriarEspecialidades] = useState(false);
  const [quandoExiste, setQuandoExiste] = useState<"pular" | "atualizar">("pular");

  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [versaoCatalogo, setVersaoCatalogo] = useState(0);

  const [plano, setPlano] = useState<PlanoRepasse | null>(null);
  const [conferindoRepasse, setConferindoRepasse] = useState(false);
  const [aplicandoRepasse, setAplicandoRepasse] = useState(false);
  const [repasseAplicado, setRepasseAplicado] = useState<{
    gravados: number;
    falhas: number;
  } | null>(null);

  // --- catálogo atual da clínica -------------------------------------------
  useEffect(() => {
    if (!clinicaId) return;
    let cancelado = false;
    setCarregandoCatalogo(true);
    void (async () => {
      const todos: ServicoExistente[] = [];
      let de = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("procedimentos")
          .select("id,nome")
          .eq("clinica_id", clinicaId)
          .order("nome")
          .range(de, de + 999);
        if (error) {
          if (!cancelado) mostrarErro(error, "carregar os serviços já cadastrados");
          break;
        }
        const lote = (data ?? []) as ServicoExistente[];
        todos.push(...lote);
        if (lote.length < 1000) break;
        de += 1000;
      }
      const { data: esp } = await supabase.from("especialidades").select("nome");
      if (cancelado) return;
      setExistentes(todos);
      setEspecialidades((esp ?? []).map((e: { nome: string }) => e.nome));
      setCarregandoCatalogo(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaId, versaoCatalogo]);

  const mapaExistentes = useMemo(() => {
    const m = new Map<string, ServicoExistente>();
    for (const s of existentes) {
      const k = chaveNomeServico(s.nome);
      if (k && !m.has(k)) m.set(k, s);
    }
    return m;
  }, [existentes]);

  const novas = useMemo(
    () => (leitura?.linhas ?? []).filter((l) => !mapaExistentes.has(chaveNomeServico(l.nome))),
    [leitura, mapaExistentes],
  );
  const jaExistem = useMemo(
    () => (leitura?.linhas ?? []).filter((l) => mapaExistentes.has(chaveNomeServico(l.nome))),
    [leitura, mapaExistentes],
  );

  const faltamEspecialidades = useMemo(() => {
    if (!leitura) return [] as string[];
    const cadastradas = new Set(especialidades.map(chaveNomeServico));
    return leitura.especialidadesNovas.filter((n) => !cadastradas.has(chaveNomeServico(n)));
  }, [leitura, especialidades]);

  const comRepasse = useMemo(
    () => (leitura?.linhas ?? []).filter((l) => l.repasse !== null),
    [leitura],
  );
  const comTerceirizado = useMemo(
    () => (leitura?.linhas ?? []).filter((l) => l.valorTerceirizado !== null),
    [leitura],
  );

  /** Regras de repasse ligadas ao serviço do catálogo (só as que já existem nele). */
  const regrasDoCatalogo = useMemo(() => {
    const regras: RegraDoServico[] = [];
    for (const l of comRepasse) {
      const alvo = mapaExistentes.get(chaveNomeServico(l.nome));
      if (!alvo || !l.repasse) continue;
      regras.push({ procedimentoId: alvo.id, procedimentoNome: alvo.nome, repasse: l.repasse });
    }
    return regras;
  }, [comRepasse, mapaExistentes]);

  // O plano vale para a planilha e o catálogo em que foi calculado.
  useEffect(() => {
    setPlano(null);
  }, [leitura, clinicaId, regrasDoCatalogo]);

  // --- arquivo --------------------------------------------------------------
  const receberArquivo = useCallback(
    async (arquivo: File) => {
      setResultado(null);
      if (arquivo.size > TAMANHO_MAXIMO) {
        toast.error("A planilha passa de 15 MB. Divida em partes menores.");
        return;
      }
      if (!/\.(xlsx|xlsm|xls|csv)$/i.test(arquivo.name)) {
        toast.error("Envie um arquivo de planilha (.xlsx, .xls ou .csv).");
        return;
      }
      setLendo(true);
      setNomeArquivo(arquivo.name);
      try {
        const buffer = await arquivo.arrayBuffer();
        const lida = await lerPlanilhaServicos(buffer, {
          nomeArquivo: arquivo.name,
          especialidadesExistentes: especialidades,
          nomeClinica: clinicaAtual?.clinica.nome ?? undefined,
        });
        if (!lida.linhas.length && !lida.recusadas.length) {
          toast.error(
            lida.outrasUnidades.linhas
              ? `Nenhuma linha desta planilha é de ${clinicaAtual?.clinica.nome ?? "esta clínica"}. Unidades encontradas: ${lida.outrasUnidades.nomes.join(", ")}.`
              : "Não consegui achar a tabela nesta planilha. Confira se existe uma linha de cabeçalho com a coluna Nome (ou Item).",
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
    [especialidades, clinicaAtual],
  );

  const baixarModelo = () => {
    exportToExcel(
      [
        {
          nome: "CONSULTA CARDIOLOGIA",
          grupo: "CARDIOLOGIA",
          tipo: "Consulta",
          codigo: "C01",
          dinheiro: "150,00",
          cartao: "170,00",
          cartaoConsulta: "0,00",
          cartaoDesconto: "0,00",
          duracao: 20,
          preparo: "Trazer exames anteriores",
          ativo: "Sim",
          repasse: "70,00",
        },
        {
          nome: "ULTRASSONOGRAFIA ABDOMINAL TOTAL",
          grupo: "ULTRASSONOGRAFIA",
          tipo: "Exame",
          codigo: "",
          dinheiro: "120,00",
          cartao: "140,00",
          cartaoConsulta: "0,00",
          cartaoDesconto: "0,00",
          duracao: 30,
          preparo: "Jejum de 6 horas",
          ativo: "Sim",
          repasse: "",
        },
      ],
      "modelo-servicos",
      [
        { key: "nome", label: "Nome" },
        { key: "grupo", label: "Especialidade" },
        { key: "tipo", label: "Categoria" },
        { key: "codigo", label: "Código" },
        { key: "dinheiro", label: "Dinheiro (R$)" },
        { key: "cartao", label: "Cartão (R$)" },
        { key: "cartaoConsulta", label: "Cartão Consulta (R$)" },
        { key: "cartaoDesconto", label: "Cartão Desconto (R$)" },
        { key: "duracao", label: "Duração (min)" },
        { key: "preparo", label: "Preparo" },
        { key: "ativo", label: "Ativo" },
        { key: "repasse", label: "Repasse" },
      ],
    );
  };

  const baixarTerceirizados = () => {
    exportToExcel(
      comTerceirizado.map((l) => ({
        nome: l.nome,
        valor: fmtBRL(l.valorDinheiro),
        terceirizado: fmtBRL(l.valorTerceirizado ?? 0),
        repasse: fmtRepasse(l.repasse),
      })),
      "servicos-com-terceirizado",
      [
        { key: "nome", label: "Serviço" },
        { key: "valor", label: "Valor" },
        { key: "terceirizado", label: "Terceirizado" },
        { key: "repasse", label: "Repasse do médico" },
      ],
    );
  };

  const baixarMantidos = (p: PlanoRepasse) => {
    exportToExcel(
      p.mantidos.map((m) => ({
        medico: m.medicoNome,
        servico: m.procedimentoNome,
        atual: m.atual,
        planilha: fmtRepasse(m.repasse),
      })),
      "repasses-mantidos",
      [
        { key: "medico", label: "Médico" },
        { key: "servico", label: "Serviço" },
        { key: "atual", label: "Acordo atual (mantido)" },
        { key: "planilha", label: "Valor da planilha (não aplicado)" },
      ],
    );
  };

  // --- repasse aos médicos --------------------------------------------------
  const conferirRepasse = useCallback(async () => {
    if (!clinicaId) return;
    setConferindoRepasse(true);
    setRepasseAplicado(null);
    try {
      const vinculosBrutos = await buscarPaginado<{
        medico_id: string;
        procedimento_id: string;
        medicos: { nome: string } | null;
      }>((de, ate) =>
        supabase
          .from("medico_procedimentos")
          .select("medico_id, procedimento_id, medicos!inner(nome, clinica_id)")
          .eq("medicos.clinica_id", clinicaId)
          .order("id")
          .range(de, ate),
      );
      const gradeBruta = await buscarPaginado<
        Omit<LinhaGradeExistente, "medicoId"> & { medico_id: string }
      >((de, ate) =>
        supabase
          .from("medico_convenios")
          .select(
            "id, medico_id, nome, percentual, valor, convenio_percentual, convenio_valor, cartao_consulta_valor, cartao_desconto_valor, medicos!inner(clinica_id)",
          )
          .eq("medicos.clinica_id", clinicaId)
          .order("id")
          .range(de, ate),
      );
      const vinculos: VinculoMedicoServico[] = vinculosBrutos.map((v) => ({
        medicoId: v.medico_id,
        medicoNome: v.medicos?.nome ?? "",
        procedimentoId: v.procedimento_id,
      }));
      const grade: LinhaGradeExistente[] = gradeBruta.map((g) => ({ ...g, medicoId: g.medico_id }));
      setPlano(planejarRepasseServicos(regrasDoCatalogo, vinculos, grade));
    } catch (e) {
      mostrarErro(e, "conferir os médicos de cada serviço");
    } finally {
      setConferindoRepasse(false);
    }
  }, [clinicaId, regrasDoCatalogo]);

  const aplicarRepasse = useCallback(async () => {
    if (!plano || !clinicaAtual) return;
    const total = plano.inserir.length + plano.atualizar.length;
    if (!total) return;
    const ok = await confirmDialog({
      title: "Aplicar repasse aos médicos",
      description: `Vou gravar ${total} repasse(s) na grade dos médicos de ${clinicaAtual.clinica.nome ?? "esta clínica"}. ${plano.mantidos.length} acordo(s) que os médicos já têm continuam como estão.`,
      confirmText: "Aplicar",
    });
    if (!ok) return;

    setAplicandoRepasse(true);
    let gravados = 0;
    let falhas = 0;
    try {
      for (const lote of pedacos(plano.inserir, LOTE)) {
        const { error } = await supabase.from("medico_convenios").insert(
          lote.map((i) => ({
            medico_id: i.medicoId,
            nome: i.procedimentoNome,
            ...camposDaGrade(i.repasse),
            // Convênio e cartões em branco: seguem o repasse padrão do médico.
            convenio_tipo_repasse: null,
            convenio_percentual: null,
            convenio_valor: null,
            cartao_consulta_valor: null,
            cartao_desconto_valor: null,
            terceiro_id: null,
            tipo_repasse_terceiro: "percentual",
            percentual_terceiro: null,
            valor_terceiro: null,
            ativo: true,
          })),
        );
        if (error) falhas += lote.length;
        else gravados += lote.length;
      }
      for (const a of plano.atualizar) {
        const { error } = await supabase
          .from("medico_convenios")
          .update(camposDaGrade(a.repasse))
          .eq("id", a.linhaId);
        if (error) falhas += 1;
        else gravados += 1;
      }
      invalidateAgendaRefs(clinicaAtual.clinica_id);
      setRepasseAplicado({ gravados, falhas });
      if (falhas) toast.error(`${falhas} repasse(s) não foram gravados.`);
      else toast.success("Repasse aplicado aos médicos.");
    } catch (e) {
      mostrarErro(e, "aplicar o repasse aos médicos");
    } finally {
      setAplicandoRepasse(false);
      setPlano(null);
    }
  }, [plano, clinicaAtual]);

  const baixarProblemas = (linhas: LinhaRecusada[]) => {
    exportToExcel(
      linhas.map((r) => ({ linha: r.linhaExcel, nome: r.nome, motivo: r.motivo })),
      "linhas-com-erro",
      [
        { key: "linha", label: "Linha da planilha" },
        { key: "nome", label: "Nome" },
        { key: "motivo", label: "Motivo" },
      ],
    );
  };

  // --- gravação -------------------------------------------------------------
  const importar = useCallback(async () => {
    if (!clinicaId || !clinicaAtual || !leitura) return;
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }

    const totalCriar = novas.length;
    const totalAtualizar = quandoExiste === "atualizar" ? jaExistem.length : 0;
    if (!totalCriar && !totalAtualizar) {
      toast.info("Não há nada para gravar com as opções escolhidas.");
      return;
    }

    const ok = await confirmDialog({
      title: "Confirmar importação",
      description: `Vou cadastrar ${totalCriar} serviço(s) novo(s) e atualizar ${totalAtualizar} já existente(s) em ${clinicaAtual.clinica.nome ?? "esta clínica"}.`,
      confirmText: "Importar",
    });
    if (!ok) return;

    setImportando(true);
    const problemas: LinhaRecusada[] = [...leitura.recusadas];
    let criados = 0;
    let atualizados = 0;
    let especialidadesCriadas = 0;

    try {
      // 1. especialidades que faltam (lista compartilhada entre as clínicas)
      if (criarEspecialidades && faltamEspecialidades.length) {
        const { error } = await supabase
          .from("especialidades")
          .insert(faltamEspecialidades.map((nome) => ({ nome, ativo: true })));
        if (error) {
          toast.error("Não consegui criar as especialidades que faltavam. Os serviços seguiram.");
        } else {
          especialidadesCriadas = faltamEspecialidades.length;
        }
      }

      // 2. serviços novos, em lotes
      for (const lote of pedacos(novas, LOTE)) {
        const { error } = await supabase
          .from("procedimentos")
          .insert(lote.map((l) => montarPayload(l, clinicaId)));
        if (error) {
          for (const l of lote) {
            problemas.push({
              linhaExcel: l.linhaExcel,
              nome: l.nome,
              motivo: `Não foi possível cadastrar: ${error.message}`,
            });
          }
          continue;
        }
        criados += lote.length;
      }

      // 3. serviços que já existiam
      if (quandoExiste === "atualizar") {
        for (const l of jaExistem) {
          const alvo = mapaExistentes.get(chaveNomeServico(l.nome));
          if (!alvo) continue;
          const { clinica_id: _ignorado, ...dados } = montarPayload(l, clinicaId);
          const { error } = await supabase.from("procedimentos").update(dados).eq("id", alvo.id);
          if (error) {
            problemas.push({
              linhaExcel: l.linhaExcel,
              nome: l.nome,
              motivo: `Não foi possível atualizar: ${error.message}`,
            });
            continue;
          }
          atualizados += 1;
        }
      }

      invalidateAgendaRefs(clinicaId);
      // Recarrega o catálogo: os serviços recém-criados passam a existir para
      // o passo "Repasse aos médicos" e para uma segunda importação.
      setVersaoCatalogo((v) => v + 1);
      setResultado({
        criados,
        atualizados,
        pulados: quandoExiste === "pular" ? jaExistem.length : 0,
        especialidadesCriadas,
        problemas,
      });
      toast.success("Importação concluída.");
    } catch (e) {
      setResultado({
        criados,
        atualizados,
        pulados: quandoExiste === "pular" ? jaExistem.length : 0,
        especialidadesCriadas,
        problemas,
      });
      mostrarErro(e, "importar a planilha");
    } finally {
      setImportando(false);
    }
  }, [
    clinicaId,
    clinicaAtual,
    leitura,
    podeEscrever,
    novas,
    jaExistem,
    mapaExistentes,
    quandoExiste,
    criarEspecialidades,
    faltamEspecialidades,
  ]);

  // --- tela -----------------------------------------------------------------
  if (!podeEscrever) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Sem permissão</AlertTitle>
        <AlertDescription>
          Só quem tem permissão de edição no Catálogo de Serviços pode importar planilhas.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Importar serviços por planilha</h1>
        <Button variant="outline" onClick={() => navigate({ to: "/app/procedimentos" })}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao catálogo
        </Button>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          A planilha é lida aqui no seu navegador — o arquivo não é enviado para lugar nenhum. Tudo
          é gravado na clínica aberta agora:{" "}
          <strong>{clinicaAtual?.clinica.nome ?? "nenhuma clínica selecionada"}</strong>. Esta tela
          só cadastra ou atualiza serviços; nada é apagado.
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
            <p className="text-xs text-muted-foreground">Arquivos .xlsx, .xls ou .csv até 15 MB</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) void receberArquivo(arquivo);
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={baixarModelo}>
            <Download className="h-4 w-4 mr-2" /> Baixar modelo da planilha
          </Button>
        </CardContent>
      </Card>

      {/* 2. Conferência */}
      {leitura && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Confira antes de gravar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">Os serviços serão gravados em</p>
              <p className="text-lg font-semibold">
                {clinicaAtual?.clinica.nome ?? "Nenhuma clínica selecionada"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{leitura.linhas.length} linha(s) prontas</Badge>
              <Badge variant="secondary">{novas.length} novo(s)</Badge>
              <Badge variant="secondary">{jaExistem.length} já no catálogo</Badge>
              {leitura.recusadas.length > 0 && (
                <Badge variant="outline" className="border-destructive text-destructive">
                  {leitura.recusadas.length} com problema
                </Badge>
              )}
              {carregandoCatalogo && (
                <Badge variant="outline">conferindo o catálogo desta clínica…</Badge>
              )}
            </div>

            {leitura.outrasUnidades.linhas > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Linhas de outras unidades ficaram de fora</AlertTitle>
                <AlertDescription className="text-sm">
                  {leitura.outrasUnidades.linhas} linha(s) são de{" "}
                  {leitura.outrasUnidades.nomes.join(", ") || "outra unidade"} e não serão gravadas
                  em {clinicaAtual?.clinica.nome ?? "esta clínica"}. Para importar outra unidade,
                  abra o sistema nela e suba a mesma planilha.
                </AlertDescription>
              </Alert>
            )}

            {comTerceirizado.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Serviços com valor de terceirizado</AlertTitle>
                <AlertDescription className="space-y-2 text-sm">
                  <p>
                    {comTerceirizado.length} serviço(s) têm parte de terceirizado na planilha. O
                    serviço e o repasse do médico entram normalmente, mas a parte do terceirizado
                    não é lançada automaticamente — confira a lista com o financeiro.
                  </p>
                  <Button variant="outline" size="sm" onClick={baixarTerceirizados}>
                    <Download className="h-4 w-4 mr-2" /> Baixar lista
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {faltamEspecialidades.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Especialidades que ainda não existem</AlertTitle>
                <AlertDescription className="space-y-2 text-sm">
                  <p>{faltamEspecialidades.join(", ")}</p>
                  <p className="text-muted-foreground">
                    A lista de especialidades é <strong>compartilhada entre as clínicas</strong>:
                    criar uma nova aqui faz ela aparecer também na Menino Jesus. Os serviços são
                    importados mesmo sem criar — a especialidade fica escrita no serviço.
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

            <div className="space-y-2">
              <Label>O que fazer com os serviços que já existem</Label>
              <RadioGroup
                value={quandoExiste}
                onValueChange={(v) => setQuandoExiste(v as "pular" | "atualizar")}
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="pular" /> Pular (não mexer no que já está cadastrado)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="atualizar" /> Atualizar valores e dados dos que já existem
                </label>
              </RadioGroup>
            </div>

            <div className="max-h-[420px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Linha</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Especialidade</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Dinheiro</TableHead>
                    <TableHead className="text-right">Cartão</TableHead>
                    <TableHead className="text-right">Duração</TableHead>
                    <TableHead className="text-right">Repasse médico</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leitura.recusadas.map((r) => (
                    <TableRow key={`erro-${r.linhaExcel}`} className="bg-destructive/5">
                      <TableCell>{r.linhaExcel}</TableCell>
                      <TableCell className="text-destructive">{r.nome || "(sem nome)"}</TableCell>
                      <TableCell colSpan={7} className="text-destructive">
                        {r.motivo}
                      </TableCell>
                    </TableRow>
                  ))}
                  {leitura.linhas.map((l) => {
                    const existe = mapaExistentes.has(chaveNomeServico(l.nome));
                    return (
                      <TableRow key={`ok-${l.linhaExcel}`}>
                        <TableCell>{l.linhaExcel}</TableCell>
                        <TableCell className="font-medium">{l.nome}</TableCell>
                        <TableCell>{l.especialidade ?? "—"}</TableCell>
                        <TableCell>
                          {l.categoria}
                          {l.categoriaDeduzida && (
                            <span
                              className="ml-1 text-xs text-muted-foreground"
                              title="A planilha não tem coluna Categoria: deduzida pelo grupo ou pelo nome."
                            >
                              (deduzida)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{fmtBRL(l.valorDinheiro)}</TableCell>
                        <TableCell className="text-right">{fmtBRL(l.valorCartao)}</TableCell>
                        <TableCell className="text-right">{l.duracaoMinutos} min</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {fmtRepasse(l.repasse)}
                        </TableCell>
                        <TableCell>
                          {existe ? (
                            <Badge variant="outline">já existe</Badge>
                          ) : (
                            <Badge variant="secondary">novo</Badge>
                          )}
                          {!l.ativo && (
                            <Badge variant="outline" className="ml-1">
                              inativo
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void importar()} disabled={importando || carregandoCatalogo}>
                {importando ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Importar
              </Button>
              {leitura.recusadas.length > 0 && (
                <Button variant="outline" onClick={() => baixarProblemas(leitura.recusadas)}>
                  <Download className="h-4 w-4 mr-2" /> Baixar linhas com erro
                </Button>
              )}
            </div>
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
              <Badge variant="secondary">{resultado.criados} cadastrado(s)</Badge>
              <Badge variant="secondary">{resultado.atualizados} atualizado(s)</Badge>
              <Badge variant="secondary">{resultado.pulados} pulado(s)</Badge>
              {resultado.especialidadesCriadas > 0 && (
                <Badge variant="secondary">
                  {resultado.especialidadesCriadas} especialidade(s) criada(s)
                </Badge>
              )}
              {resultado.problemas.length > 0 && (
                <Badge variant="outline" className="border-destructive text-destructive">
                  {resultado.problemas.length} não importada(s)
                </Badge>
              )}
            </div>

            {resultado.problemas.length > 0 && (
              <div className="space-y-2">
                <ul className="max-h-60 space-y-1 overflow-auto text-sm text-destructive">
                  {resultado.problemas.map((p, i) => (
                    <li key={`${p.linhaExcel}-${i}`}>
                      Linha {p.linhaExcel} — {p.nome || "(sem nome)"}: {p.motivo}
                    </li>
                  ))}
                </ul>
                <Button variant="outline" onClick={() => baixarProblemas(resultado.problemas)}>
                  <Download className="h-4 w-4 mr-2" /> Baixar linhas com erro
                </Button>
              </div>
            )}

            <Button onClick={() => navigate({ to: "/app/procedimentos" })}>
              Voltar ao catálogo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 4. Repasse aos médicos */}
      {leitura && comRepasse.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Repasse aos médicos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A planilha define o repasse de {comRepasse.length} serviço(s). O sistema paga o
              repasse pela grade de cada médico, então este passo copia o valor de cada serviço para
              os médicos que atendem aquele serviço. Acordo que o médico já tem{" "}
              <strong>nunca é substituído</strong>. Convênio e cartões continuam no repasse padrão
              do médico.
            </p>

            {regrasDoCatalogo.length < comRepasse.length && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {comRepasse.length - regrasDoCatalogo.length} serviço(s) com repasse ainda não
                  estão no catálogo. Importe os serviços primeiro (passo 2).
                </AlertDescription>
              </Alert>
            )}

            <Button
              variant="outline"
              onClick={() => void conferirRepasse()}
              disabled={conferindoRepasse || carregandoCatalogo || !regrasDoCatalogo.length}
            >
              {conferindoRepasse && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Conferir médicos de cada serviço
            </Button>

            {plano && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {plano.inserir.length + plano.atualizar.length} repasse(s) a gravar
                  </Badge>
                  <Badge variant="outline">
                    {plano.mantidos.length} acordo(s) existente(s) mantido(s)
                  </Badge>
                  <Badge variant="outline">{plano.semMedico.length} serviço(s) sem médico</Badge>
                </div>

                {plano.semMedico.length > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Serviços que ainda não têm médico</AlertTitle>
                    <AlertDescription className="text-sm">
                      Nenhum médico desta clínica atende {plano.semMedico.length} serviço(s) com
                      repasse. Depois de importar os médicos (Equipe → Médicos → Importar planilha),
                      volte aqui, suba esta mesma planilha e confira de novo.
                    </AlertDescription>
                  </Alert>
                )}

                {plano.inserir.length + plano.atualizar.length > 0 && (
                  <div className="max-h-[360px] overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Médico</TableHead>
                          <TableHead>Serviço</TableHead>
                          <TableHead className="text-right">Repasse (particular)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...plano.inserir, ...plano.atualizar].map((i) => (
                          <TableRow key={`${i.medicoId}-${i.procedimentoNome}`}>
                            <TableCell>{i.medicoNome}</TableCell>
                            <TableCell className="font-medium">{i.procedimentoNome}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {fmtRepasse(i.repasse)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void aplicarRepasse()}
                    disabled={
                      aplicandoRepasse || plano.inserir.length + plano.atualizar.length === 0
                    }
                  >
                    {aplicandoRepasse && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Aplicar repasse aos médicos
                  </Button>
                  {plano.mantidos.length > 0 && (
                    <Button variant="outline" onClick={() => baixarMantidos(plano)}>
                      <Download className="h-4 w-4 mr-2" /> Baixar acordos mantidos
                    </Button>
                  )}
                </div>
              </div>
            )}

            {repasseAplicado && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {repasseAplicado.gravados} repasse(s) gravado(s) na grade dos médicos
                  {repasseAplicado.falhas > 0 && `; ${repasseAplicado.falhas} falharam`}.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
