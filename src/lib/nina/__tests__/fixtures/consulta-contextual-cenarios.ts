/** Casos sintéticos: o modelo é simulado; testamos o contexto e a execução da decisão. */
type Cenario = {
  pergunta: string;
  oferta: string;
  ferramenta: string | null;
  argumentos: Record<string, unknown>;
};
const data = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const oferta = "Você confirma a consulta de oftalmologia especificamente com o Dr. João Hélio?\nSe sim, por favor, me confirme também se você tem preferência por algum dia ou turno.\nAssim já verifico as vagas certinho para você!";
const alternativas = "Você prefere escolher João Hélio ou Marina, ou quer que eu consulte quem tem a disponibilidade mais próxima?";
export const cenariosContextuais: Record<string, Cenario> = {
  contexto_hoje: { pergunta: "sim, pra hoje", oferta, ferramenta: "consultar_disponibilidade",
    argumentos: { medico_id: "joao-helio", data } },
  contexto_dia: { pergunta: "nesse dia consigo", oferta: "Podemos verificar hoje com João Hélio. Assim já te passo as opções.",
    ferramenta: "consultar_disponibilidade", argumentos: { medico_id: "joao-helio", data } },
  contexto_sem_dia: { pergunta: "com o joao helio", oferta: alternativas, ferramenta: "proxima_vaga",
    argumentos: { medico_id: "joao-helio" } },
  contexto_primeiro: { pergunta: "preciso de quem consiga me atender antes da viagem", oferta: alternativas,
    ferramenta: "consultar_primeiro_disponivel", argumentos: { tipo: "consulta", atendimento: "Oftalmologia" } },
  contexto_troca: { pergunta: "pensando melhor, veja com a outra", oferta, ferramenta: "proxima_vaga",
    argumentos: { medico_id: "marina" } },
  contexto_negativa: { pergunta: "deixa pra lá, vou pensar", oferta, ferramenta: null, argumentos: {} },
  contexto_ambiguo: { pergunta: "sim", oferta: alternativas, ferramenta: null, argumentos: {} },
};
