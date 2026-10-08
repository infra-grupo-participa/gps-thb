"use client";

/**
 * Sino da equipe: contador de não lidos + painel com os últimos 30 avisos +
 * pop-up em tempo real das atualizações dos alunos.
 *
 * Pedido do dono (08/10/2026): "um ícone de notificações, as principais
 * notificações caírem lá, aparecer um pop-up com as atualizações dos alunos,
 * para a equipe ficar entendida do que ocorre em tempo real".
 *
 * Todo o estado de rede vive em `src/lib/avisos-equipe-loja.ts` (módulo, uma
 * vez por aba) — este componente remonta a cada troca de página, porque o
 * `AppHeader` é renderizado por página e não por layout. Ver o cabeçalho da loja.
 *
 * Sem biblioteca de popover, pelo mesmo motivo de `menu-de-contas.tsx`: Esc
 * fecha e devolve o foco ao sino, clique fora fecha.
 */

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  FileText,
  Map as IconeMapa,
  MessageSquarePlus,
  MessageSquareReply,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { AvisoItem, TipoAviso } from "@/lib/avisos-tipos";
import { rotuloContador, TOAST_DURACAO_MS } from "@/lib/avisos-toast";
import {
  abrirLista,
  assinar,
  definirSilencio,
  lerChavePush,
  lerEstado,
  lerEstadoServidor,
  registrarToast,
} from "@/lib/avisos-equipe-loja";
import { formatarHaQuanto } from "@/lib/datas";
import { PushAvisosBotao } from "@/components/admin/push-avisos-botao";

const ICONE: Record<TipoAviso, LucideIcon> = {
  chamado_aberto: MessageSquarePlus,
  chamado_resposta: MessageSquareReply,
  minuta_anexada: FileText,
  croqui_anexado: IconeMapa,
  sessao_marcada: CalendarCheck,
  sessao_cancelada: CalendarX,
  aluno_novo: UserPlus,
  plantao_inscricao: CalendarClock,
};

type Lista =
  | { fase: "fechado" }
  | { fase: "carregando" }
  | { fase: "erro"; erro: string }
  /** `agora` = instante da leitura: base do "há 5 min" (fora do render). */
  | { fase: "pronto"; itens: AvisoItem[]; agora: number };

