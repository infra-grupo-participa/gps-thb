import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { GradeHorarios } from "@/components/sessoes/grade-horarios";
import { MinhaSessao } from "@/components/sessoes/minha-sessao";
import { SemHorario } from "@/components/sessoes/sem-horario";
import { getClienteElegivel } from "@/components/sessoes/elegibilidade";
import { PageHeader } from "@/components/ui/page-header";
import { Secao } from "@/components/ui/secao";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getTutoriaisAtivo } from "@/lib/data";
import { getNomesDeClientes } from "@/lib/data/clientes";
import {
  getHorariosLivres,
  getSessoesDoAmbiente,
  getTiposDeSessaoAtivos,
} from "@/lib/data/sessoes";
import { logErro } from "@/lib/log";
import { navDoAluno, navFixoDoAluno } from "@/lib/nav";
import type { SessaoAgendamento, SessaoTipo } from "@/lib/sessoes-tipos";
import { createClient } from "@/lib/supabase/server";

/**
 * `/sessoes` — o aluno marca a sessão com a equipe jurídica (FATIA 4).
 *
 * PRD: `docs/specs/2026-09-22-agenda-sessoes-equipe-PRD.md` (§5.4 · §7.1).
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe" removido em 10/08/2026 e
 * reconstruído por engano em 05/08. Aquela decisão foi REVOGADA pelo Marcio
 * em 22/09/2026 — *"sim, revoga a decisão de 10/08 — agora a disponibilidade
 * parte delas"* — e a revogação autorizou `gps.sessao_*`, e SÓ isso. As
 * tabelas `gps.reuniao_*` e `gps.agenda` seguem órfãs e PROIBIDAS; nada nesta
 * rota as toca.
 *
 * O que mudou e justifica existir de novo: a disponibilidade agora **parte
 * das doutoras**. O aluno só escolhe dentro do que a equipe já prometeu, em
 * vez de propor uma data e esperar um aceite que não vinha.
 *
 * 🔴 SEM DATE-PICKER (§7.1, palavras do Marcio): *"não tem que exibir uma
 * data para ele escolher, tem que exibir as opções de horário"*.
 *
 * 🔴 O ESTADO VAZIO É O CASO COMUM, não a exceção: 34 elegíveis para 4 blocos
 * por semana (medido, §9-ter B3). Ver `sem-horario.tsx`.
 */

export const metadata = { title: "Sessões com a equipe" };

/**
 * A janela que a grade cobre, em semanas.
 *
 * 🔑 É o DEFAULT da RPC (`v_ate := v_de + 56`, ou seja 8 semanas) escrito aqui
 * só para a FRASE do estado vazio poder dizer a verdade: "a equipe não tem
 * horário nas próximas 8 semanas" só é honesto se 8 for o que foi realmente
 * consultado. A página não passa `p_de`/`p_ate` — quem decide a janela
 * continua sendo o banco, e este número acompanha aquele default.
 *
 * ⚠️ NÃO é duração de bloco. Nenhum `150` e nenhum "2h30" existe nesta fatia:
 * a duração vem sempre de `duracao_min` (§5.4).
 */
const SEMANAS_DA_JANELA = 8;

/**
 * O DISC dos clientes que aparecem nesta tela, numa consulta só (FATIA E).
 *
 * 🔴 SALDO DE QUERIES DA FEATURE: ZERO (PRD §5.4). Esta leitura **substitui**
 * `getNomesDeClientes` — é a mesma tabela, a mesma cláusula `in`, o mesmo
 * conjunto de ids; só traz 4 colunas a mais. Acrescentar uma consulta só para
 * o DISC reprovaria no critério de otimização.
 *
 * 🔴 Lido AO VIVO, não do `briefing_snapshot` (PRD §2.2). As outras 4 fontes
 * do briefing respondem *"o que se sabia quando marcamos"*; o DISC responde
 * *"quem é essa pessoa"* — atributo estável do cliente. Congelado, ele
 * mostraria vazio para sempre nos 27 de 34 favoritos que ainda não têm a
 * letra, mesmo depois de alguém preencher: a tela saberia menos que o banco.
 *
 * 🔴 ERRO NÃO VIRA MAPA VAZIO SILENCIOSO. Falha de leitura e "não preenchido"
 * são fatos diferentes; devolver `null` para tudo faria o card afirmar
 * "Perfil DISC ainda não informado" sobre 127 clientes que TÊM a letra. É a
 * mesma mentira que este portal já pagou caro em 16/09. Quem consome trata
 * `null` escondendo o bloco inteiro.
 *
 * ⚠️ A RLS de `gps.etapa1_clientes` continua decidindo quais linhas voltam —
 * esta função não amplia acesso nenhum.
 */
