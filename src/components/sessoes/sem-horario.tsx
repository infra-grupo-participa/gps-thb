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
 * 🔴 E SÃO TRÊS COISAS DIFERENTES, com saídas diferentes:
 *
 *   `nao-elegivel`    → "você ainda não escolheu o cliente". A RPC devolve
 *                       LISTA VAZIA para quem não é elegível (não erro —
 *                       §7.1), então sem esta distinção o aluno sem cliente
 *                       favoritado leria "a equipe não tem horário" e ficaria
 *                       esperando por uma vaga que nunca destravaria nada. A
 *                       saída dele é a aba Clientes, e ela vai como LINK.
 *   `etapa-fechada`   → é o mesmo `clienteId: null` do banco, mas por OUTRA
 *                       causa: o favorito EXISTE e a RPC ainda assim recusou.
 *                       Ver o bloco abaixo — a causa real é a etapa.
 *   `sem-horario`     → é elegível, e de fato não há bloco publicado na
 *                       janela. A saída é voltar depois; não há botão que
 *                       resolva, e inventar um seria pior.
 *
 * A distinção entre elegível e não elegível vem de `gps.sessao_pode_agendar`,
 * chamada pela página — não se adivinha por "a lista veio vazia".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 `etapa-fechada` SUBSTITUIU A CAUSA ANTERIOR EM 24/09 — ERA INVENTADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A causa antiga dizia *"A Reunião Preliminar acontece depois da Entrevista
 * Prévia"* e oferecia a Entrevista como o que DESTRAVA. **Nada no banco
 * condiciona o tipo 2 à Entrevista.** Achado do joão, conferido na definição
 * de `gps.sessao_pode_agendar` (`supabase/migrations/20260922000292_gps_sessao_rpcs.sql:205-330`
 * — é a ÚLTIMA definição; nenhuma migration posterior a redefine).
 *
 * Os gates REAIS da RPC, na ordem em que ela os aplica, e como a copy cobre
 * cada um:
 *
 *   1. **Permissão** (`…292:270`) — `42501` para quem não é o próprio aluno.
 *      Não chega aqui: vira erro de leitura, com `role="alert"` próprio em
 *      `page.tsx`. Nunca cai numa das três frases deste arquivo.
 *   2. **Tipo ativo** (`…292:283`) — tipo inexistente/desativado ⇒ `null`.
 *      Não chega aqui: sem linha em `sessao_tipos`, o bloco não existe na
 *      tela (`getTiposDeSessaoAtivos` não o devolve).
 *   3. **Favorito** (`…292:294`) — `etapa1_clientes.acompanhado_equipe`.
 *      Ausente ⇒ `null`. É a causa `nao-elegivel`.
 *   4. **`gps.config.sessoes_exige_confirmacao`** (`…292:287`) — quando
 *      `'true'`, exige `acompanhamento_confirmado_em`. **Nasce `'false'`**
 *      (`…291:663`) e a coluna nunca foi preenchida, então hoje não filtra
 *      ninguém. Se for ligada, o parceiro cai em `nao-elegivel` — cuja 2ª
 *      frase já diz *"se já escolheu o cliente e ainda vê esta mensagem, a
 *      equipe ainda não liberou esta etapa para você"*. Coberto.
 *   5. **Etapa liberada** (`…292:322`) — `gps.etapa_liberada_para(aluno,
 *      sessao_tipos.etapa_id)`. A Reunião Preliminar tem `etapa_id = 2`
 *      (`…292:140`) e **só a Etapa 01 está liberada** (CLAUDE.md, regra de
 *      liberação). É ESTE o gate que hoje recusa 100% dos parceiros no tipo 2,
 *      e é o que `etapa-fechada` diz.
 *
 * ⚠️ `gps.config.sessoes_exige_disc` NÃO é gate. A própria migration que a
 * criou é explícita (`20260923000294…:402`): *"QUEM LÊ ESTA CHAVE HOJE:
 * **ninguém**"* — é ponto de engate para uma trava futura. Não entra na copy:
 * anunciar uma trava que não existe é o mesmo defeito que se está corrigindo.
 *
 * 🔑 E A COPY NÃO PROMETE O QUE NÃO SABE. A tela não pergunta ao banco QUAL
 * gate recusou — `getEtapasLiberadasPara` custaria uma query nova, e a decisão
 * do joão foi não acrescentá-la. Por isso a frase nomeia a causa DOMINANTE (a
 * Etapa 02 fechada, que é a de 100% dos casos hoje) sem afirmar que é a única,
 * e a Entrevista aparece como o que ele **pode adiantar**, jamais como o que
 * destrava.
 *
 * ⚠️ NENHUM destes é `falhou`. Consulta que caiu tem frase própria com
 * `role="alert"` em `page.tsx` ("não deu para conferir agora") e NUNCA cai
 * numa das três frases daqui: afirmar "a equipe não tem horário" quando a
 * leitura é que falhou é a mentira de 16/09.
 *
 * Denso e chapado: um bloco com borda fina e texto. Sem `EmptyState` (que é
 * card elevado com ícone em círculo), sem ilustração, sem cor de alerta —
 * não há nada errado acontecendo, é só a verdade do momento.
 */
