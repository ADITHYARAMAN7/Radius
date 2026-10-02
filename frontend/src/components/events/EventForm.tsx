import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  ImagePlus,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Badge, Card, Panel } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import {
  CATEGORIES,
  type AiSuggestion,
  type Category,
  type EventFormPayload,
  type EventRecord,
  type ExtractField,
  type ExtractionResult,
} from '@/lib/types';
import { cn, todayAsInputValue } from '@/lib/utils';
import { SnapPoster } from './SnapPoster';

interface FormState {
  title: string;
  description: string;
  summary: string;
  category: Category | '';
  tagsText: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  address: string;
  neighborhood: string;
  city: string;
  latitude: string;
  longitude: string;
  imageUrl: string | null;
  imagePath: string | null;
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  summary: '',
  category: '',
  tagsText: '',
  date: '',
  startTime: '18:00',
  endTime: '20:00',
  location: '',
  address: '',
  neighborhood: '',
  city: 'Coimbatore',
  latitude: '',
  longitude: '',
  imageUrl: null,
  imagePath: null,
};

function fromEvent(event: EventRecord): FormState {
  return {
    title: event.title,
    description: event.description,
    summary: event.summary,
    category: event.category,
    tagsText: event.tags.join(', '),
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    address: event.address,
    neighborhood: event.neighborhood,
    city: event.city,
    latitude: event.latitude === null ? '' : String(event.latitude),
    longitude: event.longitude === null ? '' : String(event.longitude),
    imageUrl: event.imageUrl,
    imagePath: event.imagePath,
  };
}

type Errors = Partial<Record<keyof FormState | 'form', string>>;

/**
 * Client-side validation. The server validates the same rules independently — this copy
 * exists so the user gets the error next to the field instead of after a round trip.
 */
function validate(form: FormState, isEdit: boolean): Errors {
  const errors: Errors = {};

  if (form.title.trim().length < 5) errors.title = 'Give your event a title of at least 5 characters.';
  if (form.description.trim().length < 20)
    errors.description = 'Add a description of at least 20 characters so people know what to expect.';
  if (!form.category) errors.category = 'Pick the category that fits best.';
  if (!form.date) errors.date = 'Pick the date this happens.';
  if (!form.startTime) errors.startTime = 'Add a start time.';
  if (!form.endTime) errors.endTime = 'Add an end time.';

  if (form.startTime && form.endTime && form.endTime <= form.startTime) {
    errors.endTime = 'End time must be after the start time.';
  }

  if (form.location.trim().length < 3) errors.location = 'Name the venue or meeting point.';
  if (form.address.trim().length < 5) errors.address = 'Add a street address so people can find it.';
  if (form.neighborhood.trim().length < 2) errors.neighborhood = 'Add the neighbourhood.';
  if (form.city.trim().length < 2) errors.city = 'Add the city.';

  // Only new events are blocked from the past; an existing event may legitimately be
  // edited after it has run.
  if (!isEdit && form.date && form.startTime) {
    const [y, m, d] = form.date.split('-').map(Number);
    const [hh, mm] = form.startTime.split(':').map(Number);

    if (y && m && d && hh !== undefined && mm !== undefined) {
      const starts = new Date(y, m - 1, d, hh, mm);
      if (starts.getTime() < Date.now() - 5 * 60 * 1000) {
        errors.date = 'That start time has already passed. Pick a date and time in the future.';
      }
    }
  }

  const lat = form.latitude.trim();
  const lng = form.longitude.trim();

  if (lat && (Number.isNaN(Number(lat)) || Math.abs(Number(lat)) > 90)) {
    errors.latitude = 'Latitude must be between -90 and 90.';
  }
  if (lng && (Number.isNaN(Number(lng)) || Math.abs(Number(lng)) > 180)) {
    errors.longitude = 'Longitude must be between -180 and 180.';
  }
  // A single coordinate cannot place a pin, so require the pair or neither.
  if (Boolean(lat) !== Boolean(lng)) {
    const message = 'Latitude and longitude go together — add both, or leave both empty.';
    if (!lat) errors.latitude = message;
    else errors.longitude = message;
  }

  return errors;
}

/* -------------------------------------------------------- Snap-a-Poster */

