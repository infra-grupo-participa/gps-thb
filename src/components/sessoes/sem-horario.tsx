import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

/**
 * 🔴 O ESTADO VAZIO — o caso MAIS COMUM desta tela, não a exceção.
 *
 * MEDIDO no banco em 22/09/2026 (PRD §9-ter B3): **34 alunos elegíveis para 4
 * blocos por semana**. A fila é estrutural: a maioria vai abrir esta tela e
 * não ver horário nenhum. Uma grade vazia — ou pior, um calendário com todos
 * os dias apagados — faria o aluno concluir que o sistema está quebrado,
 * exatamente o defeito que o PRD §7.1 proíbe em letras garrafais: *"estado
 * vazio honesto, **nunca um calendário vazio**"*.
 *
 * 🔴 E SÃO DUAS COISAS DIFERENTES, com saídas diferentes:
 *
 *   `naoElegivel`  → "você ainda não pode agendar". A RPC devolve LISTA VAZIA
 *                    para quem não é elegível (não erro — §7.1), então sem
 *                    esta distinção o aluno sem cliente favoritado leria "a
 *                    equipe não tem horário" e ficaria esperando por uma vaga
 *                    que nunca destravaria nada. A saída dele é a aba
 *                    Clientes, e ela vai como LINK.
 *   `semHorario`   → é elegível, e de fato não há bloco publicado na janela.
 *                    A saída é voltar depois; não há botão que resolva, e
 *                    inventar um seria pior.
 *
 * A distinção vem de `gps.sessao_pode_agendar`, chamada pela página — não se
 * adivinha por "a lista veio vazia".
 *
 * Denso e chapado: um bloco com borda fina e texto. Sem `EmptyState` (que é
 * card elevado com ícone em círculo), sem ilustração, sem cor de alerta —
 * não há nada errado acontecendo, é só a verdade do momento.
 */
export function SemHorario({
  motivo,
  semanas,
}: {
  motivo: "nao-elegivel" | "sem-horario";
  /**
   * Quantas semanas a grade cobriu — vem da janela que a página pediu à RPC,
   * nunca de um número escrito na frase. "A equipe não tem horário nas
   * próximas N semanas" só é honesto se o N for o que foi realmente
   * consultado.
   */
  semanas: number;
}) {
  if (motivo === "nao-elegivel") {
    return (
      <div className="border border-borda-fina px-4 py-4">
        <p className="corpo font-medium text-foreground">
          Você ainda não pode marcar esta sessão.
        </p>
        <p className="mt-1 corpo-sm text-muted-foreground">
          Para marcar, é preciso ter um cliente marcado como o que a equipe
          acompanha e a etapa correspondente liberada. Se você já escolheu o
          cliente e mesmo assim está vendo esta mensagem, a etapa ainda não foi
          liberada para o seu ambiente.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/clientes"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Ir para Clientes
          </Link>
          <Link
            href="/chamados"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Falar com a equipe
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-borda-fina px-4 py-4">
      <p className="corpo font-medium text-foreground">
        A equipe não tem horário nas próximas {semanas} semanas.
      </p>
      <p className="mt-1 corpo-sm text-muted-foreground">
        Os horários são publicados pela própria equipe jurídica e são poucos
        por semana. Volte a abrir esta tela nos próximos dias — assim que um
        bloco for publicado ou liberado por um cancelamento, ele aparece aqui.
      </p>
      <div className="mt-3">
        <Link
          href="/chamados"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Falar com a equipe
        </Link>
      </div>
    </div>
  );
}
