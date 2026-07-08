// Conteúdo estático da Etapa 03 — Croqui Estrutural (da planilha oficial).

import type { TarefaDef } from "@/lib/etapa1";

export const TAREFAS_ETAPA3: TarefaDef[] = [
  {
    num: 1,
    titulo: "Agendar a Apresentação do Croqui Estrutural",
    descricao:
      "Inclua as datas agendadas para a apresentação do Croqui Estrutural nos agendamentos abaixo.",
    info: "A equipe acompanha apenas UM evento — indique qual nos agendamentos.",
  },
  {
    num: 2,
    titulo: "Enviar as mensagens após a Reunião Preliminar",
    descricao: "Envie as mensagens de acompanhamento após a Reunião Preliminar.",
    modelo: { nome: "07 - Mensagens Após a SV" },
  },
  {
    num: 3,
    titulo: "Assista à aula de como elaborar o Croqui Estrutural",
    descricao: "Estude como elaborar o Croqui Estrutural.",
    tutorialUrl: "https://membros.holdingmasters.com.br/file/4Ny4kWWgDa",
  },
  {
    num: 4,
    titulo: "Consultar a legislação do ITCMD do Estado",
    descricao:
      "Consulte a legislação do Estado em questão sobre a alíquota do ITCMD.",
  },
  {
    num: 5,
    titulo: "Consultar o valor de mercado dos imóveis (simular ITBI)",
    descricao:
      "Consulte o valor de mercado dos imóveis, simulando o ITBI. NÃO é o valor venal do IPTU.",
    info: "No Rio de Janeiro, por exemplo, a consulta é feita pelo próprio site da prefeitura.",
  },
  {
    num: 6,
    titulo: "Elaborar o Croqui Estrutural",
    descricao: "Elabore o Croqui Estrutural para posterior revisão da equipe.",
  },
  {
    num: 7,
    titulo: "Enviar dúvidas do croqui para revisão da equipe",
    descricao:
      "Envie suas dúvidas sobre o croqui no campo de revisão abaixo; a equipe aponta as correções necessárias.",
  },
  {
    num: 8,
    titulo: "Confirmar a participação 1 dia antes",
    descricao:
      "1 dia antes da reunião de apresentação, envie mensagem no grupo do cliente confirmando a participação. Sem retorno, faça uma ligação.",
  },
  {
    num: 9,
    titulo: "Confirmar a reunião e enviar o link no dia",
    descricao:
      "No dia, confirme a reunião no horário agendado e envie o link de acesso, pedindo que o cliente entre com 15 minutos de antecedência para checar a conexão.",
  },
  {
    num: 10,
    titulo: "Check-in do assistente com o cliente",
    descricao:
      "O assistente ingressa com o cliente 15 minutos antes de começar e realiza o check-in.",
  },
  {
    num: 11,
    titulo: "Apresentação do Croqui Estrutural",
    descricao: "Realize a apresentação do Croqui Estrutural ao cliente.",
  },
  {
    num: 12,
    titulo: "Enviar link de pagamento do sinal e o PDF do Croqui",
    descricao:
      "Se o cliente avançou para a contratação da execução, envie no grupo o link para pagamento dos 10% do sinal e o PDF do Croqui Estrutural.",
    info: "Acompanhe o pagamento: após 1h sem pagamento, pergunte se há dificuldade; até o fim do dia, avise que o prazo do benefício está encerrando; se ainda assim não avançar, envie o PDF do Croqui.",
    modelo: {
      nome: "09 - Mensagens após a reunião de apresentação do Croqui Estrutural",
    },
  },
  {
    num: 13,
    titulo: "Parabenizar e solicitar os documentos",
    descricao:
      "Feito o pagamento, envie mensagem no grupo parabenizando e solicitando os documentos.",
    info: "Documentos: pessoais (RG, CPF, comprovante de residência e certidão de casamento/união estável dos filhos e cônjuges) e IPTU do imóvel que será a sede das células.",
  },
];
