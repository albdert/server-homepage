'use strict'

const ICON_CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/'
const CHECK_INTERVAL = 60_000
const CHECK_TIMEOUT = 4_000

const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'paper', label: 'Paper' },
  { id: 'stone', label: 'Stone' },
  { id: 'sage', label: 'Sage' },
  { id: 'fog', label: 'Fog' },
  { id: 'rose', label: 'Dusty rose' },
  { id: 'oat', label: 'Oat' },
  { id: 'lavender', label: 'Lavender ash' },
  { id: 'dark', label: 'Dark' },
]

const FONTS = [
  { id: 'inter', label: 'Inter' },
  { id: 'fira-code', label: 'Fira Code' },
]

const el = (tag, className, text) => {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text != null) e.textContent = text
  return e
}

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')

/* ── preferences ─────────────────────────── */

function attrSetting(attr, key, fallback) {
  return {
    get: () => document.documentElement.getAttribute(attr) || fallback,
    set: (value) => {
      const root = document.documentElement
      try {
        if (value === fallback) {
          root.removeAttribute(attr)
          localStorage.removeItem(key)
        } else {
          root.setAttribute(attr, value)
          localStorage.setItem(key, value)
        }
      } catch {
        /* storage unavailable */
      }
    },
  }
}

/* ── sidebar dropdown ────────────────────── */

let selectCount = 0

function sidebarSelect(label, options, { get, set }) {
  const id = `select-${selectCount++}`
  const root = el('div', 'sidebar-select')
  root.dataset.typeaheadIgnore = ''

  const btn = el('button', 'sidebar-select__trigger', label)
  btn.type = 'button'
  btn.setAttribute('aria-haspopup', 'listbox')
  btn.setAttribute('aria-expanded', 'false')
  btn.setAttribute('aria-controls', `${id}-list`)
  btn.append(Object.assign(el('span', 'sidebar-select__chevron'), { ariaHidden: 'true' }))

  const list = el('ul', 'sidebar-select__list')
  list.id = `${id}-list`
  list.setAttribute('role', 'listbox')
  list.tabIndex = -1
  list.hidden = true

  let active = -1
  const currentIndex = () => Math.max(0, options.findIndex((o) => o.id === get()))

  const items = options.map((o, i) => {
    const li = el('li', 'sidebar-select__option', o.label)
    li.id = `${id}-opt-${i}`
    li.setAttribute('role', 'option')
    li.addEventListener('mouseenter', () => setActive(i))
    li.addEventListener('click', () => choose(i))
    list.append(li)
    return li
  })

  function sync() {
    const cur = currentIndex()
    items.forEach((li, i) => {
      li.setAttribute('aria-selected', String(i === cur))
      li.classList.toggle('is-active', i === active)
    })
    btn.setAttribute('aria-label', `${label}: ${options[cur].label}`)
    if (active >= 0) list.setAttribute('aria-activedescendant', items[active].id)
    else list.removeAttribute('aria-activedescendant')
  }

  function setActive(i) {
    active = i
    sync()
  }

  const outside = (e) => {
    if (!root.contains(e.target)) close(false)
  }

  function open(fromKeyboard) {
    active = fromKeyboard ? currentIndex() : -1
    list.hidden = false
    btn.setAttribute('aria-expanded', 'true')
    sync()
    list.focus()
    document.addEventListener('pointerdown', outside)
  }

  function close(refocus = true) {
    list.hidden = true
    btn.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', outside)
    if (refocus) btn.focus()
  }

  function choose(i) {
    set(options[i].id)
    close()
  }

  btn.addEventListener('click', () => (list.hidden ? open(false) : close()))
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      open(true)
    }
  })
  list.addEventListener('mouseleave', () => setActive(-1))
  list.addEventListener('keydown', (e) => {
    const last = options.length - 1
    const from = active < 0 ? currentIndex() : active
    switch (e.key) {
      case 'ArrowDown': setActive(active < 0 ? from : Math.min(from + 1, last)); break
      case 'ArrowUp': setActive(active < 0 ? from : Math.max(from - 1, 0)); break
      case 'Home': setActive(0); break
      case 'End': setActive(last); break
      case 'Enter':
      case ' ': choose(from); break
      case 'Escape': close(); break
      case 'Tab': close(false); return
      default: return
    }
    e.preventDefault()
  })

  sync()
  root.append(btn, list)
  return root
}

/* ── services ────────────────────────────── */

function serviceUrl(s, config) {
  if (s.url) return s.url
  if (s.subdomain && config.domain) return `https://${s.subdomain}.${config.domain}${s.path || ''}`
  const protocol = s.protocol ? `${s.protocol.replace(/:$/, '')}:` : location.protocol
  const host = s.host || location.hostname
  const port = s.port ? `:${s.port}` : ''
  return `${protocol}//${host}${port}${s.path || ''}`
}

