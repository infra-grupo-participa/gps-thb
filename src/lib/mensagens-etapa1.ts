/**
 * A sequência de 3 mensagens que marca a reunião preliminar.
 *
 * Pedido do Marcio (10/09/2026): *"enviar mensagem padrão e enviar mensagem
 * de estudo de caso vão sair... a gente vai colocar esses botões como links.
 * Cada link vai abrir um pop-up com o conteúdo da mensagem, com um botão,
 * uma funcionalidade para copiar aquilo e as instruções de envio"*.
 *
 * Fonte: `Método Holding Brasil.md`, passo 2. **O texto é copiado dali
 * literalmente** — é a copy que o aluno vai mandar para o cliente dele, e
 * qualquer "melhoria" de redação aqui vira uma mensagem diferente da que a
 * equipe validou.
 *
 * 🔑 A NUMERAÇÃO DAS MENSAGENS É O DIA, NÃO A ORDEM. As instruções dizem
 * "enviar no dia 3, nunca no dia seguinte" e "a palavra instituição tem que
 * se manter até o dia 5" — o intervalo É a técnica, não um detalhe. Por isso
 * cada mensagem carrega `quando`, exibido junto do título.
 *
 * 🔴 O NEGRITO É PARTE DA MENSAGEM. As instruções mandam negritar trechos
 * específicos ("mais que isso vira panfleto"), e o WhatsApp usa `*asterisco*`.
 * Como o texto vai ser COPIADO e colado lá, ele é guardado com os asteriscos
 * — tirar para a tela ficar bonita entregaria ao cliente uma mensagem sem a
 * ênfase que a equipe desenhou.
 */

export interface MensagemDaSequencia {
  /** Identidade estável — vai na URL do diálogo e em nada mais. */
  id: "problema" | "solucao" | "urgencia";
  /** O número que o aluno vê. */
  ordem: 1 | 2 | 3;
  /** O que esta mensagem faz. */
  titulo: string;
  /** Quando enviar — o intervalo é a técnica, não um detalhe. */
  quando: string;
  /** O texto, pronto para copiar. Com `*negrito*` do WhatsApp. */
  texto: string;
  /** As instruções de envio, uma por linha. */
  instrucoes: string[];
}

