import { promptInstrucoes, renderizarInstrucoes } from "./lib/nina/instrucoes-runtime.server";
const valores = { "${nomeUnidade}": "POLICLINICA MENINO JESUS" };
const s1 = await promptInstrucoes("whatsapp", valores, "TEXTO-DO-CODIGO");
console.log("A) origem:", s1.origem, "versao:", s1.versao, "publicadoEm:", s1.publicadoEm,
  "| contem linha de teste:", s1.texto.includes("[HOMOLOGACAO FASE 7"),
  "| marcador cru:", /\$\{/.test(s1.texto));
const s2 = await promptInstrucoes("whatsapp", {}, "TEXTO-DO-CODIGO");
console.log("B) fallback com marcador nao resolvido -> origem:", s2.origem, "texto:", s2.texto.slice(0,20));
console.log("C) render allowlist:", renderizarInstrucoes("oi ${x}", {}));
