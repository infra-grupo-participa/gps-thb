"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  cancelarSessaoNaEquipe,
  marcarFaltaNaSessao,
} from "@/app/admin/sessoes/actions";
import {
  concluirSessao,
  definirLinkDaSessao,
  editarResumoDaSessao,
  lerResumoDaSessao,
  removerLinkDaSessao,
} from "@/app/admin/sessoes/sessao-actions";
import { Button } from "@/components/ui/button";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import {
  formatarDuracao,
  horaDeTime,
  horaFimDeBloco,
  rotuloDoDia,
} from "@/components/sessoes/grade";
import { BriefingSessao } from "@/components/admin/sessoes/briefing";
import { ResumoForm } from "@/components/admin/sessoes/resumo-form";
import { DiscNaConclusao } from "@/components/admin/sessoes/disc-na-conclusao";
import {
  ROTULO_ESTADO_SESSAO,
  TIPO_ENTREVISTA_PREVIA,
  type SessaoAgendamento,
} from "@/lib/sessoes-tipos";

/**
 * A lista de sessões da tela `/admin/sessoes` — próximas e histórico.
 *
 * Denso e chapado (preferência do Marcio): linhas com borda fina, hierarquia
 * por POSIÇÃO (data/hora à esquerda, ações à direita), sem card com sombra,
 * sem ícone decorativo. Esta tela NÃO é a exceção de `/conduzir` — não há
 * pulso, cor de estado viva nem urgência visual aqui.
 *
 * 🔑 O briefing NUNCA vem junto da linha (ver `dados.ts` e `briefing.tsx`):
 * cada linha só ganha o botão "Ver briefing", que busca sob demanda.
 */
