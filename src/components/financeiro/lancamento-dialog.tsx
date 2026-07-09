import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { SupervisorAuthDialog } from "@/components/supervisor-auth-dialog";

type Tipo = "receita" | "despesa";

export interface LancamentoSavedData {
  valor: number;
  forma_pagamento: string | null;
  parcelas: number | null;
  bandeira_cartao: string | null;
  emitir_nfse: boolean;
  pagamentos_detalhe?: Array<{ forma: string; pago: number; troco: number; recebido: number }>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo: Tipo;
  onSaved?: () => void;
  onSavedWithData?: (data: LancamentoSavedData) => void;
  initialDescricao?: string;
  initialValor?: string;
  agendamentoId?: string | null;
  initialFormaPagamento?: string;
  /** Nome exato da categoria a fixar (ex.: "MENSALIDADE CARTAO CONSULTA"). Quando setado, o select fica desabilitado. */
  categoriaFixaNome?: string;
}

export function LancamentoDialog({ open, onOpenChange, tipo, onSaved, onSavedWithData, initialDescricao, initialValor, agendamentoId, initialFormaPagamento, categoriaFixaNome }: Props) {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const role = clinicaAtual?.role ?? null;
  // Qualquer atendente pode SOLICITAR desconto, mas a aplicação exige
  // autorização (e-mail + senha) de admin, gestor ou financeiro.
  // Quando o próprio usuário já é supervisor, dispensamos o segundo login.
  const ehSupervisor = role === "admin" || role === "gestor" || role === "financeiro";
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [contaId, setContaId] = useState<string>("");
  const [formaPagamento, setFormaPagamento] = useState<string>("");
  const [bandeiraCartao, setBandeiraCartao] = useState<string>("");
  const [parcelas, setParcelas] = useState<string>("1");
  const [emitirNfse, setEmitirNfse] = useState<boolean>(false);
  const [observacoes, setObservacoes] = useState("");
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [valorRecebido, setValorRecebido] = useState("");
  const [pagamentoMisto, setPagamentoMisto] = useState(false);
  const [pagamentos, setPagamentos] = useState<Array<{ forma: string; recebido: string; bandeira?: string; parcelas?: string }>>([
    { forma: "dinheiro", recebido: "" },
  ]);
  // ----- Desconto (apenas para gerente/admin/financeiro) -----
  const [descontoAtivo, setDescontoAtivo] = useState(false);
  const [descontoTipo, setDescontoTipo] = useState<"valor" | "percentual">("valor");
  const [descontoInput, setDescontoInput] = useState("");
  const [descontoAutorizado, setDescontoAutorizado] = useState("");
  const [descontoMotivo, setDescontoMotivo] = useState("");
  const [valorOriginal, setValorOriginal] = useState<string>("");
  const [supervisorOpen, setSupervisorOpen] = useState(false);
  const [supervisorInfo, setSupervisorInfo] = useState<{ userId: string; nome: string; role: string } | null>(null);
  // ----- Cortesia (categoria especial: exige justificativa + supervisor) -----
  const [cortesiaJustificativa, setCortesiaJustificativa] = useState("");
  // Marca a intenção da autenticação do supervisor: "desconto" | "cortesia"
  const [authIntent, setAuthIntent] = useState<"desconto" | "cortesia">("desconto");
  // Bloqueio: paciente com mensalidade vencida no cartão benefícios.
  // Quando bloqueado, o pagamento só pode ser feito como Particular.
  const [bloqueioCartao, setBloqueioCartao] = useState<{
    bloqueado: boolean;
    totalAberto: number;
    qtdAtrasadas: number;
    convenioNome: string | null;
  } | null>(null);
  // Tipo de atendimento definido no agendamento ("convenio" | "particular" | null).
  const [tipoAgendamento, setTipoAgendamento] = useState<string | null>(null);
  // Nome do convênio do contrato ativo (usado para detectar categoria "de convênio").
  const [convenioNome, setConvenioNome] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !clinicaAtual) return;
    if (initialDescricao !== undefined) setDescricao(initialDescricao);
    if (initialValor !== undefined) setValor(initialValor);
    if (initialValor !== undefined) setValorOriginal(initialValor);
    // Reseta desconto a cada abertura
    setDescontoAtivo(false); setDescontoTipo("valor");
    setDescontoInput(""); setDescontoAutorizado(""); setDescontoMotivo("");
    setSupervisorInfo(null); setSupervisorOpen(false);
    setCortesiaJustificativa(""); setAuthIntent("desconto");
    setBloqueioCartao(null); setTipoAgendamento(null); setConvenioNome(null);
    // Reset dos campos de pagamento: evita que estado remanescente de uma
    // abertura anterior (ex.: linhas mistas sem bandeira, bandeira já
    // preenchida em outro atendimento) bloqueie o Save do próximo pagamento.
    setBandeiraCartao("");
    setParcelas("1");
    setValorRecebido("");
    setPagamentoMisto(false);
    setPagamentos([{ forma: "dinheiro", recebido: "" }]);
    setEmitirNfse(false);
    setObservacoes("");
    if (initialFormaPagamento !== undefined) {
      if (initialFormaPagamento === "__misto__") {
        setPagamentoMisto(true);
        setFormaPagamento("");
      } else {
        setFormaPagamento(initialFormaPagamento);
      }
    } else {
      setFormaPagamento("");
    }
    (async () => {
      const [{ data: cats }, { data: cs }] = await Promise.all([
        supabase.from("fin_categorias").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("tipo", tipo).eq("ativo", true).order("nome"),
        supabase.from("fin_contas").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      ]);
      const lista = cats ?? [];
      setCategorias(lista);
      const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const listaContas = cs ?? [];
      setContas(listaContas);
      const caixa = listaContas.find((c) => norm(c.nome) === "caixa");
      if (caixa) setContaId((cur) => cur || caixa.id);
      // Categoria fixa tem prioridade absoluta (ex.: pagamento de mensalidade)
      if (categoriaFixaNome) {
        const fixa = lista.find((c) => norm(c.nome) === norm(categoriaFixaNome));
        if (fixa) setCategoriaId(fixa.id);
        return;
      }
      const particular = lista.find((c) => norm(c.nome) === "particular");
      // Default: paciente comum (sem convênio ativo) → PARTICULAR.
      // Se o agendamento estiver vinculado a um paciente com contrato de
      // convênio ativo, tenta casar a categoria com o nome do convênio.
      let categoriaEscolhidaId: string | null = particular?.id ?? null;
      if (agendamentoId) {
        try {
          const { data: ag } = await supabase
            .from("agendamentos")
            .select("paciente_id, tipo_atendimento")
            .eq("id", agendamentoId)
            .maybeSingle();
          const pid = ag?.paciente_id ?? null;
          const tipoAg = (ag as { tipo_atendimento?: string | null } | null)?.tipo_atendimento ?? null;
          setTipoAgendamento(tipoAg);
          if (pid) {
            const { data: contrato } = await supabase
              .from("contratos_assinatura")
              .select("convenio_id, cb_convenios:convenio_id(nome)")
              .eq("paciente_id", pid)
              .eq("status", "ativo")
              .is("cancelado_em", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const convNome = (contrato as { cb_convenios?: { nome?: string } } | null)?.cb_convenios?.nome;
            if (convNome) setConvenioNome(convNome);
            // Só sugere a categoria do convênio quando o agendamento foi
            // marcado como "convenio". Se for "particular", mantém a
            // categoria PARTICULAR (não força o operador a mudar).
            if (convNome && tipoAg !== "particular") {
              const match = lista.find((c) => norm(c.nome) === norm(convNome));
              if (match) categoriaEscolhidaId = match.id;
            }
            // Verifica débito no cartão benefícios do paciente.
            const { data: blk } = await supabase.rpc("paciente_cartao_inadimplente", {
              _paciente_id: pid,
              _clinica_id: clinicaAtual.clinica_id,
            });
            const info = (blk ?? {}) as {
              bloqueado?: boolean;
              total_aberto?: number;
              mensalidades?: Array<{ vencimento: string; valor: number; convenio_nome?: string }>;
            };
            if (info.bloqueado) {
              setBloqueioCartao({
                bloqueado: true,
                totalAberto: Number(info.total_aberto ?? 0),
                qtdAtrasadas: (info.mensalidades ?? []).length,
                convenioNome: convNome ?? null,
              });
              // Força categoria = Particular para não induzir o operador ao erro.
              if (particular) categoriaEscolhidaId = particular.id;
            }
          }
        } catch {
          // silencioso: mantém PARTICULAR como padrão
        }
      }
      if (categoriaEscolhidaId) setCategoriaId((cur) => cur || categoriaEscolhidaId!);
    })();
  }, [open, clinicaAtual, tipo, agendamentoId, categoriaFixaNome]);

  const formatBRL = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const valorNum = Number(valor || 0);
  // Calcula desconto efetivo em R$ a partir do tipo selecionado.
  const origNum = Number(valorOriginal || initialValor || 0);
  const descontoNum = (() => {
    if (!descontoAtivo) return 0;
    const n = Number(descontoInput || 0);
    if (!isFinite(n) || n <= 0) return 0;
    if (descontoTipo === "percentual") {
      const pct = Math.min(100, Math.max(0, n));
      return Math.round((origNum * pct) / 100 * 100) / 100;
    }
    return Math.min(origNum, Math.round(n * 100) / 100);
  })();
  // Mantém o `valor` (total a pagar) sincronizado com o desconto.
  useEffect(() => {
    if (!open) return;
    if (!valorOriginal) return;
    const novo = Math.max(0, origNum - descontoNum);
    setValor(novo.toFixed(2));
  }, [descontoAtivo, descontoInput, descontoTipo, valorOriginal, origNum, descontoNum, open]);
  const recebidoNum = Number(valorRecebido || 0);
  const trocoDinheiro = formaPagamento === "dinheiro" && recebidoNum > valorNum
    ? recebidoNum - valorNum
    : 0;
  // Compute "pago" (effective amount applied to total) and "troco" per row.
  // Cash: pago = min(recebido, remaining-before-this-row); excess = troco.
  // Other forms: pago = recebido, troco = 0.
  const linhasCalc = (() => {
    let restante = valorNum;
    return pagamentos.map((p) => {
      const rec = Number(p.recebido || 0);
      let pago = 0, troco = 0;
      if (p.forma === "dinheiro") {
        pago = Math.min(rec, Math.max(0, restante));
        troco = Math.max(0, rec - pago);
      } else {
        pago = rec;
      }
      restante = Math.max(0, restante - pago);
      return { pago, troco };
    });
  })();
  const totalPagoMisto = linhasCalc.reduce((s, l) => s + l.pago, 0);
  const restanteMisto = Math.max(0, valorNum - totalPagoMisto);
  const trocoMisto = linhasCalc.reduce((s, l) => s + l.troco, 0);
  const FORMAS_LABEL: Record<string, string> = {
    dinheiro: "Dinheiro",
    pix: "Pix",
    cartao_credito: "Cartão Crédito",
    cartao_debito: "Cartão Débito",
    boleto: "Boleto",
    convenio: "Convênio",
    transferencia: "Transferência",
  };

  const handleSave = async () => {
    if (!clinicaAtual) return;
    if (!descricao.trim() || !valor) {
      toast.error("Descrição e valor são obrigatórios");
      return;
    }
    if (valorNum <= 0) {
      toast.error("O valor do pagamento deve ser maior que zero.");
      return;
    }
    // ----- Cortesia: exige justificativa + autorização de supervisor -----
    const norm0 = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const catAtual = categorias.find((c) => c.id === categoriaId) ?? null;
    const ehCortesia = !!(catAtual && norm0(catAtual.nome) === "cortesia");
    if (ehCortesia) {
      if (!cortesiaJustificativa.trim()) {
        toast.error("Informe a justificativa da cortesia.");
        return;
      }
      if (!ehSupervisor && !supervisorInfo) {
        toast.error("É necessária a autorização de um supervisor para aplicar cortesia.");
        setAuthIntent("cortesia");
        setSupervisorOpen(true);
        return;
      }
    }
    // Bloqueio por débito no cartão benefícios — só libera se o pagamento
    // for feito como Particular.
    if (bloqueioCartao?.bloqueado) {
      const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const catEscolhida = categorias.find((c) => c.id === categoriaId) ?? null;
      const catEhConvenio = !!(catEscolhida && convenioNome && norm(catEscolhida.nome) === norm(convenioNome));
      const formaEhConvenio = !pagamentoMisto && formaPagamento === "convenio";
      const mistoTemConvenio = pagamentoMisto && pagamentos.some((p) => p.forma === "convenio" && Number(p.recebido || 0) > 0);
      if (catEhConvenio || formaEhConvenio || mistoTemConvenio) {
        toast.error(
          `Paciente com R$ ${bloqueioCartao.totalAberto.toFixed(2)} em atraso no cartão benefícios (${bloqueioCartao.qtdAtrasadas} parcela(s)). Este atendimento só pode ser pago como Particular — troque a categoria/forma e tente novamente.`,
          { duration: 10000 },
        );
        return;
      }
    }
    setSaving(true);
    if (descontoAtivo) {
      if (!supervisorInfo && !ehSupervisor) {
        toast.error("É necessária a autorização de um supervisor para aplicar desconto.");
        setSaving(false); return;
      }
      if (descontoNum <= 0) {
        toast.error("Informe um valor de desconto maior que zero.");
        setSaving(false); return;
      }
      if (!descontoAutorizado.trim()) {
        toast.error("Informe quem autorizou o desconto.");
        setSaving(false); return;
      }
    }
    // H2 — Roda jaPago + agendamento em paralelo. Antes eram duas queries
    // seriais (jaPago aqui, agendamento mais abaixo) e ainda uma 3ª query
    // duplicada para procedimento dentro do bloco de splits.
    type AgPrefetch = { medico_id: string | null; paciente_id: string | null; procedimento: string | null };
    let agPrefetch: AgPrefetch | null = null;
    if (agendamentoId) {
      const [jaPagoRes, agRes] = await Promise.all([
        tipo === "receita"
          ? supabase
              .from("fin_lancamentos")
              .select("id")
              .eq("agendamento_id", agendamentoId)
              .eq("tipo", "receita")
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("agendamentos")
          .select("medico_id, paciente_id, procedimento")
          .eq("id", agendamentoId)
          .maybeSingle(),
      ]);
      if (tipo === "receita" && jaPagoRes.data) {
        toast.error("Este agendamento já possui um pagamento registrado.");
        setSaving(false);
        onOpenChange(false);
        return;
      }
      agPrefetch = (agRes.data as AgPrefetch | null) ?? null;
    }
    const isCredito = formaPagamento === "cartao_credito";
    if (isCredito && !bandeiraCartao) {
      toast.error("Selecione a bandeira do cartão");
      setSaving(false);
      return;
    }
    if (!pagamentoMisto && formaPagamento === "dinheiro") {
      if (valorRecebido && recebidoNum > 0 && recebidoNum + 0.005 < valorNum) {
        toast.error(`Valor recebido (${formatBRL(recebidoNum)}) é menor que o total (${formatBRL(valorNum)})`);
        setSaving(false);
        return;
      }
    }
    let formaFinal: string | null = formaPagamento || null;
    let obsExtra = "";
    if (pagamentoMisto) {
      const validIdx = pagamentos
        .map((p, i) => ({ p, i }))
        .filter(({ p, i }) => p.forma && linhasCalc[i].pago > 0);
      if (validIdx.length === 0) {
        toast.error("Adicione ao menos uma forma de pagamento");
        setSaving(false); return;
      }
      const dinheiroInvalido = validIdx.find(({ p, i }) => {
        if (p.forma !== "dinheiro") return false;
        const rec = Number(p.recebido || 0);
        return rec <= 0 || rec + 0.005 < linhasCalc[i].pago;
      });
      if (dinheiroInvalido) {
        toast.error("Informe o valor recebido em dinheiro em todas as linhas (deve cobrir o valor pago).");
        setSaving(false); return;
      }
      const creditoSemBandeira = validIdx.find(({ p }) => p.forma === "cartao_credito" && !p.bandeira);
      if (creditoSemBandeira) {
        toast.error("Selecione a bandeira do cartão em todas as linhas de Cartão Crédito.");
        setSaving(false); return;
      }
      const total = validIdx.reduce((s, { i }) => s + linhasCalc[i].pago, 0);
      if (Math.abs(total - valorNum) > 0.01) {
        toast.error(`Soma das formas (${formatBRL(total)}) difere do valor (${formatBRL(valorNum)})`);
        setSaving(false); return;
      }
      formaFinal = "misto";
      obsExtra = "Pagamento misto: " + validIdx.map(({ p, i }) => {
        const { pago, troco } = linhasCalc[i];
        const base = `${FORMAS_LABEL[p.forma] ?? p.forma} ${formatBRL(pago)}`;
        if (p.forma === "dinheiro" && troco > 0) {
          return `${base} (recebido ${formatBRL(Number(p.recebido))}, troco ${formatBRL(troco)})`;
        }
        if (p.forma === "cartao_credito") {
          const parc = Number(p.parcelas || 1) || 1;
          const band = (p.bandeira ?? "").toUpperCase();
          return `${base} (${band} ${parc}x)`;
        }
        return base;
      }).join("; ");
    } else if (formaPagamento === "dinheiro" && recebidoNum > 0) {
      obsExtra = `Recebido ${formatBRL(recebidoNum)}, troco ${formatBRL(trocoDinheiro)}`;
    }
    let descontoObs = "";
    if (descontoAtivo && descontoNum > 0) {
      const tipoTxt = descontoTipo === "percentual"
        ? `${Number(descontoInput).toLocaleString("pt-BR")}% = ${formatBRL(descontoNum)}`
        : formatBRL(descontoNum);
      descontoObs = `Desconto aplicado: ${tipoTxt} sobre ${formatBRL(origNum)} — Autorizado por: ${descontoAutorizado.trim()}`
        + (descontoMotivo.trim() ? ` — Motivo: ${descontoMotivo.trim()}` : "");
    }
    let cortesiaObs = "";
    if (ehCortesia) {
      const autor = supervisorInfo?.nome ?? (ehSupervisor ? (user?.email ?? "supervisor") : "");
      cortesiaObs = `Cortesia — Autorizado por: ${autor} — Justificativa: ${cortesiaJustificativa.trim()}`;
    }
    const obsFinal = [observacoes.trim(), cortesiaObs, descontoObs, obsExtra].filter(Boolean).join(" | ") || null;
    // Quando vinculado a um agendamento, busca medico_id e paciente_id
    // para que o repasse médico e os relatórios por paciente funcionem.
    let medicoId: string | null = null;
    let pacienteId: string | null = null;
    if (agPrefetch) {
      medicoId = agPrefetch.medico_id ?? null;
      pacienteId = agPrefetch.paciente_id ?? null;
    }
    // Quando misto tem linha de Cartão Crédito, propagamos bandeira/parcelas
    // da primeira linha de crédito para os campos de topo do lançamento
    // (usados por relatórios e pela impressão da GR).
    const mistoCredito = pagamentoMisto
      ? pagamentos.find((p) => p.forma === "cartao_credito" && Number(p.recebido || 0) > 0)
      : null;
    const bandeiraFinal = isCredito
      ? bandeiraCartao
      : (mistoCredito?.bandeira ?? null);
    const parcelasFinal = isCredito
      ? (Number(parcelas) || 1)
      : (mistoCredito ? (Number(mistoCredito.parcelas || 1) || 1) : null);
    const { data: lancInserido, error } = await supabase.from("fin_lancamentos").insert({
      clinica_id: clinicaAtual.clinica_id,
      tipo,
      descricao: descricao.trim(),
      valor: Number(valor),
      data,
      categoria_id: categoriaId || null,
      conta_id: contaId || null,
      forma_pagamento: formaFinal,
      bandeira_cartao: bandeiraFinal,
      parcelas: parcelasFinal,
      emitir_nfse: emitirNfse,
      observacoes: obsFinal,
      status: "confirmado",
      agendamento_id: agendamentoId ?? null,
      medico_id: medicoId,
      paciente_id: pacienteId,
      criado_por: user?.id ?? null,
    } as never).select("id").single();
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    toast.success(`${tipo === "receita" ? "Receita" : "Despesa"} registrada`);
    // Sincroniza `tipo_atendimento` do agendamento com o que foi pago,
    // para que o check-in e relatórios reflitam a decisão final.
    if (agendamentoId && tipo === "receita") {
      try {
        const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        const catEscolhida = categorias.find((c) => c.id === categoriaId) ?? null;
        const catEhConvenio = !!(catEscolhida && convenioNome && norm(catEscolhida.nome) === norm(convenioNome));
        const formaEhConvenio = !pagamentoMisto && formaPagamento === "convenio";
        const mistoTemConvenio = pagamentoMisto && pagamentos.some((p) => p.forma === "convenio" && Number(p.recebido || 0) > 0);
        const pagouComoConvenio = catEhConvenio || formaEhConvenio || mistoTemConvenio;
        const novoTipo = pagouComoConvenio ? "convenio" : "particular";
        if (novoTipo !== tipoAgendamento) {
          await supabase
            .from("agendamentos")
            .update({ tipo_atendimento: novoTipo } as never)
            .eq("id", agendamentoId);
        }
      } catch (e) {
        console.error("Falha ao sincronizar tipo_atendimento do agendamento:", e);
      }
    }
    // ----- Registra o split de repasse médico ----------------------------
    // Antes esse cálculo só era feito em memória (na hora de imprimir a GR
    // ou nos relatórios). Agora persistimos em `pagamento_splits` para que o
    // histórico de repasses fique rastreável e somável por consulta direta.
    try {
      if (tipo === "receita" && lancInserido?.id && Number(valor) > 0) {
        const splits: Array<{
          clinica_id: string; pagamento_id: string;
          beneficiario_tipo: "medico" | "prestador" | "clinica";
          medico_id: string | null; prestador_id: string | null;
          rotulo: string | null; percentual: number | null; valor: number;
        }> = [];
        // 1) Regras específicas do procedimento (se cadastradas)
        let regrasAplicadas = false;
        if (agendamentoId) {
          // Reusa o prefetch feito antes do insert (H2) — evita 1 query duplicada.
          const procNome = agPrefetch?.procedimento ?? null;
          if (procNome) {
            const { data: procRow } = await supabase
              .from("procedimentos")
              .select("id")
              .eq("clinica_id", clinicaAtual.clinica_id)
              .ilike("nome", procNome).limit(1).maybeSingle();
            const procId = (procRow as { id: string } | null)?.id;
            if (procId) {
              const { data: regras } = await supabase
                .from("procedimento_split_regras")
                .select("beneficiario_tipo, medico_id, prestador_id, rotulo, percentual, valor_fixo")
                .eq("clinica_id", clinicaAtual.clinica_id)
                .eq("procedimento_id", procId)
                .eq("ativo", true);
              const lista = (regras ?? []) as Array<{
                beneficiario_tipo: "medico" | "prestador" | "clinica";
                medico_id: string | null; prestador_id: string | null;
                rotulo: string | null; percentual: number | null; valor_fixo: number | null;
              }>;
              for (const reg of lista) {
                const v = reg.valor_fixo != null
                  ? Number(reg.valor_fixo)
                  : reg.percentual != null
                    ? +(Number(valor) * Number(reg.percentual) / 100).toFixed(2)
                    : 0;
                splits.push({
                  clinica_id: clinicaAtual.clinica_id,
                  pagamento_id: lancInserido.id,
                  beneficiario_tipo: reg.beneficiario_tipo,
                  medico_id: reg.medico_id, prestador_id: reg.prestador_id,
                  rotulo: reg.rotulo,
                  percentual: reg.percentual != null ? Number(reg.percentual) : null,
                  valor: v,
                });
              }
              regrasAplicadas = lista.length > 0;
            }
          }
        }
        // 2) Fallback: usa o repasse padrão do médico vinculado
        if (!regrasAplicadas && medicoId) {
          const { data: med } = await supabase
            .from("medicos")
            .select("tipo_repasse, percentual_repasse_padrao, valor_repasse_padrao")
            .eq("id", medicoId).maybeSingle();
          const m = med as { tipo_repasse: string | null; percentual_repasse_padrao: number | null; valor_repasse_padrao: number | null } | null;
          if (m) {
            const vMed = m.tipo_repasse === "valor_fixo" && m.valor_repasse_padrao != null
              ? Number(m.valor_repasse_padrao)
              : +(Number(valor) * Number(m.percentual_repasse_padrao ?? 0) / 100).toFixed(2);
            if (vMed > 0) {
              splits.push({
                clinica_id: clinicaAtual.clinica_id,
                pagamento_id: lancInserido.id,
                beneficiario_tipo: "medico",
                medico_id: medicoId, prestador_id: null,
                rotulo: "Repasse médico",
                percentual: m.tipo_repasse === "valor_fixo" ? null : Number(m.percentual_repasse_padrao ?? 0),
                valor: vMed,
              });
            }
          }
        }
        // 3) Linha residual da clínica (diferença entre total e somatório)
        const totalSplit = splits.reduce((s, x) => s + Number(x.valor || 0), 0);
        const restoClinica = +(Number(valor) - totalSplit).toFixed(2);
        if (restoClinica > 0) {
          splits.push({
            clinica_id: clinicaAtual.clinica_id,
            pagamento_id: lancInserido.id,
            beneficiario_tipo: "clinica",
            medico_id: null, prestador_id: null,
            rotulo: "Clínica",
            percentual: null,
            valor: restoClinica,
          });
        }
        if (splits.length > 0) {
          const { error: errSplit } = await supabase.from("pagamento_splits").insert(splits as never);
          if (errSplit) console.error("Falha ao gravar splits:", errSplit);
        }
      }
    } catch (e) {
      console.error("Erro no cálculo de splits:", e);
    }
    // Integração com Caixa: registra movimento na sessão aberta do usuário.
    // Se não houver sessão aberta, abre uma automaticamente com valor 0.
    try {
      if (user?.id && Number(valor) > 0) {
        // Pode existir mais de uma sessão aberta por histórico — pega a mais recente
        // em vez de usar maybeSingle() (que retorna erro/null quando há múltiplas)
        // e acabar abrindo uma nova a cada lançamento.
        let { data: sess } = await supabase
          .from("caixa_sessoes")
          .select("id")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("user_id", user.id)
          .eq("status", "aberto")
          .order("aberto_em", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!sess) {
          const nome = (user.user_metadata as { nome?: string } | null)?.nome ?? user.email ?? null;
          const { data: novaSess, error: errSess } = await supabase
            .from("caixa_sessoes")
            .insert({
              clinica_id: clinicaAtual.clinica_id,
              user_id: user.id,
              user_nome: nome,
              valor_abertura: 0,
              status: "aberto",
              observacoes: "Aberto automaticamente pelo sistema",
            } as never)
            .select("id")
            .single();
          if (errSess) throw errSess;
          sess = novaSess;
          // movimento de abertura
          await supabase.from("caixa_movimentos").insert({
            sessao_id: sess!.id,
            clinica_id: clinicaAtual.clinica_id,
            user_id: user.id,
            tipo: "abertura",
            valor: 0,
            descricao: "Abertura automática",
          } as never);
        }
        await supabase.from("caixa_movimentos").insert({
          sessao_id: sess!.id,
          clinica_id: clinicaAtual.clinica_id,
          user_id: user.id,
          tipo: tipo === "receita" ? "recebimento" : "despesa",
          valor: Number(valor),
          descricao: descricao.trim(),
          forma_pagamento: formaFinal,
          lancamento_id: lancInserido?.id ?? null,
        } as never);
      }
    } catch (e) {
      console.error("Falha ao registrar no caixa:", e);
    }
    onSavedWithData?.({
      valor: Number(valor),
      forma_pagamento: formaFinal,
      parcelas: parcelasFinal,
      bandeira_cartao: bandeiraFinal,
      emitir_nfse: emitirNfse,
      pagamentos_detalhe: pagamentoMisto
        ? pagamentos
            .map((p, i) => ({
              forma: p.forma,
              pago: linhasCalc[i].pago,
              troco: linhasCalc[i].troco,
              recebido: Number(p.recebido || 0),
            }))
            .filter((x) => x.forma && x.pago > 0)
        : undefined,
    });
    setDescricao(""); setValor(""); setObservacoes(""); setCategoriaId(""); setContaId(""); setFormaPagamento("");
    setBandeiraCartao(""); setParcelas("1"); setEmitirNfse(false);
    setValorRecebido(""); setPagamentoMisto(false);
    setPagamentos([{ forma: "dinheiro", recebido: "" }]);
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className={tipo === "receita" ? "text-success" : "text-destructive"}>
            Nova {tipo === "receita" ? "Receita" : "Despesa"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto pr-1 -mr-1 flex-1 min-h-0">
          {bloqueioCartao?.bloqueado && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 text-destructive px-3 py-2 text-sm">
              <strong>Cartão benefícios em atraso.</strong> Paciente tem{" "}
              <strong>R$ {bloqueioCartao.totalAberto.toFixed(2)}</strong> em aberto
              ({bloqueioCartao.qtdAtrasadas} parcela(s) vencida(s)). Este atendimento
              só pode ser pago como <strong>Particular</strong> — não use a categoria
              "{bloqueioCartao.convenioNome ?? "Convênio"}" nem a forma "Convênio".
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Consulta João Silva" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor *</Label>
              <CurrencyInput
                value={valor}
                onChange={setValor}
              />
              {!!initialValor && (
                <p className="text-xs text-muted-foreground">Sugerido pelo serviço — editável</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          {tipo === "receita" && !!initialValor && (
            <div className="space-y-2 rounded-md border border-dashed p-3 bg-muted/20">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="aplicar-desconto"
                  checked={descontoAtivo}
                  onCheckedChange={(v) => {
                    if (!v) {
                      setDescontoAtivo(false);
                      setSupervisorInfo(null);
                      setDescontoInput("");
                      setDescontoAutorizado("");
                      setDescontoMotivo("");
                      return;
                    }
                    // Supervisores aplicam direto; demais precisam autorização.
                    if (ehSupervisor) {
                      setDescontoAtivo(true);
                    } else {
                      setAuthIntent("desconto");
                      setSupervisorOpen(true);
                    }
                  }}
                />
                <Label htmlFor="aplicar-desconto" className="cursor-pointer">
                  Aplicar desconto {ehSupervisor ? "" : "(exige autorização do supervisor)"}
                </Label>
                {supervisorInfo && (
                  <span className="ml-auto text-xs text-success">✓ Autorizado por {supervisorInfo.nome}</span>
                )}
              </div>
              {descontoAtivo && (
                <div className="space-y-2">
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo</Label>
                      <Select value={descontoTipo} onValueChange={(v) => setDescontoTipo(v as "valor" | "percentual")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="valor">R$ (valor)</SelectItem>
                          <SelectItem value="percentual">% (percentual)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        {descontoTipo === "percentual" ? "Percentual de desconto" : "Valor do desconto"}
                      </Label>
                      {descontoTipo === "percentual" ? (
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={descontoInput}
                          onChange={(e) => setDescontoInput(e.target.value)}
                          placeholder="Ex: 10"
                        />
                      ) : (
                        <CurrencyInput value={descontoInput} onChange={setDescontoInput} />
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Autorizado por *</Label>
                    <Input
                      value={descontoAutorizado}
                      onChange={(e) => setDescontoAutorizado(e.target.value)}
                      placeholder="Nome do supervisor ou financeiro"
                      readOnly={!!supervisorInfo}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Motivo (opcional)</Label>
                    <Input
                      value={descontoMotivo}
                      onChange={(e) => setDescontoMotivo(e.target.value)}
                      placeholder="Ex: paciente recorrente"
                    />
                  </div>
                  <div className="flex justify-between text-xs pt-1 border-t">
                    <span className="text-muted-foreground">Valor original: <strong>{formatBRL(origNum)}</strong></span>
                    <span className="text-destructive">- {formatBRL(descontoNum)}</span>
                    <span className="text-success font-medium">Total: {formatBRL(Math.max(0, origNum - descontoNum))}</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={categoriaId} onValueChange={setCategoriaId} disabled={!!categoriaFixaNome}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {categoriaFixaNome && !categorias.some((c) => c.id === categoriaId) && (
              <p className="text-xs text-amber-600">
                Categoria fixa "{categoriaFixaNome}" não encontrada — cadastre em Financeiro › Categorias.
              </p>
            )}
          </div>
          {(() => {
            const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            const cat = categorias.find((c) => c.id === categoriaId);
            const ehCortesia = !!(cat && norm(cat.nome) === "cortesia");
            if (!ehCortesia) return null;
            return (
              <div className="space-y-2 rounded-md border border-dashed border-amber-400 p-3 bg-amber-50/40">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">
                    Justificativa da cortesia * <span className="text-xs text-muted-foreground">(exige autorização do supervisor)</span>
                  </Label>
                  {supervisorInfo && (
                    <span className="text-xs text-success">✓ Autorizado por {supervisorInfo.nome}</span>
                  )}
                </div>
                <Textarea
                  rows={2}
                  value={cortesiaJustificativa}
                  onChange={(e) => setCortesiaJustificativa(e.target.value)}
                  placeholder="Ex: paciente encaminhado pela diretoria, retorno gratuito, campanha social..."
                />
              </div>
            );
          })()}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger><SelectValue placeholder="Conta" /></SelectTrigger>
                <SelectContent>
                  {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Forma pgto</Label>
              <Select
                value={formaPagamento}
                onValueChange={(v) => {
                  setFormaPagamento(v);
                  if (v !== "cartao_credito") { setBandeiraCartao(""); setParcelas("1"); }
                  if (v !== "dinheiro") setValorRecebido("");
                }}
                disabled={pagamentoMisto}
              >
                <SelectTrigger><SelectValue placeholder="Forma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">Pix</SelectItem>
                  <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                  <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="convenio">Convênio</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {!pagamentoMisto && formaPagamento === "dinheiro" && (
            <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label>Valor recebido</Label>
                <CurrencyInput value={valorRecebido} onChange={setValorRecebido} />
              </div>
              <div className="space-y-1.5">
                <Label>Troco</Label>
                <Input value={formatBRL(trocoDinheiro)} disabled readOnly className="font-medium" />
              </div>
              {recebidoNum > 0 && recebidoNum < valorNum && (
                <p className="col-span-2 text-xs text-destructive">
                  Valor recebido é menor que o total. Faltam {formatBRL(valorNum - recebidoNum)}.
                </p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-md border p-3">
            <Checkbox
              id="pgto-misto"
              checked={pagamentoMisto}
              onCheckedChange={(v) => {
                const on = !!v;
                setPagamentoMisto(on);
                if (on) {
                  setFormaPagamento("");
                  setBandeiraCartao(""); setParcelas("1"); setValorRecebido("");
                }
              }}
            />
            <Label htmlFor="pgto-misto" className="cursor-pointer">Dividir em mais de uma forma de pagamento</Label>
          </div>
          {pagamentoMisto && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              {pagamentos.map((p, idx) => {
                const restanteAntes = Math.max(0, valorNum - linhasCalc.slice(0, idx).reduce((s, l) => s + l.pago, 0));
                const trocoP = linhasCalc[idx].troco;
                return (
                  <div key={idx} className="space-y-2 rounded border bg-background p-2">
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Forma</Label>
                        <Select
                          value={p.forma}
                          onValueChange={(v) => setPagamentos((xs) => xs.map((q, i) => i === idx ? { ...q, forma: v } : q))}
                        >
                          <SelectTrigger><SelectValue placeholder="Forma" /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(FORMAS_LABEL).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Recebido</Label>
                        <CurrencyInput
                          value={p.recebido}
                          onChange={(v) => setPagamentos((xs) => xs.map((q, i) => i === idx ? { ...q, recebido: v } : q))}
                          placeholder="0,00"
                        />
                      </div>
                      <div className="flex gap-1">
                        {restanteAntes > 0 && (
                          <Button type="button" variant="outline" size="sm" onClick={() => setPagamentos((xs) => xs.map((q, i) => i === idx ? { ...q, recebido: restanteAntes.toFixed(2) } : q))}>
                            Restante
                          </Button>
                        )}
                        {pagamentos.length > 1 && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => setPagamentos((xs) => xs.filter((_, i) => i !== idx))}>×</Button>
                        )}
                      </div>
                    </div>
                    {p.forma === "dinheiro" && trocoP > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Troco: <strong>{formatBRL(trocoP)}</strong>
                      </div>
                    )}
                    {p.forma === "cartao_credito" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Bandeira *</Label>
                          <Select
                            value={p.bandeira ?? ""}
                            onValueChange={(v) => setPagamentos((xs) => xs.map((q, i) => i === idx ? { ...q, bandeira: v } : q))}
                          >
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="visa">Visa</SelectItem>
                              <SelectItem value="mastercard">Mastercard</SelectItem>
                              <SelectItem value="elo">Elo</SelectItem>
                              <SelectItem value="amex">American Express</SelectItem>
                              <SelectItem value="hipercard">Hipercard</SelectItem>
                              <SelectItem value="diners">Diners</SelectItem>
                              <SelectItem value="outra">Outra</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Parcelas</Label>
                          <Select
                            value={p.parcelas ?? "1"}
                            onValueChange={(v) => setPagamentos((xs) => xs.map((q, i) => i === idx ? { ...q, parcelas: v } : q))}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
                                const base = Number(p.recebido || 0);
                                return (
                                  <SelectItem key={n} value={String(n)}>
                                    {n}x {n === 1 ? "(à vista)" : `de ${(base / n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPagamentos((xs) => [...xs, { forma: "", recebido: "" }])}
              >
                + Adicionar forma
              </Button>
              <div className="flex justify-between text-sm pt-2 border-t">
                <span>Total pago: <strong>{formatBRL(totalPagoMisto)}</strong></span>
                <span className={restanteMisto > 0 ? "text-destructive font-medium" : "text-success font-medium"}>
                  {restanteMisto > 0 ? `Falta: ${formatBRL(restanteMisto)}` : (totalPagoMisto > valorNum ? `Excedente: ${formatBRL(totalPagoMisto - valorNum)}` : "Quitado")}
                </span>
              </div>
              {trocoMisto > 0 && (
                <p className="text-xs text-muted-foreground">Troco total: {formatBRL(trocoMisto)}</p>
              )}
            </div>
          )}
          {formaPagamento === "cartao_credito" && (
            <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label>Bandeira *</Label>
                <Select value={bandeiraCartao} onValueChange={setBandeiraCartao}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visa">Visa</SelectItem>
                    <SelectItem value="mastercard">Mastercard</SelectItem>
                    <SelectItem value="elo">Elo</SelectItem>
                    <SelectItem value="amex">American Express</SelectItem>
                    <SelectItem value="hipercard">Hipercard</SelectItem>
                    <SelectItem value="diners">Diners</SelectItem>
                    <SelectItem value="outra">Outra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Parcelas</Label>
                <Select value={parcelas} onValueChange={setParcelas}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}x {n === 1 ? "(à vista)" : `de ${(Number(valor || 0) / n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-md border p-3">
            <Checkbox id="emitir-nfse" checked={emitirNfse} onCheckedChange={(v) => setEmitirNfse(!!v)} />
            <Label htmlFor="emitir-nfse" className="cursor-pointer">Emitir nota fiscal (NFS-e) para este lançamento</Label>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? "Salvando..." : (
              <>
                <Printer className="h-4 w-4" />
                Salvar e imprimir
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <SupervisorAuthDialog
      open={supervisorOpen}
      onOpenChange={setSupervisorOpen}
      acao={authIntent === "cortesia" ? "aplicar cortesia" : "aplicar desconto"}
      onAuthorized={(info) => {
        setSupervisorInfo({ userId: info.userId, nome: info.nome, role: info.role });
        if (authIntent === "cortesia") {
          // Não ativa desconto; apenas registra a autorização para a cortesia.
          return;
        }
        setDescontoAutorizado(info.nome);
        setDescontoAtivo(true);
      }}
    />
    </>
  );
}
