import { useClinica } from "@/hooks/use-clinica";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogoNina } from "@/components/nina/catalogo/CatalogoNina";
import { HorarioFuncionamento } from "@/components/nina/catalogo/HorarioFuncionamento";

/**
 * Aba "Base de conhecimentos da Nina".
 *
 * Catálogo editorial recuperado, independente da fonte operacional da Maria.
 * Publicar aqui aprova o registro nesta base; não o ativa no atendimento.
 */
export function BaseConhecimento() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const podeEditar = ["admin", "gestor"].includes(String(clinicaAtual?.role ?? ""));

  return (
    <section className="space-y-4">
      <div
        className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
        role="note"
      >
        <h2 className="font-semibold">Base de conhecimento · sem vínculo com a Maria</h2>
        <p>
          Cadastre, revise e publique informações nesta base. Elas ainda não são usadas nas
          respostas, nas buscas ou nas decisões da Maria.
        </p>
      </div>
      <Tabs defaultValue="servicos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="servicos">Exames e procedimentos</TabsTrigger>
          <TabsTrigger value="profissionais">Consultas e profissionais</TabsTrigger>
          <TabsTrigger value="clinica">Informações da clínica</TabsTrigger>
        </TabsList>
        <TabsContent value="servicos">
          <CatalogoNina clinicaId={clinicaId} podeEditar={podeEditar} tipo="servico" />
        </TabsContent>
        <TabsContent value="profissionais">
          <CatalogoNina clinicaId={clinicaId} podeEditar={podeEditar} tipo="profissional" />
        </TabsContent>
        <TabsContent value="clinica">
          <p className="mb-4 text-sm text-muted-foreground">
            O horário de funcionamento abaixo é compartilhado com o atendimento atual. Nesta base,
            ele aparece somente para consulta, para preservar o isolamento da Maria.
          </p>
          <HorarioFuncionamento clinicaId={clinicaId} podeEditar={false} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
