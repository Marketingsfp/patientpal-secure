import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardCheck,
  ListChecks,
  MessagesSquare,
  FileHeart,
  Stethoscope,
  Loader2,
  History,
  ArrowLeft,
  HeartPulse,
  CheckCircle2,
  Printer,
  AlertTriangle,
  Zap,
  Pill,
  FlaskConical,
  FileText,
  Cloud,
  CloudOff,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { VoiceInput } from "@/components/voice-input";
import { Cid10Autocomplete } from "@/components/prontuario/cid10-autocomplete";
import { PrescricaoBuilder } from "@/components/prontuario/prescricao-builder";
import {
  prescricaoParaTexto,
  textoParaPrescricao,
  type ItemPrescricao,
} from "@/lib/prontuario/prescricao";
import { macrosPorCampo, type Macro } from "@/lib/prontuario/macros";
import { ApoioClinico } from "@/components/prontuario/apoio-clinico";
import { comTempoLimite } from "@/lib/tempo-limite";
import { imprimirDocumentoA4, type DadosClinicaA4 } from "@/lib/print-a4-medico";
import type { Cid10 } from "@/data/cid10";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  gerarAnamneseEstruturada,
  sugerirCondutaClinica,
  resumirHistoricoPaciente,
} from "@/lib/atendimento-ai.functions";
import { agendamentoStatusPagamento, type StatusPagamento } from "@/lib/pagamento-status";
import { cadastroMedicoDoUsuario, currentUserIsMedicoOnly } from "@/lib/medico-only";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";

export const Route = createFileRoute("/_authenticated/app/atendimento-ia/$agendamentoId")({
  component: AtendimentoEditorPage,
  // Sem isto o TanStack Router NÃO remonta o componente quando só o
  // `$agendamentoId` muda — ele reaproveita a mesma instância. Todo o estado
  // clínico (SOAP, prescrição, CIDs, exames, transcrição, CPF do paciente)
  // continuava em memória do atendimento anterior, e o médico podia imprimir
  // a receita do paciente A com o cabeçalho do paciente B. Trocar de
  // atendimento agora zera a tela, como se fosse aberta do começo.
  remountDeps: ({ params }) => params.agendamentoId,
  head: () => ({ meta: [{ title: "Atendimento — ClinicaOS" }] }),
  validateSearch: (s: Record<string, unknown>): { from?: "agenda-v2" } => ({
    from: s.from === "agenda-v2" ? ("agenda-v2" as const) : undefined,
  }),
});

type Modelo = { id: string; nome: string; prompt_ia: string | null };
type Medico = {
  id: string;
  nome: string;
  email: string | null;
  user_id: string | null;
  especialidade_id: string | null;
  crm?: string | null;
  crm_uf?: string | null;
  tipo_repasse?: string | null;
  percentual_repasse_padrao?: number | null;
  valor_repasse_padrao?: number | null;
  especialidades?: { nome: string } | null;
};
type Triagem = {
  id: string;
  created_at: string;
  enfermeira_nome: string | null;
  peso_kg: number | null;
  altura_cm: number | null;
  imc: number | null;
  pa_sistolica: number | null;
  pa_diastolica: number | null;
  freq_cardiaca: number | null;
  temperatura: number | null;
  saturacao: number | null;
  glicemia: number | null;
  queixa_principal: string | null;
  doencas: string[] | null;
  medicamentos: string | null;
  alergias: string | null;
  observacoes: string | null;
};

const SOAP_KEYS = [
  ["queixa_principal", "Queixa principal", 2],
  ["historia_doenca", "História da doença atual", 3],
  ["exame_fisico", "Exame físico", 3],
  ["hipotese_diagnostica", "Hipótese diagnóstica", 2],
  ["conduta", "Conduta", 3],
  ["prescricao", "Prescrição", 4],
] as const;
type Soap = Record<(typeof SOAP_KEYS)[number][0], string>;
const EMPTY: Soap = {
  queixa_principal: "",
  historia_doenca: "",
  exame_fisico: "",
  hipotese_diagnostica: "",
  conduta: "",
  prescricao: "",
};

