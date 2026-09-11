"use client";

/**
 * Criar acesso para VÁRIOS alunos de uma vez (§C.2 do plano).
 *
 * 🔴 Três regras duras, e nenhuma delas é decoração:
 *
 * 1. **Senha temporária INDIVIDUAL, nunca uma senha padrão.** `auth.users` é
 *    compartilhado por 7 sistemas do grupo: uma senha igual para 19 pessoas
 *    significa que qualquer uma entra na conta das outras enquanto ninguém
 *    trocar. Quem gera a senha é `criarAcessoAluno`, uma por pessoa.
 * 2. **Teto de {@link LOTE_ACESSOS_MAXIMO} por clique, e a tela DIZ o teto.**
 *    A Resend limita 10 requisições por segundo e a action pausa 150 ms entre
 *    os envios; o war-room de 09/09 perdeu 11 de 20 e-mails exatamente aqui.
 *    Botão que aceita 100 e falha em 80 é pior do que botão que recusa 21.
 * 3. **Relatório POR PESSOA, nunca "19 acessos criados".** Falha silenciosa é
 *    a pior espécie — o cron do Plantão dizia `succeeded, 20 rows` enquanto
 *    ninguém recebia nada.
 *
 * 🔑 **Adoção de login preexistente NÃO acontece no lote** (`permitirAdocao:
 * false` dentro da action). Adotar troca a senha da pessoa em TODOS os portais
 * do grupo e derruba as sessões dela; fazer isso 19 vezes num clique é
 * derrubar gente de sistemas que não têm nada a ver com esta feature. Quem cai
 * nesse caso volta como **"precisa de decisão"**, com os programas em que o
 * login já é usado, para o admin resolver um a um em "Gerenciar acesso" — que
 * já tem a confirmação nomeando os sistemas.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, KeyRound, X } from "lucide-react";

import { criarAcessosEmLote } from "@/app/admin/actions";
// ⚠️ O TETO vem de `@/lib/acessos-lote`, não de `actions.ts`: arquivo
// `"use server"` só pode exportar função async, e um `export const` lá dentro
// derruba os exports do módulo inteiro para o cliente (medido: `/admin` em
// 500). O TIPO pode vir do módulo de actions porque `import type` é apagado
// antes do bundler.
import { LOTE_ACESSOS_MAXIMO } from "@/lib/acessos-lote";
import type { ResultadoAcessoEmLote } from "@/app/admin/actions";
import { mensagemAcesso } from "@/components/admin/credenciais-view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import type { AlunoGps } from "@/lib/data";

/** Como chamar e como falar com uma pessoa do lote, no instante do clique. */
interface PessoaDoLote {
  nome: string;
  telefone: string | null;
  email: string | null;
}

/** O relatório e as pessoas dele, congelados juntos. */
interface RelatorioCongelado {
  resultados: ResultadoAcessoEmLote[];
  pessoas: Map<string, PessoaDoLote>;
}

/**
 * Fotografa nome/telefone/e-mail dos ambientes informados. Chamada no clique,
 * NUNCA no render: o que a tela tem depois do `router.refresh()` já é outra
 * lista.
 */
function congelarPessoas(lista: AlunoGps[]): Map<string, PessoaDoLote> {
  const mapa = new Map<string, PessoaDoLote>();
  for (const a of lista) {
    if (mapa.has(a.alunoId)) continue;
    mapa.set(a.alunoId, {
      nome: a.aluno?.nome ?? a.aluno?.email ?? "Parceiro sem nome",
      telefone: a.aluno?.telefone ?? null,
      email: a.aluno?.email ?? null,
    });
  }
  return mapa;
}

