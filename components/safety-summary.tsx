'use client'

import { CircleAlert, CircleCheck, CircleHelp, Info, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GLOSSARY, type Reason, type Verdict, type VerdictLevel } from '@/lib/verdict'

const LEVEL_STYLE: Record<VerdictLevel, { card: string; badge: string; Icon: typeof ShieldCheck }> = {
  ok: { card: 'border-emerald-300/25 bg-emerald-300/[0.06]', badge: 'bg-emerald-300/15 text-emerald-100', Icon: ShieldCheck },
  careful: { card: 'border-amber-300/30 bg-amber-300/[0.07]', badge: 'bg-amber-300/15 text-amber-100', Icon: TriangleAlert },
  high: { card: 'border-rose-300/35 bg-rose-300/[0.08]', badge: 'bg-rose-300/15 text-rose-100', Icon: ShieldAlert },
  unknown: { card: 'border-sky-200/20 bg-sky-200/[0.05]', badge: 'bg-sky-200/15 text-sky-100', Icon: CircleHelp },
}

const TONE_ICON: Record<Reason['tone'], { Icon: typeof Info; className: string; label: string }> = {
  good: { Icon: CircleCheck, className: 'text-emerald-300', label: 'Good sign' },
  warn: { Icon: TriangleAlert, className: 'text-amber-300', label: 'Worth checking' },
  bad: { Icon: CircleAlert, className: 'text-rose-300', label: 'Warning' },
  info: { Icon: Info, className: 'text-sky-300', label: 'Note' },
}

export function SafetySummary({ verdict, subject, onDeepScan }: { verdict: Verdict; subject: string; onDeepScan?: () => void }) {
  const style = LEVEL_STYLE[verdict.level]
  const terms = [...new Set(verdict.reasons.flatMap((reason) => reason.terms ?? []))].filter((term) => GLOSSARY[term])

  return (
    <section className={`rounded-2xl border p-4 sm:p-6 ${style.card}`} aria-labelledby="safety-title">
      <div className="flex items-start gap-4">
        <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${style.badge}`}><style.Icon aria-hidden="true" className="size-6" /></span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pulse-muted">Plain-language summary · {subject}</p>
          <h2 id="safety-title" className="mt-1.5 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{verdict.headline}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-pulse-muted text-pretty">{verdict.summary}</p>
        </div>
      </div>

      <ul className="mt-5 flex flex-col gap-2.5">
        {verdict.reasons.map((reason, index) => {
          const tone = TONE_ICON[reason.tone]
          return (
            <li key={`${index}-${reason.text.slice(0, 24)}`} className="flex items-start gap-3 rounded-xl border border-pulse-line/70 bg-pulse-bg/50 p-3 text-sm leading-6">
              <tone.Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${tone.className}`} />
              <span><span className="sr-only">{tone.label}: </span>{reason.text}</span>
            </li>
          )
        })}
      </ul>

      {terms.length > 0 ? (
        <details className="group mt-4 rounded-xl border border-pulse-line/70 bg-pulse-bg/40 px-4 py-3">
          <summary className="min-h-6 cursor-pointer text-sm font-medium text-pulse-bone">What do these words mean?</summary>
          <dl className="mt-3 flex flex-col gap-3 text-sm leading-6">
            {terms.map((term) => (
              <div key={term}>
                <dt className="font-semibold capitalize">{term === 'multisig' ? 'Multi-signature' : term}</dt>
                <dd className="text-pulse-muted">{GLOSSARY[term]}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}

      <div className="mt-5 border-t border-pulse-line/60 pt-4">
        <p className="text-sm font-semibold">What you can do</p>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-6 text-pulse-muted">
          {verdict.nextSteps.map((step) => <li key={step}>{step}</li>)}
        </ul>
        {verdict.suggestDeepScan && onDeepScan ? <Button type="button" variant="outline" size="sm" className="mt-4 min-h-11" onClick={onDeepScan}>Run a deep scan for a closer look</Button> : null}
        <p className="mt-4 text-xs leading-5 text-pulse-muted">This is an automated check of public Arc data. It cannot prove that anything is safe or that someone is acting in good faith, and it does not look at the people behind a project. Nothing here is financial advice.</p>
      </div>
    </section>
  )
}
