UPDATE public.planos_assinatura SET template_contrato = $tpl$<div style="font-family:'Times New Roman',Times,serif;font-size:11pt;line-height:1.45;color:#000;max-width:210mm;margin:0 auto;padding:16mm 14mm;">
<div style="text-align:center;margin-bottom:8px;">
  <div style="font-family:Georgia,serif;font-size:18pt;font-weight:bold;color:#0a4d8f;letter-spacing:0.5px;">POLICARDMED</div>
  <div style="font-size:9pt;color:#0a4d8f;letter-spacing:6px;margin-top:-2px;">O SEU CARTÃO DE SAÚDE</div>
  <div style="border-top:1px solid #0a4d8f;margin:6px auto 4px;width:60%;"></div>
  <div style="font-family:Georgia,serif;font-size:13pt;font-weight:bold;color:#0a4d8f;">POLICLÍNICA MENINO JESUS</div>
  <div style="font-size:8pt;color:#555;font-style:italic;">Direção Dr. Márcio de Castro — Desde 1968</div>
</div>

<h2 style="text-align:center;font-size:14pt;font-weight:bold;margin:6px 0 2px;text-transform:uppercase;">INSTRUMENTO PARTICULAR DE CONTRATO</h2>
<h3 style="text-align:center;font-size:13pt;font-weight:bold;margin:0 0 12px;">&ldquo;CARTÃO CONSULTA + SEGUROS&rdquo;</h3>
<p style="text-align:justify;margin:8px 0;">Pelo presente instrumento, e na melhor forma de Direito, os signatários:</p>

<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:11pt;">
  <tr><td colspan="4" style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;">CONTRATADA: POLICARDMED SERV. E SOLUÇÕES EM MEDICINA EIRELI</td></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;width:14%;"><b>CNPJ:</b></td><td colspan="3" style="border:1px solid #000;padding:4px 8px;">27.045.917/0001-69</td></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;"><b>Endereço:</b></td><td colspan="3" style="border:1px solid #000;padding:4px 8px;">Rua Expedicionários, nº 148</td></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;"><b>Bairro:</b></td><td style="border:1px solid #000;padding:4px 8px;width:30%;">Centro</td><td style="border:1px solid #000;padding:4px 8px;width:14%;"><b>Cidade:</b></td><td style="border:1px solid #000;padding:4px 8px;">São João de Meriti</td></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;"><b>Estado:</b></td><td style="border:1px solid #000;padding:4px 8px;">Rio de Janeiro</td><td style="border:1px solid #000;padding:4px 8px;"><b>CEP:</b></td><td style="border:1px solid #000;padding:4px 8px;">25.520-591</td></tr>
</table>

<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:11pt;">
  <tr><td colspan="4" style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;">CONTRATANTE: ASSOCIADO TITULAR</td></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;width:14%;"><b>Nome:</b></td><td colspan="3" style="border:1px solid #000;padding:4px 8px;">{{PACIENTE_NOME}}</td></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;"><b>CPF:</b></td><td style="border:1px solid #000;padding:4px 8px;width:36%;">{{PACIENTE_CPF}}</td><td style="border:1px solid #000;padding:4px 8px;width:14%;"><b>Nascimento:</b></td><td style="border:1px solid #000;padding:4px 8px;">{{PACIENTE_NASCIMENTO}}</td></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;"><b>Endereço:</b></td><td colspan="3" style="border:1px solid #000;padding:4px 8px;">{{PACIENTE_LOGRADOURO}}, {{PACIENTE_NUMERO}}</td></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;"><b>Bairro:</b></td><td style="border:1px solid #000;padding:4px 8px;">{{PACIENTE_BAIRRO}}</td><td style="border:1px solid #000;padding:4px 8px;"><b>Cidade:</b></td><td style="border:1px solid #000;padding:4px 8px;">{{PACIENTE_CIDADE}}</td></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;"><b>Estado:</b></td><td style="border:1px solid #000;padding:4px 8px;">{{PACIENTE_ESTADO}}</td><td style="border:1px solid #000;padding:4px 8px;"><b>CEP:</b></td><td style="border:1px solid #000;padding:4px 8px;">{{PACIENTE_CEP}}</td></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;"><b>Telefones:</b></td><td style="border:1px solid #000;padding:4px 8px;">{{PACIENTE_TELEFONE}}</td><td style="border:1px solid #000;padding:4px 8px;"><b>E-mail:</b></td><td style="border:1px solid #000;padding:4px 8px;">{{PACIENTE_EMAIL}}</td></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;"><b>Vencimento:</b></td><td colspan="3" style="border:1px solid #000;padding:4px 8px;">{{DATA_HOJE}}</td></tr>
</table>

