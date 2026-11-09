import Image from "next/image";
import "./outlook-event-brand.css";

/** Local, cached asset: displaying an event never contacts a third-party logo service. */
export function OutlookEventMark({ inline = false }: { inline?: boolean }) {
  return <span className={`outlook-event-mark${inline ? " is-inline" : ""}`} role="img" aria-label="Outlook event" title="Outlook · Read only">
    <Image src="/brands/outlook.svg" alt="" width={18} height={18} unoptimized aria-hidden="true" />
  </span>;
}
