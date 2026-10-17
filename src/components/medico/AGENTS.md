# Tela do médico — decisões técnicas

- Anexos e fotos do paciente ficam na pasta privada `paciente-arquivos`, caminho `{clinica}/{paciente}/{tipo}/...`, com registro em `paciente_arquivos` — por quê: as regras de acesso do armazenamento usam a primeira pasta para saber a clínica.
- Exam requests share `PedidosExamePanel` between patient files and the medical queue, with authenticated server actions — why: emission, cancellation and release must follow the same rules in both screens.
