import React from 'react'

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env.DEV) console.error('Rookster render failure', error, errorInfo)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="fatal-error-page">
        <section>
          <span className="rookster-logo" aria-hidden="true" />
          <p>SCOUTING DESK INTERRUPTED</p>
          <h1>The report hit an unexpected stoppage.</h1>
          <span>Reload the page to restart the scouting session, or return to the team sheet.</span>
          <div>
            <button type="button" onClick={() => window.location.reload()}>Reload report</button>
            <a href="/">Return home</a>
          </div>
        </section>
      </main>
    )
  }
}
