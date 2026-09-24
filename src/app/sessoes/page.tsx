import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { DesfechoDaSessao } from "@/components/sessoes/desfecho-da-sessao";
import { GradeHorarios } from "@/components/sessoes/grade-horarios";
import { MinhaSessao } from "@/components/sessoes/minha-sessao";
import { PreRequisitos } from "@/components/sessoes/pre-requisitos";
import { SemHorario } from "@/components/sessoes/sem-horario";
// 🔑 A decisão do estado vazio vive num módulo PURO desde 24/09: importar
// `page.tsx` num teste arrasta `app-header` -> `server-only`, que não resolve
// fora do bundler do Next. Ver o cabeçalho de `causa-do-vazio.ts`.
import { causaDoVazio } from "@/components/sessoes/causa-do-vazio";
import type { BlocoDeTipo } from "@/components/sessoes/causa-do-vazio";
import { getClienteElegivel } from "@/components/sessoes/elegibilidade";
import { PageHeader } from "@/components/ui/page-header";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getTutoriaisAtivo } from "@/lib/data";
import { getNomesEDiscLeve } from "@/lib/data/clientes";
import { getDecisoresPendentes } from "@/lib/data/entrevista-previa";
import {
  getHorariosLivres,
  getMapaDeResponsaveis,
  getSessoesDoAmbiente,
  getTiposDeSessaoAtivos,
} from "@/lib/data/sessoes";
import { logErro } from "@/lib/log";
import { navDoAluno, navFixoDoAluno } from "@/lib/nav";
import {
  TIPO_ENTREVISTA_PREVIA,
  TIPO_REUNIAO_PRELIMINAR,
} from "@/lib/sessoes-tipos";
// `HorarioLivre` e `SessaoTipo` saíram daqui com `BlocoDeTipo`, que agora mora
// em `causa-do-vazio.ts` — a página só continua lendo `SessaoAgendamento`.
import type { SessaoAgendamento } from "@/lib/sessoes-tipos";
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

