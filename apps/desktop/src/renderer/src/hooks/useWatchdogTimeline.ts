import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from 'react';

import type {
  AppSettings,
  WatchdogCategory,
  WatchdogEvent,
  WatchdogSeverity,
  WatchdogSourceId,
  WatchdogSuppressionRule
} from '@shared/models';
import { DEFAULT_APP_SETTINGS } from '@shared/models';

import { findMatchingSuppression } from '../utils/watchdog';

const getErrorMessage = (cause: unknown, fallbackMessage: string): string =>
  cause instanceof Error ? cause.message : fallbackMessage;

interface UseWatchdogTimelineArgs {
  settings: AppSettings | null;
  onError: (message: string) => void;
  onClearError: () => void;
}

export const useWatchdogTimeline = ({
  settings,
  onError,
  onClearError
}: UseWatchdogTimelineArgs) => {
  const [events, setEvents] = useState<WatchdogEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<'all' | WatchdogSeverity>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | WatchdogCategory>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | WatchdogSourceId>('all');
  const [eventSearch, setEventSearch] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const deferredEventSearch = useDeferredValue(eventSearch.trim().toLowerCase());
  const latestRequestId = useRef(0);
  const pendingRefreshTimer = useRef<number | null>(null);

  const loadEvents = async (): Promise<void> => {
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;
    setIsLoading(true);

    try {
      const nextEvents = await window.sovereign.listRecentEvents({
        limit: settings?.timelineEventLimit ?? DEFAULT_APP_SETTINGS.timelineEventLimit,
        severities: severityFilter === 'all' ? undefined : [severityFilter],
        categories: categoryFilter === 'all' ? undefined : [categoryFilter],
        sources: sourceFilter === 'all' ? undefined : [sourceFilter],
        searchText: deferredEventSearch || undefined
      });

      if (requestId !== latestRequestId.current) {
        return;
      }

      startTransition(() => {
        onClearError();
        setEvents(nextEvents);
        setSelectedEventId((currentSelection) =>
          nextEvents.some((event) => event.id === currentSelection)
            ? currentSelection
            : nextEvents[0]?.id || null
        );
      });
    } catch (cause) {
      if (requestId !== latestRequestId.current) {
        return;
      }

      onError(getErrorMessage(cause, 'Unable to refresh the watchdog timeline.'));
    } finally {
      if (requestId === latestRequestId.current) {
        setIsLoading(false);
      }
    }
  };

  const refreshEvents = useEffectEvent(() => {
    void loadEvents();
  });

  useEffect(() => {
    refreshEvents();
  }, [
    severityFilter,
    categoryFilter,
    sourceFilter,
    deferredEventSearch,
    settings?.timelineEventLimit
  ]);

  useEffect(() => {
    const unsubscribe = window.sovereign.onEventsUpdated(() => {
      if (pendingRefreshTimer.current) {
        window.clearTimeout(pendingRefreshTimer.current);
      }

      pendingRefreshTimer.current = window.setTimeout(() => {
        pendingRefreshTimer.current = null;
        refreshEvents();
      }, 200);
    });

    return () => {
      if (pendingRefreshTimer.current) {
        window.clearTimeout(pendingRefreshTimer.current);
        pendingRefreshTimer.current = null;
      }

      unsubscribe();
    };
  }, []);

  const suppressions: WatchdogSuppressionRule[] = settings?.watchdog.suppressions || [];
  const visibleEvents = settings?.watchdog.showSuppressedEvents
    ? events
    : events.filter((event) => !findMatchingSuppression(event, suppressions));
  const hiddenSuppressedCount = events.length - visibleEvents.length;
  const selectedEvent =
    visibleEvents.find((event) => event.id === selectedEventId) ?? visibleEvents[0] ?? null;
  const selectedEventSuppression = selectedEvent
    ? findMatchingSuppression(selectedEvent, suppressions)
    : null;

  return {
    events,
    visibleEvents,
    hiddenSuppressedCount,
    selectedEvent,
    selectedEventSuppression,
    isLoading,
    severityFilter,
    setSeverityFilter,
    categoryFilter,
    setCategoryFilter,
    sourceFilter,
    setSourceFilter,
    eventSearch,
    setEventSearch,
    selectedEventId,
    setSelectedEventId,
    loadEvents
  };
};
