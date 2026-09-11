"use client";

/**
 * O vazio da lista de alunos: o que dizer quando a busca ou os filtros não
 * acharam ninguém.
 *
 * 🔑 A frase precisa distinguir "não existe" de "não está NESTE lote" — a
 * lista é paginada e a busca só varre o que está em memória. Por isso o
 * "Carregar mais" aparece AQUI, e não só no rodapé: quem buscou e não achou é
 * exatamente quem precisa saber que ainda há gente fora do lote.
 */

import Link from "next/link";
import { Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export function ListaVazia({
  termo,
  buscando,
  filtrosAtivos,
  setTermo,
  limparFiltros,
  carregarMaisHref,
  carregarMaisQtd,
}: {
  termo: string;
  buscando: boolean;
  /** Filtros marcados, já em português, para a frase do vazio. */
  filtrosAtivos: string[];
  setTermo: (termo: string) => void;
  limparFiltros: () => void;
  carregarMaisHref: string | null;
  carregarMaisQtd: number;
}) {
  return (
    <EmptyState
      icone={<Search />}
      titulo={
        buscando
          ? `Nenhum parceiro para «${termo.trim()}»`
          : filtrosAtivos.length > 0
            ? `Nenhum parceiro ${filtrosAtivos.join(" e ")}.`
            : "Nenhum parceiro para exibir."
      }
      descricao={
        buscando && filtrosAtivos.length > 0
          ? `A busca foi feita só entre os parceiros filtrados por ${filtrosAtivos.join(
              " e ",
            )}. Limpe os filtros para procurar na lista inteira.`
          : buscando
            ? "Confira a grafia ou procure por parte do e-mail — a busca ignora acentos e a ordem das palavras."
            : undefined
      }
      acao={
        <>
          {buscando ? (
            <Button variant="outline" size="sm" onClick={() => setTermo("")}>
              Limpar busca
            </Button>
          ) : null}
          {filtrosAtivos.length > 0 ? (
            <Button variant="outline" size="sm" onClick={limparFiltros}>
              Limpar filtros
            </Button>
          ) : null}
          {/* Aqui o botão importa mais do que no fim da lista: quem
              buscou e não achou precisa saber que ainda há gente fora do
              lote carregado. */}
          {carregarMaisHref ? (
            <Link
              href={carregarMaisHref}
              scroll={false}
              prefetch={false}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Carregar mais {carregarMaisQtd}
            </Link>
          ) : null}
        </>
      }
    />
  );
}
