import { BigQuery } from '@google-cloud/bigquery';
import { env } from '../config/env';
import { logger } from '../config/logger';

const bigquery = new BigQuery({ projectId: env.projectId });
const datasetId = 'events_analytics';
const tableId = 'rsvps';

export async function logRsvpToBigQuery(eventId: string, userId: string) {
  if (!env.projectId) return; // Ignore if no GCP project

  try {
    const row = {
      event_id: eventId,
      user_id: userId,
      timestamp: new Date().toISOString(),
    };
    
    await bigquery.dataset(datasetId).table(tableId).insert([row]);
    logger.info('RSVP logged to BigQuery', { eventId, userId });
  } catch (error) {
    logger.error('Failed to log RSVP to BigQuery', { reason: String(error) });
  }
}

export async function getTrendingEvents(hours: number = 24, limit: number = 5) {
  if (!env.projectId) return [];

  try {
    const query = `
      SELECT event_id, COUNT(*) as rsvp_count
      FROM \`${env.projectId}.${datasetId}.${tableId}\`
      WHERE timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @hours HOUR)
      GROUP BY event_id
      ORDER BY rsvp_count DESC
      LIMIT @limit
    `;

    const options = {
      query: query,
      params: { hours, limit },
    };

    const [job] = await bigquery.createQueryJob(options);
    const [rows] = await job.getQueryResults();

    return rows as Array<{ event_id: string; rsvp_count: number }>;
  } catch (error) {
    logger.error('Failed to query trending events from BigQuery', { reason: String(error) });
    return [];
  }
}
