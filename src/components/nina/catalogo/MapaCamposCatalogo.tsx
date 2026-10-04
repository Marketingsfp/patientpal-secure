import { camposDoCatalogo } from "@/lib/nina/catalogo-mapa-campos";

export function MapaCamposCatalogo({ tipo }: { tipo: "servico" | "profissional" }) {
  return (
    <details className="mb-3 rounded-lg border bg-muted/30 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Mapa de consulta · como as informações estão organizadas
      </summary>
      <p className="my-3 text-xs text-muted-foreground">
        Este guia indica onde a IA encontra cada informação no retorno de um cadastro. Campo vazio
        significa informação não cadastrada. Horários habituais não representam vagas disponíveis.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">
            Mapa dos campos de{" "}
            {tipo === "servico" ? "exames e procedimentos" : "consultas e profissionais"}
          </caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="p-2">
                Informação
              </th>
              <th scope="col" className="p-2">
                Nome no guia
              </th>
              <th scope="col" className="p-2">
                Caminho no registro
              </th>
            </tr>
          </thead>
          <tbody>
            {camposDoCatalogo(tipo).map((c) => (
              <tr key={c.campo} className="border-b last:border-0">
                <th scope="row" className="p-2 font-medium">
                  {c.rotulo}
                  <span className="mt-1 block font-normal text-muted-foreground">
                    {c.orientacao}
                  </span>
                </th>
                <td className="p-2 align-top">
                  <code>{c.campo}</code>
                </td>
                <td className="p-2 align-top">
                  <code>{c.caminho}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Caminhos relativos a cada registro, sem cruzar dados de outros atendimentos. A Maria usa
        estes registros publicados quando a Base de conhecimento está selecionada como fonte.
      </p>
    </details>
  );
}
