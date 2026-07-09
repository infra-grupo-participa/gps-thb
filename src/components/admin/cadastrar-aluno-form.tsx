"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, UserRoundPlus, TriangleAlert } from "lucide-react";
import {
  cadastrarAluno,
  listarTurmas,
  type AlunoBusca,
  type AlunoDuplicado,
} from "@/app/admin/actions";
import { PLANOS_ALUNO, type Turma } from "@/lib/types";
import {
  mascaraCep,
  mascaraCpfCnpj,
  mascaraTelefone,
  tipoDocumento,
} from "@/lib/masks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROTULO_PLANO: Record<string, string> = {
  aluno: "Aluno",
  diamante: "Diamante",
  platina: "Platina",
  super_diamante: "Super Diamante",
  aurum: "Aurum",
};

const SEM_TURMA = "sem-turma";

function Campo({
  id,
  label,
  valor,
  onChange,
  placeholder,
  tipo,
  dica,
  className,
}: {
  id: string;
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  tipo?: string;
  dica?: string;
  className?: string;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {dica ? <p className="text-xs text-muted-foreground">{dica}</p> : null}
    </div>
  );
}

/**
 * Cadastro de um aluno que não está na base do Time Holding Brasil.
 * Ao concluir, devolve o aluno criado para o fluxo de criar acesso.
 */