export function SinoAvisos({ email }: { email: string | null }) {
  const router = useRouter();
  const assinarComEmail = useCallback((o: () => void) => assinar(o, email), [email]);
  const est = useSyncExternalStore(assinarComEmail, lerEstado, lerEstadoServidor);

  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<Lista>({ fase: "fechado" });
  const [chavePush, setChavePush] = useState("");
  const caixaRef = useRef<HTMLDivElement>(null);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const idPainel = useId();

  const abrir = useCallback(() => {
    setAberto(true);
    setLista({ fase: "carregando" });
    void abrirLista().then((r) =>
      setLista(r.ok ? { fase: "pronto", itens: r.itens, agora: Date.now() } : { fase: "erro", erro: r.erro }),
    );
    void lerChavePush().then(setChavePush);
  }, []);

  const fechar = useCallback((devolverFoco: boolean) => {
    setAberto(false);
    if (devolverFoco) gatilhoRef.current?.focus();
  }, []);

  // O pop-up agrupado ("3 atualizações novas") não tem destino: abre o sino.
  const abrirRef = useRef(abrir);
  useEffect(() => {
    abrirRef.current = abrir;
  }, [abrir]);

  useEffect(
    () =>
      registrarToast((plano) => {
        toast.custom(
          (id) => (
            <button
              type="button"
              onClick={() => {
                toast.dismiss(id);
                if (plano.url) router.push(plano.url);
                else abrirRef.current();
              }}
              className="foco-visivel block w-[min(356px,calc(100vw-2rem))] rounded-md border border-borda-forte bg-card px-3 py-2 text-left shadow-md hover:bg-superficie-afundada"
            >
              <span className="block corpo-sm font-medium">{plano.titulo}</span>
              {plano.descricao ? (
                <span className="block corpo-sm text-muted-foreground">{plano.descricao}</span>
              ) : (
                <span className="block corpo-sm text-muted-foreground">Abrir os avisos</span>
              )}
            </button>
          ),
          { duration: TOAST_DURACAO_MS },
        );
      }),
    [router],
  );

  // Foco vai para o título do painel ao abrir.
  useEffect(() => {
    if (aberto) tituloRef.current?.focus();
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") fechar(true);
    }
    function aoClicar(e: MouseEvent) {
      if (!caixaRef.current?.contains(e.target as Node)) fechar(false);
    }
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("mousedown", aoClicar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("mousedown", aoClicar);
    };
  }, [aberto, fechar]);

  if (est.fase === "oculto") return null;

  const selo = rotuloContador(est.naoLidos);
  const falado =
    est.fase === "indisponivel"
      ? "Avisos da equipe — contagem indisponível"
      : selo
        ? `Avisos da equipe — ${selo} não ${est.naoLidos === 1 ? "lido" : "lidos"}`
        : "Avisos da equipe — nenhum não lido";

  return (
    <div ref={caixaRef} className="relative">
      <button
        ref={gatilhoRef}
        type="button"
        onClick={() => (aberto ? fechar(false) : abrir())}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? idPainel : undefined}
        aria-label={falado}
        className="relative flex size-9 items-center justify-center rounded-lg transition hover:bg-superficie-afundada focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Bell aria-hidden className="size-5" />
        {selo ? (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-marca-solida px-1 text-center text-[10px] leading-4 font-bold text-white"
          >
            {selo}
          </span>
        ) : null}
      </button>
      {/* O número muda sem foco no sino: a região anuncia, o botão só nomeia. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {selo ? `${selo} ${est.naoLidos === 1 ? "aviso não lido" : "avisos não lidos"}` : ""}
      </span>

      {aberto ? (
        <div
          id={idPainel}
          role="dialog"
          aria-label="Avisos da equipe"
          className="fixed inset-x-2 top-14 z-50 flex max-h-[calc(100dvh-4.5rem)] flex-col rounded-md border border-borda-forte bg-card shadow-lg sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-96"
        >
          <h2
            ref={tituloRef}
            tabIndex={-1}
            className="border-b border-borda-fina px-3 py-2 corpo-sm font-medium outline-none"
          >
            Avisos da equipe
          </h2>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {lista.fase === "carregando" ? (
              <p className="px-3 py-3 corpo-sm text-muted-foreground" aria-busy="true">
                Carregando…
              </p>
            ) : lista.fase === "erro" ? (
              <p role="alert" className="px-3 py-3 corpo-sm">
                {lista.erro}
              </p>
            ) : lista.fase === "pronto" && lista.itens.length === 0 ? (
              <p className="px-3 py-3 corpo-sm text-muted-foreground">Nenhum aviso ainda.</p>
            ) : lista.fase === "pronto" ? (
              <ul>
                {lista.itens.map((i) => {
                  const Icone = ICONE[i.tipo] ?? Bell;
                  const quando = formatarHaQuanto(i.criado_em, lista.agora);
                  return (
                    <li key={i.id} className="border-b border-borda-fina last:border-b-0">
                      <Link
                        href={i.url}
                        prefetch={false}
                        onClick={() => fechar(false)}
                        className={
                          "flex gap-2 border-l-2 px-3 py-2 hover:bg-superficie-afundada focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring " +
                          (i.lido ? "border-transparent" : "border-marca-solida bg-superficie-afundada")
                        }
                      >
                        <Icone aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className={"block corpo-sm " + (i.lido ? "" : "font-medium")}>
                            {i.resumo}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {i.rotulo}
                            {quando ? ` · ${quando}` : ""}
                            {i.lido ? "" : " · novo"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <div className="grid gap-2 border-t border-borda-fina px-3 py-2">
            <label className="flex items-center gap-2 corpo-sm">
              <input
                type="checkbox"
                checked={est.silenciado}
                onChange={(e) => definirSilencio(e.target.checked)}
                className="size-4"
              />
              Silenciar pop-ups neste navegador
            </label>
            {chavePush ? (
              <div className="grid gap-1">
                <p className="corpo-sm font-medium">Receber avisos neste aparelho</p>
                <PushAvisosBotao chavePublica={chavePush} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
