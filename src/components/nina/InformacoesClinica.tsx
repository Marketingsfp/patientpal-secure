import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { HorarioFuncionamento } from "@/components/nina/catalogo/HorarioFuncionamento";

/**
 * Aba "Informações da clínica" (Nina).
 *
 * Só guarda o horário oficial de funcionamento. Consultas, médicos, horários de atendimento e
 * exames/procedimentos a Nina lê direto do cadastro do sistema (Clínica médica > Cadastros);
 * quem corrige é a equipe, lá na origem.
 */
export function InformacoesClinica() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const podeEscrever = usePodeEscrever("nina-informacoes-clinica");
  const podeEditar = podeEscrever && ["admin", "gestor"].includes(String(clinicaAtual?.role ?? ""));

  return <HorarioFuncionamento clinicaId={clinicaId} podeEditar={podeEditar} />;
}
