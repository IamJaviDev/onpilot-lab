import { redirect } from "next/navigation";

/** La home protegida redirige al Inicio (dashboard de H1). */
export default function AppIndex() {
  redirect("/inicio");
}
