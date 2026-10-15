import { useEffect, useId, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TextoCatalogo as Textarea } from "./TextoCatalogo";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  organizarTextoCatalogoIA,
  selecionarEdicoesCatalogoIA,
  preverEdicaoCatalogoIA,
  publicarEdicoesCatalogoIA,
  salvarServicoCatalogo,
  salvarProfissionalCatalogo,
} from "@/lib/nina/catalogo.functions";
import {
  compararDadosCatalogo,
  type MudancaCatalogo,
  type PreviaEdicaoCatalogo,
} from "@/lib/nina/catalogo-edicao-ia";
import {
  MODELO_CATALOGO_IA,
  paraEstadoProfissional,
  paraEstadoServico,
  type TipoCatalogo,
} from "@/lib/nina/catalogo-ia";
import { lacunasCatalogo } from "@/lib/nina/catalogo-lacunas";
import type { ProfissionalCatalogo, ServicoCatalogo } from "@/lib/nina/catalogo";
import { servicoParaEnvio, type EstadoServico, type OpcoesCatalogo } from "./FormServico";
import { profissionalParaEnvio, type EstadoProfissional } from "./FormProfissional";

export type EstadoNovoCatalogo = EstadoServico | EstadoProfissional;

type Item = {
  chave: string;
  tipo: TipoCatalogo;
  nome: string;
  pedido: string;
  /** Edição de cadastro existente: antes e depois. */
  previa?: PreviaEdicaoCatalogo;
  /** Cadastro novo: campos preenchidos pela IA. */
  novo?: { dados: ServicoCatalogo | ProfissionalCatalogo; estado: EstadoNovoCatalogo };
  preenchidos: MudancaCatalogo[];
  duvidas: string[];
  lacunas: string[];
  erro?: string;
  selecionado: boolean;
  publicado?: boolean;
};

const ROTULO_TIPO: Record<TipoCatalogo, string> = {
  servico: "Exame/procedimento",
  profissional: "Consulta/profissional",
};
const preenchido = (m: MudancaCatalogo) => m.depois !== "Não informado" && m.depois !== "Nenhum";
/** Erro de validação do formulário (zod) mostra a primeira mensagem, não o JSON. */
const mensagemErro = (e: unknown) =>
  (e as { issues?: Array<{ message?: string }> })?.issues?.[0]?.message ??
  (e instanceof Error ? e.message : "Não foi possível preparar este item.");

/**
 * Botão único de IA da Base de conhecimento (15/10/2026): cria cadastros novos,
 * edita um ou vários existentes, nas duas abas. A IA só propõe; nada é gravado
 * sem a confirmação de quem revisa. Campos vazios aparecem como "Faltou preencher",
 * sem impedir a publicação.
 */
