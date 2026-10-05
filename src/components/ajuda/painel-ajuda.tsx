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
import { CircleHelp, MessageSquare, Search } from "lucide-react";
import { buscarAjuda, registrarFeedbackAjuda } from "@/app/ajuda/actions";
import {
  buscaAjudaValida,
  normalizarTermoAjuda,
  AJUDA_TERMO_MAXIMO,
  type ArtigoAjuda,
  type ResultadoBuscaAjuda,
} from "@/lib/ajuda-tipos";
import { ArtigoAjudaItem } from "@/components/ajuda/artigo-ajuda";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

// Botão de verdade (alvo de 44 px, ícone + verbo), não link de 13 px no
// meio da frase: é a saída de quem não achou resposta.
const linkChamado = (
  <Link href="/chamados" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}>
    <MessageSquare aria-hidden />
    Abrir chamado
  </Link>
);

export function PainelAjuda({ rota, artigos }: { rota: string; artigos: ArtigoAjuda[] }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="lg" className="h-11" />
        }
      >
        {/* Texto SEMPRE visível: no celular era só o ícone, e o parceiro não
            reconhece "?" como botão. O nome acessível é o texto visível. */}
        <CircleHelp aria-hidden />
        <span className="sm:hidden">Ajuda</span>
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
  // Botão "Buscar"/Enter: pula a espera de 400 ms. Mesma busca, mesmo
  // registro — só o atraso muda.
  const [pedido, setPedido] = useState(0);
  const imediato = useRef(false);

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
    const espera = imediato.current ? 0 : DEBOUNCE_MS;
    imediato.current = false;
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
    }, espera);
    return () => clearTimeout(t);
  }, [termo, valida, rota, pedido]);

  function buscarAgora(e: React.FormEvent) {
    e.preventDefault();
    // Já respondida com sucesso (ou inválida): nada a refazer. Se a busca
    // FALHOU, "Buscar"/Enter tenta de novo — é o que o aviso pede.
    if (!valida || (atual !== null && atual.ok)) return;
    if (atual !== null) setResposta(null);
    imediato.current = true;
    setPedido((n) => n + 1);
  }

  const status = buscando
    ? "Buscando…"
    : atual?.ok
      ? atual.resultados.length === 0
        ? `Nada encontrado para “${atual.termo}”. Tente outra palavra.`
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
        <DialogDescription className="corpo">
          Toque numa dúvida para ver a resposta.
        </DialogDescription>
      </DialogHeader>

      <form role="search" onSubmit={buscarAgora} className="grid gap-2">
        <Label htmlFor={idBusca} className="corpo">
          Não está na lista? Escreva sua dúvida:
        </Label>
        <div className="flex gap-2">
          <Input
            id={idBusca}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={AJUDA_TERMO_MAXIMO}
            placeholder="Ex.: cadastrar cliente"
            autoComplete="off"
            className="h-11 md:text-base"
          />
          <Button type="submit" size="lg" className="h-11 shrink-0">
            <Search aria-hidden />
            Buscar
          </Button>
        </div>
        <p role="status" className="corpo text-muted-foreground empty:hidden">
          {status}
        </p>
        <p role="alert" className="corpo text-destructive empty:hidden">
          {atual && !atual.ok ? atual.erro : null}
        </p>
      </form>

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
            Dúvidas desta tela
          </h2>
          {artigos.length === 0 ? (
            <p className="corpo py-2 text-muted-foreground">
              Ainda não há respostas para esta tela. Use a busca acima.
            </p>
          ) : (
            artigos.map((a) => (
              <ArtigoAjudaItem key={a.id} artigo={a} origem="tela" depoisDoNao={linkChamado} />
            ))
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3">
        <p className="corpo text-muted-foreground">Não achou? Fale com a equipe.</p>
        {linkChamado}
      </div>
    </>
  );
}
