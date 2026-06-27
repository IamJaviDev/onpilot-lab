import Link from "next/link";
import { ClientAvatar, ClientTag } from "./client-bits";
import type { ClientListItem } from "@/lib/clients/types";

export function ClientRow({ client }: { client: ClientListItem }) {
  return (
    <Link
      href={`/clientes/${client.id}`}
      className="flex items-center gap-3 border-b border-border px-4 py-3 transition hover:bg-white"
    >
      <ClientAvatar name={client.name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">
          {client.name}
        </div>
        <div className="truncate text-xs text-label">{client.phone}</div>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1">
        {client.tags.map((tag) => (
          <ClientTag key={tag} tag={tag} />
        ))}
      </div>
    </Link>
  );
}
