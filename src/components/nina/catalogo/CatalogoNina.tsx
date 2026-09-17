import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { assinarAtualizacao } from "@/lib/webmcp/atualizacao";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { PreviaEdicaoCatalogo } from "@/lib/nina/catalogo-edicao-ia";
import { normalizarNomeBusca } from "@/lib/busca-texto";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Trash2, Archive, Send, Sparkles, Search, X } from "lucide-react";
import {
  listarCatalogoNina,
  opcoesCatalogoNina,
  salvarServicoCatalogo,
  salvarProfissionalCatalogo,
  alterarStatusCatalogo,
  excluirItemCatalogo,
  organizarTextoCatalogoIA,
  preverEdicaoCatalogoIA,
} from "@/lib/nina/catalogo.functions";
import {
  MODELO_CATALOGO_IA,
  paraEstadoProfissional,
  paraEstadoServico,
} from "@/lib/nina/catalogo-ia";
import {
  ROTULO_STATUS,
  formatarBRL,
  resumoHorarios,
  servicoSchema,
  profissionalSchema,
  type StatusCatalogo,
} from "@/lib/nina/catalogo";
import {
  FormServico,
  servicoVazio,
  servicoDoRegistro,
  servicoParaEnvio,
  type EstadoServico,
  type OpcoesCatalogo,
} from "./FormServico";
import {
  FormProfissional,
  profissionalVazio,
  profissionalDoRegistro,
  profissionalParaEnvio,
  type EstadoProfissional,
} from "./FormProfissional";

const OPCOES_VAZIAS: OpcoesCatalogo = {
  procedimentos: [],
  medicos: [],
  especialidades: [],
  unidades: [],
  convenios: [],
};

function BadgeStatus({ status, emRevisao }: { status: string; emRevisao?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant={status === "PUBLICADO" ? "default" : "secondary"}>
        {ROTULO_STATUS[status as StatusCatalogo] ?? status}
      </Badge>
      {emRevisao && <Badge variant="outline">Alterações em revisão</Badge>}
    </div>
  );
}

/**
 * Catálogo estruturado da Nina: exames/procedimentos e consultas/profissionais.
 * FASE 7: é a única base de conhecimento administrativo da Nina. Só os
 * registros PUBLICADOS são usados no atendimento.
 */