<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:10.5pt;">
  <tr><td colspan="4" style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;text-align:center;">ASSOCIADOS DEPENDENTES</td></tr>
  <tr style="background:#f2f2f2;"><th style="border:1px solid #000;padding:4px;width:5%;">#</th><th style="border:1px solid #000;padding:4px;text-align:left;">Nome</th><th style="border:1px solid #000;padding:4px;width:15%;text-align:left;">Nascimento</th><th style="border:1px solid #000;padding:4px;width:18%;text-align:left;">Parentesco</th></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;">1</td><td style="border:1px solid #000;padding:4px 8px;">{{DEPENDENTE_1_NOME}}</td><td style="border:1px solid #000;padding:4px 8px;">{{DEPENDENTE_1_NASCIMENTO}}</td><td style="border:1px solid #000;padding:4px 8px;">{{DEPENDENTE_1_PARENTESCO}}</td></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;">2</td><td style="border:1px solid #000;padding:4px 8px;">{{DEPENDENTE_2_NOME}}</td><td style="border:1px solid #000;padding:4px 8px;">{{DEPENDENTE_2_NASCIMENTO}}</td><td style="border:1px solid #000;padding:4px 8px;">{{DEPENDENTE_2_PARENTESCO}}</td></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;">3</td><td style="border:1px solid #000;padding:4px 8px;">{{DEPENDENTE_3_NOME}}</td><td style="border:1px solid #000;padding:4px 8px;">{{DEPENDENTE_3_NASCIMENTO}}</td><td style="border:1px solid #000;padding:4px 8px;">{{DEPENDENTE_3_PARENTESCO}}</td></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;">4</td><td style="border:1px solid #000;padding:4px 8px;">{{DEPENDENTE_4_NOME}}</td><td style="border:1px solid #000;padding:4px 8px;">{{DEPENDENTE_4_NASCIMENTO}}</td><td style="border:1px solid #000;padding:4px 8px;">{{DEPENDENTE_4_PARENTESCO}}</td></tr>
  <tr><td style="border:1px solid #000;padding:4px 8px;">5</td><td style="border:1px solid #000;padding:4px 8px;">{{DEPENDENTE_5_NOME}}</td><td style="border:1px solid #000;padding:4px 8px;">{{DEPENDENTE_5_NASCIMENTO}}</td><td style="border:1px solid #000;padding:4px 8px;">{{DEPENDENTE_5_PARENTESCO}}</td></tr>
</table>

<p style="text-align:justify;margin:10px 0;">Firmam o presente contrato, para a utilização dos benefícios do Cartão Consulta da Policlínica Menino Jesus, através do qual serão concedidos descontos ao <b>ASSOCIADO TITULAR</b>, bem como, aos seus <b>ASSOCIADOS DEPENDENTES</b>, exclusivamente na sede situada no endereço acima, de acordo com os termos e condições previstas nas cláusulas a seguir.</p>

<table style="width:100%;border-collapse:collapse;margin:14px 0 8px;"><tr><td style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;text-align:center;">CLÁUSULA PRIMEIRA: DO OBJETO</td></tr></table>
<p style="text-align:justify;">O objeto do contrato consiste em serviços médicos prestados pela CONTRATADA, da seguinte forma:</p>
<p style="text-align:justify;padding-left:24px;"><b>I.</b> <b>APÓS O PAGAMENTO DA 1ª MENSALIDADE E TAXA DE INSCRIÇÃO:</b> O cliente realizará <b>CONSULTAS CLÍNICAS SEM CARÊNCIA</b> referentes às especialidades de: Angiologia, Cardiologia, Clínica Médica, Dermatologia, Endocrinologia, Gastroenterologia, Geriatria, Ginecologia, Ortopedia, Otorrinolaringologia, Obstetrícia, Pediatria e Urologia;</p>
<p style="text-align:justify;"><b>Parágrafo Primeiro:</b> O cliente terá desconto e pagará o valor de consulta, de acordo com a tabela disponibilizada pela CONTRATADA na sede de atendimento, para as seguintes especialidades:</p>
<p style="text-align:justify;padding-left:24px;"><b>I.</b> Alergologia, Cardiologia Infantil, Endocrinologia Infantil, Fonoaudiologia, Mastologia, Nefrologia, Neurologia, Nutrição, Oftalmologia, Podologia, Pneumologia, Proctologia, Psiquiatria, Psicologia e Reumatologia.</p>
<div style="text-align:right;font-size:9pt;color:#555;margin-top:20px;">1/6</div><div style="page-break-after:always;"></div>
<div style="text-align:center;margin-bottom:8px;">
  <div style="font-family:Georgia,serif;font-size:18pt;font-weight:bold;color:#0a4d8f;letter-spacing:0.5px;">POLICARDMED</div>
  <div style="font-size:9pt;color:#0a4d8f;letter-spacing:6px;margin-top:-2px;">O SEU CARTÃO DE SAÚDE</div>
  <div style="border-top:1px solid #0a4d8f;margin:6px auto 4px;width:60%;"></div>
  <div style="font-family:Georgia,serif;font-size:13pt;font-weight:bold;color:#0a4d8f;">POLICLÍNICA MENINO JESUS</div>
  <div style="font-size:8pt;color:#555;font-style:italic;">Direção Dr. Márcio de Castro — Desde 1968</div>
