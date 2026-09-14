/** Planejamento editável e execução explícita de carga na homologação. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gauge, Loader2, Play, RefreshCw, Sparkles, Square } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { exigeConfirmacao, LIMITE_CONFIRMACAO, type ConfigCarga } from "@/lib/nina/carga";
import {
  criarTesteCarga,
  detalheTesteCarga,
  executarLoteCarga,
  listarTestesCarga,
  pararTesteCarga,
  prepararLeadsTesteCarga,
} from "@/lib/nina/carga.functions";
import { planejarTesteCarga } from "@/lib/nina/carga-planejamento.functions";
import {
  planoMensagensIA,
  validarPlanoCarga,
  type PlanoCarga,
} from "@/lib/nina/carga-planejamento";
import { CargaPlano } from "./CargaPlano";
import { CargaConfiguracao } from "./CargaConfiguracao";
import {
  alterarPedidoCarga,
  cargaAtiva,
  conduzirCargaLocal,
  configuracaoManual,
  criarControleLocalCarga,
  novoRascunhoCarga,
  planoDaClinicaAtual,
  revisarPlanoCarga,
  type CargaPersistida,
  type ProgressoCarga,
  type RascunhoCarga,
} from "./carga-teste-ui";

type DetalheCarga = {
  carga: CargaPersistida & {
    erros?: number;
    timeouts?: number;
    retries?: number;
    chamadas_modelo?: number;
    ferramentas?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
  metricas?: {
    media?: number | null;
    p50?: number | null;
    p95?: number | null;
    p99?: number | null;
    mensagensPorMinutoReal?: number | null;
    conversasEnvolvidas?: number;
  };
  preflight?: { leadsPreparados: number; leadsTotal: number; falhas: number };
  versaoExecutor?: string;
};
type DisparoRevisado = { config: ConfigCarga; planoIA?: PlanoCarga; usarLuna: boolean };
const ms = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)} ms`);

export function CargaTeste() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  // Preserva edições de cada clínica sem permitir disparo de plano antigo.
  const rascunhos = useRef(new Map<string, RascunhoCarga>());
  if (!clinicaId) return null;
  return (
    <CargaTesteClinica
      key={clinicaId}
      clinicaId={clinicaId}
      inicial={rascunhos.current.get(clinicaId)}
      guardar={(r) => {
        rascunhos.current.set(clinicaId, r);
      }}
    />
  );
}

function CargaTesteClinica({
  clinicaId,
  inicial,
  guardar,
}: {
  clinicaId: string;
  inicial?: RascunhoCarga;
  guardar: (r: RascunhoCarga) => void;
}) {
  const criar = useServerFn(criarTesteCarga);
  const planejar = useServerFn(planejarTesteCarga);
  const preparar = useServerFn(prepararLeadsTesteCarga);
  const executar = useServerFn(executarLoteCarga);
  const parar = useServerFn(pararTesteCarga);
  const listar = useServerFn(listarTestesCarga);
  const detalhar = useServerFn(detalheTesteCarga);
  const [rascunho, setRascunho] = useState<RascunhoCarga>(() =>
    inicial ? { ...inicial, planoValido: false } : novoRascunhoCarga(),
  );
  const [gerando, setGerando] = useState(false);
  const [testes, setTestes] = useState<CargaPersistida[]>([]);
  const [detalhe, setDetalhe] = useState<DetalheCarga | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [parando, setParando] = useState(false);
  const [preparo, setPreparo] = useState<ProgressoCarga | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<DisparoRevisado | null>(null);
  const vivo = useRef(true),
    gerandoRef = useRef(false),
    operando = useRef(false);
  const selecionado = useRef<string | null>(null);
  const leituraId = useRef(0);
  const controleLocal = useRef(criarControleLocalCarga());

  useEffect(() => {
    guardar(rascunho);
  }, [guardar, rascunho]);
  const abrirDetalhe = useCallback(
    async (id: string) => {
      const leitura = ++leituraId.current;
      const r = (await detalhar({ data: { clinicaId, cargaId: id } })) as DetalheCarga;
      if (vivo.current && leitura === leituraId.current) setDetalhe(r);
      return r;
    },
    [clinicaId, detalhar],
  );
  const recarregar = useCallback(async () => {
    let r;
    try {
      r = await listar({ data: { clinicaId } });
    } catch (e) {
      if (vivo.current) setCarregado(false);
      throw e;
    }
    if (!vivo.current) return;
    const linhas = r.testes as CargaPersistida[];
    setTestes(linhas);
    setCarregado(true);
    const id = selecionado.current ?? linhas.find(cargaAtiva)?.id ?? linhas[0]?.id;
    if (id) await abrirDetalhe(id);
  }, [abrirDetalhe, clinicaId, listar]);
  useEffect(() => {
    vivo.current = true;
    const controle = controleLocal.current;
    void recarregar().catch((e) => {
      if (vivo.current) {
        setErro("Não foi possível consultar o estado dos testes. Atualize antes de disparar.");
        mostrarErro(e);
      }
    });
    const timer = setInterval(() => {
      if (!operando.current)
        void recarregar().catch(() => {
          if (vivo.current)
            setErro("A atualização falhou. O último estado confirmado permanece visível.");
        });
    }, 5000);
    return () => {
      vivo.current = false;
      controle.interromper();
      clearInterval(timer);
    };
  }, [recarregar]);

  const ativo = testes.find(cargaAtiva);
  const ocupado = rodando || parando || Boolean(ativo);
  const edicaoBloqueada = gerando || rodando || parando || Boolean(confirmacao);
  const planoRevisto = useMemo(() => {
    if (!rascunho.plano) return { plano: null, erro: null };
    try {
      return { plano: revisarPlanoCarga(rascunho.plano, rascunho.config), erro: null };
    } catch (e) {
      return { plano: null, erro: e instanceof Error ? e.message : "Revise os campos do plano." };
    }
  }, [rascunho.plano, rascunho.config]);
  const cfgPrevia =
    rascunho.modo === "ia"
      ? (planoRevisto.plano?.config ?? rascunho.config)
      : configuracaoManual(rascunho);
  const distribuicaoPrevia = useMemo(
    () => (planoRevisto.plano ? planoMensagensIA(planoRevisto.plano) : []),
    [planoRevisto.plano],
  );
  const roteiros = useMemo(
    () => [
      ...new Map(
        distribuicaoPrevia.map((m) => [
          m.slot,
          {
            slot: m.slot,
            titulo: m.cenario,
            quantidade: distribuicaoPrevia.filter((x) => x.slot === m.slot).length,
          },
        ]),
      ).values(),
    ],
    [distribuicaoPrevia],
  );
  const planoVigente = planoDaClinicaAtual(rascunho, clinicaId);

  const gerarPlano = async () => {
    if (gerandoRef.current || operando.current || !rascunho.pedido.trim()) return;
    gerandoRef.current = true;
    setGerando(true);
    setErro(null);
    const pedido = rascunho.pedido.trim();
    try {
      const r = await planejar({ data: { clinicaId, pedido, config: rascunho.config } });
      if (!vivo.current) return;
      const plano = validarPlanoCarga(r.plano);
      setRascunho((anterior) =>
        anterior.pedido.trim() !== pedido
          ? anterior
          : {
              ...anterior,
              plano,
              config: plano.config,
              pedidoPlanejado: pedido,
              clinicaPlano: clinicaId,
              planoValido: true,
            },
      );
      toast.success("Cenários gerados. Revise o plano antes de disparar.");
    } catch (e) {
      if (vivo.current) {
        setErro("Não foi possível gerar o plano. O rascunho anterior foi preservado.");
        mostrarErro(e);
      }
    } finally {
      gerandoRef.current = false;
      if (vivo.current) setGerando(false);
    }
  };
  const rodarCarga = async (id: string, vigente: () => boolean) => {
    const status = await conduzirCargaLocal({
      vigente: () => vivo.current && vigente(),
      ler: async () => (await abrirDetalhe(id)).carga,
      preparar: async () => await preparar({ data: { clinicaId, cargaId: id } }),
      executar: async () => await executar({ data: { clinicaId, cargaId: id } }),
      progresso: (r) => {
        setPreparo(r.prontos !== undefined ? r : null);
        if (r.erro) setErro(r.erro);
      },
    });
    if (!vivo.current || !vigente()) return;
    await recarregar();
    if (status === "concluido") toast.success("Teste de carga concluído.");
    else if (status === "ocupado")
      toast.info("Há um lote em andamento. Aguarde a atualização para retomar.");
  };
  const executarDisparo = async (revisado: DisparoRevisado, confirmado: boolean) => {
    if (operando.current || !carregado || ativo) return;
    operando.current = true;
    setRodando(true);
    setConfirmacao(null);
    setErro(null);
    const vigente = controleLocal.current.iniciar();
    try {
      const criada = await criar({
        data: {
          clinicaId,
          nome: `Carga ${revisado.planoIA ? "Luna · plano Sol" : "manual"} · ${revisado.config.totalMensagens} mensagens`,
          config: revisado.config,
          confirmado,
          usarLuna: revisado.usarLuna,
          ...(revisado.planoIA ? { planoIA: revisado.planoIA } : {}),
        },
      });
      if (!vivo.current || !vigente()) return;
      if (!criada.carga?.id)
        throw new Error(
          "O servidor não confirmou a criação do teste. Atualize antes de tentar novamente.",
        );
      selecionado.current = criada.carga.id;
      await recarregar();
      if (vigente() && vivo.current) await rodarCarga(criada.carga.id, vigente);
    } catch (e) {
      if (vivo.current && vigente()) {
        setErro(
          e instanceof Error
            ? e.message
            : "O processamento foi interrompido. Confira o estado persistido abaixo.",
        );
        mostrarErro(e);
        await recarregar().catch(() =>
          setErro("A conexão falhou. Atualize o estado antes de disparar outro teste."),
        );
      }
    } finally {
      if (vivo.current && vigente()) {
        operando.current = false;
        setRodando(false);
      }
    }
  };
  const solicitarDisparo = () => {
    if (ocupado || gerando || !carregado) return;
    let revisado: DisparoRevisado;
    if (rascunho.modo === "ia") {
      if (!planoVigente || !planoRevisto.plano) return;
      revisado = { config: planoRevisto.plano.config, planoIA: planoRevisto.plano, usarLuna: true };
    } else {
      if (!cfgPrevia.distribuicao.length) {
        setErro("Escreva ao menos um cenário manual.");
        return;
      }
      revisado = { config: cfgPrevia, usarLuna: rascunho.usarLuna };
    }
    // A confirmação conserva o roteiro revisado; Luna redige somente as mensagens.
    const snapshot = structuredClone(revisado);
    if (exigeConfirmacao(snapshot.config)) setConfirmacao(snapshot);
    else void executarDisparo(snapshot, false);
  };
  const retomar = async (carga: CargaPersistida) => {
    if (operando.current || !carga.controle?.podeRetomar || carga.controle.ocupado) return;
    operando.current = true;
    setRodando(true);
    setErro(null);
    selecionado.current = carga.id;
    const vigente = controleLocal.current.iniciar();
    try {
      await rodarCarga(carga.id, vigente);
    } catch (e) {
      if (vivo.current && vigente()) {
        mostrarErro(e);
        setErro("A execução foi interrompida. O estado do servidor será consultado novamente.");
        await recarregar().catch(() => undefined);
      }
    } finally {
      if (vivo.current && vigente()) {
        operando.current = false;
        setRodando(false);
      }
    }
  };
  const encerrar = async (id: string) => {
    if (parando) return;
    controleLocal.current.interromper();
    setParando(true);
    try {
      await parar({ data: { clinicaId, cargaId: id } });
      if (vivo.current) {
        toast.success("Encerramento registrado.");
        setPreparo(null);
        await recarregar();
      }
    } catch (e) {
      if (vivo.current) {
        mostrarErro(e);
        setErro("Não foi possível confirmar o encerramento. O estado persistido continua abaixo.");
        await recarregar().catch(() => undefined);
      }
    } finally {
      operando.current = false;
      if (vivo.current) {
        setRodando(false);
        setParando(false);
      }
    }
  };
  const m = detalhe?.metricas;

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4" /> Testes de carga e alto volume
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => void recarregar().catch(mostrarErro)}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Testes pelos Leads de Teste, somente na homologação. Planeje, revise e depois dispare.
          Nenhuma mensagem é enviada ao WhatsApp real.
        </p>
        {ativo && (
          <div
            className="space-y-3 rounded-lg border border-amber-500/50 bg-amber-500/5 p-4"
            role="status"
          >
            <p className="font-medium">
              {ativo.controle?.ocupado
                ? "Há um lote em processamento"
                : rodando
                  ? "Teste em andamento"
                  : "Teste ativo aguardando continuidade"}
            </p>
            <p className="text-sm">
              {ativo.nome} · {ativo.enviadas}/{ativo.total_planejado} mensagens · {ativo.status}
            </p>
            {ativo.controle?.erro && <p className="text-sm">{ativo.controle.erro}</p>}
            <p className="text-xs text-muted-foreground">
              O estado foi recuperado do servidor. Reabrir esta tela não dispara mensagens
              automaticamente.
            </p>
            {ativo.controle?.ocupado && !ativo.controle.ativo && (
              <p className="text-sm">
                O teste já foi encerrado, mas uma chamada ainda está terminando. Aguarde a
                atualização antes de iniciar outro.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={
                  rodando || parando || !ativo.controle?.podeRetomar || ativo.controle.ocupado
                }
                onClick={() => void retomar(ativo)}
              >
                <Play className="mr-2 h-4 w-4" /> Retomar teste
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={parando}
                onClick={() => void encerrar(ativo.id)}
              >
                <Square className="mr-2 h-4 w-4" /> Encerrar teste
              </Button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2" aria-label="Modo de planejamento">
          <Button
            variant={rascunho.modo === "ia" ? "default" : "outline"}
            disabled={edicaoBloqueada}
            onClick={() => setRascunho((r) => ({ ...r, modo: "ia" }))}
          >
            Planejar com Sol
          </Button>
          <Button
            variant={rascunho.modo === "manual" ? "default" : "outline"}
            disabled={edicaoBloqueada}
            onClick={() => setRascunho((r) => ({ ...r, modo: "manual" }))}
          >
            Manual
          </Button>
        </div>
        {rascunho.modo === "ia" && (
          <div className="space-y-3">
            <Label htmlFor="carga-pedido">Descreva como deseja testar</Label>
            <Textarea
              id="carga-pedido"
              rows={4}
              disabled={edicaoBloqueada}
              value={rascunho.pedido}
              maxLength={6000}
              placeholder="Ex.: simule pacientes perguntando sobre cardiologia, preços, PIX e a escolha de um médico. Verifique a continuidade entre as mensagens."
              onChange={(e) => setRascunho((r) => alterarPedidoCarga(r, e.target.value))}
            />
            <Button
              variant="secondary"
              disabled={edicaoBloqueada || !rascunho.pedido.trim()}
              onClick={() => void gerarPlano()}
            >
              {gerando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {rascunho.plano ? "Gerar novamente com Sol" : "Gerar cenários com Sol"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Sol prepara o plano para sua revisão. Em “Disparar teste de carga”, Luna redige as
              mensagens do paciente e Nina responde com o modelo configurado no atendimento.
            </p>
            {rascunho.plano && !planoVigente && (
              <p className="rounded-md border border-amber-500/40 p-3 text-sm">
                O pedido ou a clínica mudou. Suas edições estão preservadas abaixo, mas este plano
                está desatualizado. Gere novamente antes de disparar.
              </p>
            )}
          </div>
        )}
        <CargaConfiguracao
          config={cfgPrevia}
          onChange={(config) => setRascunho((r) => ({ ...r, config }))}
          disabled={edicaoBloqueada}
          totalCalculado={rascunho.modo === "ia" && Boolean(rascunho.plano)}
        />
        {rascunho.modo === "ia" && rascunho.plano && (
          <>
            <CargaPlano
              plano={rascunho.plano}
              disabled={edicaoBloqueada}
              onChange={(plano) => setRascunho((r) => ({ ...r, plano }))}
            />
            {planoRevisto.erro && (
              <p className="text-sm text-destructive" role="alert">
                Revise o plano: {planoRevisto.erro}
              </p>
            )}
            {planoRevisto.plano && (
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  Execução prevista: {distribuicaoPrevia.length} mensagens em {roteiros.length}{" "}
                  leads
                </p>
                <p className="text-xs text-muted-foreground">
                  Cada lead recebe um roteiro completo, na ordem. Quando um cenário aparece em mais
                  de um lead, ele será repetido em conversas independentes. O total é calculado
                  pelos roteiros; nenhuma sequência será cortada para atingir outro número.
                </p>
                <ul className="list-disc pl-5">
                  {roteiros.map((r) => (
                    <li key={r.slot}>
                      Lead participante {r.slot + 1}: {r.titulo} · {r.quantidade} mensagens
                    </li>
                  ))}
                </ul>
                {planoRevisto.plano.alertas
                  .filter((a) => !rascunho.plano!.alertas.includes(a))
                  .map((a, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {a}
                    </p>
                  ))}
              </div>
            )}
          </>
        )}
        {rascunho.modo === "manual" && (
          <fieldset disabled={edicaoBloqueada} className="space-y-2">
            <Label htmlFor="carga-cenarios-manuais">Cenários manuais (um por linha)</Label>
            <Textarea
              id="carga-cenarios-manuais"
              rows={4}
              value={rascunho.cenariosManuais}
              onChange={(e) => setRascunho((r) => ({ ...r, cenariosManuais: e.target.value }))}
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={rascunho.usarLuna}
                onChange={(e) => setRascunho((r) => ({ ...r, usarLuna: e.target.checked }))}
              />{" "}
              Gerar variações de linguagem no modo manual
            </label>
          </fieldset>
        )}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Ao disparar, o sistema reinicia a memória e a sessão dos 10 leads de teste antes da
            primeira mensagem. Gerar ou revisar o plano não reinicia nada. Retomar um teste preserva
            suas conversas.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={solicitarDisparo}
              disabled={
                !carregado ||
                ocupado ||
                gerando ||
                Boolean(confirmacao) ||
                (rascunho.modo === "ia" && (!planoVigente || !planoRevisto.plano))
              }
            >
              {rodando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}{" "}
              Disparar teste de carga
            </Button>
            <span className="text-xs text-muted-foreground">
              {cfgPrevia.totalMensagens} mensagens · {cfgPrevia.conversasSimultaneas} simultâneas ·{" "}
              {cfgPrevia.mensagensPorMinuto} msg/min
            </span>
          </div>
        </div>
        {rodando && !ativo && rascunho.modo === "ia" && (
          <p role="status" className="text-sm text-muted-foreground">
            Luna está preparando as mensagens do roteiro. A preparação dos leads começa em seguida.
          </p>
        )}
        {preparo?.prontos !== undefined && (
          <p className="rounded-lg border p-3 text-sm">
            Verificação dos leads: {preparo.prontos}/{preparo.total ?? "—"} prontos.{" "}
            {preparo.erro ?? ""}
          </p>
        )}
        {erro && (
          <p
            role="alert"
            className="whitespace-pre-wrap rounded-lg border border-destructive/40 p-3 text-sm"
          >
            {erro}
          </p>
        )}
        {detalhe && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{detalhe.carga.status}</Badge>
              <span className="text-sm">
                {detalhe.carga.nome} · {detalhe.carga.enviadas}/{detalhe.carga.total_planejado}{" "}
                mensagens processadas
              </span>
            </div>
            {detalhe.carga.controle?.recuperada && (
              <p className="text-sm">
                Este teste foi interrompido após perder a execução. O servidor encerrou o registro
                pendente.
              </p>
            )}
            {detalhe.carga.controle?.erro && (
              <div className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm">
                <p className="whitespace-pre-wrap">{detalhe.carga.controle.erro}</p>
                {detalhe.preflight &&
                  detalhe.preflight.leadsPreparados < detalhe.preflight.leadsTotal && (
                    <p>
                      A preparação precisa terminar antes do envio. Confira quais leads apresentaram
                      erro; iniciar um novo teste fará novamente a preparação dos 10 leads.
                    </p>
                  )}
              </div>
            )}
            <div className="grid gap-2 text-sm md:grid-cols-4">
              <div>Latência média: {ms(m?.media)}</div>
              <div>p50: {ms(m?.p50)}</div>
              <div>p95: {m?.p95 == null ? "volume insuficiente" : ms(m.p95)}</div>
              <div>p99: {m?.p99 == null ? "volume insuficiente" : ms(m.p99)}</div>
              <div>Msg/min medidas: {m?.mensagensPorMinutoReal?.toFixed(1) ?? "—"}</div>
              <div>Erros: {detalhe.carga.erros ?? 0}</div>
              <div>Tempos esgotados: {detalhe.carga.timeouts ?? 0}</div>
              <div>Novas tentativas do modelo da Nina: {detalhe.carga.retries ?? 0}</div>
              <div>Chamadas do modelo: {detalhe.carga.chamadas_modelo ?? 0}</div>
              <div>Ferramentas usadas: {detalhe.carga.ferramentas ?? 0}</div>
              <div>
                Tokens: {detalhe.carga.input_tokens ?? 0} entrada /{" "}
                {detalhe.carga.output_tokens ?? 0} saída
              </div>
              <div>Conversas envolvidas: {m?.conversasEnvolvidas ?? "—"}</div>
            </div>
            {detalhe.preflight && (
              <p className="text-xs text-muted-foreground">
                Leads prontos: {detalhe.preflight.leadsPreparados}/{detalhe.preflight.leadsTotal} ·
                pendências: {detalhe.preflight.falhas}
              </p>
            )}
            {detalhe.versaoExecutor && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Detalhes técnicos</summary>
                <p className="mt-2">Versão do executor: {detalhe.versaoExecutor}</p>
              </details>
            )}
            <p className="text-xs text-muted-foreground">
              Os números são medições deste teste; não representam a capacidade máxima do sistema.
            </p>
          </div>
        )}
        {testes.length > 0 && (
          <div className="space-y-2">
            <Label>Histórico</Label>
            <div className="divide-y rounded-lg border">
              {testes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    selecionado.current = t.id;
                    void abrirDetalhe(t.id).catch(mostrarErro);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
                >
                  <span className="truncate">{t.nome}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{t.status}</Badge>
                    {t.enviadas}/{t.total_planejado}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <Dialog
        open={Boolean(confirmacao)}
        onOpenChange={(open) => {
          if (!open) setConfirmacao(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar teste de alto volume</DialogTitle>
            <DialogDescription>
              O plano revisado enviará {confirmacao?.config.totalMensagens} mensagens na
              homologação, acima do limite de {LIMITE_CONFIRMACAO}. O processamento consome o modelo
              de IA.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmacao(null)}>
              Cancelar
            </Button>
            <Button
              disabled={rodando || Boolean(ativo)}
              onClick={() => {
                if (confirmacao) void executarDisparo(confirmacao, true);
              }}
            >
              Confirmar disparo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