export const metadata = { title: "Suas reuniões com a equipe jurídica" };

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
  // mesma consulta traz nome e DISC, então a Zona 1 ganha a folha inteira sem
  // ganhar uma ida ao banco (PRD §5.4: saldo de queries ZERO).
  //
  // Os clientes que só aparecem na GRADE (ainda sem sessão) continuam por
  // `getNomesEDiscLeve`: ali a tela mostra apenas o nome na confirmação, e
  // puxar 3 campos de até 2.000 caracteres para quem nem sessão tem seria
  // pagar egress por texto que ninguém lê.
  const idsComSessao = new Set(blocos.filter((b) => b.jaMarcada).map((b) => b.jaMarcada!.cliente_id));
  const idsSoNaGrade = [...idsDeCliente].filter((id) => !idsComSessao.has(id));

  // 🔑 O cliente ELEGÍVEL é um só por parceiro (o favorito), então isto é
  // UMA chamada, não uma por linha. Vai no mesmo `Promise.all` — em cascata
  // custaria uma viagem a mais por abertura de tela.
  const idElegivel = blocos.find((b) => b.elegivel?.clienteId)?.elegivel?.clienteId ?? null;

  const [nomesDaGrade, discDasSessoes, papelDoLink, decisoresDoElegivel, responsaveis] =
    await Promise.all([
      // 🔑 `getNomesEDiscLeve`: nome + a LETRA do DISC, sem os 3 campos ricos
      // (até 2.000 caracteres cada). A letra é o que a Zona 1 precisa para a
      // linha "Perfil DISC", e custa ~1 byte por linha — o raciocínio de
      // egress acima continua valendo.
      getNomesEDiscLeve(idsSoNaGrade),
      getDiscDosClientes([...idsComSessao]),
      getPapelDoLink(blocos.filter((b) => b.jaMarcada).map((b) => b.jaMarcada!.id)),
      idElegivel ? getDecisoresPendentes(idElegivel) : Promise.resolve(null),
      // ═══════════════════════════════════════════════════════════════════
      // 🔴 A 5ª CONSULTA — EXCEÇÃO CONSCIENTE AO "SALDO ZERO" DO PRD §5.4
      // ═══════════════════════════════════════════════════════════════════
      // Decisão do orquestrador em 24/09, registrada aqui para ninguém a
      // desfazer por reflexo ao ler "saldo de queries: ZERO".
      //
      // O que ela compra: a linha **"Com quem"** do card da sessão marcada,
      // que é o PRD §9 D5 literal (*"a tela mostra o nome"*). Sem ela a tela
      // imprimiria uuid ou inventaria rótulo — as duas coisas que o front
      // corretamente se recusa a fazer. `responsavel_nome` NÃO é coluna de
      // `sessao_agendamentos` (seria desnormalizar `public.perfis` e ter duas
      // verdades sobre o mesmo nome), e o aluno não alcança `perfis`: a
      // policy `gps_block_aluno` é `using (gps.aluno_atual() is null)`, então
      // TODO aluno com ambiente é bloqueado. Só esta RPC `SECURITY DEFINER`
      // chega ao nome.
      //
      // O que ela custa: **2 linhas, 0,927 ms MEDIDO** na `…292` (`Seq Scan`
      // aceito e justificado lá: a tabela é pequena por natureza, e o índice
      // custaria escrita em todo agendamento para servir 1 ms que roda uma
      // vez por tela). Não cresce com a base. Sai no mesmo `Promise.all`, em
      // paralelo — não acrescenta viagem em cascata.
      //
      // 🔑 Chamada UMA vez e casada por id em memória, nunca uma por linha de
      // agendamento (é exatamente o N+1 que o protocolo manda evitar).
      // 🔴 Erro devolve mapa VAZIO (`getMapaDeResponsaveis` já loga), e a
      // linha cai em "Equipe jurídica". Falha de leitura não vira nome
      // errado.
      getMapaDeResponsaveis(),
    ]);

  // Mapa único de nomes para a tela inteira, vindo das duas leituras.
  const clientes = new Map<string, string>();
  const letraDiscPorCliente = new Map<string, string | null>();
  for (const [id, c] of nomesDaGrade) {
    if (c.nome) clientes.set(id, c.nome);
    letraDiscPorCliente.set(id, c.perfil_disc);
  }
  for (const [id, c] of discDasSessoes.porCliente) {
    if (c.nome) clientes.set(id, c.nome);
    letraDiscPorCliente.set(id, c.perfil_disc);
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
          titulo="Suas reuniões com a equipe jurídica"
          voltar={
            <Link
              href="/"
              // 🔴 `inline-flex items-center min-h-11`: como `inline` puro, o
              // link media 117×17px no celular e reprovava o alvo tocável do
              // WCAG 2.5.8 (mínimo 24×24). Achado pela suíte E2E no Pixel 7 —
              // de forma INTERMITENTE, porque só aparece depois de a página
              // rolar. `tsc` e `build` nunca veriam; é geometria, e geometria
              // só se prova em navegador que pinta.
              // ⚠️ O mesmo link existe com esta classe em `/etapa/[etapa]` e
              // nos espelhos do admin — defeito pré-existente, não corrigido
              // aqui para o diff não passar por telas fora desta feature.
              className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar ao início
            </Link>
          }
        />

        <CorpoSessoes
          blocos={blocos}
          clientes={clientes}
          letraDiscPorCliente={letraDiscPorCliente}
          idElegivel={idElegivel}
          decisoresDoElegivel={decisoresDoElegivel}
          discDasSessoes={discDasSessoes}
          papelDoLink={papelDoLink}
          responsaveis={responsaveis}
          sessoes={sessoes}
        />
      </main>
    </>
  );
}