function AtendimentoEditorPage() {
  const { agendamentoId } = Route.useParams();
  const { from } = Route.useSearch();
  const cameFromAgendaV2 = from === "agenda-v2";
  const backTo = cameFromAgendaV2 ? "/app/agenda-v2" : "/app/atendimento-ia";
  const backLabel = cameFromAgendaV2 ? "Voltar para Agenda V2" : "Voltar para fila";
  const navigate = useNavigate();
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("atendimento-ia");
  // O apoio à decisão usa o módulo "consulta-ia", que tem permissão própria na
  // tela de Perfis de Acesso. Quem tem o atendimento liberado não tem
  // necessariamente este — e a função de servidor recusa. Consultamos aqui para
  // avisar em vez de deixar o médico clicar e receber erro.
  const podeApoioClinico = usePodeEscrever("consulta-ia");
  const estruturar = useServerFn(gerarAnamneseEstruturada);
  const sugerir = useServerFn(sugerirCondutaClinica);
  const resumir = useServerFn(resumirHistoricoPaciente);

  const [agendamento, setAgendamento] = useState<{
    id: string;
    paciente_id: string | null;
    paciente_nome: string;
    medico_id: string | null;
    procedimento: string | null;
    fluxo_etapa: string;
    status: string;
  } | null>(null);
  const [medico, setMedico] = useState<Medico | null>(null);
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [triagem, setTriagem] = useState<Triagem | null>(null);
  // Distingue "não houve triagem" de "a triagem não carregou". Sem isso as duas
  // situações se pareciam na tela — e a segunda esconde as ALERGIAS, que só
  // aparecem a partir da triagem. Um médico concluir que não há alergia porque
  // uma consulta falhou é risco assistencial, não detalhe de interface.
  const [triagemIndisponivel, setTriagemIndisponivel] = useState(false);
  const [pagamento, setPagamento] = useState<StatusPagamento | null>(null);

  const [transcricao, setTranscricao] = useState("");
  const [soap, setSoap] = useState<Soap>(EMPTY);
  const [sugestoes, setSugestoes] = useState<{
    cids: { codigo: string; descricao: string }[];
    exames: string[];
    prescricao: string;
  } | null>(null);
  const [resumo, setResumo] = useState<string>("");
  const [resumoOpen, setResumoOpen] = useState(false);
  const [loading, setLoading] = useState<"estruturar" | "sugerir" | "resumir" | "salvar" | null>(
    null,
  );
  const [salvo, setSalvo] = useState<{ valorMedico: number } | null>(null);

  // PEP estruturado
  const [cids, setCids] = useState<Cid10[]>([]);
  const [prescItens, setPrescItens] = useState<ItemPrescricao[]>([]);
  const [atestadoDias, setAtestadoDias] = useState("1");
  const [examesTexto, setExamesTexto] = useState("");
  // Guarda o `id` junto com os dados: é ele que prova, na hora de imprimir,
  // que o CPF e a data de nascimento no papel são do paciente deste
  // atendimento — e não sobra da tela anterior.
  const [paciente, setPaciente] = useState<{
    id: string;
    cpf: string | null;
    data_nascimento: string | null;
  } | null>(null);
  // Prontuário já gravado para ESTE agendamento. Enquanto não existia, cada
  // clique em "Finalizar atendimento" criava uma linha nova no banco e a tela
  // reabria em branco — parecia que nada tinha sido salvo.
  const [prontuarioId, setProntuarioId] = useState<string | null>(null);
  const [clinicaDados, setClinicaDados] = useState<DadosClinicaA4 | null>(null);
  const [rascunhoEm, setRascunhoEm] = useState<Date | null>(null);
  const rascunhoRestaurado = useRef(false);
  const draftKey = `pep:rascunho:${agendamentoId}`;

  // Carrega agendamento + médico + pagamento (usado no mount e no realtime).
  const carregarAgendamento = useCallback(async () => {
    if (!clinicaAtual || !agendamentoId) return;
    const { data: ag, error } = await supabase
      .from("agendamentos")
      .select("id, paciente_id, paciente_nome, medico_id, procedimento, fluxo_etapa, status")
      .eq("id", agendamentoId)
      .maybeSingle();
    if (error || !ag) {
      toast.error("Agendamento não encontrado");
      navigate({ to: "/app/atendimento-ia" });
      return;
    }
    // CRIT-09: consulta cancelada não pode ser "atendida" — sem esta
    // checagem, o médico conseguia abrir a tela e criar prontuário para um
    // agendamento cancelado, e a promoção automática de etapa abaixo
    // (quando já pago) ignorava o cancelamento e empurrava para
    // "atendimento" mesmo assim. Roda de novo a cada refresh via realtime,
    // então também tira o médico da tela se o agendamento for cancelado
    // no meio do atendimento.
    if (ag.status === "cancelado") {
      toast.error("Este atendimento foi cancelado.");
      navigate({ to: "/app/atendimento-ia" });
      return;
    }
    // Quem só tem perfil de médico atende apenas os próprios pacientes. Sem
    // esta checagem bastava trocar o número do agendamento no endereço para
    // abrir o prontuário de um paciente de outro profissional.
    if (await currentUserIsMedicoOnly()) {
      const meu = await cadastroMedicoDoUsuario(clinicaAtual.clinica_id);
      if (!meu || meu.id !== ag.medico_id) {
        toast.error("Este atendimento é de outro profissional.");
        navigate({ to: "/app/atendimento-ia" });
        return;
      }
    }
    setAgendamento(ag as never);

    // Pagamento ANTES da consulta — bloqueia avanço enquanto pendente.
    const status = await agendamentoStatusPagamento(ag.id);
    setPagamento(status);

    if (ag.medico_id) {
      const { data: med, error: erroMedico } = await supabase
        .from("medicos")
        .select(
          "id, nome, email, user_id, especialidade_id, crm, crm_uf, especialidades:especialidades!medicos_especialidade_id_fkey(nome)",
        )
        .eq("id", ag.medico_id)
        .maybeSingle();
      if (erroMedico) {
        console.error("[atendimento] falha ao carregar o profissional", erroMedico);
        // Sem estes dados o cabeçalho fica preso em "Carregando…" e os
        // documentos A4 saem sem CRM — nada disso se explica sozinho na tela.
        toast.warning("Não foi possível carregar os dados do profissional.", {
          id: "atendimento-dados-medico",
          description: "O CRM pode faltar nos documentos impressos. Recarregue a página.",
        });
      }
      if (med) {
        let sens: any = {};
        try {
          const { data: s } = await supabase.rpc("medico_dados_sensiveis", {
            _medico_id: ag.medico_id,
          });
          sens = (s as any) ?? {};
        } catch {
          sens = {};
        }
        setMedico({
          ...(med as any),
          tipo_repasse: sens.tipo_repasse ?? null,
          percentual_repasse_padrao: sens.percentual_repasse_padrao ?? null,
          valor_repasse_padrao: sens.valor_repasse_padrao ?? null,
        } as never);
      }
    }

    // move para "atendimento" se ainda não estiver (apenas se já estiver pago)
    if (status.pago && ag.fluxo_etapa !== "atendimento") {
      void supabase
        .from("agendamentos")
        .update({
          fluxo_etapa: "atendimento",
          fluxo_atualizado_em: new Date().toISOString(),
        } as never)
        .eq("id", ag.id);
    }
  }, [agendamentoId, clinicaAtual?.clinica_id, navigate]);

  useEffect(() => {
    void carregarAgendamento();
  }, [carregarAgendamento]);

  // Carrega modelo a partir da especialidade
  useEffect(() => {
    if (!clinicaAtual) return;
    (async () => {
      const { data: mds, error } = await supabase
        .from("prontuario_modelos")
        .select("id, nome, prompt_ia")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome");
      // Só console: sem modelo a estruturação usa o prompt padrão, então o
      // atendimento segue normal e não vale interromper o médico por isso.
      if (error) console.error("[atendimento] falha ao carregar modelos de prontuário", error);
      const list = (mds ?? []) as Modelo[];
      const espNome = (medico?.especialidades?.nome ?? "").toLowerCase().trim();
      const match = espNome ? list.find((x) => x.nome.toLowerCase().trim() === espNome) : null;
      setModelo(match ?? list[0] ?? null);
    })();
  }, [clinicaAtual?.clinica_id, medico?.especialidades?.nome]);

  // Carrega triagem (usado no mount e no realtime).
  const carregarTriagem = useCallback(async () => {
    if (!agendamentoId) return;
    const { data, error } = await supabase
      .from("triagens_enfermagem")
      .select(
        "id, created_at, enfermeira_nome, peso_kg, altura_cm, imc, pa_sistolica, pa_diastolica, freq_cardiaca, temperatura, saturacao, glicemia, queixa_principal, doencas, medicamentos, alergias, observacoes",
      )
      .eq("agendamento_id", agendamentoId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[atendimento] falha ao carregar a triagem", error);
      // Preserva a triagem já carregada, se houver: esta função também roda no
      // realtime, e uma falha momentânea não pode apagar da tela dados que o
      // médico está lendo.
      setTriagemIndisponivel(true);
      return;
    }
    setTriagemIndisponivel(false);
    setTriagem((data as unknown as Triagem) ?? null);
  }, [agendamentoId]);

  useEffect(() => {
    void carregarTriagem();
  }, [carregarTriagem]);

  // Realtime: pagamento (fin_lancamentos / orçamento), triagem e o próprio
  // agendamento (etapa/status). Recarrega ao vivo enquanto o médico atende.
  const recarregarAoVivo = useCallback(() => {
    void carregarAgendamento();
    void carregarTriagem();
  }, [carregarAgendamento, carregarTriagem]);
  useRealtimeRefresh(
    ["agendamentos", "triagens_enfermagem", "fin_lancamentos", "agendamento_orcamento_itens"],
    recarregarAoVivo,
    Boolean(agendamentoId && clinicaAtual?.clinica_id),
  );

  // Dados do paciente (CPF/idade) para os documentos A4.
  useEffect(() => {
    const pid = agendamento?.paciente_id;
    // Descarta imediatamente o que estiver em memória de outro paciente. Sem
    // isto, entre a troca de atendimento e a chegada da consulta a tela ficava
    // com o nome do paciente novo e o CPF do anterior.
    setPaciente((p) => (p && p.id === pid ? p : null));
    if (!pid) return;
    // `cancelado` protege contra resposta que chega fora de ordem: a consulta
    // lenta de um paciente não pode sobrescrever a do paciente aberto agora.
    let cancelado = false;
    (async () => {
      const { data, error } = await supabase
        .from("pacientes")
        .select("cpf, data_nascimento")
        .eq("id", pid)
        .maybeSingle();
      if (cancelado) return;
      if (error) {
        console.error("[atendimento] falha ao carregar dados do paciente", error);
        // `id` fixo: se a consulta falhar de novo (realtime, remontagem), o
        // aviso é substituído em vez de empilhar na tela.
        toast.warning("Não foi possível carregar CPF e data de nascimento do paciente.", {
          id: "atendimento-dados-paciente",
          description: "Confira os documentos impressos antes de entregar.",
        });
        return;
      }
      setPaciente({
        id: pid,
        cpf: data?.cpf ?? null,
        data_nascimento: data?.data_nascimento ?? null,
      });
    })();
    return () => {
      cancelado = true;
    };
  }, [agendamento?.paciente_id]);

  // Traz de volta o prontuário já gravado deste atendimento. É o que faz o
  // médico reabrir a consulta e enxergar o que escreveu, em vez de uma tela em
  // branco que sugere que a gravação falhou.
  useEffect(() => {
    if (!agendamentoId) return;
    let cancelado = false;
    (async () => {
      const { data, error } = await supabase
        .from("prontuarios")
        .select(
          "id, queixa_principal, historia_doenca, exame_fisico, hipotese_diagnostica, conduta, prescricao, observacoes",
        )
        .eq("agendamento_id", agendamentoId)
        .order("data", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelado) return;
      if (error) {
        console.error("[atendimento] falha ao carregar o prontuário deste atendimento", error);
        // Sem esta informação um novo "Finalizar" criaria uma segunda linha
        // para a mesma consulta. Melhor avisar do que duplicar o registro.
        toast.warning("Não foi possível verificar se este atendimento já tem prontuário.", {
          id: "atendimento-prontuario-existente",
          description: "Recarregue a página antes de finalizar para não duplicar o registro.",
        });
        return;
      }
      if (!data) return;
      setProntuarioId(data.id);
      // Só preenche campo que ainda está vazio: um rascunho recuperado do
      // navegador é mais recente que o gravado e não pode ser sobrescrito.
      setSoap((s) => ({
        queixa_principal: s.queixa_principal || (data.queixa_principal ?? ""),
        historia_doenca: s.historia_doenca || (data.historia_doenca ?? ""),
        exame_fisico: s.exame_fisico || (data.exame_fisico ?? ""),
        hipotese_diagnostica: s.hipotese_diagnostica || (data.hipotese_diagnostica ?? ""),
        conduta: s.conduta || (data.conduta ?? ""),
        prescricao: s.prescricao || (data.prescricao ?? ""),
      }));
    })();
    return () => {
      cancelado = true;
    };
  }, [agendamentoId]);

  // Dados da clínica (cabeçalho dos documentos A4).
  useEffect(() => {
    if (!clinicaAtual) return;
    (async () => {
      const { data, error } = await supabase
        .from("clinicas")
        .select("nome, cnpj, endereco, cidade, estado, cep, telefone, email, branding")
        .eq("id", clinicaAtual.clinica_id)
        .maybeSingle();
      if (error) {
        console.error("[atendimento] falha ao carregar dados da clínica", error);
        // Esta é a que tem consequência física: sem estes dados a receita, o
        // atestado e o pedido de exames saem impressos sem cabeçalho, e o
        // médico só descobre com o papel na mão.
        toast.warning("Não foi possível carregar os dados da clínica.", {
          id: "atendimento-dados-clinica",
          description: "Receitas e atestados podem sair sem o cabeçalho. Recarregue a página.",
          duration: 12000,
        });
        return;
      }
      if (!data) return;
      const branding = (data.branding ?? {}) as Record<string, unknown>;
      setClinicaDados({
        nome: data.nome,
        cnpj: data.cnpj,
        endereco: data.endereco,
        cidade: data.cidade,
        estado: data.estado,
        cep: data.cep,
        telefone: data.telefone,
        email: data.email,
        logoUrl: (branding.logo_url as string) ?? (branding.logoUrl as string) ?? null,
      });
    })();
  }, [clinicaAtual?.clinica_id]);

  // Auto-save do rascunho no navegador — nada se perde se a aba fechar.
  useEffect(() => {
    if (!agendamentoId || rascunhoRestaurado.current) return;
    rascunhoRestaurado.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        soap?: Soap;
        transcricao?: string;
        cids?: Cid10[];
        presc?: ItemPrescricao[];
        exames?: string;
        em?: string;
      };
      if (d.soap) setSoap((s) => ({ ...s, ...d.soap }));
      if (d.transcricao) setTranscricao(d.transcricao);
      if (d.cids) setCids(d.cids);
      if (d.presc) setPrescItens(d.presc);
      if (d.exames) setExamesTexto(d.exames);
      if (d.em) setRascunhoEm(new Date(d.em));
      toast.info("Rascunho recuperado deste atendimento");
    } catch {
      /* rascunho inválido — ignora */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendamentoId]);

  useEffect(() => {
    if (!agendamentoId || !rascunhoRestaurado.current) return;
    const vazio =
      !transcricao &&
      !examesTexto &&
      cids.length === 0 &&
      prescItens.length === 0 &&
      Object.values(soap).every((v) => !v);
    if (vazio) return;
    const t = setTimeout(() => {
      const em = new Date();
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            soap,
            transcricao,
            cids,
            presc: prescItens,
            exames: examesTexto,
            em: em.toISOString(),
          }),
        );
        setRascunhoEm(em);
      } catch {
        /* storage cheio */
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [soap, transcricao, cids, prescItens, examesTexto, agendamentoId, draftKey]);

  // Prescrição estruturada -> texto do prontuário.
  useEffect(() => {
    if (prescItens.length === 0) return;
    const texto = prescricaoParaTexto(prescItens);
    setSoap((s) => (s.prescricao === texto ? s : { ...s, prescricao: texto }));
  }, [prescItens]);

  // CIDs selecionados -> hipótese diagnóstica.
  const cidsTexto = useMemo(
    () => cids.map((c) => `[CID ${c.codigo} — ${c.descricao}]`).join(" "),
    [cids],
  );

  function aplicarTriagemNoSoap(t: Triagem) {
    const linhas: string[] = [];
    if (t.queixa_principal) linhas.push(`Queixa (triagem): ${t.queixa_principal}`);
    const sv: string[] = [];
    if (t.pa_sistolica && t.pa_diastolica) sv.push(`PA ${t.pa_sistolica}/${t.pa_diastolica} mmHg`);
    if (t.freq_cardiaca) sv.push(`FC ${t.freq_cardiaca} bpm`);
    if (t.temperatura) sv.push(`T ${t.temperatura}°C`);
    if (t.saturacao) sv.push(`SatO₂ ${t.saturacao}%`);
    if (t.glicemia) sv.push(`Glicemia ${t.glicemia} mg/dL`);
    if (t.peso_kg) sv.push(`Peso ${t.peso_kg} kg`);
    if (t.altura_cm) sv.push(`Altura ${t.altura_cm} cm`);
    if (t.imc) sv.push(`IMC ${t.imc}`);
    if (sv.length) linhas.push(`Sinais vitais: ${sv.join(" · ")}`);
    if (t.doencas?.length) linhas.push(`Comorbidades: ${t.doencas.join(", ")}`);
    if (t.medicamentos) linhas.push(`Medicamentos: ${t.medicamentos}`);
    if (t.alergias) linhas.push(`Alergias: ${t.alergias}`);
    const txt = linhas.join("\n");
    setSoap((s) => {
      const jaContem = s.exame_fisico?.includes(txt);
      return {
        ...s,
        queixa_principal: s.queixa_principal || t.queixa_principal || "",
        exame_fisico: jaContem
          ? s.exame_fisico
          : s.exame_fisico
            ? `${s.exame_fisico}\n${txt}`
            : txt,
      };
    });
  }

  const triagemAplicadaRef = useRef<string | null>(null);
  useEffect(() => {
    if (!triagem) return;
    if (triagemAplicadaRef.current === triagem.id) return;
    triagemAplicadaRef.current = triagem.id;
    aplicarTriagemNoSoap(triagem);
    toast.success("Triagem aplicada ao prontuário");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triagem?.id]);

  const especialidadeMedico = medico?.especialidades?.nome ?? "";
  const especialidade = especialidadeMedico || modelo?.nome || "Clínica Geral";
  const pacienteId = agendamento?.paciente_id ?? "";
  const pacienteNome = agendamento?.paciente_nome ?? "";

  /**
   * Reúne, num texto corrido, tudo que já está preenchido nesta tela para
   * alimentar o apoio à decisão: sinais vitais da triagem, transcrição da
   * consulta e os campos do prontuário.
   *
   * Não inclui nome, CPF nem data de nascimento do paciente — nada disso muda a
   * análise clínica, e esse texto sai da clínica rumo ao provedor do modelo.
   * Mandar identificação seria expor dado pessoal sem necessidade.
   */
  const montarContextoClinico = useCallback(() => {
    const partes: string[] = [];
    if (especialidade) partes.push(`Especialidade: ${especialidade}`);

    if (triagem) {
      const vitais = [
        triagem.pa_sistolica && triagem.pa_diastolica
          ? `PA ${triagem.pa_sistolica}/${triagem.pa_diastolica} mmHg`
          : null,
        triagem.freq_cardiaca ? `FC ${triagem.freq_cardiaca} bpm` : null,
        triagem.temperatura ? `Tax ${triagem.temperatura} °C` : null,
        triagem.saturacao ? `SatO2 ${triagem.saturacao}%` : null,
        triagem.glicemia ? `Glicemia ${triagem.glicemia} mg/dL` : null,
        triagem.peso_kg ? `Peso ${triagem.peso_kg} kg` : null,
        triagem.altura_cm ? `Altura ${triagem.altura_cm} cm` : null,
        triagem.imc ? `IMC ${triagem.imc}` : null,
      ].filter(Boolean);
      if (vitais.length) partes.push(`Triagem: ${vitais.join(", ")}`);
      if (triagem.alergias) partes.push(`Alergias: ${triagem.alergias}`);
      if (triagem.doencas?.length) partes.push(`Comorbidades: ${triagem.doencas.join(", ")}`);
      if (triagem.medicamentos) partes.push(`Medicamentos em uso: ${triagem.medicamentos}`);
    }

    for (const [chave, rotulo] of SOAP_KEYS) {
      const valor = soap[chave]?.trim();
      if (valor) partes.push(`${rotulo}: ${valor}`);
    }

    const transcrito = transcricao.trim();
    if (transcrito) partes.push(`Transcrição da consulta:\n${transcrito}`);

    return partes.join("\n");
  }, [especialidade, triagem, soap, transcricao]);

  async function handleEstruturar(textoOverride?: string) {
    const texto = (textoOverride ?? transcricao).trim();
    if (!texto) {
      toast.error("Grave ou cole a transcrição primeiro");
      return;
    }
    setLoading("estruturar");
    try {
      const out = await comTempoLimite(
        (signal) =>
          estruturar({
            data: {
              transcricao: texto,
              especialidade,
              promptExtra: modelo?.prompt_ia ?? undefined,
            },
            signal,
          }),
        "A estruturação do prontuário",
      );
      const nextSoap = {
        queixa_principal: out.queixa_principal || soap.queixa_principal,
        historia_doenca: out.historia_doenca || soap.historia_doenca,
        exame_fisico: out.exame_fisico || soap.exame_fisico,
        hipotese_diagnostica: out.hipotese_diagnostica || soap.hipotese_diagnostica,
        conduta: out.conduta || soap.conduta,
        prescricao: out.prescricao || soap.prescricao,
      };
      setSoap(nextSoap);
      if (out.prescricao) setPrescItens(textoParaPrescricao(out.prescricao));
      toast.success("Prontuário preenchido como sugestão — revise antes de finalizar");
      // Gera CIDs/exames/prescrição sugerida na sequência. Falha aqui não
      // derruba o preenchimento que já deu certo — mas avisa, em vez de morrer
      // só no console: sem isso o médico ficava sem as sugestões e sem motivo.
      try {
        const sug = await comTempoLimite(
          (signal) => sugerir({ data: { ...nextSoap, especialidade }, signal }),
          "A geração de sugestões",
        );
        setSugestoes(sug);
      } catch (err) {
        console.error("sugerir falhou", err);
        toast.warning("Prontuário preenchido, mas não foi possível gerar as sugestões de CID.");
      }
    } catch (e) {
      mostrarErro(e);
    } finally {
      setLoading(null);
    }
  }

  async function handleSugerir() {
    setLoading("sugerir");
    try {
      const out = await comTempoLimite(
        (signal) => sugerir({ data: { ...soap, especialidade }, signal }),
        "A geração de sugestões",
      );
      setSugestoes(out);
      toast.success("Sugestões geradas");
    } catch (e) {
      mostrarErro(e);
    } finally {
      setLoading(null);
    }
  }

  async function handleResumir() {
    if (!pacienteId) {
      toast.error("Paciente não identificado");
      return;
    }
    setLoading("resumir");
    try {
      const out = await comTempoLimite(
        (signal) => resumir({ data: { pacienteId }, signal }),
        "O resumo do histórico",
      );
      setResumo(out.resumo);
      setResumoOpen(true);
      if (out.total === 0) toast.info("Sem prontuários anteriores");
    } catch (e) {
      mostrarErro(e);
    } finally {
      setLoading(null);
    }
  }

  async function handleSalvar() {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaAtual || !pacienteId) {
      toast.error("Paciente não identificado");
      return;
    }
    // Trava de identidade: o prontuário só pode ser gravado quando o paciente
    // em memória é comprovadamente o do agendamento aberto na barra de
    // endereço. Se por qualquer motivo os dois divergirem, é melhor recusar do
    // que gravar a consulta de um paciente na ficha de outro.
    if (agendamento?.id !== agendamentoId) {
      toast.error("Os dados do atendimento não conferem com a tela aberta.", {
        description: "Recarregue a página antes de salvar.",
      });
      return;
    }
    if (pagamento && !pagamento.pago) {
      toast.error("Pagamento pendente — finalize no caixa antes de salvar o prontuário.");
      return;
    }
    setLoading("salvar");
    try {
      const cid = clinicaAtual.clinica_id;
      const campos = {
        clinica_id: cid,
        paciente_id: pacienteId,
        medico_id: medico?.id ?? null,
        // ALTA-04: sem isso, duas consultas do mesmo paciente no mesmo dia
        // não tinham como ser distinguidas — nenhum campo ligava o
        // prontuário de volta ao agendamento que o originou.
        agendamento_id: agendamentoId,
        queixa_principal: soap.queixa_principal || null,
        historia_doenca: soap.historia_doenca || null,
        exame_fisico: soap.exame_fisico || null,
        hipotese_diagnostica: soap.hipotese_diagnostica || null,
        conduta: soap.conduta || null,
        prescricao: soap.prescricao || null,
        observacoes: transcricao ? `Transcrição:\n${transcricao}` : null,
      };
      // Uma consulta = um prontuário. Salvar de novo corrige o que já existe
      // em vez de criar outra linha: antes, cada clique gerava um registro
      // novo e o histórico do paciente enchia de cópias da mesma consulta.
      // `.select("id")` é o que prova que a gravação passou pelas regras de
      // acesso do banco — sem ele um bloqueio voltava como "sucesso" vazio.
      const tabela = supabase.from("prontuarios");
      const { data: gravado, error } = prontuarioId
        ? await tabela
            .update(campos as never)
            .eq("id", prontuarioId)
            .select("id")
        : await tabela.insert({ ...campos, data: new Date().toISOString() } as never).select("id");
      if (error) throw error;
      const linhaGravada = (gravado ?? [])[0] as { id: string } | undefined;
      if (!linhaGravada) {
        throw new Error(
          "O prontuário não foi gravado. Verifique se o seu usuário tem permissão de médico ou admin nesta clínica e tente de novo.",
        );
      }
      setProntuarioId(linhaGravada.id);

      // Falhas de rede daqui em diante NÃO desfazem o prontuário (ele já está
      // gravado e é o registro clínico que importa), mas precisam aparecer para
      // o médico. Antes o erro era descartado e a tela dizia "Prontuário salvo"
      // mesmo com o paciente seguindo na fila e o repasse fora do financeiro.
      const falhas: string[] = [];

      const procNome = agendamento?.procedimento ?? "";
      let valorTotal = 0;
      let valorConhecido = true;
      let lancamentoId: string | null = null;
      if (procNome) {
        const { data: proc, error: erroProc } = await supabase
          .from("procedimentos")
          .select("valor_padrao, valor_dinheiro")
          .eq("clinica_id", cid)
          .ilike("nome", procNome)
          .maybeSingle();
        if (erroProc) {
          // Sem o valor do procedimento o repasse sairia calculado como zero e
          // o registro financeiro simplesmente não seria criado — em silêncio.
          console.error("[atendimento] falha ao buscar valor do procedimento", erroProc);
          valorConhecido = false;
          falhas.push(
            "o valor do procedimento não pôde ser consultado, e o repasse não foi gerado",
          );
        }
        valorTotal = Number(proc?.valor_dinheiro ?? proc?.valor_padrao ?? 0);
      }
      let valorMedico = 0;
      if (medico && valorTotal > 0) {
        if (medico.tipo_repasse === "valor") {
          valorMedico = Number(medico.valor_repasse_padrao ?? 0);
        } else {
          valorMedico = valorTotal * (Number(medico.percentual_repasse_padrao ?? 0) / 100);
        }
      }
      const valorClinica = Math.max(0, valorTotal - valorMedico);

      const { data: lancExist, error: erroLanc } = await supabase
        .from("fin_lancamentos")
        .select("id, valor")
        .eq("agendamento_id", agendamentoId)
        .maybeSingle();
      if (erroLanc) {
        // Esta consulta decide se JÁ existe cobrança para o agendamento. Sem a
        // resposta não dá para saber, e criar assim duplicaria o lançamento no
        // Financeiro. Melhor não criar e avisar — duplicidade é bem mais cara
        // de desfazer do que uma inclusão manual.
        console.error("[atendimento] falha ao verificar lançamento existente", erroLanc);
        valorConhecido = false;
        falhas.push(
          "não foi possível verificar a cobrança do agendamento, e o repasse não foi gerado",
        );
      }
      if (lancExist) {
        lancamentoId = lancExist.id;
        if (!valorTotal) valorTotal = Number(lancExist.valor ?? 0);
      }

      // Agora que salvar de novo corrige o prontuário em vez de criar outro, o
      // trecho abaixo pode rodar duas vezes para a mesma consulta. Sem esta
      // checagem o repasse do médico seria contado em dobro no Financeiro.
      const { data: finExist, error: erroFinExist } = await supabase
        .from("fin_atendimentos")
        .select("id")
        .eq("agendamento_id", agendamentoId)
        .limit(1)
        .maybeSingle();
      if (erroFinExist) {
        console.error("[atendimento] falha ao verificar o registro financeiro", erroFinExist);
        valorConhecido = false;
        falhas.push(
          "não foi possível verificar o registro financeiro deste atendimento, e o repasse não foi gerado",
        );
      }

      // Só cria fin_atendimentos quando NÃO houver fin_lancamentos vinculado
      // ao agendamento — caso contrário duplicaria o registro no Financeiro
      // (o repasse já vive em fin_lancamentos gerado no caixa).
      if (valorConhecido && valorTotal > 0 && !lancExist && !finExist) {
        const { error: erroFin } = await supabase.from("fin_atendimentos").insert({
          clinica_id: cid,
          paciente_id: pacienteId,
          medico_id: medico?.id ?? null,
          // ALTA-04: mesma lacuna do prontuário — sem agendamento_id não dá
          // pra provar qual cobrança é de qual consulta quando há mais de
          // uma no mesmo dia.
          agendamento_id: agendamentoId,
          procedimento: procNome || null,
          data: new Date().toISOString().slice(0, 10),
          valor_total: valorTotal,
          valor_medico: valorMedico,
          valor_clinica: valorClinica,
          status: "realizado",
          lancamento_id: lancamentoId,
        } as never);
        if (erroFin) {
          console.error("[atendimento] falha ao registrar no financeiro", erroFin);
          falhas.push("o lançamento no financeiro não foi registrado");
        }
      }

      const { error: erroAgendamento } = await supabase
        .from("agendamentos")
        .update({
          fluxo_etapa: "finalizado",
          status: "realizado",
          fluxo_atualizado_em: new Date().toISOString(),
        } as never)
        .eq("id", agendamentoId);
      if (erroAgendamento) {
        console.error("[atendimento] falha ao finalizar o agendamento", erroAgendamento);
        falhas.push("o atendimento não foi marcado como finalizado (o paciente segue na fila)");
      }

      if (falhas.length) {
        toast.warning("Prontuário salvo, mas com pendências", {
          description: `Não foi possível concluir: ${falhas.join("; ")}. Avise a recepção e confira antes de encerrar.`,
          duration: 15000,
        });
      } else {
        toast.success(
          valorMedico > 0
            ? `Prontuário salvo · Repasse médico: R$ ${valorMedico.toFixed(2)}`
            : "Prontuário salvo",
        );
      }
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ok */
      }
      setSalvo({ valorMedico });
    } catch (e) {
      mostrarErro(e);
    } finally {
      setLoading(null);
    }
  }

  function addToHipotese(t: string) {
    setSoap((s) => ({
      ...s,
      hipotese_diagnostica: s.hipotese_diagnostica ? `${s.hipotese_diagnostica} ${t}` : t,
    }));
  }

  function aplicarMacro(m: Macro) {
    setSoap((s) => ({ ...s, [m.campo]: s[m.campo] ? `${s[m.campo]}\n${m.texto}` : m.texto }));
    if (m.campo === "prescricao") setPrescItens(textoParaPrescricao(m.texto));
    toast.success(`Macro aplicada: ${m.rotulo}`);
  }

  const dadosClinicaDoc = clinicaDados ?? {
    nome: clinicaAtual?.clinica?.nome ?? "Clínica",
  };

  function imprimirA4(tipo: "receita" | "exames" | "atestado" | "conduta") {
    // Trava de identidade do documento impresso. O papel sai da clínica na mão
    // do paciente: se o cabeçalho e o corpo puderem vir de atendimentos
    // diferentes, é receita de um paciente no nome de outro. Só imprime quando
    // o agendamento carregado é o da barra de endereço e o nome do paciente
    // está de fato disponível.
    if (!agendamento || agendamento.id !== agendamentoId || !pacienteId || !pacienteNome) {
      toast.error("Os dados do paciente ainda não carregaram.", {
        description: "Aguarde o nome aparecer no topo da tela antes de imprimir.",
      });
      return;
    }
    // CPF e nascimento vêm de outra consulta ao banco. Se o que está em
    // memória for de outro paciente, imprime sem eles em vez de imprimir
    // errado — o documento continua válido, só sem esses dois campos.
    const dadosDoPaciente = paciente?.id === pacienteId ? paciente : null;
    let conteudo = "";
    let rodapeTexto: string | null = null;
    if (tipo === "receita") {
      conteudo = prescItens.length ? prescricaoParaTexto(prescItens) : soap.prescricao;
      rodapeTexto = "Em caso de reação adversa, suspender o uso e procurar atendimento médico.";
    } else if (tipo === "exames") {
      conteudo = examesTexto.trim() || soap.conduta;
      rodapeTexto =
        cidsTexto || soap.hipotese_diagnostica
          ? `Hipótese diagnóstica: ${cidsTexto || soap.hipotese_diagnostica}`
          : null;
    } else if (tipo === "atestado") {
      const dias = Math.max(1, Number(atestadoDias) || 1);
      conteudo =
        `Atesto, para os devidos fins, que o(a) paciente acima identificado(a) esteve sob meus cuidados ` +
        `profissionais nesta data, necessitando de ${dias} (${dias === 1 ? "um" : dias}) dia(s) de afastamento ` +
        `de suas atividades a partir de ${new Date().toLocaleDateString("pt-BR")}.`;
      rodapeTexto = cidsTexto ? `CID (mediante autorização do paciente): ${cidsTexto}` : null;
    } else {
      conteudo = soap.conduta;
    }
    if (!conteudo.trim()) {
      toast.error("Preencha o conteúdo antes de imprimir.");
      return;
    }
    const ok = imprimirDocumentoA4({
      tipo,
      clinica: dadosClinicaDoc,
      medico: {
        nome: medico?.nome ?? "",
        crm: medico?.crm ?? null,
        crmUf: medico?.crm_uf ?? null,
        especialidade: especialidadeMedico || null,
      },
      paciente: {
        nome: pacienteNome,
        cpf: dadosDoPaciente?.cpf ?? null,
        dataNascimento: dadosDoPaciente?.data_nascimento ?? null,
      },
      conteudo,
      rodapeTexto,
    });
    if (!ok) toast.error("Permita pop-ups para imprimir.");
  }

  if (salvo) {
    return (
      <div className="space-y-4 p-1 max-w-2xl mx-auto">
        <Card className="p-8 text-center space-y-4">
          <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
          <h1 className="text-xl font-semibold">Prontuário salvo</h1>
          <p className="text-sm text-muted-foreground">
            O atendimento de <b className="text-foreground uppercase">{pacienteNome}</b> foi
            registrado.
            {salvo.valorMedico > 0 && (
              <>
                {" "}
                Repasse médico: <b className="text-foreground">R$ {salvo.valorMedico.toFixed(2)}</b>
                .
              </>
            )}
          </p>
          <Button size="lg" onClick={() => navigate({ to: backTo })}>
            <ArrowLeft className="h-4 w-4" />{" "}
            {cameFromAgendaV2 ? backLabel : "Voltar para fila de atendimento"}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1">
      {/* Aviso fixo, não um toast: some da tela é justamente o que não pode
          acontecer aqui — enquanto a triagem não carrega, o bloco de alergias
          não aparece, e o médico precisa saber que a ausência é falha de
          carregamento, não ausência de alergia. */}
      {triagemIndisponivel && (
        <Card className="border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <div className="font-semibold text-destructive">
                Triagem da enfermagem não carregou
              </div>
              <p className="text-sm text-foreground/80">
                Alergias, sinais vitais e comorbidades podem não estar sendo exibidos. Não considere
                que o paciente não tem alergias — recarregue a página ou confirme com a enfermagem
                antes de prescrever.
              </p>
            </div>
          </div>
        </Card>
      )}
      {pagamento && !pagamento.pago && (
        <Card className="p-4 border-amber-400 bg-amber-50/60 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <HeartPulse className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900 dark:text-amber-200">
                Pagamento pendente — consulta requer pagamento antecipado
              </div>
              <p className="text-sm text-amber-800/80 dark:text-amber-200/80">
                Envie o paciente ao caixa antes de iniciar o atendimento. O prontuário fica
                disponível somente após a confirmação do pagamento.
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" asChild>
                  <Link to="/app/caixa">Abrir caixa</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to={backTo}>{backLabel}</Link>
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Stethoscope className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">
              Atendimento — <span className="uppercase">{pacienteNome || "…"}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {medico?.nome ? (
                <>
                  Profissional: <b className="text-foreground uppercase">{medico.nome}</b>
                </>
              ) : (
                "Carregando…"
              )}
              {especialidadeMedico && <> · {especialidadeMedico}</>}
            </p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link to={backTo}>
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Link>
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResumir}
            disabled={loading === "resumir" || !pacienteId}
          >
            {loading === "resumir" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <History className="h-4 w-4" />
            )}
            Resumir histórico
          </Button>
        </div>
        {resumo && (
          <Collapsible open={resumoOpen} onOpenChange={setResumoOpen} className="mt-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start">
                <FileText className="h-4 w-4 mr-2 text-primary" />
                Resumo do histórico {resumoOpen ? "▲" : "▼"}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {resumo}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </Card>

      {triagem && (
        <Card className="p-4 space-y-3 border-rose-200/60 dark:border-rose-900/40">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-rose-500" />
              <h2 className="font-semibold">Triagem da enfermagem</h2>
              {triagem.enfermeira_nome && (
                <Badge variant="secondary" className="text-[11px]">
                  Por {triagem.enfermeira_nome}
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {new Date(triagem.created_at).toLocaleString("pt-BR")}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
            {[
              ["Peso", triagem.peso_kg, "kg"],
              ["Altura", triagem.altura_cm, "cm"],
              ["IMC", triagem.imc, ""],
              [
                "PA",
                triagem.pa_sistolica && triagem.pa_diastolica
                  ? `${triagem.pa_sistolica}/${triagem.pa_diastolica}`
                  : null,
                "mmHg",
              ],
              ["FC", triagem.freq_cardiaca, "bpm"],
              ["Temp.", triagem.temperatura, "°C"],
              ["SatO₂", triagem.saturacao, "%"],
              ["Glicemia", triagem.glicemia, "mg/dL"],
            ]
              .filter(([, v]) => v !== null && v !== undefined && v !== "")
              .map(([label, value, unit]) => (
                <div key={String(label)} className="rounded-md border bg-muted/30 p-2">
                  <div className="text-[11px] uppercase text-muted-foreground">
                    {label as string}
                  </div>
                  <div className="font-semibold tabular-nums">
                    {String(value)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {unit as string}
                    </span>
                  </div>
                </div>
              ))}
          </div>
          {(triagem.queixa_principal ||
            (triagem.doencas && triagem.doencas.length) ||
            triagem.medicamentos ||
            triagem.alergias ||
            triagem.observacoes) && (
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              {triagem.queixa_principal && (
                <div className="rounded-md border p-2">
                  <div className="text-[11px] uppercase text-muted-foreground">
                    Queixa principal
                  </div>
                  <div>{triagem.queixa_principal}</div>
                </div>
              )}
              {triagem.doencas && triagem.doencas.length > 0 && (
                <div className="rounded-md border p-2">
                  <div className="text-[11px] uppercase text-muted-foreground">
                    Doenças pré-existentes
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {triagem.doencas.map((d, i) => (
                      <Badge key={i} variant="outline" className="text-[11px]">
                        {d}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {triagem.medicamentos && (
                <div className="rounded-md border p-2">
                  <div className="text-[11px] uppercase text-muted-foreground">
                    Medicamentos em uso
                  </div>
                  <div>{triagem.medicamentos}</div>
                </div>
              )}
              {triagem.alergias && (
                <div className="rounded-md border p-2">
                  <div className="text-[11px] uppercase text-muted-foreground">Alergias</div>
                  <div>{triagem.alergias}</div>
                </div>
              )}
              {triagem.observacoes && (
                <div className="rounded-md border p-2 sm:col-span-2">
                  <div className="text-[11px] uppercase text-muted-foreground">
                    Observações da enfermagem
                  </div>
                  <div className="whitespace-pre-wrap">{triagem.observacoes}</div>
                </div>
              )}
            </div>
          )}
          <div className="text-[12px] text-muted-foreground flex items-center gap-1">
            <FileHeart className="h-3.5 w-3.5" />
            Dados aplicados automaticamente ao prontuário
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Transcrição da consulta</h2>
            </div>
            <VoiceInput
              size="sm"
              currentValue={transcricao}
              onTranscript={(t) => {
                setTranscricao(t);
                void handleEstruturar(t);
              }}
              append
              prompt="Transcreva fielmente a conversa entre médico e paciente em português do Brasil. Retorne apenas o texto, sem rótulos."
              title="Gravar conversa — preenche o prontuário automaticamente"
            />
          </div>
          <Textarea
            rows={14}
            value={transcricao}
            onChange={(e) => setTranscricao(e.target.value)}
            placeholder="Clique no microfone para gravar a consulta, ou cole/digite aqui o relato…"
          />
          <Button
            onClick={() => handleEstruturar()}
            disabled={loading === "estruturar"}
            className="w-full"
          >
            {loading === "estruturar" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ListChecks className="h-4 w-4" />
            )}
            Estruturar prontuário
          </Button>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <FileHeart className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Prontuário ({especialidade})</h2>
            </div>
            <span className="text-[12px] text-muted-foreground flex items-center gap-1">
              {rascunhoEm ? (
                <>
                  <Cloud className="h-3.5 w-3.5 text-emerald-500" /> Rascunho salvo{" "}
                  {rascunhoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </>
              ) : (
                <>
                  <CloudOff className="h-3.5 w-3.5" /> Auto-save ativo
                </>
              )}
            </span>
          </div>

          {triagem?.alergias && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div className="text-sm">
                <span className="font-semibold text-destructive uppercase text-[12px] tracking-wide">
                  Alergias (triagem)
                </span>
                <div className="text-foreground">{triagem.alergias}</div>
              </div>
            </div>
          )}

          <Tabs defaultValue="qp">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="qp">QP & HMA</TabsTrigger>
              <TabsTrigger value="hist">Histórico / Alergias</TabsTrigger>
              <TabsTrigger value="ef">Exame físico</TabsTrigger>
              <TabsTrigger value="hd">Hipótese (CID-10)</TabsTrigger>
              <TabsTrigger value="cond">Conduta</TabsTrigger>
              <TabsTrigger value="presc">Prescrição</TabsTrigger>
            </TabsList>

            <TabsContent value="qp" className="space-y-3 mt-3">
              <CampoClinico
                rotulo="Queixa principal"
                valor={soap.queixa_principal}
                rows={3}
                onChange={(v) => setSoap((s) => ({ ...s, queixa_principal: v }))}
              />
              <CampoClinico
                rotulo="História da doença atual (HMA)"
                valor={soap.historia_doenca}
                rows={6}
                macros={macrosPorCampo("historia_doenca")}
                onMacro={aplicarMacro}
                onChange={(v) => setSoap((s) => ({ ...s, historia_doenca: v }))}
              />
            </TabsContent>

            <TabsContent value="hist" className="space-y-3 mt-3">
              {triagem ? (
                <div className="grid sm:grid-cols-2 gap-2 text-sm">
                  {triagem.medicamentos && (
                    <div className="rounded-md border p-2">
                      <div className="text-[11px] uppercase text-muted-foreground">
                        Medicamentos em uso
                      </div>
                      <div>{triagem.medicamentos}</div>
                    </div>
                  )}
                  {triagem.doencas && triagem.doencas.length > 0 && (
                    <div className="rounded-md border p-2">
                      <div className="text-[11px] uppercase text-muted-foreground">
                        Comorbidades
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {triagem.doencas.map((d, i) => (
                          <Badge key={i} variant="outline" className="text-[11px]">
                            {d}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {triagem.alergias && (
                    <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2 sm:col-span-2">
                      <div className="text-[11px] uppercase text-destructive font-semibold">
                        Alergias
                      </div>
                      <div>{triagem.alergias}</div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sem triagem registrada para este atendimento.
                </p>
              )}
            </TabsContent>

            <TabsContent value="ef" className="space-y-3 mt-3">
              <CampoClinico
                rotulo="Exame físico"
                valor={soap.exame_fisico}
                rows={10}
                macros={macrosPorCampo("exame_fisico")}
                onMacro={aplicarMacro}
                onChange={(v) => setSoap((s) => ({ ...s, exame_fisico: v }))}
              />
            </TabsContent>

            <TabsContent value="hd" className="space-y-3 mt-3">
              <Label className="text-xs uppercase text-muted-foreground">Busca CID-10</Label>
              <Cid10Autocomplete
                selecionados={cids}
                onAdd={(c) => {
                  if (cids.some((x) => x.codigo === c.codigo)) return;
                  setCids([...cids, c]);
                  addToHipotese(`[CID ${c.codigo} — ${c.descricao}]`);
                }}
                onRemove={(codigo) => setCids(cids.filter((c) => c.codigo !== codigo))}
              />
              <CampoClinico
                rotulo="Hipótese diagnóstica"
                valor={soap.hipotese_diagnostica}
                rows={5}
                onChange={(v) => setSoap((s) => ({ ...s, hipotese_diagnostica: v }))}
              />
            </TabsContent>

            <TabsContent value="cond" className="space-y-3 mt-3">
              <CampoClinico
                rotulo="Conduta / plano terapêutico"
                valor={soap.conduta}
                rows={8}
                macros={macrosPorCampo("conduta")}
                onMacro={aplicarMacro}
                onChange={(v) => setSoap((s) => ({ ...s, conduta: v }))}
              />
              <div className="space-y-1">
                <Label className="text-xs uppercase text-muted-foreground">
                  Exames solicitados (documento A4)
                </Label>
                <Textarea
                  rows={4}
                  value={examesTexto}
                  onChange={(e) => setExamesTexto(e.target.value)}
                  placeholder="Um exame por linha — ex.: Hemograma completo"
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs uppercase text-muted-foreground">
                    Dias de atestado
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9 w-24"
                    value={atestadoDias}
                    onChange={(e) => setAtestadoDias(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => imprimirA4("atestado")}
                  className="gap-1"
                >
                  <FileText className="h-3.5 w-3.5" /> Imprimir atestado (A4)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => imprimirA4("exames")}
                  className="gap-1"
                >
                  <FlaskConical className="h-3.5 w-3.5" /> Imprimir exames (A4)
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="presc" className="space-y-3 mt-3">
              <div className="flex flex-wrap gap-1">
                {macrosPorCampo("prescricao").map((m) => (
                  <button
                    key={m.rotulo}
                    type="button"
                    onClick={() => aplicarMacro(m)}
                    className="text-[12px] rounded-full border px-2 py-0.5 hover:bg-primary hover:text-primary-foreground transition-colors flex items-center gap-1"
                  >
                    <Zap className="h-3 w-3" /> {m.rotulo}
                  </button>
                ))}
              </div>
              <PrescricaoBuilder itens={prescItens} onChange={setPrescItens} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => imprimirA4("receita")}
                className="gap-1"
              >
                <Pill className="h-3.5 w-3.5" /> Imprimir receita (A4)
              </Button>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Apoio Clínico</h2>
          <span className="text-[12px] text-muted-foreground">Sugestões sob julgamento médico</span>
        </div>

        {/* Duas frentes do mesmo apoio à decisão, lado a lado em vez de
            espalhadas pela tela: sugestões estruturadas a partir do prontuário
            já preenchido, e análise conversacional sobre a anamnese livre. */}
        <Tabs defaultValue="sugestoes">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="sugestoes" className="gap-1.5">
              <ListChecks className="h-3.5 w-3.5" />
              Sugestões estruturadas
            </TabsTrigger>
            <TabsTrigger value="analise" className="gap-1.5">
              <MessagesSquare className="h-3.5 w-3.5" />
              Análise do caso
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sugestoes" className="space-y-3 pt-3">
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSugerir}
                disabled={loading === "sugerir"}
              >
                {loading === "sugerir" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ListChecks className="h-4 w-4" />
                )}
                Sugerir CID, exames e prescrição
              </Button>
            </div>
            {!sugestoes ? (
              <p className="text-sm text-muted-foreground">
                Preencha o prontuário e clique em "Sugerir" para receber propostas de CID, exames e
                prescrição.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">
                    CIDs sugeridos (clique para adicionar)
                  </Label>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {sugestoes.cids.length === 0 && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {sugestoes.cids.map((c, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                        onClick={() => addToHipotese(`[CID ${c.codigo} — ${c.descricao}]`)}
                      >
                        {c.codigo} · {c.descricao}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">
                    Exames sugeridos
                  </Label>
                  <ul className="list-disc pl-5 text-sm space-y-0.5 mt-1">
                    {sugestoes.exames.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                  {sugestoes.exames.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() =>
                        setSoap((s) => ({
                          ...s,
                          conduta: `${s.conduta}${s.conduta ? "\n" : ""}Solicito: ${sugestoes.exames.join(", ")}.`,
                        }))
                      }
                    >
                      Adicionar à conduta
                    </Button>
                  )}
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">
                    Prescrição sugerida
                  </Label>
                  <pre className="text-sm whitespace-pre-wrap rounded-md bg-muted/30 p-3 mt-1 border">
                    {sugestoes.prescricao || "—"}
                  </pre>
                  {sugestoes.prescricao && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => setSoap((s) => ({ ...s, prescricao: sugestoes.prescricao }))}
                    >
                      Usar como prescrição
                    </Button>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* forceMount: sem ele o Radix desmonta a aba inativa, e o médico
              perderia a análise inteira só de olhar as sugestões estruturadas.
              O `hidden` do próprio Radix cuida de esconder. */}
          <TabsContent value="analise" forceMount className="pt-3 data-[state=inactive]:hidden">
            <ApoioClinico
              clinicaId={clinicaAtual?.clinica_id ?? null}
              especialidade={especialidade}
              montarContexto={montarContextoClinico}
              habilitado={podeApoioClinico}
            />
          </TabsContent>
        </Tabs>
      </Card>

      <div className="flex justify-end gap-2 flex-wrap">
        <Button
          variant="outline"
          size="lg"
          onClick={() => imprimirA4("receita")}
          disabled={!prescItens.length && !soap.prescricao.trim()}
        >
          <Pill className="h-4 w-4" /> Imprimir receita (A4)
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => imprimirA4("exames")}
          disabled={!examesTexto.trim() && !soap.conduta.trim()}
        >
          <FlaskConical className="h-4 w-4" /> Imprimir exames (A4)
        </Button>
        <Button variant="outline" size="lg" onClick={() => imprimirA4("atestado")}>
          <FileText className="h-4 w-4" /> Imprimir atestado (A4)
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => imprimirA4("conduta")}
          disabled={!soap.conduta.trim()}
        >
          <Printer className="h-4 w-4" /> Imprimir conduta
        </Button>
        {podeEscrever && (
          <Button
            size="lg"
            onClick={handleSalvar}
            disabled={loading === "salvar" || !pacienteId || (pagamento ? !pagamento.pago : false)}
            title={pagamento && !pagamento.pago ? "Pagamento pendente" : undefined}
          >
            {loading === "salvar" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Finalizar atendimento
          </Button>
        )}
      </div>
    </div>
  );
}

function CampoClinico({
  rotulo,
  valor,
  rows,
  onChange,
  macros,
  onMacro,
  oculto,
}: {
  rotulo: string;
  valor: string;
  rows: number;
  onChange?: (v: string) => void;
  macros?: Macro[];
  onMacro?: (m: Macro) => void;
  oculto?: boolean;
}) {
  if (oculto) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label>{rotulo}</Label>
        {macros && macros.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {macros.map((m) => (
              <button
                key={m.rotulo}
                type="button"
                onClick={() => onMacro?.(m)}
                className="text-[12px] rounded-full border px-2 py-0.5 hover:bg-primary hover:text-primary-foreground transition-colors flex items-center gap-1"
              >
                <Zap className="h-3 w-3" /> {m.rotulo}
              </button>
            ))}
          </div>
        )}
      </div>
      <Textarea rows={rows} value={valor} onChange={(e) => onChange?.(e.target.value)} />
    </div>
  );
}
