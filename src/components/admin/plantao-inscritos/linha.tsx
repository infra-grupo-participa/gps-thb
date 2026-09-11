"use client";

/**
 * Uma linha da lista de inscritos: coluna Parceiro (nome + e-mail, com "no
 * cadastro: {nomeCadastro}" quando os dois campos divergem — ver o comentário
 * de `InscritoAdmin` em `plantao-tipos.ts`), Presença (switch + origem) e as
 * duas ações (editar nome / cancelar inscrição).
 *
 * Sem estado de mutação próprio: quem decide o resultado da action é
 * `index.tsx` (a mesma `useTransition` desabilita todos os controles da
 * linha em voo). Só o campo de texto do nome é estado local, porque é
 * puramente de edição — não muda até "Salvar".
 */

import { useId, useState } from "react";
import {
  UserRoundIcon,
  PencilIcon,
  XIcon,
  CheckIcon,
  CalendarOffIcon,
} from "lucide-react";
import type { InscritoAdmin } from "@/lib/plantao-tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { TableRow, TableCell } from "@/components/ui/table";

const MAX_NOME = 120;

export function LinhaInscrito({
  inscrito,
  emAcao,
  editando,
  onEditar,
  onCancelarEdicao,
  onSalvarNome,
  onMarcarPresente,
  onPedirDesmarcar,
  onPedirCancelar,
}: {
  inscrito: InscritoAdmin;
  emAcao: boolean;
  editando: boolean;
  onEditar: () => void;
  onCancelarEdicao: () => void;
  onSalvarNome: (nome: string) => void;
  onMarcarPresente: () => void;
  onPedirDesmarcar: () => void;
  onPedirCancelar: () => void;
}) {
  const idNome = useId();
  const [nome, setNome] = useState(inscrito.nome);
  const nomeDivergeDoCadastro = inscrito.nome !== inscrito.nomeCadastro;

  function salvar() {
    const limpo = nome.trim();
    if (!limpo) return;
    onSalvarNome(limpo);
  }

  return (
    <TableRow>
      <TableCell>
        {editando ? (
          <div className="flex flex-col gap-1.5 py-1">
            <Label htmlFor={idNome}>Nome nesta inscrição</Label>
            <div className="flex items-center gap-1.5">
              <Input
                id={idNome}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={MAX_NOME}
                disabled={emAcao}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") salvar();
                  if (e.key === "Escape") onCancelarEdicao();
                }}
              />
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={emAcao || !nome.trim()}
                onClick={salvar}
                aria-label="Salvar nome"
                title="Salvar"
              >
                <CheckIcon className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={emAcao}
                onClick={() => {
                  setNome(inscrito.nome);
                  onCancelarEdicao();
                }}
                aria-label="Cancelar edição do nome"
                title="Cancelar"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Só muda como aparece nesta lista e nos e-mails deste plantão. O
              cadastro da pessoa não muda — para isso, aba Parceiros.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <UserRoundIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <div className="truncate font-medium">{inscrito.nome}</div>
              <div className="truncate text-xs text-muted-foreground">{inscrito.email}</div>
              {nomeDivergeDoCadastro ? (
                <div className="truncate text-xs text-muted-foreground italic">
                  no cadastro: {inscrito.nomeCadastro}
                </div>
              ) : null}
            </div>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={emAcao}
              onClick={onEditar}
              aria-label={`Editar o nome de ${inscrito.nome} nesta inscrição`}
              title="Editar nome"
              className="ml-auto shrink-0"
            >
              <PencilIcon className="size-3.5" />
            </Button>
          </div>
        )}
      </TableCell>

      <TableCell>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Switch
              checked={inscrito.presencaEm !== null}
              disabled={emAcao}
              onCheckedChange={(marcado) => {
                if (marcado) onMarcarPresente();
                else onPedirDesmarcar();
              }}
              aria-label={`Presença de ${inscrito.nome}`}
            />
            <span className="text-xs text-muted-foreground">
              {inscrito.presencaEm !== null ? "Presente" : "Sem registro"}
            </span>
          </div>
          {inscrito.presencaEm !== null && inscrito.presencaOrigem ? (
            <Badge variant="outline" className="w-fit text-[0.65rem]">
              {inscrito.presencaOrigem === "portal" ? "pelo portal" : "pela equipe"}
            </Badge>
          ) : null}
        </div>
      </TableCell>

      <TableCell>
        {inscrito.npsNota !== null ? (
          <span className="font-medium tabular-nums">{inscrito.npsNota}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="text-right">
        <Button
          variant="ghost-danger"
          size="sm"
          disabled={emAcao}
          onClick={onPedirCancelar}
        >
          <CalendarOffIcon className="size-4" />
          Cancelar inscrição
        </Button>
      </TableCell>
    </TableRow>
  );
}
