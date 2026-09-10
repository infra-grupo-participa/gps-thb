/**
 * Prova a MÁQUINA DE PASSOS do onboarding em todas as combinações.
 *
 * Rode:  npx tsx tmp/provas/onboarding-fluxo.mts
 *
 * O que ela garante: o diálogo NUNCA abre num passo fora da sequência
 * daquela pessoa. Quando abria, o corpo vinha vazio — e como o
 * questionário é obrigatório (sem Esc, sem clique-fora), a pessoa ficava
 * PRESA. Foi o que o Marcio viu em 10/09/2026 no caminho "captação".
 */
import {
  sequenciaDePassos,
  passoDeAbertura,
} from "../../src/components/onboarding/sequencia";

type Origem = "captacao" | "ja_tenho" | null;
type Status = "nao_iniciado" | "em_andamento" | "concluido";

/** Passos que têm bloco de render em `index.tsx`. */
const RENDERIZA = new Set([0, 1, 2, 3, 4, 5, 6]);

let casos = 0;
let falhas = 0;

for (const precisaTrocarSenha of [true, false])
  for (const origem of [null, "captacao", "ja_tenho"] as Origem[])
    for (const status of [
      "nao_iniciado",
      "em_andamento",
      "concluido",
    ] as Status[])
      for (let passoAtual = 0; passoAtual <= 8; passoAtual++) {
        const soSenha = status === "concluido" && precisaTrocarSenha;
        const seq = sequenciaDePassos({
          teveSenhaNaAbertura: precisaTrocarSenha,
          origem,
          soSenha,
        });
        const p = passoDeAbertura({
          precisaTrocarSenha,
          status,
          passoAtual,
          origem,
          soSenha,
        });
        casos++;

        const ruim: string[] = [];
        if (!seq.includes(p)) ruim.push(`passo ${p} FORA de [${seq}]`);
        if (!RENDERIZA.has(p)) ruim.push(`passo ${p} não renderiza nada`);

        if (ruim.length > 0) {
          falhas++;
          if (falhas <= 8) {
            console.log(
              `FALHA senha=${precisaTrocarSenha} origem=${origem} ` +
                `status=${status} passoAtual=${passoAtual}: ${ruim.join(" | ")}`,
            );
          }
        }
      }

console.log(`\n${casos} combinações · ${falhas} falhas`);
process.exit(falhas > 0 ? 1 : 0);
