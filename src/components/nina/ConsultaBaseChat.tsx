import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search, X, FileText, Plus } from "lucide-react";
import { consultarBaseChat } from "@/lib/atendimento/consulta-base-chat.functions";
import type { ItemBaseChat } from "@/lib/atendimento/consulta-base-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Resultado = {
  itens: ItemBaseChat[];
  total: number;
  pagina: number;
  consultadoEm: string;
  texto: string | null;
};
export function ConsultaBaseChat({
  clinicaId,
  conversaId,
  bloqueio,
  onInserir,
  onFechar,
}: {
  clinicaId: string;
  conversaId: string;
  bloqueio?: string | null;
  onInserir: (texto: string) => boolean;
  onFechar: () => void;
}) {
  const consultar = useServerFn(consultarBaseChat);
  const [termo, setTermo] = useState("");
  const [buscado, setBuscado] = useState("");
  const [resultado, setResultado] = useState<Resultado>();
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const sequencia = useRef(0);
  const insercao = useRef({ bloqueio, onInserir });
  insercao.current = { bloqueio, onInserir };
  useEffect(
    () => () => {
      sequencia.current++;
    },
    [],
  );
  async function buscar(pagina = 0, pesquisa = termo) {
    if (pesquisa.trim().length < 2) {
      setErro("Digite pelo menos dois caracteres.");
      return;
    }
    const seq = ++sequencia.current;
    setOcupado(true);
    setErro("");
    setResultado(undefined);
    setBuscado(pesquisa);
    try {
      const r = await consultar({ data: { clinicaId, conversaId, termo: pesquisa, pagina } });
      if (seq === sequencia.current) setResultado(r);
    } catch {
      if (seq === sequencia.current)
        setErro("Não foi possível consultar a fonte. Tente novamente.");
    } finally {
      if (seq === sequencia.current) setOcupado(false);
    }
  }
  async function inserir(i: ItemBaseChat) {
    if (ocupado || insercao.current.bloqueio) return;
    const seq = ++sequencia.current;
    setOcupado(true);
    setErro("");
    try {
      const r = await consultar({
        data: { clinicaId, conversaId, termo: "", pagina: 0, registro: { tipo: i.tipo, id: i.id } },
      });
      if (seq !== sequencia.current) return;
      if (insercao.current.bloqueio || !r.texto || !insercao.current.onInserir(r.texto)) {
        setErro("O rascunho não foi alterado. Confira a conversa e a permissão para responder.");
      }
    } catch {
      if (seq === sequencia.current)
        setErro("Não foi possível conferir este registro na fonte atual. Pesquise novamente.");
    } finally {
      if (seq === sequencia.current) setOcupado(false);
    }
  }
  return (
    <section
      aria-label="Consulta à base no chat"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onFechar();
        }
      }}
      className="shrink-0 border-b border-atd-border bg-atd-surface p-3 text-atd-ink"
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4" />
            Consultar base
          </h3>
          <p className="mt-1 text-xs text-atd-ink-soft">
            Procedimentos, preços, preparo e horários habituais do cadastro oficial.
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label="Fechar consulta à base"
          onClick={onFechar}
        >
          <X className="size-4" />
        </Button>
      </header>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar();
        }}
      >
        <Input
          autoFocus
          aria-label="Buscar no cadastro oficial"
          placeholder="Procedimento, médico ou especialidade…"
          value={termo}
          maxLength={120}
          onChange={(e) => setTermo(e.target.value)}
          className="h-8 min-w-0 bg-atd-surface"
        />
        <Button
          type="submit"
          size="sm"
          className="h-8"
          disabled={ocupado || termo.trim().length < 2}
        >
          <Search className="size-4" />
          Buscar
        </Button>
      </form>
      <p className="my-2 text-[11px] text-atd-ink-soft">
        Horários habituais não confirmam vagas. A consulta pode refletir até 1 minuto de cache do
        cadastro. Inserir apenas acrescenta ao rascunho; revise antes de enviar.
      </p>
      {bloqueio && (
        <p className="mb-2 text-xs text-atd-warn-ink">
          Consulta liberada para leitura. Inserção indisponível: {bloqueio}
        </p>
      )}
      {erro && (
        <p role="alert" className="mb-2 text-sm text-atd-danger-ink">
          {erro}
        </p>
      )}
      {ocupado && (
        <p role="status" className="py-2 text-xs">
          Consultando a fonte…
        </p>
      )}
      {resultado && (
        <div
          className="max-h-[38vh] space-y-2 overflow-y-auto overscroll-contain pr-1"
          aria-label="Resultados da consulta"
        >
          <p className="text-xs text-atd-ink-soft">
            {resultado.total} resultado(s) para “{buscado}” · consulta em{" "}
            {new Date(resultado.consultadoEm).toLocaleTimeString("pt-BR", {
              timeZone: "America/Sao_Paulo",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {!resultado.total && (
            <p className="py-2 text-sm">
              Nenhum registro disponível para essa pesquisa na fonte atual. Tente outro nome. Isso
              não confirma que o atendimento não existe.
            </p>
          )}
          {resultado.itens.map((i) => (
            <article key={`${i.tipo}:${i.id}`} className="rounded-lg border border-atd-border p-3">
              <h4 className="text-sm font-semibold">{i.titulo}</h4>
              {i.subtitulo && <p className="mt-1 text-xs">{i.subtitulo}</p>}
              <details className="my-2">
                <summary className="cursor-pointer text-xs font-medium">
                  Ver informações e fonte
                </summary>
                <dl className="mt-2 space-y-2">
                  {i.campos.map((c) => (
                    <div key={c.nome}>
                      <dt className="text-xs font-semibold">{c.nome}</dt>
                      <dd className="whitespace-pre-wrap break-words text-xs leading-relaxed text-atd-ink-soft">
                        {c.texto || "Não informado na fonte."}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 break-words text-[11px] text-atd-ink-soft">
                  Fonte: {i.fonte} · registro {i.id}
                </p>
              </details>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={ocupado || !!bloqueio}
                onClick={() => void inserir(i)}
              >
                <Plus className="size-3" />
                Inserir no rascunho
              </Button>
            </article>
          ))}
          {resultado.total > 20 && (
            <div className="flex items-center justify-between gap-2 py-1 text-xs">
              <Button
                size="sm"
                variant="outline"
                disabled={ocupado || resultado.pagina === 0}
                onClick={() => void buscar(resultado.pagina - 1, buscado)}
              >
                Anterior
              </Button>
              <span>
                Página {resultado.pagina + 1} de {Math.ceil(resultado.total / 20)}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={ocupado || (resultado.pagina + 1) * 20 >= resultado.total}
                onClick={() => void buscar(resultado.pagina + 1, buscado)}
              >
                Próxima
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
