import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Trash2, Archive, Send, Sparkles } from "lucide-react";
import {
  listarCatalogoNina,
  opcoesCatalogoNina,
  salvarServicoCatalogo,
  salvarProfissionalCatalogo,
  alterarStatusCatalogo,
  excluirItemCatalogo,
  organizarTextoCatalogoIA,
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
 * Nesta fase o catálogo é apenas cadastrado — a fonte usada no atendimento
 * continua sendo a planilha ativa.
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

  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [itens, setItens] = useState<any[]>([]);
  const [opcoes, setOpcoes] = useState<OpcoesCatalogo>(OPCOES_VAZIAS);
  const [aberto, setAberto] = useState(false);
  const [servico, setServico] = useState<EstadoServico>(servicoVazio);
  const [profissional, setProfissional] = useState<EstadoProfissional>(profissionalVazio);

  // "Criar com IA": texto livre → rascunho de formulário para revisão humana.
  const [iaAberta, setIaAberta] = useState(false);
  const [iaTexto, setIaTexto] = useState("");
  const [iaProcessando, setIaProcessando] = useState(false);
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
    if (!clinicaId || iaTexto.trim().length < 10) {
      toast.error("Escreva ou cole as informações a organizar.");
      return;
    }
    const meu = ++pedidoRef.current;
    setIaProcessando(true);
    try {
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
      toast.error(e?.message ?? "A IA não respondeu agora. Seu texto foi preservado.");
    } finally {
      if (meu === pedidoRef.current) setIaProcessando(false);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{titulo}</h3>
          <p className="text-sm text-muted-foreground">
            Cadastro estruturado do catálogo. Nesta fase, a Nina continua respondendo pela
            planilha ativa.
          </p>
        </div>
        {podeEditar && (
          <Button onClick={abrirNovo} size="sm">
            <Plus className="mr-2 h-4 w-4" /> Novo
          </Button>
        )}
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum item cadastrado ainda.</p>
      ) : (
        <div className="grid gap-3">
          {itens.map((item) => (
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
                    Valor: {formatarBRL(item.valor)} ·{" "}
                    {(item.formas_pagamento?.length ?? 0)} forma(s) de pagamento
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
            <DialogTitle>{titulo}</DialogTitle>
          </DialogHeader>
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
