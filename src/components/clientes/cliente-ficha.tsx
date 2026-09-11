"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ClienteEtapa1, FaseCliente, GrauRelacao } from "@/lib/types";
import {
  PROBLEMAS_7,
  FASES_CLIENTE,
  GRAUS_RELACAO_UI,
  PERFIS_DISC,
  META_HONORARIOS,
} from "@/lib/etapa1";
import {
  mascaraTelefone,
  moedaParaNumero,
  numeroParaMoeda,
} from "@/lib/masks";
import {
  Phone,
  Calendar,
  User,
  IdCard,
  ListChecks,
  NotebookPen,
} from "lucide-react";
import { atualizarCliente, definirClienteEquipe } from "@/app/clientes/actions";
import { brlInteiro } from "@/lib/moeda";
import { linkWhatsapp } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Secao } from "@/components/ui/secao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogoDesfavoritar } from "@/components/clientes/dialogo-desfavoritar";
import { FichaContrato } from "@/components/clientes/ficha-contrato";
import { FichaCabecalho } from "@/components/clientes/ficha-cabecalho";
import { DialogoEscolherFavorito } from "@/components/clientes/dialogo-escolher-favorito";
import {
  fasesDisponiveis,
  travadoPelaEquipe,
} from "@/components/clientes/clientes-manager/ordenacao";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Só para a copy do campo de honorários — sem centavos, que aqui só ocupam espaço. */
const brlMeta = brlInteiro(META_HONORARIOS);

