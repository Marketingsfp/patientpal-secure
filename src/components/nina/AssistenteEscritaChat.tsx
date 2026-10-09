import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { gerarSugestaoEscrita } from "@/lib/atendimento/assistente-escrita.functions";
import type { PedidoEscrita, ResultadoEscrita } from "@/lib/atendimento/assistente-escrita";

export function AssistenteEscritaChat({
  clinicaId,
  conversaId,
  rascunho,
  contextoVersao,
  bloqueio,
  onAplicar,
  onFechar,
}: {
  clinicaId: string;
  conversaId: string;
  rascunho: string;
  contextoVersao: string;
  bloqueio?: string | null;
  onAplicar: (texto: string, original: string) => boolean;
  onFechar: () => void;
}) {
  const gerar = useServerFn(gerarSugestaoEscrita);
  const [assunto, setAssunto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<
    ResultadoEscrita & { original: string; contexto: string; acao: PedidoEscrita["acao"] }
  >();
  const seq = useRef(0);
  const areaRolagem = useRef<HTMLDivElement>(null);
  const blocoResultado = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (resultado && areaRolagem.current && blocoResultado.current) {
      areaRolagem.current.scrollTop = blocoResultado.current.offsetTop;
    }
  }, [resultado]);
  const atual = useRef({ rascunho, bloqueio, contextoVersao, onAplicar });
  atual.current = { rascunho, bloqueio, contextoVersao, onAplicar };
  useEffect(
    () => () => {
      seq.current++;
    },
    [],
  );
  const desatualizado =
    !!resultado &&
    (resultado.original !== rascunho ||
      (resultado.acao === "sugerir" && resultado.contexto !== contextoVersao));
  async function solicitar(acao: PedidoEscrita["acao"]) {
    if (ocupado || bloqueio || (acao !== "sugerir" && !rascunho.trim())) return;
    const pedido = ++seq.current;
    const original = rascunho;
    const contexto = contextoVersao;
    setOcupado(true);
    setErro("");
    setResultado(undefined);
    try {
      const r = await gerar({ data: { clinicaId, conversaId, acao, rascunho: original, assunto } });
      if (pedido !== seq.current) return;
      if (atual.current.bloqueio) {
        setErro("A conversa está bloqueada para resposta. O rascunho foi preservado.");
        return;
      }
      setResultado({ ...r, original, contexto, acao });
    } catch {
      if (pedido === seq.current)
        setErro(
          "Não foi possível concluir a sugestão. Tente novamente em instantes. Seu rascunho foi preservado.",
        );
    } finally {
      if (pedido === seq.current) setOcupado(false);
    }
  }
  function aplicar() {
    if (!resultado || desatualizado || atual.current.bloqueio) return;
    if (!atual.current.onAplicar(resultado.texto, resultado.original)) {
      setErro("A conversa ou o rascunho mudou. Gere uma nova sugestão.");
      return;
    }
    onFechar();
  }
  return (
    <section
      aria-label="Assistente de escrita"
      className="flex max-h-[60vh] shrink-0 flex-col border-b border-atd-border bg-atd-surface p-3 text-atd-ink"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onFechar();
        }
      }}
    >
      <header className="mb-2 flex shrink-0 items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4" />
            Assistente de escrita
          </h3>
          <p className="mt-1 text-xs text-atd-ink-soft">
            Revise a sugestão e escolha se deseja usá-la no rascunho. O envio continua com você.
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label="Fechar assistente de escrita"
          onClick={onFechar}
        >
          <X className="size-4" />
        </Button>
      </header>
      <div ref={areaRolagem} className="relative min-h-0 overflow-y-auto overscroll-contain pr-1">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={ocupado || !!bloqueio || !rascunho.trim() || rascunho.length > 4000}
            onClick={() => void solicitar("corrigir")}
          >
            Corrigir português
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={ocupado || !!bloqueio || !rascunho.trim() || rascunho.length > 4000}
            onClick={() => void solicitar("melhorar")}
          >
            Melhorar clareza
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={ocupado || !!bloqueio || rascunho.length > 4000}
            onClick={() => void solicitar("sugerir")}
          >
            Sugerir resposta
          </Button>
        </div>
        <label className="mt-2 block text-xs text-atd-ink-soft">
          Assunto na base oficial (opcional, usado ao sugerir)
          <Input
            className="mt-1 h-8 bg-atd-surface"
            placeholder="Ex.: cardiologista, ultrassom abdominal…"
            value={assunto}
            maxLength={120}
            onChange={(e) => setAssunto(e.target.value)}
          />
        </label>
        {rascunho.length > 4000 && (
          <p className="mt-2 text-xs text-atd-warn-ink">
            Revise trechos de até 4.000 caracteres por vez.
          </p>
        )}
        {bloqueio && <p className="mt-2 text-xs text-atd-warn-ink">{bloqueio}</p>}
        {ocupado && (
          <p role="status" className="mt-2 text-xs">
            Preparando sugestão… Você pode continuar editando o rascunho.
          </p>
        )}
        {erro && (
          <p role="alert" className="mt-2 text-sm text-atd-danger-ink">
            {erro}
          </p>
        )}
        {resultado && (
          <div ref={blocoResultado} className="mt-3 space-y-2">
            <p className="text-xs font-semibold">Sugestão para revisão</p>
            <p className="whitespace-pre-wrap break-words rounded-lg border border-atd-border p-3 text-sm leading-relaxed">
              {resultado.texto}
            </p>
            <details className="text-xs">
              <summary className="cursor-pointer">Comparar com o rascunho original</summary>
              <p className="mt-2 whitespace-pre-wrap break-words">
                {resultado.original || "Rascunho vazio."}
              </p>
            </details>
            {resultado.acao === "sugerir" ? (
              <details className="text-xs">
                <summary className="cursor-pointer">
                  Conferir fontes ({resultado.fontes.length})
                </summary>
                <p className="my-2 text-atd-ink-soft">
                  Histórico recente usado como contexto. Horários habituais não confirmam vagas.
                  Cadastro pode ter até 1 minuto de cache.
                </p>
                {!resultado.fontes.length && (
                  <p>Nenhum registro oficial citado. Confira os fatos antes de enviar.</p>
                )}
                {resultado.fontes.map((f) => (
                  <div
                    key={`${f.tipo}:${f.id}`}
                    className="my-2 rounded border border-atd-border p-2"
                  >
                    <strong>{f.titulo}</strong>
                    <p>{f.fonte}</p>
                    {f.campos
                      .filter((c) => c.texto)
                      .map((c) => (
                        <p key={c.nome} className="mt-1 whitespace-pre-wrap break-words">
                          {c.nome}: {c.texto}
                        </p>
                      ))}
                  </div>
                ))}
                {resultado.consultadoEm && (
                  <p className="mt-1">
                    Consulta:{" "}
                    {new Date(resultado.consultadoEm).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                  </p>
                )}
              </details>
            ) : (
              <p className="text-xs text-atd-ink-soft">
                Revisão de escrita; os fatos do rascunho não foram verificados na base.
              </p>
            )}
            <p className="text-[11px] text-atd-ink-soft">
              Luna · raciocínio baixo · {(resultado.duracaoMs / 1000).toFixed(1)} s nesta
              solicitação
            </p>
            {desatualizado && (
              <p role="alert" className="text-xs text-atd-warn-ink">
                O rascunho ou o histórico mudou. Gere uma nova sugestão para preservar as
                alterações.
              </p>
            )}
          </div>
        )}
      </div>
      {resultado && (
        <div className="mt-2 flex shrink-0 flex-wrap gap-2 border-t border-atd-border pt-2">
          <Button size="sm" disabled={desatualizado || !!bloqueio || ocupado} onClick={aplicar}>
            Usar no rascunho
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setResultado(undefined)}>
            Descartar sugestão
          </Button>
        </div>
      )}
    </section>
  );
}
