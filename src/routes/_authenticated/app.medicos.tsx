// Rota unificada em /app/equipe. Este arquivo passou a ser apenas um redirect
// para não quebrar bookmarks antigos, links do universal-search e atalhos.
// Mantém validateSearch para preservar `?new=1` e `?edit=<id>` (usados por
// atalhos legados), traduzindo para os parâmetros equivalentes da equipe.
import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/medicos")({
  component: MedicosRedirect,
  head: () => ({ meta: [{ title: "Médicos — ClinicaOS" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    new: search.new === "1" || search.new === 1 ? "1" : undefined,
    edit: typeof search.edit === "string" && search.edit.length > 0 ? search.edit : undefined,
    abrir: typeof search.abrir === "string" && search.abrir.length > 0 ? search.abrir : undefined,
  }),
});

function MedicosRedirect() {
  const { new: nv, edit, abrir } = Route.useSearch();
  const search: { new?: "1"; abrir?: string } = {};
  if (nv === "1") search.new = "1";
  const target = edit ?? abrir;
  if (target) search.abrir = target;
  return <Navigate to="/app/equipe" search={search} replace />;
}
