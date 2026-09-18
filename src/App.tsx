import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react'
import { PolarEmbedCheckout } from '@polar-sh/checkout/embed'
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Flame,
  Gauge,
  Search,
  Settings,
  Sparkles,
  Star,
  TrendingUp,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import './App.css'

// Polar pay-what-you-want checkout link.
// Create a "pay what you want" product in the Polar dashboard, attach the
// notarized .dmg as a downloadable benefit, generate a Checkout Link, paste here.
const POLAR_CHECKOUT_URL = 'https://buy.polar.sh/polar_cl_LqRTIQr3ZHy4GLeodnuiSjD61ukYadR646MiS3wbNIn'
const LATEST_RELEASE_URL = 'https://github.com/rachel-nocode/maxxtoken/releases/latest'
const PRODUCT_GUIDE_URL = 'https://github.com/rachel-nocode/homebrew-maxxtoken/blob/main/docs/product-guide.md'
const PROVIDERS_URL = 'https://github.com/rachel-nocode/homebrew-maxxtoken/blob/main/docs/providers.md'

// Mac checkout buttons route through Polar; Windows and release-history links
// go to the public GitHub release assets.
async function startDownload(event: MouseEvent) {
  event.preventDefault()
  try {
    await PolarEmbedCheckout.create(POLAR_CHECKOUT_URL, { theme: 'dark' })
  } catch {
    window.open(POLAR_CHECKOUT_URL, '_blank', 'noopener')
  }
}

type Provider = {
  id: string
  name: string
  plan: string
  monthly: number
  baseUsedPct: number
  drain: number
  countdown: string
  accent: string
  icon: LucideIcon
  windows: {
    label: string
    kind: string
    usedPct: number
    reset: string
  }[]
}

