import { CircleCheck } from "lucide-react";

/**
 * O terceiro estado do lugar mais forte da home: **nada pendente**.
 *
 * `proximoPasso()` devolve `null` quando não há tarefa pendente nas etapas
 * liberadas — e até aqui a home simplesmente NÃO renderizava nada: a peça mais
 * proeminente da tela virava um buraco entre o hero e a jornada, e o aluno que
 * fez tudo o que podia fazer lia isso como "sumiu alguma coisa".
 *
 * ⚠️ Não é `<a>` nem tem botão: não existe ação a oferecer. Por isso ele repete
 * a FORMA do `ProximoPassoCard` (48 px de ícone, `rotulo` + `titulo-h2` +
 * `corpo-sm`, mesma elevação) mas não o afeto de clique — hover que se move em
 * algo que não navega é promessa falsa.
 *
 * A frase da expectativa é a única verdade disponível: `gps.etapas` não tem
 * campo de previsão, então não há data a prometer — só QUEM abre a próxima
 * etapa (a turma, pelo interruptor global; ou a equipe, pelo override do
 * ambiente).
 */
export function TudoEmDiaCard({
  proximaEtapa,
}: {
  /** A próxima etapa ainda bloqueada, se houver. `null` = as 6 já abriram. */
  proximaEtapa: { ordem: number; nome: string } | null;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-sucesso-foreground/25 bg-card px-5 py-5 shadow-(--shadow-raised)">
      <div
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sucesso text-sucesso-foreground"
      >
        <CircleCheck className="size-6" />
      </div>
      <div className="min-w-40 flex-1">
        <div className="rotulo text-accent-foreground">Nada pendente agora</div>
        <div className="font-heading titulo-h2 text-balance">
          Tudo em dia nas etapas liberadas
        </div>
        <div className="corpo-sm text-muted-foreground">
          {proximaEtapa ? (
            <>
              Você concluiu todos os passos que estão abertos para você. A
              próxima é a Etapa {String(proximaEtapa.ordem).padStart(2, "0")} —{" "}
              {proximaEtapa.nome}: ela libera conforme sua turma avança, ou
              quando a equipe abrir para você.
            </>
          ) : (
            <>
              Você concluiu todos os passos das etapas do programa. Se a equipe
              abrir algo novo, ele aparece aqui.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
