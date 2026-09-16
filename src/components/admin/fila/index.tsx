"use client";

/**
 * 🔴 CONTORNO QUE FUNCIONOU — causa raiz ainda não provada (16/09/2026).
 *
 * Esta tela e `/admin/clientes` ficavam presas em "Carregando…" para sempre
 * em produção (Hostinger compartilhada): HTTP 200, o `loading.tsx` aparecia e
 * o conteúdo NUNCA o substituía; depois caía no `error.tsx`.
 *
 * O que foi PROVADO antes desta mudança:
 *   - o banco responde: `gps.fila_de_ligacoes` devolveu as 35 linhas com o
 *     JWT do admin, e o log da API do Supabase registra HTTP 200 da chamada
 *     às 18:57:53 — no MESMO instante em que a tela mostrava "Carregando…";
 *   - não é permissão, não é deploy faltando, não é chave errada;
 *   - as duas telas que falhavam renderizavam Server Component; as duas do
 *     mesmo `/admin` que funcionam (`operadores`, `tutoriais`) são
 *     `"use client"`. As duas quebradas nasceram em 15/09 e NUNCA
 *     funcionaram em produção.
 *
 * A causa raiz NÃO foi isolada — falta o log do Node na Hostinger, onde está
 * a exceção real. O `server.js` deste repo já documenta aquele servidor como
 * instável (`fetch failed` intermitente, TTFB variando 14× na mesma página
 * estática), e streaming de RSC é o que mais sofre com isso.
 *
 * ✅ CONFIRMADO EM PRODUÇÃO (16/09/2026, após o deploy de `fe5e7f0`): as duas
 * telas passaram a carregar. A fila mostra as 35 linhas; `/admin/clientes`
 * mostra 1.585 clientes com filtros e busca. A hipótese se sustenta —
 * naquele servidor, o streaming de RSC destas duas telas não completava.
 *
 * ⚠️ NÃO REVERTER sem antes reproduzir a falha: a mudança é o que faz a tela
 * abrir hoje. A causa raiz (por que o streaming trava LÁ e não aqui) segue
 * sem prova — se algum dia o log do Node na Hostinger explicar, o conserto
 * certo é lá, e aí sim isto pode voltar a Server Component.
 *
 * ⚠️ Se o log aparecer e apontar outra causa, REVERTER isto e corrigir lá.
 *   Enquanto for `"use client"`, o componente não pode usar API de servidor
 *   (cookies/headers/createClient) — hoje não usa nenhuma: é render puro
 *   sobre `linhas`/`total`/`modo`, que a page (Server Component) já buscou e
 *   passa por prop. A troca de aba (`?modo=`) é navegação (`router.replace`),
 *   não busca de cliente.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A fila de ligações — três abas (Fatia C, 16/09/2026, migração `…266`),
 * uma linha por cliente dentro de cada aba. UI densa e chapada: sem card
 * decorativo por item, hierarquia por posição (nome à esquerda, telefone no
 * centro — o dado mais usado por quem liga —, contexto de tentativas embaixo
 * do nome, ação à direita).
 *
 * 🔑 **Aba na URL** (`?modo=`), padrão de `PlantaoAbas`/`AbasPainel`: trocar
 * de aba é navegação, não `useState` — ver o comentário em
 * `src/app/admin/fila/page.tsx`. Este componente só ESCREVE `modo`, mais
 * nada — nenhum outro parâmetro de busca é tocado.
 *
 * 🔴 LGPD: esta lista NUNCA recebe `entrevista_observacoes` nem decisores —
 * a RPC já não os devolve (ver cabeçalho de `src/lib/data/entrevistas.ts`).
 * Não acrescentar uma busca por cliente aqui para "completar" a linha.
 */

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PhoneCall, Star, FileText, TriangleAlert, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopiarContato } from "@/components/admin/copiar-contato";
import { RegistrarEntrevista } from "@/components/admin/fila/registrar-entrevista";
import { mascaraTelefone } from "@/lib/masks";
import { formatarDataHora } from "@/lib/datas";
import { MODOS_FILA, type FilaDeLigacaoLinha, type ModoFila } from "@/lib/entrevista-tipos";

const ABA_PADRAO: ModoFila = "fila";

const ROTULO_ABA: Record<ModoFila, string> = {
  fila: "Fila",
  sem_contato: "Sem contato",
  agendados: "Agendados",
};

/**
 * Estado vazio de cada aba — os três significam coisas diferentes e não
 * podem compartilhar a mesma frase (fila vazia é boa notícia; sem_contato e
 * agendados vazios, hoje, são o normal — ninguém esgotou tentativas ainda,
 * ninguém marcou retorno ainda).
 */
const VAZIO_POR_MODO: Record<ModoFila, { titulo: string; descricao: string }> = {
  fila: {
    titulo: "Nenhuma ligação pendente",
    descricao:
      "Todos os clientes selecionados para a entrevista prévia já têm um resultado registrado.",
  },
  sem_contato: {
    titulo: "Ninguém esgotou as tentativas",
    descricao:
      "Esta aba reúne quem não atendeu 3 vezes seguidas. Por ora, todo mundo com tentativa registrada ainda está na fila normal.",
  },
  agendados: {
    titulo: "Nenhum retorno marcado",
    descricao:
      "Esta aba reúne quem pediu para ser chamado de novo numa data futura. Ainda não há nenhum retorno agendado.",
  },
};

/** "3ª tentativa" / "1ª ligação" — concordância simples, sem biblioteca. */
function ordinalTentativa(n: number): string {
  return n === 1 ? "1ª" : `${n}ª`;
}

