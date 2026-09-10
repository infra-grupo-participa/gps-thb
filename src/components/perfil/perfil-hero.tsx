import Link from "next/link";
import { PadraoTrilha } from "@/components/ui/padrao-trilha";
import { GraduationCap, Pencil } from "lucide-react";
import {
  FaInstagram,
  FaYoutube,
  FaLinkedinIn,
  FaFacebookF,
  FaGlobe,
} from "react-icons/fa6";
import { META_HONORARIOS } from "@/lib/etapa1";
import { brlInteiro } from "@/lib/moeda";
import { buttonVariants } from "@/components/ui/button";
import type { Aluno, PerfilAluno } from "@/lib/types";

function iniciais(nome: string | null): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0][0] + (partes[1]?.[0] ?? "")).toUpperCase();
}

function normalizar(valor: string, tipo: string): string {
  const v = valor.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (tipo === "instagram")
    return `https://instagram.com/${v.replace(/^@/, "")}`;
  return `https://${v}`;
}

/** Chip neutro de identidade (turma, profissão, cidade). */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-superficie-afundada px-2 py-0.5 text-xs font-medium text-neutro-foreground">
      {children}
    </span>
  );
}

/**
 * O bloco do topo da home do aluno.
 *
 * 🔑 Ele MUDOU DE ASSUNTO (B.9 da direção "Trilha"). Era um gradiente laranja
 * de 200 px — o elemento mais alto, mais colorido e mais largo da página —
 * informando nome, turma, profissão e cidade: dados que o aluno já sabe.
 * Metade da largura era área morta. O produto gritava a identidade e sussurrava
 * a tarefa.
 *
 * Agora é um **hero de PROGRAMA**, em três colunas: quem é · em que etapa está
 * · quanto falta para a meta. A identidade continua (é o cumprimento), mas
 * divide o espaço com o que o portal existe para responder.
 *
 * - Fundo branco quente + `PadraoTrilha` em `accent`: a única decoração do
 *   produto, e ela DIZ o que o produto é (um roteiro). Não é gradiente, não é
 *   blob com blur — os dois clichês que estavam aqui.
 * - `programa` é opcional: sem ele o hero é só a identidade, e nada é
 *   inventado. `honorariosTotal === null` (nenhum contratado com valor) NÃO
 *   vira R$ 0,00 — mostra a meta, como a `MetaHonorarios` já fazia.
 * - A meta é o **AURUM** (R$ 150.000), com a mesma frase da aba Financeiro e
 *   do painel da home: "faltam R$ X para o AURUM". Três telas, uma régua.
 * - Nome NUNCA trunca: a 390 px os chips iam para a linha de baixo e o nome
 *   saía "Marian…". Nome de pessoa não se corta.
 */
