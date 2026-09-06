import { searchKnowledgeBase } from "../src/lib/nina/knowledge.server";
const C = "00000000-0000-4000-8000-0000000000a1";
const r = await searchKnowledgeBase({ clinicaId: C, query: "eletrocardiograma qa", canal: "interno" });
console.log("PRECO_ATUAL=", r.price, "| notas=", r.notes.join(" ~ "));
