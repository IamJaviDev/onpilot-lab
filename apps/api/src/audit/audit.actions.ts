// Literales centralizados de auditoría: evitan typos en los `action` /
// `resourceType` repartidos por los controllers. Formato de acción:
// `<entidad>.<accion>` en minúsculas (ver docs/08-security-rules).

export const AUDIT_RESOURCES = {
  AUTH: 'Auth',
  CLIENT: 'Client',
  SERVICE: 'Service',
  APPOINTMENT: 'Appointment',
  PAYMENT: 'Payment',
  CONVERSATION: 'Conversation',
} as const;

export const AUDIT_ACTIONS = {
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',

  CLIENT_CREATE: 'client.create',
  CLIENT_UPDATE: 'client.update',
  CLIENT_VIP_UPDATE: 'client.vip_update',
  CLIENT_DELETE: 'client.delete',

  SERVICE_CREATE: 'service.create',
  SERVICE_UPDATE: 'service.update',
  SERVICE_DELETE: 'service.delete',

  APPOINTMENT_CREATE: 'appointment.create',
  APPOINTMENT_UPDATE: 'appointment.update',
  APPOINTMENT_CANCEL: 'appointment.cancel',
  APPOINTMENT_NO_SHOW: 'appointment.no_show',

  PAYMENT_CREATE: 'payment.create',
  PAYMENT_MARK_ERROR: 'payment.mark_error',

  CONVERSATION_TAKE_CONTROL: 'conversation.take_control',
  CONVERSATION_RELEASE: 'conversation.release',
  CONVERSATION_MANUAL_MESSAGE: 'conversation.manual_message',
} as const;
