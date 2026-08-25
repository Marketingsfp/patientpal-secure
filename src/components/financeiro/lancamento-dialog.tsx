import { useEffect, useRef, useState } from "react";
import { confirmDialog } from "@/lib/confirm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { printReciboLancamento } from "@/lib/print-recibo-lancamento";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { SupervisorAuthDialog } from "@/components/supervisor-auth-dialog";
import {
  categoriaEhRetorno,
  categoriaEhSemCobranca,
  categoriaExigeAutorizacao,
  classificarLiberacao,
  FORMA_PAGO_SISTEMA_ANTERIOR,
  LABEL_PAGO_SISTEMA_ANTERIOR,
} from "@/lib/financeiro/formas-pagamento";
import { deveRegistrarNoCaixa } from "@/lib/financeiro/registro-no-caixa";
import { dataClinicaDe, hojeBR } from "@/lib/date-utils";

import { DateInputBR } from "@/components/ui/date-input-br";
type Tipo = "receita" | "despesa";

// A receita já foi gravada (RPC atômica) quando o split é calculado — não dá
// para desfazer retroativamente. Se o split falhar, deixamos uma pendência
// visível e persistente no próprio lançamento (em vez de só console.error),
// para o financeiro encontrar e recalcular depois.
async function marcarSplitPendente(lancamentoId: string, motivo: string) {
  const { data: atual } = await supabase
    .from("fin_lancamentos")
    .select("observacoes")
    .eq("id", lancamentoId)
    .maybeSingle();
  const obsAtual = (atual as { observacoes: string | null } | null)?.observacoes ?? "";
  const marcador = `[SPLIT PENDENTE — recalcular divisão de repasse] ${motivo}`.trim();
  const novaObs = [obsAtual, marcador].filter(Boolean).join(" | ");
  await supabase
    .from("fin_lancamentos")
    .update({ observacoes: novaObs } as never)
    .eq("id", lancamentoId);
}

export interface LancamentoSavedData {
  lancamento_id: string;
  valor: number;
  forma_pagamento: string | null;
  parcelas: number | null;
  bandeira_cartao: string | null;
  emitir_nfse: boolean;
  /** Data (YYYY-MM-DD) escolhida no diálogo — permite que quem chama repasse
   *  a mesma data retroativa para `pago_em` da mensalidade, etc. */
  data: string;
  pagamentos_detalhe?: Array<{
    forma: string;
    pago: number;
    troco: number;
    recebido: number;
    /** Data (YYYY-MM-DD) em que ESTA parcela foi recebida. Igual à data do
     *  lançamento na esmagadora maioria dos casos; diferente quando a entrada
     *  foi paga em outro dia e só está sendo registrada agora. */
    data?: string;
  }>;
  /** Ids de TODOS os lançamentos gravados (o principal e, quando o pagamento
   *  tem parcelas de outras datas, um por data). Serve para telas que precisam
   *  estornar/auditar o pagamento inteiro, não só a parte de hoje. */
  lancamentos_ids?: string[];
  /** false quando o usuário clicou apenas em "Salvar" (sem imprimir a guia). */
  imprimir?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo: Tipo;
  onSaved?: () => void;
  onSavedWithData?: (data: LancamentoSavedData) => void | Promise<void>;
  /**
   * Quando true, o diálogo só fecha depois que `onSavedWithData` termina —
   * ou seja, depois que a guia já foi montada e mandada para a impressora.
   * Enquanto isso o botão fica travado mostrando "Gerando guia...".
   *
   * Existe porque a geração da GR leva alguns segundos: sem a trava o diálogo
   * fechava assim que o lançamento era gravado e a tela ficava em silêncio
   * durante a montagem da guia, convidando o atendente a clicar de novo e
   * enfileirar impressões duplicadas.
   *
   * Só ative em telas cujo `onSavedWithData` NÃO abra outros diálogos que
   * dependam de resposta do usuário — eles ficariam presos atrás deste.
   */
  aguardarImpressao?: boolean;
  initialDescricao?: string;
  initialValor?: string;
  agendamentoId?: string | null;
  initialFormaPagamento?: string;
  /** Paciente (titular) a vincular quando o recebimento não vem de um
   *  agendamento — ex.: mensalidade do cartão e pagamento avulso. Garante que
   *  a coluna "Paciente" do Caixa mostre o nome. */
  pacienteIdFixo?: string | null;
  /** Nome exato da categoria a fixar (ex.: "MENSALIDADE CARTAO CONSULTA"). Quando setado, o select fica desabilitado. */
  categoriaFixaNome?: string;
  /**
   * Libera a data por parcela no pagamento dividido (padrão: liberado).
   *
   * Passe `false` em fluxos que gravam UM lançamento por atendimento a partir
   * deste (cobrança agrupada de vários atendimentos, por exemplo): lá o
   * pagamento é rateado depois, e mais de um lançamento na origem confundiria
   * o rateio. Nesses casos todas as parcelas seguem a data do lançamento.
   */
  permiteParcelasEmOutrasDatas?: boolean;
  /**
   * Pagamento com saldo: mostra Total / Já pago / Pagando agora / Falta pagar.
   * Usado tanto pelo orçamento com entrada (sinal) quanto pelo pagamento
   * parcial de um atendimento comum — daí o `titulo` ser variável.
   */
  resumoSaldo?: {
    titulo?: string;
    total: number;
    pago: number;
    restante: number;
    itens?: Array<{
      id: string;
      descricao: string;
      total: number;
      sinal: number;
      pago: number;
      restante: number;
    }>;
  } | null;
}

