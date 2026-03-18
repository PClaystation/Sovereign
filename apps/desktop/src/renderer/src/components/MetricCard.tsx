import type { MetricStatus } from '@shared/models';

interface MetricCardProps {
  title: string;
  value: string;
  detail: string;
  insight: string;
  action: string;
  usagePercent: number;
  status: MetricStatus;
}

export const MetricCard = ({
  title,
  value,
  detail,
  insight,
  action,
  usagePercent,
  status
}: MetricCardProps) => (
  <article className={`panel metric-card status-${status}`}>
    <div className="metric-header">
      <div>
        <p className="section-kicker">{title}</p>
        <h2 className="metric-value">{value}</h2>
      </div>
      <span className={`status-pill status-${status}`}>{status}</span>
    </div>

    <p className="metric-detail">{detail}</p>
    <p className="metric-insight">{insight}</p>

    <div
      className="meter"
      aria-hidden="true"
    >
      <div
        className="meter-fill"
        style={{ width: `${Math.min(Math.max(usagePercent, 0), 100)}%` }}
      />
    </div>

    <p className="metric-action">{action}</p>
  </article>
);
