import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The Web Speech API is not in TypeScript's DOM library, and Chrome still ships it under
 * a webkit prefix — so the handful of members used here are declared by hand.
 */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;

  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

interface VoiceSearchOptions {
  /** Called as words are recognised, so the search box fills in while the user talks. */
  onInterim?: (text: string) => void;
  /** Called once with the finished sentence. */
  onResult: (text: string) => void;
  onError?: (message: string) => void;
}

/**
 * Speak a search instead of typing it.
 *
 * "Music this weekend in Gandhipuram" is easier said than typed on a phone, and the smart
 * search already turns a sentence into filters — voice is just a faster way to hand it one.
 * `supported` is false in browsers without the Web Speech API, so the mic can be hidden.
 */
export function useVoiceSearch({ onInterim, onResult, onError }: VoiceSearchOptions) {
  const [supported] = useState(() => getRecognition() !== null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Latest callbacks without restarting recognition when a parent re-renders.
  const handlers = useRef({ onInterim, onResult, onError });
  handlers.current = { onInterim, onResult, onError };

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Recognition = getRecognition();
    if (!Recognition || recognitionRef.current) return;

    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-IN';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    let finalText = '';

    recognition.onresult = (event) => {
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? '';
        if (result?.isFinal) finalText += transcript;
        else interim += transcript;
      }

      handlers.current.onInterim?.((finalText + interim).trim());
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are the user changing their mind, not failures.
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      handlers.current.onError?.(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone access was declined. Allow it in your browser to search by voice.'
          : 'We could not hear that. Please try again.',
      );
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);

      const text = finalText.trim();
      if (text) handlers.current.onResult(text);
    };

    recognitionRef.current = recognition;
    setListening(true);

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
    }
  }, []);

  // Never leave the microphone open after the component has gone.
  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    [],
  );

  return { supported, listening, start, stop };
}
