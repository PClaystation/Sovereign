import type {
  StartupBackupSummary,
  StartupItem,
  SystemMetricsSnapshot
} from '@shared/models';

interface StartupItemsPanelProps {
  items: StartupItem[];
  backups: StartupBackupSummary[];
  searchValue: string;
  isLoading: boolean;
  actionsDisabled: boolean;
  platform: SystemMetricsSnapshot['platform'] | null;
  onSearchChange: (value: string) => void;
  onDisable: (item: StartupItem) => void;
  onRestore: (backup: StartupBackupSummary) => void;
}

export const StartupItemsPanel = ({
  items,
  backups,
  searchValue,
  isLoading,
  actionsDisabled,
  platform,
  onSearchChange,
  onDisable,
  onRestore
}: StartupItemsPanelProps) => {
  const isMacos = platform === 'macos';

  return (
    <section className="panel fixer-panel">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Repair tool</p>
          <h2>{isMacos ? 'Launch items' : 'Startup items'}</h2>
        </div>
        <p className="panel-meta">Disable or restore items.</p>
      </div>

      <input
        type="search"
        className="form-input"
        value={searchValue}
        placeholder={isMacos ? 'Filter launch items' : 'Filter startup items'}
        onChange={(event) => onSearchChange(event.target.value)}
      />

      {isLoading && items.length === 0 && backups.length === 0 ? (
        <div className="fixer-empty">
          {isMacos ? 'Loading launch items.' : 'Loading startup items.'}
        </div>
      ) : items.length > 0 || backups.length > 0 ? (
        <div className="fixer-content">
          {items.length > 0 ? (
            <div className="inventory-list">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="inventory-row"
                >
                  <div>
                    <p className="inventory-title">{item.name}</p>
                    <p className="inventory-copy">
                      {item.location}
                      {item.user ? ` · ${item.user}` : ''}
                    </p>
                    <p className="inventory-copy">{item.command || 'Command unavailable'}</p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => onDisable(item)}
                    disabled={actionsDisabled || !item.canDisable}
                    title={item.actionSupportReason || 'Disable startup item'}
                  >
                    Disable
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {backups.length > 0 ? (
            <div className="detail-section">
              <p className="detail-label">Restorable backups</p>
              <div className="inventory-list">
                {backups.map((backup) => (
                  <div
                    key={backup.id}
                    className="inventory-row"
                  >
                    <div>
                      <p className="inventory-title">{backup.name}</p>
                      <p className="inventory-copy">
                        {backup.location} · Disabled {backup.disabledAt}
                      </p>
                      <p className="inventory-copy">{backup.command || 'Command unavailable'}</p>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onRestore(backup)}
                      disabled={actionsDisabled || !backup.canRestore}
                      title={backup.restoreSupportReason || 'Restore startup item'}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="fixer-empty">
          {platform === 'windows'
            ? 'No startup items match the current filter.'
            : platform === 'macos'
              ? 'No launch items match the current filter.'
              : 'Startup item control is unavailable on this platform.'}
        </div>
      )}
    </section>
  );
};
