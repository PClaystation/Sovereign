import type { ProcessInfo } from '@shared/models';

import {
  formatBytes,
  formatPercentage,
  formatRelativeTime
} from '../utils/formatters';

interface ProcessesTableProps {
  processes: ProcessInfo[];
}

export const ProcessesTable = ({ processes }: ProcessesTableProps) => (
  <section className="panel table-panel">
    <div className="panel-heading">
      <div>
        <p className="section-kicker">Top processes</p>
        <h2>Current resource pressure</h2>
      </div>
      <p className="panel-meta">Ranked by CPU first, then resident memory.</p>
    </div>

    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Process</th>
            <th>PID</th>
            <th>CPU</th>
            <th>Memory</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          {processes.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="empty-cell"
              >
                Waiting for live process data.
              </td>
            </tr>
          ) : (
            processes.map((process) => (
              <tr key={`${process.pid}-${process.name}`}>
                <td>
                  <div className="process-name">
                    <span>{process.name}</span>
                    <span className="process-path">{process.path || 'Path unavailable'}</span>
                  </div>
                </td>
                <td className="numeric-cell">{process.pid}</td>
                <td className="numeric-cell">{formatPercentage(process.cpuPercent)}</td>
                <td className="numeric-cell">
                  {formatBytes(process.memoryBytes)} · {formatPercentage(process.memoryPercent)}
                </td>
                <td className="numeric-cell">{formatRelativeTime(process.startedAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </section>
);
