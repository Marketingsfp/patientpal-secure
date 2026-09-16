import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/coach/prova/$nome")({
  component: ProvaEmBreve,
});

/**
 * Prova e certificado entram na Etapa 3. A rota existe desde já para o
 * painel da gestora apontar a prova de cada atendente.
 */
function ProvaEmBreve() {
  const { nome } = Route.useParams();
  return (
    <div className="p-6">
      <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-8 text-center shadow-sm">
        <ClipboardCheck className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-3 text-xl font-semibold tracking-tight">
          Prova de {decodeURIComponent(nome)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A geração da prova e o certificado entram na próxima etapa da migração do Coach.
        </p>
        <Link
          to="/app/coach"
          className="mt-6 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Voltar ao Coach
        </Link>
      </div>
    </div>
  );
}
