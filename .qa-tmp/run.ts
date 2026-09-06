import { searchKnowledgeBase } from "../src/lib/nina/knowledge.server";
const C = "00000000-0000-4000-8000-0000000000a1";
const perguntas = [
  ["preço exame", "quanto custa o ultrassom qa abdome"],
  ["preparo", "preciso de jejum para o ultrassom qa abdome"],
  ["consulta dermatologia", "quero uma consulta de dermatologia"],
  ["profissional por nome", "atendimento com Beta"],
  ["rascunho", "tomografia qa rascunho"],
  ["arquivado", "raio x qa arquivado"],
  ["revisao pendente", "eletrocardiograma qa"],
  ["inexistente", "ressonancia magnetica de ombro"],
];
const out: any = {};
for (const [k, q] of perguntas) {
  const r = await searchKnowledgeBase({ clinicaId: C, query: q, canal: "interno" });
  out[k] = {
    status: r.knowledge_status, source: r.source, source_type: r.source_type,
    procedure: r.procedure, price: r.price, doctors: r.doctors, units: r.units,
    days: r.days, notes: r.notes, base_version: r.base_version,
    itens: r.records.map((x: any) => x.procedimento + " :: " + (x.preco_dinheiro ?? "-") + "/" + (x.preco_cartao ?? "-")),
    bruto: JSON.stringify(r).length,
    vazamento: /SEGREDO INTERNO|NAO DEVE APARECER|EM REVISAO|Não deve aparecer|VENCIDO/i.test(JSON.stringify(r)),
  };
}
console.log(JSON.stringify(out, null, 1));