export function LancamentoDialog({
  open,
  onOpenChange,
  tipo,
  onSaved,
  onSavedWithData,
  aguardarImpressao,
  initialDescricao,
  initialValor,
  agendamentoId,
  initialFormaPagamento,
  pacienteIdFixo,
  categoriaFixaNome,
  permiteParcelasEmOutrasDatas = true,
  resumoSaldo,
}: Props) {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const role = clinicaAtual?.role ?? null;
  // Qualquer atendente pode SOLICITAR desconto, mas a aplicação exige
  // autorização (e-mail + senha) de admin, gestor ou financeiro.
  // Quando o próprio usuário já é supervisor, dispensamos o segundo login.
  const ehSupervisor = role === "admin" || role === "gestor" || role === "financeiro";
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(() => hojeBR());
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
  // Segunda etapa do "Salvar e imprimir": o lançamento já está gravado e a
  // guia está sendo montada/enviada para a impressora.
  const [imprimindo, setImprimindo] = useState(false);
  const ocupado = saving || imprimindo;
  // Trava síncrona contra clique duplo: `saving` só vira true no próximo
  // render, então dois cliques rápidos (ou Enter + clique) passariam pela
  // checagem de estado e gravariam o pagamento duas vezes.
  const emAndamentoRef = useRef(false);
  const [valorRecebido, setValorRecebido] = useState("");
  // ----- Pago no sistema anterior (transição Clínica Total) ---------------
  // Rastro de auditoria do pagamento que aconteceu FORA deste sistema: em que
  // dia o paciente pagou e qual o número do recibo antigo. Vão para a
  // observação do lançamento — é o único vínculo entre a guia liberada hoje e
  // o dinheiro que entrou no caixa do sistema velho.
  const [pagoAnteriorData, setPagoAnteriorData] = useState("");
  const [pagoAnteriorRecibo, setPagoAnteriorRecibo] = useState("");
  /**
   * Guia retroativa cujo dinheiro JÁ FOI RECEBIDO antes — não entra na gaveta
   * de hoje.
   *
   * É o mesmo mecanismo de "Pago no sistema anterior" e das parcelas recebidas
   * em outras datas: o lançamento é gravado confirmado (então o atendimento
   * fica quitado e o repasse do prestador é apurado normalmente, porque o
   * repasse lê `fin_lancamentos`), mas a RPC é chamada com `p_movimento: null`
   * e nada toca em `caixa_movimentos`.
   *
   * Diferente de "Pago no sistema anterior" em um ponto: aqui a FORMA DE
   * PAGAMENTO real é preservada (dinheiro, PIX, cartão...). Aquela opção é
   * específica da virada da Clínica Total e aparece assim nos relatórios;
   * usá-la para um recebimento feito neste sistema, em outro dia, registraria
   * uma origem falsa.
   */
  const [recebidoAntes, setRecebidoAntes] = useState(false);
  const [pagamentoMisto, setPagamentoMisto] = useState(false);
  // Cada linha do pagamento dividido pode ter a SUA data de recebimento
  // (`data`). Vazio = a data do lançamento (campo "Data" no topo). É isso que
  // permite registrar hoje uma entrada que o paciente pagou dias atrás.
  const [pagamentos, setPagamentos] = useState<
    Array<{
      forma: string;
      recebido: string;
      bandeira?: string;
      parcelas?: string;
      data?: string;
    }>
  >([{ forma: "dinheiro", recebido: "" }]);
  // ----- Desconto (apenas para gerente/admin/financeiro) -----
  const [descontoAtivo, setDescontoAtivo] = useState(false);
  const [descontoTipo, setDescontoTipo] = useState<"valor" | "percentual">("valor");
  const [descontoInput, setDescontoInput] = useState("");
  const [descontoAutorizado, setDescontoAutorizado] = useState("");
  const [descontoMotivo, setDescontoMotivo] = useState("");
  const [valorOriginal, setValorOriginal] = useState<string>("");
  const [supervisorOpen, setSupervisorOpen] = useState(false);
  const [supervisorInfo, setSupervisorInfo] = useState<{
    userId: string;
    nome: string;
    role: string;
  } | null>(null);
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
    // Reset defensivo do campo "data": o useState inicial só roda uma vez
    // por ciclo de vida do componente, então sem este reset uma data
    // retroativa escolhida em um lançamento anterior permanecia gravada e
    // era enviada como data do próximo lançamento (bug: pagamento saía
    // com data de dias atrás mesmo tendo sido feito hoje).
    setData(hojeBR());
    // Reseta desconto a cada abertura
    setDescontoAtivo(false);
    setDescontoTipo("valor");
    setDescontoInput("");
    setDescontoAutorizado("");
    setDescontoMotivo("");
    setSupervisorInfo(null);
    setSupervisorOpen(false);
    setCortesiaJustificativa("");
    setAuthIntent("desconto");
    setBloqueioCartao(null);
    setTipoAgendamento(null);
    setConvenioNome(null);
    // Reset dos campos de pagamento: evita que estado remanescente de uma
    // abertura anterior (ex.: linhas mistas sem bandeira, bandeira já
    // preenchida em outro atendimento) bloqueie o Save do próximo pagamento.
    setBandeiraCartao("");
    setParcelas("1");
    setValorRecebido("");
    setPagoAnteriorData("");
    setPagoAnteriorRecibo("");
    setRecebidoAntes(false);
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
        supabase
          .from("fin_categorias")
          .select("id, nome")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("tipo", tipo)
          .eq("ativo", true)
          .order("nome"),
        supabase
          .from("fin_contas")
          .select("id, nome")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("ativo", true)
          .order("nome"),
      ]);
      const lista = cats ?? [];
      setCategorias(lista);
      const norm = (s: string) =>
        s
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();
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
            .select("paciente_id, tipo_atendimento, inicio")
            .eq("id", agendamentoId)
            .maybeSingle();
          const pid = ag?.paciente_id ?? null;
          const tipoAg =
            (ag as { tipo_atendimento?: string | null } | null)?.tipo_atendimento ?? null;
          setTipoAgendamento(tipoAg);
          // ----- Data de competência de uma GR retroativa -----------------
          // Quando a guia de um atendimento de DIAS ATRÁS só é faturada hoje,
          // a competência do lançamento é o dia do atendimento, não o dia da
          // digitação. Sem isto o campo "Data" nascia sempre em hoje e o
          // atendimento de 19/08 aparecia como receita de 25/08 — que é o
          // problema relatado (paciente EDNALDA PAULINA DE OLIVEIRA).
          //
          // Duas travas, que são o motivo pelo qual esta linha já foi
          // removida uma vez no passado:
          //   1. NUNCA usa data futura. Agendamento marcado para frente e
          //      pago adiantado continua com a data de hoje — dinheiro que
          //      já entrou não pode nascer com data que ainda não chegou.
          //   2. A gaveta do caixa NÃO segue automaticamente para trás. Quem
          //      decide isso é `fn_registrar_lancamento_e_caixa`: se o caixa
          //      daquele dia ainda estiver aberto o movimento entra nele; se
          //      já estiver fechado, entra no caixa de HOJE, porque um
          //      fechamento já conferido e impresso é intocável.
          // O operador continua podendo corrigir o campo "Data" na tela.
          const dataAtend = dataClinicaDe(
            (ag as { inicio?: string | null } | null)?.inicio ?? null,
          );
          if (dataAtend && dataAtend < hojeBR()) setData(dataAtend);
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
            const convNome = (contrato as { cb_convenios?: { nome?: string } } | null)?.cb_convenios
              ?.nome;
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
  // Categoria que libera o atendimento sem cobrar nada do paciente. É o sinal
  // de que o total vai a R$ 0,00 e a tela deixa de pedir dinheiro, cartão ou
  // valor recebido. São três situações, e nesta tela elas só diferem no que é
  // pedido ao operador (ver `classificarLiberacao`):
  //   - RETORNO DE CONSULTA → nada a preencher: é direito do paciente;
  //   - CORTESIA da diretoria → justificativa escrita + supervisor;
  //   - GRATUIDADE do convênio → nada a preencher: quem paga é a mensalidade
  //     do cartão do paciente, e o repasse do prestador segue normal na guia.
  const categoriaAtual = categorias.find((c) => c.id === categoriaId) ?? null;
  const ehCategoriaGratuidade = categoriaEhSemCobranca(categoriaAtual?.nome);
  const tipoLiberacao = classificarLiberacao(categoriaAtual?.nome);
  const ehCategoriaRetorno = tipoLiberacao === "retorno";
  const ehCategoriaConvenio = tipoLiberacao === "convenio";
  const valorNum = Number(valor || 0);
  // Calcula desconto efetivo em R$ a partir do tipo selecionado.
  const origNum = Number(valorOriginal || initialValor || 0);
  const descontoNum = (() => {
    if (!descontoAtivo) return 0;
    const n = Number(descontoInput || 0);
    if (!isFinite(n) || n <= 0) return 0;
    if (descontoTipo === "percentual") {
      const pct = Math.min(100, Math.max(0, n));
      return Math.round(((origNum * pct) / 100) * 100) / 100;
    }
    return Math.min(origNum, Math.round(n * 100) / 100);
  })();
  // Mantém o `valor` (total a pagar) sincronizado com o desconto.
  useEffect(() => {
    if (!open) return;
    // Gratuidade manda acima de tudo: zera o total independentemente do valor
    // sugerido pelo serviço e de qualquer desconto digitado. Sem isto, marcar
    // "CORTESIA" deixava o valor cheio na tela (ex.: R$ 148,50) e o pagamento
    // nascia devendo o atendimento inteiro.
    if (ehCategoriaGratuidade) {
      setValor("0.00");
      return;
    }
    if (!valorOriginal) return;
    const novo = Math.max(0, origNum - descontoNum);
    setValor(novo.toFixed(2));
  }, [
    descontoAtivo,
    descontoInput,
    descontoTipo,
    valorOriginal,
    origNum,
    descontoNum,
    open,
    ehCategoriaGratuidade,
  ]);
  // Gratuidade não tem o que dividir nem descontar. Ao entrar na categoria,
  // desliga desconto e pagamento misto (que exigiriam autorização e soma de
  // linhas para um total zero) e fixa a forma como "Convênio / Gratuidade" —
  // a mesma que a agenda já grava quando o convênio do paciente cobre o exame,
  // e que o Fechamento de Caixa lê como linha própria, sem dinheiro a conferir.
  // Ao sair, a forma volta a ser escolhida pelo operador.
  useEffect(() => {
    if (!open) return;
    if (!ehCategoriaGratuidade) {
      setFormaPagamento((cur) => (cur === "convenio_gratuidade" ? "" : cur));
      return;
    }
    setDescontoAtivo(false);
    setDescontoInput("");
    setDescontoAutorizado("");
    setDescontoMotivo("");
    setPagamentoMisto(false);
    setPagamentos([{ forma: "dinheiro", recebido: "" }]);
    setValorRecebido("");
    setBandeiraCartao("");
    setParcelas("1");
    setFormaPagamento("convenio_gratuidade");
  }, [open, ehCategoriaGratuidade]);
  /**
   * O paciente pagou este atendimento ADIANTADO, no sistema antigo, antes da
   * virada. Consequências, todas nesta tela:
   *   - o atendimento é gravado QUITADO pelo valor cheio, então a guia sai e o
   *     repasse do prestador é calculado normalmente pela regra do
   *     procedimento;
   *   - nenhum movimento de caixa é criado: o dinheiro não está na gaveta de
   *     hoje, e somá-lo criaria uma sobra falsa no fechamento;
   *   - a tela pede o rastro do pagamento antigo (data e/ou recibo).
   */
  const ehPagoSistemaAnterior = !pagamentoMisto && formaPagamento === FORMA_PAGO_SISTEMA_ANTERIOR;
  /**
   * Guia de um atendimento de dia anterior sendo faturada agora.
   *
   * Duas situações completamente diferentes se escondem aqui, e o sistema não
   * tem como adivinhar qual é — só quem está no balcão sabe:
   *
   *   a) o paciente está pagando AGORA, atrasado. O dinheiro entra na gaveta
   *      de hoje e tem que somar no fechamento de hoje;
   *   b) o paciente JÁ PAGOU, em outro dia (ou no sistema anterior), e a guia
   *      só está sendo emitida agora. O dinheiro não está na gaveta de hoje,
   *      e somá-lo cria uma sobra que ninguém consegue conferir no cupom.
   *
   * Por isso a tela pergunta, em vez de escolher sozinha. Ver `recebidoAntes`.
   */
  const ehDataRetroativa = tipo === "receita" && !!data && data < hojeBR();
  // Operador corrigiu a data de volta para hoje: a pergunta perde o sentido e
  // a resposta anterior não pode continuar valendo em silêncio — senão um
  // pagamento de hoje ficaria fora do caixa sem ninguém perceber.
  useEffect(() => {
    if (!ehDataRetroativa) setRecebidoAntes(false);
  }, [ehDataRetroativa]);
  const recebidoNum = Number(valorRecebido || 0);
  const trocoDinheiro =
    formaPagamento === "dinheiro" && recebidoNum > valorNum ? recebidoNum - valorNum : 0;
  // Compute "pago" (valor aplicado ao total) e "troco" por linha.
  //
  // Correção 2.6/2.7: a alocação NÃO pode depender da ordem das linhas.
  // Antes, "Dinheiro" na 1ª linha absorvia todo o total (min(recebido,
  // restante)) e a forma seguinte virava excedente → "Soma difere do total"
  // num pagamento correto. Agora as formas eletrônicas (pix/cartão/etc.) são
  // aplicadas primeiro — elas nunca geram troco — e o dinheiro fica como
  // forma residual, absorvendo o que falta e gerando troco do excedente.
  const linhasCalc = (() => {
    const out = pagamentos.map(() => ({ pago: 0, troco: 0 }));
    let restante = valorNum;
    // 1ª passada: formas sem troco.
    pagamentos.forEach((p, i) => {
      if (!p.forma || p.forma === "dinheiro") return;
      const rec = Number(p.recebido || 0);
      out[i] = { pago: rec, troco: 0 };
      restante = restante - rec;
    });
    // 2ª passada: dinheiro (residual, na ordem em que aparece).
    pagamentos.forEach((p, i) => {
      if (p.forma !== "dinheiro") return;
      const rec = Number(p.recebido || 0);
      const pago = Math.min(rec, Math.max(0, restante));
      out[i] = { pago, troco: Math.max(0, rec - pago) };
      restante = restante - pago;
    });
    return out;
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
    manual: "Manual",
    [FORMA_PAGO_SISTEMA_ANTERIOR]: LABEL_PAGO_SISTEMA_ANTERIOR,
  };
  // ----- Datas por parcela ------------------------------------------------
  // A data efetiva de uma linha é a dela; em branco, a do lançamento.
  const dataDaLinha = (p: { data?: string }) => (p.data && p.data.trim() ? p.data : data);
  const formatarDataBR = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
  };
  // Linhas recebidas em data diferente da do lançamento — o dinheiro delas não
  // passou pela gaveta de hoje, então elas não entram no caixa.
  const totalOutrasDatas = linhasCalc.reduce(
    (s, l, i) => (dataDaLinha(pagamentos[i]) !== data ? s + l.pago : s),
    0,
  );
  const totalNaDataDoLancamento = Math.round((totalPagoMisto - totalOutrasDatas) * 100) / 100;
  const temParcelaEmOutraData = pagamentoMisto && totalOutrasDatas > 0.004;
  /** Texto de UMA linha do pagamento dividido, como aparece na observação. */
  const descreverLinha = (i: number) => {
    const p = pagamentos[i];
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
  };

  // Porta de entrada dos botões do rodapé: garante que só existe UMA gravação
  // em andamento por vez, do clique até a guia sair.
  const handleSave = async (imprimir = true) => {
    if (emAndamentoRef.current) return;
    emAndamentoRef.current = true;
    try {
      await handleSaveInterno(imprimir);
    } finally {
      emAndamentoRef.current = false;
    }
  };

  async function handleSaveInterno(imprimir = true) {
    if (!clinicaAtual) return;
    // A gratuidade precisa ser reconhecida ANTES das validações de valor e de
    // forma de pagamento: eram justamente elas que travavam o "Salvar e
    // imprimir" de uma cortesia, exigindo um total maior que zero e um meio de
    // pagamento que, num atendimento liberado, não existem.
    const catAtual = categorias.find((c) => c.id === categoriaId) ?? null;
    const ehSemCobranca = categoriaEhSemCobranca(catAtual?.nome);
    if (!descricao.trim() || (!valor && !ehSemCobranca)) {
      toast.error("Descrição e valor são obrigatórios");
      return;
    }
    if (valorNum <= 0 && !ehSemCobranca) {
      toast.error("O valor do pagamento deve ser maior que zero.");
      return;
    }
    // Trava o inverso: categoria de gratuidade com valor cobrado esconderia um
    // recebimento dentro de uma linha que o financeiro lê como isenção.
    if (ehSemCobranca && valorNum > 0) {
      toast.error(
        `Categoria "${catAtual?.nome ?? "gratuidade"}" não pode ter valor a cobrar — o total precisa ser R$ 0,00.`,
      );
      return;
    }
    // Forma de pagamento é obrigatória para receitas fora do fluxo "misto"
    // (que já valida a soma das linhas mais abaixo). Sem essa checagem, o
    // fluxo de "Valor manual" da agenda (que abre este diálogo com a forma
    // propositalmente em branco) permitia salvar com forma_pagamento NULL —
    // a guia impressa então caía num fallback "DINHEIRO" mesmo quando o
    // pagamento real foi em débito/pix/etc, divergindo do que de fato ocorreu.
    // Gratuidade fica de fora: a forma dela é fixada automaticamente como
    // "Convênio / Gratuidade" e não há meio de pagamento a escolher.
    if (tipo === "receita" && !pagamentoMisto && !formaPagamento && !ehSemCobranca) {
      toast.error("Selecione a forma de pagamento.");
      return;
    }
    // ----- Guia retroativa já quitada: exige o mesmo rastro -----------------
    // Mesma razão do bloco abaixo: o lançamento nasce quitado sem nenhum
    // dinheiro entrando hoje. Sem a data do recebimento ou o número do recibo,
    // nada liga a guia emitida agora ao dinheiro que entrou lá atrás, e o
    // financeiro não tem como conferir depois.
    if (recebidoAntes && !ehPagoSistemaAnterior) {
      if (!pagoAnteriorData.trim() && !pagoAnteriorRecibo.trim()) {
        toast.error(
          "Informe a data em que o valor foi pago ou o número do recibo — é o que liga esta guia ao recebimento já feito.",
          { duration: 8000 },
        );
        return;
      }
      if (pagoAnteriorData && !/^\d{4}-\d{2}-\d{2}$/.test(pagoAnteriorData)) {
        toast.error("Data do pagamento inválida — use o formato DD/MM/AAAA.");
        return;
      }
      if (pagoAnteriorData && pagoAnteriorData > hojeBR()) {
        toast.error("A data do pagamento não pode ser no futuro.");
        return;
      }
    }
    // ----- Pago no sistema anterior: exige rastro do pagamento antigo -------
    // Este lançamento nasce quitado sem nenhum dinheiro entrando hoje. Sem a
    // data do pagamento ou o número do recibo, não sobra nada que ligue a guia
    // liberada agora ao recebimento feito lá atrás — e a conferência com o
    // sistema antigo fica impossível. Basta um dos dois: quem tem o recibo em
    // mãos nem sempre lembra a data, e quem confirmou pela listagem antiga nem
    // sempre tem o número.
    if (ehPagoSistemaAnterior) {
      if (!pagoAnteriorData.trim() && !pagoAnteriorRecibo.trim()) {
        toast.error(
          "Informe a data em que o paciente pagou no sistema anterior ou o número do recibo antigo.",
          { duration: 8000 },
        );
        return;
      }
      if (pagoAnteriorData && !/^\d{4}-\d{2}-\d{2}$/.test(pagoAnteriorData)) {
        toast.error("Data do pagamento anterior inválida — use o formato DD/MM/AAAA.");
        return;
      }
      if (pagoAnteriorData && pagoAnteriorData > hojeBR()) {
        toast.error("A data do pagamento no sistema anterior não pode estar no futuro.");
        return;
      }
    }
    // Despesa sem categoria e sem conta cega a DRE e os relatórios: não dá
    // para responder "quanto gastei com o quê" nem "saiu de qual conta".
    // Os campos existiam mas eram opcionais, e na prática quase ninguém
    // preenchia — em agosto/2026, 76 das 90 despesas do mês (84%) entraram
    // sem categoria e 33 sem conta. Receita não é travada aqui: ela vem do
    // atendimento, com categoria definida pelo serviço.
    if (tipo === "despesa") {
      if (!categoriaId) {
        toast.error("Selecione a categoria da despesa.");
        return;
      }
      if (!contaId) {
        toast.error("Selecione a conta de onde a despesa saiu.");
        return;
      }
    }
    // ----- Cortesia manual: exige justificativa + autorização de supervisor --
    // Zerar o valor ficou automático, mas abrir mão de um valor devido segue
    // sendo decisão de quem manda: sem justificativa e sem supervisor, não
    // grava.
    //
    // O RETORNO DE CONSULTA não passa por aqui de propósito. Ele é direito do
    // paciente, já pago na consulta de origem, e não uma exceção concedida
    // pela diretoria — pedir justificativa e supervisor a cada retorno
    // travava a recepção num atendimento que é rotina.
    if (categoriaExigeAutorizacao(catAtual?.nome)) {
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
      const norm = (s: string) =>
        s
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();
      const catEscolhida = categorias.find((c) => c.id === categoriaId) ?? null;
      const catEhConvenio = !!(
        catEscolhida &&
        convenioNome &&
        norm(catEscolhida.nome) === norm(convenioNome)
      );
      const formaEhConvenio = !pagamentoMisto && formaPagamento === "convenio";
      const mistoTemConvenio =
        pagamentoMisto &&
        pagamentos.some((p) => p.forma === "convenio" && Number(p.recebido || 0) > 0);
      if (catEhConvenio || formaEhConvenio || mistoTemConvenio) {
        toast.error(
          `Paciente com R$ ${bloqueioCartao.totalAberto.toFixed(2)} em atraso no cartão benefícios (${bloqueioCartao.qtdAtrasadas} parcela(s)). Este atendimento só pode ser pago como Particular — troque a categoria/forma e tente novamente.`,
          { duration: 10000 },
        );
        return;
      }
    }
    // ------------------------------------------------------------------
    // Data retroativa: avisa o operador. A competência do lançamento é o dia
    // escolhido; a gaveta do caixa é decidida por
    // `fn_registrar_lancamento_e_caixa` — caixa daquele dia ainda aberto
    // recebe o movimento, caixa já fechado nunca é reescrito e o movimento
    // entra no caixa de hoje, marcado com "[Data retroativa: DD/MM/AAAA]".
    // ------------------------------------------------------------------
    const _hojeISO = hojeBR();
    // Data futura nunca é válida em caixa: bloqueia antes de gravar.
    if (data && data > _hojeISO) {
      const [aaaa, mm, dd] = data.split("-");
      toast.error(
        `Data inválida: ${dd}/${mm}/${aaaa} está no futuro. O lançamento deve usar a data do recebimento (hoje).`,
        { duration: 8000 },
      );
      return;
    }
    const _ehRetroativo = tipo === "receita" && !!data && data < _hojeISO;
    if (_ehRetroativo) {
      const [aaaa, mm, dd] = data.split("-");
      const ok = await confirmDialog(
        `Atenção: este atendimento é do dia ${dd}/${mm}/${aaaa}.\n\n` +
          `A receita será contabilizada em ${dd}/${mm}/${aaaa} (data do atendimento).\n\n` +
          (recebidoAntes
            ? `Você marcou que este valor JÁ FOI PAGO antes. Ele NÃO entra no caixa ` +
              `de hoje e não soma no fechamento. A guia é liberada e o repasse do ` +
              `prestador é calculado normalmente.\n\n`
            : `Você marcou que o paciente está PAGANDO AGORA. O dinheiro entra no caixa ` +
              `do dia ${dd}/${mm}/${aaaa} se aquele caixa ainda estiver aberto; se já ` +
              `tiver sido fechado e conferido, entra no caixa de HOJE marcado como ` +
              `retroativo — um fechamento já impresso nunca é alterado.\n\n`) +
          `Deseja continuar?`,
      );
      if (!ok) return;
    }
    setSaving(true);
    if (descontoAtivo) {
      if (!supervisorInfo && !ehSupervisor) {
        toast.error("É necessária a autorização de um supervisor para aplicar desconto.");
        setSaving(false);
        return;
      }
      if (descontoNum <= 0) {
        toast.error("Informe um valor de desconto maior que zero.");
        setSaving(false);
        return;
      }
      if (!descontoAutorizado.trim()) {
        toast.error("Informe quem autorizou o desconto.");
        setSaving(false);
        return;
      }
    }
    // H2 — Roda jaPago + agendamento em paralelo. Antes eram duas queries
    // seriais (jaPago aqui, agendamento mais abaixo) e ainda uma 3ª query
    // duplicada para procedimento dentro do bloco de splits.
    type AgPrefetch = {
      medico_id: string | null;
      paciente_id: string | null;
      procedimento: string | null;
      paciente_nome: string | null;
    };
    let agPrefetch: AgPrefetch | null = null;
    if (agendamentoId) {
      const [jaPagoRes, agRes] = await Promise.all([
        tipo === "receita"
          ? supabase
              .from("fin_lancamentos")
              .select("id")
              .eq("agendamento_id", agendamentoId)
              .eq("tipo", "receita")
              .neq("status", "cancelado")
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("agendamentos")
          .select("medico_id, paciente_id, procedimento, pacientes:paciente_id(nome)")
          .eq("id", agendamentoId)
          .maybeSingle(),
      ]);
      if (tipo === "receita" && jaPagoRes.data) {
        toast.error("Este agendamento já possui um pagamento registrado.");
        setSaving(false);
        onOpenChange(false);
        return;
      }
      const raw = agRes.data as any;
      agPrefetch = raw
        ? {
            medico_id: raw.medico_id ?? null,
            paciente_id: raw.paciente_id ?? null,
            procedimento: raw.procedimento ?? null,
            paciente_nome: raw.pacientes?.nome ?? null,
          }
        : null;
    }
    const isCredito = formaPagamento === "cartao_credito";
    if (isCredito && !bandeiraCartao) {
      toast.error("Selecione a bandeira do cartão");
      setSaving(false);
      return;
    }
    if (!pagamentoMisto && formaPagamento === "dinheiro") {
      if (valorRecebido && recebidoNum > 0 && recebidoNum + 0.005 < valorNum) {
        toast.error(
          `Valor recebido (${formatBRL(recebidoNum)}) é menor que o total (${formatBRL(valorNum)})`,
        );
        setSaving(false);
        return;
      }
    }
    let formaFinal: string | null = formaPagamento || null;
    let obsExtra = "";
    // Composição estruturada do pagamento (fonte de verdade para o caixa).
    // A observação em texto passa a ser apenas exibição / fallback legado.
    type Composicao = {
      versao: number;
      origem: string;
      troco: number;
      partes: Array<{ forma: string; valor: number }>;
    };
    let composicao: Composicao | null = null;
    // Valor que de fato entra HOJE (na data do lançamento) — é ele que vai
    // para o caixa. Só difere do total quando o pagamento tem parcelas
    // recebidas em outros dias.
    let valorPrincipal = valorNum;
    // Data do lançamento principal. É a do campo "Data"; só muda quando NENHUMA
    // parcela foi recebida nesse dia (aí o principal passa a ser o lote da
    // data mais recente, para o lançamento não nascer com uma data em que
    // nada entrou).
    let dataDoPrincipal = data;
    // Parcelas recebidas em outras datas: cada uma vira um lançamento próprio,
    // com a sua data de competência e SEM movimento de caixa.
    let lotesExtras: Array<{
      data: string;
      valor: number;
      forma: string | null;
      obs: string;
      composicao: Composicao;
    }> = [];
    if (pagamentoMisto) {
      // Linhas com valor aplicado (compõem o total) e linhas só com troco
      // (dinheiro recebido acima do restante) — estas últimas não somam ao
      // total, mas precisam existir para o troco não sumir (falha 2.7).
      const validIdx = pagamentos
        .map((p, i) => ({ p, i }))
        .filter(({ p, i }) => p.forma && linhasCalc[i].pago > 0);
      const trocoIdx = pagamentos
        .map((p, i) => ({ p, i }))
        .filter(
          ({ p, i }) =>
            p.forma === "dinheiro" && linhasCalc[i].pago <= 0 && linhasCalc[i].troco > 0,
        );
      if (validIdx.length === 0) {
        toast.error("Adicione ao menos uma forma de pagamento");
        setSaving(false);
        return;
      }
      const dinheiroInvalido = validIdx.find(({ p, i }) => {
        if (p.forma !== "dinheiro") return false;
        const rec = Number(p.recebido || 0);
        return rec <= 0 || rec + 0.005 < linhasCalc[i].pago;
      });
      if (dinheiroInvalido) {
        toast.error(
          "Informe o valor recebido em dinheiro em todas as linhas (deve cobrir o valor pago).",
        );
        setSaving(false);
        return;
      }
      const creditoSemBandeira = validIdx.find(
        ({ p }) => p.forma === "cartao_credito" && !p.bandeira,
      );
      if (creditoSemBandeira) {
        toast.error("Selecione a bandeira do cartão em todas as linhas de Cartão Crédito.");
        setSaving(false);
        return;
      }
      // Data por parcela: nunca no futuro (dinheiro que ainda não entrou não é
      // pagamento) e nunca vazia/malformada.
      const hojeIso = hojeBR();
      const dataInvalida = [...validIdx, ...trocoIdx].find(({ p }) => {
        const d = dataDaLinha(p);
        return !/^\d{4}-\d{2}-\d{2}$/.test(d) || d > hojeIso;
      });
      if (dataInvalida) {
        toast.error(
          "A data de cada parcela precisa ser válida e não pode ser futura — informe o dia em que o dinheiro foi recebido.",
        );
        setSaving(false);
        return;
      }
      if (!permiteParcelasEmOutrasDatas) {
        const foraDaData = [...validIdx, ...trocoIdx].find(({ p }) => dataDaLinha(p) !== data);
        if (foraDaData) {
          toast.error(
            "Nesta cobrança todas as parcelas precisam ter a mesma data do lançamento. Para registrar um recebimento de outro dia, cobre um atendimento por vez.",
          );
          setSaving(false);
          return;
        }
      }
      // Compara o valor APLICADO (líquido de troco) com o total — nunca o
      // valor bruto recebido, e independente da ordem das linhas.
      const total = validIdx.reduce((s, { i }) => s + linhasCalc[i].pago, 0);
      if (Math.abs(total - valorNum) > 0.01) {
        toast.error(`Soma aplicada (${formatBRL(total)}) difere do valor (${formatBRL(valorNum)})`);
        setSaving(false);
        return;
      }
      // ----- Lotes por data de recebimento -----------------------------
      // Cada data vira um lançamento próprio. O lote da data do lançamento
      // (campo "Data" no topo) é o PRINCIPAL: é ele que passa pelo caixa,
      // imprime a guia e carrega o repasse. Os demais são recebimentos de
      // outros dias — o dinheiro deles não passou pela gaveta de hoje, então
      // entram só no histórico financeiro, com a data em que foram pagos.
      const datasUsadas = Array.from(
        new Set([...validIdx, ...trocoIdx].map(({ p }) => dataDaLinha(p))),
      ).sort();
      const dataPrincipal = datasUsadas.includes(data) ? data : datasUsadas[datasUsadas.length - 1];
      const itensDaData = (d: string) => validIdx.filter(({ p }) => dataDaLinha(p) === d);
      const trocosDaData = (d: string) => trocoIdx.filter(({ p }) => dataDaLinha(p) === d);

      // Monta forma / observação / composição de UM lote. Com uma única data
      // (o caso normal), o lote é o pagamento inteiro e o resultado é
      // exatamente o que o diálogo já gravava antes desta função existir.
      const descreverLote = (
        itens: typeof validIdx,
        trocos: typeof trocoIdx,
      ): { valor: number; forma: string | null; obs: string; composicao: Composicao } => {
        const valorLote =
          Math.round(itens.reduce((s, { i }) => s + linhasCalc[i].pago, 0) * 100) / 100;
        const trocoLote =
          Math.round([...itens, ...trocos].reduce((s, { i }) => s + linhasCalc[i].troco, 0) * 100) /
          100;
        const comp: Composicao = {
          versao: 1,
          origem: "lancamento_dialog",
          troco: trocoLote,
          partes: itens.map(({ p, i }) => ({
            forma: p.forma,
            valor: Math.round(linhasCalc[i].pago * 100) / 100,
          })),
        };
        let forma: string | null = null;
        let obs = "";
        // Lote com só 1 linha válida é gravado com aquela forma direta
        // (evita marcar como "misto" quando na prática só houve uma forma).
        if (itens.length === 1) {
          const { p, i } = itens[0];
          forma = p.forma;
          const { pago, troco } = linhasCalc[i];
          if (p.forma === "dinheiro" && troco > 0) {
            obs = `Recebido ${formatBRL(Number(p.recebido))}, troco ${formatBRL(troco)}`;
          } else if (p.forma === "cartao_credito") {
            const parc = Number(p.parcelas || 1) || 1;
            const band = (p.bandeira ?? "").toUpperCase();
            obs = `Cartão Crédito ${band} ${parc}x — ${formatBRL(pago)}`;
          }
        } else {
          forma = "misto";
          obs = "Pagamento misto: " + itens.map(({ i }) => descreverLinha(i)).join("; ");
        }
        // Troco de linhas de dinheiro que não aplicaram valor (excedente puro)
        // — antes eram descartadas silenciosamente.
        if (trocos.length > 0) {
          const somaTroco = trocos.reduce((s, { i }) => s + linhasCalc[i].troco, 0);
          obs += `${obs ? " " : ""}| Troco em dinheiro: ${formatBRL(somaTroco)} (recebido a mais)`;
        }
        return { valor: valorLote, forma, obs, composicao: comp };
      };

      const principal = descreverLote(itensDaData(dataPrincipal), trocosDaData(dataPrincipal));
      dataDoPrincipal = dataPrincipal;
      formaFinal = principal.forma;
      obsExtra = principal.obs;
      composicao = principal.composicao;
      valorPrincipal = principal.valor;
      lotesExtras = datasUsadas
        .filter((d) => d !== dataPrincipal)
        .map((d) => ({ data: d, ...descreverLote(itensDaData(d), trocosDaData(d)) }));

      // Com parcelas de outras datas, o lançamento principal passa a
      // representar o pagamento inteiro na guia: forma "misto" e a descrição
      // completa (com as datas) na observação. A `composicao_pagamento` dele,
      // que é o que o caixa lê, continua contendo SÓ o dinheiro de hoje.
      if (lotesExtras.length > 0) {
        formaFinal = "misto";
        const textoCompleto =
          "Pagamento misto: " +
          validIdx
            .map(({ p, i }) => {
              const base = descreverLinha(i);
              const dl = dataDaLinha(p);
              return dl === data ? base : `${base} (recebido em ${formatarDataBR(dl)})`;
            })
            .join("; ");
        const resumoDatas = lotesExtras
          .map((l) => `${formatBRL(l.valor)} em ${formatarDataBR(l.data)}`)
          .join(", ");
        // O detalhe das formas já está em `textoCompleto`; de `principal.obs`
        // só sobra o troco de linhas de dinheiro que não aplicaram valor.
        const marcaTroco = "| Troco em dinheiro:";
        const idxTroco = principal.obs.indexOf(marcaTroco);
        const trocoAvulso = idxTroco >= 0 ? principal.obs.slice(idxTroco + 2) : "";
        obsExtra = [
          textoCompleto,
          `Parcelas de outras datas (${resumoDatas}) lançadas na data em que foram recebidas — fora do caixa de hoje.`,
          trocoAvulso,
        ]
          .filter(Boolean)
          .join(" | ");
      }
    } else if (ehPagoSistemaAnterior) {
      // Rastro completo em uma linha só: o que aconteceu, quando, com qual
      // recibo, e por que este valor não aparece na gaveta de hoje. É o texto
      // que o financeiro lê quando cruza a guia de hoje com o caixa antigo.
      obsExtra = [
        "PAGO NO SISTEMA ANTERIOR (Clínica Total) — atendimento quitado antes da virada de sistema",
        pagoAnteriorData ? `Pago em ${formatarDataBR(pagoAnteriorData)}` : "",
        pagoAnteriorRecibo.trim() ? `Recibo anterior nº ${pagoAnteriorRecibo.trim()}` : "",
        "Não entra no caixa de hoje: o dinheiro foi recebido no sistema anterior. Repasse do prestador calculado normalmente.",
      ]
        .filter(Boolean)
        .join(" — ");
      composicao = {
        versao: 1,
        origem: "lancamento_dialog",
        troco: 0,
        partes: [{ forma: FORMA_PAGO_SISTEMA_ANTERIOR, valor: Math.round(valorNum * 100) / 100 }],
      };
    } else if (formaPagamento === "dinheiro" && recebidoNum > 0) {
      obsExtra = `Recebido ${formatBRL(recebidoNum)}, troco ${formatBRL(trocoDinheiro)}`;
      composicao = {
        versao: 1,
        origem: "lancamento_dialog",
        troco: Math.round(trocoDinheiro * 100) / 100,
        partes: [{ forma: "dinheiro", valor: Math.round(valorNum * 100) / 100 }],
      };
    } else if (formaPagamento) {
      composicao = {
        versao: 1,
        origem: "lancamento_dialog",
        troco: 0,
        partes: [{ forma: formaPagamento, valor: Math.round(valorNum * 100) / 100 }],
      };
    }
    let descontoObs = "";
    if (descontoAtivo && descontoNum > 0) {
      const tipoTxt =
        descontoTipo === "percentual"
          ? `${Number(descontoInput).toLocaleString("pt-BR")}% = ${formatBRL(descontoNum)}`
          : formatBRL(descontoNum);
      descontoObs =
        `Desconto aplicado: ${tipoTxt} sobre ${formatBRL(origNum)} — Autorizado por: ${descontoAutorizado.trim()}` +
        (descontoMotivo.trim() ? ` — Motivo: ${descontoMotivo.trim()}` : "");
    }
    // Retorno e gratuidade de convênio não têm autorizador nem justificativa:
    // o rastro é o próprio registro do atendimento, e a observação só explica
    // por que o lançamento nasceu zerado. Só a cortesia manual grava quem
    // autorizou.
    let cortesiaObs = "";
    switch (classificarLiberacao(catAtual?.nome)) {
      case "retorno":
        cortesiaObs = "Retorno de consulta — sem cobrança (retorno incluso na consulta de origem)";
        break;
      case "convenio":
        cortesiaObs =
          "Gratuidade do convênio/plano — paciente isento; repasse do prestador mantido";
        break;
      case "cortesia": {
        const autor = supervisorInfo?.nome ?? (ehSupervisor ? (user?.email ?? "supervisor") : "");
        cortesiaObs = `Cortesia — Autorizado por: ${autor} — Justificativa: ${cortesiaJustificativa.trim()}`;
        break;
      }
    }
    // Rastro da guia retroativa já quitada: por que este valor não aparece na
    // gaveta de hoje, e de quando é o dinheiro. É o que o financeiro lê ao
    // cruzar a guia emitida hoje com o caixa do dia em que o valor entrou.
    let recebidoAntesObs = "";
    if (recebidoAntes && !ehPagoSistemaAnterior) {
      recebidoAntesObs = [
        `RECEBIDO ANTES — guia do atendimento de ${formatarDataBR(data)} emitida em ${formatarDataBR(hojeBR())}`,
        pagoAnteriorData ? `Valor recebido em ${formatarDataBR(pagoAnteriorData)}` : "",
        pagoAnteriorRecibo.trim() ? `Recibo/referência nº ${pagoAnteriorRecibo.trim()}` : "",
        "Não entra no caixa de hoje: o dinheiro não passou pela gaveta de hoje. Repasse do prestador calculado normalmente.",
      ]
        .filter(Boolean)
        .join(" — ");
    }
    const obsFinal =
      [observacoes.trim(), cortesiaObs, descontoObs, recebidoAntesObs, obsExtra]
        .filter(Boolean)
        .join(" | ") || null;
    // Quando vinculado a um agendamento, busca medico_id e paciente_id
    // para que o repasse médico e os relatórios por paciente funcionem.
    let medicoId: string | null = null;
    let pacienteId: string | null = null;
    if (agPrefetch) {
      medicoId = agPrefetch.medico_id ?? null;
      pacienteId = agPrefetch.paciente_id ?? null;
    }
    // Sem agendamento (mensalidade / pagamento avulso): usa o titular informado.
    if (!pacienteId && pacienteIdFixo) pacienteId = pacienteIdFixo;
    // Quando misto tem linha de Cartão Crédito, propagamos bandeira/parcelas
    // da primeira linha de crédito para os campos de topo do lançamento
    // (usados por relatórios e pela impressão da GR).
    const mistoCredito = pagamentoMisto
      ? pagamentos.find(
          (p) =>
            p.forma === "cartao_credito" &&
            Number(p.recebido || 0) > 0 &&
            // Só as linhas do próprio lançamento principal: bandeira/parcelas
            // de uma parcela paga em outro dia pertencem ao lançamento dela.
            dataDaLinha(p) === dataDoPrincipal,
        )
      : null;
    const bandeiraFinal = isCredito ? bandeiraCartao : (mistoCredito?.bandeira ?? null);
    const parcelasFinal = isCredito
      ? Number(parcelas) || 1
      : mistoCredito
        ? Number(mistoCredito.parcelas || 1) || 1
        : null;
    // -------------------------------------------------------------------
    // Abordagem B: chama RPC atômica `fn_registrar_lancamento_e_caixa`.
    // Garante que fin_lancamentos + caixa_movimentos são inseridos na mesma
    // transação Postgres — se qualquer um falhar, ambos são revertidos pelo
    // próprio banco (zero janela de inconsistência).
    // -------------------------------------------------------------------
    //
    // `ehPagoSistemaAnterior` fica de fora do caixa pelo mesmo motivo das
    // parcelas recebidas em outras datas, logo abaixo: o dinheiro entrou em
    // outro dia e em outro sistema. Se entrasse aqui, o fechamento acusaria
    // uma sobra do valor do atendimento — dinheiro que a recepção nunca
    // encontraria na gaveta para conferir contra o cupom impresso. O
    // lançamento financeiro continua existindo e confirmado, então o
    // atendimento segue QUITADO e o repasse é calculado normalmente.
    // `recebidoAntes` entra pelo mesmo motivo: guia retroativa cujo dinheiro
    // já tinha sido recebido em outro dia. A receita fica na competência do
    // atendimento e o repasse é apurado normalmente (a apuração lê
    // `fin_lancamentos`), mas a gaveta de hoje não é tocada — movimento de
    // caixa R$ 0,00 no dia de hoje.
    const registraNoCaixa = deveRegistrarNoCaixa({
      temOperador: !!user?.id,
      valorPrincipal,
      formaPagamento: formaFinal,
      temAgendamento: !!agendamentoId,
      ehPagoSistemaAnterior,
      recebidoAntes,
    });

    const descricaoFinal = (() => {
      const desc = descricao.trim();
      const nome = agPrefetch?.paciente_nome?.trim();
      if (!nome) return desc;
      const sep = " — ";
      // Se já começa com o nome certo, mantém.
      if (desc.toUpperCase().startsWith(nome.toUpperCase())) return desc;
      // Se começa com outro nome (padrão "NOME — RESTO"), troca o prefixo.
      const idx = desc.indexOf(sep);
      if (idx > 0) return `${nome}${desc.slice(idx)}`;
      // Caso contrário, prefixa o nome.
      return desc ? `${nome}${sep}${desc}` : nome;
    })();

    const pLancamento = {
      clinica_id: clinicaAtual.clinica_id,
      tipo,
      // Blindagem: quando o lançamento está vinculado a um agendamento,
      // garantimos que o nome do paciente presente na descrição seja o
      // do agendamento (evita herdar nome antigo do formulário).
      descricao: descricaoFinal,
      // Só o dinheiro recebido NA DATA deste lançamento. As parcelas pagas em
      // outros dias viram lançamentos próprios logo abaixo — assim o total
      // continua quitado sem inflar a receita (nem o caixa) de hoje.
      valor: valorPrincipal,
      data: dataDoPrincipal,
      status: "confirmado",
      categoria_id: categoriaId || null,
      conta_id: contaId || null,
      forma_pagamento: formaFinal,
      bandeira_cartao: bandeiraFinal,
      parcelas: parcelasFinal,
      emitir_nfse: emitirNfse,
      observacoes: obsFinal,
      // Dado estruturado (falha 2.8): o caixa passa a ler daqui em vez de
      // interpretar o texto da observação.
      composicao_pagamento: composicao,
      agendamento_id: agendamentoId ?? null,
      medico_id: medicoId,
      paciente_id: pacienteId,
      criado_por: user?.id ?? null,
    };
    const pMovimento = registraNoCaixa
      ? {
          user_id: user!.id,
          user_nome: (user!.user_metadata as { nome?: string } | null)?.nome ?? user!.email ?? null,
          tipo: tipo === "receita" ? "recebimento" : "despesa",
          valor: valorPrincipal,
          descricao: descricao.trim(),
          forma_pagamento: formaFinal,
          // Lançamento retroativo cai no caixa do dia escolhido — não no
          // caixa de hoje. Quando a data é hoje, o backend usa a sessão
          // aberta atual normalmente.
          forcar_sessao_hoje: false,
        }
      : null;

    const { data: rpcData, error } = await (
      supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>
    )("fn_registrar_lancamento_e_caixa", {
      p_lancamento: pLancamento,
      p_movimento: pMovimento,
    });
    if (error) {
      setSaving(false);
      mostrarErro(error);
      return;
    }
    const rpcResult = (rpcData ?? {}) as { lancamento_id?: string };
    if (!rpcResult.lancamento_id) {
      setSaving(false);
      toast.error("Falha ao registrar: retorno inesperado da função de banco.");
      return;
    }
    const lancInserido: { id: string } = { id: rpcResult.lancamento_id };
    // -------------------------------------------------------------------
    // Parcelas recebidas em outras datas.
    //
    // Cada data vira um lançamento próprio, com a SUA data de competência e
    // SEM movimento de caixa (`p_movimento: null`): aquele dinheiro entrou em
    // outro dia — muitas vezes fora deste sistema — e não está na gaveta de
    // hoje. Somar no caixa de hoje criaria uma sobra que ninguém consegue
    // conferir no cupom impresso.
    // -------------------------------------------------------------------
    const lancamentosGravados: Array<{ id: string; valor: number }> = [
      { id: lancInserido.id, valor: valorPrincipal },
    ];
    const lotesQueFalharam: string[] = [];
    for (const lote of lotesExtras) {
      const marcador = `Parcela recebida em ${formatarDataBR(lote.data)} e registrada em ${formatarDataBR(hojeBR())} junto da cobrança de ${formatarDataBR(dataDoPrincipal)} — não entra no caixa (o dinheiro não passou pela gaveta de hoje).`;
      const pLote = {
        ...pLancamento,
        descricao: `${descricaoFinal} — parcela de ${formatarDataBR(lote.data)}`,
        valor: lote.valor,
        data: lote.data,
        forma_pagamento: lote.forma,
        // Bandeira/parcelas do topo pertencem ao lote principal; aqui só valem
        // se a própria parcela foi em cartão de crédito.
        bandeira_cartao:
          lote.composicao.partes.length === 1 &&
          lote.composicao.partes[0].forma === "cartao_credito"
            ? (pagamentos.find((p) => dataDaLinha(p) === lote.data && p.forma === "cartao_credito")
                ?.bandeira ?? null)
            : null,
        parcelas: null,
        // A nota fiscal sai uma vez só, pelo lançamento principal.
        emitir_nfse: false,
        observacoes: [marcador, lote.obs].filter(Boolean).join(" | "),
        composicao_pagamento: lote.composicao,
      };
      const { data: rpcLote, error: errLote } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>
      )("fn_registrar_lancamento_e_caixa", {
        p_lancamento: pLote,
        p_movimento: null,
      });
      const idLote = (rpcLote as { lancamento_id?: string } | null)?.lancamento_id;
      if (errLote || !idLote) {
        console.error("Falha ao gravar parcela de outra data:", errLote);
        lotesQueFalharam.push(`${formatBRL(lote.valor)} de ${formatarDataBR(lote.data)}`);
      } else {
        lancamentosGravados.push({ id: idLote, valor: lote.valor });
      }
    }
    if (lotesQueFalharam.length > 0) {
      toast.error(
        `Atenção: ${lotesQueFalharam.join(", ")} NÃO foi(ram) registrada(s). O atendimento está pago só em parte — lance a diferença no Financeiro.`,
        { duration: 15000 },
      );
    }
    const valorGravado =
      Math.round(lancamentosGravados.reduce((s, l) => s + l.valor, 0) * 100) / 100;
    // Sincroniza `tipo_atendimento` do agendamento com o que foi pago,
    // para que o check-in e relatórios reflitam a decisão final.
    if (agendamentoId && tipo === "receita") {
      try {
        const norm = (s: string) =>
          s
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
        const catEscolhida = categorias.find((c) => c.id === categoriaId) ?? null;
        const catEhConvenio = !!(
          catEscolhida &&
          convenioNome &&
          norm(catEscolhida.nome) === norm(convenioNome)
        );
        const formaEhConvenio = !pagamentoMisto && formaPagamento === "convenio";
        const mistoTemConvenio =
          pagamentoMisto &&
          pagamentos.some((p) => p.forma === "convenio" && Number(p.recebido || 0) > 0);
        // Um atendimento com desconto aplicado do convênio consome o benefício
        // mesmo quando a taxa é paga em dinheiro/PIX/cartão. Antes, só forma
        // "convenio" ou categoria do convênio marcavam o agendamento como
        // `convenio`, e ele ficava gravado como "particular" — não consumindo
        // a cota diária (ex.: 1 consulta R$ 9,99/dia) e liberando o mesmo
        // desconto de novo no segundo atendimento do dia. A descrição do
        // lançamento contém o nome do convênio quando a Agenda aplicou o
        // desconto, então usamos isso como sinal adicional.
        const descNorm = norm(descricao ?? "");
        const descIndicaConvenio = !!convenioNome && descNorm.includes(norm(convenioNome));
        const pagouComoConvenio =
          catEhConvenio || formaEhConvenio || mistoTemConvenio || descIndicaConvenio;
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
    let splitFalhou = false;
    try {
      if (tipo === "receita" && lancInserido?.id && valorGravado > 0) {
        const splits: Array<{
          clinica_id: string;
          pagamento_id: string;
          beneficiario_tipo: "medico" | "prestador" | "clinica";
          medico_id: string | null;
          prestador_id: string | null;
          rotulo: string | null;
          percentual: number | null;
          valor: number;
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
              .ilike("nome", procNome)
              .limit(1)
              .maybeSingle();
            const procId = (procRow as { id: string } | null)?.id;
            if (procId) {
              const { data: regras } = await supabase
                .from("procedimento_split_regras")
                .select(
                  "beneficiario_tipo, medico_id, prestador_id, rotulo, percentual, valor_fixo",
                )
                .eq("clinica_id", clinicaAtual.clinica_id)
                .eq("procedimento_id", procId)
                .eq("ativo", true);
              const lista = (regras ?? []) as Array<{
                beneficiario_tipo: "medico" | "prestador" | "clinica";
                medico_id: string | null;
                prestador_id: string | null;
                rotulo: string | null;
                percentual: number | null;
                valor_fixo: number | null;
              }>;
              for (const reg of lista) {
                const v =
                  reg.valor_fixo != null
                    ? Number(reg.valor_fixo)
                    : reg.percentual != null
                      ? +((valorGravado * Number(reg.percentual)) / 100).toFixed(2)
                      : 0;
                splits.push({
                  clinica_id: clinicaAtual.clinica_id,
                  pagamento_id: lancInserido.id,
                  beneficiario_tipo: reg.beneficiario_tipo,
                  medico_id: reg.medico_id,
                  prestador_id: reg.prestador_id,
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
            .eq("id", medicoId)
            .maybeSingle();
          const m = med as {
            tipo_repasse: string | null;
            percentual_repasse_padrao: number | null;
            valor_repasse_padrao: number | null;
          } | null;
          if (m) {
            const vMed =
              m.tipo_repasse === "valor_fixo" && m.valor_repasse_padrao != null
                ? Number(m.valor_repasse_padrao)
                : +((valorGravado * Number(m.percentual_repasse_padrao ?? 0)) / 100).toFixed(2);
            if (vMed > 0) {
              splits.push({
                clinica_id: clinicaAtual.clinica_id,
                pagamento_id: lancInserido.id,
                beneficiario_tipo: "medico",
                medico_id: medicoId,
                prestador_id: null,
                rotulo: "Repasse médico",
                percentual:
                  m.tipo_repasse === "valor_fixo" ? null : Number(m.percentual_repasse_padrao ?? 0),
                valor: vMed,
              });
            }
          }
        }
        // 3) Linha residual da clínica (diferença entre total e somatório)
        const totalSplit = splits.reduce((s, x) => s + Number(x.valor || 0), 0);
        const restoClinica = +(valorGravado - totalSplit).toFixed(2);
        if (restoClinica > 0) {
          splits.push({
            clinica_id: clinicaAtual.clinica_id,
            pagamento_id: lancInserido.id,
            beneficiario_tipo: "clinica",
            medico_id: null,
            prestador_id: null,
            rotulo: "Clínica",
            percentual: null,
            valor: restoClinica,
          });
        }
        // Quando o pagamento virou mais de um lançamento (parcelas em datas
        // diferentes), o repasse é calculado UMA vez sobre o total e depois
        // rateado entre os lançamentos, na proporção do valor de cada um. A
        // soma continua sendo o repasse cheio do atendimento — o que muda é
        // que cada parte fica presa ao lançamento (e à data) a que pertence.
        const splitsPorLancamento =
          lancamentosGravados.length <= 1
            ? splits
            : splits.flatMap((s) => {
                let acumulado = 0;
                return lancamentosGravados
                  .map((l, idx) => {
                    const ultimo = idx === lancamentosGravados.length - 1;
                    const parte = ultimo
                      ? +(Number(s.valor) - acumulado).toFixed(2)
                      : +((Number(s.valor) * l.valor) / valorGravado).toFixed(2);
                    acumulado = +(acumulado + parte).toFixed(2);
                    return { ...s, pagamento_id: l.id, valor: parte };
                  })
                  .filter((x) => Math.abs(x.valor) > 0.004);
              });
        if (splitsPorLancamento.length > 0) {
          const { error: errSplit } = await supabase
            .from("pagamento_splits")
            .insert(splitsPorLancamento as never);
          if (errSplit) {
            console.error("Falha ao gravar splits:", errSplit);
            splitFalhou = true;
            await marcarSplitPendente(lancInserido.id, errSplit.message);
          }
        }
      }
    } catch (e) {
      console.error("Erro no cálculo de splits:", e);
      if (tipo === "receita" && lancInserido?.id) {
        splitFalhou = true;
        await marcarSplitPendente(lancInserido.id, e instanceof Error ? e.message : String(e));
      }
    }
    // Lançamento + caixa foram gravados atomicamente pela RPC — sucesso.
    setSaving(false);
    if (splitFalhou) {
      toast.warning(
        `${tipo === "receita" ? "Receita" : "Despesa"} registrada, mas houve falha ao calcular a divisão de repasse (médico/clínica). Pendência marcada no lançamento — avise o financeiro para recalcular.`,
        { duration: 10000 },
      );
    } else {
      toast.success(
        lotesExtras.length > 0 && lotesQueFalharam.length === 0
          ? `Quitado ${formatBRL(valorGravado)}. Entrou no caixa de hoje apenas ${formatBRL(valorPrincipal)} — o restante ficou lançado nas datas em que foi recebido.`
          : `${tipo === "receita" ? "Receita" : "Despesa"} registrada`,
      );
    }
    // Impressão do recibo: telas que possuem fluxo próprio de impressão
    // (guia de atendimento, carnê, etc.) tratam isso via onSavedWithData.
    // Quando a tela chamadora não tem esse fluxo (ex.: Check-in, Financeiro),
    // o próprio diálogo imprime o recibo do lançamento.
    if (imprimir && !onSavedWithData) {
      try {
        let pacienteNome: string | null = null;
        if (pacienteIdFixo) {
          const { data: pac } = await supabase
            .from("pacientes")
            .select("nome")
            .eq("id", pacienteIdFixo)
            .maybeSingle();
          pacienteNome = (pac as { nome?: string } | null)?.nome ?? null;
        }
        printReciboLancamento({
          tipo,
          clinicaNome: clinicaAtual.clinica?.nome ?? "",
          operadorNome:
            (user?.user_metadata as { nome?: string } | null)?.nome ?? user?.email ?? null,
          pacienteNome,
          descricao,
          // Recibo do paciente: mostra o total quitado, não só a parte de hoje.
          valor: valorGravado,
          data: dataDoPrincipal,
          categoriaNome: categorias.find((c) => c.id === categoriaId)?.nome ?? null,
          contaNome: contas.find((c) => c.id === contaId)?.nome ?? null,
          formaPagamentoLabel: pagamentoMisto
            ? pagamentos
                .filter((p) => p.forma)
                .map((p) => FORMAS_LABEL[p.forma] ?? p.forma)
                .join(" + ")
            : (FORMAS_LABEL[formaFinal ?? ""] ?? formaFinal ?? null),
          observacoes,
        });
      } catch (e) {
        console.error("Falha ao imprimir recibo do lançamento:", e);
        toast.error("Lançamento salvo, mas não foi possível abrir a impressão do recibo.");
      }
    }
    const posSalvar = onSavedWithData?.({
      lancamento_id: lancInserido.id,
      lancamentos_ids: lancamentosGravados.map((l) => l.id),
      // Total efetivamente quitado (todas as datas) — é o que a guia de
      // atendimento imprime e o que abate o saldo do orçamento.
      valor: valorGravado,
      forma_pagamento: formaFinal,
      parcelas: parcelasFinal,
      bandeira_cartao: bandeiraFinal,
      emitir_nfse: emitirNfse,
      data: dataDoPrincipal,
      imprimir,
      pagamentos_detalhe: pagamentoMisto
        ? pagamentos
            .map((p, i) => ({
              forma: p.forma,
              pago: linhasCalc[i].pago,
              troco: linhasCalc[i].troco,
              recebido: Number(p.recebido || 0),
              data: dataDaLinha(p),
            }))
            .filter((x) => x.forma && x.pago > 0)
        : undefined,
    });
    // Segura o diálogo aberto (e travado) enquanto a tela chamadora monta e
    // envia a guia. Sem isso o diálogo sumia na hora e a tela ficava ~6s sem
    // resposta nenhuma, o que levava o atendente a repetir a cobrança.
    if (aguardarImpressao && imprimir && posSalvar) {
      setImprimindo(true);
      try {
        await posSalvar;
      } catch (e) {
        console.error("Falha no pós-salvamento (impressão da guia):", e);
      } finally {
        setImprimindo(false);
      }
    }
    setDescricao("");
    setValor("");
    setObservacoes("");
    setCategoriaId("");
    setContaId("");
    setFormaPagamento("");
    setBandeiraCartao("");
    setParcelas("1");
    setEmitirNfse(false);
    setValorRecebido("");
    setPagamentoMisto(false);
    setPagamentos([{ forma: "dinheiro", recebido: "" }]);
    onSaved?.();
    onOpenChange(false);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          // Enquanto grava/imprime, ESC e clique fora não fecham o diálogo —
          // fechar aqui deixaria o pagamento pela metade sem aviso nenhum.
          if (!v && ocupado) return;
          onOpenChange(v);
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col gap-3 p-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className={tipo === "receita" ? "text-success" : "text-destructive"}>
              Nova {tipo === "receita" ? "Receita" : "Despesa"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto pr-1 -mr-1 flex-1 min-h-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {bloqueioCartao?.bloqueado && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 text-destructive px-3 py-2 text-sm">
                <strong>Cartão benefícios em atraso.</strong> Paciente tem{" "}
                <strong>R$ {bloqueioCartao.totalAberto.toFixed(2)}</strong> em aberto (
                {bloqueioCartao.qtdAtrasadas} parcela(s) vencida(s)). Este atendimento só pode ser
                pago como <strong>Particular</strong> — não use a categoria "
                {bloqueioCartao.convenioNome ?? "Convênio"}" nem a forma "Convênio".
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Consulta João Silva"
              />
            </div>
            {resumoSaldo && (
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm space-y-1">
                <div className="font-medium">
                  {resumoSaldo.titulo ?? "Orçamento com entrada — pagamento parcelado"}
                </div>
                {resumoSaldo.itens && resumoSaldo.itens.length > 0 && (
                  <div className="divide-y rounded-md border bg-background">
                    {resumoSaldo.itens.map((it) => (
                      <div key={it.id} className="px-2 py-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-medium">{it.descricao}</span>
                          {it.sinal > 0 ? (
                            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              Entrada {formatBRL(it.sinal)}
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              sem entrada
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          Total {formatBRL(it.total)} · Já pago {formatBRL(it.pago)} · Falta{" "}
                          {formatBRL(it.restante)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-4">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-medium tabular-nums">{formatBRL(resumoSaldo.total)}</span>
                  <span className="text-muted-foreground">Já pago:</span>
                  <span className="font-medium tabular-nums">{formatBRL(resumoSaldo.pago)}</span>
                  <span className="text-muted-foreground">Pagando agora:</span>
                  <span className="font-medium tabular-nums">
                    {formatBRL(Math.min(valorNum, resumoSaldo.restante))}
                  </span>
                  <span className="text-muted-foreground">Falta pagar:</span>
                  <span className="font-semibold tabular-nums">
                    {formatBRL(Math.max(0, resumoSaldo.restante - valorNum))}
                  </span>
                </div>
                {valorNum > resumoSaldo.restante + 0.004 && (
                  <p className="text-xs text-destructive">
                    O valor informado é maior que o saldo em aberto. O excedente (
                    {formatBRL(valorNum - resumoSaldo.restante)}) não será abatido do saldo.
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor *</Label>
                <CurrencyInput value={valor} onChange={setValor} disabled={ehCategoriaGratuidade} />
                {ehCategoriaGratuidade ? (
                  <p className="text-xs text-success font-medium">
                    Zerado pela categoria "{categoriaAtual?.nome}"
                  </p>
                ) : (
                  !!initialValor && (
                    <p className="text-xs text-muted-foreground">
                      Sugerido pelo serviço — editável
                    </p>
                  )
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <DateInputBR value={data} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>
            {/* Desconto não se aplica a uma gratuidade: o total já é zero. */}
            {tipo === "receita" && !!initialValor && !ehCategoriaGratuidade && (
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
                    <span className="ml-auto text-xs text-success">
                      ✓ Autorizado por {supervisorInfo.nome}
                    </span>
                  )}
                </div>
                {descontoAtivo && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Tipo</Label>
                        <Select
                          value={descontoTipo}
                          onValueChange={(v) => setDescontoTipo(v as "valor" | "percentual")}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="valor">R$ (valor)</SelectItem>
                            <SelectItem value="percentual">% (percentual)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {descontoTipo === "percentual"
                            ? "Percentual de desconto"
                            : "Valor do desconto"}
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
                      <span className="text-muted-foreground">
                        Valor original: <strong>{formatBRL(origNum)}</strong>
                      </span>
                      <span className="text-destructive">- {formatBRL(descontoNum)}</span>
                      <span className="text-success font-medium">
                        Total: {formatBRL(Math.max(0, origNum - descontoNum))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>
                Categoria
                {tipo === "despesa" && <span className="text-destructive"> *</span>}
              </Label>
              <Select
                value={categoriaId}
                onValueChange={setCategoriaId}
                disabled={!!categoriaFixaNome}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categoriaFixaNome && !categorias.some((c) => c.id === categoriaId) && (
                <p className="text-xs text-amber-600">
                  Categoria fixa "{categoriaFixaNome}" não encontrada — cadastre em Financeiro ›
                  Categorias.
                </p>
              )}
            </div>
            {(() => {
              if (!ehCategoriaGratuidade) return null;
              // Retorno de consulta: só informa por que o total está zerado.
              // Nada a preencher, nada a autorizar — "Salvar e imprimir" já
              // está liberado.
              if (ehCategoriaRetorno) {
                return (
                  <div className="rounded-md border border-dashed border-emerald-400 p-3 bg-emerald-50/40">
                    <p className="text-xs text-muted-foreground">
                      <strong>Retorno de consulta</strong>: total zerado em <strong>R$ 0,00</strong>{" "}
                      e registrado como Convênio / Gratuidade. O retorno já está incluso na consulta
                      de origem — não há nada a receber, nem justificativa ou autorização a pedir. É
                      só salvar e imprimir.
                    </p>
                  </div>
                );
              }
              // Gratuidade do convênio/plano: o paciente é isento porque a
              // mensalidade do cartão dele já remunera o atendimento. Também
              // não há nada a autorizar — e, ao contrário do retorno e da
              // cortesia, o prestador continua recebendo o repasse na guia.
              if (ehCategoriaConvenio) {
                return (
                  <div className="rounded-md border border-dashed border-sky-400 p-3 bg-sky-50/40">
                    <p className="text-xs text-muted-foreground">
                      <strong>Gratuidade do convênio/plano</strong>: total zerado em{" "}
                      <strong>R$ 0,00</strong> — o atendimento é coberto pela mensalidade do
                      paciente. Não há justificativa nem autorização a pedir, e o repasse do
                      prestador sai normalmente na guia.
                    </p>
                  </div>
                );
              }
              return (
                <div className="space-y-2 rounded-md border border-dashed border-amber-400 p-3 bg-amber-50/40">
                  <p className="text-xs text-muted-foreground">
                    Atendimento liberado por <strong>{categoriaAtual?.nome}</strong>: total zerado
                    em <strong>R$ 0,00</strong> e registrado como Convênio / Gratuidade. Não há
                    dinheiro nem cartão a receber — basta justificar e salvar.
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm font-medium">
                      Justificativa da cortesia *{" "}
                      <span className="text-xs text-muted-foreground">
                        (exige autorização do supervisor)
                      </span>
                    </Label>
                    {supervisorInfo && (
                      <span className="text-xs text-success">
                        ✓ Autorizado por {supervisorInfo.nome}
                      </span>
                    )}
                  </div>
                  <Textarea
                    rows={2}
                    value={cortesiaJustificativa}
                    onChange={(e) => setCortesiaJustificativa(e.target.value)}
                    placeholder="Ex: paciente encaminhado pela diretoria, campanha social, acordo institucional..."
                  />
                </div>
              );
            })()}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Conta
                  {tipo === "despesa" && <span className="text-destructive"> *</span>}
                </Label>
                <Select value={contaId} onValueChange={setContaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {contas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Forma pgto</Label>
                <Select
                  value={formaPagamento}
                  onValueChange={(v) => {
                    setFormaPagamento(v);
                    if (v !== "cartao_credito") {
                      setBandeiraCartao("");
                      setParcelas("1");
                    }
                    if (v !== "dinheiro") setValorRecebido("");
                    if (v !== FORMA_PAGO_SISTEMA_ANTERIOR) {
                      setPagoAnteriorData("");
                      setPagoAnteriorRecibo("");
                    }
                  }}
                  disabled={pagamentoMisto || ehCategoriaGratuidade}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Forma" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Só aparece na gratuidade: é a forma que o sistema fixa
                        sozinho, não uma opção que o operador escolhe num
                        atendimento cobrado. */}
                    {ehCategoriaGratuidade && (
                      <SelectItem value="convenio_gratuidade">Convênio / Gratuidade</SelectItem>
                    )}
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                    <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="convenio">Convênio</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                    {/* Transição de sistemas: o paciente já pagou lá atrás, na
                        Clínica Total. Fica por último porque é exceção, não
                        rotina — e porque escolher por engano tira o valor do
                        fechamento do dia. */}
                    <SelectItem value={FORMA_PAGO_SISTEMA_ANTERIOR}>
                      {LABEL_PAGO_SISTEMA_ANTERIOR}
                    </SelectItem>
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
                  <Input
                    value={formatBRL(trocoDinheiro)}
                    disabled
                    readOnly
                    className="font-medium"
                  />
                </div>
                {recebidoNum > 0 && recebidoNum < valorNum && (
                  <p className="col-span-2 text-xs text-destructive">
                    Valor recebido é menor que o total. Faltam {formatBRL(valorNum - recebidoNum)}.
                  </p>
                )}
              </div>
            )}
            {/* Guia de atendimento de outro dia: o sistema NÃO adivinha se o
                dinheiro está entrando agora ou se já entrou antes. Perguntar é
                a blindagem — sem isso, todo recebimento antigo vira sobra
                fantasma no fechamento de hoje. Só aparece quando a data é
                retroativa; no dia a dia normal a tela não muda em nada. */}
            {ehDataRetroativa && !ehPagoSistemaAnterior && !ehCategoriaGratuidade && (
              <div className="space-y-3 rounded-md border border-sky-300 bg-sky-50 p-3">
                <p className="text-xs text-sky-900">
                  <strong>
                    Atendimento do dia {formatarDataBR(data)} — guia sendo emitida hoje.
                  </strong>{" "}
                  A receita fica contabilizada em {formatarDataBR(data)} nos dois casos. O que muda
                  é o caixa:
                </p>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-background p-2">
                    <input
                      type="radio"
                      name="quando-recebeu"
                      className="mt-1"
                      checked={!recebidoAntes}
                      onChange={() => setRecebidoAntes(false)}
                    />
                    <span className="text-xs">
                      <strong>O paciente está pagando agora.</strong> O dinheiro entra no caixa de
                      hoje e soma no fechamento — é o caso de quem ficou devendo e voltou para
                      pagar.
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-background p-2">
                    <input
                      type="radio"
                      name="quando-recebeu"
                      className="mt-1"
                      checked={recebidoAntes}
                      onChange={() => {
                        setRecebidoAntes(true);
                        // Sugere a data do próprio atendimento — quase sempre é
                        // o dia em que o paciente pagou.
                        setPagoAnteriorData((cur) => cur || data);
                      }}
                    />
                    <span className="text-xs">
                      <strong>Já foi pago antes — não entra no caixa de hoje.</strong> A guia é
                      liberada e o repasse do prestador é calculado normalmente, mas o valor{" "}
                      <strong>não soma no fechamento de hoje</strong>, porque esse dinheiro não está
                      na gaveta.
                    </span>
                  </label>
                </div>
                {recebidoAntes && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Data em que foi pago</Label>
                        <DateInputBR
                          value={pagoAnteriorData}
                          onChange={(e) => setPagoAnteriorData(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Nº do recibo / referência</Label>
                        <Input
                          value={pagoAnteriorRecibo}
                          onChange={(e) => setPagoAnteriorRecibo(e.target.value)}
                          placeholder="Ex.: 48213"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-sky-800">
                      Preencha ao menos um dos dois — é o que liga esta guia ao recebimento já
                      feito. Se o pagamento foi na Clínica Total, antes da virada, use a forma
                      &quot;{LABEL_PAGO_SISTEMA_ANTERIOR}&quot; em vez desta opção.
                    </p>
                  </>
                )}
              </div>
            )}
            {/* Pago adiantado no sistema antigo: a tela deixa claro o efeito no
                caixa e recolhe o rastro do recebimento antigo. */}
            {ehPagoSistemaAnterior && (
              <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
                <p className="text-xs text-amber-900">
                  <strong>Atendimento já pago na Clínica Total.</strong> A guia é liberada e o
                  repasse do prestador é calculado normalmente, mas o valor{" "}
                  <strong>não entra no fechamento do caixa de hoje</strong> — o dinheiro foi
                  recebido no sistema anterior e não está na gaveta.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Data do pagamento anterior</Label>
                    <DateInputBR
                      value={pagoAnteriorData}
                      onChange={(e) => setPagoAnteriorData(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nº do recibo anterior</Label>
                    <Input
                      value={pagoAnteriorRecibo}
                      onChange={(e) => setPagoAnteriorRecibo(e.target.value)}
                      placeholder="Ex.: 48213"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-amber-800">
                  Preencha ao menos um dos dois — é o que liga esta guia ao recebimento feito no
                  sistema antigo.
                </p>
              </div>
            )}
            {/* Não há o que dividir num total zerado — some da tela na gratuidade.
                Também não há o que dividir num pagamento que já foi feito
                inteiro, em outro sistema. */}
            {!ehCategoriaGratuidade && !ehPagoSistemaAnterior && (
              <div className="flex items-center gap-2 rounded-md border p-3">
                <Checkbox
                  id="pgto-misto"
                  checked={pagamentoMisto}
                  onCheckedChange={(v) => {
                    const on = !!v;
                    setPagamentoMisto(on);
                    if (on) {
                      setFormaPagamento("");
                      setBandeiraCartao("");
                      setParcelas("1");
                      setValorRecebido("");
                    }
                  }}
                />
                <Label htmlFor="pgto-misto" className="cursor-pointer">
                  Dividir em mais de uma forma de pagamento
                </Label>
              </div>
            )}
            {pagamentoMisto && (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                {pagamentos.map((p, idx) => {
                  const restanteAntes = Math.max(
                    0,
                    valorNum - linhasCalc.slice(0, idx).reduce((s, l) => s + l.pago, 0),
                  );
                  const trocoP = linhasCalc[idx].troco;
                  return (
                    <div key={idx} className="space-y-2 rounded border bg-background p-2">
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                        <div className="space-y-1">
                          <Label className="text-xs">Forma</Label>
                          <Select
                            value={p.forma}
                            onValueChange={(v) =>
                              setPagamentos((xs) =>
                                xs.map((q, i) => (i === idx ? { ...q, forma: v } : q)),
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Forma" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(FORMAS_LABEL).map(([k, v]) => (
                                <SelectItem key={k} value={k}>
                                  {v}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Recebido</Label>
                          <CurrencyInput
                            value={p.recebido}
                            onChange={(v) =>
                              setPagamentos((xs) =>
                                xs.map((q, i) => (i === idx ? { ...q, recebido: v } : q)),
                              )
                            }
                            placeholder="0,00"
                          />
                        </div>
                        <div className="flex gap-1">
                          {restanteAntes > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setPagamentos((xs) =>
                                  xs.map((q, i) =>
                                    i === idx ? { ...q, recebido: restanteAntes.toFixed(2) } : q,
                                  ),
                                )
                              }
                            >
                              Restante
                            </Button>
                          )}
                          {pagamentos.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setPagamentos((xs) => xs.filter((_, i) => i !== idx))}
                            >
                              ×
                            </Button>
                          )}
                        </div>
                      </div>
                      {permiteParcelasEmOutrasDatas && (
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
                          <div className="space-y-1">
                            <Label className="text-xs">Data em que foi paga</Label>
                            <DateInputBR
                              value={dataDaLinha(p)}
                              onChange={(e) =>
                                setPagamentos((xs) =>
                                  xs.map((q, i) =>
                                    i === idx ? { ...q, data: e.target.value } : q,
                                  ),
                                )
                              }
                            />
                          </div>
                          {dataDaLinha(p) !== data && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setPagamentos((xs) =>
                                  xs.map((q, i) => (i === idx ? { ...q, data: data } : q)),
                                )
                              }
                            >
                              Hoje
                            </Button>
                          )}
                        </div>
                      )}
                      {permiteParcelasEmOutrasDatas && dataDaLinha(p) > hojeBR() && (
                        <p className="text-xs text-destructive">
                          Data futura. Informe o dia em que o dinheiro foi realmente recebido.
                        </p>
                      )}
                      {permiteParcelasEmOutrasDatas &&
                        dataDaLinha(p) !== data &&
                        dataDaLinha(p) <= hojeBR() && (
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            Recebida em {formatarDataBR(dataDaLinha(p))}: entra no histórico
                            financeiro nessa data e <strong>não</strong> soma no caixa de hoje.
                          </p>
                        )}
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
                              onValueChange={(v) =>
                                setPagamentos((xs) =>
                                  xs.map((q, i) => (i === idx ? { ...q, bandeira: v } : q)),
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
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
                              onValueChange={(v) =>
                                setPagamentos((xs) =>
                                  xs.map((q, i) => (i === idx ? { ...q, parcelas: v } : q)),
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
                                  const base = Number(p.recebido || 0);
                                  return (
                                    <SelectItem key={n} value={String(n)}>
                                      {n}x{" "}
                                      {n === 1
                                        ? "(à vista)"
                                        : `de ${(base / n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
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
                  <span>
                    Total pago: <strong>{formatBRL(totalPagoMisto)}</strong>
                  </span>
                  <span
                    className={
                      restanteMisto > 0
                        ? "text-destructive font-medium"
                        : "text-success font-medium"
                    }
                  >
                    {restanteMisto > 0
                      ? `Falta: ${formatBRL(restanteMisto)}`
                      : totalPagoMisto > valorNum
                        ? `Excedente: ${formatBRL(totalPagoMisto - valorNum)}`
                        : "Quitado"}
                  </span>
                </div>
                {trocoMisto > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Troco total: {formatBRL(trocoMisto)}
                  </p>
                )}
                {temParcelaEmOutraData && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    <div className="flex justify-between">
                      <span>Entra no caixa de {formatarDataBR(data)}:</span>
                      <strong className="tabular-nums">{formatBRL(totalNaDataDoLancamento)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Recebido em outras datas (fora do caixa):</span>
                      <strong className="tabular-nums">{formatBRL(totalOutrasDatas)}</strong>
                    </div>
                    <p className="mt-1">
                      O atendimento fica quitado em {formatBRL(totalPagoMisto)}. As parcelas de
                      outros dias são lançadas no financeiro com a data em que foram pagas, sem
                      mexer no saldo do caixa de hoje.
                    </p>
                  </div>
                )}
              </div>
            )}
            {formaPagamento === "cartao_credito" && (
              <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3">
                <div className="space-y-1.5">
                  <Label>Bandeira *</Label>
                  <Select value={bandeiraCartao} onValueChange={setBandeiraCartao}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}x{" "}
                          {n === 1
                            ? "(à vista)"
                            : `de ${(Number(valor || 0) / n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-md border p-3">
              <Checkbox
                id="emitir-nfse"
                checked={emitirNfse}
                onCheckedChange={(v) => setEmitirNfse(!!v)}
              />
              <Label htmlFor="emitir-nfse" className="cursor-pointer">
                Emitir nota fiscal (NFS-e) para este lançamento
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={ocupado}>
              Cancelar
            </Button>
            {/* A ação padrão deste diálogo é salvar E imprimir a guia: é o que a
                recepção faz em praticamente todo atendimento. Até 10/08 existia
                um único botão ("Salvar e imprimir"); ele foi dividido em dois e o
                botão em destaque passou a ser o "Salvar", que NÃO imprime. Como
                a divisão é invisível para quem só reconhece o botão colorido da
                direita, a clínica ficou dias sem emitir guia nenhuma, sem
                qualquer erro na tela. O destaque volta para a ação que imprime;
                "Salvar sem imprimir" continua disponível, mas como opção
                secundária e com nome explícito. */}
            <Button
              variant="outline"
              onClick={() => void handleSave(false)}
              disabled={ocupado}
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              {saving ? "Salvando..." : "Salvar sem imprimir"}
            </Button>
            <Button
              onClick={() => void handleSave(true)}
              disabled={ocupado}
              className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {ocupado ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              {imprimindo ? "Gerando guia..." : saving ? "Salvando..." : "Salvar e imprimir"}
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