function iconFor(s) {
  const box = el('span', 'service__icon')
  box.ariaHidden = 'true'
  const fallback = () => {
    box.replaceChildren(document.createTextNode(s.name.slice(0, 1).toUpperCase()))
  }
  const src = s.icon && (/^(https?:)?\/\//.test(s.icon) || s.icon.startsWith('/') ? s.icon : `${ICON_CDN}${s.icon}.svg`)
  if (!src) {
    fallback()
    return box
  }
  const img = el('img')
  img.alt = ''
  img.loading = 'lazy'
  img.src = src
  img.addEventListener('error', fallback, { once: true })
  box.append(img)
  return box
}

function renderServices(config) {
  const container = document.getElementById('services')
  container.replaceChildren()

  const groups = new Map()
  for (const s of config.services) {
    const cat = s.category || 'Services'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat).push(s)
  }

  const cards = []
  for (const [cat, services] of groups) {
    const section = el('section', 'category')
    section.id = `cat-${slug(cat)}`
    section.append(el('div', 'category__title section-label', cat))
    const grid = el('div', 'service-grid')

    for (const s of services) {
      const url = serviceUrl(s, config)
      const a = el('a', 'service')
      a.href = url
      if (s.newTab !== false) {
        a.target = '_blank'
        a.rel = 'noreferrer'
      }

      const head = el('div', 'service__head')
      const status = el('span', 'status')
      status.title = 'Not checked'
      head.append(iconFor(s), el('span', 'service__name', s.name), status)
      a.append(head)
      if (s.description) a.append(el('span', 'service__desc', s.description))
      a.append(el('span', 'service__addr', url.replace(/^https?:\/\//, '')))

      grid.append(a)
      cards.push({ service: s, url, card: a, status })
    }

    section.append(grid)
    container.append(section)
  }
  return cards
}

/* ── health checks ───────────────────────── */

async function check(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT)
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function startChecks(cards) {
  const run = () => {
    for (const { service, url, status } of cards) {
      if (service.check === false) {
        status.title = 'Not monitored'
        continue
      }
      void check(service.checkUrl || url).then((up) => {
        status.classList.toggle('is-up', up)
        status.classList.toggle('is-down', !up)
        status.title = up ? 'Responding' : 'Not responding'
      })
    }
  }
  run()
  setInterval(run, CHECK_INTERVAL)
}

/* ── typeahead ───────────────────────────── */

function rank(items, query) {
  if (!query) return []
  const score = (it) => {
    const name = it.name.toLowerCase()
    const extra = it.extra.toLowerCase()
    if (name.startsWith(query)) return 0
    if (name.includes(query)) return 1
    if (extra.includes(query)) return 2
    return -1
  }
  return items
    .map((it) => ({ it, s: score(it) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => a.s - b.s)
    .map((r) => r.it)
}

function startTypeahead(cards) {
  const box = document.getElementById('typeahead')
  const queryEl = box.querySelector('.typeahead-box__query')
  const matchEl = box.querySelector('.typeahead-box__match')
  const items = cards.map((c) => ({
    name: c.service.name,
    extra: [c.service.category, c.service.description, c.service.port].filter(Boolean).join(' '),
    card: c.card,
  }))

  let query = ''
  let timer

  function render() {
    const matches = rank(items, query)
    box.hidden = !query
    queryEl.textContent = query
    matchEl.textContent = matches[0]?.name ?? 'no match'
    matchEl.classList.toggle('is-empty', !matches[0])
    for (const it of items) it.card.classList.toggle('is-dimmed', query !== '' && !matches.includes(it))
    return matches
  }

  function update(next) {
    query = next
    clearTimeout(timer)
    if (next) timer = setTimeout(() => update(''), 1200)
    const [first] = render()
    if (first) first.card.focus()
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"], [data-typeahead-ignore]')) return
    let next
    if (e.key === 'Escape') {
      if (!query) return
      next = ''
    } else if (e.key === 'Backspace') {
      if (!query) return
      next = query.slice(0, -1)
    } else if (e.key.length === 1 && (e.key !== ' ' || query)) {
      next = query + e.key.toLowerCase()
    } else {
      return
    }
    e.preventDefault()
    update(next)
  })
}

/* ── init ────────────────────────────────── */

async function init() {
  const settings = document.getElementById('settings')
  settings.append(
    sidebarSelect('Theme', THEMES, attrSetting('data-theme', 'theme', 'system')),
    sidebarSelect('Font', FONTS, attrSetting('data-font', 'font', 'inter')),
  )

  let config
  try {
    const res = await fetch('services.json', { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    config = await res.json()
  } catch (e) {
    const msg = el('p', 'error', `Could not load services.json: ${e.message}`)
    document.getElementById('services').replaceChildren(msg)
    return
  }

  const title = config.title || location.hostname
  document.title = title
  document.getElementById('title').textContent = title
  document.getElementById('logo').textContent = `${(config.logo || title.split(/[-.]/)[0]).toLowerCase()}.`
  document.getElementById('subtitle').textContent = `${config.services.length} services on ${location.hostname}`

  const cards = renderServices(config)
  startChecks(cards)
  startTypeahead(cards)
}

void init()