const SNAP_FIELD_LABELS: Record<ExtractField, string> = {
  title: 'Title',
  description: 'Description',
  category: 'Category',
  date: 'Date',
  startTime: 'Start time',
  endTime: 'End time',
  location: 'Venue',
  address: 'Street address',
  neighborhood: 'Neighbourhood',
  city: 'City',
};

/** How a field got its value: read from the poster, or suggested by us. */
type AiMark = 'ai' | 'suggested';

const AI_HINTS: Record<AiMark, string> = {
  ai: 'Filled by AI, please check.',
  suggested: 'Suggested end time (start + 2 hours), please check.',
};

/** Highlights a field the AI filled until the user edits it. */
const AI_RING = 'ring-2 ring-accent/60';

/**
 * A field still holding the value the form opened with (empty, today, 18:00, Coimbatore…)
 * has not been typed by the user, so the AI may fill it without asking.
 */
function isUntouched(key: keyof FormState, form: FormState): boolean {
  const value = form[key];
  if (value === '' || value === null) return true;
  const initial = key === 'date' ? todayAsInputValue() : EMPTY_FORM[key];
  return value === initial;
}

/** "19:30" + 2h → "21:30"; null when that would cross midnight. */
function addTwoHours(time: string): string | null {
  const [hours, minutes] = time.split(':').map(Number);
  if (hours === undefined || minutes === undefined) return null;
  const total = hours * 60 + minutes + 120;
  if (total > 23 * 60 + 59) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/* ------------------------------------------------------------- AI panel */

function AiPanel({
  form,
  onApply,
  available,
}: {
  form: FormState;
  onApply: (suggestion: AiSuggestion, fields: Set<keyof AiSuggestion>) => void;
  available: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [chosen, setChosen] = useState<Set<keyof AiSuggestion>>(new Set());

  if (!available) return null;

  const canAsk = form.title.trim().length > 2 || form.description.trim().length > 5;

  const ask = async () => {
    if (!canAsk) {
      toast.info(
        'Write a rough idea first',
        'Even "football match this sunday near college" is enough to work with.',
      );
      return;
    }

    setBusy(true);
    setSuggestion(null);

    try {
      const result = await api.aiAssist({
        title: form.title,
        description: form.description,
        category: form.category || undefined,
        city: form.city,
        neighborhood: form.neighborhood,
      });

      setSuggestion(result.suggestion);
      // Everything pre-selected, because accepting the whole rewrite is the common case.
      setChosen(new Set(['title', 'description', 'summary', 'category', 'tags']));
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'The AI assistant is unavailable right now.';
      toast.error('Could not improve that', message);
    } finally {
      setBusy(false);
    }
  };

  const toggleField = (field: keyof AiSuggestion) => {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const apply = () => {
    if (!suggestion || chosen.size === 0) return;
    onApply(suggestion, chosen);
    setSuggestion(null);
    toast.success('Applied', 'You can still edit anything the assistant wrote.');
  };

  const FIELD_LABELS: Array<{ key: keyof AiSuggestion; label: string; preview: (s: AiSuggestion) => string }> = [
    { key: 'title', label: 'Title', preview: (s) => s.title },
    { key: 'summary', label: 'One-line summary', preview: (s) => s.summary },
    { key: 'description', label: 'Description', preview: (s) => s.description },
    { key: 'category', label: 'Category', preview: (s) => s.category },
    { key: 'tags', label: 'Tags', preview: (s) => s.tags.map((t) => `#${t}`).join('  ') },
  ];

  return (
    <Panel className="border-0 bg-gradient-to-br from-brand-soft to-accent-soft/50 ring-brand/15">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <Sparkles className="h-5 w-5 text-brand" aria-hidden="true" />
            AI event assistant
          </h2>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-soft">
            Jot down a rough idea and Gemini will suggest a clearer title, a structured description,
            a category and tags. Entirely optional — you can publish without it.
          </p>
        </div>

        <Button variant="primary" onClick={ask} loading={busy} loadingLabel="Thinking">
          <Wand2 className="h-4 w-4" aria-hidden="true" />
          Improve with AI
        </Button>
      </div>

      {busy && (
        <div className="mt-5 flex items-center gap-3 rounded-xl bg-surface/70 p-4" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden="true" />
          <p className="text-sm text-ink-soft">
            Reading your draft and writing a cleaner version…
          </p>
        </div>
      )}

      {suggestion && (
        <div className="mt-5 animate-fade-up space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Pick what to keep
          </p>

          {FIELD_LABELS.map(({ key, label, preview }) => {
            const selected = chosen.has(key);
            const text = preview(suggestion);
            if (!text) return null;

            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleField(key)}
                aria-pressed={selected}
                className={cn(
                  'flex w-full gap-3 rounded-xl p-3 text-left transition-all ring-1',
                  selected
                    ? 'bg-surface ring-brand/40 shadow-xs'
                    : 'bg-surface/50 ring-border hover:bg-surface/80',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 transition-colors',
                    selected ? 'bg-brand text-white ring-brand' : 'bg-surface ring-border-strong',
                  )}
                  aria-hidden="true"
                >
                  {selected && <Check className="h-3.5 w-3.5" />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase tracking-wide text-ink-muted">
                    {label}
                  </span>
                  <span className="clamp-3 mt-1 block whitespace-pre-line text-sm leading-relaxed text-ink">
                    {text}
                  </span>
                </span>
              </button>
            );
          })}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="primary" onClick={apply} disabled={chosen.size === 0}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Apply {chosen.size} {chosen.size === 1 ? 'change' : 'changes'}
            </Button>

            <Button variant="ghost" onClick={() => setSuggestion(null)}>
              <X className="h-4 w-4" aria-hidden="true" />
              Discard
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------- image field */

function ImageField({
  imageUrl,
  onChange,
  disabled,
}: {
  imageUrl: string | null;
  onChange: (next: { imageUrl: string | null; imagePath: string | null }) => void;
  disabled: boolean;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [dragging, setDragging] = useState(false);

  // Asked up front so the control can say uploads are off rather than failing on click.
  useEffect(() => {
    api
      .uploadStatus()
      .then((status) => setAvailable(status.available))
      .catch(() => setAvailable(false));
  }, []);

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Not an image', 'Choose a JPG, PNG, WebP or GIF file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image too large', 'Please pick a file under 5 MB.');
      return;
    }

    setUploading(true);
    try {
      const result = await api.uploadImage(file);
      onChange(result);
      toast.success('Image uploaded', 'It will appear on your event card.');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'The upload did not go through.';
      toast.error('Upload failed', message);
    } finally {
      setUploading(false);
      // Reset so picking the same file again still fires a change event.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-semibold text-ink">Event image</span>

      {imageUrl ? (
        <div className="relative overflow-hidden rounded-xl ring-1 ring-border">
          <img src={imageUrl} alt="Your event image" className="aspect-[16/9] w-full object-cover" />

          <div className="absolute right-2 top-2 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="bg-surface/95 backdrop-blur"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || uploading}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Replace
            </Button>

            <Button
              variant="danger-soft"
              size="sm"
              className="bg-surface/95 backdrop-blur"
              onClick={() => onChange({ imageUrl: null, imagePath: null })}
              disabled={disabled || uploading}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Remove image</span>
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading || available === false}
          onDragOver={(dragEvent) => {
            dragEvent.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(dropEvent) => {
            dropEvent.preventDefault();
            setDragging(false);
            const file = dropEvent.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
          className={cn(
            'flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragging ? 'border-brand bg-brand-soft' : 'border-border bg-surface-sunken hover:border-border-strong',
            (disabled || available === false) && 'cursor-not-allowed opacity-60',
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden="true" />
              <span className="text-sm font-semibold text-ink">Uploading to Cloud Storage…</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-ink-muted" aria-hidden="true" />
              <span className="text-sm font-semibold text-ink">
                {available === false ? 'Image uploads are not configured' : 'Add a photo'}
              </span>
              <span className="text-xs text-ink-muted">
                {available === false
                  ? 'Set GCS_BUCKET on the API to switch this on. Events work fine without a photo.'
                  : 'Drag one here or click to choose · JPG, PNG, WebP or GIF up to 5 MB'}
              </span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={(changeEvent) => {
          const file = changeEvent.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}

/* --------------------------------------------------------------- the form */

export function EventForm({
  mode,
  initialEvent,
}: {
  mode: 'create' | 'edit';
  initialEvent?: EventRecord;
}) {
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState<FormState>(() =>
    initialEvent ? fromEvent(initialEvent) : { ...EMPTY_FORM, date: todayAsInputValue() },
  );
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  /**
   * A toast disappears after five seconds. Someone who looks away, or who uses a screen
   * reader and navigates back up the form, needs the failure still on the page — so the
   * summary stays until it is resolved.
   */
  const [submitError, setSubmitError] = useState<string | null>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  // Snap-a-Poster state: which fields the AI filled, what it warned about, and a result
  // waiting for the user to decide whether it may overwrite what they already typed.
  const [aiChecked, setAiChecked] = useState(false);
  const [aiMarks, setAiMarks] = useState<Partial<Record<keyof FormState, AiMark>>>({});
  const [snapWarnings, setSnapWarnings] = useState<string[]>([]);
  const [pendingSnap, setPendingSnap] = useState<{ result: ExtractionResult; conflicts: ExtractField[] } | null>(
    null,
  );

  const isEdit = mode === 'edit';

  useEffect(() => {
    api
      .aiStatus()
      .then((status) => setAiAvailable(status.available))
      .catch(() => setAiAvailable(false))
      .finally(() => setAiChecked(true));
  }, []);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));

    // Once the user edits an AI-filled field it is theirs, so the "please check" mark goes.
    setAiMarks((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });

    // Clear the error as soon as the user starts fixing the field, and drop the summary
    // with it — leaving a stale "3 fields need attention" banner up while they work
    // would be worse than showing nothing.
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
    setSubmitError(null);
  }, []);

  const applyAi = useCallback((suggestion: AiSuggestion, fields: Set<keyof AiSuggestion>) => {
    setForm((current) => ({
      ...current,
      ...(fields.has('title') ? { title: suggestion.title } : {}),
      ...(fields.has('description') ? { description: suggestion.description } : {}),
      ...(fields.has('summary') ? { summary: suggestion.summary } : {}),
      ...(fields.has('category') ? { category: suggestion.category } : {}),
      ...(fields.has('tags') ? { tagsText: suggestion.tags.join(', ') } : {}),
    }));
    setErrors({});
  }, []);

  /** A field the user typed into, as opposed to empty, a starting default, or AI-filled. */
  const isUserValue = (key: keyof FormState) => !isUntouched(key, form) && !aiMarks[key];

  const applySnap = (result: ExtractionResult, overwrite: boolean) => {
    const next: FormState = { ...form };
    const marks: Partial<Record<keyof FormState, AiMark>> = {};
    const extraWarnings: string[] = [];

    for (const key of result.filled) {
      const value = result.fields[key];
      if (value === null) continue;
      if (overwrite || !isUserValue(key)) {
        next[key] = value as never;
        marks[key] = 'ai';
      }
    }

    // The board needs an end time. When the source has none, suggest start + 2h, marked
    // so the user notices — unless that would cross midnight, which the form cannot hold.
    const startApplied = marks.startTime === 'ai';
    const crossesMidnight = result.warnings.some((warning) => warning.includes('midnight'));
    if (startApplied && result.fields.endTime === null && (overwrite || !isUserValue('endTime'))) {
      const suggestion = crossesMidnight ? null : addTwoHours(next.startTime);
      if (suggestion) {
        next.endTime = suggestion;
        marks.endTime = 'suggested';
      } else {
        next.endTime = '';
        if (!crossesMidnight) {
          extraWarnings.push(
            `It starts at ${next.startTime}, so two hours later would be past midnight. Please set an end time before midnight.`,
          );
        }
      }
    }

    setForm(next);
    setAiMarks((current) => ({ ...current, ...marks }));
    setSnapWarnings([...result.warnings, ...extraWarnings]);
    setPendingSnap(null);
    setErrors({});
    setSubmitError(null);
  };

  const handleExtracted = (result: ExtractionResult) => {
    const conflicts = result.filled.filter((key) => {
      const value = result.fields[key];
      return value !== null && isUserValue(key) && form[key] !== value;
    });

    // Never silently wipe what the user typed: ask first.
    if (conflicts.length > 0) setPendingSnap({ result, conflicts });
    else applySnap(result, false);
  };

  /** Hint and highlight for a field the AI filled; the field's own hint otherwise. */
  const aiProps = (key: keyof FormState, hint?: string) => {
    const mark = aiMarks[key];
    return mark ? { hint: AI_HINTS[mark], className: AI_RING } : { hint };
  };

  const onSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();

    const found = validate(form, isEdit);
    if (Object.keys(found).length > 0) {
      setErrors(found);

      const count = Object.keys(found).length;
      setSubmitError(
        `${count} ${count === 1 ? 'field needs' : 'fields need'} attention before this can be published.`,
      );

      // Move focus to the first problem so keyboard and screen-reader users are not left
      // guessing which field failed.
      const firstKey = Object.keys(found)[0];
      document.getElementById(`field-${firstKey}`)?.focus();
      toast.error('Check the form', 'Some details still need attention.');
      return;
    }

    setSubmitting(true);
    setErrors({});
    setSubmitError(null);

    const payload: EventFormPayload = {
      title: form.title.trim(),
      description: form.description.trim(),
      summary: form.summary.trim(),
      category: form.category as Category,
      tags: form.tagsText
        .split(',')
        .map((tag) => tag.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean)
        .slice(0, 10),
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      // Lets the server store the instant the organiser actually meant.
      tzOffsetMinutes: new Date().getTimezoneOffset(),
      location: form.location.trim(),
      address: form.address.trim(),
      latitude: form.latitude.trim() ? Number(form.latitude) : null,
      longitude: form.longitude.trim() ? Number(form.longitude) : null,
      neighborhood: form.neighborhood.trim(),
      city: form.city.trim(),
      imageUrl: form.imageUrl,
      imagePath: form.imagePath,
    };

    try {
      const result = isEdit && initialEvent
        ? await api.updateEvent(initialEvent.id, payload)
        : await api.createEvent(payload);

      toast.success(
        isEdit ? 'Event updated' : 'Event published',
        isEdit ? 'Your changes are live.' : 'It is on the board now — share the link with your neighbours.',
      );

      navigate(`/events/${result.event.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        // Field errors from the server land on the same inputs as local ones.
        if (Object.keys(error.fields).length > 0) {
          setErrors(error.fields as Errors);
          const firstKey = Object.keys(error.fields)[0];
          document.getElementById(`field-${firstKey}`)?.focus();
        } else {
          // Nothing to anchor to a field, so send focus to the summary instead.
          errorSummaryRef.current?.focus();
        }
        setSubmitError(error.message);
        toast.error(isEdit ? 'Could not save changes' : 'Could not publish', error.message);
      } else {
        setSubmitError(
          'Something went wrong on our side and your event was not saved. Your details are still here — please try again.',
        );
        errorSummaryRef.current?.focus();
        toast.error('Something went wrong', 'Please try again in a moment.');
      }
      setSubmitting(false);
    }
  };

  const titleCount = form.title.length;
  const descriptionCount = form.description.length;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {submitError && (
        <div
          ref={errorSummaryRef}
          role="alert"
          tabIndex={-1}
          className="flex animate-fade-up gap-3 rounded-xl bg-danger-soft p-4 ring-1 ring-danger/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-danger-ink">
              {isEdit ? 'Your changes were not saved' : 'Your event was not published'}
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-danger-ink/90">{submitError}</p>

            {Object.keys(errors).length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-danger-ink/90">
                {Object.entries(errors)
                  .filter(([, message]) => Boolean(message))
                  .map(([field, message]) => (
                    <li key={field}>
                      {/* Jumps straight to the offending input. */}
                      <a
                        href={`#field-${field}`}
                        onClick={(clickEvent) => {
                          clickEvent.preventDefault();
                          document.getElementById(`field-${field}`)?.focus();
                        }}
                        className="underline underline-offset-2 hover:no-underline"
                      >
                        {message}
                      </a>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSubmitError(null)}
            className="-m-1 h-7 w-7 shrink-0 rounded-lg text-danger-ink/70 transition-colors hover:bg-danger/10 hover:text-danger-ink"
            aria-label="Dismiss this error"
          >
            <X className="mx-auto h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {!isEdit && aiChecked && (
        <SnapPoster
          available={aiAvailable}
          onExtracted={handleExtracted}
          onUsePoster={(image) =>
            setForm((current) => ({ ...current, imageUrl: image.imageUrl, imagePath: image.imagePath }))
          }
        />
      )}

      {pendingSnap && (
        <Panel className="animate-fade-up space-y-3 bg-warning-soft/60 ring-warning/25" role="alertdialog" aria-label="Replace your entries?">
          <p className="text-sm font-bold text-ink">The poster has values for fields you already filled in</p>
          <p className="text-sm text-ink-soft">
            {pendingSnap.conflicts.map((key) => SNAP_FIELD_LABELS[key]).join(', ')}. Replace them with what the AI read, or
            keep yours and only fill the empty fields?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => applySnap(pendingSnap.result, true)}>
              Replace with AI values
            </Button>
            <Button variant="secondary" onClick={() => applySnap(pendingSnap.result, false)}>
              Keep mine, fill empty fields
            </Button>
            <Button variant="ghost" onClick={() => setPendingSnap(null)}>
              Cancel
            </Button>
          </div>
        </Panel>
      )}

      {snapWarnings.length > 0 && (
        <div role="status" className="flex animate-fade-up gap-3 rounded-xl bg-warning-soft p-4 ring-1 ring-warning/25">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning-ink" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-warning-ink">Please check before publishing</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-warning-ink/90">
              {snapWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => setSnapWarnings([])}
            className="-m-1 h-7 w-7 shrink-0 rounded-lg text-warning-ink/70 transition-colors hover:bg-warning/10 hover:text-warning-ink"
            aria-label="Dismiss these warnings"
          >
            <X className="mx-auto h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <AiPanel form={form} onApply={applyAi} available={aiAvailable} />

      {/* ------------------------------------------------------ the basics */}
      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="font-display text-base font-bold text-ink">The basics</h2>

        <Input
          id="field-title"
          label="Event title"
          required
          value={form.title}
          onChange={(changeEvent) => set('title', changeEvent.target.value)}
          error={errors.title}
          {...aiProps('title')}
          placeholder="Sunday morning football at VOC Grounds"
          maxLength={120}
          trailing={
            <span
              className={cn(
                'text-xs tabular-nums',
                titleCount > 110 ? 'font-semibold text-warning-ink' : 'text-ink-muted',
              )}
            >
              {titleCount}/120
            </span>
          }
        />

        <Textarea
          id="field-description"
          label="Description"
          required
          rows={7}
          value={form.description}
          onChange={(changeEvent) => set('description', changeEvent.target.value)}
          error={errors.description}
          {...aiProps(
            'description',
            'What happens, who it suits, and anything people should bring. Blank lines start a new paragraph.',
          )}
          placeholder="Our weekly seven-a-side game is open to anyone who turns up…"
          maxLength={5000}
          trailing={
            <span className="text-xs tabular-nums text-ink-muted">{descriptionCount}/5000</span>
          }
        />

        <Input
          id="field-summary"
          label="One-line summary"
          value={form.summary}
          onChange={(changeEvent) => set('summary', changeEvent.target.value)}
          error={errors.summary}
          hint="Shown on cards and previews. Left empty, we take the opening of your description."
          placeholder="Open seven-a-side football, teams picked on the spot, all abilities welcome."
          maxLength={200}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Select
            id="field-category"
            label="Category"
            required
            value={form.category}
            onChange={(changeEvent) => set('category', changeEvent.target.value as Category)}
            error={errors.category}
            {...aiProps('category')}
          >
            <option value="">Choose a category…</option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>

          <Input
            id="field-tagsText"
            label="Tags"
            value={form.tagsText}
            onChange={(changeEvent) => set('tagsText', changeEvent.target.value)}
            error={errors.tagsText}
            hint="Comma separated, up to 10."
            placeholder="football, weekly, beginners welcome"
          />
        </div>

        {form.tagsText.trim() && (
          <div className="flex flex-wrap gap-1.5">
            {form.tagsText
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
              .slice(0, 10)
              .map((tag, index) => (
                <Badge key={`${tag}-${index}`} tone="brand" size="sm">
                  #{tag.toLowerCase().replace(/^#/, '')}
                </Badge>
              ))}
          </div>
        )}
      </Card>

      {/* --------------------------------------------------- when and where */}
      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="font-display text-base font-bold text-ink">When</h2>

        <div className="grid gap-5 sm:grid-cols-3">
          <Input
            id="field-date"
            label="Date"
            type="date"
            required
            value={form.date}
            min={isEdit ? undefined : todayAsInputValue()}
            onChange={(changeEvent) => set('date', changeEvent.target.value)}
            error={errors.date}
            {...aiProps('date')}
          />

          <Input
            id="field-startTime"
            label="Start time"
            type="time"
            required
            value={form.startTime}
            onChange={(changeEvent) => set('startTime', changeEvent.target.value)}
            error={errors.startTime}
            {...aiProps('startTime')}
          />

          <Input
            id="field-endTime"
            label="End time"
            type="time"
            required
            value={form.endTime}
            onChange={(changeEvent) => set('endTime', changeEvent.target.value)}
            error={errors.endTime}
            {...aiProps('endTime')}
          />
        </div>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="font-display text-base font-bold text-ink">Where</h2>

        <Input
          id="field-location"
          label="Venue or meeting point"
          required
          value={form.location}
          onChange={(changeEvent) => set('location', changeEvent.target.value)}
          error={errors.location}
          {...aiProps('location')}
          placeholder="VOC Park Grounds"
        />

        <Input
          id="field-address"
          label="Street address"
          required
          value={form.address}
          onChange={(changeEvent) => set('address', changeEvent.target.value)}
          error={errors.address}
          {...aiProps('address')}
          placeholder="VOC Park, Dr Nanjappa Road, Gandhipuram, Coimbatore 641018"
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            id="field-neighborhood"
            label="Neighbourhood"
            required
            value={form.neighborhood}
            onChange={(changeEvent) => set('neighborhood', changeEvent.target.value)}
            error={errors.neighborhood}
            {...aiProps('neighborhood', 'This is what people filter and search by.')}
            placeholder="Gandhipuram"
          />

          <Input
            id="field-city"
            label="City"
            required
            value={form.city}
            onChange={(changeEvent) => set('city', changeEvent.target.value)}
            error={errors.city}
            {...aiProps('city')}
            placeholder="Coimbatore"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            id="field-latitude"
            label="Latitude"
            value={form.latitude}
            onChange={(changeEvent) => set('latitude', changeEvent.target.value)}
            error={errors.latitude}
            hint="Optional — adding both coordinates puts your event on the map."
            placeholder="11.0168"
            inputMode="decimal"
          />

          <Input
            id="field-longitude"
            label="Longitude"
            value={form.longitude}
            onChange={(changeEvent) => set('longitude', changeEvent.target.value)}
            error={errors.longitude}
            hint="Right-click a spot in Google Maps to copy its coordinates."
            placeholder="76.9558"
            inputMode="decimal"
          />
        </div>
      </Card>

      {/* ------------------------------------------------------------ image */}
      <Card className="p-5 sm:p-6">
        <ImageField
          imageUrl={form.imageUrl}
          disabled={submitting}
          onChange={(next) =>
            setForm((current) => ({ ...current, imageUrl: next.imageUrl, imagePath: next.imagePath }))
          }
        />
      </Card>

      {/*
        Sticky so the primary action stays reachable in a long form. `scroll-mt` plus the
        trailing spacer below stop the bar from permanently covering the last card.
      */}
      <div className="sticky bottom-20 z-20 flex flex-col-reverse gap-2 rounded-panel bg-surface/95 p-4 shadow-lg ring-1 ring-border backdrop-blur sm:flex-row sm:justify-end md:bottom-4">
        <Button type="button" variant="secondary" onClick={() => navigate(-1)} disabled={submitting}>
          Cancel
        </Button>

        <Button
          type="submit"
          variant="primary"
          loading={submitting}
          loadingLabel={isEdit ? 'Saving' : 'Publishing'}
        >
          {isEdit ? 'Save changes' : 'Publish event'}
        </Button>
      </div>

      {/* Lets the final card scroll clear of the sticky bar instead of sitting under it. */}
      <div aria-hidden="true" className="h-2" />
    </form>
  );
}
