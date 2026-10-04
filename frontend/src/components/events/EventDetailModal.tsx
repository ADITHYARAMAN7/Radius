import { useEffect, useState } from 'react';
import { X, CalendarDays, MapPin, Home, Users, Clock, Share2, CalendarPlus, Navigation, Check, Languages } from 'lucide-react';
import { CategoryBadge } from '@/components/events/CategoryBadge';
import { cn, formatEventDateLong, formatTimeRange, formatRsvpCount, googleCalendarLink } from '@/lib/utils';
import { eventShareUrl } from '@/components/events/ShareMenu';
import type { EventRecord, Category } from '@/lib/types';

const MODAL_COLORS: Record<Category, { bg: string; border: string; text: string; shadow: string; gradient: string }> = {
  Sports: { bg: 'bg-emerald-500/20 hover:bg-emerald-500/30', border: 'border-emerald-500/30', text: 'text-emerald-400', shadow: 'shadow-emerald-500/20', gradient: 'from-emerald-500' },
  Music: { bg: 'bg-violet-500/20 hover:bg-violet-500/30', border: 'border-violet-500/30', text: 'text-violet-400', shadow: 'shadow-violet-500/20', gradient: 'from-violet-500' },
  Food: { bg: 'bg-orange-500/20 hover:bg-orange-500/30', border: 'border-orange-500/30', text: 'text-orange-400', shadow: 'shadow-orange-500/20', gradient: 'from-orange-500' },
  'Yard Sale': { bg: 'bg-amber-500/20 hover:bg-amber-500/30', border: 'border-amber-500/30', text: 'text-amber-400', shadow: 'shadow-amber-500/20', gradient: 'from-amber-500' },
  Community: { bg: 'bg-sky-500/20 hover:bg-sky-500/30', border: 'border-sky-500/30', text: 'text-sky-400', shadow: 'shadow-sky-500/20', gradient: 'from-sky-500' },
  Education: { bg: 'bg-blue-500/20 hover:bg-blue-500/30', border: 'border-blue-500/30', text: 'text-blue-400', shadow: 'shadow-blue-500/20', gradient: 'from-blue-500' },
  Technology: { bg: 'bg-indigo-500/20 hover:bg-indigo-500/30', border: 'border-indigo-500/30', text: 'text-indigo-400', shadow: 'shadow-indigo-500/20', gradient: 'from-indigo-500' },
  Other: { bg: 'bg-slate-500/20 hover:bg-slate-500/30', border: 'border-slate-500/30', text: 'text-slate-400', shadow: 'shadow-slate-500/20', gradient: 'from-slate-500' },
};

