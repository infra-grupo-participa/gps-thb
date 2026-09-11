"use client";

/**
 * "Troca de sócio" — decisões #5/#6 do briefing (2ª rodada, 11/09/2026):
 *
 *   > "Troca o SÓCIO." O chamado aprova a SAÍDA; a entrada do novo segue
 *   > pela aba Equipe.
 *   > A conta do sócio removido? Apagar o login, como `admin_excluir_membro`
 *   > já faz. O que ele cadastrou FICA (é do ambiente).
 *
 * ⚠️ DIVERGÊNCIA DE CONTRATO (reportada): o contrato do banco descreve
 * `troca_socio` com o MESMO shape de `troca_cliente` (`alvo_atual_id` +
 * `alvo_novo_id`). Mas não existe, hoje, uma LISTA de "sócios candidatos" do
 * ambiente para escolher o novo com busca — o novo sócio é convidado depois,
 * pela aba Equipe (`ConviteSocioForm`), com o e-mail dele. Por isso este
 * campo pede só o MOTIVO da saída: o "novo" da solicitação, quando a RPC
 * exigir, teria de ser o e-mail digitado (texto), não um ID de `thb_alunos`
 * — e aí o "nada de texto livre" da decisão #1 não se aplica a sócio, só a
 * cliente (que TEM lista para buscar). Ver o relatório da entrega.
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
