import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { env } from '../config/env';

let client: TextToSpeechClient | null = null;

function getTtsClient() {
  if (!client) {
    client = new TextToSpeechClient({ projectId: env.projectId });
  }
  return client;
}

export async function synthesizeSpeech(text: string): Promise<Uint8Array | string | null | undefined> {
  const client = getTtsClient();

  const request = {
    input: { text },
    voice: { languageCode: 'en-US', name: 'en-US-Journey-F' },
    audioConfig: { audioEncoding: 'MP3' as const },
  };

  const [response] = await client.synthesizeSpeech(request);
  return response.audioContent;
}
