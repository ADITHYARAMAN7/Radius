import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { PageSkeleton } from '@/components/common/States';
import Home from '@/pages/Home';
import Explore from '@/pages/Explore';
import EventDetails from '@/pages/EventDetails';

/**
 * Home, Explore and Event details are in the main bundle because they are the entry
 * points — including a shared link, which must open fast.
 *
 * Everything else is split out. The create/edit form, the charts and the auth screens are
 * the heaviest parts of the app and most visitors never reach them.
 */
const CreateEvent = lazy(() => import('@/pages/CreateEvent'));
const EditEvent = lazy(() => import('@/pages/EditEvent'));
const MyEvents = lazy(() => import('@/pages/MyEvents'));
const MyRsvps = lazy(() => import('@/pages/MyRsvps'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const Profile = lazy(() => import('@/pages/Profile'));
const Pulse = lazy(() => import('@/pages/Pulse'));
const Community = lazy(() => import('@/pages/Community'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const AskTheBoard = lazy(() => import('@/pages/AskTheBoard'));

function Deferred({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Explore />} />
        <Route path="explore" element={<Explore />} />

        {/* The shareable permalink. Public — no account needed to open a shared link. */}
        <Route path="events/:id" element={<EventDetails />} />

        <Route
          path="events/new"
          element={
            <Deferred>
              <ProtectedRoute>
                <CreateEvent />
              </ProtectedRoute>
            </Deferred>
          }
        />

        <Route
          path="events/:id/edit"
          element={
            <Deferred>
              <ProtectedRoute>
                <EditEvent />
              </ProtectedRoute>
            </Deferred>
          }
        />

        <Route
          path="my-events"
          element={
            <Deferred>
              <ProtectedRoute>
                <MyEvents />
              </ProtectedRoute>
            </Deferred>
          }
        />

        <Route
          path="my-rsvps"
          element={
            <Deferred>
              <ProtectedRoute>
                <MyRsvps />
              </ProtectedRoute>
            </Deferred>
          }
        />

        <Route
          path="profile"
          element={
            <Deferred>
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            </Deferred>
          }
        />

        <Route
          path="login"
          element={
            <Deferred>
              <Login />
            </Deferred>
          }
        />

        <Route
          path="register"
          element={
            <Deferred>
              <Register />
            </Deferred>
          }
        />

        <Route
          path="pulse"
          element={
            <Deferred>
              <Pulse />
            </Deferred>
          }
        />

        <Route
          path="ask"
          element={
            <Deferred>
              <ProtectedRoute>
                <AskTheBoard />
              </ProtectedRoute>
            </Deferred>
          }
        />

        <Route
          path="community"
          element={
            <Deferred>
              <Community />
            </Deferred>
          }
        />

        <Route
          path="*"
          element={
            <Deferred>
              <NotFound />
            </Deferred>
          }
        />
      </Route>
    </Routes>
  );
}
