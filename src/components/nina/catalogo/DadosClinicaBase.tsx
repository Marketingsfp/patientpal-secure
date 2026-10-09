import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { informacoesPublicasBase } from "@/lib/nina/catalogo.functions";

export function DadosClinicaBase({ clinicaId }: { clinicaId?: string }) {
  const ler = useServerFn(informacoesPublicasBase);
  const { data, isLoading, error } = useQuery({
    queryKey: ["nina-dados-clinica-base", clinicaId],
    enabled: !!clinicaId,
    queryFn: () => ler({ data: { clinicaId: clinicaId! } }),
  });
  if (isLoading) return <p>Carregando dados da clínica…</p>;
  if (error)
    return <p role="alert">Não foi possível consultar os dados da clínica: {error.message}</p>;
  if (!data) return null;
  const c = data.clinica;
  return (
    <section
      className="mb-6 space-y-3 rounded-lg border p-4"
      aria-label="Dados da clínica no Clínica OS"
    >
      <h3 className="font-semibold">Dados da clínica</h3>
      <p className="text-sm text-muted-foreground">
        Informações compartilhadas com o cadastro do Clínica OS. Atualizações são consultadas ao
        abrir esta seção.
      </p>
      <dl className="grid gap-2 text-sm">
        {Object.entries({
          Nome: c?.nome,
          Endereço: [c?.endereco, c?.cidade, c?.estado, c?.cep].filter(Boolean).join(" · "),
          Telefone: c?.telefone,
          Email: c?.email,
        }).map(([nome, valor]) => (
          <div key={nome}>
            <dt className="font-medium">{nome}</dt>
            <dd>{String(valor || "Não informado")}</dd>
          </div>
        ))}
      </dl>
      <p>
        <strong>Unidades cadastradas: </strong>
        {data.unidades.map((u) => u.nome).join(" · ") || "Nenhuma informada"}
      </p>
      <p>
        <strong>Convênios cadastrados: </strong>
        {data.convenios.map((c) => c.nome).join(" · ") || "Nenhum informado"}
      </p>
      <p className="text-sm text-muted-foreground">
        O cadastro de um convênio não comprova cobertura de todos os profissionais ou procedimentos.
        A aceitação depende do atendimento.
      </p>
    </section>
  );
}
