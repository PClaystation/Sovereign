import type {
  WatchdogCategory,
  WatchdogSeverity,
  WatchdogSourceId
} from '@shared/models';

interface EventFiltersProps {
  severityFilter: 'all' | WatchdogSeverity;
  categoryFilter: 'all' | WatchdogCategory;
  sourceFilter: 'all' | WatchdogSourceId;
  searchValue: string;
  onSeverityChange: (value: 'all' | WatchdogSeverity) => void;
  onCategoryChange: (value: 'all' | WatchdogCategory) => void;
  onSourceChange: (value: 'all' | WatchdogSourceId) => void;
  onSearchChange: (value: string) => void;
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

const SOURCE_OPTIONS: Array<{ value: 'all' | WatchdogSourceId; label: string }> = [
  { value: 'all', label: 'All feeds' },
  { value: 'process-launch', label: 'Process launches' },
  { value: 'startup-items', label: 'Startup items' },
  { value: 'scheduled-tasks', label: 'Scheduled tasks' },
  { value: 'defender-status', label: 'Defender' },
  { value: 'firewall-status', label: 'Firewall' }
];

export const EventFilters = ({
  severityFilter,
  categoryFilter,
  sourceFilter,
  searchValue,
  onSeverityChange,
  onCategoryChange,
  onSourceChange,
  onSearchChange
}: EventFiltersProps) => (
  <div className="filter-shell">
    <input
      type="search"
      className="form-input"
      value={searchValue}
      placeholder="Search titles, evidence, actions, or source"
      onChange={(event) => onSearchChange(event.target.value)}
    />

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

      <div className="filter-group">
        {SOURCE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`filter-button ${sourceFilter === option.value ? 'selected' : ''}`}
            onClick={() => onSourceChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);
