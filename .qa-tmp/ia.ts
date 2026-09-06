import { organizarTextoComIA } from "../src/lib/nina/catalogo-ia.server";
const s = await organizarTextoComIA("servico", "Ultrassom de tireoide QA. Valor 180 no dinheiro e 220 no cartão em 2x. Jejum não é necessário. Não realizamos em gestantes no primeiro trimestre. Executante: Dra. Fictícia Alfa, terça 14h.");
console.log("SERVICO", JSON.stringify(s).slice(0, 900));
const p = await organizarTextoComIA("profissional", "Dr. Fictício Beta, dermatologista. Atende quinta-feira às 14h, quinzenalmente, e sábado (horário a confirmar). Consulta 130 dinheiro, 160 cartão. Aceita Convênio QA Saúde.");
console.log("PROFISSIONAL", JSON.stringify(p).slice(0, 900));
