import type { DataMode } from '../data/types';
import { headerStatus, type ServiceStatus } from '../lib/status';
import { IconRefresh } from './Icons';

interface Props {
  dataMode: DataMode;
  serviceStatus: ServiceStatus;
  layerOn: boolean;
  onRetry: () => void;
}

export default function Header({ dataMode, serviceStatus, layerOn, onRetry }: Props) {
  const st = headerStatus(dataMode, serviceStatus, layerOn);
  return (
    <header className="header">
      <div className="brand">
        <h1>Project Odyssey</h1>
        <span className="subtitle">Pre-mission planning</span>
      </div>
      <div className="header-right">
        <span className={`data-status ${st.tone}`} role="status" aria-live="polite">
          <span className="status-dot" aria-hidden="true" />
          {st.text}
        </span>
        {st.tone === 'error' && (
          <button className="btn-text on-dark" onClick={onRetry}>
            <IconRefresh /> Retry
          </button>
        )}
      </div>
    </header>
  );
}
