import type { ReactNode } from "react";

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-stage">
      <section className="phone-shell" aria-label="万物有戏移动端体验">
        <div className="status-bar" aria-hidden="true">
          <span>9:41</span>
          <span className="status-icons">● ◒ ▰</span>
        </div>
        {children}
      </section>
    </main>
  );
}