export const SEQUENCIA_MENSAGENS: MensagemDaSequencia[] = [
  {
    id: "problema",
    ordem: 1,
    titulo: "Apresentação do problema",
    quando: "Dia 1 — a primeira mensagem",
    texto: `[Nome], vou te mandar uma mensagem meio fora do comum, e já peço desculpa pelo tamanho dela. Nos últimos meses eu venho me dedicando a uma área do Direito que cuida da organização do patrimônio das famílias, e tem um dado ali que me tirou o sono.

Todo mundo acha que, quando um pai ou uma mãe falece, a família paga o imposto de herança e pronto. No Brasil esse imposto hoje fica entre 4% e 8%, dependendo do estado. Parece suportável. Só que o imposto é a menor parte da conta. Quando você soma imposto, honorários de advogado, custas judiciais, taxas de cartório, avaliação de bens e o tempo em que ninguém da família pode vender nem usar nada, um inventário consome *até 44% do patrimônio*. Quase metade de tudo que foi construído em décadas.

E agora vem a parte que me fez escrever para você. Com a reforma tributária, o imposto sobre herança e doação muda a partir do ano que vem. Cobrar por alíquotas progressivas deixou de ser uma opção de cada estado e passou a ser obrigação de todos eles. E o estudo técnico que as secretarias estaduais de fazenda levaram ao Senado propõe elevar o teto *de 8% para 21%*. Se isso se confirmar, a conta do inventário deixa de ser 44% e passa de metade do patrimônio da família. Mais da metade de tudo que uma família levou trinta, quarenta anos para construir, no suor, indo embora. Não para os filhos. Não para os netos. Para nada.

É por isso que estou participando ativamente de uma comunidade de profissionais que se dedica a realizar estudos técnicos de estruturação patrimonial para proteger as famílias.

E a razão de eu estar te escrevendo é simples: dentro das nossas reuniões nesse grupo, algumas vezes você me veio à cabeça. Porque eu imagino que a sua família possa ser fortemente impactada por esse problema. Eu digo "possa", e faço questão de dizer assim, porque você pode ter certeza de que isso não vai acontecer com vocês. Eu vou te dar as coordenadas de como evitar.

Por hoje eu paro por aqui, que já ficou longo demais. Amanhã ou depois eu te mando outra mensagem contando um pouco dos detalhes de como se evita isso e de como se protege de verdade os seus filhos e tudo que você construiu na vida. Um grande abraço. Até mais.`,
    instrucoes: [
      "Trocar [Nome] pelo primeiro nome, do jeito que ele chama a pessoa no dia a dia.",
      "Enviar em uma única mensagem, não em quatro balões. Fragmentar destrói o efeito de carta pessoal e vira spam visual.",
      "Se a conversa estiver parada há muito tempo, abrir com uma linha própria de retomada antes do bloco 1, e só depois entrar no texto.",
      "Negritar no WhatsApp apenas duas coisas: *até 44% do patrimônio* e *de 8% para 21%*. Mais que isso vira panfleto.",
      "Se a pessoa responder na hora perguntando o que é, não entregar a solução no dia 1. Responder que vai explicar direito na próxima mensagem, que é justamente sobre isso.",
      "Enviar em blocos pequenos ao longo do dia, nunca a lista inteira de uma vez, sob pena de restrição do número pelo WhatsApp.",
    ],
  },
  {
    id: "solucao",
    ordem: 2,
    titulo: "A solução",
    quando: "Dia 3 — nunca no dia seguinte",
    texto: `[Nome], como eu tinha te prometido, volto aqui para te contar a outra metade dessa história.

Começo por uma pergunta que talvez você nunca tenha se feito: por que a gente nunca ouve falar de família de bilionários brigando em inventário e perdendo metade do patrimônio para custo de processo? Não tô falando de ricos, mas de bilionários. Não é porque eles têm advogado melhor.

A resposta é mais simples que isso, e é quase constrangedora de tão simples. Quando a pessoa morre, não existe nada no nome dela para inventariar. Os bens dessas famílias não estão "personificados", ou seja, não estão em nome de pessoa nenhuma. Eles estão em nome de uma instituição. E a pessoa, em vida, é a dona dessa instituição. Parece um detalhe de papel. Não é. Porque *Pessoa morre. Instituição não morre.*

E como a instituição não morre, não existe inventário. Não existe processo, não existem honorários de inventário, não existem custas judiciais, não existe fila de cartório, e principalmente não existe aquele período de dois, cinco, sete anos em que ninguém da família pode vender, alugar ou tocar em nada. O imposto, quando ele existe, é pago em vida, pela alíquota de hoje e sobre o valor de hoje. Não pela alíquota que vier em 2027, sobre o que os seus bens valerem lá na frente.

E não pára por aí. Se um filho casa e um dia esse casamento termina mal, o patrimônio que está na instituição não se comunica com o regime de bens desse casamento. Genro e nora nunca entram na conta. Se o pai ou a mãe tem um revés financeiro, ou se a empresa da família passa por um aperto, os bens que estão na instituição não respondem por essas dívidas. Eles ficam protegidos.

E o ponto que mais importa para quem construiu tudo com o próprio trabalho: enquanto os pais quiserem, os pais mandam em absolutamente tudo. Nem os filhos, e muito menos genro ou nora, têm qualquer poder sobre os bens. Isso não é entregar o patrimônio em vida (aliás, doar bens em vida é, literalmente, coisa de pobre que enricou um pouquinho). Isso é organizar o patrimônio de forma sofisticada, apesar de ser tão simples. Tem também a parte tributária dos rendimentos, aluguéis inclusive, que muda bastante com a reforma. É longa demais para eu colocar aqui e depende do caso de cada família, mas é uma das primeiras coisas que se olha.

Agora, [Nome], eu preciso ser honesto com você sobre uma coisa: nada disso funciona de qualquer jeito. Isso é trabalho técnico, feito sob medida, porque cada família tem um patrimônio diferente, pessoas diferentes e objetivos diferentes. Feito no improviso, não protege ninguém. Vira só uma empresa com CNPJ e pode acreditar em mim, eu sei que não é isso o que você quer.

E guarde essa, que é a parte boa: o que protege essas famílias não é o tamanho do patrimônio delas. É a forma como esse patrimônio está no papel. Isso nunca foi privilégio de bilionário.

Assim como na mensagem passada, a ideia aqui era só te mostrar um pouco do que eu tenho pensado a respeito de você e da sua família, por conta dessa especialização que eu trouxe para dentro do meu escritório. E de novo eu me alonguei, e não quero que você tenha que ler isso três vezes para entender.

Então encerro por aqui e depois te mando o que, para mim, é o mais delicado de tudo: o fato de estarmos vivendo um momento no país que não dá tempo às famílias de decidir com tranquilidade. As mudanças estão acontecendo agora. Boa parte já foi aprovada, já foi sancionada, e entra em vigor no começo do ano. É claro que ninguém está falando disso em ano de eleição. Falar em aumento de imposto não combina com pedir voto. Desagradável, mas é o que está acontecendo e é o que vai acontecer a partir de 1º de janeiro.

Na próxima eu te dou mais detalhes sobre isso e te falo também como fazer para essa solução deixar de ser uma boa ideia e virar uma realidade para a sua família, se esse for o seu desejo. Um forte abraço. Até mais.`,
    instrucoes: [
      "Enviar no dia 3, nunca no dia seguinte. O intervalo é o que faz a mensagem parecer pensamento, e não sequência automática.",
      "Se a pessoa respondeu alguma coisa à mensagem 1, responder aquilo primeiro, em mensagem separada, e só depois mandar esta.",
      "Negritar apenas *Pessoa morre. Instituição não morre.* Nada mais.",
      'Se a pessoa perguntar "isso é holding?", confirmar com naturalidade, sem entrar em detalhe técnico, e dizer que a próxima mensagem é justamente sobre o prazo. Não antecipar a reunião. Quem antecipa a oferta no dia 3 perde a escassez do dia 5.',
      'A palavra "instituição" tem que se manter até o dia 5. É o que dá à mensagem 3 o que revelar.',
    ],
  },
  {
    id: "urgencia",
    ordem: 3,
    titulo: "Urgência, escassez e reunião preliminar",
    quando: "Dia 5 — é aqui que a reunião é oferecida",
    texto: `[Nome], talvez tenha faltado eu esclarecer para você exatamente o que é essa instituição de que eu te falei.

É uma Holding Familiar. Na verdade, o nome é o que menos importa, mas talvez você já tenha ouvido falar, talvez não. Hoje em dia ela ficou bem mais popular, exatamente por conta desse movimento que o grupo do qual eu faço parte vem construindo no país inteiro. Esse grupo se chama *Time Holding Brasil*.

Na mensagem passada eu te falei da urgência que as pessoas têm de fazer logo a sua Holding Familiar. E não é alarmismo, não. É a mais pura verdade. Existe uma lei que já foi aprovada e que, a partir deste ano, obriga os estados a aumentarem os seus impostos sobre doação e herança. E a alíquota pretendida, num documento assinado unanimemente pelos 27 estados, é de 21%. Isso é um absurdo: aumentar de 4% para 21%.

Detalhe: nem depende de lei nova para que esse aumento aconteça nacionalmente, porque já existe uma lei determinando que isso seja feito e uma previsão na Constituição. Basta uma resolução do Senado para autorizar. Óbvio que os estados ainda vão criar as regras estaduais deles sobre isso, mas o fato é que, a partir de janeiro de 2027, quem tem patrimônio entra no verdadeiro Deus nos acuda. O que é lamentável. Tudo isso para pagar a conta de uma crise que foram os próprios políticos que criaram.

Bom, meu amigo, mas a nós não cabe ficar chorando o leite que eles derramaram. Esses são os políticos que temos no país, e são eles que legislam sobre os bens que nós temos.

O que eu pude fazer, para um grupo de pessoas no qual se inclui você, foi disponibilizar uma agenda específica para atender essas pessoas mais próximas numa reunião preliminar de viabilidade. E eu, de coração, peço desculpas por não ter um pouco mais de tempo disponível para isso. Por conta desse mesmo problema, da popularização da Holding Familiar por parte do nosso grupo, o Time Holding Brasil, e desse avanço dos políticos que foi a reforma tributária, a minha agenda daqui até o final do ano ficou completamente assoberbada.

Mas eu consegui disponibilizar para você a próxima *[segunda-feira]* às *[14:00]* ou a *[quarta]* às *[10:45]*. Obviamente, se isso for algo que está tirando o seu sono e se te interessa, como eu deduzo que sim, meu amigo.

Só para deixar claro: apesar disso ser trabalho e de eu normalmente ser remunerado por ele aqui no escritório com os demais clientes, essa é uma iniciativa minha para ajudar algumas pessoas que eu particularmente acho justo poder ajudar, e não deixar essas pessoas à mercê desse absurdo que está acontecendo no país. Então você não terá absolutamente nenhum custo para essa reunião, que será feita diretamente comigo.

Só me confirma aqui embaixo se realmente isso é algo que você deseja, e qual dos dois horários se encaixa melhor para você e eu peço a um assistente do meu escritório para fazer contato e ajustar os detalhes da agenda e outras informações com você. Me diz aqui…`,
    instrucoes: [
      "Trocar os dois horários pelos horários reais e bloquear os dois na agenda antes de enviar.",
      'Sempre dois horários. Nunca três, nunca "me diz sua disponibilidade".',
      "Negritar apenas *Time Holding Brasil* e os dois horários.",
      'Se a pessoa escolher um horário, confirmar em uma linha e parar. "Fechado, segunda às 14:00. O [assistente] te chama ainda hoje. Até segunda, [Nome]." Explicar Holding no WhatsApp é como se perde a reunião.',
      "Se vier dúvida em vez de escolha, responder em duas linhas no máximo e devolver a pergunta dos dois horários. A dúvida se resolve na sessão, não no texto.",
      'Se não vier resposta, não mandar quarta mensagem cobrando. Sete a dez dias depois, uma linha solta e sem oferta: "[Nome], abriu uma vaga na quinta às 9:00 e eu lembrei de você. Se quiser, é sua."',
    ],
  },
];
