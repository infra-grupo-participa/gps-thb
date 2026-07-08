// Conteúdo estático da Etapa 04 — Contrato (da planilha oficial).

import type { TarefaDef } from "@/lib/etapa1";

export const TAREFAS_ETAPA4: TarefaDef[] = [
  {
    num: 1,
    titulo: "Elabore o Contrato de Honorários",
    descricao: "Elabore o contrato de honorários com o cliente.",
    modelo: {
      nome: "05 - Contrato de Prestação de Serviços.pdf",
      url: "https://drive.google.com/file/d/1T3TUF2c-SVvuYj3uHPnq8IaWRUA4k9pT/view?usp=drive_link",
    },
  },
  {
    num: 2,
    titulo: "Elabore o Cronograma de Entrega da Holding",
    descricao: "Elabore o cronograma de entrega da holding.",
    modelo: {
      nome: "Cronograma - Etapas da Holding.pdf",
      url: "https://drive.google.com/file/d/1gGIsP8c7WN48x_cv0FUhsliv9JhMC9vI/view?usp=drive_link",
    },
  },
  {
    num: 3,
    titulo: "Fazer os Certificados Digitais das pessoas físicas (se necessário)",
    descricao:
      "Providencie os certificados digitais das pessoas físicas envolvidas, quando necessário.",
    info: "Cada sócio (membros da família) deve ter certificado digital E-CPF (A1 ou A3) para assinar contratos sociais e alterações na Junta. Recomenda-se o modelo A1 (arquivo), que permite assinatura remota. Em algumas Juntas Comerciais é possível assinar via Gov.br — confira antes de iniciar.",
  },
];
