import { useState } from 'react';
import { CalendarPlus, Check, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { EventRecord } from '@/lib/types';

interface CalendarExportProps {
  event: EventRecord;
}

export function CalendarExport({ event }: CalendarExportProps) {
  const [copied, setCopied] = useState(false);

  // Generate Google Calendar Link
  const getGoogleCalendarUrl = () => {
    const startDate = event.startsAt ? new Date(event.startsAt) : new Date(event.date);
    const endDate = event.endsAt ? new Date(event.endsAt) : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);

    const formatGCalDate = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      dates: `${formatGCalDate(startDate)}/${formatGCalDate(endDate)}`,
      details: `${event.description}\n\nNeighborhood: ${event.neighborhood}\nEvent Link: ${window.location.origin}/events/${event.id}`,
      location: `${event.location}, ${event.address || ''}, ${event.neighborhood}, ${event.city}`,
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  // Generate and download .ics file for Apple iCal / Outlook
  const downloadIcs = () => {
    const startDate = event.startsAt ? new Date(event.startsAt) : new Date(event.date);
    const endDate = event.endsAt ? new Date(event.endsAt) : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);

    const formatIcsDate = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Radius//Community Bulletin Board//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${event.id}@nearbyevents.local`,
      `DTSTAMP:${formatIcsDate(new Date())}`,
      `DTSTART:${formatIcsDate(startDate)}`,
      `DTEND:${formatIcsDate(endDate)}`,
      `SUMMARY:${event.title.replace(/,/g, '\\,')}`,
      `DESCRIPTION:${event.description.replace(/\n/g, '\\n').replace(/,/g, '\\,')}`,
      `LOCATION:${(event.location + ', ' + event.neighborhood).replace(/,/g, '\\,')}`,
      `URL:${window.location.origin}/events/${event.id}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${event.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={getGoogleCalendarUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-surface-sunken"
      >
        <CalendarPlus className="h-3.5 w-3.5 text-brand" />
        Add to Google Calendar
        <ExternalLink className="h-3 w-3 text-ink-muted" />
      </a>

      <Button
        variant="secondary"
        size="sm"
        onClick={downloadIcs}
        className="text-xs"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-success" />
            Downloaded .ics
          </>
        ) : (
          <>
            <Download className="h-3.5 w-3.5 text-ink-soft" />
            Export iCal / Outlook
          </>
        )}
      </Button>
    </div>
  );
}