</div>

<p style="text-align:justify;"><b>Parágrafo Segundo: <u>NÃO ESTÁ COBERTO POR ESTE CARTÃO CONSULTA OS SEGUINTES SERVIÇOS:</u></b></p>
<p style="text-align:justify;padding-left:24px;"><b>I.</b> Procedimentos, pequenas cirurgias, anestesias, estética, revisão, risco cirúrgico, exame ocupacional;</p>
<p style="text-align:justify;padding-left:24px;"><b>II.</b> Laudo para INSS e CONCURSOS PÚBLICOS.</p>
<p style="text-align:justify;"><b>Parágrafo Terceiro:</b> Os Associados ficam cientes de que <b>não estão aderindo a um plano de saúde</b>, mas a um serviço de operacionalização de descontos e benefícios aos consumidores aderentes.</p>
<p style="text-align:justify;"><b>Parágrafo Quarto:</b> A <b>CONTRATADA NÃO POSSUI EMERGÊNCIA, SERVIÇOS DE INTERNAÇÃO, NEM ATENDIMENTO 24 HORAS.</b></p>
<p style="text-align:justify;"><b>Parágrafo Quinto:</b> <b>HAVERÁ LIMITE DE (1) UMA CONSULTA DIÁRIA POR CONTRATO.</b></p>

<table style="width:100%;border-collapse:collapse;margin:14px 0 8px;"><tr><td style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;text-align:center;">CLÁUSULA SEGUNDA: DOS BENEFÍCIOS</td></tr></table>
<p style="text-align:justify;">Após o pagamento de algumas mensalidades os ASSOCIADOS terão direito aos seguintes serviços de saúde:</p>
<p style="text-align:justify;padding-left:24px;"><b>I. APÓS A 1ª MENSALIDADE:</b><br/>a. Gratuidade para verificação de peso e pressão.</p>
<p style="text-align:justify;padding-left:24px;"><b>II. APÓS A 2ª MENSALIDADE:</b><br/>a. 10% de desconto nos exames: Laboratoriais; Eletrocardiograma; Raio X; Preventivo; Mamografia; Densitometria óssea.</p>

<table style="width:100%;border-collapse:collapse;margin:14px 0 8px;"><tr><td style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;text-align:center;">CLÁUSULA TERCEIRA: DO PAGAMENTO</td></tr></table>
<p style="text-align:justify;"><b>Parágrafo Primeiro:</b> O pagamento será realizado mensalmente, no valor estabelecido pela tabela vigente da CONTRATADA, no ato da assinatura do contrato.</p>
<p style="text-align:justify;"><b>Parágrafo Segundo:</b> Fica autorizado o reajuste anual das mensalidades, com base no Índice de Variação de Custos Médicos Hospitalares (VCMH).</p>
<p style="text-align:justify;"><b>Parágrafo Terceiro:</b> Não haverá devolução das importâncias pagas, ainda que não utilizados os benefícios;</p>
<p style="text-align:justify;"><b>Parágrafo Quarto:</b> O valor da mensalidade será reajustado todo mês de janeiro, de acordo com o Índice de Variação de Custos Médicos Hospitalares (VCMH);</p>
<p style="text-align:justify;"><b>Parágrafo Quinto:</b> O pagamento deverá ser efetuado sempre na data do vencimento, com tolerância de 5 (cinco) dias corridos, no caso de atraso, serão cobrados multa de 10% (dez por cento), além de juros de 0,033% ao dia.</p>

