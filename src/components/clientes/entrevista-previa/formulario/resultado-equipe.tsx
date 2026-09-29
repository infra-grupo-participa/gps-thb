"use client";

import { Button } from "@/components/ui/button";
import {
  NOME_DA_LETRA,
  ROTULO_CONFIANCA,
  type ConfiancaDisc,
} from "@/lib/entrevista-previa-calculo";
import type { LetraDisc } from "@/lib/entrevista-previa-perguntas";

/**
 * A tela final no MODO EQUIPE (`/admin/aluno/[alunoId]/clientes/[clienteId]/entrevista`).
 *
 * 🔴 A equipe NÃO agenda nesta entrega (decisão do Marcio, 29/09, item d): a
 * Reunião Preliminar é marcada pelo parceiro, na conta dele. A tela diz isso
 * e para aqui — sem botão para `/sessoes`, que é rota do parceiro e despeja o
 * admin em `/admin` (achado do João, 24/09).
 */
export function ResultadoEquipe({
  clienteNome,
  perfilDisc,
  secundaria,
  confianca,
  decisoresTotal,
  exigeTodos,
  onVoltar,
}: {
  clienteNome: string;
  perfilDisc: string | null;
  secundaria: LetraDisc | null;
  confianca: ConfiancaDisc;
  decisoresTotal: number;
  exigeTodos: boolean;
  onVoltar: () => void;
}) {
  const letra = perfilDisc && perfilDisc in NOME_DA_LETRA ? (perfilDisc as LetraDisc) : null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 border border-borda-fina px-4 py-4 corpo-sm">
        <dl className="grid gap-1">
          <div>
            <dt className="rotulo text-muted-foreground">Entrevista concluída</dt>
            <dd className="numero-lg mt-1">
              {letra ? `Perfil ${letra} — ${NOME_DA_LETRA[letra]}` : "Perfil não definido"}
            </dd>
          </div>
          {letra ? (
            <>
              <div>
                <dt className="inline text-muted-foreground">Secundária: </dt>
                <dd className="inline">
                  {secundaria ? `${secundaria} — ${NOME_DA_LETRA[secundaria]}` : "nenhuma"}
                </dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">Confiança: </dt>
                <dd className="inline">{ROTULO_CONFIANCA[confianca]}</dd>
              </div>
            </>
          ) : null}
        </dl>
        <p className="text-muted-foreground">
          O perfil e o relatório já estão na ficha de {clienteNome}. A equipe
          jurídica vê isso no briefing da sessão.
        </p>
      </div>

      {exigeTodos ? (
        <div role="alert" className="border border-borda-forte bg-superficie-afundada px-4 py-3">
          <p className="rotulo">{decisoresTotal} decisores identificados</p>
          <p className="corpo-sm mt-1">
            A Reunião Preliminar só acontece com <strong>todos presentes</strong>.
          </p>
        </div>
      ) : null}

      <div className="border border-borda-fina px-4 py-4">
        <p className="rotulo text-muted-foreground">Próximo passo</p>
        <p className="corpo-sm mt-1">
          Combine o horário com o parceiro. Quem marca a Reunião Preliminar é
          ele, na conta dele.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onVoltar}>Voltar para a ficha</Button>
        {/* 🔑 `window.location.assign`, não `router.refresh()`: o
            `entrevistaId` é PROP do servidor e não muda com refresh — o
            formulário voltaria apontando para a entrevista já concluída. A
            navegação real remonta a página e a RPC abre uma linha nova. */}
        <Button
          variant="outline"
          onClick={() => window.location.assign(window.location.pathname)}
        >
          Entrevistar outra pessoa
        </Button>
      </div>
    </div>
  );
}
