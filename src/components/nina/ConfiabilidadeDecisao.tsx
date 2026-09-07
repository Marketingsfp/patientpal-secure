/**
 * FASE 5 — seção "Confiabilidade" da auditoria de uma resposta da Nina.
 *
 * Uso interno da equipe. Nada aqui é mostrado ao paciente, e o que aparece é
 * só evidência observável registrada na hora da decisão.
 */
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import {
  confiabilidadeDaExecucao,
  type ConfiabilidadeDecisaoView,
} from "@/lib/nina/confianca.functions";

const COR_NIVEL: Record<string, string> = {
  Alta: "text-emerald-600 dark:text-emerald-400",
  Média: "text-amber-600 dark:text-amber-400",
  Baixa: "text-destructive",
};

export function ConfiabilidadeDecisao({
  clinicaId,
  execucaoId,
}: {
  clinicaId: string;
  execucaoId: string | null;
}) {
  const [dados, setDados] = useState<ConfiabilidadeDecisaoView | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!execucaoId) {
      setDados(null);
      return;
    }
    let ativo = true;
    setCarregando(true);
    confiabilidadeDaExecucao({ data: { clinicaId, execucaoId } })
      .then((r) => ativo && setDados(r))
      .catch(() => ativo && setDados(null))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [clinicaId, execucaoId]);

  if (!execucaoId) return null;

  return (
    <section className="space-y-2">
      <h4 className="font-medium">Confiabilidade</h4>
      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : !dados ? (
        <p className="text-muted-foreground">
          Esta resposta não tem avaliação de confiabilidade registrada.
        </p>
      ) : (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="font-medium">
            Confiança: {dados.score}% —{" "}
            <span className={COR_NIVEL[dados.nivel] ?? ""}>{dados.nivel}</span>
          </p>
          {dados.linhas.length === 0 ? (
            <p className="text-muted-foreground">Sem validações registradas.</p>
          ) : (
            <ul className="space-y-1">
              {dados.linhas.map((l, i) => (
                <li key={`${l.rotulo}-${i}`} className="flex items-start gap-2">
                  {l.ok ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  ) : (
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                  )}
                  <span>
                    {l.rotulo}
                    {l.detalhe ? (
                      <span className="text-muted-foreground"> — {l.detalhe}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {dados.bloqueadores.length > 0 && (
            <p className="text-destructive">
              Bloqueios: {dados.bloqueadores.join(", ")}
            </p>
          )}
          <p className="text-muted-foreground">
            Decisão: {dados.resultado}
            {dados.intencao ? ` · Intenção: ${dados.intencao}` : ""}
            {` · Ambiente: ${dados.ambiente === "homologacao" ? "Homologação" : "Atendimento"}`}
          </p>
          <p className="text-xs text-muted-foreground">
            Registrado em {new Date(dados.registradoEm).toLocaleString("pt-BR")}
          </p>
        </div>
      )}
    </section>
  );
}
