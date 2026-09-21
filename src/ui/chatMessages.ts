import { WELCOME_MESSAGE } from '../nlp';

export interface ChatMessage {
  id: number;
  role: 'user' | 'admin';
  text: string;
}

export function initialChatMessages(): ChatMessage[] {
  return [{ id: 1, role: 'admin', text: WELCOME_MESSAGE }];
}
