"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderOpen, ExternalLink } from "lucide-react";
import { salvarPastaDriveUrl } from "@/app/admin/actions";
import { embedPastaDrive } from "@/lib/pasta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const embedUrl = embedPastaDrive(pastaUrl);

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
          <CardContent className="grid gap-3">
            {embedUrl ? (
              <iframe
                src={embedUrl}
                title="Pasta do aluno no Google Drive"
                className="h-[520px] w-full rounded-lg border bg-muted/20"
                loading="lazy"
              />
            ) : null}
            <p className="text-sm text-muted-foreground">
              A pré-visualização acima é somente leitura. Para enviar, renomear
              ou apagar arquivos, use &ldquo;Abrir no Drive&rdquo;. Se a
              pré-visualização aparecer vazia, a pasta não está compartilhada
              por link — peça à equipe para ajustar.
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
    </div>
  );
}
