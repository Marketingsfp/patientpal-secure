import { executarFerramentaPaciente } from "../lib/nina/paciente-tools.server";
const ctx = { clinicaId: "7570ddde-8c1c-4b55-ba72-cf12b2a6c940", telefone: null, pacienteId: null, pacienteNome: null, conversaId: null, origem: "whatsapp" as const };
console.log(JSON.stringify(await executarFerramentaPaciente(ctx, "listar_especialidades", {})).slice(0,400));
console.log(JSON.stringify(await executarFerramentaPaciente(ctx, "dados_da_clinica", {})).slice(0,300));
console.log(JSON.stringify(await executarFerramentaPaciente(ctx, "consultar_disponibilidade", { dias: 7 })).slice(0,600));
console.log(JSON.stringify(await executarFerramentaPaciente(ctx, "meus_agendamentos", {})));
