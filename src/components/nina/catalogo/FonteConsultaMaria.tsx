import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Building2, Loader2, PlugZap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { aplicarFonteConsulta, carregarFonteConsulta } from "@/lib/nina/fonte-consulta.functions";
import { ROTULOS_FONTE, type FonteConsulta, type SelecaoFonte } from "@/lib/nina/fonte-consulta";

export function FonteConsultaMaria({
  clinicaId,
  podeEditar,
}: {
  clinicaId?: string;
  podeEditar: boolean;
}) {
  const carregar = useServerFn(carregarFonteConsulta);
  const aplicar = useServerFn(aplicarFonteConsulta);
  const [atual, setAtual] = useState<SelecaoFonte | null>(null);
  const [escolha, setEscolha] = useState<FonteConsulta>("clinica_os");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [atualizacao, setAtualizacao] = useState(0);
  useEffect(() => {
    let ativo = true;
    setAtual(null);
    setErro(null);
    setCarregando(true);
    if (!clinicaId) {
      setCarregando(false);
      return;
    }
    carregar({ data: { clinicaId } })
      .then((r) => {
        if (ativo) {
          setAtual(r);
          setEscolha(r.fonte);
        }
      })
      .catch((e) => {
        if (ativo) setErro(e instanceof Error ? e.message : "Não foi possível carregar a fonte.");
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [clinicaId, carregar, atualizacao]);

  async function salvar() {
    if (!clinicaId || !atual || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await aplicar({
        data: { clinicaId, fonte: escolha, revisaoEsperada: atual.revisao },
      });
      setAtual(r);
      setEscolha(r.fonte);
      if (r.aviso) toast.warning(r.aviso);
      else toast.success(`Fonte aplicada: ${ROTULOS_FONTE[r.fonte]}.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível aplicar a fonte.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section
      className="rounded-xl border bg-card p-4"
      aria-labelledby="fonte-maria-titulo"
      aria-busy={carregando || salvando}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="fonte-maria-titulo" className="flex items-center gap-2 font-semibold">
            <PlugZap className="h-4 w-4 text-primary" />
            Fonte de consulta da Maria
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha onde a Maria busca informações de consultas e exames nesta clínica.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm" role="status">
            {carregando
              ? "Carregando fonte…"
              : atual
                ? `Em uso: ${ROTULOS_FONTE[atual.fonte]}`
                : "Fonte não confirmada"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Atualizar fonte de consulta"
            disabled={carregando || salvando}
            onClick={() => setAtualizacao((v) => v + 1)}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <fieldset
        disabled={!podeEditar || !atual || carregando || salvando}
        className="mt-3 grid gap-2 sm:grid-cols-2"
      >
        <legend className="sr-only">Fonte desejada</legend>
        {(["clinica_os", "base_conhecimento"] as const).map((fonte) => {
          const Icone = fonte === "clinica_os" ? Building2 : BookOpen;
          return (
            <label
              key={fonte}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${escolha === fonte && atual ? "border-primary bg-primary/10" : "border-border"}`}
            >
              <input
                type="radio"
                name={`fonte-maria-${clinicaId}`}
                value={fonte}
                checked={escolha === fonte && !!atual}
                onChange={() => setEscolha(fonte)}
                className="mt-1 accent-primary"
              />
              <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold">{ROTULOS_FONTE[fonte]}</span>
                <span className="text-xs text-muted-foreground">
                  {fonte === "clinica_os"
                    ? "Consulta os cadastros do sistema."
                    : "Consulta somente registros publicados e variações revisadas."}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-xs text-muted-foreground">
          Vale para as próximas respostas, no atendimento real e na homologação. Uma fonte por vez.
          A troca não sincroniza dados; vagas continuam na agenda do Clínica OS.
        </p>
        {podeEditar && (
          <Button
            size="sm"
            disabled={!atual || carregando || salvando || escolha === atual.fonte}
            onClick={salvar}
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {salvando ? "Aplicando…" : "Aplicar fonte"}
          </Button>
        )}
      </div>
      {!podeEditar && (
        <p className="mt-2 text-xs text-muted-foreground">
          A troca está disponível para administradores e gestores.
        </p>
      )}
      {atual?.fonte === "base_conhecimento" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Esta base está em uso. Publicar alterações nos cadastros abaixo atualiza as informações
          consultadas nas próximas respostas.
        </p>
      )}
      {erro && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {erro}
        </p>
      )}
    </section>
  );
}