export function ClienteFicha({
  cliente,
  alunoId,
  admin = false,
  outroConfirmadoNome = null,
  outroFavoritoNome = null,
}: {
  cliente: ClienteEtapa1;
  alunoId: string;
  /**
   * Modo assistência. Só com `true` aparecem "Confirmar acompanhamento" e
   * "Liberar acompanhamento" — quem autoriza mesmo é o `gp_is_admin()` das
   * RPCs `...203`; aqui é a diferença entre oferecer e não oferecer.
   */
  admin?: boolean;
  /**
   * Nome do cliente que a equipe JÁ acompanha no ambiente, quando não é este.
   * `null` = não há outro confirmado. Com um confirmado em outro cliente, a
   * estrela desta ficha some (o banco recusaria a troca) e o motivo é escrito.
   */
  outroConfirmadoNome?: string | null;
  /**
   * Nome do cliente que o ALUNO já escolheu no ambiente, quando não é este e a
   * equipe ainda não confirmou. Desde a migração ...215 a escolha basta para o
   * banco recusar a troca (42501), então a estrela também some daqui — com a
   * razão escrita. `null` = não há outro escolhido.
   */
  outroFavoritoNome?: string | null;
}) {
  const router = useRouter();
  const [nome, setNome] = useState(cliente.nome ?? "");
  const [telefone, setTelefone] = useState(
    cliente.telefone ? mascaraTelefone(cliente.telefone) : "",
  );
  const [grau, setGrau] = useState<string>(cliente.grau_relacao ?? "");
  const [problemas, setProblemas] = useState<string[]>(cliente.problemas ?? []);
  const [fase, setFase] = useState<FaseCliente>(
    cliente.fase ?? "prospeccao",
  );
  const [dataReuniao, setDataReuniao] = useState(
    cliente.data_reuniao_preliminar ?? "",
  );
  const [disc, setDisc] = useState(cliente.perfil_disc ?? "");
  const [aderiu, setAderiu] = useState(cliente.aderiu_reuniao);
  const [msgPadrao, setMsgPadrao] = useState(cliente.mensagem_padrao_enviada);
  const [estudoCaso, setEstudoCaso] = useState(cliente.estudo_caso_enviado);
  const [ligacao, setLigacao] = useState(cliente.ligacao_realizada);
  const [registro, setRegistro] = useState(cliente.registro_contato ?? "");
  const [acompanhado, setAcompanhado] = useState(cliente.acompanhado_equipe);
  /**
   * PL11 — desmarcar a estrela aqui trava os passos 4 a 8 da Etapa 01, igual
   * a desmarcá-la na lista. A lista já confirmava; a ficha desligava num
   * clique. `true` = diálogo aberto. Só o DESLIGAR pergunta: ligar é
   * reversível e não tranca nada.
   */
  const [desfavoritando, setDesfavoritando] = useState(false);
  /** Diálogo de ESCOLHA do cliente acompanhado (aluno, migração ...215). */
  const [escolhendo, setEscolhendo] = useState(false);
  const [erroDialogo, setErroDialogo] = useState<string | null>(null);
  /**
   * Falha da estrela FORA do diálogo (o caminho de ligar, que é um clique só).
   * Fica na tela, com `role="alert"`: a frase que vem da action já é a
   * traduzida do banco ("A equipe está acompanhando este cliente…") e é a única
   * pista do que aconteceu — um toast a apagaria em 4 segundos.
   */
  const [erroEstrela, setErroEstrela] = useState<string | null>(null);
  // Honorários e link do contrato (Fase 7-B). Ficam no estado mesmo quando a
  // fase não é "contratado": o valor SOBREVIVE à volta de fase (B9-b) e é
  // reenviado como está — mudar de fase nunca apaga o que o aluno digitou.
  const [honorarios, setHonorarios] = useState(
    numeroParaMoeda(cliente.valor_honorarios),
  );
  const [contratoUrl, setContratoUrl] = useState(cliente.contrato_url ?? "");
  const [pending, startTransition] = useTransition();
  /**
   * Por que a ficha recusou salvar — a frase EXATA, no `role="alert"` da barra
   * de salvar.
   *
   * Era `toast.error("Erro ao salvar.")`, que jogava fora a frase que a action
   * já traduziu do banco (`traduzirErroBanco`): quando a trigger do
   * acompanhamento confirmado recusa com 42501, "Erro ao salvar." não diz nada
   * e o aluno tenta de novo para sempre. O erro mora ao lado do botão que
   * falhou, não some sozinho em 4 segundos, e some quando ele salva de novo.
   */
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  /** Já houve uma tentativa de salvar? Marca os campos inválidos só depois. */
  const [tentouSalvar, setTentouSalvar] = useState(false);

  const wpp = linkWhatsapp(telefone);
  const contratoLimpo = contratoUrl.trim();
  const faseAtual = FASES_CLIENTE.find((f) => f.id === fase);

  /**
   * A equipe assumiu ESTE cliente? Vem do dado do servidor, nunca do estado
   * local: a confirmação é escrita da equipe e não passa pelo formulário.
   */
  const confirmado = travadoPelaEquipe(cliente);
  /** As fases que o banco ainda aceita para este cliente (§B.5). */
  const fasesDaFicha = fasesDisponiveis(cliente);
  /**
   * 🔴 Migração ...215 — a escolha do aluno é DEFINITIVA. Este cliente já é a
   * estrela e quem lê não é a equipe? Então não há botão nenhum: nem para
   * desmarcar (o banco recusa) nem para trocar. A estrela vira sinal.
   *
   * A leitura é do dado do SERVIDOR (`cliente.acompanhado_equipe`), nunca do
   * `acompanhado` otimista: com o otimista, o botão sumiria no clique, antes de
   * o banco confirmar, e a falha deixaria a ficha sem caminho de volta.
   */
  const escolhidoPeloAluno = !admin && cliente.acompanhado_equipe && !confirmado;
  /** Outro cliente do ambiente já é a estrela (confirmado ou só escolhido). */
  const outroNome = outroConfirmadoNome ?? outroFavoritoNome;
  /**
   * A estrela só aparece quando ela pode funcionar: sem estrela no ambiente, e
   * sem a trava da escolha já feita. Nos demais casos o botão só teria um
   * destino — falhar com 42501.
   */
  const mostraEstrela = !confirmado && !escolhidoPeloAluno && outroNome == null;

  /**
   * Há edição pendente na tela?
   *
   * 🔑 A ficha tem 1.000 px de rolagem e o "Salvar" morava no fim dela, sem
   * barra fixa e sem nenhum sinal de que algo tinha mudado: dava para digitar
   * um campo, rolar para cima, trocar de aba e perder tudo em silêncio. A
   * comparação é contra o `cliente` que veio do servidor — a mesma origem
   * dos `useState` iniciais —, campo a campo e na MESMA normalização que
   * `salvar()` envia (`trim`, `|| null`, máscara de telefone). Se divergir,
   * a barra mente nos dois sentidos.
   */
  const alterado =
    nome.trim() !== (cliente.nome ?? "").trim() ||
    (telefone.trim() || null) !==
      (cliente.telefone ? mascaraTelefone(cliente.telefone) : null) ||
    (grau || null) !== (cliente.grau_relacao ?? null) ||
    problemas.length !== (cliente.problemas ?? []).length ||
    problemas.some((p) => !(cliente.problemas ?? []).includes(p)) ||
    fase !== (cliente.fase ?? "prospeccao") ||
    (dataReuniao || null) !== (cliente.data_reuniao_preliminar ?? null) ||
    (disc || null) !== (cliente.perfil_disc ?? null) ||
    aderiu !== cliente.aderiu_reuniao ||
    msgPadrao !== cliente.mensagem_padrao_enviada ||
    estudoCaso !== cliente.estudo_caso_enviado ||
    ligacao !== cliente.ligacao_realizada ||
    (registro.trim() || null) !== (cliente.registro_contato ?? null) ||
    honorarios !== numeroParaMoeda(cliente.valor_honorarios) ||
    (contratoLimpo || null) !== (cliente.contrato_url ?? null);

  /** Salvar já foi tentado e o grupo de problemas continua vazio. */
  const problemasEmFalta = tentouSalvar && problemas.length === 0;

  const contratado = fase === "contratado";

  // ═══════════════════════════════════════════════════════════════════════
  // 🔑 FICHA RECÉM-CRIADA (decisões do Marcio, 10/09/2026)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // *"Andamento do contato vai ficar inabilitado quando ele fizer o cadastro
  // do cliente pela primeira vez, sem ser uma alteração"* e *"contrato fica
  // desabilitado na hora de cadastrar o cliente, isso fica disponível somente
  // quando ele tiver em execução"*.
  //
  // O diálogo de criação grava nome + fase + grau e abre a ficha em seguida —
  // então "primeira vez" é a ficha que ainda não tem TELEFONE, o campo que a
  // pessoa preenche logo ao chegar aqui. Assim que ela salva com telefone, os
  // campos abrem: a partir daí toda visita é alteração.
  const fichaNova = !cliente.telefone;

  // ✅ O CONTRATO JÁ ESTAVA CERTO: `FichaContrato` recebe `contratado` e só
  // deixa editar quando a fase é "contratado" — que é exatamente "quando ele
  // tiver em execução" (pedido do Marcio, 10/09/2026). Nada a mudar aqui.

  // 🔑 O BOTÃO NÃO OFERECE O QUE NÃO VAI DAR CERTO (Marcio, 10/09/2026):
  // *"se não cadastrar tudo, o botão de salvar ficha fica em branco"*.
  //
  // O essencial é NOME + TELEFONE — é o que faz a ficha contar para os 30 da
  // Etapa 01. Sem eles, salvar produz uma ficha que não conta, e a pessoa não
  // tem como saber disso olhando a tela.
  //
  // ⚠️ Os PROBLEMAS ficam de fora desta trava, de propósito: 355 dos 879
  // clientes estão sem nenhum marcado (medido em 10/09), e travar o salvar
  // por causa deles prenderia 39 ambientes. Eles seguem como aviso âmbar
  // (`problemasEmFalta`), que avisa sem impedir.
  const faltaEssencial = !nome.trim() || !telefone.trim();
  const honorariosValor = moedaParaNumero(honorarios);
  // Mesma regra do CHECK no banco (migração ...090): https, sem espaço, de 12 a
  // 2000 caracteres. Aqui é conveniência — a garantia é a do banco.
  const contratoInvalido =
    contratoLimpo !== "" &&
    (!/^https:\/\/[^\s]+$/.test(contratoLimpo) ||
      contratoLimpo.length < 12 ||
      contratoLimpo.length > 2000);

  /**
   * 🔴 Para o ALUNO, marcar a estrela é escolha única (migração ...215):
   * pergunta antes, com a consequência escrita. Desmarcar nem chega aqui —
   * `mostraEstrela` já não desenha o botão. Para a EQUIPE nada mudou.
   */
  function toggleEquipe() {
    if (acompanhado) {
      if (!admin) return;
      setErroDialogo(null);
      setDesfavoritando(true);
      return;
    }
    if (!admin) {
      setErroDialogo(null);
      setEscolhendo(true);
      return;
    }
    aplicarEquipe(true);
  }

  function aplicarEquipe(ativar: boolean) {
    setErroEstrela(null);
    setAcompanhado(ativar);
    startTransition(async () => {
      const res = await definirClienteEquipe(cliente.id, alunoId, ativar);
      if (res.erro) {
        // Desfaz o otimismo: sem isto a estrela ficaria mentindo na tela.
        setAcompanhado(!ativar);
        // A frase vem TRADUZIDA da action (`traduzirErroBanco` + as entradas
        // de `FRASES_DO_BANCO`): trocá-la por "Erro ao mudar o cliente da
        // equipe" apagaria justamente o que explica a trava e o que fazer.
        setErroDialogo(res.erro);
        setErroEstrela(res.erro);
        return;
      }
      setDesfavoritando(false);
      setEscolhendo(false);
    });
  }

  function toggleProblema(id: string) {
    setProblemas((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function salvar() {
    setTentouSalvar(true);
    setErroSalvar(null);
    if (contratoInvalido) {
      setErroSalvar(
        "O link do contrato precisa começar com https:// e não pode ter espaços.",
      );
      return;
    }
    // 🔑 A exigência do rótulo passou a ser real. A tarefa 1 da Etapa 01 é
    // "listar 30 clientes potenciais com ao menos 1 dos 7 problemas": o
    // problema é o que qualifica a pessoa como cliente de holding, e a legenda
    // já pedia "marque ao menos um" havia meses sem nada conferir — rótulo que
    // não vale é rótulo que ensina a ignorar rótulo. Custa um clique, e o
    // aviso diz qual campo é. Não mexe em métrica nenhuma: `comDados` é nome +
    // telefone + nível, e `problemas` não entra nela.
    //
    // ⚠️ Medido em 10/09 (Fable, war-room): 355 dos 879 clientes (39
    // ambientes) estão com ZERO problema marcado — dado legado de meses. Travar
    // o salvamento inteiro por isso deixaria 40% das fichas sem poder corrigir
    // telefone ou fase. Então: o grupo fica marcado e explicado
    // (`problemasEmFalta`), mas a ficha SALVA. A cobrança do problema é da
    // tarefa 1.1, não do botão Salvar.
    startTransition(async () => {
      const res = await atualizarCliente(cliente.id, alunoId, {
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        // `""` (campo esvaziado) vira `null` = NÃO INFORMADO. A action repete
        // esta normalização — aqui é para o `alterado` acima não mentir.
        grau_relacao: (grau as GrauRelacao) || null,
        problemas,
        // `status` congelou na migração 20260909000060 (é o caminho de volta):
        // nenhum caminho de escrita da aplicação pode tocar nele.
        fase,
        data_reuniao_preliminar: dataReuniao || null,
        perfil_disc: (disc as ClienteEtapa1["perfil_disc"]) || null,
        aderiu_reuniao: aderiu,
        mensagem_padrao_enviada: msgPadrao,
        estudo_caso_enviado: estudoCaso,
        ligacao_realizada: ligacao,
        registro_contato: registro.trim() || null,
        // Enviados sempre, inclusive fora de "contratado": o valor não some
        // ao mover o cliente de volta (B9-b). `null` continua `null` — nunca
        // vira R$ 0,00.
        valor_honorarios: honorariosValor,
        contrato_url: contratoLimpo || null,
      });
      if (res.erro) {
        setErroSalvar(res.erro);
        return;
      }
      setTentouSalvar(false);
      // Salvar sem telefone dizia "Ficha salva." — sucesso absoluto para algo
      // que não conta para os 30. Mesmo padrão do aviso âmbar de problemas:
      // avisa sem travar.
      toast.success(
        telefone.trim()
          ? "Ficha salva."
          : "Ficha salva — falta o telefone para ela contar para os 30.",
      );
    });
  }

  return (
    <div className="grid gap-6">
      <FichaCabecalho
        cliente={cliente}
        alunoId={alunoId}
        admin={admin}
        /* 🔴 O link "abra um chamado" precisa do contexto: absoluto, ele
           ejetava o admin do ambiente do aluno (`/chamados` manda admin
           para `/admin/chamados`). Derivado de `admin` + `alunoId`, que
           esta ficha já conhece. */
        basePath={admin ? `/admin/aluno/${alunoId}` : ""}
        fase={faseAtual}
        wpp={wpp}
        acompanhado={acompanhado}
        confirmado={confirmado}
        escolhidoPeloAluno={escolhidoPeloAluno}
        mostraEstrela={mostraEstrela}
        outroNome={outroNome}
        outroConfirmado={outroConfirmadoNome != null}
        erroEstrela={erroEstrela}
        pending={pending}
        onToggleEquipe={toggleEquipe}
        aoMudarAcompanhamento={() => router.refresh()}
      />

      {/* TRÊS SEÇÕES, não três caixas aninhadas.
          A ficha era um formulário de 1.000 px dentro de um card só, com
          "Problemas" (borda cinza), "Andamento do contato" (borda cinza) e
          "Contrato" (fundo verde) como card-dentro-de-card-dentro-de-card —
          três tratamentos diferentes, um deles com uma cor sem explicação
          sistêmica. `Secao` é a MESMA cabeça de "Seu caminho" e "Meus
          clientes": marcador, título e régua. Sem `numero`: preencher a ficha
          não é uma sequência de passos. */}
      <Card>
        <CardContent className="grid gap-8">
        <Secao
          icone={<IdCard />}
          titulo="Dados do cliente"
          nivel="h3"
          classeConteudo="grid gap-5"
        >
          <div className="grid gap-2">
            <Label htmlFor="f-nome">Nome</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="f-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do cliente"
                className="pl-9"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="f-tel">Telefone</Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="f-tel"
                inputMode="tel"
                value={telefone}
                onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                placeholder="(00) 00000-0000"
                className="pl-9"
                aria-describedby="f-tel-ajuda"
              />
            </div>
            {/* 🔴 MEDIDO EM 10/09/2026: 17 fichas estavam paradas só por falta
                de telefone — a pessoa digitou o nome, a ficha não conta para
                os 30 e ela não tinha como saber por quê. O campo vizinho (grau
                de relação), que NÃO conta, tinha texto de apoio; este, que
                decide a Etapa 01, não tinha nenhum. */}
            <p id="f-tel-ajuda" className="corpo-sm text-muted-foreground">
              {telefone.trim()
                ? "Com nome e telefone, esta ficha conta para os 30 da Etapa 01."
                : "Sem o telefone, esta ficha ainda não conta para os 30 da Etapa 01."}
            </p>
          </div>

          {/* GRAU DE RELAÇÃO — o campo "Nível de relacionamento" (quente/
              morno/frio) que existia ao lado deste foi REMOVIDO por decisão
              do Marcio (10/09/2026); grau é TIPO DE VÍNCULO e continua. */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="f-grau">Grau de relação</Label>
              <Select value={grau} onValueChange={(v) => setGrau(v ?? "")}>
                <SelectTrigger id="f-grau" aria-describedby="f-grau-ajuda">
                  {/* Sem função de render o Base UI imprime o VALOR do banco
                      (`cliente_atual`). E `""` mostra o placeholder, que diz
                      "Não informado" — NUNCA "Lead": a ausência de resposta
                      sobre um terceiro não vira palpite sobre a vida dele. */}
                  <SelectValue placeholder="Não informado">
                    {(v: string) =>
                      GRAUS_RELACAO_UI.find((g) => g.id === v)?.rotulo ??
                      "Não informado"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {GRAUS_RELACAO_UI.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p
                id="f-grau-ajuda"
                className="text-xs leading-snug text-muted-foreground"
              >
                {GRAUS_RELACAO_UI.find((g) => g.id === grau)?.ajuda ??
                  "Como você conhece esta pessoa. Não informado enquanto você não escolher."}
              </p>
            </div>
          </div>

          {/* UX5 — grupo de checkboxes não tem um controle único para
              apontar: o rótulo vira legenda de um `fieldset`, que é a forma
              correta de nomear o conjunto (WCAG 1.3.1). */}
          {/* O `fieldset` já É o grupo (o `legend` o nomeia): a explicação da
              recusa entra por `aria-describedby` NELE, não numa `div` com
              `role="group"` — que não aceita `aria-invalid`. */}
          <fieldset
            className="grid gap-2"
            aria-describedby={problemasEmFalta ? "f-problemas-erro" : undefined}
          >
            <legend className="mb-2 text-sm leading-none font-medium">
              Problemas (marque ao menos um)
            </legend>
            <div
              className={cn(
                "grid gap-2 rounded-lg bg-superficie-afundada p-3 sm:grid-cols-2",
                problemasEmFalta && "outline-2 outline-atencao-foreground",
              )}
            >
              {PROBLEMAS_7.map((p) => (
                <label
                  key={p.id}
                  className="flex items-start gap-2 text-sm leading-tight"
                >
                  <Checkbox
                    checked={problemas.includes(p.id)}
                    onCheckedChange={() => toggleProblema(p.id)}
                    className="mt-0.5"
                  />
                  <span>{p.rotulo}</span>
                </label>
              ))}
            </div>
            {problemasEmFalta ? (
              // Sem `role="alert"`: a barra de salvar já anuncia. Aqui é a
              // marca visual ao lado do campo, para o olho achar onde voltar.
              <p id="f-problemas-erro" className="corpo-sm text-atencao-foreground">
                Nenhum problema marcado — é o que qualifica um cliente de
                holding (tarefa 1). A ficha salva mesmo assim; marque quando
                souber.
              </p>
            ) : null}
          </fieldset>

          {/* "Perda pela inércia" (campo + coluna do grid) REMOVIDO por
              decisão do Marcio (10/09/2026); grid passou de 3 para 2 col. */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="f-fase">Fase</Label>
              <Select
                value={fase}
                onValueChange={(v) => setFase((v as FaseCliente) || "prospeccao")}
              >
                <SelectTrigger id="f-fase" aria-describedby="f-fase-ajuda">
                  {/* Sem função de render o Base UI imprime o VALOR do
                      banco: a ficha mostrava `quente`, `contratado` e `D`. */}
                  <SelectValue>
                    {(v: FaseCliente) =>
                      FASES_CLIENTE.find((f) => f.id === v)?.rotulo ?? v
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {/* Cliente confirmado não oferece "Prospecção": o banco
                      recusa a volta com 42501. Opção que só serve para falhar
                      não é opção. */}
                  {fasesDaFicha.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p
                id="f-fase-ajuda"
                className="text-xs leading-snug text-muted-foreground"
              >
                {faseAtual?.ajuda}
                {confirmado && cliente.fase !== "prospeccao"
                  ? " A equipe está acompanhando este cliente, então a fase não volta para Prospecção."
                  : null}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-data">Data da reunião preliminar</Label>
              {/* 🔴 `flex h-8 items-center` NÃO é decoração — é a correção do
                  "ícone quebrado, caindo para baixo".
                  Duas coisas somadas: (a) a coluna do lado ("Fase") tem texto
                  de ajuda, então a linha do grid ESTICA e o `div.relative`
                  ficava com 44,3 px em vez dos 32 do campo; (b) o
                  `input[type=date]` do Chrome é inline-block e assenta na
                  BASELINE, o que sozinho já deixava o wrapper mais alto que o
                  campo. Como o ícone é `absolute top-1/2`, ele se centralizava
                  na caixa esticada e saía **6,1 px abaixo** do centro do campo,
                  encostando na borda de baixo (medido no Chromium em 1366 e
                  390; depois da correção o desvio é 0,0).
                  `h-8` trava a altura na do `Input` e o `flex` elimina a caixa
                  de linha. Os campos de texto (nome, telefone) não sofrem disso
                  — por isso a correção é aqui, e não em `ui/input.tsx`. */}
              <div className="relative flex h-8 items-center">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="f-data"
                  type="date"
                  value={dataReuniao}
                  onChange={(e) => setDataReuniao(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

        </Secao>

        <Secao
          icone={<ListChecks />}
          titulo="Andamento do contato"
          nivel="h3"
        >
          <div className="grid gap-2 rounded-lg bg-superficie-afundada p-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={msgPadrao}
                  onCheckedChange={(v) => setMsgPadrao(Boolean(v))}
                />
                Mensagem padrão enviada
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={estudoCaso}
                  onCheckedChange={(v) => setEstudoCaso(Boolean(v))}
                />
                Estudo de caso enviado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={ligacao}
                  onCheckedChange={(v) => setLigacao(Boolean(v))}
                />
                Ligação realizada
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={aderiu}
                  onCheckedChange={(v) => setAderiu(Boolean(v))}
                />
                Aderiu à reunião (grupo de WhatsApp)
              </label>
          </div>
        </Secao>

        <FichaContrato
          contratado={contratado}
          honorarios={honorarios}
          onHonorarios={setHonorarios}
          honorariosValor={honorariosValor}
          contratoUrl={contratoUrl}
          onContratoUrl={setContratoUrl}
          contratoLimpo={contratoLimpo}
          contratoInvalido={contratoInvalido}
          faseRotulo={faseAtual?.rotulo}
          metaFormatada={brlMeta}
          clienteId={cliente.id}
          // Vem do SERVIDOR, sempre: a escrita do anexo é por RPC e não passa
          // pelo "Salvar ficha" — manter um espelho local só criaria duas
          // verdades sobre o mesmo arquivo.
          contratoAnexo={
            cliente.contrato_path
              ? {
                  nome: cliente.contrato_nome,
                  mime: cliente.contrato_mime,
                  tamanho: cliente.contrato_tamanho,
                  anexadoEm: cliente.contrato_anexado_em,
                }
              : null
          }
          // 🔴 Só o aluno anexa: `gps.pode_anexar_onboarding` exige que o
          // ambiente do prefixo seja o de quem chama, e o admin não tem
          // ambiente. A equipe baixa e remove.
          podeAnexar={!admin}
          anexoDesabilitado={pending}
          aoMudarAnexo={() => router.refresh()}
        />

        <Secao icone={<NotebookPen />} titulo="Registro e perfil" nivel="h3" classeConteudo="grid gap-5">

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="f-disc">Perfil DISC</Label>
              <Select value={disc} onValueChange={(v) => setDisc(v ?? "")}>
                <SelectTrigger id="f-disc">
                  <SelectValue placeholder="—">
                    {(v: string) =>
                      PERFIS_DISC.find((d) => d.id === v)?.rotulo ?? v
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PERFIS_DISC.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="f-reg">Registro do contato</Label>
            <Textarea
              id="f-reg"
              value={registro}
              onChange={(e) => setRegistro(e.target.value)}
              disabled={fichaNova}
              aria-describedby={fichaNova ? "f-reg-ajuda" : undefined}
              placeholder="Anotações sobre as conversas, ligações e combinados."
              rows={4}
            />
            {fichaNova ? (
              <p id="f-reg-ajuda" className="corpo-sm text-muted-foreground">
                Você preenche depois, quando voltar a esta ficha para registrar
                o contato.
              </p>
            ) : null}
          </div>
        </Secao>
        </CardContent>
      </Card>

      {/* BARRA DE SALVAR FIXA. `sticky bottom-0` fora do `Card` — o `Card` é
          `overflow-hidden` e recortaria qualquer coisa grudada nele. O aviso
          de alteração não salva é `aria-live="polite"`: quem não vê a barra
          precisa ouvir que há algo pendente antes de sair da tela. */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t bg-card/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4 sm:shadow-(--shadow-raised)">
        {erroSalvar ? (
          <p role="alert" className="mr-auto corpo-sm text-destructive">
            {erroSalvar}
          </p>
        ) : (
          <p
            aria-live="polite"
            className="mr-auto corpo-sm text-muted-foreground"
          >
            {faltaEssencial
              ? "Preencha o nome e o telefone para salvar — são eles que fazem a ficha contar para os 30."
              : alterado
                ? "Você tem alterações não salvas nesta ficha."
                : "Tudo salvo."}
          </p>
        )}
        {/* O botão NUNCA é desabilitado por `alterado`: se a comparação
            errar por um campo, o aluno fica preso sem conseguir salvar a
            ficha. O sinal é informativo; salvar de novo é inofensivo. */}
        <Button onClick={salvar} disabled={pending || faltaEssencial}>
          {pending ? "Salvando..." : "Salvar ficha"}
        </Button>
      </div>

      {/* PL11 — o botão da estrela continua montado acima: é para lá que o
          foco volta quando o aluno desiste. O nome vem do campo em edição,
          que é o que ele está lendo na tela. */}
      {desfavoritando ? (
        <DialogoDesfavoritar
          desfavoritando={{ ...cliente, nome: nome.trim() || cliente.nome }}
          pending={pending}
          erroDialogo={erroDialogo}
          onConfirmar={() => aplicarEquipe(false)}
          onCancelar={() => {
            setDesfavoritando(false);
            setErroDialogo(null);
          }}
        />
      ) : null}

      {/* 🔴 Escolha ÚNICA do aluno (migração ...215). Mesmo cuidado do irmão
          acima: o botão da estrela fica montado, para o foco voltar a ele. */}
      {escolhendo ? (
        <DialogoEscolherFavorito
          cliente={{ ...cliente, nome: nome.trim() || cliente.nome }}
          pending={pending}
          erro={erroDialogo}
          onConfirmar={() => aplicarEquipe(true)}
          onCancelar={() => {
            setEscolhendo(false);
            setErroDialogo(null);
          }}
        />
      ) : null}
    </div>
  );
}
