"use client";

/**
 * Sugestão de artigos enquanto o parceiro escreve o chamado (Onda 5,
 * 02/10/2026).
 *
 * - Busca só com 3 palavras ou mais, 400 ms depois da última tecla.
 * - Até 3 artigos. Abrir um registra VISTA com origem `chamado`; o "Isso
 *   resolveu?" também vai com `chamado`.
 * - 🔴 NUNCA bloqueia o envio: não tem estado que o diálogo leia, e falha de
 *   busca some em silêncio (a sugestão é ajuda extra, o chamado é o canal).
 * - Busca vazia NÃO é registrada aqui: o termo é o texto do chamado, não uma
 *   busca da pessoa na central (e a origem `chamado` não aceita artigo nulo).
 */

import { useEffect, useId, useRef, useState } from "react";
import { buscarAjuda } from "@/app/ajuda/actions";
import {
  normalizarTermoAjuda,
  type CategoriaAjuda,
  type ResultadoBuscaAjuda,
} from "@/lib/ajuda-tipos";
import { ArtigoAjudaItem } from "@/components/ajuda/artigo-ajuda";

const DEBOUNCE_MS = 400;
const MINIMO_PALAVRAS = 3;
const MAXIMO_SUGESTOES = 3;

function contarPalavras(t: string): number {
  return t.split(" ").filter((p) => /[\p{L}\p{N}]/u.test(p)).length;
}

export function SugestoesChamado({
  texto,
  categoria,
}: {
  /** Assunto + mensagem, como a pessoa está digitando. */
  texto: string;
  categoria?: CategoriaAjuda | null;
}) {
  const idTitulo = useId();
  const termo = normalizarTermoAjuda(texto);
  const pronto = contarPalavras(termo) >= MINIMO_PALAVRAS;
  const [resposta, setResposta] = useState<{
    termo: string;
    artigos: ResultadoBuscaAjuda[];
  } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const minha = ++seq.current;
    if (!pronto) return;
    const t = setTimeout(async () => {
      try {
        const r = await buscarAjuda(termo, "/chamados", categoria ?? null);
        if (minha !== seq.current || !r.ok) return;
        setResposta({ termo, artigos: r.resultados.slice(0, MAXIMO_SUGESTOES) });
      } catch {
        // Silêncio de propósito: ver o comentário do topo.
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [termo, pronto, categoria]);

  // Mantém a última lista enquanto a próxima não chega — a lista não pisca a
  // cada tecla; some só quando o texto deixa de ter 3 palavras.
  const artigos = pronto && resposta ? resposta.artigos : [];
  if (artigos.length === 0) return null;

  return (
    <section aria-labelledby={idTitulo} className="rounded-md border px-3 pt-3">
      <h3 id={idTitulo} className="corpo font-semibold">
        Isto pode responder sua dúvida
      </h3>
      <p className="corpo text-muted-foreground">
        Toque para ler. Se não resolver, envie o chamado normalmente.
      </p>
      {artigos.map((a) => (
        <ArtigoAjudaItem key={a.id} artigo={a} origem="chamado" />
      ))}
    </section>
  );
}
