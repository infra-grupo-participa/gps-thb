import { redirect } from "next/navigation";

// As solicitações agora vivem na aba "Solicitações" do painel do admin.
export default function SolicitacoesRedirect() {
  redirect("/admin");
}
