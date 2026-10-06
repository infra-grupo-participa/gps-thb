"use client";

/**
 * "Por onde o cliente passou" — a TRAJETÓRIA do cliente (migração …345).
 *
 * Caixas de marcar, uma por etapa do catálogo; subetapas indentadas sob a mãe.
 * O parceiro marca quantas quiser: é o mapa para saber quem entrou direto na
 * Execução, quem passou por tudo e o que ficou para trás ("pendente").
 *
 * 🔑 Trajetória ≠ `fase`. Nada aqui passa pelo "Salvar ficha": cada caixa grava
 * na hora pela action (`marcarEtapaCliente`/`desmarcarEtapaCliente`).
 *
 * 🔴 **Zero consulta própria.** A árvore vem da page (`getTrajetoriaDoCliente`,
 * no MESMO `Promise.all`) e desce por prop. Este bloco fica ACIMA das abas e
 * não desmonta ao trocar de folha — e mesmo assim não carrega nada no mount.
 *
 * 🔴 **Otimista com rollback.** O estado na tela = a prop do servidor + os
 * `ajustes` locais (o que a pessoa clicou). No erro, o ajuste volta ao valor de
 * antes do clique e a frase da action fica num `role="alert"`. Os `pendentes`
 * são recalculados na hora com a MESMA `calcularPendentes` do servidor — sem
 * isso, marcar a Execução não acenderia o "pendente" nas anteriores até um
 * refresh.
 *
 * ⚠️ A action chama `revalidatePath`, e o Next devolve a página nova junto
 * com a resposta: a prop `trajetoria` troca de identidade. Nessa hora os
 * ajustes são descartados (a prop já é a verdade), MENOS os das caixas ainda
 * em voo — senão um 2º clique rápido piscaria de volta até a resposta dele.
 *
 * `null` = a leitura falhou: aviso, nunca "nada marcado".
 */

import { useState } from "react";
import { AlertCircle } from "lucide-react";

import {
  desmarcarEtapaCliente,
  marcarEtapaCliente,
} from "@/app/clientes/trajetoria-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatarData } from "@/lib/datas";
import {
  calcularPendentes,
  ehCodigoEtapaCliente,
  type EtapaCatalogoBase,
  type EtapaTrajetoria,
  type TrajetoriaCliente,
} from "@/lib/trajetoria-tipos";

interface EstadoEtapa {
  marcada: boolean;
  marcadoEm: string | null;
}

const ID_TITULO = "trajetoria-titulo";