<table style="width:100%;border-collapse:collapse;margin:14px 0 8px;"><tr><td style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;text-align:center;">CLÁUSULA QUARTA: DO ATENDIMENTO POR TELEMEDICINA</td></tr></table>
<p style="text-align:justify;">O titular e seus dependentes, devidamente cadastrados, terão direito ao benefício para o atendimento por telemedicina, conforme os termos e condições estabelecidos neste contrato.</p>
<p style="text-align:justify;"><b>Parágrafo Primeiro:</b> A Telemedicina refere-se a prestação de serviço, via internet, por videoconferência, para situações clínicas agudas de baixa complexidade.</p>
<p style="text-align:justify;"><b>Parágrafo Segundo:</b> Momentaneamente não haverá cobrança adicional na mensalidade do contrato pela disponibilização do serviço, entretanto, será aplicada uma franquia por cada atendimento realizado através do serviço de telemedicina, conforme a tabela de valores vigente no momento do atendimento.</p>
<div style="text-align:right;font-size:9pt;color:#555;margin-top:20px;">2/6</div><div style="page-break-after:always;"></div>
<div style="text-align:center;margin-bottom:8px;">
  <div style="font-family:Georgia,serif;font-size:18pt;font-weight:bold;color:#0a4d8f;letter-spacing:0.5px;">POLICARDMED</div>
  <div style="font-size:9pt;color:#0a4d8f;letter-spacing:6px;margin-top:-2px;">O SEU CARTÃO DE SAÚDE</div>
  <div style="border-top:1px solid #0a4d8f;margin:6px auto 4px;width:60%;"></div>
  <div style="font-family:Georgia,serif;font-size:13pt;font-weight:bold;color:#0a4d8f;">POLICLÍNICA MENINO JESUS</div>
  <div style="font-size:8pt;color:#555;font-style:italic;">Direção Dr. Márcio de Castro — Desde 1968</div>
</div>

<p style="text-align:justify;">* As condições estabelecidas nesta cláusula não eximem o paciente do pagamento de quaisquer outros valores previstos no presente contrato, que sejam decorrentes de serviços adicionais ou procedimentos realizados durante a consulta por telemedicina.</p>
<p style="text-align:justify;"><b>Parágrafo Terceiro:</b> Os horários de atendimento serão realizados da seguinte forma:</p>
<p style="text-align:justify;padding-left:24px;">* As consultas realizadas durante o horário de funcionamento da clínica serão efetuadas por nossos profissionais de saúde, conforme os horários estabelecidos pela clínica.</p>
<p style="text-align:justify;padding-left:24px;">* As consultas realizadas fora do horário de funcionamento da clínica — incluindo períodos noturnos, finais de semana e feriados — serão prestadas por parceiro da contratada (Seguros Unimed), por meio de atendimento remoto na especialidade de Clínica Médica. O associado arcará com 50% do valor da consulta, conforme tabela contratual vigente, sendo o respectivo valor cobrado na próxima mensalidade. O acesso ao Pronto Atendimento Digital poderá ser feito pelo aplicativo Seguros Unimed ou pelo site https://paciente.conexasaude.com.br.</p>
<p style="text-align:justify;padding-left:24px;">* É importante destacar que o referido atendimento não se configura como um serviço de urgência ou emergência, mas sim, como uma extensão do atendimento regular em horários alternativos, voltado exclusivamente para consultas que possam ser conduzidas de forma remota e que não exijam intervenção imediata.</p>
<p style="text-align:justify;"><b>Parágrafo Quarto:</b> As consultas por telemedicina são realizadas por profissionais de saúde qualificados e habilitados, com todas as exigências legais para o exercício da profissão.</p>
<p style="text-align:justify;"><b>Parágrafo Quinto:</b> Nem todas as condições de saúde ou situações clínicas serão adequadas para o atendimento remoto — como acompanhamento de doenças crônicas, renovação de receitas contínuas, pedidos de exames de rotina ou a prescrição de medicamentos com controle de receita.</p>
<p style="text-align:justify;"><b>Parágrafo Sexto:</b> Se durante o atendimento a contratada identificar a necessidade de buscar outros profissionais ou serviços de saúde não cobertos por este contrato, o paciente pode optar por seguir essa recomendação. Nesse caso, ele deverá procurar tais serviços e atendimentos por conta própria, com prestadores de sua escolha.</p>
<p style="text-align:justify;"><b>Parágrafo Sétimo:</b> A contratada não é responsável por: (i) sugerir outras unidades de saúde ao paciente; (ii) realizar a transferência para essas unidades; (iii) garantir ou custear o atendimento em locais distintos; ou (iv) acompanhar o paciente na sua jornada para outra unidade. A responsabilidade por essas ações e seus custos é exclusivamente do contratante.</p>
<p style="text-align:justify;"><b>Parágrafo Oitavo:</b> O contratante é responsável por garantir que seus dados de acesso sejam utilizados de forma adequada e não divulgados a terceiros.</p>
<p style="text-align:justify;"><b>Parágrafo Nono:</b> O contratante poderá encaminhar dúvidas, solicitações e reclamações quanto ao &ldquo;Atendimento Virtual&rdquo; pelo telefone ou enviar mensagem para (21) 97377-5431 (resposta em até 48h).</p>
<p style="text-align:justify;"><b>Parágrafo Décimo:</b> O contratante consente expressamente que seus dados pessoais fornecidos para esta contratação sejam utilizados pela contratada para enviar comunicações relacionadas ao contrato e para oferecer outros serviços de saúde que possam interessá-lo. O contratante pode revogar esse consentimento e interromper o recebimento de comunicações a qualquer momento, diretamente pelo mesmo canal em que as mensagens foram enviadas.</p>
<p style="text-align:justify;"><b>Parágrafo Décimo primeiro:</b> A Policardmed não se responsabiliza por falhas no atendimento decorrentes de problemas técnicos no dispositivo do paciente, incluindo, falhas de conexão à internet, problemas de hardware ou software.</p>
<div style="text-align:right;font-size:9pt;color:#555;margin-top:20px;">3/6</div><div style="page-break-after:always;"></div>
<div style="text-align:center;margin-bottom:8px;">
  <div style="font-family:Georgia,serif;font-size:18pt;font-weight:bold;color:#0a4d8f;letter-spacing:0.5px;">POLICARDMED</div>
  <div style="font-size:9pt;color:#0a4d8f;letter-spacing:6px;margin-top:-2px;">O SEU CARTÃO DE SAÚDE</div>
  <div style="border-top:1px solid #0a4d8f;margin:6px auto 4px;width:60%;"></div>
  <div style="font-family:Georgia,serif;font-size:13pt;font-weight:bold;color:#0a4d8f;">POLICLÍNICA MENINO JESUS</div>
  <div style="font-size:8pt;color:#555;font-style:italic;">Direção Dr. Márcio de Castro — Desde 1968</div>
