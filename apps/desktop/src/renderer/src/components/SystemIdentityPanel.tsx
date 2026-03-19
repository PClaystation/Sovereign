import type { SystemMetricsSnapshot } from '@shared/models';

import {
  formatBytes,
  formatClock,
  formatRelativeTime
} from '../utils/formatters';

interface SystemIdentityPanelProps {
  snapshot: SystemMetricsSnapshot | null;
  platformLabel: string;
}

export const SystemIdentityPanel = ({
  snapshot,
  platformLabel
}: SystemIdentityPanelProps) => {
  if (!snapshot) {
    return (
      <section className="panel identity-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">System profile</p>
            <h2>Hardware and OS context</h2>
          </div>
        </div>
        <p className="state-block">Waiting for the first machine profile sample.</p>
      </section>
    );
  }

  const cards = [
    {
      label: 'Device',
      value: snapshot.identity.deviceName,
      detail: platformLabel
    },
    {
      label: 'Operating system',
      value: snapshot.identity.osName,
      detail: snapshot.identity.osVersion
    },
    {
      label: 'Kernel and arch',
      value: snapshot.identity.kernelVersion,
      detail: snapshot.identity.architecture
    },
    {
      label: 'Processor',
      value: snapshot.identity.cpuModel,
      detail: `${snapshot.cpu.coreCount} logical cores`
    },
    {
      label: 'Installed memory',
      value: formatBytes(snapshot.identity.totalMemoryBytes),
      detail: `${formatBytes(snapshot.memory.availableBytes)} currently available`
    },
    {
      label: 'Last boot',
      value: formatRelativeTime(snapshot.identity.bootedAt),
      detail: snapshot.identity.bootedAt
        ? `Booted at ${formatClock(snapshot.identity.bootedAt)}`
        : 'Boot time unavailable'
    }
  ];

  return (
    <section className="panel identity-panel">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">System profile</p>
          <h2>Hardware and OS context</h2>
        </div>
        <p className="panel-meta">
          Static machine context alongside the live snapshot.
        </p>
      </div>

      <div className="identity-grid">
        {cards.map((card) => (
          <article
            key={card.label}
            className="identity-card"
          >
            <p className="detail-label">{card.label}</p>
            <h3>{card.value}</h3>
            <p>{card.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
};