export function FichaTrajetoria({
  clienteId,
  trajetoria,
}: {
  clienteId: string;
  /** `null` = a leitura falhou no servidor (a seção avisa). */
  trajetoria: TrajetoriaCliente | null;
}) {
  const [ajustes, setAjustes] = useState<Record<string, EstadoEtapa>>({});
  const [emVoo, setEmVoo] = useState<ReadonlySet<string>>(() => new Set());
  const [erro, setErro] = useState<string | null>(null);

  // Prop nova do servidor (revalidate/refresh) → ela é a verdade. Padrão
  // "estado derivado de prop" do React, sem `useEffect` (que pintaria um
  // quadro com o ajuste velho por cima da prop nova).
  const [base, setBase] = useState(trajetoria);
  if (base !== trajetoria) {
    setBase(trajetoria);
    setAjustes((a) =>
      Object.fromEntries(Object.entries(a).filter(([c]) => emVoo.has(c))),
    );
  }

  if (!trajetoria) {
    return (
      <Card size="sm" role="region" aria-labelledby={ID_TITULO}>
        <CardHeader>
          <CardTitle id={ID_TITULO} className="font-semibold group-data-[size=sm]/card:text-base">Por onde o cliente passou</CardTitle>
        </CardHeader>
        <CardContent>
          <p
            role="alert"
            className="flex items-start gap-1.5 text-base font-medium text-risco-foreground"
          >
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            Não deu para carregar as etapas deste cliente. Recarregue a página.
          </p>
        </CardContent>
      </Card>
    );
  }

  const estadoDe = (e: EtapaTrajetoria): EstadoEtapa =>
    ajustes[e.codigo] ?? { marcada: e.marcada, marcadoEm: e.marcadoEm };

  // Catálogo achatado (o que a árvore traz) + marcadas efetivas → pendentes.
  const catalogo: EtapaCatalogoBase[] = [];
  const marcadas: string[] = [];
  const visitar = (lista: EtapaTrajetoria[]) => {
    for (const e of lista) {
      catalogo.push({
        codigo: e.codigo,
        paiCodigo: e.paiCodigo,
        ordem: e.ordem,
        ativo: e.ativo,
      });
      if (estadoDe(e).marcada) marcadas.push(e.codigo);
      visitar(e.filhas);
    }
  };
  visitar(trajetoria.etapas);
  const pendentes = new Set(calcularPendentes(catalogo, marcadas));

  async function alternar(e: EtapaTrajetoria, marcar: boolean) {
    const codigo = e.codigo;
    if (!ehCodigoEtapaCliente(codigo) || emVoo.has(codigo)) return;
    const anterior = estadoDe(e);
    const desfazer = () => setAjustes((a) => ({ ...a, [codigo]: anterior }));

    setErro(null);
    setAjustes((a) => ({
      ...a,
      [codigo]: {
        marcada: marcar,
        marcadoEm: marcar
          ? (anterior.marcadoEm ?? new Date().toISOString())
          : null,
      },
    }));
    setEmVoo((s) => new Set(s).add(codigo));
    try {
      const acao = marcar ? marcarEtapaCliente : desmarcarEtapaCliente;
      const res = await acao({ clienteId, etapa: codigo });
      if (res.ok) {
        setAjustes((a) => ({
          ...a,
          [codigo]: { marcada: res.marcada, marcadoEm: res.marcadoEm },
        }));
      } else {
        desfazer();
        setErro(
          `Não deu para ${marcar ? "marcar" : "desmarcar"} "${e.nome}". ${res.erro}`,
        );
      }
    } catch {
      desfazer();
      setErro(
        `Não deu para ${marcar ? "marcar" : "desmarcar"} "${e.nome}". Confira a internet e tente de novo.`,
      );
    } finally {
      setEmVoo((s) => {
        const n = new Set(s);
        n.delete(codigo);
        return n;
      });
    }
  }

  const renderItem = (e: EtapaTrajetoria, nivel: number) => {
    const est = estadoDe(e);
    const pendente = nivel === 0 && pendentes.has(e.codigo);
    return (
      <li key={e.codigo}>
        <label className="flex min-h-9 cursor-pointer items-center gap-2 py-0.5 text-sm leading-snug">
          <Checkbox
            checked={est.marcada}
            disabled={emVoo.has(e.codigo)}
            onCheckedChange={(v) => alternar(e, Boolean(v))}
            className="foco-visivel"
          />
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className={nivel === 0 ? "font-medium" : undefined}>
              {e.nome}
            </span>
            {est.marcada && est.marcadoEm ? (
              <span className="text-sm text-muted-foreground">
                marcada em {formatarData(est.marcadoEm)}
              </span>
            ) : null}
            {pendente ? (
              <Badge
                variant="warning"
                icone={false}
                className="h-auto text-sm"
              >
                pendente
              </Badge>
            ) : null}
          </span>
        </label>
        {e.filhas.length > 0 ? renderFilhas(e.filhas, nivel + 1) : null}
      </li>
    );
  };

  // Recuo uniforme (pl-7) por nível.
  const renderFilhas = (lista: EtapaTrajetoria[], nivel: number) => (
    <ul className="grid pl-7">{lista.map((e) => renderItem(e, nivel))}</ul>
  );

  // Nível 0: etapas sem filhas numa coluna; cada etapa com filhas, na sua.
  const renderRaiz = (lista: EtapaTrajetoria[]) => {
    const semFilhas = lista.filter((e) => e.filhas.length === 0);
    const comFilhas = lista.filter((e) => e.filhas.length > 0);
    return (
      // Mesma caixa afundada das folhas ("Andamento do contato", "Problemas"):
      // a ficha inteira fala uma língua só de caixa de marcar.
      <div className="grid items-start gap-x-8 gap-y-1 rounded-lg bg-superficie-afundada p-3 sm:grid-cols-2">
        {semFilhas.length > 0 ? (
          <ul className="grid">{semFilhas.map((e) => renderItem(e, 0))}</ul>
        ) : null}
        {comFilhas.map((e) => (
          <ul key={e.codigo} className="grid">
            {renderItem(e, 0)}
          </ul>
        ))}
      </div>
    );
  };

  return (
    <Card size="sm" role="region" aria-labelledby={ID_TITULO}>
      <CardHeader>
        <CardTitle id={ID_TITULO} className="font-semibold group-data-[size=sm]/card:text-base">Por onde o cliente passou</CardTitle>
        <p className="text-sm leading-snug text-muted-foreground">
          Marque as etapas que este cliente já fez. Salva na hora: não precisa
          clicar em &quot;Salvar ficha&quot;. <strong>Pendente</strong> = etapa
          que ficou para trás.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
        {renderRaiz(trajetoria.etapas)}
        {erro ? (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-base font-medium text-risco-foreground"
          >
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {erro}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
