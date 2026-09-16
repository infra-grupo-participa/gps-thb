"use client";

/**
 * Diálogo "Respostas" do onboarding — fatia A-4 (16/09/2026), pedido do
 * Marcio: *"Coloca essas informações da resposta do onboarding dentro de um
 * pop-up. Quando a gente clica em 'Respostas', se ele tem um sócio, a gente
 * coloca os dados do sócio e os dados do preenchimento do onboarding. Só
 * para facilitar a visualização e não confundir ele na parte 'Resolver'."*
 *
 * 🔴 BUSCA SOB DEMANDA — a trava que não pode errar. A lista de "Alunos
 * ativos" tem ~94 cards com este botão; o fetch só pode nascer no CLIQUE
 * (`onOpenChange(true)`), nunca em `useEffect` de montagem — senão são ~94
 * requisições ao simplesmente pintar a lista (N+1 pela porta dos fundos).
 * Reabrir o MESMO diálogo na mesma sessão não refaz o fetch: o questionário é
 * foto histórica, não estado vivo, e `dados` já guarda o resultado.
 *
 * 🔑 SÓ LEITURA. Nenhuma escrita nasce aqui — é a regra nº 1 da Central.
 * Fechar no Esc/clique-fora não perde nada porque não há o que perder.
 *
 * `DialogTrigger render={<Button .../>}` (precedente: `nota-rapida.tsx`) é o
 * que devolve o foco ao botão que abriu o diálogo — sem ele o teclado volta
 * ao `<body>` e o operador recomeça a navegação do topo de uma lista de ~94
 * cards.
 *
 * 🔴 Fatia A-5 (16/09/2026): o `favorito` DEIXOU de ser prop. `AlunoGps.favorito`
 * (o dado que o card da lista tem) só traz `nome`/`fase` — sem `id` nem
 * `confirmadoEm`, os dois que este diálogo precisa para o link "Abrir a
 * ficha de…" e a frase de confirmação. Passar o favorito do card levaria a
 * `/clientes/undefined`. Agora ele vem embutido no retorno da própria
 * `respostasDoOnboarding`, buscado no MESMO clique — 1 consulta extra por
 * CLIQUE, não por card, coerente com a busca sob demanda acima.
 */

import { useState } from "react";
import { ClipboardList, Star } from "lucide-react";
import Link from "next/link";
import { respostasDoOnboarding } from "@/app/admin/onboarding-actions";
import type { ResultadoRespostasOnboarding } from "@/lib/onboarding-tipos";
import type { OnboardingDaPessoa } from "@/lib/types";
import { formatarData } from "@/lib/datas";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ListaSkeleton } from "@/components/ui/lista-skeleton";
import { Respostas, estadoDaPessoa } from "./respostas";

/** Uma linha rótulo/valor, hierarquia por posição — mesmo padrão do dossiê
 * (`src/components/admin/dossie/index.tsx`): rótulo cinza à esquerda, valor à
 * direita, sem card por dado. Reuso literal, não um segundo padrão. */
function LinhaDado({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <span className="corpo-sm text-muted-foreground">{rotulo}</span>
      <span className="corpo-sm text-right text-foreground">{children}</span>
    </div>
  );
}

/** Bloco do sócio: dados de contato + o rótulo obrigatório sobre o
 * questionário (decisão de 15/09/2026, ver comentário mais abaixo). */
function BlocoSocio({ p }: { p: OnboardingDaPessoa }) {
  const nome = p.nome ?? "Cadastro não identificado";

  // 🔴 Caso de borda real, preservado de `secao-onboarding.tsx`: sócio que
  // CONCLUIU antes de 15/09/2026 mostra as respostas dele (era permitido
  // então). Sócio `em_andamento` ou `nao_iniciado` não tem o que mostrar — o
  // questionário não se aplica mais ao papel sócio e a RPC não reabre para
  // ele. Ex.: Caroline Zavan Rodrigues Tomazela, parada no passo 2 desde
  // 11/09, `em_andamento` com respostas parciais que ninguém pode concluir.
  const socioSemRespostaConcluida = p.status !== "concluido";

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <LinhaDado rotulo="Nome">{nome}</LinhaDado>
        <LinhaDado rotulo="E-mail">{p.email ?? "—"}</LinhaDado>
        <LinhaDado rotulo="Telefone">{p.telefone ?? "—"}</LinhaDado>
        <LinhaDado rotulo="Cidade/UF">
          {p.cidade ? `${p.cidade}${p.estado ? `/${p.estado}` : ""}` : "—"}
        </LinhaDado>
      </div>

      {/* Cabeçalho obrigatório (decisão de 15/09/2026): sem ele volta o
          alarme falso "1 de 2 responderam" — o sócio compartilha o ambiente
          do titular e não é uma segunda resposta pendente. */}
      <p className="corpo-sm rounded-lg border border-borda-fina bg-muted/60 p-2.5 text-muted-foreground">
        O sócio não responde o questionário inicial (decisão de 15/09/2026) —
        compartilha o ambiente do titular.
        {socioSemRespostaConcluida
          ? p.status === "em_andamento"
            ? " Começou a responder antes dessa data; o questionário não se aplica mais ao sócio e não reabre. As respostas parciais ficam guardadas, sem exibição aqui."
            : ""
          : " As respostas abaixo foram enviadas antes dessa data, quando o sócio ainda respondia."}
      </p>

      {!socioSemRespostaConcluida ? <Respostas p={p} /> : null}
    </div>
  );
}

