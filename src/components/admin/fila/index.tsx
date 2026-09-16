"use client";

/**
 * 🔴 CONTORNO, NÃO CORREÇÃO (16/09/2026).
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
 * ⚠️ Se o log aparecer e apontar outra causa, REVERTER isto e corrigir lá.
 *   Enquanto for `"use client"`, o componente não pode usar API de servidor
 *   (cookies/headers/createClient) — hoje não usa nenhuma: é render puro
 *   sobre `linhas`, que a page (Server Component) já buscou e passa por prop.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A fila de ligações — uma linha por cliente, FIFO (mais antigo primeiro,
 * ordem que já vem de `gps.fila_de_ligacoes`). UI densa e chapada: sem card
 * decorativo por item, hierarquia por posição (nome à esquerda, telefone no
 * centro — o dado mais usado por quem liga —, ação à direita).
 *
 * 🔴 LGPD: esta lista NUNCA recebe `entrevista_observacoes` nem decisores —
 * a RPC já não os devolve (ver cabeçalho de `src/lib/data/entrevistas.ts`).
 * Não acrescentar uma busca por cliente aqui para "completar" a linha.
 */

import Link from "next/link";
import { PhoneCall, Star, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { CopiarContato } from "@/components/admin/copiar-contato";
import { RegistrarEntrevista } from "@/components/admin/fila/registrar-entrevista";
import { mascaraTelefone } from "@/lib/masks";
import type { FilaDeLigacaoLinha } from "@/lib/entrevista-tipos";

/**
 * A fila de ligações — uma linha por cliente, FIFO (mais antigo primeiro,
 * ordem que já vem de `gps.fila_de_ligacoes`). UI densa e chapada: sem card
 * decorativo por item, hierarquia por posição (nome à esquerda, telefone no
 * centro — o dado mais usado por quem liga —, ação à direita).
 *
 * 🔴 LGPD: esta lista NUNCA recebe `entrevista_observacoes` nem decisores —
 * a RPC já não os devolve (ver cabeçalho de `src/lib/data/entrevistas.ts`).
 * Não acrescentar uma busca por cliente aqui para "completar" a linha.
 */
export function FilaDeLigacoes({ linhas }: { linhas: FilaDeLigacaoLinha[] }) {
  if (linhas.length === 0) {
    return (
      <EmptyState
        icone={<PhoneCall aria-hidden />}
        titulo="Nenhuma ligação pendente"
        descricao="Todos os clientes selecionados para a entrevista prévia já têm um resultado registrado."
      />
    );
  }

  return (
    <Card elevacao="flat" className="[--card-spacing:--spacing(0)]">
      <CardContent className="p-0">
        <ul className="divide-y" aria-label="Fila de ligações">
          {linhas.map((linha) => (
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
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