</div>
<table style="width:100%;border-collapse:collapse;margin:14px 0 8px;"><tr><td style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;text-align:center;">CLÁUSULA QUINTA: DO CLUBE DE DESCONTOS</td></tr></table>
<p style="text-align:justify;">O Clube de Descontos será disponibilizado como um <b>benefício</b> para os associados aos contratos de saúde.</p>
<p style="text-align:justify;"><b>Parágrafo Primeiro:</b> Somente o titular do contrato de saúde terá direito ao benefício do Clube de Descontos e deverão estar devidamente <b>cadastrados no aplicativo</b> próprio do Clube Policardmed para usufruir dos benefícios oferecidos.</p>
<p style="text-align:justify;"><b>Parágrafo Segundo:</b> Os beneficiários terão direito aos seguintes benefícios:</p>
<p style="text-align:justify;padding-left:24px;">✓ Descontos nas lojas cadastradas, com percentuais de desconto diferenciados de acordo com cada loja parceira.</p>
<p style="text-align:justify;padding-left:24px;">✓ Resgate de <b>cashbacks</b>, que serão disponibilizados por algumas lojas parceiras.</p>
<p style="text-align:justify;">O resgate dos cashbacks deverão ser realizados dentro do próprio aplicativo do Clube Policardmed.</p>
<p style="text-align:justify;"><b>Parágrafo Terceiro:</b> A Policardmed não assume qualquer responsabilidade pelo gerenciamento, validade, ou condições dos descontos e cashbacks, gerenciados única e exclusivamente pelas lojas parceiras, assim, qualquer questão ou reclamação, deverão ser diretamente tratadas com a loja parceira responsável pelo benefício em questão.</p>
<p style="text-align:justify;"><b>Parágrafo Quarto:</b> A Policardmed não é responsável por danos que possam decorrer de uma administração inadequada dos serviços ou de falhas nos produtos oferecidos pelos seus parceiros.</p>
<p style="text-align:justify;"><b>Parágrafo Quinto:</b> A Policardmed não tem controle sobre os preços praticados, os valores cobrados são de inteira responsabilidade dos parceiros e podem ser ajustados a qualquer momento.</p>
<p style="text-align:justify;">A Policardmed obriga-se a:</p>
<p style="text-align:justify;padding-left:24px;">a) Manter a lista de parceiros e os produtos e serviços disponíveis sempre atualizados por meio do site https://clube.policardmed.com.</p>
<p style="text-align:justify;"><b>Parágrafo Sexto:</b> Das condições gerais do benefício:</p>
<p style="text-align:justify;padding-left:24px;">✓ O Clube de Descontos, por se tratar de um <b>serviço terceirizado</b>, poderá ser encerrado ou ter suas condições modificadas a qualquer momento, sem a necessidade de comunicação prévia aos beneficiários.</p>
<p style="text-align:justify;padding-left:24px;">✓ No caso de tais alterações ou encerramento, o beneficiário terá o direito de rescindir o contrato, <b>sem a imposição de quaisquer taxas adicionais</b>, desde que todas as mensalidades do contrato vigente estejam devidamente quitadas até a data da rescisão.</p>

<table style="width:100%;border-collapse:collapse;margin:14px 0 8px;"><tr><td style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;text-align:center;">CLÁUSULA SEXTA: DOS SEGUROS</td></tr></table>
<p style="text-align:justify;">A POLICARDMED, como intermediadora, oferece aos associados, de forma facultativa, benefícios assistenciais complementares por meio da Unimed e empresas parceiras, compreendendo auxílio-funeral, seguro de vida por acidente e telemedicina (em horários específicos). Tais benefícios têm caráter assistencial e securitário, não configurando plano de saúde, sendo regidos pelas condições gerais da Unimed e pela tabela de benefícios vigente.</p>

