const AXIS_ANGLES = [-90, -30, 30, 90, 150, 210]

function getRadarPoints(attributes) {
  return attributes.map((attribute, index) => {
    const normalized = Math.max(0, Math.min(1, (attribute.value - 40) / 55))
    const radius = 12 + (normalized * 31)
    const angle = (AXIS_ANGLES[index] * Math.PI) / 180
    const x = 50 + (Math.cos(angle) * radius)
    const y = 50 + (Math.sin(angle) * radius)
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`
  }).join(', ')
}

export default function ScoutingRadar({ attributes, username }) {
  const description = attributes.map(({ label, value }) => `${label} ${value}`).join(', ')

  return (
    <div
      className="scouting-radar"
      role="img"
      aria-label={`${username} attribute radar: ${description}`}
    >
      <div className="radar-grid radar-grid-outer" />
      <div className="radar-grid radar-grid-middle" />
      <div className="radar-grid radar-grid-inner" />
      <div className="radar-axis radar-axis-one" />
      <div className="radar-axis radar-axis-two" />
      <div className="radar-axis radar-axis-three" />
      <div className="radar-shape" style={{ clipPath: `polygon(${getRadarPoints(attributes)})` }} />
      {attributes.map(({ label, value }, index) => (
        <span className={`radar-label radar-label-${index + 1}`} key={label}>
          {label}<b>{value}</b>
        </span>
      ))}
    </div>
  )
}
