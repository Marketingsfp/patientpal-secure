/**
 * FASE 2 — painel de evidências de uma resposta reportada.
 *
 * Mostra apenas o que foi registrado na ocasião. Nada é reexecutado e
 * nenhuma lacuna é preenchida por IA: o que falta aparece como falta.
 */
import { useEffect, useState } from "react";
import { lerEvidenciasExecucaoNina } from "@/lib/nina/evidencias.functions";
import {
  ROTULO_ETAPA,
  ROTULO_FONTE,
  ROTULO_LACUNA,
  type Etapa,
} from "@/lib/nina/evidencias";

type Resultado = Awaited<ReturnType<typeof lerEvidenciasExecucaoNina>>;

export function EvidenciasExecucao({
  clinicaId,
  execucaoId,
}: {
  clinicaId: string;
  execucaoId: string | null;
}) {
  const [dados, setDados] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!execucaoId) {
      setDados(null);
      return;
    }
    let ativo = true;
    setCarregando(true);
    setErro(null);
    lerEvidenciasExecucaoNina({ data: { clinicaId, execucaoId } })
      .then((r) => ativo && setDados(r))
      .catch((e: unknown) => ativo && setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [clinicaId, execucaoId]);

  if (!execucaoId) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta resposta não tem registro técnico vinculado — as evidências não podem ser comprovadas.
      </p>
    );
  }
  if (carregando) return <p className="text-sm text-muted-foreground">Carregando evidências…</p>;
  if (erro) return <p className="text-sm text-destructive">{erro}</p>;
  if (!dados) return null;
  if (!dados.disponivel)
    return <p className="text-sm text-muted-foreground">{dados.motivo}</p>;

  const ex = dados.execucao as Record<string, unknown>;

  return (
    <div className="space-y-4 text-sm">
      <section className="space-y-1">
        <h4 className="font-medium">Pergunta do paciente (mensagens vinculadas)</h4>
        {dados.pergunta ? (
          <ol className="space-y-1">
            {dados.pergunta.fragmentos.map((f) => (
              <li key={f.id} className="rounded-md border border-border bg-muted/40 p-2">
                <span className="text-xs text-muted-foreground">
                  {f.em ? new Date(f.em).toLocaleString("pt-BR") : "sem data"}
                </span>
                <p className="whitespace-pre-wrap">{f.texto}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground">
            Não há vínculo confiável com as mensagens de entrada desta resposta.
          </p>
        )}
      </section>

      <section className="space-y-1">
        <h4 className="font-medium">Execução</h4>
        <p className="text-muted-foreground">
          Modelo {String(ex["model"] ?? "—")} · raciocínio {String(ex["thinking_level"] ?? "—")} ·{" "}
          {String(ex["latency_ms"] ?? "—")} ms · base {String(ex["knowledge_status"] ?? "—")} ·{" "}
          {ex["success"] ? "sucesso" : `falha (${String(ex["error_category"] ?? "—")})`}
        </p>
      </section>

      <section className="space-y-2">
        <h4 className="font-medium">Etapas registradas</h4>
        {dados.etapas.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma etapa foi registrada nesta execução.</p>
        ) : (
          dados.etapas.map((e: Etapa, i: number) => (
            <details key={`${e.tipo}-${i}`} className="rounded-md border border-border p-2">
              <summary className="cursor-pointer">
                <span className="font-medium">{ROTULO_ETAPA[e.tipo] ?? e.tipo}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  · {ROTULO_FONTE[e.fonte] ?? e.fonte} · {e.titulo}
                </span>
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">
                {JSON.stringify(e.dados, null, 2)}
              </pre>
              {e.codigo ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {e.codigo.arquivo} · {e.codigo.funcao}
                  {e.codigo.regra ? ` · ${e.codigo.regra}` : ""}
                </p>
              ) : null}
            </details>
          ))
        )}
      </section>

      {dados.lacunas.length > 0 ? (
        <section className="space-y-1">
          <h4 className="font-medium">Não comprovado nesta execução</h4>
          <ul className="list-disc pl-5 text-muted-foreground">
            {dados.lacunas.map((l: string) => (
              <li key={l}>{ROTULO_LACUNA[l] ?? l}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Evidência histórica preservada. Alterações posteriores no catálogo não mudam o que está
        acima; para comparar com o cadastro de hoje, abra o catálogo (“Estado atual”).
      </p>
    </div>
  );
}
