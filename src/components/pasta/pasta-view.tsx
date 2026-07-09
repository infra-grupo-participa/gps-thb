"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderOpen, ExternalLink, FolderTree } from "lucide-react";
import { ESTRUTURA_PASTA } from "@/lib/pasta";
import { salvarPastaDriveUrl } from "@/app/admin/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function PastaView({
  alunoId,
  pastaUrl,
  isAdmin,
}: {
  alunoId: string;
  pastaUrl: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(pastaUrl ?? "");
  const [pending, startTransition] = useTransition();

  function salvar() {
    startTransition(async () => {
      const res = await salvarPastaDriveUrl(alunoId, url);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success("Pasta salva.");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      {/* Config do admin */}
      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Link da pasta (Drive)</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cole o link da pasta do Google Drive deste aluno (compartilhada
              entre a equipe e o aluno).
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
              />
              <Button onClick={salvar} disabled={pending}>
                {pending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Acesso à pasta */}
      {pastaUrl ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <FolderOpen className="size-5 text-primary" />
              <div>
                <CardTitle className="text-base">Pasta do aluno</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Seus documentos, vídeos e minutas — sempre à mão.
                </p>
              </div>
            </div>
            <a
              href={pastaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Abrir no Drive <ExternalLink className="size-4" />
            </a>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Sua pasta abre no Google Drive, na conta que tem acesso a ela.
              Todos os documentos, vídeos e minutas do seu processo ficam
              organizados lá.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <FolderOpen className="size-8 opacity-40" />
            {isAdmin
              ? "Cole o link da pasta acima para disponibilizá-la ao aluno."
              : "Sua pasta ainda não foi configurada pela equipe. Em breve ela aparecerá aqui."}
          </CardContent>
        </Card>
      )}

      {/* Mapa da estrutura padrão */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FolderTree className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">
                Como sua pasta é organizada
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Cada seção guarda uma parte do processo. Use como guia para
                arquivar tudo no lugar certo.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ESTRUTURA_PASTA.map((s) => (
            <div key={s.ordem} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                    {s.ordem}
                  </span>
                  <span className="text-sm font-medium">{s.titulo}</span>
                </div>
                {s.etapa ? (
                  <Badge variant="outline" className="text-[10px]">
                    Etapa {String(s.etapa).padStart(2, "0")}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {s.descricao}
              </p>
              {s.subpastas ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.subpastas.map((sp) => (
                    <span
                      key={sp}
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {sp}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
