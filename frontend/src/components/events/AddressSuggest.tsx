import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { PlaceSuggestion } from '@/lib/types';
import type { PickedPlace } from './PlaceAutocomplete';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

/**
 * Address field with suggestions as you type, for when no Google Maps key is configured.
 * Suggestions come from OpenStreetMap (Photon) through our API; picking one fills the
 * address, venue, neighbourhood, city and map pin — the same contract as PlaceAutocomplete,
 * so the form treats both identically. Typing without picking still works as plain text.
 */
export function AddressSuggest({
  id,
  label,
  required,
  value,
  error,
  hint,
  className,
  placeholder,
  onChange,
  onPick,
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  error?: string;
  hint?: string;
  className?: string;
  placeholder?: string;
  onChange: (text: string) => void;
  onPick: (place: PickedPlace) => void;
}) {
  const listId = useId();
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  /** Set when the value changed because of a pick, so it does not trigger a new search. */
  const skipNext = useRef(false);
  /** Only search after the user has typed in this field, not for a pre-filled edit form. */
  const typed = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const query = value.trim();
    if (!typed.current || query.length < MIN_CHARS) {
      setItems([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      api
        .placeSuggestions(query, controller.signal)
        .then(({ suggestions }) => {
          setItems(suggestions);
          setActive(-1);
          setOpen(suggestions.length > 0);
        })
        .catch(() => {
          // Suggestions are a convenience; typing the address still works.
          setItems([]);
          setOpen(false);
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const pick = async (suggestion: PlaceSuggestion) => {
    setOpen(false);
    setItems([]);
    skipNext.current = true;
    onChange(suggestion.address);
    setResolving(true);
    try {
      const { place } = await api.resolvePlace(suggestion);
      onPick({ address: suggestion.address, name: suggestion.name, latitude: suggestion.latitude, longitude: suggestion.longitude, ...place });
    } catch {
      onPick({ address: suggestion.address, name: suggestion.name, latitude: suggestion.latitude, longitude: suggestion.longitude, neighborhood: '', city: '' });
    } finally {
      setResolving(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index <= 0 ? items.length - 1 : index - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      // Pick the highlighted suggestion instead of submitting the form.
      event.preventDefault();
      void pick(items[active]!);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Input
        id={id}
        label={label}
        required={required}
        value={value}
        error={error}
        hint={resolving ? 'Finding the neighbourhood and map pin…' : hint}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(changeEvent) => {
          typed.current = true;
          onChange(changeEvent.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onFocus={() => items.length > 0 && setOpen(true)}
        trailing={loading || resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" aria-label="Searching" /> : undefined}
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Address suggestions"
          className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl bg-surface shadow-lg ring-1 ring-border"
        >
          {items.map((item, index) => (
            <li
              key={`${item.latitude},${item.longitude},${item.name}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // mousedown, not click: it fires before the input's blur closes the list.
              onMouseDown={(mouseEvent) => {
                mouseEvent.preventDefault();
                void pick(item);
              }}
              onMouseEnter={() => setActive(index)}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 px-3.5 py-2.5 text-sm',
                index === active ? 'bg-brand-soft' : 'hover:bg-surface-sunken',
              )}
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{item.name}</span>
                <span className="block truncate text-xs text-ink-muted">{item.address}</span>
              </span>
            </li>
          ))}
          <li role="presentation" className="border-t border-border px-3.5 py-1.5 text-[0.6875rem] text-ink-muted">
            Suggestions © OpenStreetMap contributors
          </li>
        </ul>
      )}
    </div>
  );
}
