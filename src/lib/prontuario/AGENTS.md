# Prontuário — decisões técnicas

- A evolução do editor rico da fila do médico é gravada em HTML no mesmo `prontuarios.historia_doenca`; telas de texto puro usam `textoDoProntuario` e telas ricas `htmlSeguro` (`html.ts`) — por quê: as duas formas convivem sem coluna nova e sem quebrar o histórico antigo.
