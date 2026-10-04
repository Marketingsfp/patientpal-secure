import { useClinica } from "@/hooks/use-clinica";
import { BookOpen, Building2, FlaskConical, Stethoscope } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogoNina } from "@/components/nina/catalogo/CatalogoNina";
import { HorarioFuncionamento } from "@/components/nina/catalogo/HorarioFuncionamento";
import { FonteConsultaMaria } from "@/components/nina/catalogo/FonteConsultaMaria";

/**
 * Aba "Base de conhecimentos da Nina".
 *
 * Catálogo editorial e seleção manual da fonte usada pela Maria.
 */
export function BaseConhecimento() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const podeEditar = ["admin", "gestor"].includes(String(clinicaAtual?.role ?? ""));

  return (
    <section className="oszap-base" data-os-zap="true" aria-label="Base de conhecimento">
      <header className="oszap-base-header">
        <BookOpen className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Base de conhecimento</h2>
          <p className="text-sm text-muted-foreground">
            Exames, profissionais e informações da clínica.
          </p>
        </div>
      </header>
      <FonteConsultaMaria key={clinicaId} clinicaId={clinicaId} podeEditar={podeEditar} />
      <Tabs defaultValue="servicos" className="oszap-base-tabs">
        <TabsList className="oszap-base-tab-list" aria-label="Categorias da base">
          <TabsTrigger value="servicos">
            <FlaskConical aria-hidden="true" />
            Exames e procedimentos
          </TabsTrigger>
          <TabsTrigger value="profissionais">
            <Stethoscope aria-hidden="true" />
            Consultas e profissionais
          </TabsTrigger>
          <TabsTrigger value="clinica">
            <Building2 aria-hidden="true" />
            Informações da clínica
          </TabsTrigger>
        </TabsList>
        <TabsContent value="servicos">
          <CatalogoNina clinicaId={clinicaId} podeEditar={podeEditar} tipo="servico" />
        </TabsContent>
        <TabsContent value="profissionais">
          <CatalogoNina clinicaId={clinicaId} podeEditar={podeEditar} tipo="profissional" />
        </TabsContent>
        <TabsContent value="clinica" className="oszap-base-clinic">
          <p className="mb-4 text-sm text-muted-foreground">
            O horário de funcionamento é compartilhado pelas duas fontes e aparece aqui para consulta.
          </p>
          <HorarioFuncionamento clinicaId={clinicaId} podeEditar={false} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
