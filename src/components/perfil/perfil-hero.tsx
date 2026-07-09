import Link from "next/link";
import { AtSign, Video, Link2, Globe, GraduationCap, Pencil } from "lucide-react";
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
    { url: normalizar(perfil.instagram ?? aluno.instagram_url ?? "", "instagram"), Icon: AtSign, nome: "Instagram" },
    { url: normalizar(perfil.youtube ?? aluno.youtube_url ?? "", "youtube"), Icon: Video, nome: "YouTube" },
    { url: normalizar(perfil.linkedin ?? "", "linkedin"), Icon: Link2, nome: "LinkedIn" },
    { url: normalizar(perfil.facebook ?? aluno.link_facebook ?? "", "facebook"), Icon: Link2, nome: "Facebook" },
    { url: normalizar(perfil.site ?? aluno.site_profissional ?? "", "site"), Icon: Globe, nome: "Site" },
  ].filter((r) => r.url);

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="relative bg-gradient-to-br from-primary to-orange-700 px-6 py-7 text-primary-foreground">
        <div
          aria-hidden
          className="absolute -right-16 -top-16 size-48 rounded-full bg-white/10 blur-2xl"
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl font-bold backdrop-blur">
            {iniciais(aluno.nome)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-primary-foreground/80">
              Olá{primeiroNome ? `, ${primeiroNome}` : ""}!
            </div>
            <div className="truncate text-xl font-semibold">
              {aluno.nome ?? "Aluno"}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              {turma ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 font-medium">
                  <GraduationCap className="size-3" /> Turma {turma}
                </span>
              ) : null}
              {(perfil.profissao ?? aluno.profissao) ? (
                <span className="rounded-full bg-white/15 px-2 py-0.5 font-medium">
                  {perfil.profissao ?? aluno.profissao}
                </span>
              ) : null}
              {cidadeUf ? (
                <span className="rounded-full bg-white/15 px-2 py-0.5 font-medium">
                  {cidadeUf}
                </span>
              ) : null}
            </div>
          </div>

          <Link
            href={editHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium backdrop-blur transition hover:bg-white/25"
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
                className="flex size-8 items-center justify-center rounded-lg bg-white/15 transition hover:bg-white/25"
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
