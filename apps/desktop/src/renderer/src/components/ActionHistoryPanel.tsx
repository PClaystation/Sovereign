import type { FixActionResult } from '@shared/models';

import { formatRelativeTime } from '../utils/formatters';

interface ActionHistoryPanelProps {
  history: FixActionResult[];
  isLoading: boolean;
  title?: string;
  description?: string;
  emptyMessage?: string;
}

export const ActionHistoryPanel = ({
  history,
  isLoading,
  title = 'Recent action history',
  description = 'Recent repair results.',
  emptyMessage = 'No actions yet.'
}: ActionHistoryPanelProps) => (
  <section className="panel action-history-panel">
    <div className="panel-heading">
      <div>
        <p className="section-kicker">Action history</p>
        <h2>{title}</h2>
      </div>
      <p className="panel-meta">{description}</p>
    </div>

    {isLoading && history.length === 0 ? (
      <p className="state-block">Loading actions.</p>
    ) : history.length === 0 ? (
      <p className="state-block">{emptyMessage}</p>
    ) : (
      <div className="action-history-list">
        {history.map((result) => (
          <article
            key={result.actionId}
            className={`action-history-item ${result.success ? 'success' : 'failure'}`}
          >
            <div className="action-history-header">
              <div>
                <h3>{result.summary}</h3>
                <p>{formatRelativeTime(result.timestamp)}</p>
              </div>
              <span className={`result-pill ${result.success ? 'success' : 'failure'}`}>
                {result.success ? 'Success' : 'Needs review'}
              </span>
            </div>
            <ul className="detail-list action-history-details">
              {result.details.slice(0, 3).map((detail) => (
                <li key={`${result.actionId}-${detail}`}>{detail}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    )}
  </section>
);
