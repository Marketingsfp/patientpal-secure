import { promptInstrucoes } from "./lib/nina/instrucoes-runtime.server";
const valores = {
  "${nomeUnidade}": "POLICLINICA MENINO JESUS",
  "${blocoClinica}": "(clinica)",
  "${blocoDataHoraAgora()}": "(agora)",
  "${contextoRemetente}": "(remetente)",
  "${blocoIdentidade}": "(identidade)",
  "${blocoFoco}": "(foco)",
  '${espsCadastradas.join(", ") || "(nenhuma cadastrada)"}': "(esps)",
  '${medicos || "(nenhum)"}': "(medicos)",
  '${procs || "(nenhum)"}': "(procs)",
};
const s = await promptInstrucoes("whatsapp", valores, "TEXTO-DO-CODIGO");
console.log("origem:", s.origem, "versao:", s.versao, "publicadoEm:", s.publicadoEm,
  "| linha de teste presente:", s.texto.includes("[HOMOLOGACAO FASE 7"),
  "| marcador cru:", /\$\{/.test(s.texto), "| tam:", s.texto.length);
