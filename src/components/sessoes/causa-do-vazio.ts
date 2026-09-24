import type {
  HorarioLivre,
  SessaoAgendamento,
  SessaoTipo,
} from "@/lib/sessoes-tipos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A DECISÃO PURA DA ZONA 2 — "por que este bloco está vazio?"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🔑 POR QUE ESTE ARQUIVO EXISTE, E NÃO É REFATORAÇÃO GRATUITA (24/09)
 *
 * `causaDoVazio` morava em `src/app/sessoes/page.tsx`. Importar aquele módulo
 * de um teste carrega a cadeia inteira do servidor Next — medido: `page.tsx` →
 * `app-header.tsx` → `menu-de-contas.tsx` → `contas/actions.ts` →
 * `contas-do-navegador.ts` → `import "server-only"`, que **não resolve fora do
 * bundler do Next** (`Cannot find module 'server-only'`). A função que decide
 * a copy do estado vazio ficava, na prática, **impossível de testar** — e foi
 * exatamente nela que o joão achou uma causa inventada afirmando uma regra de
 * banco que não existe.
 *
 * Aqui ela é um módulo de lógica pura: nenhum `"use server"`, nenhum
 * `"use client"`, nenhum React, nenhum acesso a banco. Só tipo e `if`. É o
 * mesmo padrão de `src/components/sessoes/grade.ts` (funções puras da mesma
 * fatia, fora do JSX de propósito) e de `ordenacao.ts`/`datas-da-serie.ts`.
 *
 * ⚠️ Isto NÃO prova geometria nem pigmento. Prova a DECISÃO — qual das três
 * frases a tela escolhe. O que pinta só se prova em navegador que pinta.
 */

/** Um tipo de sessão com tudo o que a tela sabe dele. */
export interface BlocoDeTipo {
  tipo: SessaoTipo;
  jaMarcada: SessaoAgendamento | null;
  elegivel: { clienteId: string | null; falhou: boolean } | null;
  horarios: HorarioLivre[];
  erro?: string;
}

/** As causas de vazio que `SemHorario` sabe desenhar. */
export type CausaDoVazio = "nao-elegivel" | "etapa-fechada" | "sem-horario";

/**
 * A CAUSA do bloco vazio — ou `null` quando o bloco não está vazio.
 *
 * 🔴 `erro` e `falhou` devolvem `null` de propósito: falha de leitura NÃO é
 * uma das três causas de vazio, e nunca pode virar uma delas. Ela tem frase
 * própria, com `role="alert"`, em `BlocoDoTipo`. Confundir as duas é a
 * mentira de 16/09 ("não há pedido registrado" para quem tinha acesso).
 */
export function causaDoVazio(
  b: BlocoDeTipo,
  temCliente: boolean,
): CausaDoVazio | null {
  if (b.jaMarcada) return null;
  if (b.erro || b.elegivel?.falhou) return null;
  if (!b.elegivel?.clienteId) {
    // ═══════════════════════════════════════════════════════════════════
    // 🔑 A MESMA lista vazia do banco, DUAS causas diferentes — e a segunda
    // MUDOU EM 24/09, porque a anterior era INVENTADA (achado do joão).
    // ═══════════════════════════════════════════════════════════════════
    //
    // O que estava escrito aqui antes: que a RPC devolvia `null` para o tipo 2
    // "porque a Entrevista Prévia não aconteceu". **Nenhuma linha do banco diz
    // isso.** `gps.sessao_pode_agendar`
    // (`supabase/migrations/20260922000292_gps_sessao_rpcs.sql:205-330`, a
    // ÚLTIMA definição — nenhuma migration posterior a redefine) nunca lê
    // entrevista, DISC ou qualquer coisa parecida. Comentário que afirma uma
    // regra de banco inexistente é parte do defeito: convence o próximo leitor
    // a não conferir — foi exatamente o que a própria `…292` escreveu sobre um
    // comentário errado dela, em 22/09.
    //
    // Os gates REAIS que fazem a RPC devolver `null`, na ordem do corpo dela:
    //   • favorito ausente (`etapa1_clientes.acompanhado_equipe`, `…292:294`);
    //   • `gps.config.sessoes_exige_confirmacao` = 'true' + favorito não
    //     confirmado (`…292:287`) — nasce `'false'` (`…291:663`), hoje não
    //     filtra ninguém;
    //   • etapa do tipo não liberada (`gps.etapa_liberada_para`, `…292:322`).
    //     A Reunião Preliminar tem `etapa_id = 2` (`…292:140`), e só a Etapa 01
    //     está liberada (CLAUDE.md). **É este o gate de 100% dos casos hoje.**
    // (`gps.config.sessoes_exige_disc` NÃO é gate: a `…294:402` é explícita —
    // "QUEM LÊ ESTA CHAVE HOJE: ninguém".)
    //
    // 🔴 COM FAVORITO PRESENTE, A CAUSA NUNCA É "escolha o cliente". Ele já
    // escolheu, e a Zona 1 imprime "✓ Feito · Cliente — <nome>" logo acima:
    // duas frases contraditórias na mesma tela. Com favorito, o que sobrou dos
    // gates é a etapa (ou a confirmação, que a copy de `etapa-fechada` também
    // cobre ao dizer que quem libera é a equipe).
    //
    // ⚠️ A tela NÃO pergunta ao banco QUAL gate recusou — isso exigiria
    // `getEtapasLiberadasPara`, uma query nova, e a decisão do joão foi não
    // acrescentá-la. A copy honesta sem query resolve: ela nomeia a causa
    // dominante e manda falar com a equipe, que é a saída real dos três casos.
    //
    // 🔴 `temCliente` continua sendo a guarda, e vale para OS DOIS tipos agora.
    // A restrição a `TIPO_REUNIAO_PRELIMINAR` saiu: a Entrevista Prévia tem
    // `etapa_id = 1` e passa pelo MESMO gate de etapa — se um dia a Etapa 01
    // for fechada para alguém, ela cairia em "escolha o cliente" com o cliente
    // escolhido, que é o mesmo defeito do outro lado.
    if (temCliente) return "etapa-fechada";
    return "nao-elegivel";
  }
  if (b.horarios.length === 0) return "sem-horario";
  return null;
}
