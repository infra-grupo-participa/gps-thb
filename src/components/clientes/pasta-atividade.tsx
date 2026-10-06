"use client";

/**
 * "Na pasta do cliente" — o que apareceu no Drive deste cliente (view
 * `gps.vw_cliente_drive_atividade`, …349).
 *
 * 🔴 **Zero consulta própria.** A atividade vem da page
 * (`getAtividadeDriveDoCliente`, no MESMO `Promise.all`) e desce por prop.
 *
 * - `null` = a leitura falhou: uma linha discreta, nunca "pasta vazia".
 * - Nenhuma linha na view (leitura desligada ou pasta sem nada): não aparece.
 * - Sugestão de etapa: "Marcar etapa" chama `marcarEtapaCliente` (a MESMA
 *   action da trajetória). Otimista: a sugestão some no clique e volta, com a
 *   frase do erro, se a action falhar. No sucesso, `router.refresh()` — a
 *   folha "Trajetória" e esta lista são props do servidor, e
 *   `revalidatePath` sozinho não garante a tela repintada.
 *
 * Desde 05/10/2026 mora DENTRO da seção "Pasta do cliente no Drive" da folha
 * "Dados básicos" (filho de `LinksDrive`), sem Card próprio.
 *
 * O "há 2 horas" usa o relógio da LEITURA (`atividade.lidoEm`, servidor):
 * mesmo valor na SSR e na hidratação.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { marcarEtapaCliente } from "@/app/clientes/trajetoria-actions";
import { Button } from "@/components/ui/button";
import { formatarData, formatarHaQuanto } from "@/lib/datas";
import {
  fraseSugestao,
  listarSubpastas,
  nomeEtapa,
  rotuloArquivos,
  type AtividadeDrive,
} from "@/lib/drive-atividade-tipos";
import type { CodigoEtapaCliente } from "@/lib/trajetoria-tipos";

const ID_TITULO = "pasta-atividade-titulo";

export function PastaAtividade({
  clienteId,
  atividade,
}: {
  clienteId: string;
  /** `null` = a leitura falhou no servidor. */
  atividade: AtividadeDrive | null;
}) {
  const router = useRouter();
  const [ocultas, setOcultas] = useState<ReadonlySet<string>>(() => new Set());
  const [emVoo, setEmVoo] = useState<ReadonlySet<string>>(() => new Set());
  const [erro, setErro] = useState<string | null>(null);

  // Prop nova do servidor → ela é a verdade (menos o que ainda está em voo).
  const [base, setBase] = useState(atividade);
  if (base !== atividade) {
    setBase(atividade);
    setOcultas(new Set([...ocultas].filter((c) => emVoo.has(c))));
  }

  if (atividade === null) {
    return (
      <p className="flex items-start gap-1.5 text-base text-muted-foreground">
        <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
        Não deu para ler a atividade da pasta agora.
      </p>
    );
  }
  if (atividade.subpastas.length === 0) return null;

  const { ultimaMinuta, lidoEm } = atividade;
  const haQuanto = ultimaMinuta
    ? formatarHaQuanto(ultimaMinuta.em, lidoEm, { extenso: true })
    : null;
  const sugestoes = atividade.sugestoes.filter((s) => !ocultas.has(s));

  async function marcar(etapa: CodigoEtapaCliente) {
    if (emVoo.has(etapa)) return;
    const voltar = () =>
      setOcultas((s) => {
        const n = new Set(s);
        n.delete(etapa);
        return n;
      });
    setErro(null);
    setOcultas((s) => new Set(s).add(etapa));
    setEmVoo((s) => new Set(s).add(etapa));
    try {
      const res = await marcarEtapaCliente({ clienteId, etapa });
      if (res.ok) {
        router.refresh();
      } else {
        voltar();
        setErro(`Não deu para marcar "${nomeEtapa(etapa)}". ${res.erro}`);
      }
    } catch {
      voltar();
      setErro(
        `Não deu para marcar "${nomeEtapa(etapa)}". Confira a internet e tente de novo.`,
      );
    } finally {
      setEmVoo((s) => {
        const n = new Set(s);
        n.delete(etapa);
        return n;
      });
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={ID_TITULO}
      className="grid gap-3 border-t border-borda-fina pt-3 text-base leading-snug"
    >
      <div className="grid gap-1">
        <h3 id={ID_TITULO} className="text-sm leading-none font-medium">
          Na pasta do cliente
        </h3>
        <p className="text-sm leading-snug text-muted-foreground">
          Mostra o que foi criado ou alterado na pasta desde que o
          acompanhamento foi ligado.
        </p>
      </div>
        {ultimaMinuta && haQuanto ? (
          <p>
            Minuta atualizada {haQuanto}
            {ultimaMinuta.por ? ` por ${ultimaMinuta.por}` : ""}.
          </p>
        ) : null}

        <ul className="grid gap-x-8 sm:grid-cols-2">
          {listarSubpastas(atividade.subpastas).map((s) => (
            <li
              key={s.codigo}
              className="flex flex-wrap items-baseline justify-between gap-x-3 border-b py-1.5"
            >
              <span className="font-medium">{s.rotulo}</span>
              <span className="text-muted-foreground">
                {rotuloArquivos(s.arquivos)}
                {s.ultimaEm
                  ? ` · atualizada em ${formatarData(s.ultimaEm)}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>

        {sugestoes.map((etapa) => (
          <div
            key={etapa}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p>{fraseSugestao(etapa)}</p>
            <Button
              type="button"
              className="h-11 px-4 text-base"
              disabled={emVoo.has(etapa)}
              onClick={() => marcar(etapa)}
            >
              Marcar etapa
            </Button>
          </div>
        ))}

        {erro ? (
          <p
            role="alert"
            className="flex items-start gap-1.5 font-medium text-risco-foreground"
          >
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {erro}
          </p>
        ) : null}
    </div>
  );
}
