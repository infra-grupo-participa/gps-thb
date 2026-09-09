"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { salvarPastaDriveUrl } from "@/app/admin/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * O campo em que a EQUIPE cola o link da pasta do Drive do aluno.
 *
 * PF4 — vive num arquivo próprio, importado só por
 * `admin/aluno/[alunoId]/pasta/page.tsx`. O aluno não tem como baixar isto:
 * a página dele nunca referencia o módulo, então nem o código nem o id da
 * Server Action `salvarPastaDriveUrl` entram no bundle de `/pasta`.
 *
 * A action continua guardada por `ehAdmin()` no servidor — tirar o botão da
 * tela nunca foi a trava, e continua não sendo.
 */
export function PastaConfigForm({
  alunoId,
  pastaUrl,
}: {
  alunoId: string;
  pastaUrl: string | null;
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Link da pasta (Drive)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Cole o link da pasta do Google Drive deste aluno (compartilhada entre
          a equipe e o aluno).
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 sm:flex-row">
          {/* O campo não tinha rótulo associado: o `CardTitle` fica ao lado,
              não no `for`. Sem isto o leitor de tela anuncia só "edit". */}
          <Label htmlFor="pasta-drive-url" className="sr-only">
            Link da pasta do Drive
          </Label>
          <Input
            id="pasta-drive-url"
            type="url"
            inputMode="url"
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
  );
}