export function PerfilHero({
  aluno,
  turma,
  perfil,
  editHref,
  programa,
}: {
  aluno: Aluno;
  turma: string | null;
  perfil: PerfilAluno;
  editHref: string;
  /** Onde o aluno está no programa. Ausente = hero só de identidade. */
  programa?: {
    /** Ordem da etapa em andamento (a liberada mais avançada com pendência). */
    etapaOrdem: number;
    etapaNome: string;
    /** Progresso da etapa em andamento, 0–100. */
    pct: number;
    /** Honorários contratados do ambiente. `null` = nenhum valor registrado. */
    honorariosTotal: number | null;
  };
}) {
  const primeiroNome = (aluno.nome ?? "").split(" ")[0];
  const cidadeUf = [perfil.cidade ?? aluno.cidade, perfil.estado ?? aluno.estado]
    .filter(Boolean)
    .join(" · ");

  const redes = [
    { url: normalizar(perfil.instagram ?? aluno.instagram_url ?? "", "instagram"), Icon: FaInstagram, nome: "Instagram" },
    { url: normalizar(perfil.youtube ?? aluno.youtube_url ?? "", "youtube"), Icon: FaYoutube, nome: "YouTube" },
    { url: normalizar(perfil.linkedin ?? "", "linkedin"), Icon: FaLinkedinIn, nome: "LinkedIn" },
    { url: normalizar(perfil.facebook ?? aluno.link_facebook ?? "", "facebook"), Icon: FaFacebookF, nome: "Facebook" },
    { url: normalizar(perfil.site ?? aluno.site_profissional ?? "", "site"), Icon: FaGlobe, nome: "Site" },
  ].filter((r) => r.url);

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-(--shadow-raised) sm:p-6">
      {/* `text-primary` aqui é DECORAÇÃO, não texto: o padrão herda a cor por
          `currentColor` e fica a 10% — não há conteúdo para contrastar. */}
      <PadraoTrilha className="text-primary" opacidade={0.1} />

      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8">
        {/* ── Identidade ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          {/* Único laranja cheio do bloco. `marca-solida` (#B04300) porque
              carrega texto branco: `primary` daria 2,98:1. */}
          <div
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-marca-solida font-heading text-lg font-bold text-white"
          >
            {iniciais(aluno.nome)}
          </div>
          <div className="min-w-0 flex-1 basis-40">
            <div className="corpo-sm text-muted-foreground">
              Olá{primeiroNome ? `, ${primeiroNome}` : ""}!
            </div>
            <div className="font-heading text-xl font-semibold text-balance">
              {aluno.nome ?? "Aluno"}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {turma ? (
                <Chip>
                  <GraduationCap className="size-3" aria-hidden /> Turma {turma}
                </Chip>
              ) : null}
              {(perfil.profissao ?? aluno.profissao) ? (
                <Chip>{perfil.profissao ?? aluno.profissao}</Chip>
              ) : null}
              {cidadeUf ? <Chip>{cidadeUf}</Chip> : null}
            </div>
          </div>
        </div>

        {/* ── Programa: etapa em andamento · meta ─────────────────────── */}
        {programa ? (
          <div className="grid grid-cols-2 gap-4 border-t pt-4 sm:gap-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <div className="min-w-0">
              <div className="rotulo text-muted-foreground">
                Etapa {String(programa.etapaOrdem).padStart(2, "0")}
              </div>
              <div className="numero-lg mt-0.5 text-accent-foreground">
                {programa.pct}%
              </div>
              <p className="corpo-sm text-muted-foreground text-balance">
                {programa.etapaNome}
              </p>
            </div>
            <div className="min-w-0">
              <div className="rotulo text-muted-foreground">
                Meta de faturamento
              </div>
              {/* `null` não vira R$ 0,00: sem contratado com valor, o portal
                  não sabe o faturamento e mostra só a régua. */}
              {programa.honorariosTotal !== null ? (
                <>
                  <div className="numero-lg mt-0.5">
                    {brlInteiro(programa.honorariosTotal)}
                  </div>
                  <p className="corpo-sm text-muted-foreground text-balance">
                    de {brlInteiro(META_HONORARIOS)}
                    {programa.honorariosTotal >= META_HONORARIOS ? (
                      <> · AURUM alcançado</>
                    ) : (
                      <>
                        {" · faltam "}
                        {brlInteiro(META_HONORARIOS - programa.honorariosTotal)}{" "}
                        para o AURUM
                      </>
                    )}
                  </p>
                </>
              ) : (
                /* 🔴 Sem contratado, o hero mostrava R$ 150.000 em `numero-lg`
                   cinza com "meta de R$ 150.000" embaixo — na posição do
                   número faturado, o valor lê como FATURAMENTO, e o rótulo
                   pequeno não desfaz o que o número grande já afirmou. Sem
                   dado não há número grande: fica a régua, em uma linha. */
                <p className="corpo-sm mt-0.5 text-muted-foreground text-balance">
                  meta de {brlInteiro(META_HONORARIOS)} — o AURUM
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
        <Link
          href={editHref}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Pencil aria-hidden /> Editar perfil
        </Link>
        {redes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {redes.map((r) => (
              <a
                key={r.nome}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                title={r.nome}
                className="foco-visivel flex size-8 items-center justify-center rounded-lg bg-superficie-afundada text-neutro-foreground transition hover:bg-borda-fina hover:text-foreground"
              >
                <r.Icon className="size-4" aria-hidden />
                <span className="sr-only">{r.nome}</span>
              </a>
            ))}
          </div>
        ) : null}
      </div>

      {perfil.bio ? (
        <p className="relative mt-4 max-w-[62ch] corpo-sm text-muted-foreground">
          {perfil.bio}
        </p>
      ) : null}
    </div>
  );
}
