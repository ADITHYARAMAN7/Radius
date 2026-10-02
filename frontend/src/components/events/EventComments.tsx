import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Avatar, Badge, Card } from '@/components/ui/Primitives';
import { useAuth, useDisplayName } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { formatTimeAgo } from '@/lib/utils';
import type { EventComment, EventRecord } from '@/lib/types';

const MAX_LENGTH = 500;

/**
 * Questions and answers under an event.
 *
 * The things people need to know before they commit — is there parking, can I bring the
 * kids, what if it rains — are rarely in the description. Asking in public means the
 * organiser answers once and everyone after sees it, and replies from the organiser are
 * marked so an answer is easy to tell from another guess.
 */
export function EventComments({ event }: { event: EventRecord }) {
  const { user, initialising } = useAuth();
  const displayName = useDisplayName();
  const toast = useToast();

  const [comments, setComments] = useState<EventComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialising) return;

    const controller = new AbortController();
    setLoading(true);
    setFailed(false);

    api
      .listComments(event.id, Boolean(user), controller.signal)
      .then((result) => setComments(result.comments))
      .catch((error: unknown) => {
        if ((error as Error).name !== 'AbortError') setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [event.id, user, initialising]);

  const onSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();

    const trimmed = text.trim();
    if (trimmed.length < 2) return;

    setPosting(true);
    try {
      const { comment } = await api.addComment(event.id, trimmed);
      setComments((current) => [...current, comment]);
      setText('');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'We could not post that. Please try again.';
      toast.error('Could not post', message);
    } finally {
      setPosting(false);
    }
  };

  const onDelete = async (comment: EventComment) => {
    setDeletingId(comment.id);
    try {
      await api.deleteComment(event.id, comment.id);
      setComments((current) => current.filter((item) => item.id !== comment.id));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'We could not remove that comment.';
      toast.error('Could not remove', message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="mt-8" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="flex items-center gap-2 text-display-sm">
        <MessageCircle className="h-5 w-5 text-brand" aria-hidden="true" />
        Questions &amp; answers
        {comments.length > 0 && (
          <span className="text-sm font-semibold tabular-nums text-ink-muted">({comments.length})</span>
        )}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Ask the organiser anything the description does not cover. Everyone can see the answer.
      </p>

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="space-y-3" aria-hidden="true">
            <div className="shimmer h-16 rounded-card" />
            <div className="shimmer h-16 rounded-card" />
          </div>
        ) : failed ? (
          <p className="text-sm text-ink-soft">The conversation could not be loaded right now.</p>
        ) : comments.length === 0 ? (
          <p className="rounded-card bg-surface-sunken px-4 py-5 text-sm text-ink-soft">
            No questions yet. If you are wondering about something, someone else probably is too.
          </p>
        ) : (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li key={comment.id}>
                <Card className="flex gap-3 p-4">
                  <Avatar name={comment.displayName} src={comment.photoURL} size="sm" />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-bold text-ink">{comment.displayName}</span>
                      {comment.isOrganiser && (
                        <Badge tone="brand" size="sm">
                          Organiser
                        </Badge>
                      )}
                      {comment.createdAt && (
                        <span className="text-xs text-ink-muted">{formatTimeAgo(comment.createdAt)}</span>
                      )}
                    </div>

                    <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-ink-soft">
                      {comment.text}
                    </p>
                  </div>

                  {comment.canDelete && (
                    <button
                      type="button"
                      onClick={() => void onDelete(comment)}
                      disabled={deletingId === comment.id}
                      className="-m-1 h-8 w-8 shrink-0 rounded-lg text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger-ink disabled:opacity-50"
                      aria-label={`Remove comment by ${comment.displayName}`}
                      title="Remove comment"
                    >
                      <Trash2 className="mx-auto h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ------------------------------------------------------------- composer */}
      {user ? (
        <form onSubmit={onSubmit} className="mt-4 flex gap-3">
          <Avatar name={displayName} src={user.photoURL} size="sm" className="mt-1" />

          <div className="min-w-0 flex-1">
            <label htmlFor="comment-text" className="sr-only">
              {event.isOwner ? 'Reply as the organiser' : 'Ask a question'}
            </label>
            <textarea
              id="comment-text"
              value={text}
              onChange={(changeEvent) => setText(changeEvent.target.value)}
              rows={2}
              maxLength={MAX_LENGTH}
              placeholder={event.isOwner ? 'Reply as the organiser…' : 'Ask a question…'}
              className="w-full resize-y rounded-xl bg-surface px-3.5 py-2.5 text-sm text-ink ring-1 ring-inset ring-border transition-shadow placeholder:text-ink-muted hover:ring-border-strong focus:outline-none focus:ring-2 focus:ring-brand"
            />

            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs tabular-nums text-ink-muted">
                {text.length}/{MAX_LENGTH}
              </span>
              <Button
                type="submit"
                size="sm"
                loading={posting}
                loadingLabel="Posting"
                disabled={text.trim().length < 2}
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                Post
              </Button>
            </div>
          </div>
        </form>
      ) : (
        !initialising && (
          <p className="mt-4 text-sm text-ink-soft">
            <Link
              to={`/login?next=${encodeURIComponent(`/events/${event.id}`)}`}
              className="font-semibold text-brand hover:text-brand-hover"
            >
              Sign in
            </Link>{' '}
            to ask a question.
          </p>
        )
      )}
    </section>
  );
}
