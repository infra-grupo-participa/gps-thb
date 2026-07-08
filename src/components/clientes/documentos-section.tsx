"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Documento } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const BUCKET = "gps-documentos";

function formatarTamanho(bytes: number | null): string {
  if (!bytes) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function DocumentosSection({
  alunoId,
  clienteId,
  documentosIniciais,
}: {
  alunoId: string;
  clienteId: string;
  documentosIniciais: Documento[];
}) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<Documento[]>(documentosIniciais);
  const [enviando, setEnviando] = useState(false);

  async function enviarArquivos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setEnviando(true);
    try {
      for (const file of Array.from(files)) {
        const nomeLimpo = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${alunoId}/${clienteId}/${Date.now()}-${nomeLimpo}`;

        const { error: erroUp } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false });
        if (erroUp) {
          toast.error(`Erro ao enviar ${file.name}.`);
          continue;
        }

        const { data, error: erroIns } = await supabase
          .schema("gps")
          .from("documentos")
          .insert({
            aluno_id: alunoId,
            cliente_id: clienteId,
            nome: file.name,
            path,
            tamanho: file.size,
            mime: file.type || null,
          })
          .select("*")
          .single();

        if (erroIns || !data) {
          await supabase.storage.from(BUCKET).remove([path]);
          toast.error(`Erro ao registrar ${file.name}.`);
          continue;
        }
        setDocs((prev) => [data as Documento, ...prev]);
      }
      toast.success("Documentos enviados.");
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function baixar(doc: Documento) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.path, 60);
    if (error || !data) {
      toast.error("Não foi possível gerar o link.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function excluir(doc: Documento) {
    const anteriores = docs;
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    const { error: erroDel } = await supabase
      .schema("gps")
      .from("documentos")
      .delete()
      .eq("id", doc.id);
    if (erroDel) {
      setDocs(anteriores);
      toast.error("Erro ao remover o documento.");
      return;
    }
    await supabase.storage.from(BUCKET).remove([doc.path]);
    toast.success("Documento removido.");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-base">Documentos do cliente</CardTitle>
          <p className="text-sm text-muted-foreground">
            Guarde aqui os documentos deste cliente (RG, contrato, comprovantes…).
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => enviarArquivos(e.target.files)}
          />
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
          >
            {enviando ? "Enviando..." : "Enviar documento"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {docs.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhum documento ainda.
          </div>
        ) : (
          <ul className="divide-y">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{doc.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatarTamanho(doc.tamanho)}
                    {doc.tamanho ? " · " : ""}
                    {new Date(doc.criado_em).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="outline" size="sm" onClick={() => baixar(doc)}>
                    Baixar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => excluir(doc)}
                  >
                    Excluir
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
