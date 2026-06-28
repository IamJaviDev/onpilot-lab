import { BusinessMemberRole, GlobalRole } from '../generated/prisma/client';

export interface CurrentUserContext {
  id: string;
  email: string;
  globalRole: GlobalRole;
}

export interface CurrentBusinessContext {
  id: string;
  name: string;
  role: BusinessMemberRole;
  timezone: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: CurrentUserContext;
      currentBusiness?: CurrentBusinessContext | null;
    }
  }
}