<table style="width:100%;border-collapse:collapse;margin:14px 0 8px;"><tr><td style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;text-align:center;">CLÁUSULA SÉTIMA: DA RESPONSABILIDADE</td></tr></table>
<p style="text-align:justify;">A guarda do uso do cartão consulta é responsabilidade única do ASSOCIADO TITULAR, que deverá utilizá-lo e conservá-lo para que somente quem figure como titular ou dependente do cartão possa usufruir dos benefícios que o cartão oferece. Em caso de mau uso ou empréstimo do cartão fornecido, poderá o ASSOCIADO TITULAR ser civil e criminalmente responsabilizado.</p>
<p style="text-align:justify;"><b>Parágrafo Primeiro:</b> Em caso de extravio ou roubo do cartão, o ASSOCIADO deverá avisar a administração do cartão consulta imediatamente, e por escrito, bem como, solicitar novo cartão, que terá um custo adicional de R$ 5,00 (cinco) reais;</p>
<p style="text-align:justify;"><b>Parágrafo Segundo:</b> o ASSOCIADO TITULAR, é o único responsável contratual perante o Cartão Consulta, responsabilizando-se civil e criminalmente pelos pagamentos e informações prestadas, inclusive referentes aos ASSOCIADOS DEPENDENTES.</p>
<div style="text-align:right;font-size:9pt;color:#555;margin-top:20px;">4/6</div><div style="page-break-after:always;"></div>
<div style="text-align:center;margin-bottom:8px;">
  <div style="font-family:Georgia,serif;font-size:18pt;font-weight:bold;color:#0a4d8f;letter-spacing:0.5px;">POLICARDMED</div>
  <div style="font-size:9pt;color:#0a4d8f;letter-spacing:6px;margin-top:-2px;">O SEU CARTÃO DE SAÚDE</div>
  <div style="border-top:1px solid #0a4d8f;margin:6px auto 4px;width:60%;"></div>
  <div style="font-family:Georgia,serif;font-size:13pt;font-weight:bold;color:#0a4d8f;">POLICLÍNICA MENINO JESUS</div>
  <div style="font-size:8pt;color:#555;font-style:italic;">Direção Dr. Márcio de Castro — Desde 1968</div>
</div>
<table style="width:100%;border-collapse:collapse;margin:14px 0 8px;"><tr><td style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;text-align:center;">CLÁUSULA OITAVA: DA VIGÊNCIA E FORMA DE RESCISÃO</td></tr></table>
<p style="text-align:justify;">O presente contrato vigerá por tempo determinado de <b>12 (doze) meses</b>, a partir da data de sua assinatura.</p>
<p style="text-align:justify;"><b>Parágrafo Primeiro:</b> Caso uma das partes tenha a intenção de rescindir o presente contrato, deverá manifestar-se expressamente por meio de notificação escrita simples, indicando o motivo da rescisão, com antecedência mínima de 30 (trinta) dias do término do contrato. Em caso de rescisão antecipada, será aplicada multa no valor de 10% (por cento) sobre o total do contrato, devendo os cartões ser devolvidos no ato do distrato.</p>
<p style="text-align:justify;"><b>Parágrafo Segundo:</b> Haverá seu cancelamento após 30 (trinta) dias de atraso no pagamento da parcela devida, podendo ser reabilitado com o pagamento do débito em até 10 (dez) dias após o seu cancelamento;</p>
<p style="text-align:justify;"><b>Parágrafo Terceiro:</b> Não será permitida a compra de novo pacote (cartão) pelo mesmo grupo familiar em casos de inadimplência, entretanto, o paciente poderá utilizar normalmente os serviços oferecidos pela Clínica, mas sem os benefícios deste cartão.</p>

