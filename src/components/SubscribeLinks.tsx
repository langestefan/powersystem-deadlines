import { useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * The three ways to subscribe to a feed. Only the copy button needs JavaScript;
 * the links work without it, which is why this island is deliberately tiny.
 */

interface SubscribeLinksProps {
  httpsUrl: string;
  webcalUrl: string;
  googleUrl: string;
  /** Stack vertically for the narrow sidebar on a conference page. */
  compact?: boolean;
}

export default function SubscribeLinks({
  httpsUrl,
  webcalUrl,
  googleUrl,
  compact = false,
}: SubscribeLinksProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the URL is visible below either way.
      setCopied(false);
    }
  };

  const buttonClass =
    'inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground';

  return (
    <div className="space-y-2">
      <div className={cn('flex gap-1.5', compact ? 'flex-col' : 'flex-wrap')}>
        <a className={buttonClass} href={webcalUrl}>
          Apple / Outlook
        </a>
        <a className={buttonClass} href={googleUrl} rel="noopener" target="_blank">
          Google Calendar
        </a>
        <button type="button" className={buttonClass} onClick={copy}>
          {copied ? 'Copied' : 'Copy feed URL'}
        </button>
      </div>

      <p className="font-mono text-[11px] break-all text-muted-foreground">{httpsUrl}</p>
    </div>
  );
}