// O tipo continua alcançável por quem já importava daqui.
export type { BlocoDeTipo } from "@/components/sessoes/causa-do-vazio";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CORPO DA TELA — TRÊS ZONAS, NA ORDEM EM QUE A PERGUNTA APARECE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Até 24/09 a tela era `blocos.map(<Secao titulo={tipo.nome}>)`: uma seção por
 * TIPO DE CATÁLOGO, na ordem do `order by id` do banco. O parceiro lia dois
 * blocos com a mesma cara e tinha de descobrir sozinho qual deles pedia ação —
 * e o que pedia ação podia ser o segundo. A tela estava organizada pelo
 * modelo de dados, não pela pergunta de quem abre.
 *
 * Agora ela responde três perguntas, nesta ordem:
 *
 *   1. **Seu cliente e o que falta** — sempre, inclusive sem horário nenhum.
 *      É a única zona acionável para a maioria (34 elegíveis / 4 blocos por
 *      semana, medido em 22/09).
 *   2. **A sua reunião** — ordenada por ESTADO, não por id de catálogo:
 *      marcada → com horário para escolher → sem horário. O que exige ação
 *      vem primeiro.
 *   3. **O que acontece depois** — só quando há desfecho.
 *
 * 🔴 ZERO CONSULTA NOVA NESTA REORDENAÇÃO. Todas as três zonas leem o MESMO
 * array `blocos` que a página já montou; o `sort` é em memória, sobre 2
 * elementos. Nenhum componente daqui para baixo tem hook, estado ou `fetch` —
 * a única exceção continua sendo `MinhaSessao`/`GradeHorarios`, que são
 * `"use client"` porque ESCREVEM (agendar, cancelar, colar link), e recebem
 * tudo por prop.
 *
 * 🔑 EXPORTADO de propósito: é o que permite medir as 3 zonas num harness com
 * dados sintéticos, sem sessão de verdade. O `page` acima só resolve dados e
 * chama isto.
 */