export function PreenchimentoIA({
  clinicaId,
  podeEditar,
  opcoes,
  tipoAtual,
  onPublicado,
  onAbrirFormulario,
}: {
  clinicaId?: string;
  podeEditar: boolean;
  opcoes: OpcoesCatalogo;
  /** Aba aberta: só cadastros novos desse tipo podem seguir para o formulário completo. */
  tipoAtual: TipoCatalogo;
  onPublicado: () => Promise<void>;
  onAbrirFormulario: (estado: EstadoNovoCatalogo, avisos: string[]) => void;
}) {
  const selecionar = useServerFn(selecionarEdicoesCatalogoIA);
  const prever = useServerFn(preverEdicaoCatalogoIA);
  const organizar = useServerFn(organizarTextoCatalogoIA);
  const publicar = useServerFn(publicarEdicoesCatalogoIA);
  const salvarServico = useServerFn(salvarServicoCatalogo);
  const salvarProfissional = useServerFn(salvarProfissionalCatalogo);
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [duvidas, setDuvidas] = useState<string[]>([]);
  const [erro, setErro] = useState("");
  const [progresso, setProgresso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [precisaRevisar, setPrecisaRevisar] = useState(false);
  const versao = useRef(0);
  const lock = useRef(false);
  const id = useId();
  useEffect(() => {
    versao.current++;
    setAberto(false);
    setTexto("");
    setItens([]);
    setDuvidas([]);
    setErro("");
    setOcupado(false);
    setPrecisaRevisar(false);
    return () => {
      versao.current++;
    };
  }, [clinicaId, podeEditar]);

  /** Monta um cadastro novo a partir do trecho do pedido. Não grava nada. */
  async function prepararNovo(
    alvo: { tipo: TipoCatalogo; nome: string; pedido: string },
    n: number,
  ): Promise<Item[]> {
    const r = (await organizar({
      data: { clinicaId: clinicaId!, tipo: alvo.tipo, texto: alvo.pedido },
    })) as {
      servicos?: unknown[];
      profissionais?: unknown[];
      pendencias?: string[];
      ambiguidades?: string[];
    };
    const lista = (alvo.tipo === "servico" ? r.servicos : r.profissionais) ?? [];
    if (!lista.length) throw new Error("A IA não conseguiu montar este cadastro com o texto.");
    const duvidasIA = [
      ...(r.pendencias ?? []).map((p) => `Não coube em nenhum campo: ${p}`),
      ...(r.ambiguidades ?? []),
    ];
    return lista.map((bruto, i) => {
      let estado: EstadoNovoCatalogo;
      let dados: ServicoCatalogo | ProfissionalCatalogo;
      const duvidasItem = [...duvidasIA];
      if (alvo.tipo === "servico") {
        estado = paraEstadoServico(bruto) as EstadoServico;
        dados = servicoParaEnvio(estado);
      } else {
        const conv = paraEstadoProfissional(bruto, opcoes);
        estado = conv.estado as unknown as EstadoProfissional;
        duvidasItem.push(...conv.ambiguidades);
        dados = profissionalParaEnvio(estado, opcoes);
      }
      return {
        chave: `${alvo.tipo}:novo:${n}:${i}`,
        tipo: alvo.tipo,
        nome: dados.nome,
        pedido: alvo.pedido,
        novo: { dados, estado },
        preenchidos: compararDadosCatalogo(alvo.tipo, {}, dados).filter(preenchido),
        duvidas: duvidasItem,
        lacunas: lacunasCatalogo(alvo.tipo, dados),
        selecionado: true,
      };
    });
  }

  async function gerar() {
    if (!clinicaId || !podeEditar || ocupado || lock.current) return;
    const atual = ++versao.current;
    setOcupado(true);
    setErro("");
    setDuvidas([]);
    setItens([]);
    setPrecisaRevisar(false);
    setProgresso("Identificando o que criar e o que editar…");
    try {
      const r = await selecionar({ data: { clinicaId, texto } });
      if (atual !== versao.current) return;
      setDuvidas(r.esclarecimentos);
      const resultados: Item[] = [];
      for (const [n, alvo] of r.itens.entries()) {
        if (atual !== versao.current) return;
        const rotulo = alvo.id ? alvo.nome : `${alvo.nome} (novo)`;
        setProgresso(`Preparando ${n + 1} de ${r.itens.length}: ${rotulo}`);
        try {
          if (alvo.id) {
            const previa = await prever({
              data: { clinicaId, tipo: alvo.tipo, id: alvo.id, texto: alvo.pedido },
            });
            resultados.push({
              chave: `${alvo.tipo}:${alvo.id}`,
              tipo: alvo.tipo,
              nome: alvo.nome,
              pedido: alvo.pedido,
              previa,
              preenchidos: [],
              duvidas: [],
              lacunas: lacunasCatalogo(alvo.tipo, previa.dados),
              selecionado: true,
            });
          } else resultados.push(...(await prepararNovo(alvo, n)));
        } catch (e) {
          resultados.push({
            chave: `${alvo.tipo}:${alvo.id ?? `novo:${n}`}`,
            tipo: alvo.tipo,
            nome: rotulo,
            pedido: alvo.pedido,
            preenchidos: [],
            duvidas: [],
            lacunas: [],
            erro: mensagemErro(e),
            selecionado: false,
          });
        }
        if (atual !== versao.current) return;
        setItens([...resultados]);
      }
    } catch (e) {
      if (atual === versao.current)
        setErro(e instanceof Error ? e.message : "Não foi possível preparar o pedido.");
    } finally {
      if (atual === versao.current) {
        setOcupado(false);
        setProgresso("");
      }
    }
  }

  const selecionados = itens.filter((i) => i.selecionado && (i.previa || i.novo) && !i.publicado);
  async function confirmar() {
    if (
      !clinicaId ||
      !podeEditar ||
      ocupado ||
      lock.current ||
      precisaRevisar ||
      !selecionados.length
    )
      return;
    lock.current = true;
    setPublicando(true);
    setErro("");
    const atual = versao.current;
    const feitos: string[] = [];
    const marcar = () =>
      setItens((xs) =>
        xs.map((i) =>
          feitos.includes(i.chave) ? { ...i, publicado: true, selecionado: false } : i,
        ),
      );
    try {
      const edicoes = selecionados.filter((i) => i.previa);
      if (edicoes.length) {
        const r = await publicar({
          data: {
            clinicaId,
            itens: edicoes.map((i) => {
              const p = i.previa!;
              return {
                tipo: p.tipo,
                id: p.id,
                esperadoUpdatedAt: p.esperadoUpdatedAt,
                dados: p.dados,
              };
            }),
          },
        });
        feitos.push(...r.publicados);
        if (r.falha) throw new Error(r.falha.mensagem);
      }
      for (const item of selecionados.filter((i) => i.novo)) {
        const comum = { clinicaId, id: null, publicar: true };
        if (item.tipo === "servico")
          await salvarServico({
            data: { ...comum, dados: item.novo!.dados as ServicoCatalogo },
          });
        else
          await salvarProfissional({
            data: { ...comum, dados: item.novo!.dados as ProfissionalCatalogo },
          });
        feitos.push(item.chave);
      }
      if (atual !== versao.current) return;
      marcar();
      toast.success(`${feitos.length} cadastro(s) publicado(s).`);
      await onPublicado();
    } catch (e) {
      if (atual === versao.current) {
        marcar();
        setPrecisaRevisar(true);
        setErro(
          `${feitos.length} cadastro(s) publicado(s). A publicação parou: ${e instanceof Error ? e.message : "erro desconhecido."} Os demais itens não foram publicados. Prepare de novo para conferir o estado atual antes de continuar.`,
        );
        if (feitos.length) await onPublicado();
      }
    } finally {
      lock.current = false;
      setPublicando(false);
    }
  }

  function abrirNoFormulario(item: Item) {
    if (!item.novo) return;
    onAbrirFormulario(item.novo.estado, [
      ...item.duvidas,
      ...item.lacunas.map((l) => `Faltou preencher: ${l}`),
    ]);
    setItens((xs) => xs.map((i) => (i.chave === item.chave ? { ...i, selecionado: false } : i)));
    setAberto(false);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={!clinicaId || !podeEditar}
        onClick={() => setAberto(true)}
      >
        <Sparkles className="mr-2 h-4 w-4" />
        Preencher com IA
      </Button>
      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          if (lock.current) return;
          if (!v) {
            versao.current++;
            if (ocupado) setItens([]);
            setOcupado(false);
            setProgresso("");
          }
          setAberto(v);
        }}
      >
        <DialogContent
          data-os-zap="true"
          className="oszap-base-dialog"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>Preencher a base com IA</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Escreva as informações de um ou vários exames, procedimentos, consultas ou
            profissionais. A IA cria o que ainda não existe e atualiza o que já está cadastrado, nas
            duas abas, até 20 cadastros por vez. Nada é salvo antes da sua revisão.
          </p>
          <Label htmlFor={id}>Informações</Label>
          <Textarea
            id={id}
            value={texto}
            maxLength={20000}
            rows={6}
            disabled={ocupado || publicando}
            onChange={(e) => {
              setTexto(e.target.value);
              setItens([]);
              setDuvidas([]);
              setErro("");
              setPrecisaRevisar(false);
            }}
            placeholder="Ex.: Cadastre o ultrassom de tireoide: R$ 130 no dinheiro e R$ 150 no Pix/cartão (até 3x), precisa de pedido médico, sem preparo. Altere a consulta de cardiologia adulta do Dr. Sandro para R$ 130 no dinheiro, mantendo os demais valores."
          />
          <p className="text-xs text-muted-foreground">Modelo utilizado: {MODELO_CATALOGO_IA}.</p>
          <Button
            variant="outline"
            disabled={ocupado || publicando || !podeEditar || texto.trim().length < 10}
            onClick={() => void gerar()}
          >
            {ocupado ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {itens.length ? "Preparar de novo" : "Preparar para revisão"}
          </Button>
          {progresso && (
            <p role="status" className="text-sm">
              {progresso}
            </p>
          )}
          {duvidas.length > 0 && (
            <div role="alert" className="rounded-md border border-amber-500/40 p-3 text-sm">
              <p className="font-medium">Esclareça no texto antes de continuar:</p>
              <ul className="list-disc pl-5">
                {duvidas.map((d, n) => (
                  <li key={n}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {itens.length > 0 && (
            <p className="text-sm">
              Revise cada item. Somente os selecionados serão publicados nesta base, sem uso pela
              Maria.
            </p>
          )}
          {itens.map((item) => (
            <section key={item.chave} className="rounded-md border p-3 space-y-3">
              <label className="flex items-start gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={item.selecionado}
                  disabled={ocupado || publicando || !(item.previa || item.novo) || item.publicado}
                  onChange={(e) =>
                    setItens((xs) =>
                      xs.map((i) =>
                        i.chave === item.chave ? { ...i, selecionado: e.target.checked } : i,
                      ),
                    )
                  }
                />
                <span>
                  {item.novo ? "Novo" : item.previa ? "Edição" : "Item"} · {item.nome} ·{" "}
                  {ROTULO_TIPO[item.tipo]}
                  {item.publicado ? " · Publicado" : ""}
                </span>
              </label>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.pedido}</p>
              {item.erro && (
                <p role="alert" className="text-sm text-destructive">
                  Não será publicado: {item.erro}
                </p>
              )}
              {item.previa?.incluiRascunho && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Inclui alterações que já estavam em revisão. Confira todas as diferenças.
                </p>
              )}
              {item.previa?.mudancas.map((m) => (
                <div key={m.campo} className="space-y-1 text-sm">
                  <h4 className="font-medium">{m.campo}</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="min-w-0">
                      <p className="text-muted-foreground">Antes</p>
                      <p className="whitespace-pre-wrap break-words">{m.antes}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-primary">Depois</p>
                      <p className="whitespace-pre-wrap break-words">{m.depois}</p>
                    </div>
                  </div>
                </div>
              ))}
              {item.preenchidos.length > 0 && (
                <dl className="grid gap-2 text-sm">
                  {item.preenchidos.map((m) => (
                    <div key={m.campo} className="min-w-0">
                      <dt className="font-medium">{m.campo}</dt>
                      <dd className="whitespace-pre-wrap break-words">{m.depois}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {item.duvidas.length > 0 && (
                <div className="rounded-md border border-amber-500/40 p-3 text-sm">
                  <p className="font-medium">Confira</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {item.duvidas.map((d, n) => (
                      <li key={n}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
              {item.lacunas.length > 0 && (
                <div
                  role="note"
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
                >
                  <p className="font-medium">Faltou preencher ({item.lacunas.length})</p>
                  <p className="text-muted-foreground">
                    Estes campos ficarão vazios. Você pode publicar assim ou completar o texto e
                    preparar de novo.
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {item.lacunas.map((l, n) => (
                      <li key={n}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}
              {item.novo && !item.publicado && item.tipo === tipoAtual && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={ocupado || publicando}
                  onClick={() => abrirNoFormulario(item)}
                >
                  Ajustar no formulário completo
                </Button>
              )}
            </section>
          ))}
          {erro && (
            <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
              {erro}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={publicando}
              onClick={() => {
                versao.current++;
                if (ocupado) setItens([]);
                setAberto(false);
                setOcupado(false);
              }}
            >
              Fechar
            </Button>
            <Button
              disabled={
                ocupado || publicando || precisaRevisar || !podeEditar || !selecionados.length
              }
              onClick={() => void confirmar()}
            >
              {publicando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar e publicar{" "}
              {selecionados.length} selecionado(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
