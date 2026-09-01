import { encaminharParaHumano } from "../lib/atendimento/handoff.server";
const r = await encaminharParaHumano({
  clinicaId: "7570ddde-8c1c-4b55-ba72-cf12b2a6c940",
  conversaId: "0a000000-0000-4000-8000-000000000a01",
  motivo: "[QA-HEALTHHUB] paciente pediu atendente humano",
  resumo: "Teste automatizado de atribuição a atendente online",
  urgencia: "normal",
  solicitadoPor: "IA",
});
console.log(JSON.stringify(r, null, 2));
