import { useEffect, useState } from 'react';
import { Send, Search, Clock, Users, Monitor, Utensils, Music } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { EventCard } from '@/components/events/EventCard';
import type { EventRecord } from '@/lib/types';

export default function AskTheBoard() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ events: EventRecord[]; intent: any; reasons?: Record<string, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    document.title = 'Ask the Board — Radius';
  }, []);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setResults(null);
    
    try {
      const aiResponse = await api.aiSearch(query);
      const intent = aiResponse.intent;
      
      const eventsResponse = await api.listEventsAs({
        category: intent.category as any,
        neighborhood: intent.neighborhood || undefined,
        city: intent.city || undefined,
        date: intent.dateFilter as any,
      }, !!user);
      
      let finalEvents = eventsResponse.items;
      let aiReasons: Record<string, string> = {};
      
      if (aiResponse.rankedEvents && aiResponse.rankedEvents.length > 0) {
        // Map reasons
        aiResponse.rankedEvents.forEach(r => { aiReasons[r.eventId] = r.reason; });
        // Filter and sort events based on the AI ranking
        const rankedIds = aiResponse.rankedEvents.map(r => r.eventId);
        finalEvents = eventsResponse.items
          .filter(e => rankedIds.includes(e.id))
          .sort((a, b) => rankedIds.indexOf(a.id) - rankedIds.indexOf(b.id));
      } else {
        // Fallback to strict keyword matching on frontend
        const search = intent.keywords?.toLowerCase() || '';
        if (search) {
          finalEvents = finalEvents.filter(e => 
            e.title.toLowerCase().includes(search) || 
            e.description.toLowerCase().includes(search) ||
            e.category.toLowerCase().includes(search)
          );
        }
      }
      
      setResults({
        events: finalEvents,
        intent,
        reasons: aiReasons
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong while asking the board.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg relative flex flex-col items-center pt-24 pb-16">
      <div className="container-page max-w-4xl relative z-10 w-full flex flex-col items-start px-4">
        
        <div className="flex items-center gap-4 mb-4">
          <Search className="w-8 h-8 text-brand" />
          <h1 className="text-4xl font-display font-bold text-white">
            Ask the Board
          </h1>
        </div>
        
        <p className="text-ink-muted text-lg mb-8">
          Ask in plain English — "free events this weekend for my parents" — and get smart results.
        </p>

        <form onSubmit={handleAsk} className="w-full relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="any yoga ?"
            className="w-full bg-surface-raised border border-border rounded-full py-4 pl-6 pr-32 text-white shadow-lg focus:outline-none focus:border-brand/50 transition-colors text-lg"
            disabled={searching}
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="absolute right-2 top-2 bottom-2 px-6 flex items-center justify-center gap-2 rounded-full bg-brand text-brand-ink font-semibold shadow hover:bg-brand-hover transition-colors disabled:opacity-50"
          >
            {searching ? (
              <span className="w-4 h-4 border-2 border-brand-ink/30 border-t-brand-ink rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Ask
          </button>
        </form>

        {!results && (
          <div className="mt-6 flex flex-wrap gap-3">
            {[
              { icon: Clock, label: "Free this weekend" },
              { icon: Users, label: "Family outdoor" },
              { icon: Monitor, label: "Tech meetups" },
              { icon: Utensils, label: "Food events" },
              { icon: Music, label: "Live music" }
            ].map(({ icon: Icon, label }) => (
              <button
                key={label}
                type="button"
                onClick={() => setQuery(label)}
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-surface-sunken hover:bg-surface-raised text-ink-muted hover:text-ink transition-colors text-sm"
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="w-full mt-6 bg-danger-soft text-danger-ink border border-danger-ink/20 rounded-xl p-4">
            {error}
          </div>
        )}

        {/* Results State */}
        {results && (
          <div className="w-full mt-10 flex flex-col gap-8">
            {results.events.length > 0 ? (
              <>
                <div className="w-full border border-border rounded-xl p-6 bg-surface-sunken text-white text-lg leading-relaxed shadow-sm">
                  {results.events.length === 1 
                    ? results.reasons?.[results.events[0].id] || `Yes! I found an event that perfectly matches your request.`
                    : `I found ${results.events.length} events for you. ${results.reasons?.[results.events[0].id] || ''}`}
                </div>
                
                <div className="grid gap-6 sm:grid-cols-1 max-w-2xl">
                  {results.events.map(event => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </>
            ) : (
              <div className="w-full border border-border rounded-xl p-6 bg-surface-sunken text-ink-muted text-lg text-center shadow-sm flex flex-col items-center py-12">
                <Search className="w-10 h-10 text-brand mb-3 opacity-50" />
                <p>I couldn't find any events that perfectly match your request right now.</p>
                <p className="text-sm mt-2">Try adjusting your search terms or exploring the main board!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
