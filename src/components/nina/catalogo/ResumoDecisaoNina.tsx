import { CircleAlert } from "lucide-react";
import { resumoDecisaoNina, type ItemResumoDecisao } from "@/lib/nina/catalogo-resumo-decisao";

/**
 * Resumo do cartão da lista: a conduta da Nina e os campos que a decidem,
 * com o que falta preencher destacado. Só apresentação.
 */
export function ResumoDecisaoNina({
  item,
  tipo,
}: {
  item: ItemResumoDecisao;
  tipo: "servico" | "profissional";
}) {
  const [conduta, ...campos] = resumoDecisaoNina(item, tipo);
  const faltam = campos.filter((l) => !l.preenchido).map((l) => l.rotulo);
  return (
    <div className="space-y-1.5" data-testid="resumo-decisao-nina">
      <p>
        {conduta!.rotulo}: <span className="font-semibold text-foreground">{conduta!.valor}</span>
      </p>
      <dl className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
        {campos.map((l) => (
          <div
            key={l.campo}
            className={`flex min-w-0 gap-1 ${l.valor.length > 60 ? "sm:col-span-2" : ""}`}
          >
            <dt className="shrink-0">{l.rotulo}:</dt>
            <dd
              className={`min-w-0 break-words font-medium ${
                l.preenchido ? "text-foreground" : "text-amber-700 dark:text-amber-400"
              }`}
            >
              {l.valor}
            </dd>
          </div>
        ))}
      </dl>
      {faltam.length > 0 && (
        <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Falta preencher: {faltam.join(", ")}</span>
        </p>
      )}
    </div>
  );
}
