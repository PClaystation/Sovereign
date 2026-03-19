import type { MetricStatus } from '@shared/models';

import type { PostureHighlight } from '../utils/controlCenter';

interface PostureOverviewPanelProps {
  score: number;
  status: MetricStatus;
  headline: string;
  summary: string;
  dominantPressure: string;
  readiness: string;
  coverage: string;
  highlights: PostureHighlight[];
  recommendedActions: string[];
}

export const PostureOverviewPanel = ({
  score,
  status,
  headline,
  summary,
  dominantPressure,
  readiness,
  coverage,
  highlights,
  recommendedActions
}: PostureOverviewPanelProps) => (
  <section className="panel posture-panel">
    <div className="panel-heading">
      <div>
        <p className="section-kicker">Operational posture</p>
        <h2>{headline}</h2>
      </div>
      <span className={`status-pill status-${status}`}>{status}</span>
    </div>

    <div className="posture-score-row">
      <div className="posture-score-block">
        <div
          className="posture-ring"
          style={{ ['--score' as string]: `${score}%` }}
          aria-hidden="true"
        >
          <div>
            <strong>{score}</strong>
            <span>score</span>
          </div>
        </div>
      </div>

      <div className="posture-copy">
        <p>{summary}</p>
        <div className="posture-badges">
          <span className="detail-chip">{dominantPressure}</span>
          <span className="detail-chip">{coverage}</span>
          <span className="detail-chip">{readiness}</span>
        </div>
      </div>
    </div>

    <div className="posture-highlight-grid">
      {highlights.map((highlight) => (
        <article
          key={highlight.label}
          className="posture-highlight-card"
        >
          <p className="detail-label">{highlight.label}</p>
          <h3>{highlight.value}</h3>
          <p>{highlight.detail}</p>
        </article>
      ))}
    </div>

    <ul className="action-list posture-actions">
      {recommendedActions.map((action) => (
        <li key={action}>{action}</li>
      ))}
    </ul>
  </section>
);
