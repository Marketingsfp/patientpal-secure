import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AnaliseDashboard = {
  texto: string;
  modelo: string;
  geradoEm: string;
};

/** Títulos "### " e itens "- " viram elementos; nada de HTML vindo da IA. */
function TextoAnalise({ texto }: { texto: string }) {
  const blocos: Array<{ tipo: "titulo" | "item" | "paragrafo"; texto: string }> = texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) =>
      l.startsWith("#")
        ? { tipo: "titulo", texto: l.replace(/^#+\s*/, "") }
        : /^[-*•]\s+/.test(l)
          ? { tipo: "item", texto: l.replace(/^[-*•]\s+/, "") }
          : { tipo: "paragrafo", texto: l },
    );
  const limpar = (t: string) => t.replace(/\*\*/g, "");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {blocos.map((b, i) =>
        b.tipo === "titulo" ? (
          <h3 key={i} className="pt-2 text-sm font-semibold first:pt-0">
            {limpar(b.texto)}
          </h3>
        ) : b.tipo === "item" ? (
          <p key={i} className="flex gap-2 pl-1">
            <span aria-hidden="true">•</span>
            <span>{limpar(b.texto)}</span>
          </p>
        ) : (
          <p key={i}>{limpar(b.texto)}</p>
        ),
      )}
    </div>
  );
}

/**
 * Análise do período por IA (16/10/2026). Só roda no clique; a tela recria o
 * componente quando uma nova consulta chega, e a análise antiga some.
 */
export function AnaliseDashboardIA({ analisar }: { analisar: () => Promise<AnaliseDashboard> }) {
  const [estado, setEstado] = useState<"livre" | "analisando">("livre");
  const [analise, setAnalise] = useState<AnaliseDashboard>();
  const [erro, setErro] = useState<string>();
  async function gerar() {
    if (estado === "analisando") return;
    setEstado("analisando");
    setErro(undefined);
    try {
      setAnalise(await analisar());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível analisar agora.");
    } finally {
      setEstado("livre");
    }
  }
  return (
    <section
      aria-label="Análise com IA"
      className="oszap-dash-section space-y-3"
      aria-busy={estado === "analisando"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Análise com IA</h2>
          <p className="text-xs text-atd-ink-soft">
            Resumo em texto de todos os números deste período. Usa só os dados do dashboard, sem
            informações de pacientes.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={estado === "analisando"}
          onClick={() => void gerar()}
        >
          {estado === "analisando" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {estado === "analisando"
            ? "Analisando…"
            : analise
              ? "Analisar de novo"
              : "Analisar com IA"}
        </Button>
      </div>
      {erro && (
        <p role="alert" className="text-sm text-atd-danger-ink">
          {erro}
        </p>
      )}
      {analise && (
        <div className="space-y-2">
          <TextoAnalise texto={analise.texto} />
          <p className="text-xs text-atd-ink-soft">
            Texto gerado por IA ({analise.modelo}) em{" "}
            {new Date(analise.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
            Confira nos números acima antes de usar.
          </p>
        </div>
      )}
    </section>
  );
}
