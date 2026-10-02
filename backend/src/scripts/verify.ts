/**
 * Service-level verification against the Firestore emulator.
 *
 * Covers the authenticated paths that cannot be driven over HTTP locally, because
 * verifying a real Firebase ID token needs Google's public keys and a live project:
 * create, edit, ownership enforcement, the RSVP transaction, cascade delete and expiry.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 npx tsx src/scripts/verify.ts
 */
import { Timestamp, getDb, initFirebase } from '../config/firebase';
import type { AuthUser } from '../middleware/auth';
import { eventInputSchema } from '../middleware/validate';
import {
  cancelEvent,
  createEvent,
  deleteEvent,
  getEventById,
  expirePastEvents,
  listAttendees,
  listEvents,
  listEventsAttending,
  listEventsByCreator,
  reactivateEvent,
  updateEvent,
} from '../services/eventService';
import { joinEvent, leaveEvent } from '../services/rsvpService';
import { ensureProfile, updateProfile } from '../services/userService';
import { getInsights } from '../services/statsService';
import { normalizeExtraction, nowInTimezone, resolveTimezone } from '../services/aiService';
import { isOwnedImagePath } from '../services/storageService';
import { AppError } from '../middleware/error';

const ORGANISER: AuthUser = {
  uid: 'verify-organiser',
  email: 'organiser@example.com',
  displayName: 'Verify Organiser',
  photoURL: null,
};

const ATTENDEE: AuthUser = {
  uid: 'verify-attendee',
  email: 'attendee@example.com',
  displayName: 'Verify Attendee',
  photoURL: null,
};

const INTRUDER: AuthUser = {
  uid: 'verify-intruder',
  email: 'intruder@example.com',
  displayName: 'Verify Intruder',
  photoURL: null,
};

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
}

/** Asserts the call is rejected, and with the status we expect. */
async function expectRejection(
  name: string,
  status: number,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    check(name, false, 'the call unexpectedly succeeded');
  } catch (error) {
    const appError = error instanceof AppError ? error : null;
    check(name, appError?.status === status, `got ${appError?.status ?? String(error)}`);
  }
}

function tomorrowDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

const BASE_INPUT = {
  title: 'Verification run: neighbourhood badminton ladder',
  description:
    'A generated event used by the automated verification script to exercise create, edit, RSVP and delete end to end.',
  summary: 'Automated verification event.',
  category: 'Sports' as const,
  tags: ['verification', 'badminton'],
  date: tomorrowDate(),
  startTime: '18:00',
  endTime: '20:00',
  location: 'Verification Courts',
  address: '1 Verification Road, Peelamedu, Coimbatore 641004',
  latitude: 11.0244,
  longitude: 77.0183,
  neighborhood: 'Peelamedu',
  city: 'Coimbatore',
  imageUrl: null,
  imagePath: null,
};

