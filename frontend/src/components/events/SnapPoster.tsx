import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, ImagePlus, Loader2, ScanText, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Primitives';
import { api, ApiError } from '@/lib/api';
import type { ExtractionResult } from '@/lib/types';

/** Matches the server's MAX_IMAGE_BYTES. */
const MAX_BYTES = 5 * 1024 * 1024;
/** Plenty for Gemini to read poster text, and keeps phone photos well under the cap. */
const MAX_EDGE = 2000;
const MAX_TEXT = 4000;

const FALLBACK_MESSAGE = "Couldn't read it automatically. Please fill the form manually.";

/**
 * Phone photos are often 4–10 MB. Re-encoding to a 2000px JPEG keeps the upload fast and
 * under the server limit. Formats the browser cannot decode (HEIC in Chrome) go as-is and
 * the server's own checks decide.
 */
async function shrinkImage(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }

    // JPEG has no transparency; a white backdrop keeps transparent PNG posters readable.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

/**
 * Snap-a-Poster (idea by Adhi): a poster photo or a forwarded WhatsApp message goes to
 * Gemini, and the details come back for the form to pre-fill. Nothing is posted from here.
 */
export function SnapPoster({
  available,
  onExtracted,
  onUsePoster,
}: {
  /** From /api/ai/status. */
  available: boolean;
  onExtracted: (result: ExtractionResult) => void;
  /** Called after the poster has been uploaded as the event image. */
  onUsePoster: (image: { imageUrl: string; imagePath: string }) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** The image actually sent to Gemini, reused if the user wants it as the event image. */
  const [sentImage, setSentImage] = useState<Blob | null>(null);
  const [uploadAvailable, setUploadAvailable] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [posterUsed, setPosterUsed] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!available) return;
    api
      .uploadStatus()
      .then((status) => setUploadAvailable(status.available))
      .catch(() => setUploadAvailable(false));
  }, [available]);

  // Object URLs hold the file in memory until revoked.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPreviewFailed(false);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!available) {
    return (
      <Panel className="flex gap-3 bg-surface-sunken/60 p-4">
        <ScanText className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">Fill from a poster or WhatsApp message</span> needs the AI
          assistant, which is not set up on this server. You can still fill in the form below.
        </p>
      </Panel>
    );
  }

  const choose = (picked: File | undefined) => {
    if (!picked) return;
    if (!picked.type.startsWith('image/') && !/\.(heic|heif)$/i.test(picked.name)) {
      setError('Please choose a photo (JPG, PNG, WebP or HEIC).');
      return;
    }
    setFile(picked);
    setError(null);
    setNotice(null);
    setSentImage(null);
    setPosterUsed(false);
  };

  const clearFile = () => {
    setFile(null);
    setSentImage(null);
    setPosterUsed(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const read = async () => {
    const trimmed = text.trim();
    if (!file && !trimmed) {
      setError('Add a photo of the poster or paste the message first.');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const image = file ? await shrinkImage(file) : undefined;
      if (image && image.size > MAX_BYTES) {
        setError('That photo is larger than 5 MB. Please take a smaller photo or a screenshot of the poster.');
        return;
      }

      const { result } = await api.aiExtract({ image, text: trimmed || undefined, timezone: browserTimezone() });
      setSentImage(image ?? null);

      if (!result.found) {
        setNotice(result.warnings[0] ?? "Couldn't find event details in that.");
        return;
      }

      onExtracted(result);
      setNotice(
        `Filled ${result.filled.length} ${result.filled.length === 1 ? 'field' : 'fields'} below. Check them before publishing.`,
      );
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.fields.text ?? (caught.status === 503 ? FALLBACK_MESSAGE : caught.message));
      } else {
        setError(FALLBACK_MESSAGE);
      }
    } finally {
      setBusy(false);
    }
  };

  // Storage only takes the formats the board serves; a HEIC original is not one of them.
  const canUseAsImage =
    uploadAvailable && sentImage !== null && /^image\/(jpeg|png|webp)$/.test(sentImage.type) && !posterUsed;

  const usePoster = async () => {
    if (!sentImage) return;
    setUploading(true);
    try {
      const extension = sentImage.type === 'image/png' ? 'png' : sentImage.type === 'image/webp' ? 'webp' : 'jpg';
      const uploaded = await api.uploadImage(new File([sentImage], `poster.${extension}`, { type: sentImage.type }));
      onUsePoster(uploaded);
      setPosterUsed(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not upload the poster. You can add a photo below instead.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Panel className="border-0 bg-gradient-to-br from-accent-soft/70 to-brand-soft/60 ring-accent/15">
      <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
        <ScanText className="h-5 w-5 text-accent" aria-hidden="true" />
        Fill from a poster or WhatsApp message
      </h2>
      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-soft">
        Snap the poster or paste a forwarded message. Gemini reads it and fills in the form below for you to
        check. Nothing is posted until you press Publish.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <input
            ref={inputRef}
            id="snap-poster-file"
            type="file"
            accept="image/*,.heic,.heif"
            className="sr-only"
            onChange={(changeEvent) => choose(changeEvent.target.files?.[0])}
            disabled={busy}
          />

          {file ? (
            <div className="relative overflow-hidden rounded-xl bg-surface ring-1 ring-border">
              {previewUrl && !previewFailed ? (
                <img
                  src={previewUrl}
                  alt="Poster preview"
                  className="h-48 w-full object-contain"
                  onError={() => setPreviewFailed(true)}
                />
              ) : (
                <div className="flex h-48 flex-col items-center justify-center gap-2 p-4 text-center">
                  <ImagePlus className="h-6 w-6 text-ink-muted" aria-hidden="true" />
                  <span className="break-all text-sm font-semibold text-ink">{file.name}</span>
                  <span className="text-xs text-ink-muted">No preview for this format, but it can still be read.</span>
                </div>
              )}
              <button
                type="button"
                onClick={clearFile}
                disabled={busy}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-surface/90 text-ink-soft shadow-xs ring-1 ring-border transition-colors hover:text-ink"
                aria-label="Remove this photo"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <label
              htmlFor="snap-poster-file"
              className="flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface/60 px-4 text-center transition-colors hover:bg-surface"
            >
              <Camera className="h-6 w-6 text-ink-muted" aria-hidden="true" />
              <span className="text-sm font-semibold text-ink">Take or choose a poster photo</span>
              <span className="text-xs text-ink-muted">JPG, PNG, WebP or HEIC</span>
            </label>
          )}
        </div>

        <Textarea
          id="snap-poster-text"
          label="…or paste the message"
          rows={6}
          value={text}
          onChange={(changeEvent) => {
            setText(changeEvent.target.value);
            setError(null);
          }}
          placeholder="Forwarded: Free yoga at VOC Park this Saturday 7am, bring a mat!"
          maxLength={MAX_TEXT}
          disabled={busy}
          trailing={<span className="text-xs tabular-nums text-ink-muted">{text.length}/{MAX_TEXT}</span>}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={read} loading={busy} loadingLabel="Reading">
          <ScanText className="h-4 w-4" aria-hidden="true" />
          Read it and fill the form
        </Button>

        {canUseAsImage && (
          <Button variant="secondary" onClick={usePoster} loading={uploading} loadingLabel="Uploading">
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            Use this poster as the event image
          </Button>
        )}
        {posterUsed && <span className="text-sm font-medium text-success-ink">Poster set as the event image.</span>}
      </div>

      {busy && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface/70 p-4" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-accent" aria-hidden="true" />
          <p className="text-sm text-ink-soft">{file ? 'Reading your poster…' : 'Reading your message…'}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {notice && !error && (
        <p role="status" className="mt-4 rounded-xl bg-surface/80 p-3 text-sm text-ink-soft ring-1 ring-border">
          {notice}
        </p>
      )}
    </Panel>
  );
}
