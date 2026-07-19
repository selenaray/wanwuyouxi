import type { ReactNode } from "react";

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-stage">
      <section className="phone-shell" aria-label="万物有戏移动端体验">
        {children}
      </section>
    </main>
  );
}
