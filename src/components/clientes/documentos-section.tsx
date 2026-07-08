"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  FolderOpen,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  File as FileIcon,
  Download,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Documento } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const BUCKET = "gps-documentos";

function formatarTamanho(bytes: number | null): string {
  if (!bytes) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

interface MetaTipo {
  label: string;
  Icon: LucideIcon;
  strip: string;
  chip: string;
  icon: string;
}

function metaArquivo(nome: string): MetaTipo {
  const ext = (nome.split(".").pop() || "").toLowerCase();
  if (ext === "pdf")
    return {
      label: "PDF",
      Icon: FileText,
      strip: "bg-red-500",
      chip: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
      icon: "text-red-500",
    };
  if (["doc", "docx", "txt", "rtf", "odt"].includes(ext))
    return {
      label: "DOC",
      Icon: FileText,
      strip: "bg-blue-500",
      chip: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
      icon: "text-blue-500",
    };
  if (["xls", "xlsx", "csv"].includes(ext))
    return {
      label: "PLANILHA",
      Icon: FileSpreadsheet,
      strip: "bg-green-500",
      chip: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
      icon: "text-green-500",
    };
  if (["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext))
    return {
      label: "IMAGEM",
      Icon: FileImage,
      strip: "bg-purple-500",
      chip: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
      icon: "text-purple-500",
    };
  if (["zip", "rar", "7z"].includes(ext))
    return {
      label: "ZIP",
      Icon: FileArchive,
      strip: "bg-amber-500",
      chip: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
      icon: "text-amber-500",
    };
  return {
    label: "ARQUIVO",
    Icon: FileIcon,
    strip: "bg-slate-400",
    chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    icon: "text-slate-500",
  };
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
  const [arrastando, setArrastando] = useState(false);

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
      <CardHeader>
        <div className="flex items-center gap-2">
          <FolderOpen className="size-5 text-primary" />
          <div>
            <CardTitle className="text-base">Fichário do cliente</CardTitle>
            <p className="text-sm text-muted-foreground">
              {docs.length} documento{docs.length === 1 ? "" : "s"} arquivado
              {docs.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* Dropzone */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            enviarArquivos(e.dataTransfer.files);
          }}
          disabled={enviando}
          className={
            "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition " +
            (arrastando
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/40")
          }
        >
          <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Upload className="size-5" />
          </div>
          <div className="text-sm font-medium">
            {enviando
              ? "Enviando..."
              : "Arraste arquivos aqui ou clique para enviar"}
          </div>
          <div className="text-xs text-muted-foreground">
            RG, contrato, comprovantes, IPTU… tudo guardado neste fichário.
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => enviarArquivos(e.target.files)}
          />
        </button>

        {/* Fichas */}
        {docs.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted-foreground">
            <FolderOpen className="size-8 opacity-40" />
            Nenhum documento arquivado ainda.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((doc) => {
              const m = metaArquivo(doc.nome);
              return (
                <div
                  key={doc.id}
                  className="group relative overflow-hidden rounded-lg border bg-card shadow-sm transition hover:shadow-md"
                >
                  {/* faixa colorida por tipo */}
                  <div className={"h-1 w-full " + m.strip} />
                  {/* canto dobrado */}
                  <span className="absolute right-0 top-1 h-0 w-0 border-l-[14px] border-t-[14px] border-l-transparent border-t-muted" />

                  <div className="flex items-start gap-3 p-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                      <m.Icon className={"size-5 " + m.icon} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span
                        className={
                          "inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold " +
                          m.chip
                        }
                      >
                        {m.label}
                      </span>
                      <div
                        className="mt-1 truncate text-sm font-medium"
                        title={doc.nome}
                      >
                        {doc.nome}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatarTamanho(doc.tamanho)}
                        {doc.tamanho ? " · " : ""}
                        {new Date(doc.criado_em).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                  </div>

                  <div className="flex divide-x border-t text-xs">
                    <button
                      onClick={() => baixar(doc)}
                      className="flex flex-1 items-center justify-center gap-1 py-2 font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <Download className="size-3.5" /> Baixar
                    </button>
                    <button
                      onClick={() => excluir(doc)}
                      className="flex flex-1 items-center justify-center gap-1 py-2 font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" /> Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
