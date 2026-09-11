"use client";

/**
 * "Troca de sócio" — decisões #5/#6 do briefing (2ª rodada, 11/09/2026):
 *
 *   > "Troca o SÓCIO." O chamado aprova a SAÍDA; a entrada do novo segue
 *   > pela aba Equipe.
 *   > A conta do sócio removido? Apagar o login, como `admin_excluir_membro`
 *   > já faz. O que ele cadastrou FICA (é do ambiente).
 *
 * ✅ CONFIRMADO com o banco (11/09/2026): em `troca_socio`, `alvo_novo_id` e
 * `alvo_novo_rotulo` nascem sempre `NULL`. `chamado_abrir` não recebe alvo
 * nenhum para esta categoria — só o motivo da saída. A aprovação REMOVE o
 * sócio atual; quem entra no lugar é convidado depois, pela aba Equipe
 * (`ConviteSocioForm`), com o e-mail dele.
 */

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MOTIVO_MAXIMO = 500;

export function CampoTrocaSocio({
  id,
  socioAtualNome,
  temSocio,
  motivo,
  onMudarMotivo,
  desabilitado,
}: {
  id: string;
  socioAtualNome: string | null;
  temSocio: boolean;
  motivo: string;
  onMudarMotivo: (v: string) => void;
  desabilitado?: boolean;
}) {
  if (!temSocio) {
    return (
      <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
        Este ambiente ainda não tem sócio. Para adicionar o primeiro, use a
        aba Equipe.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <span className="rotulo text-muted-foreground" id={`${id}-atual-rotulo`}>
          Sócio atual
        </span>
        <p
          aria-labelledby={`${id}-atual-rotulo`}
          className="rounded-lg border border-input bg-muted px-2.5 py-1.5 text-sm text-muted-foreground"
        >
          {socioAtualNome || "Sócio sem cadastro vinculado"}
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-motivo`}>Por que quer trocar de sócio</Label>
        <Textarea
          id={`${id}-motivo`}
          value={motivo}
          onChange={(e) => onMudarMotivo(e.target.value)}
          placeholder="Conte o que aconteceu. A equipe aprova a saída do sócio atual e você convida o novo pela aba Equipe."
          rows={3}
          maxLength={MOTIVO_MAXIMO}
          disabled={desabilitado}
        />
      </div>
    </div>
  );
}
