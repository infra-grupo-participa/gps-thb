// Conteúdo estático da Etapa 02 — Reunião Preliminar (da planilha oficial).

import type { TarefaDef } from "@/lib/etapa1";

export const META_ETAPA2 = "Meta: fechar pelo menos 5 croquis.";

export const TAREFAS_ETAPA2: TarefaDef[] = [
  {
    num: 1,
    titulo: "Assista à aula e estude o roteiro da Reunião Preliminar",
    descricao:
      "Assista à aula e estude o roteiro sobre a Reunião Preliminar antes de conduzir as suas.",
    tutorialUrl: "https://membros.holdingmasters.com.br/file/32g9eA3RNo",
    modelo: { nome: "08 - Script Reunião Preliminar" },
  },
  {
    num: 2,
    titulo: "Confirmar a presença do cliente com 24h de antecedência",
    descricao:
      "Envie mensagem ao cliente com 24h de antecedência pedindo que ele confirme a presença na reunião preliminar e que o responsável pela tomada de decisão também esteja presente.",
    modelo: {
      nome: "10 - Mensagens após a contratação da Sessão de Viabilidade",
    },
  },
  {
    num: 3,
    titulo: "Realize as Reuniões Preliminares",
    descricao:
      "Conduza as reuniões preliminares. Quem conduz é o Parceiro; a equipe acompanha 1 reunião e complementa se necessário.",
    info: "Meta: fechar pelo menos 5 croquis.",
  },
  {
    num: 4,
    titulo:
      "Assista ao Workshop: Sessão de Viabilidade Matadora e Croqui Estrutural",
    descricao:
      "Assista ao workshop sobre a Sessão de Viabilidade e o Croqui Estrutural.",
    tutorialUrl: "https://membros.holdingmasters.com.br/file/kqkO17jWq4",
  },
  {
    num: 5,
    titulo: "Gere a transcrição da reunião na I.A.",
    descricao:
      "Gere a transcrição da gravação da reunião preliminar na inteligência artificial.",
  },
  {
    num: 6,
    titulo: "Alimente sua pasta central com as informações do cliente",
    descricao:
      "Registre na sua pasta central as informações do cliente que está sendo acompanhado pela equipe.",
  },
];
