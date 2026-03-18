import type { WatchdogCategory, WatchdogSeverity } from '@shared/models';

interface EventFiltersProps {
  severityFilter: 'all' | WatchdogSeverity;
  categoryFilter: 'all' | WatchdogCategory;
  onSeverityChange: (value: 'all' | WatchdogSeverity) => void;
  onCategoryChange: (value: 'all' | WatchdogCategory) => void;
}

const SEVERITY_OPTIONS: Array<{ value: 'all' | WatchdogSeverity; label: string }> = [
  { value: 'all', label: 'All severities' },
  { value: 'info', label: 'Info' },
  { value: 'unusual', label: 'Unusual' },
  { value: 'suspicious', label: 'Suspicious' }
];

const CATEGORY_OPTIONS: Array<{ value: 'all' | WatchdogCategory; label: string }> = [
  { value: 'all', label: 'All categories' },
  { value: 'process', label: 'Process' },
  { value: 'security', label: 'Security' },
  { value: 'system', label: 'System' },
  { value: 'application', label: 'Application' }
];

export const EventFilters = ({
  severityFilter,
  categoryFilter,
  onSeverityChange,
  onCategoryChange
}: EventFiltersProps) => (
  <div className="filter-strip">
    <div className="filter-group">
      {SEVERITY_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`filter-button ${
            severityFilter === option.value ? 'selected' : ''
          }`}
          onClick={() => onSeverityChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>

    <div className="filter-group">
      {CATEGORY_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`filter-button ${
            categoryFilter === option.value ? 'selected' : ''
          }`}
          onClick={() => onCategoryChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);
