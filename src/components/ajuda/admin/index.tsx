"use client";

/**
 * Central de ajuda — painel da EQUIPE (`/admin/ajuda`, 02/10/2026).
 *
 * Uma tela só, por posição: artigos ativos no topo (com vistas e "resolveu"
 * na mesma linha), arquivados embaixo, termos buscados sem resultado no fim.
 * Molde: `admin/tutoriais` (Table + Dialog + useTransition + toast +
 * `router.refresh()` — `revalidatePath` sozinho não repinta Client Component).
 *
 * Métricas agregadas, sem pessoa (`gps.admin_ajuda_metricas`). Falha de
 * métrica vira "—" e aviso; nunca zero.
 *
 * Nunca se apaga artigo: arquivar = `ativo: false`, reversível na linha.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon, PlusIcon } from "lucide-react";
import { salvarArtigoAjuda } from "@/app/admin/ajuda/actions";
import type {
  ArtigoAjudaAdmin,
  EntradaArtigoAjuda,
  MetricaArtigoAjuda,
  MetricasAjuda,
} from "@/lib/ajuda-tipos";
import { formatarDataHora } from "@/lib/datas";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AvisoInline } from "@/components/ui/aviso-inline";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormularioArtigoAjuda } from "./formulario";

type Modo = "novo" | { editando: ArtigoAjudaAdmin } | null;

function entradaDe(a: ArtigoAjudaAdmin, ativo: boolean): EntradaArtigoAjuda {
  return {
    id: a.id,
    titulo: a.titulo,
    corpo: a.corpo,
    rotas: a.rotas,
    categorias: a.categorias,
    palavrasChave: a.palavrasChave,
    sinonimos: a.sinonimos,
    ativo,
    ordem: a.ordem,
  };
}

export function AjudaAdmin({
  artigos,
  metricas,
}: {
  artigos: ArtigoAjudaAdmin[];
  /** `null` = a leitura das métricas falhou (não é "zero"). */
  metricas: MetricasAjuda | null;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [emAcao, setEmAcao] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>(null);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [arquivando, setArquivando] = useState<ArtigoAjudaAdmin | null>(null);
  const [erroArquivar, setErroArquivar] = useState<string | null>(null);

  const porArtigo = new Map<string, MetricaArtigoAjuda>(
    (metricas?.artigos ?? []).map((m) => [m.artigoId, m]),
  );
  const ativos = artigos.filter((a) => a.ativo);
  const arquivados = artigos.filter((a) => !a.ativo);

  function salvar(entrada: EntradaArtigoAjuda) {
    setErroForm(null);
    startTransition(async () => {
      const r = await salvarArtigoAjuda(entrada);
      if (!r.ok) {
        setErroForm(r.erro);
        return;
      }
      toast.success(entrada.id ? "Artigo atualizado." : "Artigo criado.");
      setModo(null);
      router.refresh();
    });
  }

  function mudarAtivo(a: ArtigoAjudaAdmin, ativo: boolean) {
    setEmAcao(a.id);
    setErroArquivar(null);
    startTransition(async () => {
      const r = await salvarArtigoAjuda(entradaDe(a, ativo));
      setEmAcao(null);
      if (!r.ok) {
        if (ativo) toast.error(r.erro);
        else setErroArquivar(r.erro);
        return;
      }
      setArquivando(null);
      toast.success(ativo ? "Artigo reativado." : "Artigo arquivado.");
      router.refresh();
    });
  }

  function linhas(lista: ArtigoAjudaAdmin[]) {
    return lista.map((a) => {
      const m = porArtigo.get(a.id);
      const ocupado = pendente && emAcao === a.id;
      const num = (n: number | undefined) => (metricas ? (n ?? 0) : "—");
      return (
        <TableRow key={a.id}>
          <TableCell className="tabular-nums">{a.ordem}</TableCell>
          <TableCell className="max-w-80 whitespace-normal">
            <span className="font-medium">{a.titulo}</span>
            <span className="block corpo-sm text-muted-foreground">
              {a.rotas.length > 0 ? a.rotas.join(" · ") : "Só busca"}
            </span>
          </TableCell>
          <TableCell className="text-right tabular-nums">{num(m?.vistas)}</TableCell>
          <TableCell className="text-right tabular-nums">{num(m?.resolveuSim)}</TableCell>
          <TableCell className="text-right tabular-nums">{num(m?.resolveuNao)}</TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={ocupado}
                onClick={() => {
                  setErroForm(null);
                  setModo({ editando: a });
                }}
              >
                <PencilIcon aria-hidden /> Editar
              </Button>
              {a.ativo ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={ocupado}
                  onClick={() => {
                    setErroArquivar(null);
                    setArquivando(a);
                  }}
                >
                  <ArchiveIcon aria-hidden /> Arquivar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={ocupado}
                  aria-busy={ocupado || undefined}
                  onClick={() => mudarAtivo(a, true)}
                >
                  <ArchiveRestoreIcon aria-hidden /> Reativar
                </Button>
              )}
            </div>
          </TableCell>
        </TableRow>
      );
    });
  }

  const cabecalho = (
    <TableHeader>
      <TableRow>
        <TableHead className="w-14">Ordem</TableHead>
        <TableHead>Artigo · telas</TableHead>
        <TableHead className="text-right">Vistas</TableHead>
        <TableHead className="text-right">Resolveu</TableHead>
        <TableHead className="text-right">Não resolveu</TableHead>
        <TableHead className="text-right">Ações</TableHead>
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="corpo-sm text-muted-foreground">
          {ativos.length} {ativos.length === 1 ? "ativo" : "ativos"} · {arquivados.length}{" "}
          {arquivados.length === 1 ? "arquivado" : "arquivados"}
          {metricas ? ` · números dos últimos ${metricas.janelaDias} dias` : ""}
        </p>
        <Button
          onClick={() => {
            setErroForm(null);
            setModo("novo");
          }}
          disabled={pendente}
        >
          <PlusIcon aria-hidden /> Novo artigo
        </Button>
      </div>

      {metricas ? null : (
        <AvisoInline>
          Não foi possível carregar vistas e avaliações agora. Os artigos estão abaixo; os
          números aparecem como “—” até a próxima carga.
        </AvisoInline>
      )}

      <section aria-labelledby="ajuda-ativos" className="grid gap-2">
        <h2 id="ajuda-ativos" className="titulo-h2">
          Ativos
        </h2>
        {ativos.length === 0 ? (
          <p className="corpo-sm text-muted-foreground">
            Nenhum artigo ativo. Enquanto não houver, o “Como faço?” do parceiro mostra só a
            busca.
          </p>
        ) : (
          <Table>
            {cabecalho}
            <TableBody>{linhas(ativos)}</TableBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="ajuda-sem-resultado" className="grid gap-2">
        <h2 id="ajuda-sem-resultado" className="titulo-h2">
          Buscas sem resultado
        </h2>
        <p className="corpo-sm text-muted-foreground">
          O que os parceiros procuraram e não acharam — candidatos a artigo novo ou a
          sinônimo.
        </p>
        {!metricas ? (
          <p className="corpo-sm text-muted-foreground">—</p>
        ) : metricas.termosSemResultado.length === 0 ? (
          <p className="corpo-sm text-muted-foreground">
            Nenhuma busca sem resultado nos últimos {metricas.janelaDias} dias.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Termo</TableHead>
                <TableHead className="text-right">Vezes</TableHead>
                <TableHead className="text-right">Última vez</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metricas.termosSemResultado.map((t) => (
                <TableRow key={t.termo}>
                  <TableCell className="max-w-80 whitespace-normal">{t.termo}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.vezes}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarDataHora(t.ultimoEm)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="ajuda-arquivados" className="grid gap-2">
        <h2 id="ajuda-arquivados" className="titulo-h2">
          Arquivados
        </h2>
        {arquivados.length === 0 ? (
          <p className="corpo-sm text-muted-foreground">Nenhum artigo arquivado.</p>
        ) : (
          <Table>
            {cabecalho}
            <TableBody>{linhas(arquivados)}</TableBody>
          </Table>
        )}
      </section>

      <Dialog
        open={modo !== null}
        onOpenChange={(v) => {
          if (!v && !pendente) setModo(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{modo === "novo" ? "Novo artigo" : "Editar artigo"}</DialogTitle>
            <DialogDescription>
              Texto curado pela equipe. O parceiro lê como texto simples, na tela marcada e na
              busca.
            </DialogDescription>
          </DialogHeader>
          {modo !== null ? (
            <FormularioArtigoAjuda
              key={typeof modo === "object" ? modo.editando.id : "novo"}
              artigo={typeof modo === "object" ? modo.editando : undefined}
              pendente={pendente}
              erroServidor={erroForm}
              onCancelar={() => setModo(null)}
              onSalvar={salvar}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {arquivando ? (
        <DialogoConfirmacao
          aberto
          titulo="Arquivar este artigo?"
          descricao={arquivando.titulo}
          consequencia={
            <>
              O artigo some do “Como faço?” e das sugestões do chamado para todos os
              parceiros. Nada é apagado: vistas e avaliações ficam, e dá para reativar na
              lista de arquivados.
            </>
          }
          rotuloConfirmar="Arquivar artigo"
          rotuloConfirmando="Arquivando…"
          destrutivo={false}
          confirmando={pendente && emAcao === arquivando.id}
          erro={erroArquivar}
          onConfirmar={() => mudarAtivo(arquivando, false)}
          onCancelar={() => {
            if (pendente) return;
            setArquivando(null);
            setErroArquivar(null);
          }}
        />
      ) : null}
    </div>
  );
}
