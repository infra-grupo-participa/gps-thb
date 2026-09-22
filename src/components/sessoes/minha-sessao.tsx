"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelarSessao } from "@/app/sessoes/actions";
import {
  definirLinkDaSessao,
  removerLinkDaSessao,
} from "@/app/sessoes/link-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import {
  DiscDoCliente,
  LinhaDaFicha as Linha,
} from "@/components/sessoes/disc-do-cliente";
import { DesfechoDaSessao } from "@/components/sessoes/desfecho-da-sessao";
import {
  formatarDuracao,
  horaDeTime,
  horaFimDeBloco,
  podeCancelarComoAluno,
  rotuloDoDia,
} from "@/components/sessoes/grade";
import type { SessaoAgendamento } from "@/lib/sessoes-tipos";

/**
 * A sessão que o ambiente JÁ tem marcada de um tipo — o DISC do cliente, o
 * link da sala e o cancelamento.
 *
 * Denso e chapado: um bloco de linhas rotuladas, sem card com sombra e sem
 * ícone. A hierarquia é posicional (dia e horário em cima, o resto abaixo).
 * O DISC entra como MAIS LINHAS da mesma lista (FATIA E do PRD
 * `docs/specs/2026-09-23-sessoes-disc-link-resumo-PRD.md`), nunca como card
 * novo — é a razão de `DiscDoCliente` devolver `<LinhaDaFicha>` solta em vez
 * de um contêiner próprio.
 *
 * 🔴 O PRAZO DE 24h É DECIDIDO NO BANCO. `podeCancelarComoAluno` só decide se
 * o BOTÃO aparece — oferecer uma ação que vai falhar é pior que não oferecer.
 * Com a página aberta desde ontem, quem recusa é `gps.sessao_cancelar`, com
 * 22023 e a frase pronta, e é ela que o aluno lê.
 *
 * ⚠️ `agora` é calculado na montagem, no cliente. Ele NÃO é fronteira (ver
 * acima) e, por ser relógio do navegador, pode estar errado — inclusive
 * adiantado de propósito. Por isso a única consequência de errar aqui é a
 * tela mostrar um botão que o banco recusa, nunca permitir um cancelamento
 * fora do prazo.
 */