export function ListaDeSessoes({
  sessoes,
  nomeDoCliente,
  nomeDaResponsavel,
  souAdmin,
}: {
  sessoes: SessaoAgendamento[];
  /** `cliente_id` → nome, já resolvido pela página (evita N chamadas aqui). */
  nomeDoCliente: Map<string, string>;
  /** `responsavel_id` → nome (`gps.sessao_responsaveis()`), para a equipe
   *  distinguir de quem é cada sessão quando o admin vê várias doutoras. */
  nomeDaResponsavel: Map<string, string | null>;
  /** Admin vê a coluna "Responsável" e pode agir em qualquer sessão; a
   *  doutora só vê as próprias (já filtradas pela RLS antes de chegar aqui) —
   *  esta flag só decide EXIBIÇÃO, nunca permissão. */
  souAdmin: boolean;
}) {
  if (sessoes.length === 0) {
    return (
      <p className="border border-borda-fina px-4 py-4 corpo-sm text-muted-foreground">
        Nenhuma sessão nesta lista.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-borda-fina border border-borda-fina">
      {sessoes.map((s) => (
        <LinhaDaSessao
          key={s.id}
          sessao={s}
          clienteNome={nomeDoCliente.get(s.cliente_id) ?? null}
          responsavelNome={nomeDaResponsavel.get(s.responsavel_id) ?? null}
          souAdmin={souAdmin}
        />
      ))}
    </ul>
  );
}

function LinhaDaSessao({
  sessao,
  clienteNome,
  responsavelNome,
  souAdmin,
}: {
  sessao: SessaoAgendamento;
  clienteNome: string | null;
  responsavelNome: string | null;
  souAdmin: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState<
    "cancelar" | "falta" | "concluir" | "resumo" | "link" | null
  >(null);
  const [motivo, setMotivo] = useState("");
  const [erroInline, setErroInline] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [linkTexto, setLinkTexto] = useState("");
  // Texto do resumo JA GRAVADO, buscado por RPC antes de abrir o form.
  // Nasce "" e só é preenchido pela leitura — ver o comentário no botão.
  const [resumoAtual, setResumoAtual] = useState("");
  // DISC capturado na conclusão da Entrevista Prévia (decisão de 22/09).
  // Nasce vazio; a RPC preserva o que já existe quando o campo vai em branco.
  const [disc, setDisc] = useState({
    letra: "", consciencia: "", gatilhos: "", relacionamento: "",
  });
  const [briefingAberto, setBriefingAberto] = useState(false);
  // Vira `true` no 1º clique e NUNCA volta: é o que mantém o briefing montado
  // (e a trilha LGPD com uma linha por leitura real). Ver o comentário no JSX.
  const [jaAbriu, setJaAbriu] = useState(false);
  // "Depois do horário" é cortesia de tela — quem recusa de fato é a RPC
  // (§9 D7: falta só depois de `inicio_em`). `Date.now()` é impuro e não pode
  // rodar durante o render (regra do projeto/React); por isso "agora" nasce
  // no `useState` (lazy init, roda uma vez) em vez de ser calculado inline.
  // Relógio do cliente: se estiver errado, o pior caso é o botão aparecer
  // cedo demais e a RPC recusar com a frase pronta — nunca o contrário.
  const [agora] = useState(() => Date.now());

  const inicio = horaDeTime(sessao.hora_inicio);
  const fim = horaFimDeBloco(sessao.hora_inicio, sessao.duracao_min);
  const podeAgir = sessao.estado === "agendado";
  const ehEntrevistaPrevia = sessao.tipo_id === TIPO_ENTREVISTA_PREVIA;
  const jaComecou = new Date(sessao.inicio_em).getTime() <= agora;

  function confirmarCancelamento() {
    setErroInline(null);
    const texto = motivo.trim();
    if (texto.length < 3 || texto.length > 300) {
      setErroInline("O motivo precisa ter entre 3 e 300 caracteres.");
      return;
    }
    iniciar(async () => {
      const r = await cancelarSessaoNaEquipe({
        agendamentoId: sessao.id,
        motivo: texto,
      });
      if (!r.ok) {
        setErroInline(r.erro);
        return;
      }
      setAberto(null);
      setMotivo("");
      router.refresh();
    });
  }

  function confirmarFalta() {
    setErroInline(null);
    iniciar(async () => {
      const r = await marcarFaltaNaSessao({
        agendamentoId: sessao.id,
        observacao: motivo.trim() === "" ? null : motivo,
      });
      if (!r.ok) {
        setErroInline(r.erro);
        return;
      }
      setAberto(null);
      setMotivo("");
      router.refresh();
    });
  }

  function confirmarConclusao(resumo: string) {
    setErroInline(null);
    iniciar(async () => {
      const r = await concluirSessao({
        agendamentoId: sessao.id,
        resumo: resumo === "" ? null : resumo,
        // 🔴 Só a Entrevista Prévia captura DISC. Na Reunião Preliminar o
        // perfil já deveria existir, e reenviar convidaria a sobrescrever.
        ...(ehEntrevistaPrevia
          ? {
              perfilDisc: disc.letra,
              discConsciencia: disc.consciencia,
              discGatilhos: disc.gatilhos,
              discRelacionamento: disc.relacionamento,
            }
          : {}),
      });
      if (!r.ok) {
        setErroInline(r.erro);
        return;
      }
      setAberto(null);
      router.refresh();
    });
  }

  function confirmarResumo(resumo: string) {
    setErroInline(null);
    iniciar(async () => {
      const r = await editarResumoDaSessao({ agendamentoId: sessao.id, resumo });
      if (!r.ok) {
        setErroInline(r.erro);
        return;
      }
      setAberto(null);
      router.refresh();
    });
  }

  function confirmarLink() {
    setErroInline(null);
    const link = linkTexto.trim();
    if (link === "") {
      setErroInline("Cole o link da sala.");
      return;
    }
    iniciar(async () => {
      const r = await definirLinkDaSessao({ agendamentoId: sessao.id, link });
      if (!r.ok) {
        setErroInline(r.erro);
        return;
      }
      setAberto(null);
      setLinkTexto("");
      router.refresh();
    });
  }

  function confirmarRemocaoDeLink() {
    setErroInline(null);
    iniciar(async () => {
      const r = await removerLinkDaSessao({ agendamentoId: sessao.id });
      if (!r.ok) {
        setErroInline(r.erro);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="grid gap-2 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="corpo font-medium text-foreground">
            {rotuloDoDia(sessao.data)}, {inicio}
            {fim ? ` – ${fim}` : null}{" "}
            <span className="corpo-sm text-muted-foreground">
              ({formatarDuracao(sessao.duracao_min)})
            </span>
          </p>
          <p className="corpo-sm text-muted-foreground">
            {clienteNome ?? "cliente não identificado"}
            {souAdmin ? ` · ${responsavelNome ?? "equipe jurídica"}` : null}
            {" · "}
            {ROTULO_ESTADO_SESSAO[sessao.estado]}
          </p>
          {sessao.estado === "cancelado" && sessao.cancelado_motivo ? (
            <p className="corpo-sm text-muted-foreground">
              Motivo: {sessao.cancelado_motivo}
            </p>
          ) : null}
          {/* 🔴 Só o link em si (já no grant de coluna desde a …291) —
              `link_definido_por`/`link_por_equipe` não estão no tipo desta
              fatia (ver o comentário no topo do arquivo), então a linha não
              afirma quem colou. Nunca inventar essa informação. */}
          {sessao.link_reuniao ? (
            <p className="corpo-sm text-muted-foreground">
              Sala:{" "}
              <a
                href={sessao.link_reuniao}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                {dominioDoLink(sessao.link_reuniao)}
              </a>
            </p>
          ) : null}
        </div>

        {/* 🔴 `min-w-0` e SEM `shrink-0`: com `shrink-0` o contêiner recusava
            encolher e o `flex-wrap` nunca chegava a agir — medido no Pixel 7
            (412px) com os 5 botões na tela (Ver briefing · Colar link ·
            Concluir · Cancelar · Marcar falta): 546px de conteúdo, 134px de
            rolagem horizontal na página inteira.
            Só aparece quando a sessão está em andamento (é quando "Concluir"
            e "Marcar falta" surgem), por isso passou despercebido até haver
            uma sessão nesse estado. Achado pela suíte E2E. */}
        <div className="flex min-w-0 flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setJaAbriu(true);
              setBriefingAberto((v) => !v);
            }}
          >
            {briefingAberto ? "Fechar briefing" : "Ver briefing"}
          </Button>
          {podeAgir ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setErroInline(null);
                setLinkTexto(sessao.link_reuniao ?? "");
                setAberto("link");
              }}
            >
              {sessao.link_reuniao ? "Trocar link" : "Colar link"}
            </Button>
          ) : null}
          {podeAgir && sessao.link_reuniao ? (
            <Button
              variant="outline"
              size="sm"
              onClick={confirmarRemocaoDeLink}
              disabled={pendente}
            >
              Remover link
            </Button>
          ) : null}
          {podeAgir && jaComecou ? (
            <Button
              size="sm"
              onClick={() => {
                setErroInline(null);
                setAberto("concluir");
              }}
            >
              Concluir sessão
            </Button>
          ) : null}
          {sessao.estado === "realizado" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setErroInline(null);
                // 🔴 BUSCA O TEXTO ANTES DE ABRIR (achado ALTO do pentest,
                // 22/09). Sem isto o form abria VAZIO e `sessao_resumo_editar`
                // sobrescreve — quem clicasse aqui numa sessão que já tinha
                // resumo apagava o anterior sem nunca tê-lo lido. E o texto
                // antigo é IRRECUPERÁVEL: a trilha guarda só o tamanho, nunca
                // o conteúdo (LGPD). Abrir só depois da leitura.
                setResumoAtual("");
                iniciar(async () => {
                  const r = await lerResumoDaSessao({ agendamentoId: sessao.id });
                  if (!r.ok) {
                    setErroInline(r.erro);
                    return;
                  }
                  setResumoAtual(r.resumo ?? "");
                  setAberto("resumo");
                });
              }}
            >
              Registrar/editar resumo
            </Button>
          ) : null}
          {podeAgir ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setErroInline(null);
                setMotivo("");
                setAberto("cancelar");
              }}
            >
              Cancelar
            </Button>
          ) : null}
          {podeAgir && jaComecou ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setErroInline(null);
                setMotivo("");
                setAberto("falta");
              }}
            >
              Marcar falta
            </Button>
          ) : null}
        </div>
      </div>

      {aberto === "concluir" ? (
        <div className="border-t border-borda-fina pt-2">
          <p className="corpo-sm mb-2 text-muted-foreground">
            Concluir {rotuloDoDia(sessao.data)}, {inicio} —{" "}
            {clienteNome ?? "cliente"}. O resumo é opcional agora; dá para
            registrar depois.
          </p>
          {/* 🔴 Só na Entrevista Prévia: é ela que "gera o perfil DISC"
              (regra do Marcio). Na Reunião Preliminar o DISC já deveria
              existir, e reoferecer convidaria a sobrescrever. */}
          {ehEntrevistaPrevia ? (
            <DiscNaConclusao
              letra={disc.letra}
              consciencia={disc.consciencia}
              gatilhos={disc.gatilhos}
              relacionamento={disc.relacionamento}
              desabilitado={pendente}
              aoMudar={(campo, valor) =>
                setDisc((d) => ({ ...d, [campo]: valor }))
              }
            />
          ) : null}
          <ResumoForm
            obrigatorio={false}
            rotuloBotao="Concluir sessão"
            rotuloBotaoEnviando="Concluindo…"
            enviando={pendente}
            erro={erroInline}
            onEnviar={confirmarConclusao}
            onCancelar={() => {
              setAberto(null);
              setErroInline(null);
            }}
          />
        </div>
      ) : null}

      {aberto === "resumo" ? (
        <div className="border-t border-borda-fina pt-2">
          <p className="corpo-sm mb-2 text-muted-foreground">
            Resumo de {rotuloDoDia(sessao.data)}, {inicio} —{" "}
            {clienteNome ?? "cliente"}. O aluno não vê este texto.
          </p>
          <ResumoForm
            valorInicial={resumoAtual}
            obrigatorio
            rotuloBotao="Salvar resumo"
            rotuloBotaoEnviando="Salvando…"
            enviando={pendente}
            erro={erroInline}
            onEnviar={confirmarResumo}
            onCancelar={() => {
              setAberto(null);
              setErroInline(null);
            }}
          />
        </div>
      ) : null}

      <DialogoConfirmacao
        aberto={aberto === "link"}
        titulo={sessao.link_reuniao ? "Trocar o link da sala" : "Colar o link da sala"}
        descricao={`${rotuloDoDia(sessao.data)}, ${inicio} — ${clienteNome ?? "cliente"}`}
        consequencia={
          <>
            O link entra no lembrete por e-mail. Se a equipe já colou um link
            aqui, ele prevalece sobre o do parceiro.
          </>
        }
        rotuloConfirmar={sessao.link_reuniao ? "Trocar link" : "Salvar link"}
        rotuloConfirmando="Salvando…"
        rotuloCancelar="Voltar"
        destrutivo={false}
        confirmando={pendente}
        erro={erroInline}
        onConfirmar={confirmarLink}
        onCancelar={() => {
          setAberto(null);
          setErroInline(null);
        }}
      >
        <label className="grid gap-1 text-left">
          <span className="rotulo text-muted-foreground">
            Link da sala (https://…)
          </span>
          <input
            type="url"
            value={linkTexto}
            onChange={(e) => setLinkTexto(e.target.value)}
            maxLength={500}
            className="w-full rounded-md border border-borda-forte bg-card px-2 py-1.5 corpo-sm focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </label>
      </DialogoConfirmacao>

      {/* 🔴 Depois de aberto UMA vez, o briefing fica MONTADO e apenas
          escondido — nunca `? … : null`, que desmontaria.
          Motivo: `BriefingSessao` lê por `gps.sessao_briefing_ler`, que GRAVA
          trilha LGPD a cada leitura. Desmontando, "abrir → fechar → abrir"
          gravaria 3 acessos a dado pessoal de cliente de terceiro para UMA
          leitura real — inflando de ruído justamente a auditoria que precisa
          ser confiável. `jaAbriu` garante que nada é lido antes do 1º clique,
          e `hidden` preserva o resultado nos cliques seguintes. */}
      {jaAbriu ? (
        <div hidden={!briefingAberto}>
          <BriefingSessao agendamentoId={sessao.id} />
        </div>
      ) : null}

      <DialogoConfirmacao
        aberto={aberto === "cancelar"}
        titulo="Cancelar a sessão"
        descricao={`${rotuloDoDia(sessao.data)}, ${inicio} — ${clienteNome ?? "cliente"}`}
        consequencia={
          <>
            O horário volta a ficar livre na grade do parceiro. O motivo é
            obrigatório e o aluno o vê.
          </>
        }
        rotuloConfirmar="Cancelar sessão"
        rotuloConfirmando="Cancelando…"
        rotuloCancelar="Voltar"
        confirmando={pendente}
        erro={erroInline}
        onConfirmar={confirmarCancelamento}
        onCancelar={() => {
          setAberto(null);
          setErroInline(null);
        }}
      >
        <label className="grid gap-1 text-left">
          <span className="rotulo text-muted-foreground">
            Motivo (obrigatório, 3 a 300 caracteres — o aluno vê)
          </span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={300}
            rows={2}
            className="w-full rounded-md border border-borda-forte bg-card px-2 py-1.5 corpo-sm focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <span className="corpo-sm text-muted-foreground">
            {motivo.trim().length}/300
          </span>
        </label>
      </DialogoConfirmacao>

      <DialogoConfirmacao
        aberto={aberto === "falta"}
        titulo="Registrar falta"
        descricao={`${rotuloDoDia(sessao.data)}, ${inicio} — ${clienteNome ?? "cliente"}`}
        consequencia={
          <>
            A sessão passa a constar como falta e libera o horário para outro
            agendamento. Não é possível desfazer por aqui.
          </>
        }
        rotuloConfirmar="Registrar falta"
        rotuloConfirmando="Registrando…"
        rotuloCancelar="Voltar"
        destrutivo={false}
        confirmando={pendente}
        erro={erroInline}
        onConfirmar={confirmarFalta}
        onCancelar={() => {
          setAberto(null);
          setErroInline(null);
        }}
      >
        <label className="grid gap-1 text-left">
          <span className="rotulo text-muted-foreground">
            Observação (opcional, até 300 caracteres)
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
    </li>
  );
}

/**
 * Domínio para exibição do link da sala ("meet.google.com" em vez da URL
 * inteira) — só cosmético, no cliente. O domínio de VERDADE para a trilha
 * LGPD é calculado no banco (`gps.sessao_link_dominio`, fatia D); esta
 * função não escreve em lugar nenhum, só evita mostrar a URL completa (que
 * pode levar parâmetro de sala) na lista.
 */
function dominioDoLink(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