export function LoteDeAcesso({
  selecionados,
  candidatos,
  onLimpar,
  onSelecionarAte,
}: {
  /** Os ambientes marcados, na ordem em que aparecem na lista. */
  selecionados: AlunoGps[];
  /** Todos os que o filtro "sem login" trouxe — a base do "selecionar tudo". */
  candidatos: AlunoGps[];
  onLimpar: () => void;
  /** Marca os N primeiros da lista visível (N = o teto). */
  onSelecionarAte: (n: number) => void;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * 🔴 O relatório guarda os RESULTADOS **e** a identificação das pessoas,
   * congelada no clique.
   *
   * `candidatos` é a lista do filtro "sem login" — e o `router.refresh()` que
   * o próprio lote dispara ESVAZIA essa lista (quem ganhou login sai do
   * filtro). Ler nome/telefone dela na hora de desenhar o relatório fazia
   * justamente quem ficou **sem e-mail** virar "Parceiro", com a mensagem de
   * WhatsApp saindo sem nome e sem link — no único caso em que a senha só
   * existe ali, naquela tela.
   */
  const [relatorio, setRelatorio] = useState<RelatorioCongelado | null>(null);
  const [enviando, startTransition] = useTransition();

  const qtd = selecionados.length;
  const acimaDoTeto = qtd > LOTE_ACESSOS_MAXIMO;
  const nomeDe = new Map(
    candidatos.map((a) => [a.alunoId, a.aluno?.nome ?? a.aluno?.email ?? "Parceiro sem nome"]),
  );

  function criar(adotarLoginsExistentes = false) {
    setErro(null);
    // Snapshot SÍNCRONO, antes do await: `selecionados` e `candidatos` ainda
    // são os desta tela. Depois do `router.refresh()` eles não existem mais.
    const pessoas = congelarPessoas([...candidatos, ...selecionados]);
    startTransition(async () => {
      const r = await criarAcessosEmLote(
        selecionados.map((a) => a.alunoId),
        { adotarLoginsExistentes },
      );
      if (r.erro) {
        setErro(r.erro);
        return;
      }
      setConfirmando(false);
      setRelatorio({ resultados: r.resultados, pessoas });
      onLimpar();
      // O lote muda `temLogin` de todo mundo que passou: sem isto os cards
      // continuariam dizendo "sem login" até alguém recarregar à mão.
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-superficie-afundada px-3 py-2">
        <p className="min-w-0 flex-1 corpo-sm">
          <span className="font-medium">
            {qtd === 0
              ? "Nenhum parceiro selecionado"
              : `${qtd} ${qtd === 1 ? "parceiro selecionado" : "parceiros selecionados"}`}
          </span>
          <span className="text-muted-foreground">
            {" "}
            · {candidatos.length} sem login nesta lista · até{" "}
            {LOTE_ACESSOS_MAXIMO} por vez
          </span>
        </p>

        {qtd > 0 ? (
          <Button variant="ghost" size="sm" onClick={onLimpar} disabled={enviando}>
            <X aria-hidden />
            Limpar seleção
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={candidatos.length === 0}
            onClick={() => onSelecionarAte(LOTE_ACESSOS_MAXIMO)}
          >
            Selecionar{" "}
            {candidatos.length <= LOTE_ACESSOS_MAXIMO
              ? "todos"
              : `os primeiros ${LOTE_ACESSOS_MAXIMO}`}
          </Button>
        )}

        <Button
          size="sm"
          disabled={qtd === 0 || acimaDoTeto || enviando}
          onClick={() => {
            setErro(null);
            setConfirmando(true);
          }}
        >
          <KeyRound aria-hidden />
          Criar acesso para os selecionados
        </Button>
      </div>

      {/* A razão do travamento fica ESCRITA ao lado do botão — nunca deixar
          clicar para o servidor recusar depois. */}
      {acimaDoTeto ? (
        <p aria-live="polite" className="corpo-sm text-atencao-foreground">
          Selecione no máximo {LOTE_ACESSOS_MAXIMO} por vez — cada pessoa recebe
          um e-mail, e o envio tem limite por segundo.
        </p>
      ) : null}

      <DialogoConfirmacao
        aberto={confirmando}
        titulo={`Criar acesso para ${qtd} ${qtd === 1 ? "parceiro" : "parceiros"}?`}
        descricao={
          <span className="line-clamp-3">
            {selecionados.map((a) => nomeDe.get(a.alunoId)).join(", ")}
          </span>
        }
        consequencia={
          <>
            Cada pessoa recebe <strong>por e-mail uma senha temporária
            individual</strong> — não existe senha padrão. No primeiro acesso o
            portal pede que ela crie uma senha própria.
            <br />
            <br />
            Logins que <strong>já existem em outro portal do grupo</strong> não
            são alterados: essas pessoas voltam aqui como{" "}
            <em>&ldquo;precisa de decisão&rdquo;</em>, para você resolver uma a
            uma em &ldquo;Gerenciar acesso&rdquo;.
          </>
        }
        rotuloConfirmar={`Criar ${qtd} ${qtd === 1 ? "acesso" : "acessos"}`}
        rotuloConfirmando="Criando…"
        destrutivo={false}
        confirmando={enviando}
        erro={erro}
        onConfirmar={criar}
        onCancelar={() => {
          if (enviando) return;
          setConfirmando(false);
          setErro(null);
        }}
      />

      {relatorio ? (
        <RelatorioDoLote
          resultados={relatorio.resultados}
          pessoas={relatorio.pessoas}
          onFechar={() => setRelatorio(null)}
          resolvendo={enviando}
          onResolverPendentes={() => {
            // 🔑 Refaz SÓ quem parou em "precisa de decisão", adotando os
            // logins que já existem em outros portais do grupo. A conta é a
            // MESMA pessoa (mesmo e-mail); o que muda é que a senha dela
            // passa a valer também nos outros portais.
            const pendentes = relatorio.resultados
              .filter((r) => !r.ok && r.precisaDecisao)
              .map((r) => r.alunoId);
            if (pendentes.length === 0) return;
            const pessoas = relatorio.pessoas;
            startTransition(async () => {
              const r = await criarAcessosEmLote(pendentes, {
                adotarLoginsExistentes: true,
              });
              if (r.erro) {
                setErro(r.erro);
                return;
              }
              setRelatorio({ resultados: r.resultados, pessoas });
              router.refresh();
            });
          }}
        />
      ) : null}
    </>
  );
}

/**
 * O resultado, **pessoa por pessoa**. Três destinos possíveis e nenhum deles
 * some numa contagem agregada:
 *
 * - **ok** — acesso criado. Se o e-mail não saiu, a senha aparece aqui com o
 *   botão de copiar a mensagem: senão o acesso existiria e ninguém saberia.
 * - **precisa de decisão** — o e-mail já tem login em outro portal do grupo.
 *   Nada foi alterado; o link leva ao ambiente, onde "Gerenciar acesso" faz a
 *   adoção com a confirmação que nomeia os sistemas.
 * - **falhou** — a frase que o servidor devolveu, sem `error.message` cru.
 */
function RelatorioDoLote({
  resultados,
  pessoas,
  onFechar,
  onResolverPendentes,
  resolvendo,
}: {
  resultados: ResultadoAcessoEmLote[];
  /** Nome, telefone e e-mail congelados no clique — ver `RelatorioCongelado`. */
  pessoas: Map<string, PessoaDoLote>;
  onFechar: () => void;
  /** Refaz o lote adotando os logins que já existem em outros portais. */
  onResolverPendentes?: () => void;
  resolvendo?: boolean;
}) {
  const criados = resultados.filter((r) => r.ok);
  const decisao = resultados.filter((r) => !r.ok && r.precisaDecisao);
  const falhas = resultados.filter((r) => !r.ok && !r.precisaDecisao);
  const semEmail = criados.filter((r) => !r.emailEnviado);

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[85dvh] gap-4 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading titulo-h2">
            Resultado do lote
          </DialogTitle>
          <DialogDescription>
            {criados.length} {criados.length === 1 ? "acesso criado" : "acessos criados"}
            {decisao.length > 0
              ? ` · ${decisao.length} ${decisao.length === 1 ? "precisa" : "precisam"} de decisão`
              : ""}
            {falhas.length > 0
              ? ` · ${falhas.length} ${falhas.length === 1 ? "falhou" : "falharam"}`
              : ""}
            .
          </DialogDescription>
        </DialogHeader>

        {/* 🔑 AUTONOMIA DO ADMIN (10/09/2026).
            Quem já tem login em outro portal do grupo parava aqui em
            "precisa de decisão", e a equipe tinha de abrir o ambiente de
            cada um e resolver à mão — inviável no dia em que dezenas de
            pessoas precisam entrar ao mesmo tempo.

            A confirmação NÃO sumiu: ela virou UMA para o lote, com o número
            e a consequência escritos. Adotar troca a senha da pessoa nos
            outros portais do grupo, e isso continua dito aqui. */}
        {decisao.length > 0 && onResolverPendentes ? (
          <div className="grid gap-2 rounded-lg border border-atencao-foreground/30 bg-atencao/40 p-3">
            <p className="corpo-sm text-atencao-foreground">
              <strong>
                {decisao.length}{" "}
                {decisao.length === 1 ? "pessoa já tem" : "pessoas já têm"}{" "}
                login em outro portal do grupo.
              </strong>{" "}
              Resolver aqui cria o acesso {decisao.length === 1 ? "dela" : "delas"}{" "}
              no Programa usando a conta que já existe — a senha nova passa a
              valer também nos outros portais, e as sessões abertas caem.
            </p>
            <Button
              type="button"
              size="sm"
              className="w-fit"
              disabled={resolvendo}
              onClick={onResolverPendentes}
            >
              {resolvendo
                ? "Resolvendo…"
                : `Resolver ${decisao.length === 1 ? "esta pessoa" : `as ${decisao.length}`} agora`}
            </Button>
          </div>
        ) : null}

        {semEmail.length > 0 ? (
          <p className="flex items-start gap-2 rounded-lg bg-atencao p-3 corpo-sm text-atencao-foreground">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              {semEmail.length}{" "}
              {semEmail.length === 1
                ? "acesso foi criado, mas o e-mail não saiu"
                : "acessos foram criados, mas os e-mails não saíram"}
              . Copie a mensagem abaixo e mande por WhatsApp — o acesso existe,
              só ninguém foi avisado.
            </span>
          </p>
        ) : null}

        <ul className="grid gap-2">
          {resultados.map((r) => (
            <li
              key={r.alunoId}
              className="grid gap-1.5 rounded-lg bg-superficie-afundada px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                {r.ok ? (
                  <Check
                    aria-hidden
                    className="size-4 shrink-0 text-sucesso-foreground"
                  />
                ) : (
                  <AlertTriangle
                    aria-hidden
                    className={`size-4 shrink-0 ${r.precisaDecisao ? "text-atencao-foreground" : "text-destructive"}`}
                  />
                )}
                <span className="min-w-0 flex-1 truncate corpo-sm font-medium">
                  {pessoas.get(r.alunoId)?.nome ?? "Parceiro"}
                </span>
                <span
                  className={`shrink-0 rotulo ${
                    r.ok
                      ? "text-sucesso-foreground"
                      : r.precisaDecisao
                        ? "text-atencao-foreground"
                        : "text-destructive"
                  }`}
                >
                  {r.ok
                    ? r.emailEnviado
                      ? "acesso criado · e-mail enviado"
                      : "acesso criado · e-mail não saiu"
                    : r.precisaDecisao
                      ? "precisa de decisão"
                      : "falhou"}
                </span>
              </div>

              {!r.ok && r.erro ? (
                <p className="corpo-sm text-muted-foreground">{r.erro}</p>
              ) : null}

              {r.precisaDecisao ? (
                <>
                  <p className="corpo-sm text-muted-foreground">
                    Este e-mail já tem login
                    {r.programas && r.programas.length > 0
                      ? ` em: ${r.programas.join(", ")}`
                      : " em outro portal do grupo"}
                    . Nada foi alterado — adotar a conta troca a senha da pessoa
                    nesses sistemas e derruba as sessões dela.
                  </p>
                  <Link
                    href={`/admin/aluno/${r.alunoId}`}
                    prefetch={false}
                    className="foco-visivel inline-flex w-fit items-center gap-1 rounded-sm corpo-sm font-medium text-accent-foreground underline-offset-4 hover:underline"
                  >
                    Abrir o ambiente e usar &ldquo;Gerenciar acesso&rdquo;
                  </Link>
                </>
              ) : null}

              {r.ok && !r.emailEnviado && r.email && r.senha ? (
                <CopiarCredenciais
                  email={r.email}
                  senha={r.senha}
                  nome={pessoas.get(r.alunoId)?.nome ?? null}
                  telefone={pessoas.get(r.alunoId)?.telefone ?? null}
                />
              ) : null}
            </li>
          ))}
        </ul>

        <div className="flex justify-end">
          <Button onClick={onFechar}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A senha só aparece para quem NÃO recebeu e-mail.
 *
 * Mostrar as 20 senhas de uma vez transformaria a captura de tela do relatório
 * numa lista de credenciais. Quem recebeu o e-mail não precisa dela na tela;
 * quem não recebeu precisa, ou o acesso existe e ninguém sabe.
 */
function CopiarCredenciais({
  email,
  senha,
  nome,
  telefone,
}: {
  email: string;
  senha: string;
  nome: string | null;
  telefone: string | null;
}) {
  const [copiado, setCopiado] = useState(false);
  const texto = mensagemAcesso({
    email,
    senha,
    emailEnviado: false,
    nome,
    telefone,
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded bg-card px-2 py-1 numero corpo-sm">
        {email} · {senha}
      </code>
      <Button
        variant="outline"
        size="xs"
        onClick={() =>
          navigator.clipboard.writeText(texto).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          })
        }
      >
        {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copiado ? "Copiado" : "Copiar mensagem"}
      </Button>
    </div>
  );
}
