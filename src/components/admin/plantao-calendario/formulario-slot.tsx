"use client";

import { useMemo, useState } from "react";
import type { SlotAdmin, MentoraAdmin } from "@/lib/plantao-tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataCurta, datasDaSerie } from "./datas-da-serie";
import { CLASSE_SELECT } from "./tipos";

/** Teto do "repetir semanalmente" — mesmo clamp que `criarSlot` aplica no servidor. */
const MAX_REPETICOES = 12;

/**
 * Duração padrão de um plantão, em minutos. UM lugar só — antes o 120 vivia na
 * migração e o 60 no formulário, e todo slot criado pela tela nascia com metade
 * do tempo real da sessão.
 */
const DURACAO_PADRAO_MIN = 120;

export function FormularioSlot({
  dataInicial,
  slot,
  mentoras,
  pending,
  aviso,
  onCancelar,
  onSalvar,
}: {
  dataInicial: string;
  slot?: SlotAdmin;
  mentoras: MentoraAdmin[];
  pending: boolean;
  /** Mesma mensagem do `aria-live` da lista — o erro da action cai aqui. */
  aviso: string;
  onCancelar: () => void;
  onSalvar: (form: {
    slotId?: string;
    mentoraId?: string;
    data: string;
    horaInicio: string;
    duracaoMin: number;
    zoomUrl?: string;
    observacao?: string;
    repetirSemanas: number;
  }) => void;
}) {
  const [data, setData] = useState(slot?.data ?? dataInicial);
  const [horaInicio, setHoraInicio] = useState(slot?.horaInicio ?? "19:00");
  // PL7 — o Plantão do Acelera é de 120 min ("duração fixa de 2 horas", na
  // migração ...041, que publicou a Semana 1 com 120). O formulário nascia com
  // 60 e a duração entra na conta de `revelar_link`, presença e NPS.
  const [duracaoMin, setDuracaoMin] = useState(
    String(slot?.duracaoMin ?? DURACAO_PADRAO_MIN),
  );
  const [zoomUrl, setZoomUrl] = useState(slot?.zoomUrl ?? "");
  const [observacao, setObservacao] = useState(slot?.observacao ?? "");
  /** Só na criação: repete a mesma configuração nas próximas N semanas. */
  const [repetirSemanas, setRepetirSemanas] = useState(0);
  // Ao editar, a mentora atual vem por `slot.mentoraId` (nunca pelo nome).
  const [mentoraId, setMentoraId] = useState(
    () => slot?.mentoraId ?? "",
  );

  const serie = useMemo(
    () => (repetirSemanas > 0 ? datasDaSerie(data, repetirSemanas) : []),
    [data, repetirSemanas],
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSalvar({
          slotId: slot?.slotId,
          mentoraId,
          data,
          horaInicio,
          duracaoMin: Number(duracaoMin) || DURACAO_PADRAO_MIN,
          zoomUrl,
          observacao,
          repetirSemanas,
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="slot-mentora">Mentora</Label>
        <select
          id="slot-mentora"
          value={mentoraId}
          onChange={(e) => setMentoraId(e.target.value)}
          required
          disabled={pending}
          className={CLASSE_SELECT}
        >
          <option value="">Escolha a mentora…</option>
          {mentoras
            .filter((m) => m.ativa || m.id === slot?.mentoraId)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="slot-data">Data</Label>
          <Input
            id="slot-data"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
            disabled={pending}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="slot-hora">Hora de início</Label>
          <Input
            id="slot-hora"
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            required
            disabled={pending}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="slot-duracao">Duração (minutos)</Label>
        <Input
          id="slot-duracao"
          type="number"
          min={15}
          step={15}
          value={duracaoMin}
          onChange={(e) => setDuracaoMin(e.target.value)}
          required
          disabled={pending}
        />
      </div>

      {!slot ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="slot-repetir">Repetir semanalmente por</Label>
          <select
            id="slot-repetir"
            value={repetirSemanas}
            onChange={(e) => setRepetirSemanas(Number(e.target.value))}
            disabled={pending}
            aria-describedby="slot-repetir-previa"
            className={CLASSE_SELECT}
          >
            <option value={0}>Não repetir (só esta data)</option>
            {Array.from({ length: MAX_REPETICOES }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                mais {n} semana{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
          <p id="slot-repetir-previa" className="text-xs text-muted-foreground">
            {serie.length > 0
              ? `Cria ${serie.length} plantões: ${serie.map(dataCurta).join(", ")}. Data que já tiver plantão desta mentora no mesmo horário é pulada.`
              : "Cria só o plantão desta data."}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="slot-zoom">Link do Zoom</Label>
        <Input
          id="slot-zoom"
          type="url"
          placeholder="https://zoom.us/j/..."
          value={zoomUrl}
          onChange={(e) => setZoomUrl(e.target.value)}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Sem este link, o plantão não aparece para o parceiro mesmo que
          publicado.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="slot-obs">Observação interna (opcional)</Label>
        <Input
          id="slot-obs"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          disabled={pending}
        />
      </div>

      <p aria-live="polite" className="text-xs text-destructive empty:hidden">
        {aviso}
      </p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancelar} disabled={pending}>
          Voltar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Salvando..."
            : slot
              ? "Salvar alterações"
              : serie.length > 0
                ? `Criar ${serie.length} plantões`
                : "Criar plantão"}
        </Button>
      </div>
    </form>
  );
}
