import { Check, Sword, Swords } from 'lucide-react'

export default function CompareControls({ enabled, onToggle, username, onUsernameChange }) {
  return (
    <div className={`compare-controls ${enabled ? 'enabled' : ''}`}>
      <button
        className="compare-toggle"
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onToggle(!enabled)}
      >
        <span><Swords size={16} /> Scout a rival</span>
        <i aria-hidden="true"><b /></i>
      </button>

      {enabled && (
        <div className="compare-input-block">
          <label>
            <span>Opposition player <b>Required</b></span>
            <div className="input-frame">
              <span className="platform-dot compare-dot" aria-hidden="true">2</span>
              <input
                required
                value={username}
                onChange={(event) => onUsernameChange(event.target.value)}
                placeholder="Enter the rival's handle"
                autoComplete="off"
                spellCheck="false"
              />
              {username && <Check size={18} aria-hidden="true" />}
            </div>
          </label>
          <button className="quick-fill" type="button" onClick={() => onUsernameChange('magnuscarlsen')}>
            <Sword size={13} /> Set Magnus as the rival
          </button>
        </div>
      )}
    </div>
  )
}
