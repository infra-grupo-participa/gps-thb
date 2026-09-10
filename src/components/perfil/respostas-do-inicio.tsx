import { FileText } from "lucide-react";

import { Secao } from "@/components/ui/secao";
import { Card, CardContent } from "@/components/ui/card";
import { brlOuTraco } from "@/lib/moeda";
import { formatarData } from "@/lib/datas";
import type { MeuOnboarding } from "@/lib/types";
import {
  OPCOES_FASE,
  OPCOES_ORIGEM,
  PERGUNTA_AJUDA,
  PERGUNTA_CASO,
  PERGUNTA_CLIENTE1,
  PERGUNTA_FASE,
  ROTULO_HONORARIOS,
  TITULO_DOCUMENTOS,
} from "@/components/onboarding/tipos";
import { AnexoDoInicio } from "./anexo-do-inicio";

/**
 * "Suas respostas do início" — o que o aluno respondeu no primeiro acesso,
 * **somente leitura**.
 *
 * 🔑 Não é um formulário reeditável, e isso é decisão, não preguiça: a
 * resposta é o **retrato do dia 0** e serve para a equipe saber de onde a
 * pessoa partiu. O estado VIVO é o cliente, na aba Clientes — se ele mudou de
 * fase, é lá que muda. Deixar editar aqui criaria duas verdades sobre o mesmo
 * caso, e a antiga venceria por ser a mais visível.
 *
 * 🔑 **Some quando não há resposta.** Quem ainda não respondeu não precisa de
 * uma seção vazia dizendo isso — ele vai ver o pop-up no próximo acesso. Quem
 * chama passa `null` e a seção não existe.
 */
export function RespostasDoInicio({
  dados,
}: {
  dados: MeuOnboarding | null;
  /** As abas reais da pessoa — o "Rever a apresentação" itera exatamente elas. */
}) {
  if (!dados || dados.status !== "concluido") return null;

  const r = dados.respostas;
  const origem = OPCOES_ORIGEM.find((o) => o.id === r.origemCliente1);
  const fase = OPCOES_FASE.find((f) => f.id === r.faseCliente1);

  const respostas: { pergunta: string; resposta: React.ReactNode }[] = [
    { pergunta: PERGUNTA_CLIENTE1, resposta: origem?.rotulo ?? "—" },
    ...(fase ? [{ pergunta: PERGUNTA_FASE, resposta: fase.rotulo }] : []),
    ...(r.clienteNome
      ? [{ pergunta: "O seu cliente 1", resposta: r.clienteNome }]
      : []),
    ...(r.valorHonorarios != null
      ? [
          {
            pergunta: ROTULO_HONORARIOS,
            resposta: brlOuTraco(r.valorHonorarios),
          },
        ]
      : []),
    ...(r.descricaoCaso
      ? [{ pergunta: PERGUNTA_CASO, resposta: r.descricaoCaso }]
      : []),
    ...(r.ajudaPronta
      ? [{ pergunta: PERGUNTA_AJUDA, resposta: r.ajudaPronta }]
      : []),
  ];

  return (
    <Secao
      icone={<FileText />}
      titulo="Suas respostas do início"
      descricao="O que você contou quando entrou no programa. Mudou alguma coisa? Fale com a equipe pelo Suporte."
    >
      <Card>
        <CardContent className="grid gap-4">
          <dl className="grid gap-4">
            {respostas.map((r) => (
              <div key={r.pergunta} className="grid gap-1">
                <dt className="rotulo text-muted-foreground text-balance">
                  {r.pergunta}
                </dt>
                {/* `whitespace-pre-line`: os dois campos abertos são texto de
                    verdade, escrito em parágrafos. Colapsar as quebras faria a
                    resposta da pessoa virar um bloco ilegível. */}
                <dd className="corpo whitespace-pre-line text-pretty">
                  {r.resposta}
                </dd>
              </div>
            ))}
          </dl>

          {dados.anexos.length > 0 ? (
            <div className="grid gap-1.5">
              <p className="rotulo text-muted-foreground">{TITULO_DOCUMENTOS}</p>
              <ul className="grid gap-1.5">
                {dados.anexos.map((a) => (
                  <li key={a.id}>
                    <AnexoDoInicio anexo={a} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {r.concluidoEm ? (
            <p className="corpo-sm text-muted-foreground">
              Respondido em {formatarData(r.concluidoEm)}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Secao>
  );
}