export function EventDetailModal({
  event,
  onClose,
  onToggleRsvp,
  isPending
}: {
  event: EventRecord | null;
  onClose: () => void;
  onToggleRsvp?: (event: EventRecord) => void;
  isPending?: boolean;
}) {
  const [detecting, setDetecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tripResult, setTripResult] = useState<{ timeMins: number, leaveBy: string, distanceKm: string } | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [translatedData, setTranslatedData] = useState<{title: string, description: string} | null>(null);
  const [translating, setTranslating] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = eventShareUrl(event!.id);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const field = document.createElement('textarea');
      field.value = url;
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      document.body.removeChild(field);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!event) return null;

  const colors = MODAL_COLORS[event.category] || MODAL_COLORS['Other'];

  const handleDetect = () => {
    setDetecting(true);
    setDetectError(null);
    setTripResult(null);
    
    if (!navigator.geolocation) {
      setDetectError("Geolocation is not supported by your browser.");
      setDetecting(false);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDetecting(false);
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        // Simple distance formula (Haversine)
        const R = 6371; // km
        const dLat = (event.latitude - lat) * Math.PI / 180;
        const dLon = (event.longitude - lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat * Math.PI / 180) * Math.cos(event.latitude * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const dist = R * c;
        
        // Estimate 4 mins per km in city traffic + 5 min buffer
        const timeMins = Math.round(dist * 4) + 5; 
        
        // Calculate leave by time
        const eventStart = new Date(event.startsAt);
        const leaveDate = new Date(eventStart.getTime() - (timeMins * 60000));
        const leaveBy = leaveDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        setTripResult({
          timeMins,
          leaveBy,
          distanceKm: dist.toFixed(1)
        });
      },
      (error) => {
        setDetecting(false);
        setDetectError("Unable to retrieve your location. Please check your permissions.");
      }
    );
  };

  const handleTranslate = async () => {
    if (translatedData) {
      setTranslatedData(null); // Toggle off
      return;
    }
    setTranslating(true);
    try {
      const res = await fetch(`/api/events/${event.id}/translate?target=hi`);
      if (res.ok) {
        const data = await res.json();
        setTranslatedData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      />
      
      <div className={cn(
        "relative w-full max-w-lg bg-surface rounded-[2rem] shadow-2xl border border-border overflow-hidden animate-scale-in flex flex-col max-h-[90vh]",
        colors.shadow
      )}>
        {/* Colorful Gradient Header background */}
        <div className={cn(
          "absolute top-0 left-0 right-0 h-32 opacity-15 pointer-events-none bg-gradient-to-b to-transparent",
          colors.gradient
        )} />

        <div className="flex items-center justify-between p-6 pb-2 relative z-10">
          <h2 className="text-xl font-display font-bold text-ink">Event Details</h2>
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-2 -mr-2 z-50 rounded-full text-ink-muted hover:text-ink hover:bg-surface-sunken transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-2 relative z-10">
          <div className="flex items-center justify-between mb-4">
            <CategoryBadge category={event.category} size="sm" />
            <button
              onClick={handleTranslate}
              disabled={translating}
              className="flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover transition-colors"
            >
              <Languages className="w-3.5 h-3.5" />
              {translating ? 'Translating...' : translatedData ? 'Show Original' : 'Translate to Hindi'}
            </button>
          </div>
          
          <h1 className="text-2xl font-display font-bold text-ink mb-6">
            {translatedData ? translatedData.title : event.title}
          </h1>

          <div className="space-y-4 mb-8 text-sm">
            <div className="flex items-center gap-3 text-ink-soft">
              <CalendarDays className={cn("w-5 h-5", colors.text)} />
              <span>{formatEventDateLong(event.startsAt)} at {formatTimeRange(event.startTime, event.endTime)}</span>
            </div>
            
            <div className="flex items-center gap-3 text-ink-soft">
              <MapPin className={cn("w-5 h-5", colors.text)} />
              <span>{event.location}</span>
            </div>

            <div className="flex items-center gap-3 text-ink-soft">
              <Home className={cn("w-5 h-5", colors.text)} />
              <span>{event.neighborhood}</span>
            </div>

            <div className="flex items-center gap-3 text-ink-soft">
              <Users className={cn("w-5 h-5", colors.text)} />
              <span>{formatRsvpCount(event.rsvpCount)} going</span>
            </div>
          </div>

          <div className="text-ink-soft leading-relaxed mb-8 text-sm">
            {(translatedData ? translatedData.description : event.description).split('\n').filter(Boolean).map((p, i) => (
              <p key={i} className="mb-2">{p}</p>
            ))}
          </div>

          {/* Plan My Trip Section */}
          <div className="rounded-2xl bg-surface-raised border border-border p-5 mb-2">
            <div className="flex items-center gap-2 mb-2">
              <Clock className={cn("w-4 h-4", colors.text)} />
              <h3 className={cn("font-semibold", colors.text)}>Plan My Trip</h3>
            </div>
            
            {tripResult ? (
              <div className="bg-bg border border-border rounded-xl p-4 mt-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-ink-soft text-sm">Estimated travel time</span>
                  <span className="font-semibold text-ink">{tripResult.timeMins} mins</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-ink-soft text-sm">Distance</span>
                  <span className="font-semibold text-ink">{tripResult.distanceKm} km</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <span className="text-brand font-medium">Leave by</span>
                  <span className="font-bold text-brand">{tripResult.leaveBy}</span>
                </div>
              </div>
            ) : (
              <>
                <p className="text-ink-muted text-sm mb-4">
                  We'll detect your location and estimate how early you need to leave based on a typical city commute.
                </p>
                {detectError && <p className="text-danger text-xs mb-3">{detectError}</p>}
                <button 
                  onClick={handleDetect}
                  disabled={detecting}
                  className="w-full py-2.5 bg-surface-sunken hover:bg-bg text-ink rounded-xl font-medium text-sm transition-colors border border-border flex items-center justify-center gap-2"
                >
                  <Navigation className="w-4 h-4" />
                  {detecting ? 'Detecting...' : 'Detect My Location'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 pt-4 border-t border-border bg-surface-raised flex items-center justify-between gap-3 relative z-10">
          <button 
            type="button"
            className={cn(
              "flex-1 py-2.5 rounded-full font-semibold text-sm transition-all flex items-center justify-center gap-2 border",
              colors.bg,
              colors.border,
              colors.text
            )}
            onClick={(e) => { e.stopPropagation(); onToggleRsvp?.(event); }}
            disabled={isPending}
          >
            <Users className="w-4 h-4" />
            {isPending ? 'Updating...' : "I'm Going"}
          </button>
          
          <button 
            type="button"
            onClick={handleShare}
            className="px-4 py-2.5 rounded-full bg-surface-sunken hover:bg-surface text-ink font-medium text-sm transition-colors border border-border flex items-center gap-2"
          >
            {copied ? <Check className="w-4 h-4 text-brand" /> : <Share2 className="w-4 h-4" />}
            {copied ? 'Copied' : 'Share'}
          </button>

          <a 
            href={googleCalendarLink(event)}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2.5 rounded-full bg-surface-sunken hover:bg-surface text-ink font-medium text-sm transition-colors border border-border flex items-center gap-2"
          >
            <CalendarPlus className="w-4 h-4" />
            Add to Calendar
          </a>
        </div>
        <div className="bg-surface-raised text-center pb-4 text-xs text-ink-muted font-mono">
          ID: {event.id}
        </div>
      </div>
    </div>
  );
}
