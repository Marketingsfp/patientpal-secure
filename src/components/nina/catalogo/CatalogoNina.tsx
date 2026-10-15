import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { assinarAtualizacao } from "@/lib/webmcp/atualizacao";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizarNomeBusca } from "@/lib/busca-texto";
import { PreenchimentoIA, type EstadoNovoCatalogo } from "./PreenchimentoIA";
import { rotuloPedidoMedico } from "./PedidoMedicoEditor";
import { DicionarioCatalogoEditor } from "./DicionarioCatalogoEditor";
import { ResumoDecisaoNina } from "./ResumoDecisaoNina";
import { MapaCamposCatalogo } from "./MapaCamposCatalogo";
import { SincronizacaoCatalogo } from "./SincronizacaoCatalogo";
import { CatalogoOrganizado } from "./catalogo-organizado";
import { useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";
import { FLAG_CATALOGO_ESTRUTURADO } from "@/lib/nina/catalogo-ajuda";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Trash2, Archive, Send, Search, X } from "lucide-react";
import {
  listarCatalogoNina,
  opcoesCatalogoNina,
  salvarServicoCatalogo,
  salvarProfissionalCatalogo,
  alterarStatusCatalogo,
  excluirItemCatalogo,
} from "@/lib/nina/catalogo.functions";
import {
  ROTULO_STATUS,
  formatarBRL,
  resumoHorarios,
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
    <div className="oszap-base-badges flex flex-wrap items-center gap-2">
      <Badge
        className="oszap-base-record-status"
        data-status={status}
        variant={status === "PUBLICADO" ? "default" : "secondary"}
      >
        {ROTULO_STATUS[status as StatusCatalogo] ?? status}
      </Badge>
      {emRevisao && <Badge variant="outline">Alterações em revisão</Badge>}
    </div>
  );
}

