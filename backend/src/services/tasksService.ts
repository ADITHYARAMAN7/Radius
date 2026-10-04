import { CloudTasksClient } from '@google-cloud/tasks';
import { env } from '../config/env';
import { logger } from '../config/logger';

const client = new CloudTasksClient();

export async function scheduleEventReminder(eventId: string, userId: string, sendAt: Date) {
  if (!env.projectId || env.localMode) {
    logger.info('Skipping Cloud Tasks scheduling in local mode', { eventId, userId });
    return;
  }

  // The deployed backend URL (could be retrieved from env, hardcoding for this hackathon demo)
  const baseUrl = process.env.API_URL || 'https://radius-jjmqcsyhvq-el.a.run.app';
  const queuePath = client.queuePath(env.projectId, 'asia-south1', 'event-reminders');
  const url = `${baseUrl}/api/events/webhook/remind`;

  const payload = JSON.stringify({ eventId, userId });

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(payload).toString('base64'),
    },
    scheduleTime: {
      seconds: Math.floor(sendAt.getTime() / 1000),
    },
  };

  try {
    const [response] = await client.createTask({ parent: queuePath, task });
    logger.info('Created task for event reminder', { taskId: response.name, eventId, userId, sendAt });
  } catch (error) {
    logger.error('Failed to create Cloud Task', { reason: String(error) });
  }
}