export function OnboardingRespostas({
  alunoId,
  nomeDoAluno,
}: {
  alunoId: string;
  /** Só para rotular o botão/diálogo — nunca vai para o banco. */
  nomeDoAluno: string;
}) {
  const [dados, setDados] = useState<ResultadoRespostasOnboarding | null>(null);
  const [carregando, setCarregando] = useState(false);

  // O favorito vem da MESMA action, no MESMO clique — ver o comentário em
  // `respostasDoOnboarding` (fatia A-5, 16/09/2026). O card da lista só tem
  // `nome`/`fase`, sem `id` nem `confirmadoEm`; passá-lo por prop levaria o
  // link "Abrir a ficha de…" a `/clientes/undefined`.
  const favorito = dados?.ok ? dados.favorito : null;

  function aoAbrirFechar(aberto: boolean) {
    if (!aberto) return;
    // Reabrir na mesma sessão não refaz o fetch: dado é foto histórica, não
    // estado vivo. Só sucesso é cacheado — erro tem de poder ser retentado
    // ao reabrir o diálogo.
    if (dados?.ok) return;

    setCarregando(true);
    respostasDoOnboarding(alunoId)
      .then(setDados)
      .catch(() =>
        setDados({
          ok: false,
          erro: "Não foi possível carregar as respostas. Feche e tente de novo.",
        }),
      )
      .finally(() => setCarregando(false));
  }

  const titulares = (dados?.ok ? dados.pessoas : []).filter(
    (p) => p.papel === "titular",
  );
  const socios = (dados?.ok ? dados.pessoas : []).filter(
    (p) => p.papel === "socio",
  );
  // Denominador de "N responderam" conta só titulares — o sócio não responde.
  const concluidos = titulares.filter((p) => p.status === "concluido").length;

  return (
    <Dialog onOpenChange={aoAbrirFechar}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="xs" />}
        // O rótulo visível ("Respostas") se repete em ~94 cards: sem o nome
        // no nome acessível, o leitor de tela lista dezenas de botões
        // idênticos.
        aria-label={`Respostas do questionário de ${nomeDoAluno}`}
      >
        <ClipboardList aria-hidden className="size-3.5" /> Respostas
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Respostas do onboarding — {nomeDoAluno}</DialogTitle>
        </DialogHeader>

        <div aria-live="polite" className="grid gap-5">
          {carregando ? <ListaSkeleton linhas={3} /> : null}

          {!carregando && dados && !dados.ok ? (
            <p role="alert" className="corpo-sm text-destructive">
              {dados.erro}
            </p>
          ) : null}

          {!carregando && dados?.ok ? (
            <>
              {titulares.length === 0 ? (
                <p className="corpo-sm text-muted-foreground">
                  Nenhuma pessoa identificada neste ambiente.
                </p>
              ) : (
                <p className="corpo-sm text-muted-foreground">
                  {titulares.length}{" "}
                  {titulares.length === 1 ? "titular" : "titulares"} ·{" "}
                  {concluidos} {concluidos === 1 ? "respondeu" : "responderam"}
                  .
                </p>
              )}

              {titulares.map((p) => {
                const status = estadoDaPessoa(p);
                return (
                  <section key={p.membroId} className="grid gap-2">
                    <h3 className="titulo-h2">{p.nome ?? "Cadastro não identificado"}</h3>
                    <LinhaDado rotulo="Questionário">{status.valor}</LinhaDado>
                    {status.estado === "atencao" ? (
                      <p role="alert" className="corpo-sm text-destructive">
                        {status.detalhe}
                      </p>
                    ) : null}
                    {p.status === "nao_iniciado" ? (
                      <p className="corpo-sm text-muted-foreground">
                        O questionário abre sozinho no próximo acesso desta
                        pessoa. Ninguém está bloqueado por isso.
                      </p>
                    ) : (
                      <Respostas p={p} />
                    )}
                  </section>
                );
              })}

              {socios.map((p) => (
                <section key={p.membroId} className="grid gap-2">
                  <h3 className="titulo-h2">
                    {p.nome ?? "Cadastro não identificado"} · sócio
                  </h3>
                  <BlocoSocio p={p} />
                </section>
              ))}

              <section className="grid gap-1.5 border-t border-borda-fina pt-3">
                <p className="rotulo text-muted-foreground">
                  Acompanhamento confirmado pela equipe
                </p>
                <p className="corpo-sm text-foreground">
                  {favorito?.confirmadoEm
                    ? `Sim, desde ${formatarData(favorito.confirmadoEm)}.`
                    : favorito
                      ? "Não — o parceiro escolheu um cliente, mas a equipe ainda não confirmou."
                      : "Não — o parceiro ainda não escolheu a estrela."}
                </p>
                {favorito ? (
                  <Link
                    href={`/admin/aluno/${alunoId}/clientes/${favorito.id}`}
                    className="foco-visivel inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-accent-foreground underline-offset-4 hover:underline"
                  >
                    <Star aria-hidden className="size-3.5" />
                    Abrir a ficha de {favorito.nome || "o cliente"}
                  </Link>
                ) : (
                  <Link
                    href={`/admin/aluno/${alunoId}/clientes`}
                    className="foco-visivel inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-accent-foreground underline-offset-4 hover:underline"
                  >
                    Ver os clientes deste parceiro
                  </Link>
                )}
              </section>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
