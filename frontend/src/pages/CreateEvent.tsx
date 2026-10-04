import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { EventForm } from '@/components/events/EventForm';

export default function CreateEvent() {
  useEffect(() => {
    document.title = 'Create an event — Radius';
  }, []);

  return (
    <div className="min-h-screen pt-24 pb-16 bg-bg relative overflow-hidden">
      {/* Decorative background blurs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[-10%] w-[30%] h-[30%] bg-accent/10 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="container-page max-w-3xl relative z-10">
        <header className="mb-10 text-center">
          <h1 className="text-display-lg bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">Post a New Event</h1>
          <p className="mt-3 text-sm text-ink-soft sm:text-base">
            Create an event and share it with the community instantly.
          </p>
        </header>

        <div className="bg-surface/60 border border-border backdrop-blur-xl rounded-[2rem] p-6 sm:p-10 shadow-xl">
          <EventForm mode="create" />
        </div>
      </div>
    </div>
  );
}