export function CorpoSessoes({
  blocos,
  clientes,
  letraDiscPorCliente,
  idElegivel,
  decisoresDoElegivel,
  discDasSessoes,
  papelDoLink,
  responsaveis,
  sessoes,
}: {
  blocos: BlocoDeTipo[];
  clientes: Map<string, string>;
  letraDiscPorCliente: Map<string, string | null>;
  idElegivel: string | null;
  decisoresDoElegivel: Awaited<ReturnType<typeof getDecisoresPendentes>>;
  discDasSessoes: { porCliente: Map<string, DiscDoCliente>; falhou: boolean };
  papelDoLink: Map<string, boolean | null>;
  responsaveis: Map<string, string | null>;
  /** As sessões VIVAS do ambiente — a origem da derivação da Entrevista. */
  sessoes: SessaoAgendamento[];
}) {
  if (blocos.length === 0) {
    // Catálogo vazio não é "sem horário": é o sistema sem tipo de sessão
    // cadastrado. Reaproveitar a frase da fila prometeria uma vaga que não
    // depende de vaga nenhuma.
    return (
      <p className="border border-borda-fina px-4 py-4 corpo-sm text-muted-foreground">
        A equipe ainda não abriu nenhuma reunião para marcar. Se precisar falar
        com ela agora, abra um chamado no Suporte.
      </p>
    );
  }

  // ── ZONA 1: o que a tela sabe do CLIENTE ────────────────────────────────
  // O cliente é um só (o favorito), então estas leituras são do parceiro, não
  // de um tipo de sessão. Onde não há elegível, o id da sessão marcada serve
  // — é o mesmo cliente, por definição do índice `sessao_aluno_tipo_viva`.
  const clienteDaZona1 =
    idElegivel ?? blocos.find((b) => b.jaMarcada)?.jaMarcada?.cliente_id ?? null;

  // 🔴 `falhou` só quando NENHUM tipo conseguiu responder e nenhum cliente
  // apareceu por outro caminho. Um tipo que falhou enquanto o outro devolveu
  // o favorito não é "não deu para conferir": a resposta chegou.
  const elegibilidadeFalhou =
    clienteDaZona1 === null && blocos.some((b) => b.elegivel?.falhou);

  // 🔑 A ENTREVISTA PRÉVIA — sem consulta nova (ver `pre-requisitos`).
  //
  // 🔴 OS DOIS FATOS DESCEM SEPARADOS, e é essa a correção de 24/09. Até aqui
  // eles eram somados num `temEntrevista: boolean` (`sessoes.some(tipo 1) ||
  // letra`), e a Zona 1 afirmava que a conversa tinha ocorrido para uma entrevista
  // apenas MARCADA: `getSessoesDoAmbiente({ estados: ["agendado"] })` devolve
  // só sessões VIVAS, isto é, FUTURAS. Quem separa os fatos e escolhe o texto
  // é `estadoDaEntrevista`, função pura em `pre-requisitos.tsx`.
  const letraDoCliente = clienteDaZona1
    ? letraDiscPorCliente.get(clienteDaZona1)
    : undefined;
  const entrevistaViva =
    sessoes.find((s) => s.tipo_id === TIPO_ENTREVISTA_PREVIA) ?? null;

  // A folha do DISC só existe com os 3 campos ricos, que só vêm de
  // `getDiscDosClientes` (clientes COM sessão). Leitura falhada ⇒ `null`, e a
  // folha some: "ainda não informado" quando a consulta é que caiu afirmaria
  // sobre o banco o que não se soube responder.
  const discDoCliente =
    clienteDaZona1 && !discDasSessoes.falhou
      ? (discDasSessoes.porCliente.get(clienteDaZona1) ?? null)
      : null;

  // 🔴 A linha do DISC só quando a REUNIÃO PRELIMINAR é o que está em jogo.
  // Na Entrevista Prévia o DISC ainda não existe por definição — é ela que o
  // gera. Cobrar a letra de quem vai fazer a entrevista seria cobrar o
  // resultado antes da causa.
  const preliminarPertinente = blocos.some(
    (b) => b.tipo.id === TIPO_REUNIAO_PRELIMINAR,
  );

  // ── ZONA 2: ordem por ESTADO, sobre o array já carregado ────────────────
  // 🔑 `sort` em memória sobre 2 elementos. Zero consulta, zero rede.
  const ordenados = [...blocos].sort((a, b) => pesoDoBloco(a) - pesoDoBloco(b));

  // 🔴 UM `SemHorario` SÓ QUANDO OS DOIS TIPOS TÊM A MESMA CAUSA. Repetir a
  // mesma frase ("a equipe não tem horário nas próximas 8 semanas") duas vezes
  // seguidas, com títulos diferentes em cima, faz a tela parecer quebrada — e
  // faz o parceiro procurar a diferença entre dois parágrafos idênticos.
  // A fusão só vale se TODOS os blocos estiverem vazios PELA MESMA razão.
  //
  // 🔴 `etapa-fechada` NUNCA FUNDE, e isto não é exceção arbitrária (24/09).
  // As outras duas causas produzem UMA frase idêntica para qualquer tipo ("a
  // equipe não tem horário nas próximas 8 semanas", "escolha o cliente") — por
  // isso repeti-las lado a lado parecia tela quebrada. `etapa-fechada` é o
  // contrário: a frase nomeia a ETAPA daquele tipo (`sessao_tipos.etapa_id`,
  // 1 para a Entrevista e 2 para a Preliminar), então os dois blocos dizem
  // coisas DIFERENTES. Fundi-los obrigaria a tela a escolher um número de
  // etapa para valer pelos dois — que é exatamente o tipo de invenção que este
  // conserto está desfazendo.
  const causas = ordenados.map((b) => causaDoVazio(b, clienteDaZona1 != null));
  const causaUnica =
    causas.length > 1 &&
    causas[0] !== null &&
    causas[0] !== "etapa-fechada" &&
    causas.every((c) => c === causas[0])
      ? causas[0]
      : null;

  // ── ZONA 3: só quando há desfecho ───────────────────────────────────────
  // `DesfechoDaSessao` já devolve `null` em `agendado`; o filtro aqui é para
  // a ZONA inteira (cabeçalho incluído) não aparecer vazia. Hoje esta rota só
  // lista `agendado`, então a zona normalmente não existe — e é correto: uma
  // seção "O que acontece depois" sobre nada seria enfeite.
  const comDesfecho = ordenados.filter(
    (b) => b.jaMarcada != null && b.jaMarcada.estado !== "agendado",
  );

  return (
    <div className="grid gap-8">
      <PreRequisitos
        clienteId={clienteDaZona1}
        clienteNome={clienteDaZona1 ? (clientes.get(clienteDaZona1) ?? null) : null}
        elegibilidadeFalhou={elegibilidadeFalhou}
        letraDisc={letraDoCliente}
        decisores={decisoresDoElegivel}
        entrevistaViva={entrevistaViva}
        mostrarDisc={preliminarPertinente}
        disc={discDoCliente}
      />

      <section aria-labelledby="zona-reuniao">
        <h2 id="zona-reuniao" className="font-heading titulo-h2 text-foreground">
          A sua reunião
        </h2>

        <div className="mt-4 grid gap-6">
          {causaUnica ? (
            // Os dois tipos, a mesma causa: uma explicação só, sem título de
            // tipo em cima — a causa não é de um tipo, é da situação.
            <SemHorario
              motivo={causaUnica}
              semanas={SEMANAS_DA_JANELA}
              href={clienteDaZona1 ? `/clientes/${clienteDaZona1}/entrevista` : null}
            />
          ) : (
            ordenados.map((b) => (
              <BlocoDoTipo
                key={b.tipo.id}
                bloco={b}
                clientes={clientes}
                clienteDaZona1={clienteDaZona1}
                temCliente={clienteDaZona1 != null}
                responsavelNome={
                  b.jaMarcada
                    ? (responsaveis.get(b.jaMarcada.responsavel_id) ?? null)
                    : null
                }
                linkPorEquipe={
                  b.jaMarcada ? (papelDoLink.get(b.jaMarcada.id) ?? null) : null
                }
              />
            ))
          )}
        </div>
      </section>

      {comDesfecho.length > 0 ? (
        <section aria-labelledby="zona-depois">
          <h2 id="zona-depois" className="font-heading titulo-h2 text-foreground">
            O que acontece depois
          </h2>
          {/* 🔴 SEM O TEXTO DO RESUMO (P4/LGPD). O parceiro vê QUE houve
              resumo e QUANDO, nunca o CONTEÚDO — quem lê o texto passa por
              `gps.sessao_resumo_ler`, que recusa o aluno com 42501. Não
              acrescentar busca desse texto aqui. */}
          <dl className="mt-4 divide-y divide-borda-fina border border-borda-fina">
            {comDesfecho.map((b) => (
              <DesfechoDaSessao key={b.tipo.id} sessao={b.jaMarcada!} />
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

/**
 * ORDEM POR ESTADO, não por id de catálogo: **marcada → com horário → sem
 * horário**. O que exige ação do parceiro vem primeiro; o que só pede espera
 * vai para o fim.
 *
 * ⚠️ `erro` entra junto do "com horário" (peso 1) de propósito: é uma coisa
 * que pede atenção agora ("atualize a página"), não um estado de espera. Pôr
 * uma falha de leitura no fim da tela é o mesmo que escondê-la.
 */
function pesoDoBloco(b: BlocoDeTipo): number {
  if (b.jaMarcada) return 0;
  if (b.erro || b.elegivel?.falhou) return 1;
  if (b.horarios.length > 0) return 1;
  return 2;
}

/** Um tipo de sessão dentro da Zona 2 — marcada, com grade, ou explicando o vazio. */
function BlocoDoTipo({
  bloco,
  clientes,
  clienteDaZona1,
  temCliente,
  responsavelNome,
  linkPorEquipe,
}: {
  bloco: BlocoDeTipo;
  clientes: Map<string, string>;
  clienteDaZona1: string | null;
  temCliente: boolean;
  responsavelNome: string | null;
  linkPorEquipe: boolean | null;
}) {
  const { tipo, jaMarcada, elegivel, horarios, erro } = bloco;

  if (jaMarcada) {
    // 🔑 CARD ÚNICO, sem cabeçalho de seção próprio: a Zona 2 já tem o
    // `<h2>`, e um `<h3>` repetindo "Sua Entrevista Prévia está marcada"
    // acima de um card que abre com "Sessão: Entrevista Prévia" é a mesma
    // frase duas vezes em 40 px.
    return (
      <MinhaSessao
        sessao={jaMarcada}
        tipoNome={tipo.nome}
        clienteNome={clientes.get(jaMarcada.cliente_id) ?? null}
        responsavelNome={responsavelNome}
        linkPorEquipe={linkPorEquipe}
      />
    );
  }

  if (erro) {
    // 🔴 Falha de consulta NUNCA vira "não há horário". Lista vazia por erro e
    // lista vazia por ausência são fatos diferentes, e afirmar o segundo
    // quando aconteceu o primeiro é a mentira que este portal já pagou caro (a
    // tela que dizia "não há pedido registrado" para quem tinha acesso, 16/09).
    return (
      <p role="alert" className="border border-borda-fina px-4 py-4 corpo-sm text-destructive">
        {erro}
      </p>
    );
  }

  if (elegivel?.falhou) {
    return (
      <p role="alert" className="border border-borda-fina px-4 py-4 corpo-sm text-destructive">
        Não deu para conferir agora se você já pode marcar esta reunião.
        Atualize a página e tente de novo.
      </p>
    );
  }

  const causa = causaDoVazio(bloco, temCliente);
  if (causa) {
    return (
      <div>
        <h3 className="font-heading corpo font-semibold text-foreground">
          {tipo.nome}
        </h3>
        <div className="mt-2">
          <SemHorario
            motivo={causa}
            semanas={SEMANAS_DA_JANELA}
            href={clienteDaZona1 ? `/clientes/${clienteDaZona1}/entrevista` : null}
            // 🔑 DADO, nunca literal: a frase de `etapa-fechada` nomeia o tipo
            // e a ETAPA dele. `etapa_id` vem de `gps.sessao_tipos` (1 para a
            // Entrevista, 2 para a Preliminar — `…292:139-140`), e ajustar é
            // UPDATE de uma linha, sem deploy. Escrever "Etapa 02" no
            // componente faria o bloco da Entrevista mentir a etapa.
            nomeDoTipo={tipo.nome}
            etapaDoTipo={tipo.etapa_id}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 🔴 O TÍTULO E A INSTRUÇÃO VOLTAM AQUI. A fatia 1 tirou "Escolha um
          horário" do `PageHeader` — e com razão: lá ela falava por uma tela
          que também mostra sessão marcada e pendências, onde não há horário
          nenhum a escolher. Colada na grade, a instrução volta a ser verdade,
          e só aparece quando de fato há o que escolher. */}
      <h3 className="font-heading corpo font-semibold text-foreground">
        Marque sua {tipo.nome}
      </h3>
      <p className="mt-0.5 corpo-sm text-muted-foreground">Escolha um horário</p>
      <div className="mt-2">
        <GradeHorarios
          tipo={tipo}
          horarios={horarios}
          clienteNome={
            (elegivel?.clienteId ? clientes.get(elegivel.clienteId) : null) ??
            "seu cliente"
          }
        />
      </div>
    </div>
  );
}
