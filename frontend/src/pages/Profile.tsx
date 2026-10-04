import { useEffect, useState } from 'react';
import { CalendarHeart, CalendarPlus, LogOut, Save, Users } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { Avatar, Card, Separator, StatTile } from '@/components/ui/Primitives';
import { PageSkeleton } from '@/components/common/States';
import { NeighbourStanding } from '@/components/community/NeighbourStanding';
import { useAuth, useDisplayName } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { formatEventDateLong } from '@/lib/utils';

export default function Profile() {
  const { user, profile, setProfile, refreshProfile, signOut, initialising } = useAuth();
  const displayName = useDisplayName();
  const toast = useToast();

  const [form, setForm] = useState({ displayName: '', bio: '', neighborhood: '', city: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState<{ created: number; attending: number; rsvps: number } | null>(null);

  useEffect(() => {
    document.title = 'Profile — Radius';
  }, []);

  // Points move whenever the user RSVPs or checks in elsewhere, so read them fresh.
  useEffect(() => {
    if (user) void refreshProfile().catch(() => undefined);
  }, [user, refreshProfile]);

  // Only the first profile to arrive seeds the form; later refreshes carry new points and
  // must not overwrite what is being typed.
  const [formSeeded, setFormSeeded] = useState(false);

  // Seed the form once the profile arrives, without clobbering in-progress edits.
  useEffect(() => {
    if (!profile || formSeeded) return;
    setForm({
      displayName: profile.displayName,
      bio: profile.bio,
      neighborhood: profile.neighborhood,
      city: profile.city,
    });
    setFormSeeded(true);
  }, [profile, formSeeded]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    Promise.all([api.myEvents(), api.myRsvps()])
      .then(([created, attending]) => {
        if (!active) return;
        setCounts({
          created: created.total,
          attending: attending.total,
          rsvps: created.events.reduce((sum, event) => sum + event.rsvpCount, 0),
        });
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [user]);

  if (initialising) return <PageSkeleton label="Loading your profile" />;

  const onSave = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    setErrors({});

    if (form.displayName.trim().length < 2) {
      setErrors({ displayName: 'Your name needs at least 2 characters.' });
      return;
    }

    setSaving(true);
    try {
      const result = await api.updateProfile({
        displayName: form.displayName.trim(),
        bio: form.bio.trim(),
        neighborhood: form.neighborhood.trim(),
        city: form.city.trim(),
      });

      setProfile(result.profile);
      toast.success('Profile saved');
    } catch (error) {
      if (error instanceof ApiError) {
        if (Object.keys(error.fields).length) setErrors(error.fields);
        toast.error('Could not save', error.message);
      } else {
        toast.error('Could not save', 'Please try again in a moment.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-page max-w-3xl py-8">
      <header className="mb-8">
        <h1 className="text-display-lg">Your profile</h1>
        <p className="mt-2 text-sm text-ink-soft sm:text-base">
          Your name and neighbourhood are shown on the events you organise.
        </p>
      </header>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={displayName} src={user?.photoURL} size="lg" />

          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold text-ink">{displayName}</p>
            {user?.email && <p className="truncate text-sm text-ink-soft">{user.email}</p>}
            {profile?.createdAt && (
              <p className="mt-0.5 text-xs text-ink-muted">
                Member since {formatEventDateLong(profile.createdAt)}
              </p>
            )}
          </div>

          <Button variant="secondary" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </Card>

      {counts && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatTile
            label="Events posted"
            value={counts.created}
            icon={<CalendarPlus className="h-4 w-4" aria-hidden="true" />}
          />
          <StatTile
            label="RSVPs received"
            value={counts.rsvps}
            hint="Across everything you organise"
            icon={<Users className="h-4 w-4" aria-hidden="true" />}
          />
          <StatTile
            label="Going to"
            value={counts.attending}
            icon={<CalendarHeart className="h-4 w-4" aria-hidden="true" />}
          />
        </div>
      )}

      {profile && <NeighbourStanding profile={profile} className="mt-6" />}

      <form onSubmit={onSave} noValidate className="mt-6">
        <Card className="space-y-5 p-5 sm:p-6">
          <h2 className="font-display text-base font-bold text-ink">Details</h2>

          <Input
            label="Display name"
            required
            value={form.displayName}
            onChange={(changeEvent) => setForm({ ...form, displayName: changeEvent.target.value })}
            error={errors.displayName}
            hint="Shown as the organiser on your events."
          />

          <Textarea
            label="About you"
            rows={4}
            value={form.bio}
            onChange={(changeEvent) => setForm({ ...form, bio: changeEvent.target.value })}
            error={errors.bio}
            hint="Optional. A line or two about what you organise."
            maxLength={500}
            trailing={<span className="text-xs tabular-nums text-ink-muted">{form.bio.length}/500</span>}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              label="Home neighbourhood"
              value={form.neighborhood}
              onChange={(changeEvent) => setForm({ ...form, neighborhood: changeEvent.target.value })}
              error={errors.neighborhood}
              placeholder="Gandhipuram"
              hint="Used to pick events for you."
            />

            <Input
              label="City"
              value={form.city}
              onChange={(changeEvent) => setForm({ ...form, city: changeEvent.target.value })}
              error={errors.city}
              placeholder="Coimbatore"
            />
          </div>

          <Separator />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <div className="flex gap-2">
              <ButtonLink to="/my-events" variant="ghost" size="sm">
                My events
              </ButtonLink>
              <ButtonLink to="/my-rsvps" variant="ghost" size="sm">
                My RSVPs
              </ButtonLink>
            </div>

            <Button type="submit" variant="primary" loading={saving} loadingLabel="Saving">
              <Save className="h-4 w-4" aria-hidden="true" />
              Save profile
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