const providers: Provider[] = [
  {
    id: 'claude',
    name: 'Claude',
    plan: 'Max 20x',
    monthly: 200,
    baseUsedPct: 2,
    drain: 0.35,
    countdown: '08h 57m 36s',
    accent: '#ff7d4d',
    icon: Sparkles,
    windows: [
      { label: 'Session', kind: '5-hour window', usedPct: 2, reset: '03h 17m 35s' },
      { label: 'Weekly', kind: '7-day window', usedPct: 1, reset: '08h 57m 36s' },
      { label: 'Sonnet', kind: '7-day window', usedPct: 0, reset: 'resets —' },
    ],
  },
  {
    id: 'codex',
    name: 'ChatGPT / Codex',
    plan: 'Pro Plan',
    monthly: 30,
    baseUsedPct: 0,
    drain: 0.5,
    countdown: '02h 56m 13s',
    accent: '#e6e6e6',
    icon: Box,
    windows: [
      { label: 'Session', kind: '5-hour window', usedPct: 0, reset: '02h 56m 13s' },
      { label: 'Weekly', kind: '7-day window', usedPct: 0, reset: '2d 05h 37m' },
    ],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    plan: 'Ultra',
    monthly: 200,
    baseUsedPct: 20,
    drain: 0.28,
    countdown: '1d 09h 37m',
    accent: '#cfd2d6',
    icon: Box,
    windows: [
      { label: 'Session', kind: '5-hour window', usedPct: 8, reset: '01h 14m 08s' },
      { label: 'Weekly', kind: '7-day window', usedPct: 20, reset: '1d 09h 37m' },
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    plan: 'Advanced',
    monthly: 84,
    baseUsedPct: 12,
    drain: 0.32,
    countdown: '16d left',
    accent: '#4f8cff',
    icon: Sparkles,
    windows: [
      { label: 'Cycle', kind: 'month window', usedPct: 12, reset: '16d 02h' },
    ],
  },
]

const stackTools = [
  { name: 'Claude', tag: 'Auto', icon: Sparkles, accent: '#ff7d4d' },
  { name: 'ChatGPT / Codex', tag: 'Auto', icon: Box, accent: '#e6e6e6' },
  { name: 'Cursor', tag: 'App', icon: Box, accent: '#cfd2d6' },
  { name: 'Copilot', tag: 'Auto', icon: Box, accent: '#19c37d' },
  { name: 'Gemini', tag: 'Local', icon: Sparkles, accent: '#4f8cff' },
  { name: 'OpenRouter', tag: 'API', icon: Sparkles, accent: '#4cc3c9' },
]

function money(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function moneyExact(value: number) {
  return `$${value.toFixed(2)}`
}

function clampPct(value: number) {
  return Math.max(0, Math.min(98, value))
}

function App() {
  const [activeProvider, setActiveProvider] = useState('Claude')
  const [spendTick, setSpendTick] = useState(0)
  const [demoOpen, setDemoOpen] = useState(true)
  const [now, setNow] = useState(() => new Date())
  const [demoRight, setDemoRight] = useState<number | null>(null)

  const heroRef = useRef<HTMLElement>(null)
  const pillRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setSpendTick((tick) => tick + 1), 1200)
    return () => window.clearInterval(timer)
  }, [])

  // Live menu-bar clock.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10000)
    return () => window.clearInterval(timer)
  }, [])

  // Anchor the demo popover so its right edge lines up under the tray pill.
  // Re-runs on resize and whenever the clock changes (which shifts the pill).
  useLayoutEffect(() => {
    const align = () => {
      const hero = heroRef.current
      const pill = pillRef.current
      if (!hero || !pill) return
      const offset = hero.getBoundingClientRect().right - pill.getBoundingClientRect().right
      setDemoRight(Math.max(0, offset))
    }
    align()
    const raf = window.requestAnimationFrame(align)
    const settle = window.setTimeout(align, 250)
    window.addEventListener('resize', align)
    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(settle)
      window.removeEventListener('resize', align)
    }
  }, [now])

  const clockLabel = `${now.toLocaleDateString('en-US', { weekday: 'short' })} ${now
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .replace(/\s/g, ' ')}`

  const spendStep = spendTick % 18
  const animatedProviders = useMemo(
    () =>
      providers.map((provider, index) => {
        const usedPct = clampPct(provider.baseUsedPct + spendStep * provider.drain)
        const spent = provider.monthly * (usedPct / 100)
        const left = provider.monthly - spent

        return {
          ...provider,
          active: provider.name === activeProvider,
          usedPct,
          leftPct: Math.round(100 - usedPct),
          spent,
          left,
          windows: provider.windows.map((window, windowIndex) => {
            const windowUsed = clampPct(
              window.usedPct + spendStep * provider.drain * (windowIndex === 0 ? 1.4 : 1),
            )

            return {
              ...window,
              usedPct: windowUsed,
              leftPct: Math.round(100 - windowUsed),
            }
          }),
          streamDelay: `${index * 140}ms`,
        }
      }),
    [activeProvider, spendStep],
  )

  const totals = useMemo(() => {
    const monthly = animatedProviders.reduce((sum, provider) => sum + provider.monthly, 0)
    const spent = animatedProviders.reduce((sum, provider) => sum + provider.spent, 0)
    const left = monthly - spent

    return {
      monthly,
      spent,
      left,
      leftPct: Math.round((left / monthly) * 100),
    }
  }, [animatedProviders])

  return (
    <div className="page" id="top">
      <nav className="os-menubar" aria-label="Main">
        <div className="osm-inner">
          <div className="osm-left">
            <a className="osm-brand" href="#top">
              <img src="/icon-1.png" alt="" />
              <span>MaxxToken</span>
            </a>
            <a className="osm-menu" href="#product">Demo</a>
            <a className="osm-menu" href="#how-it-works">How it works</a>
            <a className="osm-menu" href={PROVIDERS_URL}>Providers</a>
            <a className="osm-menu" href="https://x.com/rachelnocode">Contact</a>
          </div>
          <div className="osm-right">
            <Wifi className="osm-glyph" size={15} aria-hidden="true" />
            <Search className="osm-glyph" size={15} aria-hidden="true" />
            <span className="osm-clock">{clockLabel}</span>
            <a className="osm-download" href={POLAR_CHECKOUT_URL} onClick={startDownload}>
              Mac · Apple Silicon
            </a>
            <button
              type="button"
              ref={pillRef}
              className={`osm-tray maxx ${demoOpen ? 'is-open' : ''}`}
              onClick={() => setDemoOpen((open) => !open)}
              aria-expanded={demoOpen}
            >
              ⚡ {money(totals.left)} est. left
            </button>
          </div>
        </div>
      </nav>

      <section className="hero" ref={heroRef}>
        <div className="hero-copy">
          <span className="badge">
            <TrendingUp size={14} aria-hidden="true" />
            tokenmaxxing menu bar
          </span>
          <h1>
            You paid for the tokens. <span className="accent">Go spend them.</span>
          </h1>
          <p>
            See quota windows, resets, balances, local token history, and clearly labeled value estimates before they expire.
          </p>
          <p className="release-note">
            Current release v0.2.13: universal Mac for Apple Silicon and Intel, plus Windows x64.
          </p>
          <div className="hero-actions">
            <a className="btn-primary lg" href={POLAR_CHECKOUT_URL} onClick={startDownload}>
              Get Mac · Universal
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a className="btn-outline lg" href={LATEST_RELEASE_URL}>
              Windows x64
            </a>
          </div>
          <div className="hero-features">
            <div className="hero-feature">
              <Zap size={16} aria-hidden="true" />
              <div>
                <strong>Pay what you want</strong>
                <span>Mac checkout, one-time</span>
              </div>
            </div>
            <div className="hero-feature">
              <Gauge size={16} aria-hidden="true" />
              <div>
                <strong>Private by design</strong>
                <span>Usage processed locally</span>
              </div>
            </div>
            <div className="hero-feature">
              <TrendingUp size={16} aria-hidden="true" />
              <div>
                <strong>Reset forecasts</strong>
                <span>Estimates at your current pace</span>
              </div>
            </div>
          </div>
        </div>

        <div
          className="hero-demo"
          id="product"
          style={demoRight != null ? ({ right: `${demoRight}px` } as CSSProperties) : undefined}
        >
          <div className="dot-grid" aria-hidden="true" />
          {demoOpen ? (
            <div className="demo-pop-wrap">
              <span className="demo-caret" aria-hidden="true" />
                <div className="popover-demo usage-popover">
                  <div className="pd-dot-grid" aria-hidden="true" />
                  <div className="pd-head">
                    <div className="pd-brand">
                      <img className="pd-logo" src="/icon-1.png" alt="" />
                      <span>
                        Maxx<strong>Token</strong>
                      </span>
                    </div>
                    <span className="pd-cycle">May cycle · 16d left</span>
                    <div className="pd-actions">
                      <button className="pd-icon-btn" type="button" aria-label="Settings">
                        <Settings size={14} />
                      </button>
                    </div>
                  </div>

                  <section className="pd-receipt">
                    <div className="pd-stats">
                      <div className="pd-stat">
                        <div className="pd-num green">{money(totals.left)}</div>
                        <div className="pd-label">estimated value left</div>
                      </div>
                      <div className="pd-divider" />
                      <div className="pd-stat">
                        <div className="pd-num red">{money(totals.spent)}</div>
                        <div className="pd-label">estimated value used</div>
                      </div>
                      <div className="pd-divider" />
                      <div className="pd-stat">
                        <div className="pd-num mono">31d 11h</div>
                        <div className="pd-label">time left to use</div>
                      </div>
                    </div>
                    <div className="pd-meter">
                      <span className="pd-meter-fill" style={{ width: `${totals.leftPct}%` }} />
                    </div>
                    <div className="pd-foot">
                      <span className="pd-stars" aria-hidden="true">
                        <Star size={17} className="filled" />
                        <Star size={17} />
                        <Star size={17} />
                        <Star size={17} />
                        <Star size={17} />
                      </span>
                      <span className="pd-verdict">Illustrative next-release demo · synthetic data</span>
                      <span className="pd-spend-pulse">
                        <Flame size={12} aria-hidden="true" />
                        spending
                      </span>
                    </div>
                  </section>

                  <div className="pd-list">
                    {animatedProviders.map((provider) => {
                      const Icon = provider.icon

                      return (
                        <button
                          key={provider.id}
                          type="button"
                          className={`pd-prov ${provider.active ? 'active' : ''}`}
                          onClick={() => setActiveProvider(provider.name)}
                          style={
                            {
                              '--accent': provider.accent,
                              '--stream-delay': provider.streamDelay,
                            } as CSSProperties
                          }
                        >
                          <div className="pd-prov-top">
                            <span className="pd-prov-icon">
                              <Icon size={15} aria-hidden="true" />
                            </span>
                            <span className="pd-prov-info">
                              <span className="pd-prov-name">{provider.name}</span>
                              <span className="pd-prov-sub">
                                <span className="pd-dot live" />
                                {provider.plan} · {money(provider.monthly)}/mo
                              </span>
                            </span>
                            <span className="pd-prov-pct">
                              <span className="pd-pct-num">{provider.leftPct}%</span>
                              <span className="pd-pct-label">left</span>
                            </span>
                          </div>
                          <span className="pd-prov-meter" aria-hidden="true">
                            <span
                              className="pd-prov-meter-fill"
                              style={{ width: `${provider.leftPct}%` }}
                            />
                          </span>
                          <div className="pd-window-list">
                            {provider.windows.slice(0, provider.active ? 3 : 2).map((window) => (
                              <div className="pd-window" key={`${provider.id}-${window.label}`}>
                                <div className="pd-window-head">
                                  <span>{window.label}</span>
                                  <small>{window.kind}</small>
                                </div>
                                <span className="pd-window-bar" aria-hidden="true">
                                  <span style={{ width: `${window.leftPct}%` }} />
                                </span>
                                <div className="pd-window-foot">
                                  <span>
                                    <strong>{window.leftPct}%</strong> left
                                  </span>
                                  <span>{window.reset}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="pd-prov-bottom">
                            <span>
                              est. left <strong>{moneyExact(provider.left)}</strong> /{' '}
                              {money(provider.monthly)}
                            </span>
                            <span className="pd-burn">{moneyExact(provider.spent)} used</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <footer className="pd-pop-foot">
                    <span>
                      {money(totals.left)} / {money(totals.monthly)} estimated value left across{' '}
                      {animatedProviders.length} plans
                    </span>
                    <button type="button" onClick={() => setDemoOpen(false)}>
                      Done
                    </button>
                  </footer>
                </div>
            </div>
          ) : (
            <button
              className="demo-closed"
              type="button"
              onClick={() => setDemoOpen(true)}
            >
              <img src="/icon-1.png" alt="" />
              <span>
                Click <strong>⚡ {money(totals.left)} est. left</strong> in the menu bar above to open
                the next-release demo
              </span>
            </button>
          )}
        </div>
      </section>

      <section className="steps" id="how-it-works">
        <article className="step">
          <span className="step-icon">
            <Gauge size={20} aria-hidden="true" />
          </span>
          <h3>Counts your usage</h3>
          <p>Provider quota, balances, resets, local history, and freshness stay distinct.</p>
        </article>
        <article className="step">
          <span className="step-icon">
            <Flame size={20} aria-hidden="true" />
          </span>
          <h3>Explains value</h3>
          <p>Measured spend, estimated cost, and hypothetical subscription value are labeled.</p>
        </article>
        <article className="step">
          <span className="step-icon">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <h3>Forecasts each reset</h3>
          <p>Eligible windows estimate what remains at reset at your current pace.</p>
        </article>
      </section>

      <section className="stack" id="pricing">
        <h2>Your stack</h2>
        <div className="stack-row">
          {stackTools.map((tool) => {
            const Icon = tool.icon
            return (
              <div className="stack-chip" key={tool.name}>
                <span
                  className="stack-icon"
                  style={{ '--accent': tool.accent } as CSSProperties}
                >
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="stack-name">
                  <strong>{tool.name}</strong>
                  <small>{tool.tag}</small>
                </span>
              </div>
            )
          })}
          <div className="stack-chip soon">
            <span className="stack-icon dots" aria-hidden="true">
              <Zap size={16} />
            </span>
            <span className="stack-name">
              <strong>18 more</strong>
              <small>Supported + experimental</small>
            </span>
          </div>
        </div>
      </section>

      <section className="viral-loop" id="start">
        <div className="viral-card">
          <img src="/icon-1.png" alt="MaxxToken receipt icon" />
          <div>
            <strong>Current public release · v0.2.13</strong>
            <span>Apple Silicon and Intel Mac, plus Windows x64.</span>
          </div>
          <a className="btn-primary" href={POLAR_CHECKOUT_URL} onClick={startDownload}>
            Get Mac
            <ArrowRight size={16} aria-hidden="true" />
          </a>
          <a className="btn-outline viral-windows" href={LATEST_RELEASE_URL}>Windows x64</a>
        </div>
      </section>

      <footer className="footer" id="docs">
        <div className="footer-brand">
          <a className="brand" href="#top">
            <img className="brand-mark" src="/icon-1.png" alt="" />
            <span>
              Maxx<strong>Token</strong>
            </span>
          </a>
          <p>AI quota, reset, balance, token-history, and value tracking.</p>
        </div>
        <nav className="footer-nav">
          <a href="#product">Demo</a>
          <a href={PRODUCT_GUIDE_URL}>Docs</a>
          <a href={PROVIDERS_URL}>Providers</a>
          <a href={LATEST_RELEASE_URL}>Releases</a>
        </nav>
        <div className="footer-social">
          <a href="https://x.com/rachelnocode" aria-label="Rachel on X">
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </footer>
    </div>
  )
}

export default App