/**
 * Texto de contexto de tentativas de UMA linha, conforme a aba.
 *
 * 🔴 `ultimaTentativaEm` é PASSADO, `retornoEm` é FUTURO — não existe
 * formatador relativo com direção neste projeto (`src/lib/datas.ts` só tem
 * absoluto), então os dois saem em data/hora absoluta. Usar a mesma função
 * para os dois é seguro aqui porque nenhuma delas insinua "há" nem "em"
 * relativo — o prefixo textual ("última em" / "retorno marcado para") é
 * quem carrega a direção, nunca o número sozinho.
 */
function contextoTentativas(linha: FilaDeLigacaoLinha, modo: ModoFila): string {
  if (modo === "agendados" && linha.retornoEm) {
    return `Retorno marcado para ${formatarDataHora(linha.retornoEm)}`;
  }

  if (linha.tentativasTotal === 0) {
    return "1ª ligação";
  }

  const numero = ordinalTentativa(linha.tentativasTotal + (modo === "sem_contato" ? 0 : 1));
  const base =
    modo === "sem_contato"
      ? `${linha.tentativasTotal} tentativas sem contato`
      : `${numero} tentativa`;

  if (!linha.ultimaTentativaEm) return base;
  return `${base} · última em ${formatarDataHora(linha.ultimaTentativaEm)}`;
}

/** Retorno vencido: tem `retornoEm` e a data já passou. Só faz sentido na aba `fila`. */
function retornoVencido(linha: FilaDeLigacaoLinha, modo: ModoFila): boolean {
  if (modo !== "fila" || !linha.retornoEm) return false;
  return new Date(linha.retornoEm).getTime() <= Date.now();
}

export function FilaDeLigacoes({
  linhas,
  total,
  modo,
}: {
  linhas: FilaDeLigacaoLinha[];
  total: number;
  modo: ModoFila;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function trocar(valor: string) {
    if (!(MODOS_FILA as readonly string[]).includes(valor)) return;
    const sp = new URLSearchParams(searchParams.toString());
    // O padrão sai do endereço: `/admin/fila` limpo continua limpo.
    if (valor === ABA_PADRAO) sp.delete("modo");
    else sp.set("modo", valor);
    const q = sp.toString();
    router.replace(`${pathname}${q ? `?${q}` : ""}`, { scroll: false });
  }

  const vazio = VAZIO_POR_MODO[modo];

  return (
    <Tabs value={modo} onValueChange={(v) => trocar(String(v))} className="gap-4">
      <TabsList variant="line" className="justify-start">
        {MODOS_FILA.map((m) => (
          <TabsTrigger key={m} value={m}>
            {ROTULO_ABA[m]}
            {/* Só a aba ATIVA mostra contagem — a RPC devolve `total_linhas`
                do modo pedido, e buscar os 3 totais por abertura triplicaria
                a chamada ao banco (7,48 ms × 3) para popular 2 números que as
                abas inativas não precisam mostrar de cara. */}
            {m === modo ? (
              <Badge variant="secondary" className="ml-1.5 text-[10px]">
                {total}
              </Badge>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value={modo} className="mt-0">
        {linhas.length === 0 ? (
          <EmptyState
            icone={<PhoneCall aria-hidden />}
            titulo={vazio.titulo}
            descricao={vazio.descricao}
          />
        ) : (
          <Card elevacao="flat" className="[--card-spacing:--spacing(0)]">
            <CardContent className="p-0">
              <ul className="divide-y" aria-label={`Fila de ligações — ${ROTULO_ABA[modo]}`}>
                {linhas.map((linha) => {
                  const vencido = retornoVencido(linha, modo);
                  return (
                    <li
                      key={linha.clienteId}
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="grid min-w-0 flex-1 gap-0.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {linha.favorito ? (
                            <Star
                              aria-label="Cliente favorito (acompanhado pela equipe)"
                              className="size-3.5 shrink-0 fill-atencao-foreground text-atencao-foreground"
                            />
                          ) : null}
                          <span className="truncate font-medium text-foreground">
                            {linha.clienteNome}
                          </span>
                        </div>
                        <p className="truncate corpo-sm text-muted-foreground">
                          {linha.parceiroNome ?? "Parceiro não identificado"}
                          {linha.grauRelacao ? ` · ${linha.grauRelacao}` : ""}
                        </p>
                        <p className="flex items-center gap-1 truncate corpo-sm text-muted-foreground">
                          {vencido ? (
                            <span className="flex items-center gap-1 font-medium text-atencao-foreground">
                              <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                              Retorno vencido
                            </span>
                          ) : modo === "agendados" ? (
                            <CalendarClock aria-hidden className="size-3.5 shrink-0" />
                          ) : null}
                          {vencido ? " · " : ""}
                          {contextoTentativas(linha, modo)}
                        </p>
                      </div>

                      <div className="shrink-0 sm:w-44">
                        {linha.telefone ? (
                          <CopiarContato
                            valor={linha.telefone}
                            rotuloAcessivel={`Copiar telefone de ${linha.clienteNome}`}
                            formatar={mascaraTelefone}
                            className="font-medium tabular-nums"
                          />
                        ) : (
                          <span className="corpo-sm text-muted-foreground">
                            Sem telefone
                          </span>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {/* Fatia 5 (15/09/2026): "feature sem porta de entrada é
                            feature que não existe" — sem este link, o dossiê existiria
                            completo e só seria alcançável digitando a URL. */}
                        <Link
                          href={`/admin/operador/cliente/${linha.clienteId}`}
                          aria-label={`Abrir dossiê de ${linha.clienteNome}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          <FileText aria-hidden />
                          Dossiê
                        </Link>
                        <RegistrarEntrevista
                          clienteId={linha.clienteId}
                          clienteNome={linha.clienteNome}
                          discAtual={linha.perfilDisc}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}
