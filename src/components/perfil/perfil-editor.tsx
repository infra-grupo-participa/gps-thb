"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Phone, Briefcase, MapPin, GraduationCap } from "lucide-react";
import {
  FaInstagram,
  FaYoutube,
  FaLinkedinIn,
  FaFacebookF,
  FaGlobe,
} from "react-icons/fa6";
import type { Aluno, PerfilAluno } from "@/lib/types";
import { mascaraTelefone } from "@/lib/masks";
import { salvarPerfilAluno } from "@/app/perfil/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

function iniciais(nome: string | null): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0][0] + (partes[1]?.[0] ?? "")).toUpperCase();
}

export function PerfilEditor({
  aluno,
  turma,
  perfilInicial,
  /** Preenchido só no modo assistência: o admin edita o perfil deste aluno. */
  alunoId,
}: {
  aluno: Aluno;
  turma: string | null;
  perfilInicial: PerfilAluno;
  alunoId?: string;
}) {
  const p = perfilInicial;
  const [telefone, setTelefone] = useState(
    mascaraTelefone(p.telefone ?? aluno.telefone ?? ""),
  );
  const [profissao, setProfissao] = useState(
    p.profissao ?? aluno.profissao ?? "",
  );
  const [cidade, setCidade] = useState(p.cidade ?? aluno.cidade ?? "");
  const [estado, setEstado] = useState(p.estado ?? aluno.estado ?? "");
  const [bio, setBio] = useState(p.bio ?? "");
  const [instagram, setInstagram] = useState(
    p.instagram ?? aluno.instagram_url ?? "",
  );
  const [youtube, setYoutube] = useState(p.youtube ?? aluno.youtube_url ?? "");
  const [linkedin, setLinkedin] = useState(p.linkedin ?? "");
  const [facebook, setFacebook] = useState(
    p.facebook ?? aluno.link_facebook ?? "",
  );
  const [site, setSite] = useState(p.site ?? aluno.site_profissional ?? "");
  const [pending, startTransition] = useTransition();

  function salvar() {
    startTransition(async () => {
      const res = await salvarPerfilAluno(
        {
          telefone,
          profissao,
          cidade,
          estado,
          bio,
          instagram,
          youtube,
          linkedin,
          facebook,
          site,
        },
        alunoId,
      );
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success("Perfil atualizado.");
    });
  }

  return (
    <Card className="overflow-hidden">
      {/* Cabeçalho estilo cartão */}
      <div className="relative bg-gradient-to-br from-primary to-orange-700 p-6 text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl font-bold backdrop-blur">
            {iniciais(aluno.nome)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">
              {aluno.nome ?? "Aluno"}
            </div>
            <div className="truncate text-sm text-primary-foreground/80">
              {aluno.email}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {turma ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium">
                  <GraduationCap className="size-3" /> Turma {turma}
                </span>
              ) : null}
              {aluno.plano ? (
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium capitalize">
                  {aluno.plano}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <CardHeader>
        <CardTitle className="text-base">Meus dados</CardTitle>
        <p className="text-sm text-muted-foreground">
          Complete seu cartão de identificação. Essas informações ajudam a
          equipe a te conhecer melhor.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo
            label="Telefone / WhatsApp"
            icon={<Phone className="size-4" />}
          >
            <Input
              value={telefone}
              onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
              placeholder="(00) 00000-0000"
              className="pl-9"
            />
          </Campo>
          <Campo label="Profissão" icon={<Briefcase className="size-4" />}>
            <Input
              value={profissao}
              onChange={(e) => setProfissao(e.target.value)}
              placeholder="Ex.: Advogado(a)"
              className="pl-9"
            />
          </Campo>
          <Campo label="Cidade" icon={<MapPin className="size-4" />}>
            <Input
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              placeholder="Sua cidade"
              className="pl-9"
            />
          </Campo>
          <Campo label="Estado (UF)" icon={<MapPin className="size-4" />}>
            <Input
              value={estado}
              onChange={(e) => setEstado(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="UF"
              className="pl-9"
            />
          </Campo>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="bio">Sobre você</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Uma breve apresentação sua."
            rows={3}
          />
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">Redes sociais</div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Campo label="Instagram" icon={<FaInstagram className="size-4" />}>
              <Input
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@seuusuario ou link"
                className="pl-9"
              />
            </Campo>
            <Campo label="YouTube" icon={<FaYoutube className="size-4" />}>
              <Input
                value={youtube}
                onChange={(e) => setYoutube(e.target.value)}
                placeholder="Link do canal"
                className="pl-9"
              />
            </Campo>
            <Campo label="LinkedIn" icon={<FaLinkedinIn className="size-4" />}>
              <Input
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
                placeholder="Link do perfil"
                className="pl-9"
              />
            </Campo>
            <Campo label="Facebook" icon={<FaFacebookF className="size-4" />}>
              <Input
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                placeholder="Link do perfil"
                className="pl-9"
              />
            </Campo>
            <Campo label="Site" icon={<FaGlobe className="size-4" />}>
              <Input
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="https://..."
                className="pl-9"
              />
            </Campo>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando..." : "Salvar perfil"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Campo({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}
