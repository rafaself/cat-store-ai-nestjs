export const EMAIL_SOURCE = Symbol('EMAIL_SOURCE');

export interface EmailMessage {
  id: string;
  subject: string;
  sender: string;
  senderName?: string;
  text: string;
}

export interface EmailSource {
  read(messageId: string): Promise<EmailMessage>;
}
