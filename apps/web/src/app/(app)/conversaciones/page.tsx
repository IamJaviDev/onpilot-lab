import { EmptyDetail } from "@/components/conversations/empty-detail";

/**
 * Índice del panel: la lista la pinta el layout (master-detail). Aquí solo va
 * el panel derecho vacío para desktop; en móvil este panel queda oculto y se ve
 * la lista a pantalla completa.
 */
export default function ConversacionesPage() {
  return <EmptyDetail />;
}
