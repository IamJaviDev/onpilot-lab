import { redirect } from "next/navigation";

/** La home protegida redirige a Agenda (pantalla por defecto de H1). */
export default function AppIndex() {
  redirect("/agenda");
}
