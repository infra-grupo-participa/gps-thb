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

export function PerfilHero({
  aluno,
  turma,
  perfil,
  editHref,
}: {
  aluno: Aluno;
  turma: string | null;
  perfil: PerfilAluno;
  editHref: string;
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
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="relative overflow-hidden bg-marca-solida px-6 py-7 text-white">
        {/* Era gradiente + um blob com `blur-2xl` — decoração que aparece
            igual em qualquer template. Mesma peça do login, e o mesmo tom:
            `marca-solida` porque o bloco inteiro é texto branco. */}
        <PadraoTrilha opacidade={0.16} />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-black/15 text-xl font-bold backdrop-blur">
            {iniciais(aluno.nome)}
          </div>
          <div className="min-w-0 flex-1 basis-40">
            <div className="corpo-sm text-white/85">
              Olá{primeiroNome ? `, ${primeiroNome}` : ""}!
            </div>
            {/* Sem `truncate`: a 390 px o nome da aluna saía "Marian…" porque
                os chips disputavam a mesma linha. `text-balance` + a base de
                40 acima mandam os chips para a linha de baixo em vez de
                comerem o nome. Nome de pessoa não se corta. */}
            <div className="font-heading text-xl font-semibold text-balance">
              {aluno.nome ?? "Aluno"}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              {turma ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 font-medium">
                  <GraduationCap className="size-3" /> Turma {turma}
                </span>
              ) : null}
              {(perfil.profissao ?? aluno.profissao) ? (
                <span className="rounded-full bg-black/15 px-2 py-0.5 font-medium">
                  {perfil.profissao ?? aluno.profissao}
                </span>
              ) : null}
              {cidadeUf ? (
                <span className="rounded-full bg-black/15 px-2 py-0.5 font-medium">
                  {cidadeUf}
                </span>
              ) : null}
            </div>
          </div>

          <Link
            href={editHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-black/15 px-3 py-1.5 text-sm font-medium backdrop-blur transition hover:bg-black/25"
          >
            <Pencil className="size-4" /> Editar perfil
          </Link>
        </div>

        {redes.length > 0 ? (
          <div className="relative mt-4 flex flex-wrap gap-2">
            {redes.map((r) => (
              <a
                key={r.nome}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                title={r.nome}
                className="flex size-8 items-center justify-center rounded-lg bg-black/15 transition hover:bg-black/25"
              >
                <r.Icon className="size-4" />
              </a>
            ))}
          </div>
        ) : null}
      </div>

      {perfil.bio ? (
        <div className="px-6 py-4 text-sm text-muted-foreground">
          {perfil.bio}
        </div>
      ) : null}
    </div>
  );
}
