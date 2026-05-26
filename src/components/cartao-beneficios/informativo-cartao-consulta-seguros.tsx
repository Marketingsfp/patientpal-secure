export function InformativoCartaoConsultaSeguros() {
  return (
    <div className="informativo-print bg-white text-black mx-auto" style={{ width: "210mm", minHeight: "297mm", padding: "12mm 14mm", fontFamily: "Arial, sans-serif", fontSize: "10.5pt", lineHeight: 1.35 }}>
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body * { visibility: hidden !important; }
          #convenio-informativo-print, #convenio-informativo-print * { visibility: visible !important; }
          #convenio-informativo-print { position: absolute; left: 0; top: 0; width: 100%; }
          .informativo-print { box-shadow: none !important; width: 100% !important; padding: 0 !important; }
          .informativo-print .page-break { page-break-before: always; }
        }
        .informativo-print h2 { font-size: 12pt; font-weight: 700; margin: 8px 0 4px; }
        .informativo-print table { width: 100%; border-collapse: collapse; margin: 6px 0; }
        .informativo-print th, .informativo-print td { border: 1px solid #000; padding: 4px 6px; text-align: center; }
        .informativo-print ul { margin: 4px 0 8px 18px; padding: 0; }
        .informativo-print li { margin-bottom: 3px; }
        .informativo-print .header { display:flex; align-items:center; justify-content:space-between; gap:12px; border-bottom: 2px solid #000; padding-bottom: 6px; }
        .informativo-print .brand { font-weight: 700; font-size: 13pt; color: #1e4d8c; }
        .informativo-print .aviso { text-align:center; font-weight:700; font-style:italic; margin: 6px 0 8px; color:#b00020; }
        .informativo-print .footer { margin-top: 10px; border-top: 1px dashed #555; padding-top: 6px; font-size: 9pt; }
      `}</style>

      <div className="header">
        <div className="brand">POLICARDMED</div>
        <div style={{ textAlign: "center", fontSize: "9pt" }}>
          WhatsApp: (21) 98464-2531 · www.policardmed.com
        </div>
        <div className="brand">MENINO JESUS</div>
      </div>

      <div className="aviso">*NÃO POSSUI EMERGÊNCIA, SERVIÇOS DE INTERNAÇÃO*</div>

      <table>
        <thead>
          <tr><th colSpan={3} style={{ background: "#e6eef9" }}>CARTÃO CONSULTA + SEGUROS</th></tr>
          <tr>
            <th style={{ width: "35%" }}>MODALIDADE</th>
            <th style={{ width: "30%" }}>VALOR</th>
            <th rowSpan={7} style={{ width: "35%", verticalAlign: "middle" }}>
              <div style={{ fontWeight: 700 }}>TAXA DE ADESÃO ÚNICA</div>
              <div style={{ fontSize: "16pt", fontWeight: 700, marginTop: 4 }}>R$ 30,00</div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr><td>1 PESSOA</td><td>R$ 120,00</td></tr>
          <tr><td>2 PESSOAS</td><td>R$ 175,00</td></tr>
          <tr><td>3 PESSOAS</td><td>R$ 210,00</td></tr>
          <tr><td>4 PESSOAS</td><td>R$ 245,00</td></tr>
          <tr><td>5 PESSOAS</td><td>R$ 280,00</td></tr>
          <tr><td>6 PESSOAS</td><td>R$ 295,00</td></tr>
        </tbody>
      </table>

      <ul>
        <li>O Contrato é válido por 12 meses, prorrogado automaticamente após o vencimento;</li>
        <li>ASSOCIADO TITULAR somente poderá incluir cônjuges e filhos;</li>
        <li>O valor do cartão poderá ser pago à vista para utilização de um período anual, ou parcelado em 12 vezes no carnê ou boleto bancário (com acréscimo bancário de R$ 3,50 em cada boleto), sendo exclusivo, o pagamento no carnê por cartão de débito ou espécie, ou ainda, por cobrança recorrente no cartão de crédito.</li>
      </ul>

      <div style={{ background: "#e6eef9", border: "1px solid #000", padding: "4px 6px", fontWeight: 700, textAlign: "center" }}>
        CONDIÇÕES E BENEFÍCIOS
      </div>

      <h2>I. APÓS O PAGAMENTO DA 1ª MENSALIDADE E TAXA DE INSCRIÇÃO</h2>
      <ul>
        <li>Gratuidade para verificação de peso e pressão;</li>
        <li>Os ASSOCIADOS farão o pagamento mensal das parcelas, bem como, <strong>o valor de R$ 9,99 (nove reais e noventa e nove centavos)</strong> sendo pago no ato de cada consulta realizada referente às especialidades clínicas;</li>
        <li><strong>Atendimento em todas as especialidades médicas (consultas) sem carência;</strong></li>
        <li><strong>Haverá limite de 1 (uma) consulta diária por contrato;</strong></li>
        <li><strong>CONSULTAS CLÍNICAS SEM CARÊNCIA:</strong> Angiologia, Cardiologia, Clínica Médica, Dermatologia, Endocrinologia, Gastroenterologia, Geriatria, Ginecologia, Ortopedia, Otorrinolaringologia, Obstetrícia, Pediatria e Urologia;</li>
        <li><strong>SEGURO DE VIDA POR ACIDENTE:</strong> O titular e seus dependentes terão suas vidas asseguradas por morte por acidente. Acionamento: 0800 016 6633, opção 6. <em>OBS: disponível apenas para titulares e dependentes entre 14 e 69 anos.</em></li>
        <li><strong>AUXÍLIO FUNERAL:</strong> O titular e seus dependentes terão auxílio funeral, incluindo translado, urna ornamentada, coroa de flores, profissionais especializados e atendimento personalizado. Acionamento: 0800 016 6633, opção 6. <em>OBS: disponível apenas para titulares e dependentes até 69 anos.</em></li>
        <li><strong>CONSULTA DE TELEMEDICINA:</strong> O titular e dependentes poderão realizar consultas virtuais em duas modalidades:
          <ul>
            <li>Nas dependências da clínica: consultas nas especialidades disponíveis, casos sem intervenção imediata. Valores conforme tabela contratual.</li>
            <li>Fora da clínica: atendimento remoto em Clínica Médica para urgências, em horários noturnos, finais de semana e feriados. Associado paga 50% do valor da consulta, cobrado na próxima mensalidade. Acesso pelo app Seguros Unimed ou paciente.conexasaude.com.br. <em>OBS: disponível apenas para titulares e dependentes até 69 anos.</em></li>
          </ul>
        </li>
        <li><strong>CLUBE DE DESCONTO:</strong> Somente o TITULAR terá acesso ao clube de benefícios, com descontos em lojas parceiras.</li>
      </ul>

      <div style={{ fontWeight: 700, marginTop: 4 }}>FRANQUIA DIFERENCIADA:</div>
      <ul>
        <li>Psicologia e Nutrição: o associado pagará <strong>R$ 60,00</strong> a cada utilização do serviço;</li>
        <li>Alergologia, Cardiologia Infantil, Endocrinologia Infantil, Fonoaudiologia, Mastologia, Nefrologia, Neurologia, Oftalmologia, Podologia, Pneumologia, Proctologia, Psiquiatria e Reumatologia: <strong>R$ 80,00</strong> a cada utilização.</li>
      </ul>

      <h2>II. APÓS O PAGAMENTO DA 2ª MENSALIDADE</h2>
      <ul>
        <li>10% de desconto nos exames: Laboratoriais; Eletrocardiograma; Raio X; Preventivo; Mamografia e Densitometria Óssea;</li>
        <li>5% de desconto nos exames: Odontologia (consultar tabela); Ultrassonografia; Tomografia Computadorizada; Ressonância Magnética; Ecocardiograma; Eletroencefalograma; Teste Ergométrico; Endoscopia Digestiva Alta; Pacotes de Fisioterapia / RPG / Acupuntura.</li>
      </ul>

      <h2>III. APÓS O PAGAMENTO DA 6ª MENSALIDADE</h2>
      <ul>
        <li>Gratuidade em exames laboratoriais: Ácido Úrico; Hemograma Completo; Glicose; EAS; Lipidograma; Parasitológico de fezes (EPF).</li>
        <li>ANUALMENTE será concedida a realização de 1 (um) exame por contrato (titular): Preventivo; Mamografia ou USG da Mama; PSA ou USG da Próstata; Densitometria Óssea; Eletrocardiograma (ECG) e Raio-X de Tórax PA/PERFIL.</li>
      </ul>

      <div style={{ fontWeight: 700, marginTop: 6 }}>NÃO ESTÁ INCLUSO:</div>
      <ul>
        <li>Pequenas cirurgias, anestesias, estética, laudos médicos e revisão (incluindo risco cirúrgico e exame ocupacional).</li>
      </ul>

      <div className="footer">
        <div>WhatsApp: (21) 98464-2531 · Site: www.policardmed.com</div>
        <div style={{ fontWeight: 700, marginTop: 2 }}>
          TRAZER: ORIGINAL E CÓPIA DE RG, CPF E COMPROVANTE DE RESIDÊNCIA DO TITULAR NO MOMENTO DA CONTRATAÇÃO, E CÓPIA DOS DEPENDENTES.
        </div>
      </div>
    </div>
  );
}