export function CatalogoNina({
  clinicaId,
  podeEditar,
  tipo,
}: {
  clinicaId?: string;
  podeEditar: boolean;
  tipo: "servico" | "profissional";
}) {
  const listarFn = useServerFn(listarCatalogoNina);
  const opcoesFn = useServerFn(opcoesCatalogoNina);
  const salvarServicoFn = useServerFn(salvarServicoCatalogo);
  const salvarProfFn = useServerFn(salvarProfissionalCatalogo);
  const statusFn = useServerFn(alterarStatusCatalogo);
  const excluirFn = useServerFn(excluirItemCatalogo);
  const iaFn = useServerFn(organizarTextoCatalogoIA);
  const previaFn = useServerFn(preverEdicaoCatalogoIA);

  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [itens, setItens] = useState<any[]>([]);
  const [busca, setBusca] = useState("");
  const buscaId = useId();
  const buscaRef = useRef<HTMLInputElement>(null);
  const itensFiltrados = useMemo(() => {
    const termos = normalizarNomeBusca(busca).split(" ").filter(Boolean);
    if (!termos.length) return itens;
    return itens.filter((item) => {
      const nomes = [item.nome];
      if (tipo === "profissional") {
        nomes.push(...(item.especialidades ?? []).map((e: { nome?: string }) => e?.nome));
      }
      const texto = normalizarNomeBusca(nomes.filter(Boolean).join(" "));
      return termos.every((termo) => texto.includes(termo));
    });
  }, [busca, itens, tipo]);
  const [opcoes, setOpcoes] = useState<OpcoesCatalogo>(OPCOES_VAZIAS);
  const [aberto, setAberto] = useState(false);
  const [servico, setServico] = useState<EstadoServico>(servicoVazio);
  const [profissional, setProfissional] = useState<EstadoProfissional>(profissionalVazio);

  // A IA propõe; somente a confirmação humana grava e publica.
  const [iaAberta, setIaAberta] = useState(false);
  const [iaTexto, setIaTexto] = useState("");
  const [iaProcessando, setIaProcessando] = useState(false);
  const [iaModo, setIaModo] = useState<"criar" | "editar">("criar");
  const [iaRegistroId, setIaRegistroId] = useState("");
  const [iaPrevia, setIaPrevia] = useState<PreviaEdicaoCatalogo | null>(null);
  const [iaErro, setIaErro] = useState("");
  const iaTextoId = useId();
  const publicandoIA = useRef(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [fila, setFila] = useState<any[]>([]);
  const [posicao, setPosicao] = useState(0);
  // Resposta atrasada não pode sobrescrever uma edição posterior do usuário.
  const pedidoRef = useRef(0);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    try {
      const r = (await listarFn({ data: { clinicaId } })) as any;
      setItens(tipo === "servico" ? r.servicos : r.profissionais);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível carregar o catálogo.");
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, listarFn, tipo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    setBusca("");
  }, [clinicaId, tipo]);

  useEffect(() => {
    setIaAberta(false);
    setIaPrevia(null);
    setIaRegistroId("");
    setIaTexto("");
    setIaErro("");
    setIaProcessando(false);
    // Trocar clínica/aba ou desmontar invalida respostas ainda em processamento.
    return () => {
      pedidoRef.current++;
    };
  }, [clinicaId, tipo, podeEditar]);

  // Recarga incremental após uma operação feita pela automação (WebMCP).
  useEffect(() => assinarAtualizacao("catalogo", () => void carregar()), [carregar]);

  useEffect(() => {
    if (!clinicaId) return;
    void (async () => {
      try {
        setOpcoes((await opcoesFn({ data: { clinicaId } })) as OpcoesCatalogo);
      } catch {
        /* seleção por cadastro é opcional: seguir com campos livres */
      }
    })();
  }, [clinicaId, opcoesFn]);

  function abrirNovo() {
    setServico(servicoVazio());
    setProfissional(profissionalVazio());
    setFila([]);
    setPosicao(0);
    setAvisos([]);
    setAberto(true);
  }

  function abrirEdicao(registro: any) {
    if (tipo === "servico") setServico(servicoDoRegistro(registro));
    else setProfissional(profissionalDoRegistro(registro));
    setFila([]);
    setPosicao(0);
    setAvisos([]);
    setAberto(true);
  }

  /** Carrega no formulário o registro `i` gerado pela IA. */
  function carregarDaFila(lista: any[], i: number, avisosBase: string[]) {
    const item = lista[i];
    if (!item) return;
    if (tipo === "servico") {
      setServico(paraEstadoServico(item) as EstadoServico);
      setAvisos(avisosBase);
    } else {
      const { estado, ambiguidades } = paraEstadoProfissional(item, {
        medicos: opcoes.medicos,
        especialidades: opcoes.especialidades,
        convenios: opcoes.convenios,
      });
      setProfissional(estado as unknown as EstadoProfissional);
      setAvisos([...avisosBase, ...ambiguidades]);
    }
  }

  /** Só roda no clique. Nada é salvo nem publicado automaticamente. */
  async function organizarComIA() {
    if (!podeEditar || iaProcessando) return;
    if (!clinicaId || iaTexto.trim().length < 10 || (iaModo === "editar" && !iaRegistroId)) {
      setIaErro(
        iaModo === "editar"
          ? "Selecione o cadastro e descreva a alteração com pelo menos 10 caracteres."
          : "Escreva as informações com pelo menos 10 caracteres.",
      );
      return;
    }
    const meu = ++pedidoRef.current;
    setIaProcessando(true);
    setIaErro("");
    try {
      if (iaModo === "editar") {
        const previa = await previaFn({
          data: { clinicaId, tipo, id: iaRegistroId, texto: iaTexto.trim() },
        });
        if (meu !== pedidoRef.current) return;
        setIaPrevia(previa);
        return;
      }
      const r = (await iaFn({ data: { clinicaId, tipo, texto: iaTexto.trim() } })) as any;
      if (meu !== pedidoRef.current) return; // resposta atrasada: descartar
      const lista: any[] = tipo === "servico" ? r.servicos : r.profissionais;
      if (!lista?.length) {
        toast.error("A IA não encontrou registros neste texto. Revise e tente novamente.");
        return;
      }
      const base = [...(r.pendencias ?? []), ...(r.ambiguidades ?? [])];
      setFila(lista);
      setPosicao(0);
      carregarDaFila(lista, 0, base);
      setIaAberta(false);
      setAberto(true);
      toast.success(
        lista.length > 1
          ? `${lista.length} registros organizados. Revise um a um antes de salvar.`
          : "Campos preenchidos. Revise antes de salvar.",
      );
    } catch (e: any) {
      if (meu !== pedidoRef.current) return;
      // O texto digitado é preservado: a janela continua aberta.
      setIaErro(e?.message ?? "A IA não respondeu agora. Seu texto foi preservado.");
    } finally {
      if (meu === pedidoRef.current) setIaProcessando(false);
    }
  }

  function fecharIA() {
    if (publicandoIA.current) return;
    pedidoRef.current++;
    setIaProcessando(false);
    setIaPrevia(null);
    setIaErro("");
    setIaAberta(false);
  }

  async function publicarEdicaoIA() {
    if (!clinicaId || !podeEditar || !iaPrevia || publicandoIA.current) return;
    publicandoIA.current = true;
    setSalvando(true);
    setIaErro("");
    const meu = pedidoRef.current;
    try {
      const comum = {
        clinicaId,
        id: iaPrevia.id,
        publicar: true,
        esperadoUpdatedAt: iaPrevia.esperadoUpdatedAt,
      };
      if (iaPrevia.tipo === "servico") {
        await salvarServicoFn({ data: { ...comum, dados: servicoSchema.parse(iaPrevia.dados) } });
      } else {
        await salvarProfFn({ data: { ...comum, dados: profissionalSchema.parse(iaPrevia.dados) } });
      }
      if (meu !== pedidoRef.current) return;
      toast.success("Alterações confirmadas e publicadas no cadastro existente.");
      setIaAberta(false);
      setIaPrevia(null);
      setIaTexto("");
      await carregar();
    } catch (e: any) {
      if (meu === pedidoRef.current) setIaErro(e?.message ?? "Não foi possível publicar a edição.");
    } finally {
      publicandoIA.current = false;
      setSalvando(false);
    }
  }

  function proximoDaFila() {
    const prox = posicao + 1;
    if (prox >= fila.length) return;
    setPosicao(prox);
    carregarDaFila(fila, prox, []);
  }

  async function salvar(publicar: boolean) {
    if (!clinicaId) return;
    setSalvando(true);
    try {
      if (tipo === "servico") {
        const dados = servicoParaEnvio(servico);
        const r = (await salvarServicoFn({
          data: { clinicaId, id: servico.id, publicar, dados },
        })) as any;
        toast.success(
          r.emRevisao
            ? "Alterações salvas em revisão. O conteúdo publicado não mudou."
            : publicar
              ? "Procedimento publicado."
              : "Rascunho salvo.",
        );
      } else {
        const dados = profissionalParaEnvio(profissional, opcoes);
        const r = (await salvarProfFn({
          data: { clinicaId, id: profissional.id, publicar, dados },
        })) as any;
        toast.success(
          r.emRevisao
            ? "Alterações salvas em revisão. O conteúdo publicado não mudou."
            : publicar
              ? "Profissional publicado."
              : "Rascunho salvo.",
        );
      }
      if (posicao + 1 < fila.length) proximoDaFila();
      else setAberto(false);
      await carregar();
    } catch (e: any) {
      const msg =
        e?.issues?.[0]?.message ?? e?.message ?? "Não foi possível salvar. Revise os campos.";
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(id: string, status: StatusCatalogo) {
    if (!clinicaId) return;
    try {
      await statusFn({ data: { clinicaId, tipo, id, status } });
      toast.success(`Status alterado para ${ROTULO_STATUS[status]}.`);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível alterar o status.");
    }
  }

  async function excluir(id: string) {
    if (!clinicaId) return;
    if (!window.confirm("Excluir este item do catálogo?")) return;
    try {
      await excluirFn({ data: { clinicaId, tipo, id } });
      toast.success("Item excluído.");
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível excluir.");
    }
  }

  const titulo = tipo === "servico" ? "Exames e procedimentos" : "Consultas e profissionais";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{titulo}</h3>
          <p className="text-sm text-muted-foreground">
            Cadastro manual ou com IA. A Nina responde aos pacientes usando apenas os registros
            publicados.
          </p>
        </div>
        {podeEditar && (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setIaAberta(true);
              }}
              size="sm"
              variant="outline"
            >
              <Sparkles className="mr-2 h-4 w-4" /> Criar ou editar com IA
            </Button>
            <Button onClick={abrirNovo} size="sm">
              <Plus className="mr-2 h-4 w-4" /> Novo
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={buscaId}>Pesquisar {titulo.toLowerCase()}</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={buscaId}
            ref={buscaRef}
            type="search"
            uppercase={false}
            autoComplete="off"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={
              tipo === "servico"
                ? "Digite o nome do exame ou procedimento…"
                : "Digite o nome do profissional ou a especialidade…"
            }
            className="pl-9 pr-11 [&::-webkit-search-cancel-button]:hidden"
          />
          {busca && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
              aria-label="Limpar pesquisa"
              onClick={() => {
                setBusca("");
                buscaRef.current?.focus();
              }}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          )}
        </div>
        {!carregando && (
          <p role="status" className="text-xs text-muted-foreground">
            {itensFiltrados.length} de {itens.length} registros
          </p>
        )}
      </div>

      <Dialog
        open={iaAberta}
        onOpenChange={(v) => {
          if (!v) fecharIA();
        }}
      >
        <DialogContent
          className="max-w-3xl max-h-[85vh] overflow-y-auto"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>
              {iaPrevia ? "Prévia da edição" : "Criar ou editar com IA"} — {titulo.toLowerCase()}
            </DialogTitle>
          </DialogHeader>
          {iaPrevia ? (
            <div className="space-y-4">
              <p className="text-sm">
                Cadastro: <strong>{iaPrevia.nome}</strong>
              </p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                Seu pedido: {iaTexto}
              </p>
              <p className="text-sm text-muted-foreground">
                Confira as diferenças. Ao confirmar, este cadastro será atualizado e publicado para
                uso da Nina.
              </p>
              {iaPrevia.incluiRascunho && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  Esta prévia inclui também as alterações que já estavam salvas em revisão.
                </p>
              )}
              {iaPrevia.mudancas.length === 0 && (
                <p className="text-sm">
                  A proposta descarta as alterações em revisão e mantém o conteúdo publicado.
                </p>
              )}
              {iaPrevia.mudancas.map((mudanca) => (
                <section key={mudanca.campo} className="rounded-md border p-3 space-y-2">
                  <h4 className="font-medium text-sm">{mudanca.campo}</h4>
                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-muted-foreground">Antes</p>
                      <p className="whitespace-pre-wrap break-words">{mudanca.antes}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-primary">Depois</p>
                      <p className="whitespace-pre-wrap break-words">{mudanca.depois}</p>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Operação da IA">
                <Button
                  variant={iaModo === "criar" ? "default" : "outline"}
                  aria-pressed={iaModo === "criar"}
                  disabled={iaProcessando}
                  onClick={() => {
                    setIaModo("criar");
                    setIaErro("");
                  }}
                >
                  Criar cadastro
                </Button>
                <Button
                  variant={iaModo === "editar" ? "default" : "outline"}
                  aria-pressed={iaModo === "editar"}
                  disabled={iaProcessando}
                  onClick={() => {
                    setIaModo("editar");
                    setIaErro("");
                  }}
                >
                  Editar cadastro existente
                </Button>
              </div>
              {iaModo === "editar" && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Qual cadastro deseja editar?</p>
                  <SearchableSelect
                    options={itens.map((item) => ({
                      value: item.id,
                      label: `${item.nome} · ${ROTULO_STATUS[item.status as StatusCatalogo] ?? item.status}${tipo === "profissional" && item.especialidades?.length ? ` · ${item.especialidades.map((e: { nome: string }) => e.nome).join(", ")}` : ""}`,
                    }))}
                    value={iaRegistroId}
                    onChange={(id) => {
                      setIaRegistroId(id);
                      setIaErro("");
                    }}
                    placeholder="Pesquisar e selecionar cadastro"
                    searchPlaceholder={
                      tipo === "servico"
                        ? "Buscar exame ou procedimento…"
                        : "Buscar profissional ou especialidade…"
                    }
                    emptyText="Nenhum cadastro encontrado."
                    disabled={iaProcessando || carregando}
                  />
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                {iaModo === "editar"
                  ? "Descreva o que deseja alterar no cadastro selecionado. Você verá o antes e depois para confirmar e publicar."
                  : "Escreva ou cole as informações. A IA organiza os campos e você revisa antes de salvar."}{" "}
                Nada é salvo nem publicado automaticamente.
              </p>
              <Label htmlFor={iaTextoId}>
                {iaModo === "editar" ? "O que deseja mudar?" : "Informações para o novo cadastro"}
              </Label>
              <Textarea
                id={iaTextoId}
                value={iaTexto}
                onChange={(e) => setIaTexto(e.target.value)}
                disabled={iaProcessando}
                rows={7}
                maxLength={20000}
                placeholder={
                  iaModo === "editar"
                    ? tipo === "servico"
                      ? "Ex.: Altere o valor no dinheiro da mamografia para R$ 180. Mantenha o cartão e as demais informações."
                      : "Ex.: Altere o horário de início de quinta-feira para 14:30. Mantenha os demais dias."
                    : tipo === "servico"
                      ? "Ex.: Ultrassom de tireoide 130 no pix, 150 no cartão em 3x. Precisa de pedido médico..."
                      : "Ex.: Dra. Ana Paula, cardiologista, atende quinzenal às quintas das 14h às 18h..."
                }
              />
              <p className="text-xs text-muted-foreground">
                Modelo utilizado: {MODELO_CATALOGO_IA}.
              </p>
            </div>
          )}
          {iaErro && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
            >
              {iaErro}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={fecharIA} disabled={salvando}>
              Cancelar
            </Button>
            {iaPrevia ? (
              <>
                <Button
                  variant="outline"
                  disabled={salvando}
                  onClick={() => {
                    setIaPrevia(null);
                    setIaErro("");
                  }}
                >
                  Ajustar pedido
                </Button>
                <Button disabled={salvando || !podeEditar} onClick={() => void publicarEdicaoIA()}>
                  {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar e
                  publicar
                </Button>
              </>
            ) : (
              <Button
                onClick={() => void organizarComIA()}
                disabled={
                  iaProcessando ||
                  !podeEditar ||
                  iaTexto.trim().length < 10 ||
                  (iaModo === "editar" && !iaRegistroId)
                }
              >
                {iaProcessando ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {iaModo === "editar"
                  ? "Gerar prévia da edição"
                  : "Organizar e preencher campos com IA"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum item cadastrado ainda.</p>
      ) : itensFiltrados.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum resultado para “{busca.trim()}”. Tente outro nome ou limpe a pesquisa.
        </p>
      ) : (
        <div className="grid gap-3">
          {itensFiltrados.map((item) => (
            <Card key={item.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-sm">{item.nome}</CardTitle>
                  <BadgeStatus status={item.status} emRevisao={!!item.rascunho} />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {tipo === "servico" ? (
                  <p>
                    Valor: {formatarBRL(item.valor)} · {item.formas_pagamento?.length ?? 0} forma(s)
                    de pagamento
                  </p>
                ) : (
                  <p>{resumoHorarios(item.horarios ?? [])}</p>
                )}
                {podeEditar && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => abrirEdicao(item)}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar
                    </Button>
                    {item.status !== "PUBLICADO" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => mudarStatus(item.id, "PUBLICADO")}
                      >
                        <Send className="mr-2 h-4 w-4" /> Publicar
                      </Button>
                    )}
                    {item.status !== "ARQUIVADO" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => mudarStatus(item.id, "ARQUIVADO")}
                      >
                        <Archive className="mr-2 h-4 w-4" /> Arquivar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => excluir(item.id)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Excluir
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {titulo}
              {fila.length > 1 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  Registro {posicao + 1} de {fila.length}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {avisos.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium">Confira antes de salvar</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                {avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {tipo === "servico" ? (
            <FormServico
              estado={servico}
              onChange={setServico}
              opcoes={opcoes}
              somenteLeitura={!podeEditar}
            />
          ) : (
            <FormProfissional
              estado={profissional}
              onChange={setProfissional}
              opcoes={opcoes}
              somenteLeitura={!podeEditar}
            />
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            {posicao + 1 < fila.length && (
              <Button variant="ghost" onClick={proximoDaFila} disabled={salvando}>
                Pular para o próximo
              </Button>
            )}
            {podeEditar && (
              <>
                <Button variant="secondary" onClick={() => salvar(false)} disabled={salvando}>
                  {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar rascunho
                </Button>
                <Button onClick={() => salvar(true)} disabled={salvando}>
                  {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Publicar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