async function cleanup(): Promise<void> {
  const db = getDb();

  const owned = await db.collection('events').where('creatorId', '==', ORGANISER.uid).get();
  for (const doc of owned.docs) {
    const rsvps = await doc.ref.collection('rsvps').get();
    for (const rsvp of rsvps.docs) await rsvp.ref.delete();
    await doc.ref.delete();
  }

  for (const uid of [ORGANISER.uid, ATTENDEE.uid, INTRUDER.uid]) {
    const attending = await db.collection('users').doc(uid).collection('attending').get();
    for (const doc of attending.docs) await doc.ref.delete();
    await db.collection('users').doc(uid).delete().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  initFirebase();
  const db = getDb();

  await cleanup();

  console.log('\n=== Profiles ===');
  {
    const profile = await ensureProfile(ORGANISER);
    check('profile created on first sign-in', profile.uid === ORGANISER.uid);
    check('display name carried from the token', profile.displayName === ORGANISER.displayName);

    const again = await ensureProfile(ORGANISER);
    check('ensureProfile is idempotent', again.createdAt === profile.createdAt);

    const edited = await updateProfile(ORGANISER.uid, { bio: 'Runs the Thursday ladder.', city: 'Coimbatore' });
    check('profile updates persist', edited.bio === 'Runs the Thursday ladder.');

    const preserved = await ensureProfile(ORGANISER);
    check('ensureProfile does not clobber an edited profile', preserved.bio === 'Runs the Thursday ladder.');
  }

  console.log('\n=== Validation ===');
  {
    const short = eventInputSchema.safeParse({ ...BASE_INPUT, title: 'Hi' });
    check('a too-short title is rejected', !short.success);

    const backwards = eventInputSchema.safeParse({ ...BASE_INPUT, startTime: '20:00', endTime: '18:00' });
    check('end before start is rejected', !backwards.success);

    const badCategory = eventInputSchema.safeParse({ ...BASE_INPUT, category: 'Nonsense' });
    check('an unknown category is rejected', !badCategory.success);

    const badTime = eventInputSchema.safeParse({ ...BASE_INPUT, startTime: '25:00' });
    check('an impossible time is rejected', !badTime.success);

    const valid = eventInputSchema.safeParse(BASE_INPUT);
    check('a well-formed event passes validation', valid.success);
  }

  console.log('\n=== Create ===');
  const created = await createEvent(eventInputSchema.parse(BASE_INPUT), ORGANISER);
  {
    check('event created with an id', Boolean(created.id));
    check('status starts ACTIVE', created.status === 'ACTIVE');
    check('rsvpCount starts at zero', created.rsvpCount === 0);
    check('creator recorded from the token', created.creatorId === ORGANISER.uid);
    check('isOwner true for the creator', created.isOwner === true);
    check('coordinates stored', created.latitude === 11.0244 && created.longitude === 77.0183);

    const stored = (await db.collection('events').doc(created.id).get()).data();
    check('lowercase neighbourhood mirror written', stored?.neighborhoodLower === 'peelamedu');
    check('lowercase city mirror written', stored?.cityLower === 'coimbatore');
    check('search keywords generated', Array.isArray(stored?.searchKeywords) && stored.searchKeywords.length > 3);
    check('keywords include a title word', (stored?.searchKeywords as string[]).includes('badminton'));
    check('startsAt stored as a Timestamp', stored?.startsAt instanceof Timestamp);
  }

  await expectRejection('creating an event in the past is rejected', 400, () =>
    createEvent(eventInputSchema.parse({ ...BASE_INPUT, date: '2020-01-01' }), ORGANISER),
  );

  console.log('\n=== Ownership enforcement ===');
  {
    await expectRejection('a non-owner cannot edit', 403, () =>
      updateEvent(created.id, { title: 'Hijacked by someone else entirely' }, INTRUDER),
    );
    await expectRejection('a non-owner cannot delete', 403, () => deleteEvent(created.id, INTRUDER));
    await expectRejection('a non-owner cannot cancel', 403, () => cancelEvent(created.id, INTRUDER));

    const intact = await getEventById(created.id);
    check('the event is unchanged after those attempts', intact.title === BASE_INPUT.title);

    await expectRejection('editing a missing event is a 404', 404, () =>
      updateEvent('no-such-event-id', { title: 'Nothing here' }, ORGANISER),
    );
  }

  console.log('\n=== RSVP transaction ===');
  {
    const first = await joinEvent(created.id, ATTENDEE);
    check('first RSVP sets attending', first.attending === true);
    check('first RSVP increments the count to 1', first.rsvpCount === 1, `got ${first.rsvpCount}`);

    const duplicate = await joinEvent(created.id, ATTENDEE);
    check('a duplicate RSVP does not double count', duplicate.rsvpCount === 1, `got ${duplicate.rsvpCount}`);

    const stored = (await db.collection('events').doc(created.id).get()).data();
    check('stored rsvpCount agrees', stored?.rsvpCount === 1, `got ${stored?.rsvpCount}`);

    const rsvps = await db.collection('events').doc(created.id).collection('rsvps').get();
    check('exactly one RSVP document exists', rsvps.size === 1, `got ${rsvps.size}`);
    check('the RSVP document id is the uid', rsvps.docs[0]?.id === ATTENDEE.uid);

    const mirror = await db.collection('users').doc(ATTENDEE.uid).collection('attending').doc(created.id).get();
    check('the attending mirror was written', mirror.exists);

    const attendees = await listAttendees(created.id);
    check('the attendee appears in the list', attendees.some((a) => a.uid === ATTENDEE.uid));

    const asAttendee = await getEventById(created.id, ATTENDEE.uid);
    check('isAttending reported for the attendee', asAttendee.isAttending === true);
    check('isOwner false for the attendee', asAttendee.isOwner === false);

    const asOrganiser = await getEventById(created.id, ORGANISER.uid);
    check('isAttending false for the organiser', asOrganiser.isAttending === false);
    check('isOwner true for the organiser', asOrganiser.isOwner === true);

    const mine = await listEventsAttending(ATTENDEE.uid);
    check('event appears under "attending"', mine.some((e) => e.id === created.id));

    // A second person joining proves the counter accumulates rather than being set.
    const second = await joinEvent(created.id, INTRUDER);
    check('a second attendee takes the count to 2', second.rsvpCount === 2, `got ${second.rsvpCount}`);

    const left = await leaveEvent(created.id, ATTENDEE);
    check('cancelling clears attending', left.attending === false);
    check('cancelling decrements to 1', left.rsvpCount === 1, `got ${left.rsvpCount}`);

    const twice = await leaveEvent(created.id, ATTENDEE);
    check('cancelling twice does not go negative', twice.rsvpCount === 1, `got ${twice.rsvpCount}`);

    const goneMirror = await db.collection('users').doc(ATTENDEE.uid).collection('attending').doc(created.id).get();
    check('the attending mirror was removed', !goneMirror.exists);

    const stillAttending = await listEventsAttending(ATTENDEE.uid);
    check('event no longer under "attending"', !stillAttending.some((e) => e.id === created.id));
  }

  console.log('\n=== Edit ===');
  {
    const updated = await updateEvent(
      created.id,
      { title: 'Verification run: renamed badminton ladder', category: 'Community' },
      ORGANISER,
    );
    check('title updated', updated.title === 'Verification run: renamed badminton ladder');
    check('category updated', updated.category === 'Community');
    check('rsvpCount untouched by an edit', updated.rsvpCount === 1, `got ${updated.rsvpCount}`);

    const stored = (await db.collection('events').doc(created.id).get()).data();
    check('keywords regenerated on edit', (stored?.searchKeywords as string[]).includes('renamed'));

    const partial = await updateEvent(created.id, { summary: 'Only the summary changed.' }, ORGANISER);
    check('a partial edit leaves other fields alone', partial.title === updated.title);
    check('the partial field changed', partial.summary === 'Only the summary changed.');

    await expectRejection('an edit with end before start is rejected', 400, () =>
      updateEvent(created.id, { startTime: '21:00', endTime: '19:00' }, ORGANISER),
    );
  }

  console.log('\n=== Created-by listing ===');
  {
    const mine = await listEventsByCreator(ORGANISER.uid, ORGANISER.uid);
    check('the organiser sees their own event', mine.some((e) => e.id === created.id));
    check('their events are marked isOwner', mine.every((e) => e.isOwner === true));

    const others = await listEventsByCreator(INTRUDER.uid, INTRUDER.uid);
    check('an unrelated user sees none of them', !others.some((e) => e.id === created.id));
  }

  console.log('\n=== Cancellation and expiry ===');
  {
    const cancelled = await cancelEvent(created.id, ORGANISER);
    check('cancelling sets status CANCELLED', cancelled.status === 'CANCELLED');

    const feed = await listEvents({ pageSize: 60 });
    check('a cancelled event leaves the active board', !feed.items.some((e) => e.id === created.id));

    await expectRejection('you cannot RSVP to a cancelled event', 409, () =>
      joinEvent(created.id, ATTENDEE),
    );

    // A finished-but-still-ACTIVE event is what the sweep is for.
    const pastRef = await db.collection('events').add({
      ...BASE_INPUT,
      date: '2024-01-01',
      startsAt: Timestamp.fromDate(new Date('2024-01-01T10:00:00Z')),
      endsAt: Timestamp.fromDate(new Date('2024-01-01T12:00:00Z')),
      neighborhoodLower: 'peelamedu',
      cityLower: 'coimbatore',
      searchKeywords: ['verification'],
      creatorId: ORGANISER.uid,
      creatorName: ORGANISER.displayName,
      creatorPhotoURL: null,
      rsvpCount: 0,
      status: 'ACTIVE',
    });

    const beforeSweep = await listEvents({ pageSize: 60 });
    check(
      'a finished event is already hidden before any sweep',
      !beforeSweep.items.some((e) => e.id === pastRef.id),
    );

    const sweep = await expirePastEvents();
    check('the sweep expired at least one event', sweep.expired >= 1, `expired=${sweep.expired}`);

    const after = (await pastRef.get()).data();
    check('the finished event is now marked EXPIRED', after?.status === 'EXPIRED');

    const secondSweep = await expirePastEvents();
    check('a second sweep finds nothing left to do', secondSweep.expired === 0, `expired=${secondSweep.expired}`);

    await pastRef.delete();
  }

  console.log('\n=== Reactivating a cancelled event ===');
  {
    const revivable = await createEvent(
      eventInputSchema.parse({ ...BASE_INPUT, title: 'Verification run: cancel then restore' }),
      ORGANISER,
    );

    await joinEvent(revivable.id, ATTENDEE);

    const cancelled = await cancelEvent(revivable.id, ORGANISER);
    check('cancelled first', cancelled.status === 'CANCELLED');

    await expectRejection('a non-owner cannot reactivate', 403, () =>
      reactivateEvent(revivable.id, INTRUDER),
    );

    const restored = await reactivateEvent(revivable.id, ORGANISER);
    check('an upcoming event restores to ACTIVE', restored.status === 'ACTIVE');
    check('RSVPs survive a cancel/restore cycle', restored.rsvpCount === 1, `got ${restored.rsvpCount}`);

    const board = await listEvents({ pageSize: 60 });
    check('the restored event is back on the board', board.items.some((e) => e.id === revivable.id));

    await expectRejection('reactivating an active event is a conflict', 409, () =>
      reactivateEvent(revivable.id, ORGANISER),
    );

    // A cancelled event that has since finished should come back EXPIRED, not ACTIVE.
    await cancelEvent(revivable.id, ORGANISER);
    await db.collection('events').doc(revivable.id).update({
      startsAt: Timestamp.fromDate(new Date('2024-01-01T10:00:00Z')),
      endsAt: Timestamp.fromDate(new Date('2024-01-01T12:00:00Z')),
    });

    const stale = await reactivateEvent(revivable.id, ORGANISER);
    check('restoring a finished event yields EXPIRED, not ACTIVE', stale.status === 'EXPIRED', stale.status);

    await leaveEvent(revivable.id, ATTENDEE);
    await deleteEvent(revivable.id, ORGANISER);
  }

  console.log('\n=== Distance filter ===');
  {
    // Two events ~11 km apart: one in Peelamedu, one out at Vadavalli.
    const near = await createEvent(
      eventInputSchema.parse({
        ...BASE_INPUT,
        title: 'Verification run: event close to the centre',
        latitude: 11.0244,
        longitude: 77.0183,
      }),
      ORGANISER,
    );

    const far = await createEvent(
      eventInputSchema.parse({
        ...BASE_INPUT,
        title: 'Verification run: event far from the centre',
        latitude: 11.0272,
        longitude: 76.9036,
        neighborhood: 'Vadavalli',
      }),
      ORGANISER,
    );

    const centre = { lat: 11.0244, lng: 77.0183 };

    const tight = await listEvents({ ...centre, radiusKm: 5, pageSize: 60 });
    check('a 5 km radius includes the near event', tight.items.some((e) => e.id === near.id));
    check('a 5 km radius excludes the far event', !tight.items.some((e) => e.id === far.id));

    const wide = await listEvents({ ...centre, radiusKm: 50, pageSize: 60 });
    check('a 50 km radius includes both',
      wide.items.some((e) => e.id === near.id) && wide.items.some((e) => e.id === far.id));

    // Without a radius, distance must not filter anything out.
    const unfiltered = await listEvents({ pageSize: 60 });
    check('no radius means no distance filtering', unfiltered.items.some((e) => e.id === far.id));

    // An event with no coordinates cannot be placed, so a distance query must drop it.
    const unplaced = await createEvent(
      eventInputSchema.parse({
        ...BASE_INPUT,
        title: 'Verification run: event with no coordinates',
        latitude: null,
        longitude: null,
      }),
      ORGANISER,
    );

    const placedOnly = await listEvents({ ...centre, radiusKm: 50, pageSize: 60 });
    check(
      'an event without coordinates is excluded from a distance query',
      !placedOnly.items.some((e) => e.id === unplaced.id),
    );
    check(
      'but it still appears with no distance filter',
      (await listEvents({ pageSize: 60 })).items.some((e) => e.id === unplaced.id),
    );

    await deleteEvent(near.id, ORGANISER);
    await deleteEvent(far.id, ORGANISER);
    await deleteEvent(unplaced.id, ORGANISER);
  }

  console.log('\n=== Cascade delete ===');
  {
    const doomed = await createEvent(
      eventInputSchema.parse({ ...BASE_INPUT, title: 'Verification run: event to be deleted' }),
      ORGANISER,
    );

    await joinEvent(doomed.id, ATTENDEE);
    await joinEvent(doomed.id, INTRUDER);

    const before = await db.collection('events').doc(doomed.id).collection('rsvps').get();
    check('two RSVPs recorded before delete', before.size === 2, `got ${before.size}`);

    await deleteEvent(doomed.id, ORGANISER);

    const gone = await db.collection('events').doc(doomed.id).get();
    check('the event document is gone', !gone.exists);

    const orphanRsvps = await db.collection('events').doc(doomed.id).collection('rsvps').get();
    check('its RSVP subcollection is gone', orphanRsvps.empty);

    for (const uid of [ATTENDEE.uid, INTRUDER.uid]) {
      const mirror = await db.collection('users').doc(uid).collection('attending').doc(doomed.id).get();
      check(`the attending mirror for ${uid} is gone`, !mirror.exists);
    }

    const attendingAfter = await listEventsAttending(ATTENDEE.uid);
    check('no dangling entry under "attending"', !attendingAfter.some((e) => e.id === doomed.id));

    await expectRejection('reading a deleted event is a 404', 404, () => getEventById(doomed.id));
  }

  console.log('\n=== Security regressions ===');
  {
    // --- Cross-tenant image deletion -------------------------------------------------
    //
    // `imagePath` is echoed back by the client. Naming someone else's object once let an
    // attacker have it deleted when they removed their own event.
    const victimPath = `events/${ATTENDEE.uid}/1700000000-abcd1234-victim.jpg`;

    const hostile = await createEvent(
      eventInputSchema.parse({
        ...BASE_INPUT,
        title: 'Verification run: hostile image path',
        imageUrl: 'https://storage.googleapis.com/bucket/whatever.jpg',
        imagePath: victimPath,
      }),
      ORGANISER,
    );

    const storedHostile = (await db.collection('events').doc(hostile.id).get()).data();
    check(
      'an imagePath belonging to another user is discarded on create',
      storedHostile?.imagePath === null,
      String(storedHostile?.imagePath),
    );

    // Same path, via update.
    await updateEvent(
      hostile.id,
      { imageUrl: 'https://storage.googleapis.com/bucket/other.jpg', imagePath: victimPath },
      ORGANISER,
    );
    const afterUpdate = (await db.collection('events').doc(hostile.id).get()).data();
    check(
      'an imagePath belonging to another user is discarded on update',
      afterUpdate?.imagePath === null,
      String(afterUpdate?.imagePath),
    );

    // A path the caller does own is kept.
    const ownPath = `events/${ORGANISER.uid}/1700000000-abcd1234-mine.jpg`;
    await updateEvent(
      hostile.id,
      { imageUrl: 'https://storage.googleapis.com/bucket/mine.jpg', imagePath: ownPath },
      ORGANISER,
    );
    const afterOwn = (await db.collection('events').doc(hostile.id).get()).data();
    check('an imagePath the caller owns is kept', afterOwn?.imagePath === ownPath);

    check('path traversal is rejected', !isOwnedImagePath(`events/${ORGANISER.uid}/../../x`, ORGANISER.uid));
    check('absolute paths are rejected', !isOwnedImagePath(`/events/${ORGANISER.uid}/x.jpg`, ORGANISER.uid));
    check('another prefix is rejected', !isOwnedImagePath('events/someone-else/x.jpg', ORGANISER.uid));
    check('a correctly owned path is accepted', isOwnedImagePath(`events/${ORGANISER.uid}/x.jpg`, ORGANISER.uid));

    await deleteEvent(hostile.id, ORGANISER);

    // --- Dangerous URL schemes -------------------------------------------------------
    //
    // z.string().url() accepts javascript:, data: and file: — all of which reach an <img src>.
    for (const bad of [
      'javascript:alert(document.cookie)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'file:///etc/passwd',
      'http://insecure.example/x.jpg',
    ]) {
      const result = eventInputSchema.safeParse({ ...BASE_INPUT, imageUrl: bad });
      check(`imageUrl rejects ${bad.split(':')[0]}:`, !result.success);
    }

    const okUrl = eventInputSchema.safeParse({
      ...BASE_INPUT,
      imageUrl: 'https://storage.googleapis.com/bucket/events/u/ok.jpg',
    });
    check('imageUrl accepts https', okUrl.success);

    // --- Mass assignment -------------------------------------------------------------
    const massAssign = eventInputSchema.safeParse({
      ...BASE_INPUT,
      rsvpCount: 99999,
      creatorId: 'somebody-else',
      status: 'ACTIVE',
      id: 'chosen-id',
    });
    check(
      'privileged fields are stripped from input',
      massAssign.success &&
        !('rsvpCount' in massAssign.data) &&
        !('creatorId' in massAssign.data) &&
        !('status' in massAssign.data),
    );
  }

  console.log('\n=== Insights ===');
  {
    const insights = await getInsights();
    check('total events counted', insights.totals.events > 0);
    check('byCategory covers all 8 categories', insights.byCategory.length === 8);
    check('organisers counted', insights.totals.organisers > 0);
    check(
      'category totals do not exceed the event total',
      insights.byCategory.reduce((sum, row) => sum + row.events, 0) <= insights.totals.events,
    );
    check('a generation timestamp is included', Boolean(insights.generatedAt));
  }

  console.log('\n=== Snap-a-Poster normalisation (no Gemini call) ===');
  {
    const context = { today: '2026-10-03', nowTime: '14:00', textOnlySource: null };
    const base = {
      isEvent: true,
      title: 'Street food night',
      description: 'Stalls from across the city.',
      category: 'Food',
      date: '2026-10-05',
      startTime: '18:00',
      endTime: '21:00',
      location: 'Race Course Road',
      address: null,
      neighborhood: 'Race Course',
      city: 'Coimbatore',
    };

    const clean = normalizeExtraction(base, context);
    check('a complete extraction is found', clean.found && clean.warnings.length === 0);
    check('filled lists only non-null fields', !clean.filled.includes('address') && clean.filled.includes('title'));

    const notEvent = normalizeExtraction({ ...base, isEvent: false }, context);
    check('a non-event returns found=false', !notEvent.found && notEvent.filled.length === 0);
    check('a non-event carries no invented values', notEvent.fields.title === null && notEvent.fields.date === null);

    const unknownCategory = normalizeExtraction({ ...base, category: 'Party' }, context);
    check('an unknown category maps to Other', unknownCategory.fields.category === 'Other');

    const badDate = normalizeExtraction({ ...base, date: '2026-02-30' }, context);
    check('an impossible date is dropped with a warning', badDate.fields.date === null && badDate.warnings.length > 0);

    const past = normalizeExtraction({ ...base, date: '2026-10-01' }, context);
    check('a past date is kept but warned about', past.fields.date === '2026-10-01' && past.warnings.some((w) => w.includes('already passed')));

    const earlierToday = normalizeExtraction({ ...base, date: '2026-10-03', startTime: '09:00', endTime: '10:00' }, context);
    check('earlier today counts as passed', earlierToday.warnings.some((w) => w.includes('already passed')));

    const midnight = normalizeExtraction({ ...base, startTime: '21:00', endTime: '01:00' }, context);
    check('a past-midnight end is cleared with a warning', midnight.fields.endTime === null && midnight.warnings.some((w) => w.includes('midnight')));

    const noEnd = normalizeExtraction({ ...base, endTime: null }, context);
    check('a missing end time is warned about', noEnd.fields.endTime === null && noEnd.warnings.some((w) => w.includes('end time')));

    const shortTime = normalizeExtraction({ ...base, startTime: '7:30', endTime: '9:00' }, context);
    check('single-digit hours are zero-padded', shortTime.fields.startTime === '07:30' && shortTime.fields.endTime === '09:00');

    const invented = normalizeExtraction(base, { ...context, textOnlySource: 'Street food night this Monday 6pm at Race Course Road!' });
    check('a city absent from pasted text is dropped', invented.fields.city === null);
    check('a neighbourhood present in pasted text is kept', invented.fields.neighborhood === 'Race Course');

    check('an unknown timezone falls back to Asia/Kolkata', resolveTimezone('Mars/Olympus') === 'Asia/Kolkata');
    check(
      'wall-clock time follows the timezone',
      nowInTimezone('Asia/Kolkata', new Date('2026-10-02T20:00:00Z')).date === '2026-10-03',
    );
  }

  await cleanup();

  console.log(`\n${'='.repeat(62)}`);
  console.log(`Service tests: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nVerification crashed:', error);
  process.exit(1);
});