<table style="width:100%;border-collapse:collapse;margin:14px 0 8px;"><tr><td style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;text-align:center;">CLÁUSULA NONA: DAS DISPOSIÇÕES GERAIS</td></tr></table>
<p style="text-align:justify;">Fica disposto neste presente contrato que:</p>
<p style="text-align:justify;padding-left:24px;"><b>I.</b> O Cartão Consulta possibilita a inclusão de até 6 (seis) ASSOCIADOS, sendo um titular e cinco dependentes;</p>
<p style="text-align:justify;padding-left:24px;"><b>II.</b> O ASSOCIADO TITULAR somente poderá incluir os pais, cônjuges e filhos como ASSOCIADOS DEPENDENTES;</p>
<p style="text-align:justify;padding-left:24px;"><b>III.</b> Poderá ser acrescentado dependente a qualquer momento, com a ciência de que somente poderá haver exclusão do mesmo, com no mínimo 6 (seis) meses, e que o mesmo não poderá ser trocado por outro dependente;</p>
<p style="text-align:justify;padding-left:24px;"><b>IV.</b> Menores de idade somente poderão se consultar com a presença do responsável;</p>
<p style="text-align:justify;padding-left:24px;"><b>V.</b> As consultas e exames podem ser realizadas por ordem de chegada ou por agendamento, a critério dos médicos;</p>
<p style="text-align:justify;padding-left:24px;"><b>VI.</b> O atendimento será realizado mediante apresentação do Cartão Consulta e de um documento de identificação com foto;</p>
<p style="text-align:justify;padding-left:24px;"><b>VII.</b> O horário de atendimento será realizado de segunda-feira a sexta-feira, em horário comercial, e sábados até às 12h.</p>

<table style="width:100%;border-collapse:collapse;margin:14px 0 8px;"><tr><td style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;text-align:center;">CLÁUSULA DÉCIMA: DA PROTEÇÃO DE DADOS</td></tr></table>
<p style="text-align:justify;">Considerando a Lei de Proteção de Dados (LGPD), as partes se obrigam a observância e cumprimento das regras, inclusive no uso de dados pessoais sensíveis em relação aos clientes, como: dado pessoal sobre origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político, dado referente à saúde ou à vida sexual, dado genético ou biométrico, quando vinculado a uma pessoa natural, nos termos do artigo 5º da Lei 13.709/2018.</p>
<p style="text-align:justify;"><b>Parágrafo primeiro:</b> As partes concordam que a coleta e tratamento de dados, sempre que possível e recomendável, observará o consentimento do cliente no fornecimento de dados, que deverá ser livre, informado, inequívoco e relacionado a uma determinada finalidade, o que será feito mediante aditivos e termos específicos, de acordo com a necessidade e/ou obrigação legal de coleta de dados, conforme o ANEXO I.</p>
<p style="text-align:justify;"><b>Parágrafo segundo:</b> As partes se comprometem a correta conservação dos dados pessoais cadastrais e sensíveis do cliente, na vigência e após o seu eventual término para cumprimento de obrigação legal ou regulatória do controlador, respeitando os prazos previstos em leis e regulamentos, nos termos do artigo 16, I da Lei 13.079/2018.</p>

<table style="width:100%;border-collapse:collapse;margin:14px 0 8px;"><tr><td style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;text-align:center;">CLÁUSULA DÉCIMA PRIMEIRA: DO FORO</td></tr></table>
<p style="text-align:justify;">As partes contratantes elegem o Foro da Comarca de <b>São João de Meriti</b>, com renúncia expressa de qualquer outro, por mais privilegiado que seja, para eventual solução de quaisquer questões decorrentes da execução deste contrato.</p>
<p style="text-align:justify;margin-top:10px;">Assim acordados, assinam o presente Contrato, e declara o ASSOCIADO TITULAR que leu, compreendeu e concordou com todo o conteúdo do presente instrumento, responsabilizando-se por todos os dados informados.</p>
<p style="text-align:justify;margin-top:12px;">São João de Meriti, _____ de _____________________ de 20______</p>
<div style="margin-top:36px;text-align:center;">
  <div style="border-top:1px solid #000;width:80%;margin:0 auto;padding-top:4px;">CONTRATANTE: POLICARDMED SERV. E SOLUÇÕES EM MEDICINA EIRELI</div>
</div>
<div style="margin-top:36px;text-align:center;">
  <div style="border-top:1px solid #000;width:80%;margin:0 auto;padding-top:4px;">CONTRATADA: ASSOCIADO TITULAR</div>
</div>
<div style="text-align:right;font-size:9pt;color:#555;margin-top:20px;">5/6</div><div style="page-break-after:always;"></div>
<div style="text-align:center;margin-bottom:8px;">
  <div style="font-family:Georgia,serif;font-size:18pt;font-weight:bold;color:#0a4d8f;letter-spacing:0.5px;">POLICARDMED</div>
  <div style="font-size:9pt;color:#0a4d8f;letter-spacing:6px;margin-top:-2px;">O SEU CARTÃO DE SAÚDE</div>
  <div style="border-top:1px solid #0a4d8f;margin:6px auto 4px;width:60%;"></div>
  <div style="font-family:Georgia,serif;font-size:13pt;font-weight:bold;color:#0a4d8f;">POLICLÍNICA MENINO JESUS</div>
  <div style="font-size:8pt;color:#555;font-style:italic;">Direção Dr. Márcio de Castro — Desde 1968</div>
</div>

<h2 style="text-align:center;font-size:14pt;font-weight:bold;margin:8px 0;">ANEXO I</h2>

