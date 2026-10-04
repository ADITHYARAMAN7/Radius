import { v2 } from '@google-cloud/translate';
import { env } from '../config/env';

const { Translate } = v2;

let client: v2.Translate | null = null;

function getTranslateClient() {
  if (!client) {
    client = new Translate({ projectId: env.projectId });
  }
  return client;
}

export async function translateText(text: string, targetLanguage: string): Promise<string> {
  if (!text) return text;
  try {
    const translate = getTranslateClient();
    const [translation] = await translate.translate(text, targetLanguage);
    return translation;
  } catch (error) {
    // If translation fails, just return original text
    return text;
  }
}
