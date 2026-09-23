import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { formatarData } from "@/lib/datas";
import type { EntrevistaPreviaLinha } from "@/lib/data/entrevista-previa";

/**
 * O que a Entrevista Prévia produziu, mostrado NA FICHA do cliente.
 *
 * 🔴 POR QUE EXISTE (achado da 2ª onda de polimento, 23/09): a entrevista
 * gravava o DISC e os decisores corretamente, e a ficha **não mostrava
 * nenhum dos dois**. O parceiro conduzia 24 perguntas, via o resultado uma
 * vez na tela final, e ao voltar para a ficha não havia sinal de que aquilo
 * tinha acontecido — nem de quem precisa estar na Reunião Preliminar.
 *
 * Feature que grava certo e não mostra é feature que ninguém confia.
 */
export function PainelEntrevistaPrevia({
  clienteId,
  temDisc,
  decisores,
  entrevistas,
}: {
  clienteId: string;
  temDisc: boolean;
  decisores: { nome: string; papel: string | null; principal: boolean }[];
  entrevistas: EntrevistaPreviaLinha[];
}) {
  const concluidas = entrevistas.filter((e) => e.concluida_em);
  const ultima = concluidas[0] ?? null;
  const exigeTodos = decisores.length > 1;

  return (
    <div className="grid gap-3 border border-borda-fina px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="rotulo">Entrevista Prévia</p>
          <p className="corpo-sm text-muted-foreground">
            {ultima
              ? `Última em ${formatarData(ultima.concluida_em!)}${
                  ultima.entrevistado ? ` com ${ultima.entrevistado}` : ""
                }.`
              : temDisc
                ? "O perfil foi preenchido à mão. Uma entrevista gera o relatório completo."
                : "Responda com o cliente ao telefone. O perfil DISC é gerado no final, sozinho."}
          </p>
        </div>
        <Link
          href={`/clientes/${clienteId}/entrevista`}
          className={buttonVariants({ variant: ultima ? "outline" : "default" })}
        >
          {ultima ? "Nova entrevista" : "Iniciar entrevista"}
        </Link>
      </div>

      {/* 🔴 A TRAVA, onde o parceiro decide marcar a reunião. Regra do Marcio:
          *"para realizar a reunião preliminar, todos os decisores precisam"*.
          Repetir aqui (além da tela de sessões) é deliberado: é nesta ficha
          que ele olha antes de combinar a data com o cliente. */}
      {decisores.length > 0 ? (
        <div className="grid gap-1 border-t border-borda-fina pt-3">
          <p className="rotulo text-muted-foreground">
            Quem decide {exigeTodos ? `(${decisores.length})` : ""}
          </p>
          <ul className="corpo-sm grid gap-0.5">
            {decisores.map((d, i) => (
              <li key={`${d.nome}-${i}`}>
                {d.nome}
                {d.papel ? (
                  <span className="text-muted-foreground"> — {d.papel}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {exigeTodos ? (
            <p className="corpo-sm mt-1 text-accent-foreground">
              A Reunião Preliminar só acontece com <strong>todos presentes</strong>.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Histórico: entrevistas são ILIMITADAS por desenho, então a ficha
          mostra quantas houve. Sem isso, refazer a entrevista pareceria
          sobrescrever o passado — e não sobrescreve, acumula. */}
      {concluidas.length > 1 ? (
        <p className="corpo-sm border-t border-borda-fina pt-3 text-muted-foreground">
          {concluidas.length} entrevistas registradas para este cliente.
        </p>
      ) : null}
    </div>
  );
}
