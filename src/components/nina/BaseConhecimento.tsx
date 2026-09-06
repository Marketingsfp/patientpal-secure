import { useClinica } from "@/hooks/use-clinica";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogoNina } from "@/components/nina/catalogo/CatalogoNina";

/**
 * Aba "Base de conhecimentos da Nina".
 *
 * FASE 7: o modo planilha foi removido. O catálogo estruturado é a única base
 * de conhecimento administrativo da Nina. O cadastro é manual ou com IA, os
 * dois caminhos alimentam os mesmos registros, e só o que está PUBLICADO é
 * usado no atendimento.
 */
export function BaseConhecimento() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const podeEditar = ["admin", "gestor"].includes(String(clinicaAtual?.role ?? ""));

  return (
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
        <HorarioFuncionamento clinicaId={clinicaId} podeEditar={podeEditar} />
      </TabsContent>
    </Tabs>
  );
}
