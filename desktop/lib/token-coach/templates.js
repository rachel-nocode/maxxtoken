// Locked plain-English verdict templates (PRD Loop 2).
//
// Language rules: a smart 15-year-old who has never heard "context window"
// or "prompt caching" must understand every sentence. No jargon, max ~20
// words per sentence, concrete comparisons, imperative fixes.
//
// Each string ships 3 variants; LOCKED picks the winner per slot. Rachel can
// swap a winner by changing an index here — rules and UI read through
// render(), so copy changes never touch detection code. The full variant
// sheet lives in verdict-language.html at the repo root.

const VARIANTS = {
  r1: {
    title: [
      () => 'One long chat drained your limit',
      () => 'Marathon chat ate your week',
      () => 'Old messages billed you again and again',
    ],
    what: [
      (p) =>
        `One ${p.agent} chat ran ${p.count} messages — every new message re-sent the whole conversation again, up to ${p.peak} tokens each time.`,
      (p) =>
        `You kept one ${p.agent} chat alive for ${p.count} messages. Each reply paid to re-read everything above it — up to ${p.peak} tokens.`,
      (p) =>
        `One marathon ${p.agent} chat hit ${p.count} messages; by the end every question dragged ${p.peak} tokens of old chat along with it.`,
    ],
    fix: [
      () => 'Start a fresh chat when you switch tasks.',
      () => 'Open a new chat for each new task — old history costs you every message.',
      () => 'When the task changes, change the chat.',
    ],
  },
  r2: {
    title: [
      () => 'Max effort spent on tiny questions',
      () => 'Heavy thinking on light questions',
      () => 'Genius mode left on for small talk',
    ],
    what: [
      (p) =>
        `${p.count} quick ${p.agent} questions ran in deep-thinking mode — short asks that paid ${p.waste} tokens of heavy thinking for simple answers.`,
      (p) =>
        `You asked ${p.agent} ${p.count} small questions with maximum brainpower turned on. That overthinking cost ${p.waste} tokens.`,
      (p) =>
        `${p.count} tiny asks got the full genius treatment on ${p.agent} — ${p.waste} tokens spent thinking hard about easy things.`,
    ],
    fix: [
      (p) =>
        p.agentType === 'codex'
          ? 'Set Codex reasoning effort to medium for quick asks.'
          : 'Run /effort medium before small questions and edits.',
      () => 'Drop to medium effort for quick questions — save the deep thinking for hard problems.',
      () => 'Turn effort down before asking small stuff.',
    ],
  },
  r3: {
    title: [
      () => 'Your chats kept paying full price',
      () => 'Repeat content billed at full price',
      () => 'The discount never kicked in',
    ],
    what: [
      (p) =>
        `${p.count} ${p.agent} sessions kept paying full price — only ${p.ratio}% of what the model re-read came from its memory, the rest billed fresh: ${p.waste} tokens.`,
      (p) =>
        `${p.agent} re-read your project from scratch in ${p.count} sessions instead of using its short-term memory — ${p.waste} tokens paid twice.`,
      (p) =>
        `In ${p.count} ${p.agent} sessions the discount for repeated content barely kicked in (${p.ratio}%) — ${p.waste} tokens billed at full price.`,
    ],
    fix: [
      () => 'Keep one chat going per task instead of stopping and restarting.',
      () => 'Work in longer stretches — pauses over 5 minutes make the model forget and re-bill.',
      () => "Don't restart chats mid-task; each restart re-bills your whole project.",
    ],
  },
  r4: {
    title: [
      () => 'You sprinted straight into the wall',
      () => 'One burst used up your whole limit',
      () => 'Big run, instant lockout',
    ],
    what: [
      (p) =>
        p.collisionCount > 1
          ? `${p.agent} hit its ${p.window} ${p.collisionCount} times; the worst run burned ${p.spike}% of the window right before the wall.`
          : `${p.agent} burned ${p.spike}% of its ${p.window} in the ${p.minutes} minutes before hitting the wall.`,
      (p) =>
        `One burst of work ate ${p.spike}% of your ${p.agent} ${p.window} just before you ran out — then you were locked out.`,
      (p) =>
        `${p.agent} went from ${p.baseline}% to full in under ${p.minutes} minutes — one heavy run took the whole ${p.window} down.`,
    ],
    fix: [
      () => 'Check your remaining window before kicking off big runs.',
      () => 'Glance at the menu bar before big runs — if the bar is low, wait or switch tools.',
      () => 'Split heavy jobs across providers when your bar runs low.',
    ],
  },
}

// Winning variant per slot. Swap an index to change shipped copy.
const LOCKED = {
  r1: { title: 0, what: 1, fix: 0 },
  r2: { title: 0, what: 1, fix: 0 },
  r3: { title: 0, what: 0, fix: 2 },
  r4: { title: 0, what: 0, fix: 1 },
}

function render(rule, slot, params = {}) {
  const variants = VARIANTS[rule]?.[slot]
  if (!variants) throw new Error(`Unknown template ${rule}.${slot}`)
  const index = LOCKED[rule]?.[slot] ?? 0
  return variants[index](params)
}

module.exports = { render, VARIANTS, LOCKED }
