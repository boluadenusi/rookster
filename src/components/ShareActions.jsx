import { useState } from 'react'
import { Check, Copy, Download, LoaderCircle } from 'lucide-react'
import { CARD_EXPORTS } from '../utils/cardExport.js'

export default function ShareActions({
  username,
  compareUsername,
  onDownload,
  isDownloading,
  canDownload,
  showExport = true,
}) {
  const [copied, setCopied] = useState(false)
  const [exportMode, setExportMode] = useState('plain')

  async function copyLink() {
    const path = `/${encodeURIComponent(username)}`
    const query = compareUsername ? `?compare=${encodeURIComponent(compareUsername)}` : ''
    const url = `${window.location.origin}${path}${query}`

    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const input = document.createElement('textarea')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }

    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section className={`download-panel ${showExport ? '' : 'share-only'}`}>
      <div className="download-icon">
        {showExport ? <Download size={23} /> : <Copy size={22} />}
      </div>
      <div>
        <h2>{showExport ? 'Take it to the team chat' : 'Share the matchup report'}</h2>
        <p>{showExport ? 'Export the player card or share the live scouting file.' : 'Copy a live link to both player files.'}</p>
      </div>
      <div className="share-buttons">
        <button type="button" className="copy-button" onClick={copyLink}>
          {copied ? <Check size={17} /> : <Copy size={17} />}
          {copied ? 'Report copied' : 'Copy report link'}
        </button>
        {showExport && (
          <div className="export-actions">
            <label className="export-format">
              <span className="sr-only">Player card layout</span>
              <select
                value={exportMode}
                onChange={(event) => setExportMode(event.target.value)}
                disabled={isDownloading || !canDownload}
                aria-label="Player card layout"
              >
                {Object.entries(CARD_EXPORTS).map(([value, option]) => (
                  <option value={value} key={value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="download-button"
              onClick={() => onDownload(exportMode)}
              disabled={isDownloading || !canDownload}
            >
              {isDownloading ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />}
              {isDownloading ? 'Exporting...' : canDownload ? CARD_EXPORTS[exportMode].buttonLabel : 'Open player pack'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