/**
 * Catálogo estruturado da Nina: exames/procedimentos e consultas/profissionais.
 * Base editorial: registros publicados são usados quando esta fonte está selecionada.
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

  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [itens, setItens] = useState<any[]>([]);
  const [busca, setBusca] = useState("");
  const buscaId = useId();
  const buscaRef = useRef<HTMLInputElement>(null);
  const totais = useMemo(
    () => ({
      publicados: itens.filter((item) => item.status === "PUBLICADO").length,
      arquivados: itens.filter((item) => item.status === "ARQUIVADO").length,
      rascunhos: itens.filter((item) => item.status === "RASCUNHO").length,
    }),
    [itens],
  );
  const itensFiltrados = useMemo(() => {
    const termos = normalizarNomeBusca(busca).split(" ").filter(Boolean);
    if (!termos.length) return itens;
    return itens.filter((item) => {
      const nomes = [item.nome];
      nomes.push(...(item.estrutura?.aliases ?? []));
      if (tipo === "profissional") {
        nomes.push(...(item.especialidades ?? []).map((e: { nome?: string }) => e?.nome));
      }
      const texto = normalizarNomeBusca(nomes.filter(Boolean).join(" "));
      return termos.every((termo) => texto.includes(termo));
    });
  }, [busca, itens, tipo]);
  const [opcoes, setOpcoes] = useState<OpcoesCatalogo>(OPCOES_VAZIAS);
  const [aberto, setAberto] = useState(false);
  // Layout por seções e botões “Como ler” (liberação por clínica).
  const { enabled: catalogoOrganizado } = useClinicFeatureFlag(FLAG_CATALOGO_ESTRUTURADO);
  const [servico, setServico] = useState<EstadoServico>(servicoVazio);
  const [profissional, setProfissional] = useState<EstadoProfissional>(profissionalVazio);

  // A IA propõe; somente a confirmação humana grava e publica.
  const [avisos, setAvisos] = useState<string[]>([]);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    setErroCarga("");
    try {
      const r = (await listarFn({ data: { clinicaId } })) as any;
      setItens(tipo === "servico" ? r.servicos : r.profissionais);
    } catch (e: any) {
      setErroCarga(e?.message ?? "Não foi possível carregar o catálogo.");
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
    setAvisos([]);
    setAberto(true);
  }

  function abrirEdicao(registro: any) {
    if (tipo === "servico") setServico(servicoDoRegistro(registro));
    else setProfissional(profissionalDoRegistro(registro));
    setAvisos([]);
    setAberto(true);
  }

  /** Cadastro novo montado pela IA, revisado no formulário completo antes de salvar. */
  function abrirComEstado(estado: EstadoNovoCatalogo, avisosIA: string[]) {
    if (tipo === "servico") setServico(estado as EstadoServico);
    else setProfissional(estado as EstadoProfissional);
    setAvisos(avisosIA);
    setAberto(true);
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
      setAberto(false);
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
    <div className="oszap-base-catalog">
      <div className="oszap-base-toolbar">
        <div>
          <h3 className="text-base font-semibold">{titulo}</h3>
          <p className="text-sm text-muted-foreground">
            Pesquise um registro, cadastre manualmente ou preencha com IA.
          </p>
        </div>
        {podeEditar && !erroCarga && (
          <div className="oszap-base-toolbar-actions flex flex-wrap items-center gap-2">
            {clinicaId && !carregando && (
              <SincronizacaoCatalogo
                key={`${clinicaId}:${tipo}`}
                clinicaId={clinicaId}
                tipo={tipo}
                itens={itens}
                onSincronizado={carregar}
              />
            )}
            {/* Fica montado durante a recarga: a revisão aberta não pode sumir após publicar. */}
            <PreenchimentoIA
              clinicaId={clinicaId}
              podeEditar={podeEditar}
              opcoes={opcoes}
              tipoAtual={tipo}
              onPublicado={carregar}
              onAbrirFormulario={abrirComEstado}
            />
            {!carregando && (
              <Button onClick={abrirNovo} size="sm">
                <Plus className="mr-2 h-4 w-4" /> Novo
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="oszap-base-search">
        <Label htmlFor={buscaId} className="sr-only">
          Pesquisar {titulo.toLowerCase()}
        </Label>
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
        {!carregando && !erroCarga && busca.trim() && (
          <p role="status" className="text-xs text-muted-foreground">
            {itensFiltrados.length} de {itens.length} registros
          </p>
        )}
      </div>

      {!carregando && !erroCarga && (
        <dl
          aria-label="Totais de registros desta seção"
          className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm"
          aria-live="polite"
        >
          {[
            ["Total", itens.length],
            ["Publicados", totais.publicados],
            ["Arquivados", totais.arquivados],
            ["Rascunhos", totais.rascunhos],
          ].map(([rotulo, quantidade]) => (
            <div key={rotulo} className="flex items-baseline gap-2">
              <dt className="text-muted-foreground">{rotulo}:</dt>
              <dd className="font-semibold tabular-nums">{quantidade}</dd>
            </div>
          ))}
        </dl>
      )}

      <MapaCamposCatalogo tipo={tipo} />

      {erroCarga ? (
        <div role="alert" className="space-y-2 rounded-md border border-destructive/40 p-4 text-sm">
          <p>{erroCarga}</p>
          <Button variant="outline" size="sm" onClick={() => void carregar()}>
            Tentar novamente
          </Button>
        </div>
      ) : carregando ? (
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
        <div className="oszap-base-records">
          {itensFiltrados.map((item) => (
            <Card key={item.id} className="oszap-base-record">
              <CardHeader className="oszap-base-record-header">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="min-w-0 break-words text-sm leading-snug">
                    {item.nome}
                  </CardTitle>
                  <BadgeStatus status={item.status} emRevisao={!!item.rascunho} />
                </div>
              </CardHeader>
              <CardContent className="oszap-base-record-content text-sm text-muted-foreground">
                <div className="min-w-0 space-y-1">
                  {/* Catálogo estruturado: resumo do que decide a conduta da Nina. */}
                  {catalogoOrganizado ? (
                    <ResumoDecisaoNina item={item} tipo={tipo} />
                  ) : tipo === "servico" ? (
                    item.formas_pagamento?.length ? (
                      <dl className="oszap-base-payments">
                        {item.formas_pagamento.map(
                          (
                            pagamento: {
                              forma: string;
                              valor?: number | null;
                              condicao?: string | null;
                            },
                            index: number,
                          ) => (
                            <div key={index} className="flex flex-wrap gap-x-1">
                              <dt>
                                {pagamento.forma}
                                {pagamento.condicao ? ` (${pagamento.condicao})` : ""}:
                              </dt>
                              <dd className="font-medium text-foreground">
                                {pagamento.valor == null
                                  ? "Não informado"
                                  : formatarBRL(pagamento.valor)}
                              </dd>
                            </div>
                          ),
                        )}
                      </dl>
                    ) : (
                      <p>Valor: {formatarBRL(item.valor)}</p>
                    )
                  ) : (
                    <p>{resumoHorarios(item.horarios ?? [])}</p>
                  )}
                  {!catalogoOrganizado && (
                    <p>
                      Pedido médico:{" "}
                      <span className="font-medium text-foreground">
                        {rotuloPedidoMedico(item.estrutura?.pedido_medico)}
                      </span>
                    </p>
                  )}
                  {!!item.estrutura?.aliases?.length && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-primary">
                        Dicionário · {item.estrutura.aliases.length} variações
                      </summary>
                      <p className="mt-1 break-words">{item.estrutura.aliases.join(" · ")}</p>
                    </details>
                  )}
                </div>
                {podeEditar && (
                  <div className="oszap-base-record-actions flex flex-wrap gap-2">
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
        <DialogContent data-os-zap="true" className="oszap-base-dialog">
          <CatalogoOrganizado.Provider value={catalogoOrganizado}>
            <DialogHeader>
              <DialogTitle>{titulo}</DialogTitle>
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
            {/* Chave própria: igual à do formulário ao lado, o React duplicava o dicionário. */}
            <DicionarioCatalogoEditor
              key={`dicionario-${tipo}-${tipo === "servico" ? servico.id : profissional.id}`}
              clinicaId={clinicaId}
              somenteLeitura={!podeEditar || salvando}
              contexto={
                tipo === "servico"
                  ? {
                      tipo,
                      nome: servico.nome,
                      descricao: servico.descricao_publica,
                      especialidades: [],
                      aliases: servico.estrutura.aliases,
                      abrangencia: servico.estrutura.abrangencia,
                    }
                  : {
                      tipo,
                      nome: profissional.nome,
                      descricao: profissional.observacao_publica,
                      especialidades: [
                        ...opcoes.especialidades
                          .filter((e) => profissional.especialidades.includes(e.id))
                          .map((e) => e.nome),
                        ...profissional.especialidadesLivres,
                      ],
                      aliases: profissional.estrutura.aliases,
                      abrangencia: profissional.estrutura.abrangencia,
                    }
              }
              onChange={(aliases) =>
                tipo === "servico"
                  ? setServico((atual) => ({
                      ...atual,
                      estrutura: { ...atual.estrutura, aliases },
                    }))
                  : setProfissional((atual) => ({
                      ...atual,
                      estrutura: { ...atual.estrutura, aliases },
                    }))
              }
            />
            {tipo === "servico" ? (
              <FormServico
                key={`servico-${servico.id ?? "novo"}`}
                estado={servico}
                onChange={setServico}
                opcoes={opcoes}
                somenteLeitura={!podeEditar}
              />
            ) : (
              <FormProfissional
                key={`profissional-${profissional.id ?? "novo"}`}
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
          </CatalogoOrganizado.Provider>
        </DialogContent>
      </Dialog>
    </div>
  );
}
