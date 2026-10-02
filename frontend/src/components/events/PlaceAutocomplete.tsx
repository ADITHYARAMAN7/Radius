import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FieldShell } from '@/components/ui/Field';
import { loadMapsLibrary } from '@/lib/maps';
import { cn } from '@/lib/utils';

/** What a picked suggestion fills in on the event form. */
export interface PickedPlace {
  address: string;
  /** Venue or place name, e.g. "VOC Park". */
  name: string;
  neighborhood: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
}

/** Results are biased (not restricted) to roughly the Coimbatore district. */
const COIMBATORE_BIAS: google.maps.CircleLiteral = { center: { lat: 11.0168, lng: 76.9558 }, radius: 30_000 };

/** Same rule as the backend's placeKey: letters and digits only. */
const placeKey = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Indian addresses from Google usually look like
 *   sublocality_level_1 = "Gandhipuram", locality = "Coimbatore"
 * while a village is its own locality ("Ettimadai") inside administrative_area_level_2
 * ("Coimbatore"). So: neighbourhood is the most local named area, and when that had to
 * come from the locality, the city steps up to the district.
 */
export function parseAddressComponents(components: google.maps.places.AddressComponent[]): {
  neighborhood: string;
  city: string;
} {
  const find = (type: string) => components.find((c) => c.types.includes(type))?.longText?.trim() || '';

  const locality = find('locality');
  // Google labels Coimbatore as level 2 (district) for some places and level 3 (taluk) for others.
  const district = find('administrative_area_level_2') || find('administrative_area_level_3');

  let neighborhood = find('sublocality_level_1') || find('sublocality') || find('neighborhood');
  let city = locality || district;

  if (!neighborhood && locality) {
    neighborhood = locality;
    city = district || locality;
  }

  // Inside Coimbatore district, Google often makes a village or suburb the "locality"
  // (Ettimadai, New Siddhapudur) with an even finer sublocality under it ("Amritanagar").
  // The board files those under the town as neighbourhood and Coimbatore as city — the
  // same rule the OpenStreetMap suggestions use.
  if (/coimbatore/i.test(district) && locality && placeKey(locality) !== placeKey(district)) {
    neighborhood = locality;
    city = 'Coimbatore';
  }

  // Picking a whole city gives no neighbourhood; leave it for the organiser to type.
  if (neighborhood && placeKey(neighborhood) === placeKey(city)) neighborhood = '';

  return { neighborhood, city };
}

/**
 * Google Places (New) autocomplete for the address field, using the official
 * PlaceAutocompleteElement widget. The widget handles session tokens itself, and the
 * only extra request is one fetchFields() per picked suggestion.
 */
export function PlaceAutocomplete({
  id,
  label,
  required,
  initialValue,
  error,
  hint,
  highlight,
  onPick,
  onType,
  onUnavailable,
}: {
  id: string;
  label: string;
  required?: boolean;
  initialValue: string;
  error?: string;
  hint?: string;
  /** Ring the field, e.g. after another tool filled it. */
  highlight?: boolean;
  onPick: (place: PickedPlace) => void;
  /** Free text typed without picking a suggestion. */
  onType: (text: string) => void;
  /** The script could not load — the form should fall back to manual inputs. */
  onUnavailable: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Latest callbacks without re-creating the widget (and its session) on every render.
  const callbacks = useRef({ onPick, onType, onUnavailable });
  callbacks.current = { onPick, onType, onUnavailable };
  const initialValueRef = useRef(initialValue);

  useEffect(() => {
    let cancelled = false;
    let element: google.maps.places.PlaceAutocompleteElement | null = null;

    loadMapsLibrary('places')
      .then((places) => {
        if (cancelled || !hostRef.current) return;

        element = new places.PlaceAutocompleteElement({
          includedRegionCodes: ['in'],
          locationBias: COIMBATORE_BIAS,
          requestedRegion: 'in',
        });
        element.id = id;
        element.setAttribute('aria-label', label);
        if (initialValueRef.current) element.value = initialValueRef.current;

        element.addEventListener('gmp-select', (event) => {
          const { placePrediction } = event as google.maps.places.PlacePredictionSelectEvent;
          const place = placePrediction.toPlace();
          setLookupError(null);

          place
            .fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'addressComponents'] })
            .then(() => {
              const { neighborhood, city } = parseAddressComponents(place.addressComponents ?? []);
              callbacks.current.onPick({
                address: place.formattedAddress ?? '',
                name: place.displayName ?? '',
                neighborhood,
                city,
                latitude: place.location?.lat() ?? null,
                longitude: place.location?.lng() ?? null,
              });
            })
            .catch(() => {
              setLookupError("Couldn't load that place's details. Please fill in the fields below yourself.");
              callbacks.current.onType(placePrediction.text?.text ?? '');
            });
        });

        // `input` is composed, so typing inside the widget's shadow DOM reaches us here.
        element.addEventListener('input', () => {
          if (element) callbacks.current.onType(element.value);
        });

        element.addEventListener('gmp-error', () => {
          if (!cancelled) callbacks.current.onUnavailable();
        });

        hostRef.current.replaceChildren(element);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) callbacks.current.onUnavailable();
      });

    return () => {
      cancelled = true;
      element?.remove();
    };
  }, [id, label]);

  return (
    <FieldShell label={label} htmlFor={id} required={required} error={error ?? lookupError ?? undefined} hint={hint}>
      <div
        ref={hostRef}
        className={cn(
          'min-h-11 rounded-xl [color-scheme:light_dark] [&>*]:w-full',
          highlight && 'ring-2 ring-accent/60',
          error && 'ring-2 ring-danger/50',
        )}
      />
      {!ready && (
        <p className="flex items-center gap-2 text-xs text-ink-muted" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Loading address search…
        </p>
      )}
    </FieldShell>
  );
}