export function MinhaSessao({
  sessao,
  tipoNome,
  clienteNome,
  disc,
  linkPorEquipe,
}: {
  sessao: SessaoAgendamento;
  tipoNome: string;
  clienteNome: string | null;
  /**
   * O DISC do cliente desta sessão, lido AO VIVO de `gps.etapa1_clientes` pela
   * página (o `briefing_snapshot` congelaria a resposta de "quem é essa
   * pessoa", que é atributo estável e não evento datado — PRD §2.2).
   *
   * `null` = a leitura do cliente falhou. Nesse caso o bloco inteiro não
   * aparece: afirmar "ainda não informado" quando a consulta é que caiu seria
   * a mesma mentira que este portal já pagou caro em 16/09.
   */
  disc: {
    perfil_disc: string | null;
    disc_consciencia: string | null;
    disc_gatilhos: string | null;
    disc_relacionamento: string | null;
  } | null;
  /**
   * `gps.sessao_agendamentos.link_por_equipe` — o PAPEL de quem colou o link
   * vigente, congelado no instante da escrita: `true` = equipe (admin ou a
   * responsável), `false` = parceiro, `null` = nenhum link definido por RPC.
   *
   * 🔴 É ESTA COLUNA, e não uma comparação de uuid, que diz ao parceiro se
   * ele pode trocar o link. A `…296` é explícita no comentário da coluna:
   * comparar `link_definido_por` com o próprio id dá a resposta ERRADA quando
   * quem colou foi a doutora e o login dela já não existe (`on delete set
   * null` deixa o uuid nulo), e perguntar "aquele uuid é equipe hoje?" faria
   * a precedência mudar RETROATIVAMENTE a cada troca de cargo em
   * `public.perfis`. O papel é copiado congelado, na família de `duracao_min`
   * e `briefing_snapshot`.
   *
   * ⚠️ Vem por PROP, e não por `sessao.link_por_equipe`, porque o tipo
   * `SessaoAgendamento` (`src/lib/sessoes-tipos.ts`) é da fatia 3 e **não é
   * desta fatia** — arquivo que dois agentes editam não acusa nada no git, e
   * o risco não é conflito de merge, é dívida de commit. Quando a coluna
   * entrar no tipo e em `COLUNAS_AGENDAMENTO`, esta prop some.
   */
  linkPorEquipe: boolean | null;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [cancelando, iniciar] = useTransition();

  const podeCancelar = podeCancelarComoAluno(sessao, new Date());
  const inicio = horaDeTime(sessao.hora_inicio);
  const fim = horaFimDeBloco(sessao.hora_inicio, sessao.duracao_min);

  function confirmar() {
    setErro(null);
    iniciar(async () => {
      const r = await cancelarSessao({
        agendamentoId: sessao.id,
        motivo: motivo.trim() === "" ? null : motivo,
      });
      if (!r.ok) {
        // A frase é a da RPC — inclusive a do prazo vencido, que é a única
        // que explica ao aluno o que fazer ("abra um chamado no Suporte").
        setErro(r.erro);
        return;
      }
      setAberto(false);
      setMotivo("");
      // Client Component com estado por prop: sem `router.refresh()` o card
      // continuaria dizendo "marcada" depois do cancelamento, e o horário não
      // voltaria para a grade logo abaixo.
      router.refresh();
    });
  }

  return (
    <div className="border border-borda-fina">
      <dl className="divide-y divide-borda-fina">
        <Linha rotulo="Sessão">{tipoNome}</Linha>
        <Linha rotulo="Quando">
          {rotuloDoDia(sessao.data)}, {inicio}
          {fim ? ` – ${fim}` : null}{" "}
          <span className="text-muted-foreground">
            ({formatarDuracao(sessao.duracao_min)}, bloco inteiro)
          </span>
        </Linha>
        <Linha rotulo="Cliente">
          {/* `null` não vira texto inventado: o cliente pode ter sido trocado
              pela equipe depois do agendamento. Melhor dizer que não dá para
              mostrar do que nomear a pessoa errada. */}
          {clienteNome ?? (
            <span className="text-muted-foreground">
              não foi possível carregar agora
            </span>
          )}
        </Linha>

        {/* Mais linhas da MESMA lista — não um bloco novo. Some por inteiro
            quando a leitura do cliente falhou (`disc === null`): "ainda não
            informado" seria afirmar sobre o banco o que a consulta não soube
            responder. */}
        {disc ? (
          <DiscDoCliente
            perfilDisc={disc.perfil_disc}
            consciencia={disc.disc_consciencia}
            gatilhos={disc.disc_gatilhos}
            relacionamento={disc.disc_relacionamento}
            clienteId={sessao.cliente_id}
          />
        ) : null}

        <BlocoDoLink
          sessao={sessao}
          linkPorEquipe={linkPorEquipe}
          desabilitado={cancelando}
        />

        <DesfechoDaSessao sessao={sessao} />
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borda-fina px-3 py-2">
        {podeCancelar ? (
          // Frase curta com o prazo ao lado do botão: o aluno decide com a
          // regra à vista, não depois de clicar.
          <p className="corpo-sm text-muted-foreground">
            Dá para cancelar até 24 horas antes do início.
          </p>
        ) : (
          <p className="corpo-sm text-muted-foreground">
            O prazo para cancelar sozinho terminou (é até 24 horas antes). Fale
            com a equipe pelo Suporte.
          </p>
        )}
        {podeCancelar ? (
          <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
            Cancelar sessão
          </Button>
        ) : null}
      </div>

      {erro && !aberto ? (
        <p role="alert" className="border-t border-borda-fina px-3 py-2 corpo-sm text-destructive">
          {erro}
        </p>
      ) : null}

      <DialogoConfirmacao
        aberto={aberto}
        titulo="Cancelar a sessão"
        descricao={`${tipoNome} — ${rotuloDoDia(sessao.data)}, ${inicio}`}
        /* A consequência é o que o aluno perde: o horário volta para a fila,
           e a fila é real (34 alunos elegíveis para 4 blocos por semana). */
        consequencia={
          <>
            O horário volta para a lista e pode ser pego por outro parceiro —
            não dá para desfazer. Para remarcar, você escolhe um novo horário
            entre os que ainda estiverem livres.
          </>
        }
        rotuloConfirmar="Cancelar sessão"
        rotuloConfirmando="Cancelando…"
        rotuloCancelar="Manter a sessão"
        confirmando={cancelando}
        erro={erro}
        onConfirmar={confirmar}
        onCancelar={() => {
          setAberto(false);
          setErro(null);
        }}
      >
        <label className="grid gap-1 text-left">
          <span className="rotulo text-muted-foreground">
            Motivo (opcional — a equipe vê)
          </span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={300}
            rows={2}
            className="w-full rounded-md border border-borda-forte bg-card px-2 py-1.5 corpo-sm focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </label>
      </DialogoConfirmacao>
    </div>
  );
}

/**
 * O domínio de uma URL, para mostrar ao lado do link.
 *
 * 🔴 Link de sala é CREDENCIAL DE ACESSO. Mostrar o domínio diz a quem clica
 * para onde vai antes de ir; mostrar a URL inteira derrama a credencial em
 * captura de tela, em ombro alheio e em qualquer print que circule — é a
 * mesma razão por que a trilha da RPC grava só o domínio (PRD §3 fatia D).
 *
 * `URL` levanta em string inválida. Aqui não é fronteira (o CHECK `^https://`
 * é do banco), mas a tela não pode quebrar por um valor já gravado — sem
 * domínio legível, o link aparece sem a etiqueta.
 */
function dominioDe(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * O link da sala — as linhas que o parceiro lê e o formulário com que escreve.
 *
 * 🔴 A PRECEDÊNCIA É DITA ANTES DO CLIQUE (PRD §4 P3). Os dois lados põem o
 * link; **no conflito, a equipe vence**. Se a equipe já definiu, a RPC devolve
 * 22023 com frase própria — e descobrir isso só no erro é surpresa, não
 * informação. Por isso, quando `link_definido_por` não é o usuário logado, a
 * tela diz quem colou e **não oferece** o formulário: oferecer um campo que só
 * existe para falhar é pior do que não oferecer.
 *
 * ⚠️ A comparação aqui é CORTESIA, nunca fronteira. Quem decide é
 * `gps.sessao_link_definir`, sob `for update`. Com a página aberta há 20
 * minutos, a equipe pode ter colado o link neste meio-tempo, e aí quem recusa
 * é o banco, com a frase certa.
 */
function BlocoDoLink({
  sessao,
  linkPorEquipe,
  desabilitado,
}: {
  sessao: SessaoAgendamento;
  linkPorEquipe: boolean | null;
  desabilitado: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(sessao.link_reuniao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [salvando, iniciar] = useTransition();

  const link = sessao.link_reuniao;
  // 🔴 A REGRA, e só ela: a equipe vence o parceiro. `link_por_equipe === true`
  // ⇒ a RPC recusaria tanto definir quanto REMOVER (a `…296` repete a
  // precedência nas duas, para o parceiro não contornar removendo primeiro).
  //
  // `null` com link preenchido é o agendamento anterior a esta coluna existir.
  // Tratado como NÃO-equipe: o parceiro tenta e, se a RPC recusar, lê a frase
  // dela. O contrário — bloquear na tela por um `null` — esconderia o botão de
  // quem tem direito a ele, e disso ninguém se recupera sozinho.
  const daEquipe = link != null && linkPorEquipe === true;
  /** O link vigente é do próprio parceiro — só aí faz sentido oferecer remover. */
  const meu = link != null && linkPorEquipe === false;

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const r = await definirLinkDaSessao({
        agendamentoId: sessao.id,
        link: valor,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setEditando(false);
      // Sem `router.refresh()` o bloco continuaria mostrando o link antigo (a
      // sessão vem por prop do Server Component), e a segunda submissão
      // bateria na precedência que o próprio aluno acabou de criar.
      router.refresh();
    });
  }

  function remover() {
    setErro(null);
    iniciar(async () => {
      const r = await removerLinkDaSessao({ agendamentoId: sessao.id });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setRemovendo(false);
      setValor("");
      router.refresh();
    });
  }

  return (
    <>
      <Linha rotulo="Sala">
        {link ? (
          <>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-foreground underline-offset-4 hover:underline"
            >
              Abrir a sala
            </a>{" "}
            {dominioDe(link) ? (
              <span className="text-muted-foreground">({dominioDe(link)})</span>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">
            Ainda sem link. Você pode colar o da sua sala, e a equipe também
            pode definir o dela.
          </span>
        )}
      </Linha>

      {daEquipe ? (
        // A frase que evita a surpresa: o parceiro fica sabendo por que não há
        // botão de trocar, e a quem recorrer se o link estiver errado.
        <Linha rotulo="Quem colou">
          <span className="text-muted-foreground">
            A equipe definiu este link. Se estiver errado, fale pelo Suporte.
          </span>
        </Linha>
      ) : null}

      {editando ? (
        <div className="px-3 py-2">
          <Label
            htmlFor={`link-${sessao.id}`}
            className="rotulo text-muted-foreground"
          >
            Link da sala (começa com https://)
          </Label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Input
              id={`link-${sessao.id}`}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="url"
              maxLength={500}
              placeholder="https://"
              className="min-w-0 flex-1"
              disabled={salvando || desabilitado}
            />
            <Button
              size="sm"
              onClick={salvar}
              disabled={salvando || desabilitado || valor.trim() === ""}
            >
              {salvando ? "Salvando…" : "Salvar link"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditando(false);
                setErro(null);
                setValor(sessao.link_reuniao ?? "");
              }}
              disabled={salvando}
            >
              Cancelar
            </Button>
          </div>
          {erro ? (
            <p role="alert" className="mt-2 corpo-sm text-destructive">
              {erro}
            </p>
          ) : null}
        </div>
      ) : daEquipe ? null : (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
            {link ? "Trocar o link" : "Colar o link da sala"}
          </Button>
          {meu ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRemovendo(true)}
              disabled={salvando || desabilitado}
            >
              Remover o link
            </Button>
          ) : null}
          {erro ? (
            <p role="alert" className="w-full corpo-sm text-destructive">
              {erro}
            </p>
          ) : null}
        </div>
      )}

      {/* Remover o link é ação destrutiva: quem entrar na sessão depois não
          acha a sala. `DialogoConfirmacao` — `window.confirm` não existe no
          repo desde o war-room de 10/09. */}
      <DialogoConfirmacao
        aberto={removendo}
        titulo="Remover o link da sala"
        descricao={`${rotuloDoDia(sessao.data)}, ${horaDeTime(sessao.hora_inicio)}`}
        consequencia={
          <>
            A sessão fica sem link até alguém colar outro. Quem for entrar não
            terá para onde ir — inclusive a equipe.
          </>
        }
        rotuloConfirmar="Remover o link"
        rotuloConfirmando="Removendo…"
        rotuloCancelar="Manter o link"
        confirmando={salvando}
        erro={erro}
        onConfirmar={remover}
        onCancelar={() => {
          setRemovendo(false);
          setErro(null);
        }}
      />
    </>
  );
}
