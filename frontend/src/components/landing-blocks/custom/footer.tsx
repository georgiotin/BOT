/**
 * Custom (variant: footer) — низ лендинга: контакты, ссылки на оферту/политику, копирайт.
 */

import { txt, p } from "../utils";
import type { LandingApiBlock } from "../types";

export function CustomFooter({ block, serviceName }: { block: LandingApiBlock; serviceName: string }) {
  const offerLink = p(block.props, "offerLink");
  const privacyLink = p(block.props, "privacyLink");
  const contacts = txt(block.text, "contacts");
  const footerText = txt(block.text, "footerText", `© ${new Date().getFullYear()} ${serviceName}. Все права защищены.`);

  return (
    <footer className="border-t border-white/[0.08] bg-[#0a0a0a]">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-zinc-400 md:flex-row">
        <div>{footerText}</div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {offerLink ? (
            <a href={offerLink} target="_blank" rel="noreferrer noopener" className="transition-colors hover:text-white">
              Оферта
            </a>
          ) : null}
          {privacyLink ? (
            <a href={privacyLink} target="_blank" rel="noreferrer noopener" className="transition-colors hover:text-white">
              Политика
            </a>
          ) : null}
          {contacts ? <span className="text-zinc-500">{contacts}</span> : null}
        </div>
      </div>
    </footer>
  );
}