<table style="width:100%;border-collapse:collapse;margin:8px 0;"><tr><td style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;text-align:center;">TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS<br/>ASSOCIADO TITULAR</td></tr></table>

<p style="text-align:justify;margin-top:8px;"><b>{{PACIENTE_NOME}}</b>, inscrito(a) no CPF sob nº <b>{{PACIENTE_CPF}}</b>, aqui denominado(a) como TITULAR, vem por meio deste, manifestar livre, informada e inequívoca autorização para o tratamento de dados pessoais e dados pessoais sensíveis, com finalidade determinada, para a empresa <b>POLICARDMED SERV. E SOLUÇÕES EM MEDICINA EIRELI</b>, aqui denominada como CONTROLADOR, inscrita no CNPJ sob nº 27.045.917/0001-69, de acordo a Lei nº 13.709/2018, conforme disposto neste termo:</p>

<table style="width:100%;border-collapse:collapse;margin:10px 0;"><tr><td style="border:1px solid #000;background:#e5e5e5;padding:5px 8px;font-weight:bold;text-align:center;">DA COLETA E DA FINALIDADE DO TRATAMENTO DE DADOS</td></tr></table>

<p style="text-align:justify;">O tratamento dos dados pessoais e dados pessoais sensíveis, listados no presente termo, tem as seguintes finalidades específicas:</p>

<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:10.5pt;">
  <tr style="background:#f2f2f2;">
    <th style="border:1px solid #000;padding:6px;text-align:left;">Finalidade</th>
    <th style="border:1px solid #000;padding:6px;width:8%;">SIM</th>
    <th style="border:1px solid #000;padding:6px;width:8%;">NÃO</th>
  </tr>
  <tr><td style="border:1px solid #000;padding:6px;">Coleta de dados pessoais para manutenção de cadastro e agendamento de consultas e exames, bem como para cumprir obrigações legais e regulatórias.</td><td style="border:1px solid #000;padding:6px;text-align:center;">☐</td><td style="border:1px solid #000;padding:6px;text-align:center;">☐</td></tr>
  <tr><td style="border:1px solid #000;padding:6px;">Coleta de dados sensíveis, referentes à saúde, para preenchimento da ficha de anamnese e prontuários médicos, necessários para evolução dos tratamentos e para apoiar na descrição do resultado e direcionamento no diagnóstico, e definir um prognóstico.</td><td style="border:1px solid #000;padding:6px;text-align:center;">☐</td><td style="border:1px solid #000;padding:6px;text-align:center;">☐</td></tr>
  <tr><td style="border:1px solid #000;padding:6px;">Coleta de dados para a prescrição de medicamentos.</td><td style="border:1px solid #000;padding:6px;text-align:center;">☐</td><td style="border:1px solid #000;padding:6px;text-align:center;">☐</td></tr>
  <tr><td style="border:1px solid #000;padding:6px;">Utilização dos dados para encaminhar correspondências e mensagens por meios físicos e digitais, abrangendo correio eletrônico (e-mail) e WhatsApp.</td><td style="border:1px solid #000;padding:6px;text-align:center;">☐</td><td style="border:1px solid #000;padding:6px;text-align:center;">☐</td></tr>
  <tr><td style="border:1px solid #000;padding:6px;">Utilizar dados cadastrais para a emissão de carnês de pagamento e emissão de notas fiscais.</td><td style="border:1px solid #000;padding:6px;text-align:center;">☐</td><td style="border:1px solid #000;padding:6px;text-align:center;">☐</td></tr>
</table>

<p style="text-align:justify;">Ressaltamos que é possível retirar, a qualquer tempo, o seu consentimento para o tratamento dos dados nas finalidades referidas neste Instrumento. Também será possível solicitar o acesso aos seus dados pessoais, bem como a sua retificação, eliminação, limitação do seu uso e a portabilidade dos seus dados.</p>

<p style="text-align:justify;">Estou ciente e concordo com a utilização de meus dados pessoais pela <b>POLICARDMED SERV. E SOLUÇÕES EM MEDICINA EIRELI</b>, para as finalidades citadas e autorizadas acima, o que faço expressamente por assinatura escrita ou digital, com validade jurídica.</p>

<p style="text-align:justify;margin-top:12px;">São João de Meriti, ______ de ______________________ de _____________.</p>

<div style="margin-top:48px;text-align:center;">
  <div style="border-top:1px solid #000;width:80%;margin:0 auto;padding-top:4px;">Assinatura do ASSOCIADO TITULAR</div>
</div>
<div style="text-align:right;font-size:9pt;color:#555;margin-top:20px;">6/6</div></div>$tpl$, updated_at = now() WHERE id = 'b3bbd5a8-a811-4d68-94db-d65fd5a2bdca';