export function SemHorario({
  motivo,
  semanas,
  href,
  nomeDoTipo,
  etapaDoTipo,
}: {
  motivo: "nao-elegivel" | "etapa-fechada" | "sem-horario";
  /**
   * Quantas semanas a grade cobriu — vem da janela que a página pediu à RPC,
   * nunca de um número escrito na frase. "A equipe não tem horário nas
   * próximas N semanas" só é honesto se o N for o que foi realmente
   * consultado.
   */
  semanas: number;
  /**
   * A rota da Entrevista Prévia DESTE cliente, só para `etapa-fechada`.
   *
   * 🔴 Vem por prop e pode ser `null`: sem o `clienteId` em mãos, o link
   * apontaria para `/clientes/null/entrevista` — um 404 vestido de saída. Sem
   * ele, a linha de apoio some por inteiro (ver abaixo): oferecer "adiantar a
   * Entrevista" sem saber de qual cliente é oferecer um beco.
   */
  href?: string | null;
  /**
   * O nome do tipo que está vazio (`gps.sessao_tipos.nome`) — DADO, nunca
   * literal. A frase de `etapa-fechada` nomeia a reunião que não abriu, e a
   * `…291` é explícita: mudar o tipo é UPDATE de uma linha, sem deploy.
   */
  nomeDoTipo?: string | null;
  /**
   * `gps.sessao_tipos.etapa_id` DESTE tipo — o número que a frase imprime.
   *
   * 🔴 VEM DO BANCO, e é por isso que esta prop existe. A primeira versão
   * escrevia "Etapa 02" fixo na frase, porque hoje é a Reunião Preliminar que
   * cai aqui. Mas `causaDoVazio` devolve `etapa-fechada` para QUALQUER tipo
   * com favorito e RPC recusando — inclusive a Entrevista Prévia, que tem
   * `etapa_id = 1` (`…292:139`). Com o literal, o bloco da Entrevista diria
   * "libere a Etapa 02" sobre um gate que é da Etapa 01. Número de etapa
   * escrito à mão é a mesma classe do `150` que a `…291` proíbe.
   *
   * `null`/`undefined` = o tipo não exige etapa (valor legítimo, `…292:113`):
   * a frase cai numa redação sem número, que continua verdadeira.
   */
  etapaDoTipo?: number | null;
}) {
  if (motivo === "etapa-fechada") {
    // A Entrevista Prévia não pode se oferecer como "o que dá para adiantar"
    // dentro do próprio bloco dela — seria mandar o parceiro fazer exatamente
    // o que a tela acabou de dizer que não abriu. `etapa_id = 1` é o tipo 1.
    const ehAEntrevista = etapaDoTipo === 1;
    const rotulo = nomeDoTipo ?? "Esta reunião";
    const etapa = etapaDoTipo != null ? `a Etapa ${String(etapaDoTipo).padStart(2, "0")}` : "esta etapa";

    return (
      <div className="border border-borda-fina px-4 py-4">
        {/* 🔴 A CAUSA REAL, e só ela. O gate é
            `gps.etapa_liberada_para(aluno, sessao_tipos.etapa_id)` — para a
            Reunião Preliminar, `etapa_id = 2`, e hoje só a Etapa 01 está
            liberada. Quem destrava é a EQUIPE, não o parceiro — e a frase diz
            isso, em vez de lhe dar uma tarefa que não muda nada. */}
        <p className="corpo font-medium text-foreground">
          {rotulo} abre quando a equipe liberar {etapa} para o seu ambiente.
        </p>
        {/* 🔑 LINHA DE APOIO = O QUE ELE PODE ADIANTAR, NÃO O QUE DESTRAVA.
            "Enquanto isso" é a palavra que separa as duas coisas: a Entrevista
            é trabalho útil que ele faz hoje e que a doutora vai precisar — não
            é a chave da porta. Redigir o contrário foi a causa inventada que
            este bloco corrige. */}
        {href && !ehAEntrevista ? (
          <p className="mt-1 corpo-sm text-muted-foreground">
            Enquanto isso, você pode adiantar a Entrevista Prévia.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {href && !ehAEntrevista ? (
            <Link
              href={href}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Fazer a Entrevista Prévia
            </Link>
          ) : null}
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

  if (motivo === "nao-elegivel") {
    return (
      <div className="border border-borda-fina px-4 py-4">
        <p className="corpo font-medium text-foreground">
          Escolha o cliente que a equipe vai acompanhar.
        </p>
        <p className="mt-1 corpo-sm text-muted-foreground">
          Os horários são oferecidos para um cliente específico — o que você
          marcar na aba Clientes como o que a equipe acompanha. Se já escolheu
          o cliente e ainda vê esta mensagem, a equipe ainda não liberou esta
          etapa para você — fale com ela pelo Suporte.
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
