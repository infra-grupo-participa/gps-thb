"use client";

/**
 * "Como faço?" — ajuda da tela atual, para o PARCEIRO (Onda 5, 02/10/2026).
 *
 * Os artigos da rota chegam por PROP, lidos no servidor (`AjudaDaTela` →
 * `getAjudaPorRota`). Abrir o painel não faz consulta nenhuma; a única ida ao
 * banco daqui é a BUSCA (`buscarAjuda`), com debounce de 400 ms e só a partir
 * de 3 letras.
 *
 * Busca sem resultado é registrada UMA vez, ao FECHAR o painel, com o último
 * termo que ficou sem resultado — nunca por pausa de digitação (cada pedaço de
 * um nome de cliente viraria uma linha guardada por 90 dias; achado do kirad,
 * 02/10) — e uma vez por termo nesta aba.
 *
 * SEM IA: artigo curado pela equipe, busca por texto do Postgres.
 */

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { buscarAjuda, registrarFeedbackAjuda } from "@/app/ajuda/actions";
import {
  buscaAjudaValida,
  normalizarTermoAjuda,
  AJUDA_TERMO_MAXIMO,
  type ArtigoAjuda,
  type ResultadoBuscaAjuda,
} from "@/lib/ajuda-tipos";
import { ArtigoAjudaItem } from "@/components/ajuda/artigo-ajuda";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const DEBOUNCE_MS = 400;

/** Termos sem resultado já registrados nesta aba — 1 registro por termo. */
const buscasVaziasRegistradas = new Set<string>();

/** Última resposta da busca, amarrada ao termo que a pediu. */
type RespostaBusca =
  | { termo: string; ok: true; resultados: ResultadoBuscaAjuda[] }
  | { termo: string; ok: false; erro: string };

const linkChamado = (
  <Link
    href="/chamados"
    className="corpo-sm text-accent-foreground underline-offset-4 hover:underline"
  >
    Abrir um chamado com a equipe
  </Link>
);

export function PainelAjuda({ rota, artigos }: { rota: string; artigos: ArtigoAjuda[] }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="h-11"
            aria-label="Como faço? Ajuda desta tela"
          />
        }
      >
        <CircleHelp aria-hidden />
        <span className="hidden sm:inline">Como faço?</span>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <ConteudoAjuda rota={rota} artigos={artigos} />
      </DialogContent>
    </Dialog>
  );
}

/** Montado só com o diálogo aberto: a busca recomeça limpa a cada abertura. */
function ConteudoAjuda({ rota, artigos }: { rota: string; artigos: ArtigoAjuda[] }) {
  const idBusca = useId();
  const [q, setQ] = useState("");
  const [resposta, setResposta] = useState<RespostaBusca | null>(null);
  const seq = useRef(0);
  const ultimaVazia = useRef<string | null>(null);

  // Ao fechar o painel: registra só a ÚLTIMA busca sem resultado.
  useEffect(() => {
    return () => {
      const t = ultimaVazia.current;
      if (!t) return;
      const chave = t.toLowerCase();
      if (buscasVaziasRegistradas.has(chave)) return;
      buscasVaziasRegistradas.add(chave);
      registrarFeedbackAjuda({ artigoId: null, resolveu: false, origem: "busca", termo: t }).catch(
        () => {},
      );
    };
  }, []);

  const termo = normalizarTermoAjuda(q);
  const valida = buscaAjudaValida(termo);
  // Estado DERIVADO: a resposta só vale para o termo que a pediu. Termo novo
  // sem resposta ainda = "buscando" — nada de setState no corpo do efeito.
  const atual = valida && resposta?.termo === termo ? resposta : null;
  const buscando = valida && atual === null;

  useEffect(() => {
    const minha = ++seq.current;
    if (!valida) return;
    const t = setTimeout(async () => {
      let r: Awaited<ReturnType<typeof buscarAjuda>>;
      try {
        r = await buscarAjuda(termo, rota);
      } catch {
        r = { ok: false, erro: "Não foi possível buscar agora. Tente de novo em instantes." };
      }
      if (minha !== seq.current) return; // a pessoa já digitou outra coisa
      if (!r.ok) {
        setResposta({ termo, ok: false, erro: r.erro });
        return;
      }
      setResposta({ termo, ok: true, resultados: r.resultados });
      ultimaVazia.current = r.resultados.length === 0 ? termo : null;
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [termo, valida, rota]);

  const status = buscando
    ? "Buscando…"
    : atual?.ok
      ? atual.resultados.length === 0
        ? `Nada encontrado para “${atual.termo}”.`
        : atual.resultados.length === 1
          ? "1 resultado."
          : `${atual.resultados.length} resultados.`
      : q.trim().length > 0 && !valida
        ? "Digite ao menos 3 letras para buscar."
        : "";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Como faço?</DialogTitle>
        <DialogDescription>
          Respostas da equipe para esta tela. Não achou o que precisa? Busque abaixo ou abra
          um chamado.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor={idBusca}>Buscar na ajuda</Label>
        <Input
          id={idBusca}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={AJUDA_TERMO_MAXIMO}
          placeholder="Ex.: cadastrar cliente"
          autoComplete="off"
        />
        <p role="status" className="corpo-sm text-muted-foreground empty:hidden">
          {status}
        </p>
        <p role="alert" className="corpo-sm text-destructive empty:hidden">
          {atual && !atual.ok ? atual.erro : null}
        </p>
      </div>

      {valida ? (
        atual?.ok && atual.resultados.length > 0 ? (
          <section aria-label="Resultados da busca">
            {atual.resultados.map((a) => (
              <ArtigoAjudaItem
                key={a.id}
                artigo={a}
                origem="busca"
                depoisDoNao={linkChamado}
              />
            ))}
          </section>
        ) : null
      ) : (
        <section aria-labelledby={`${idBusca}-tela`}>
          <h2 id={`${idBusca}-tela`} className="rotulo text-muted-foreground">
            Nesta tela
          </h2>
          {artigos.length === 0 ? (
            <p className="corpo-sm py-2 text-muted-foreground">
              Ainda não há artigo para esta tela. Use a busca acima.
            </p>
          ) : (
            artigos.map((a) => (
              <ArtigoAjudaItem key={a.id} artigo={a} origem="tela" depoisDoNao={linkChamado} />
            ))
          )}
        </section>
      )}

      <p className="corpo-sm border-t pt-3 text-muted-foreground">
        Não resolveu? {linkChamado}.
      </p>
    </>
  );
}
