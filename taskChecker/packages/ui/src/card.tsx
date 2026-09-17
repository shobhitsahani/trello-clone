import { type JSX } from "react";

export function Card({
  className,
  title,
  children,
  href,
}: {
  className?: string;
  title: string;
  children: React.ReactNode;
  href?: string;
}): JSX.Element {
  return (
    <div
      data-slot="card"
      className={["ui-card", className].filter(Boolean).join(" ")}
    >
      <div data-slot="card-header" className="ui-card-header">
        <div data-slot="card-title" className="ui-card-title">
          {href ? (
            <a href={href} rel="noopener noreferrer" target="_blank">
              {title}
            </a>
          ) : (
            title
          )}
        </div>
      </div>
      <div data-slot="card-content" className="ui-card-content">
        {children}
      </div>
    </div>
  );
}
