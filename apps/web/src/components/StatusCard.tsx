import type { ReactNode } from 'react';

export type StatusTone = 'loading' | 'ok' | 'warning' | 'error';

export interface StatusCardProps {
  readonly title: string;
  readonly value: string;
  readonly detail?: string;
  readonly tone: StatusTone;
  readonly children?: ReactNode;
}

export function StatusCard({ title, value, detail, tone, children }: StatusCardProps) {
  return (
    <section className="status-card" aria-label={title}>
      <div className="status-card__heading">
        <h2>{title}</h2>
        <span className={`status-indicator status-indicator--${tone}`} aria-hidden="true" />
      </div>
      <p className="status-card__value">{value}</p>
      {detail ? <p className="status-card__detail">{detail}</p> : null}
      {children}
    </section>
  );
}
