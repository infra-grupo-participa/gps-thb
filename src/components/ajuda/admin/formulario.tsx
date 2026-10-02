"use client";

/**
 * Criar/editar artigo da central de ajuda (`/admin/ajuda`, 02/10/2026).
 *
 * Validação: `problemaNoArtigo` ANTES da action (mesma frase do banco). A
 * fronteira é `gps.admin_ajuda_salvar`; aqui é só para a frase chegar boa.
 *
 * `ativo` só aparece ao CRIAR. Na edição o estado se mantém: arquivar e
 * reativar são os botões da linha, e arquivar passa por `DialogoConfirmacao`
 * — um checkbox no formulário arquivaria sem a confirmação.
 */

import { useId, useState } from "react";
import {
  AJUDA_CORPO_MAXIMO,
  AJUDA_PALAVRAS_MAXIMO,
  AJUDA_TITULO_MAXIMO,
  problemaNoArtigo,
  type ArtigoAjudaAdmin,
  type CategoriaAjuda,
  type EntradaArtigoAjuda,
} from "@/lib/ajuda-tipos";
import { CATEGORIAS_CHAMADO, ROTULO_CATEGORIA_CHAMADO } from "@/lib/chamados-tipos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";

/** Rotas digitadas uma por linha (vírgula e espaço também separam). */
function lerRotas(t: string): string[] {
  return Array.from(new Set(t.split(/[\s,]+/).map((r) => r.trim()).filter(Boolean)));
}

export function FormularioArtigoAjuda({
  artigo,
  pendente,
  erroServidor,
  onCancelar,
  onSalvar,
}: {
  artigo?: ArtigoAjudaAdmin;
  pendente: boolean;
  erroServidor: string | null;
  onCancelar: () => void;
  onSalvar: (e: EntradaArtigoAjuda) => void;
}) {
  const uid = useId();
  const [titulo, setTitulo] = useState(artigo?.titulo ?? "");
  const [corpo, setCorpo] = useState(artigo?.corpo ?? "");
  const [rotas, setRotas] = useState((artigo?.rotas ?? []).join("\n"));
  const [categorias, setCategorias] = useState<CategoriaAjuda[]>(artigo?.categorias ?? []);
  const [palavras, setPalavras] = useState(artigo?.palavrasChave ?? "");
  const [sinonimos, setSinonimos] = useState(artigo?.sinonimos ?? "");
  const [ordem, setOrdem] = useState(String(artigo?.ordem ?? 0));
  const [ativo, setAtivo] = useState(artigo?.ativo ?? true);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  function alternarCategoria(c: CategoriaAjuda, marcado: boolean) {
    setCategorias((atual) =>
      marcado ? Array.from(new Set([...atual, c])) : atual.filter((x) => x !== c),
    );
  }

  function enviar() {
    const entrada: EntradaArtigoAjuda = {
      id: artigo?.id ?? null,
      titulo: titulo.trim(),
      corpo: corpo.trim(),
      rotas: lerRotas(rotas),
      categorias,
      palavrasChave: palavras.trim() || null,
      sinonimos: sinonimos.trim() || null,
      ativo: artigo ? artigo.ativo : ativo,
      ordem: ordem.trim() === "" ? 0 : Number(ordem),
    };
    const problema = problemaNoArtigo(entrada);
    setErroLocal(problema);
    if (problema) return;
    onSalvar(entrada);
  }

  const erro = erroLocal ?? erroServidor;
  const id = (s: string) => `${uid}-${s}`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!pendente) enviar();
      }}
      className="grid gap-4"
      noValidate
    >
      <div className="grid gap-2">
        <Label htmlFor={id("titulo")}>Título</Label>
        <Input
          id={id("titulo")}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={AJUDA_TITULO_MAXIMO}
          disabled={pendente}
          placeholder="Ex.: Como cadastrar um cliente"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("corpo")}>Texto</Label>
        <Textarea
          id={id("corpo")}
          value={corpo}
          onChange={(e) => setCorpo(e.target.value)}
          maxLength={AJUDA_CORPO_MAXIMO}
          rows={8}
          disabled={pendente}
          aria-describedby={id("corpo-ajuda")}
        />
        <p id={id("corpo-ajuda")} className="corpo-sm text-muted-foreground">
          Texto simples, sem formatação. Uma linha em branco separa parágrafos.{" "}
          <span className="tabular-nums">
            {corpo.length}/{AJUDA_CORPO_MAXIMO}
          </span>
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={id("rotas")}>Telas onde aparece</Label>
        <Textarea
          id={id("rotas")}
          value={rotas}
          onChange={(e) => setRotas(e.target.value)}
          rows={3}
          disabled={pendente}
          placeholder={"/clientes\n/etapa/1"}
          aria-describedby={id("rotas-ajuda")}
        />
        <p id={id("rotas-ajuda")} className="corpo-sm text-muted-foreground">
          Uma por linha, até 20. Vale também para as telas abaixo: /clientes inclui a ficha de
          cada cliente. Sem tela, o artigo só aparece na busca e nas sugestões do chamado.
        </p>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Categorias de chamado</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {CATEGORIAS_CHAMADO.map((c) => (
            <label key={c} className="flex min-h-11 items-center gap-2 corpo-sm">
              <Checkbox
                checked={categorias.includes(c)}
                onCheckedChange={(v) => alternarCategoria(c, v === true)}
                disabled={pendente}
              />
              {ROTULO_CATEGORIA_CHAMADO[c]}
            </label>
          ))}
        </div>
        <p className="corpo-sm text-muted-foreground">
          Dá prioridade ao artigo nas sugestões do chamado daquela categoria.
        </p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={id("palavras")}>Palavras-chave</Label>
          <Textarea
            id={id("palavras")}
            value={palavras}
            onChange={(e) => setPalavras(e.target.value)}
            maxLength={AJUDA_PALAVRAS_MAXIMO}
            rows={2}
            disabled={pendente}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={id("sinonimos")}>Sinônimos</Label>
          <Textarea
            id={id("sinonimos")}
            value={sinonimos}
            onChange={(e) => setSinonimos(e.target.value)}
            maxLength={AJUDA_PALAVRAS_MAXIMO}
            rows={2}
            disabled={pendente}
            placeholder="Como o parceiro fala: lead, contato, prospect"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-2">
          <Label htmlFor={id("ordem")}>Ordem</Label>
          <Input
            id={id("ordem")}
            type="number"
            inputMode="numeric"
            step={1}
            value={ordem}
            onChange={(e) => setOrdem(e.target.value)}
            disabled={pendente}
            className="w-28"
            aria-describedby={id("ordem-ajuda")}
          />
        </div>
        <p id={id("ordem-ajuda")} className="corpo-sm pb-2 text-muted-foreground">
          Menor aparece primeiro na tela.
        </p>
      </div>

      {artigo ? null : (
        <label className="flex min-h-11 items-center gap-2 corpo-sm">
          <Checkbox
            checked={ativo}
            onCheckedChange={(v) => setAtivo(v === true)}
            disabled={pendente}
          />
          Ativo — o parceiro já vê ao salvar
        </label>
      )}

      <p role="alert" className="corpo-sm text-destructive empty:hidden">
        {erro}
      </p>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancelar} disabled={pendente}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendente} aria-busy={pendente || undefined}>
          {pendente ? "Salvando…" : artigo ? "Salvar artigo" : "Criar artigo"}
        </Button>
      </DialogFooter>
    </form>
  );
}
