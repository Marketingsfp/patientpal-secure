import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { DepartamentosView } from "./DepartamentosView";
import { podeGerenciarDepartamentos } from "@/lib/atendimento/departamentos";
import { DEPARTAMENTOS_HABILITADOS } from "@/lib/atendimento/departamentos-flag";
import {
  consultarDepartamentosZap,
  salvarDepartamentoZap,
  vincularDepartamentoZap,
} from "@/lib/atendimento/departamentos.functions";

export function Departamentos() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const clinicaId = clinicaAtual?.clinica_id;
  const consultar = useServerFn(consultarDepartamentosZap);
  const salvar = useServerFn(salvarDepartamentoZap);
  const vincular = useServerFn(vincularDepartamentoZap);
  const autorizado = DEPARTAMENTOS_HABILITADOS && podeGerenciarDepartamentos(clinicaAtual?.role);
  const query = useQuery({
    queryKey: ["oszap-departamentos", user?.id, clinicaId],
    queryFn: () => consultar({ data: { clinicaId: clinicaId! } }),
    enabled: autorizado && !!user && !!clinicaId,
    retry: false,
    refetchOnWindowFocus: true,
  });
  if (!autorizado)
    return (
      <p role="alert" className="p-4 text-sm">
        Departamentos indisponíveis ou sem permissão de acesso.
      </p>
    );
  if (!clinicaId) return <p className="p-4 text-sm">Selecione uma clínica.</p>;
  if (query.isPending)
    return (
      <p role="status" className="p-4 text-sm">
        Carregando departamentos…
      </p>
    );
  if (query.isError)
    return (
      <div role="alert" className="space-y-3 p-4">
        <p>{query.error.message}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  const atualizar = async () => {
    const resultado = await query.refetch();
    if (resultado.error)
      throw new Error(
        "A alteração foi salva, mas não foi possível atualizar a lista. Recarregue a tela.",
      );
  };
  return (
    <DepartamentosView
      dados={query.data}
      somenteLeitura={!query.data.podeEditar}
      salvarDepartamento={async (id, nome) => {
        await salvar({ data: { clinicaId, id, nome } });
        await atualizar();
      }}
      vincularAtendente={async (userId, departamentoId) => {
        await vincular({ data: { clinicaId, userId, departamentoId } });
        await atualizar();
      }}
    />
  );
}
