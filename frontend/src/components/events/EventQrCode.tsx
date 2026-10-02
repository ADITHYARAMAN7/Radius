import { useState } from 'react';
import { Download, Printer, QrCode, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Primitives';
import type { EventRecord } from '@/lib/types';

interface EventQrCodeProps {
  event: EventRecord;
}

export function EventQrCode({ event }: EventQrCodeProps) {
  const [open, setOpen] = useState(false);
  const eventUrl = `${window.location.origin}/events/${event.id}`;
  // Standard public QR code generator API
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(eventUrl)}&margin=10`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold"
      >
        <QrCode className="h-3.5 w-3.5 text-brand" />
        QR Flyer
      </Button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setOpen(false)}
          />

          <Card className="relative z-10 max-w-sm w-full p-6 text-center shadow-xl animate-scale-in">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-ink-muted hover:text-ink transition"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand mb-3">
              <QrCode className="h-6 w-6" />
            </div>

            <h3 className="text-lg font-bold text-ink">{event.title}</h3>
            <p className="text-xs text-ink-soft mt-1">
              {event.neighborhood} · {event.date}
            </p>

            <div className="mt-4 p-3 bg-white rounded-2xl border border-border inline-block shadow-sm">
              <img
                src={qrApiUrl}
                alt={`QR code for ${event.title}`}
                className="w-48 h-48 mx-auto"
                loading="lazy"
              />
            </div>

            <p className="text-xs text-ink-muted mt-3">
              Scan with any mobile camera to open this event directly on Nearby-Events.
            </p>

            <div className="mt-5 flex gap-2 justify-center">
              <Button variant="secondary" size="sm" onClick={handlePrint} className="gap-1.5">
                <Printer className="h-4 w-4" />
                Print Flyer
              </Button>
              <a
                href={qrApiUrl}
                download={`${event.title}-qrcode.png`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand text-brand-on px-3 py-2 text-xs font-semibold shadow hover:bg-brand-hover transition"
              >
                <Download className="h-4 w-4" />
                Download QR
              </a>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