async function getDiscDosClientes(clienteIds: string[]): Promise<{
  porCliente: Map<string, DiscDoCliente>;
  falhou: boolean;
}> {
  const ids = [...new Set(clienteIds)].filter(Boolean);
  if (ids.length === 0) return { porCliente: new Map(), falhou: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    // Colunas explícitas: `src/lib/data` não tem `select("*")` e o egress do
    // Supabase é teto DA ORGANIZAÇÃO, dividido com o `sip`. Os 3 campos ricos
    // vão até 2.000 caracteres cada — só se pedem onde a tela os mostra.
    .select(
      "id, nome, perfil_disc, disc_consciencia, disc_gatilhos, disc_relacionamento",
    )
    .in("id", ids);

  if (error) {
    logErro("getDiscDosClientes", error, { clientes: ids.length });
    return { porCliente: new Map(), falhou: true };
  }

  const porCliente = new Map<string, DiscDoCliente>();
  for (const linha of (data ?? []) as Record<string, unknown>[]) {
    const id = linha.id as string;
    porCliente.set(id, {
      nome: (linha.nome as string | null) ?? null,
      perfil_disc: (linha.perfil_disc as string | null) ?? null,
      disc_consciencia: (linha.disc_consciencia as string | null) ?? null,
      disc_gatilhos: (linha.disc_gatilhos as string | null) ?? null,
      disc_relacionamento: (linha.disc_relacionamento as string | null) ?? null,
    });
  }
  return { porCliente, falhou: false };
}

/** O que a tela precisa saber do cliente de uma sessão marcada. */
interface DiscDoCliente {
  nome: string | null;
  perfil_disc: string | null;
  disc_consciencia: string | null;
  disc_gatilhos: string | null;
  disc_relacionamento: string | null;
}

/**
 * O PAPEL de quem colou o link de cada sessão viva
 * (`gps.sessao_agendamentos.link_por_equipe`, coluna da `…296`).
 *
 * 🔴 É esta coluna, não `link_definido_por`, que decide a precedência P3 na
 * tela. O comentário da coluna na `…296` explica por quê: o papel é congelado
 * no ato da escrita, então não muda retroativamente quando um cargo muda em
 * `public.perfis`, e continua respondendo depois que o login de quem colou é
 * apagado (`link_definido_por` é `on delete set null`).
 *
 * Consulta SEPARADA e mínima, por uma razão declarada: `getSessoesDoAmbiente`
 * vive em `src/lib/data/sessoes.ts`, que é da **fatia 3** e não desta — dois
 * agentes no mesmo arquivo não geram conflito no git, geram dívida de commit.
 * Quando a coluna entrar em `COLUNAS_AGENDAMENTO`, esta função sai inteira e
 * o valor passa a vir junto da sessão.
 *
 * Custo: uma ida ao PostgREST por abertura de `/sessoes`, sobre no máximo
 * 2 ids (o índice `sessao_aluno_tipo_viva` garante 1 sessão viva por tipo, e
 * o catálogo tem 2 linhas por desenho). Não cresce com a base.
 *
 * 🔴 Erro devolve mapa VAZIO, e a tela lê a ausência como "não é da equipe" —
 * o parceiro tenta e, se a RPC recusar, lê a frase dela. O contrário (assumir
 * "é da equipe" numa falha de leitura) esconderia o botão de quem tem direito
 * a ele, sem nada na tela explicando por quê.
 */
async function getPapelDoLink(
  agendamentoIds: string[],
): Promise<Map<string, boolean | null>> {
  const ids = [...new Set(agendamentoIds)].filter(Boolean);
  if (ids.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("sessao_agendamentos")
    .select("id, link_por_equipe")
    .in("id", ids);

  if (error) {
    logErro("getPapelDoLink", error, { sessoes: ids.length });
    return new Map();
  }

  return new Map(
    ((data ?? []) as { id: string; link_por_equipe: boolean | null }[]).map(
      (l) => [l.id, l.link_por_equipe ?? null],
    ),
  );
}

export default async function SessoesPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const alunoId = ctx.alunoId;

  const [aluno, tutoriaisAtivo, tipos, sessoes] = await Promise.all([
    getAlunoById(ctx.membroAlunoId ?? alunoId),
    getTutoriaisAtivo(),
    getTiposDeSessaoAtivos(),
    // Só as VIVAS: o histórico de canceladas/realizadas é assunto da tela da
    // equipe (fatia 5). Aqui o aluno decide o que fazer agora.
    getSessoesDoAmbiente({ estados: ["agendado"] }),
  ]);

  // Uma consulta de elegibilidade + uma de grade POR TIPO (hoje 2). Não é
  // N+1 por tela: é N por CATÁLOGO, e o catálogo tem 2 linhas por desenho
  // (§6.1). As chamadas saem em paralelo, não em sequência.
  const blocos = await Promise.all(
    tipos.map(async (tipo) => {
      const jaMarcada = sessoes.find((s) => s.tipo_id === tipo.id) ?? null;

      // 🔑 Se já existe sessão viva deste tipo, NÃO se pede a grade. O índice
      // `sessao_aluno_tipo_viva` recusaria a segunda de qualquer forma
      // (23505, "Você já tem uma <tipo> marcada"), então oferecer a lista
      // seria oferecer botões que só existem para falhar. Uma ida ao banco a
      // menos, e uma promessa a menos.
      if (jaMarcada) {
        return { tipo, jaMarcada, elegivel: null, horarios: [], erro: undefined };
      }

      const [elegibilidade, grade] = await Promise.all([
        getClienteElegivel(alunoId, tipo.id),
        getHorariosLivres({ tipoId: tipo.id }),
      ]);

      return {
        tipo,
        jaMarcada: null,
        elegivel: elegibilidade,
        horarios: grade.horarios,
        erro: grade.erro,
      };
    }),
  );

  // O nome do cliente aparece na confirmação e na ficha da sessão marcada —
  // é sobre ELE que a sessão acontece, e confirmar um compromisso de 2h30 sem
  // saber sobre quem é seria assinar em branco. Um `Set` para não buscar o
  // mesmo cliente duas vezes quando os dois tipos apontam para o favorito.
  const idsDeCliente = new Set<string>();
  for (const b of blocos) {
    if (b.jaMarcada) idsDeCliente.add(b.jaMarcada.cliente_id);
    if (b.elegivel?.clienteId) idsDeCliente.add(b.elegivel.clienteId);
  }
  // 🔑 Os clientes das SESSÕES MARCADAS saem por `getDiscDosClientes` — a
  // mesma consulta traz nome e DISC, então o card ganha 4 campos sem ganhar
  // uma ida ao banco (PRD §5.4: saldo de queries ZERO).
  //
  // Os clientes que só aparecem na GRADE (ainda sem sessão) continuam por
  // `getNomesDeClientes`: ali a tela mostra apenas o nome na confirmação, e
  // puxar 3 campos de até 2.000 caracteres para quem nem sessão tem seria
  // pagar egress por texto que ninguém lê.
  const idsComSessao = new Set(blocos.filter((b) => b.jaMarcada).map((b) => b.jaMarcada!.cliente_id));
  const idsSoNaGrade = [...idsDeCliente].filter((id) => !idsComSessao.has(id));

  const [nomesDaGrade, discDasSessoes, papelDoLink] = await Promise.all([
    getNomesDeClientes(idsSoNaGrade),
    getDiscDosClientes([...idsComSessao]),
    getPapelDoLink(blocos.filter((b) => b.jaMarcada).map((b) => b.jaMarcada!.id)),
  ]);

  // Mapa único de nomes para a tela inteira, vindo das duas leituras.
  const clientes = new Map(nomesDaGrade);
  for (const [id, c] of discDasSessoes.porCliente) {
    if (c.nome) clientes.set(id, c.nome);
  }

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Parceiro"
        navItems={navDoAluno(ctx)}
        navFixo={navFixoDoAluno("", { tutoriais: tutoriaisAtivo })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Sessões com a equipe"
          descricao="Escolha um dos horários que a equipe jurídica publicou. O horário escolhido é confirmado na hora."
          voltar={
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar ao início
            </Link>
          }
        />

        {tipos.length === 0 ? (
          // Catálogo vazio não é "sem horário": é o sistema sem tipo de sessão
          // cadastrado. Reaproveitar a frase da fila prometeria uma vaga que
          // não depende de vaga nenhuma.
          <p className="border border-borda-fina px-4 py-4 corpo-sm text-muted-foreground">
            Não há tipo de sessão disponível no momento. Se precisar falar com
            a equipe agora, abra um chamado no Suporte.
          </p>
        ) : (
          <div className="grid gap-8">
            {blocos.map((b) => (
              <BlocoDoTipo
                key={b.tipo.id}
                tipo={b.tipo}
                jaMarcada={b.jaMarcada}
                elegivel={b.elegivel}
                horarios={b.horarios}
                erro={b.erro}
                clientes={clientes}
                disc={
                  b.jaMarcada
                    ? // 🔴 Leitura falhou ⇒ `null`, e o bloco DISC some do
                      // card. Mostrar "ainda não informado" quando a consulta
                      // é que caiu afirmaria sobre o banco o que não se soube
                      // responder — 127 clientes TÊM a letra hoje.
                      discDasSessoes.falhou
                      ? null
                      : (discDasSessoes.porCliente.get(b.jaMarcada.cliente_id) ??
                        null)
                    : null
                }
                linkPorEquipe={
                  b.jaMarcada ? (papelDoLink.get(b.jaMarcada.id) ?? null) : null
                }
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

/** Uma seção por tipo de sessão (Entrevista Prévia · Reunião Preliminar). */
function BlocoDoTipo({
  tipo,
  jaMarcada,
  elegivel,
  horarios,
  erro,
  clientes,
  disc,
  linkPorEquipe,
}: {
  tipo: SessaoTipo;
  jaMarcada: SessaoAgendamento | null;
  elegivel: { clienteId: string | null; falhou: boolean } | null;
  horarios: Awaited<ReturnType<typeof getHorariosLivres>>["horarios"];
  erro?: string;
  clientes: Map<string, string>;
  /** `null` = sem sessão marcada, ou a leitura do cliente falhou. */
  disc: DiscDoCliente | null;
  linkPorEquipe: boolean | null;
}) {
  return (
    <Secao titulo={tipo.nome} nivel="h2">
      {jaMarcada ? (
        <MinhaSessao
          sessao={jaMarcada}
          tipoNome={tipo.nome}
          clienteNome={clientes.get(jaMarcada.cliente_id) ?? null}
          disc={disc}
          linkPorEquipe={linkPorEquipe}
        />
      ) : erro ? (
        // 🔴 Falha de consulta NUNCA vira "não há horário". Lista vazia por
        // erro e lista vazia por ausência são fatos diferentes, e afirmar o
        // segundo quando aconteceu o primeiro é a mentira que este portal já
        // pagou caro (a tela que dizia "não há pedido registrado" para quem
        // tinha acesso, 16/09).
        <p role="alert" className="border border-borda-fina px-4 py-4 corpo-sm text-destructive">
          {erro}
        </p>
      ) : elegivel?.falhou ? (
        <p role="alert" className="border border-borda-fina px-4 py-4 corpo-sm text-destructive">
          Não foi possível conferir se esta sessão já está liberada para você.
          Atualize a página e tente de novo.
        </p>
      ) : !elegivel?.clienteId ? (
        <SemHorario motivo="nao-elegivel" semanas={SEMANAS_DA_JANELA} />
      ) : horarios.length === 0 ? (
        <SemHorario motivo="sem-horario" semanas={SEMANAS_DA_JANELA} />
      ) : (
        <GradeHorarios
          tipo={tipo}
          horarios={horarios}
          clienteNome={clientes.get(elegivel.clienteId) ?? "seu cliente"}
        />
      )}
    </Secao>
  );
}
