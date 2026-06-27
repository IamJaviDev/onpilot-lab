/** Formas que devuelve la API real de clientes (ver clients.service.ts). */

export interface ClientListItem {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  isVip: boolean;
  vipDiscountPercent: number;
  tags: string[];
  createdAt: string;
}

export interface ClientDetail extends ClientListItem {
  notes: string | null;
}

export interface ClientListResponse {
  items: ClientListItem[];
  page: number;
  limit: number;
  total: number;
}

export interface ListClientsParams {
  search?: string;
  page?: number;
  limit?: number;
}

/** Payload de alta/edición (name/phone obligatorios en alta). */
export interface ClientFormPayload {
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
}

export interface UpdateVipPayload {
  isVip: boolean;
  vipDiscountPercent: number;
}
