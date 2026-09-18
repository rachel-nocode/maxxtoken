const test = require('node:test')
const assert = require('node:assert/strict')

const BurnFocus = require('../burn/burn-focus')

function selectorAttr(selector) {
  const match = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector)
  return match ? { name: match[1], value: match[2] } : null
}

class Element {
  constructor(tag, attrs = {}, children = []) {
    this.tagName = tag.toUpperCase()
    this.attrs = { ...attrs }
    this.children = children
    this.parent = null
    this.disabled = false
    this.focused = false
    this.value = ''
    this.selectionStart = null
    this.selectionEnd = null
    this.selectionDirection = 'none'
    for (const child of children) child.parent = this
  }

  hasAttribute(name) { return Object.hasOwn(this.attrs, name) }
  getAttribute(name) { return this.hasAttribute(name) ? String(this.attrs[name]) : null }
  closest(selector) {
    const parsed = selectorAttr(selector)
    for (let current = this; current; current = current.parent) {
      if (parsed && current.hasAttribute(parsed.name) && (parsed.value == null || current.getAttribute(parsed.name) === parsed.value)) return current
    }
    return null
  }
  contains(element) {
    return this === element || this.children.some((child) => child.contains(element))
  }
  querySelectorAll(selector) {
    const parsed = selectorAttr(selector)
    const found = []
    const visit = (element) => {
      for (const child of element.children) {
        if (parsed && child.hasAttribute(parsed.name) && (parsed.value == null || child.getAttribute(parsed.name) === parsed.value)) found.push(child)
        visit(child)
      }
    }
    visit(this)
    return found
  }
  focus(options) { this.focused = true; this.focusOptions = options }
  setSelectionRange(start, end, direction) { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction }
}

function provider(id, control) {
  return new Element('article', { 'data-burn-prov': id }, [control])
}

test('restores a duplicate control only inside its provider account', () => {
  const first = new Element('span', { 'data-burn-display-toggle': 'usage' })
  const second = new Element('span', { 'data-burn-display-toggle': 'usage' })
  const before = new Element('div', {}, [provider('codex@111111111111', first), provider('codex@222222222222', second)])
  const identity = BurnFocus.capture(before, second)

  const nextFirst = new Element('span', { 'data-burn-display-toggle': 'usage' })
  const nextSecond = new Element('span', { 'data-burn-display-toggle': 'usage' })
  const after = new Element('div', {}, [provider('codex@111111111111', nextFirst), provider('codex@222222222222', nextSecond)])

  assert.equal(BurnFocus.restore(after, identity), true)
  assert.equal(nextFirst.focused, false)
  assert.equal(nextSecond.focused, true)
  assert.deepEqual(nextSecond.focusOptions, { preventScroll: true })
})

test('restores the second reset clock within the same provider', () => {
  const session = new Element('span', { 'data-burn-display-toggle': 'reset' })
  const weekly = new Element('span', { 'data-burn-display-toggle': 'reset' })
  const before = new Element('div', {}, [provider('codex@111111111111', new Element('div', {}, [session, weekly]))])
  const identity = BurnFocus.capture(before, weekly)
  assert.equal(identity.ordinal, 1)

  const nextSession = new Element('span', { 'data-burn-display-toggle': 'reset' })
  const nextWeekly = new Element('span', { 'data-burn-display-toggle': 'reset' })
  const after = new Element('div', {}, [provider('codex@111111111111', new Element('div', {}, [nextSession, nextWeekly]))])
  assert.equal(BurnFocus.restore(after, identity), true)
  assert.equal(nextSession.focused, false)
  assert.equal(nextWeekly.focused, true)
})

test('restores input selection and does not focus a missing navigation target', () => {
  const input = new Element('input', { 'data-burn-cookie': 'cursor' })
  input.value = 'saved credential text'
  input.selectionStart = 3
  input.selectionEnd = 8
  input.selectionDirection = 'forward'
  const before = new Element('div', {}, [input])
  const identity = BurnFocus.capture(before, input)

  const replacement = new Element('input', { 'data-burn-cookie': 'cursor' })
  replacement.value = input.value
  const after = new Element('div', {}, [replacement])
  assert.equal(BurnFocus.restore(after, identity), true)
  assert.deepEqual([replacement.selectionStart, replacement.selectionEnd, replacement.selectionDirection], [3, 8, 'forward'])

  const nav = new Element('button', { 'data-burn-nav': 'settings' })
  const navIdentity = BurnFocus.capture(new Element('div', {}, [nav]), nav)
  const absent = new Element('div', {}, [new Element('button', { 'data-burn-nav': 'home' })])
  assert.equal(BurnFocus.restore(absent, navIdentity), false)
  assert.equal(absent.children[0].focused, false)
})

test('does not restore controls inside inert or aria-hidden content', () => {
  const control = new Element('button', { 'data-burn-credit': 'confirm' })
  const before = new Element('div', {}, [provider('codex@111111111111', control)])
  const identity = BurnFocus.capture(before, control)
  const hiddenControl = new Element('button', { 'data-burn-credit': 'confirm' })
  const hidden = new Element('div', { inert: '', 'aria-hidden': 'true' }, [hiddenControl])
  const after = new Element('div', {}, [provider('codex@111111111111', hidden)])
  assert.equal(BurnFocus.restore(after, identity), false)
  assert.equal(hiddenControl.focused, false)
})

test('an unscoped control never restores to a matching provider control', () => {
  const standalone = new Element('span', { 'data-burn-display-toggle': 'usage' })
  const identity = BurnFocus.capture(new Element('div', {}, [standalone]), standalone)
  const nested = new Element('span', { 'data-burn-display-toggle': 'usage' })
  const after = new Element('div', {}, [provider('codex@111111111111', nested)])
  assert.equal(BurnFocus.restore(after, identity), false)
  assert.equal(nested.focused, false)
})
