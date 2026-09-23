import { useEffect, useId, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  selecionarEdicoesCatalogoIA,
  preverEdicaoCatalogoIA,
  publicarEdicoesCatalogoIA,
} from "@/lib/nina/catalogo.functions";
import type { PreviaEdicaoCatalogo } from "@/lib/nina/catalogo-edicao-ia";
import type { AlvoCatalogo } from "@/lib/nina/catalogo-lote-ia";

type Item = AlvoCatalogo & {
  previa?: PreviaEdicaoCatalogo;
  erro?: string;
  selecionado: boolean;
  publicado?: boolean;
};
const chave = (i: AlvoCatalogo) => `${i.tipo}:${i.id}`;

export function EdicaoLoteIA({
  clinicaId,
  podeEditar,
  onPublicado,
}: {
  clinicaId?: string;
  podeEditar: boolean;
  onPublicado: () => Promise<void>;
}) {
  const selecionar = useServerFn(selecionarEdicoesCatalogoIA);
  const prever = useServerFn(preverEdicaoCatalogoIA);
  const publicar = useServerFn(publicarEdicoesCatalogoIA);
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

  async function gerar() {
    if (!clinicaId || !podeEditar || ocupado || lock.current) return;
    const atual = ++versao.current;
    setOcupado(true);
    setErro("");
    setDuvidas([]);
    setItens([]);
    setPrecisaRevisar(false);
    setProgresso("Identificando os cadastros…");
    try {
      const r = await selecionar({ data: { clinicaId, texto } });
      if (atual !== versao.current) return;
      setDuvidas(r.esclarecimentos);
      const resultados: Item[] = [];
      for (const [n, alvo] of r.itens.entries()) {
        if (atual !== versao.current) return;
        setProgresso(`Preparando ${n + 1} de ${r.itens.length}: ${alvo.nome}`);
        try {
          const previa = await prever({
            data: { clinicaId, tipo: alvo.tipo, id: alvo.id, texto: alvo.pedido },
          });
          resultados.push({ ...alvo, previa, selecionado: true });
        } catch (e) {
          resultados.push({
            ...alvo,
            erro: e instanceof Error ? e.message : "Não foi possível preparar este item.",
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

  const selecionados = itens.filter((i) => i.selecionado && i.previa && !i.publicado);
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
    try {
      const r = await publicar({
        data: {
          clinicaId,
          itens: selecionados.map((i) => {
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
      if (atual !== versao.current) return;
      setItens((xs) =>
        xs.map((i) =>
          r.publicados.includes(chave(i)) ? { ...i, publicado: true, selecionado: false } : i,
        ),
      );
      if (r.publicados.length) {
        toast.success(`${r.publicados.length} cadastro(s) atualizado(s) e publicado(s).`);
        await onPublicado();
      }
      if (r.falha) {
        setPrecisaRevisar(true);
        setErro(
          `${r.publicados.length} cadastro(s) publicado(s). A publicação parou: ${r.falha.mensagem} Os demais itens não foram publicados. Gere uma nova prévia antes de continuar.`,
        );
      }
    } catch (e) {
      if (atual === versao.current) {
        setPrecisaRevisar(true);
        setErro(
          `${e instanceof Error ? e.message : "Não foi possível confirmar a publicação."} Gere uma nova prévia para conferir o estado atual antes de tentar novamente.`,
        );
      }
    } finally {
      lock.current = false;
      setPublicando(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        disabled={!clinicaId || !podeEditar}
        onClick={() => setAberto(true)}
      >
        <Sparkles className="mr-2 h-4 w-4" />
        Editar vários com IA
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
          className="max-w-4xl max-h-[85vh] overflow-y-auto"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>Editar procedimentos e consultas com IA</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Inclua vários itens no mesmo pedido, de qualquer uma das duas abas. Informe a forma de
            pagamento e, para consultas, o médico ou se vale para todos. Até 20 cadastros por
            pedido.
          </p>
          <Label htmlFor={id}>O que deseja alterar?</Label>
          <Textarea
            id={id}
            value={texto}
            maxLength={20000}
            rows={5}
            disabled={ocupado || publicando}
            onChange={(e) => {
              setTexto(e.target.value);
              setItens([]);
              setDuvidas([]);
              setErro("");
              setPrecisaRevisar(false);
            }}
            placeholder="Ex.: Altere a mamografia para R$ 150 no dinheiro e R$ 180 no Pix/cartão. Altere a consulta de cardiologia adulta do Dr. Sandro para R$ 130 no dinheiro, mantendo os demais valores."
          />
          <Button
            variant="outline"
            disabled={ocupado || publicando || !podeEditar || texto.trim().length < 10}
            onClick={() => void gerar()}
          >
            {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {itens.length ? "Gerar nova prévia" : "Preparar alterações"}
          </Button>
          {progresso && (
            <p role="status" className="text-sm">
              {progresso}
            </p>
          )}
          {duvidas.length > 0 && (
            <div role="alert" className="rounded-md border border-amber-500/40 p-3 text-sm">
              <p className="font-medium">Esclareça no pedido antes de continuar:</p>
              <ul className="list-disc pl-5">
                {duvidas.map((d, n) => (
                  <li key={n}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {itens.length > 0 && (
            <p className="text-sm">
              Confira o antes e depois de cada item. Somente os selecionados serão publicados para
              uso da Nina.
            </p>
          )}
          {itens.map((item) => (
            <section key={chave(item)} className="rounded-md border p-3 space-y-3">
              <label className="flex items-start gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={item.selecionado}
                  disabled={ocupado || publicando || !item.previa || item.publicado}
                  onChange={(e) =>
                    setItens((xs) =>
                      xs.map((i) =>
                        chave(i) === chave(item) ? { ...i, selecionado: e.target.checked } : i,
                      ),
                    )
                  }
                />
                <span>
                  {item.nome} ·{" "}
                  {item.tipo === "servico" ? "Procedimento/exame" : "Consultas/profissional"}
                  {item.publicado ? " · Publicado" : ""}
                </span>
              </label>
              <p className="text-sm text-muted-foreground">{item.pedido}</p>
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
