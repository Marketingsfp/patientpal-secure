import type { ReactNode } from "react";
import { Building2 } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";

/**
 * Telas que GRAVAM cadastro de uma unidade (serviços, valores) só abrem com
 * uma unidade escolhida de verdade. No modo "todas as clínicas", ou quando a
 * unidade atual é só o palpite da primeira da lista, a gravação cairia numa
 * unidade que o usuário não está vendo — foi assim que valores pensados para
 * a São Francisco foram parar na Menino Jesus (09/10/2026).
 *
 * O conteúdo é remontado ao trocar de unidade, para que um formulário aberto
 * não salve com dados da unidade anterior.
 */
export function ExigeUnidadeEscolhida({
  oQue,
  children,
}: {
  /** Ex.: "editar serviços". */
  oQue: string;
  children: ReactNode;
}) {
  const { clinicaAtual, modoTodas, clinicaFixada, loading } = useClinica();
  if (loading) return null;
  if (!clinicaAtual || modoTodas || !clinicaFixada) {
    return (
      <div className="m-6 flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
        <Building2 className="h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">Escolha a unidade para {oQue}.</p>
          <p className="mt-1">
            Cada unidade tem a própria tabela de serviços e valores. Selecione a unidade no seletor
            do topo da tela (não use "Todas as clínicas").
          </p>
        </div>
      </div>
    );
  }
  return (
    <div key={clinicaAtual.clinica_id} className="contents">
      {children}
    </div>
  );
}

/** Faixa que deixa explícito em qual unidade as alterações vão valer. */
export function FaixaUnidadeAtual() {
  const { clinicaAtual } = useClinica();
  if (!clinicaAtual) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span>
        Unidade: <strong>{clinicaAtual.clinica.nome}</strong> — alterações aqui valem só para esta
        unidade.
      </span>
    </div>
  );
}
