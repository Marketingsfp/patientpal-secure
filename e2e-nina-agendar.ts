import { executarFerramentaPaciente } from "@/lib/nina/paciente-tools.server";
const ctx: any = {
  clinicaId: "7570ddde-8c1c-4b55-ba72-cf12b2a6c940",
  telefone: "5599999990001",
  pacienteId: "1388e759-1f86-4149-8000-224f907bdc46",
  pacienteNome: "JEAN XAVIER FERREIRA PINHO",
  conversaId: null,
  origem: "homologacao",
  podeAgendar: true,
  teste: true,
  estado: null,
};
const args = JSON.stringify({
  medico_id: "Carlos Alberto Olivero Varillas",
  inicio: "2026-09-03T17:40:00-03:00",
  fim: "2026-09-03T17:50:00-03:00",
  procedimento: "CONSULTA CLINICA MEDICA",
});
const r1 = await executarFerramentaPaciente(ctx, "agendar", args);
console.log("PRIMEIRA:", JSON.stringify(r1, null, 2));
const r2 = await executarFerramentaPaciente(ctx, "agendar", args);
console.log("SEGUNDA (concorrencia):", JSON.stringify(r2, null, 2));