export function CadastrarAlunoForm({
  termoInicial,
  onVoltar,
  onCadastrado,
  onUsarExistente,
}: {
  termoInicial: string;
  onVoltar: () => void;
  onCadastrado: (aluno: AlunoBusca) => void;
  onUsarExistente: (duplicado: AlunoDuplicado) => void;
}) {
  const pareceEmail = /\S+@\S+\.\S+/.test(termoInicial);
  const pareceDocumento = /^[\d.\-/\s]+$/.test(termoInicial.trim());

  const [nome, setNome] = useState(
    pareceEmail || pareceDocumento ? "" : termoInicial.trim(),
  );
  const [email, setEmail] = useState(pareceEmail ? termoInicial.trim() : "");
  const [documento, setDocumento] = useState(
    pareceDocumento ? mascaraCpfCnpj(termoInicial) : "",
  );
  const [telefone, setTelefone] = useState("");
  const [profissao, setProfissao] = useState("");
  const [plano, setPlano] = useState("aluno");
  const [turmaId, setTurmaId] = useState<string>(SEM_TURMA);
  const [turmas, setTurmas] = useState<Turma[]>([]);

  const [cep, setCep] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [bairro, setBairro] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");

  const [instagramUrl, setInstagramUrl] = useState("");
  const [siteProfissional, setSiteProfissional] = useState("");
  const [linkFacebook, setLinkFacebook] = useState("");

  const [duplicado, setDuplicado] = useState<AlunoDuplicado | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    listarTurmas().then(setTurmas);
  }, []);

  const doc = tipoDocumento(documento);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setDuplicado(null);
    startTransition(async () => {
      const res = await cadastrarAluno({
        nome,
        email,
        documento,
        telefone,
        profissao,
        plano,
        turmaId: turmaId === SEM_TURMA ? null : Number(turmaId),
        cep,
        cidade,
        estado,
        bairro,
        logradouro,
        numero,
        complemento,
        instagramUrl,
        siteProfissional,
        linkFacebook,
      });

      if (res.duplicado) {
        setDuplicado(res.duplicado);
        return;
      }
      if (res.erro || !res.aluno) {
        toast.error(res.erro ?? "Não foi possível cadastrar.");
        return;
      }
      toast.success("Aluno cadastrado na base.");
      onCadastrado(res.aluno);
    });
  }

  return (
    <form onSubmit={salvar} className="grid gap-4">
      <button
        type="button"
        onClick={onVoltar}
        className="flex items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> voltar para a busca
      </button>

      {duplicado ? (
        <div className="rounded-md border border-amber-600/30 bg-amber-600/10 p-3">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Este aluno já está na base
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Encontrado pelo{" "}
                {duplicado.motivo === "documento" ? "CPF/CNPJ" : "e-mail"}:{" "}
                <strong>{duplicado.nome ?? "—"}</strong>
                {duplicado.email ? ` · ${duplicado.email}` : ""}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => onUsarExistente(duplicado)}
              >
                Usar este aluno
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Identificação
        </h3>
        <Campo
          id="na-nome"
          label="Nome completo *"
          valor={nome}
          onChange={setNome}
          placeholder="Maria Silva"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            id="na-email"
            label="E-mail *"
            tipo="email"
            valor={email}
            onChange={setEmail}
            placeholder="email@exemplo.com"
          />
          <Campo
            id="na-documento"
            label="CPF/CNPJ"
            valor={documento}
            onChange={(v) => setDocumento(mascaraCpfCnpj(v))}
            placeholder="000.000.000-00"
            dica={
              doc
                ? `${doc} — usado para vincular o login do aluno.`
                : "Recomendado: é por ele que o cadastro do aluno se vincula."
            }
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            id="na-telefone"
            label="Telefone"
            valor={telefone}
            onChange={(v) => setTelefone(mascaraTelefone(v))}
            placeholder="(11) 90000-0000"
          />
          <Campo
            id="na-profissao"
            label="Profissão"
            valor={profissao}
            onChange={setProfissao}
            placeholder="Advogado(a)"
          />
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Programa
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="na-plano">Plano</Label>
            <Select value={plano} onValueChange={(v) => setPlano(v || "aluno")}>
              <SelectTrigger id="na-plano">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLANOS_ALUNO.map((p) => (
                  <SelectItem key={p} value={p}>
                    {ROTULO_PLANO[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="na-turma">Turma</Label>
            <Select
              value={turmaId}
              onValueChange={(v) => setTurmaId(v || SEM_TURMA)}
            >
              <SelectTrigger id="na-turma">
                <SelectValue placeholder="Sem turma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_TURMA}>Sem turma</SelectItem>
                {turmas.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.codigo ?? `#${t.id}`}
                    {t.atual ? " (atual)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Endereço
        </h3>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <Campo
            id="na-cep"
            label="CEP"
            valor={cep}
            onChange={(v) => setCep(mascaraCep(v))}
            placeholder="00000-000"
          />
          <Campo
            id="na-cidade"
            label="Cidade"
            valor={cidade}
            onChange={setCidade}
          />
          <Campo
            id="na-estado"
            label="UF"
            valor={estado}
            onChange={(v) => setEstado(v.toUpperCase().slice(0, 2))}
            placeholder="SP"
            className="w-20"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Campo
            id="na-logradouro"
            label="Logradouro"
            valor={logradouro}
            onChange={setLogradouro}
            placeholder="Rua ..."
          />
          <Campo
            id="na-numero"
            label="Número"
            valor={numero}
            onChange={setNumero}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            id="na-bairro"
            label="Bairro"
            valor={bairro}
            onChange={setBairro}
          />
          <Campo
            id="na-complemento"
            label="Complemento"
            valor={complemento}
            onChange={setComplemento}
          />
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Presença digital
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            id="na-instagram"
            label="Instagram"
            valor={instagramUrl}
            onChange={setInstagramUrl}
            placeholder="https://instagram.com/..."
          />
          <Campo
            id="na-site"
            label="Site profissional"
            valor={siteProfissional}
            onChange={setSiteProfissional}
            placeholder="https://..."
          />
        </div>
        <Campo
          id="na-facebook"
          label="Facebook"
          valor={linkFacebook}
          onChange={setLinkFacebook}
          placeholder="https://facebook.com/..."
        />
      </section>

      <Button type="submit" disabled={pending}>
        <UserRoundPlus className="size-4" />
        {pending ? "Cadastrando..." : "Cadastrar e continuar"}
      </Button>
      <p className="text-xs text-muted-foreground">
        O aluno entra na base do Time Holding Brasil. Em seguida você escolhe
        criar o login agora ou só o ambiente.
      </p>
    </form>
  );
}
