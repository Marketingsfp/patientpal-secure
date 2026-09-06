import { searchKnowledgeBase } from "../src/lib/nina/knowledge.server";
const MJ = "7570ddde-8c1c-4b55-ba72-cf12b2a6c940";
const r = await searchKnowledgeBase({ clinicaId: MJ, query: "ecocardiograma", canal: "interno" });
console.log("MJ(sem flag) source=", r.source, "type=", r.source_type, "status=", r.knowledge_status);
